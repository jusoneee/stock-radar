import type { ChannelMeta, QuoteBar, QuoteSnapshot, RawNewsItem } from '@/types'
import { AdapterError, type AdapterContext, type NewsAdapter, type QuoteAdapter } from '@/adapters/types'
import { mapWithConcurrency } from '@/lib/concurrency'
import { safeExternalUrl } from '@/lib/url'
import { PROXY_AVAILABLE } from '@/adapters/availability'
import type { ConnectionTestResult, CustomSourceConfig } from './types'
import { resolvePath, toDateKey, toIsoTime, toNumber, toText } from './resolve'

const CORS_HINT =
  '浏览器直连要求目标接口返回 CORS 响应头。纯静态部署不含 /api/custom 代理，只能使用 CORS 可达的地址；自建部署可勾选「经本地代理」并在 server/proxy.mjs 的白名单中登记该域名。'

interface RawResponse {
  status: number
  elapsedMs: number
  json: unknown
  viaProxy: boolean
}

function requestUrl(config: CustomSourceConfig, symbol: string): string {
  const target = config.urlTemplate.replace(/\{symbol\}/g, encodeURIComponent(symbol))
  if (!config.viaProxy) return target
  return `/api/custom?target=${encodeURIComponent(target)}`
}

function normalizeTemplate(value: string, symbol: string): string {
  return value.replace(/\{symbol\}/g, symbol)
}

/**
 * Fetch JSON for a custom source with an explicit timeout. The result keeps
 * HTTP status and elapsed time so the "test connection" panel can report facts
 * instead of a generic failure.
 */
async function requestJson(
  config: CustomSourceConfig,
  symbol: string,
  token: string,
): Promise<RawResponse> {
  // Static deployments have no /api/custom proxy; fail explicitly instead of
  // issuing a request that would only return a 404 HTML page.
  if (config.viaProxy && !PROXY_AVAILABLE) {
    throw new CustomRequestError(
      'PROXY',
      '当前为纯静态部署，不含 /api/custom 代理；自定义源仅支持 CORS 可达的 http(s) 地址。',
      0,
    )
  }
  const url = requestUrl(config, symbol)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(2_000, config.timeoutMs))
  const startedAt = performance.now()

  const headers: Record<string, string> = { Accept: 'application/json' }
  // Credentials and custom headers only apply to direct browser calls:
  // the proxy intentionally refuses authorization headers.
  if (!config.viaProxy && config.headers) {
    for (const [name, value] of Object.entries(config.headers)) {
      if (name && value) headers[name] = value
    }
  }
  if (token && !config.viaProxy) headers.Authorization = `Bearer ${token}`
  const init: RequestInit = { method: config.method, headers, signal: controller.signal }
  if (config.method === 'POST') {
    headers['Content-Type'] = 'application/json'
    init.body = normalizeTemplate(config.bodyTemplate ?? '{"symbol":"{symbol}"}', symbol)
  }

  try {
    const response = await fetch(url, init)
    const elapsedMs = Math.round(performance.now() - startedAt)
    const text = await response.text()
    if (!response.ok) {
      throw new CustomHttpError(response.status, text.slice(0, 180), elapsedMs)
    }
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new CustomParseError('返回内容不是合法 JSON，请检查接口地址或响应格式。')
    }
    return { status: response.status, elapsedMs, json, viaProxy: config.viaProxy }
  } catch (error) {
    if (error instanceof CustomHttpError || error instanceof CustomParseError) throw error
    const elapsedMs = Math.round(performance.now() - startedAt)
    if ((error as { name?: string }).name === 'AbortError') {
      throw new CustomRequestError('TIMEOUT', `请求超时（${config.timeoutMs}ms）`, elapsedMs)
    }
    throw new CustomRequestError(
      config.viaProxy ? 'PROXY' : 'CORS',
      config.viaProxy
        ? '本地代理不可用或白名单拒绝了该域名。请先运行 `npm run proxy` 并配置 CUSTOM_SOURCE_ALLOWLIST。'
        : `浏览器无法访问该地址（可能是 CORS 限制或网络不可达）：${(error as Error).message}`,
      elapsedMs,
    )
  } finally {
    clearTimeout(timer)
  }
}

class CustomHttpError extends Error {
  readonly status: number
  readonly body: string
  readonly elapsedMs: number
  constructor(status: number, body: string, elapsedMs: number) {
    super(`接口返回 HTTP ${status}`)
    this.status = status
    this.body = body
    this.elapsedMs = elapsedMs
  }
}

class CustomParseError extends Error {}

class CustomRequestError extends Error {
  readonly code: 'TIMEOUT' | 'CORS' | 'PROXY'
  readonly elapsedMs: number
  constructor(code: 'TIMEOUT' | 'CORS' | 'PROXY', message: string, elapsedMs: number) {
    super(message)
    this.code = code
    this.elapsedMs = elapsedMs
  }
}

function parseBars(config: CustomSourceConfig, json: unknown): QuoteBar[] {
  const barsPath = config.fieldMap.bars || 'data.klines'
  const raw = resolvePath(json, barsPath)
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new CustomParseError(
      `字段「${barsPath}」未解析到非空数组。请检查 K 线字段映射（例如 data.klines），或确认接口返回结构。`,
    )
  }

  const bars: QuoteBar[] = []
  for (const row of raw) {
    let bar: QuoteBar | null = null
    if (typeof row === 'string') {
      // CSV row in Eastmoney order: date,open,close,high,low,volume.
      const parts = row.split(',')
      bar = buildBar(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5])
    } else if (Array.isArray(row)) {
      bar = buildBar(row[0], row[1], row[2], row[3], row[4], row[5])
    } else if (row && typeof row === 'object') {
      const record = row as Record<string, unknown>
      const pick = (key: keyof CustomSourceConfig['fieldMap']): unknown => {
        const path = config.fieldMap[key]
        return path ? resolvePath(record, path) : undefined
      }
      bar = buildBar(
        pick('date') ?? record.date,
        pick('open') ?? record.open,
        pick('close') ?? record.close,
        pick('high') ?? record.high,
        pick('low') ?? record.low,
        pick('volume') ?? record.volume,
      )
    }
    if (bar) bars.push(bar)
  }

  if (bars.length === 0) {
    throw new CustomParseError('未解析出任何有效日 K（日期或收盘价缺失）。')
  }
  return bars.sort((a, b) => a.date.localeCompare(b.date))
}

function buildBar(
  dateValue: unknown,
  openValue: unknown,
  closeValue: unknown,
  highValue: unknown,
  lowValue: unknown,
  volumeValue: unknown,
): QuoteBar | null {
  const date = toDateKey(dateValue)
  const close = toNumber(closeValue)
  if (!date || close === null || close <= 0) return null
  return {
    date,
    open: toNumber(openValue) ?? close,
    high: toNumber(highValue) ?? close,
    low: toNumber(lowValue) ?? close,
    close,
    volume: toNumber(volumeValue) ?? 0,
  }
}

function parseQuote(config: CustomSourceConfig, json: unknown, symbol: string, now: Date): QuoteSnapshot {
  const bars = parseBars(config, json)
  const named = config.fieldMap.name ? toText(resolvePath(json, config.fieldMap.name)) : ''
  return {
    symbol,
    name: named || symbol,
    sector: '自定义源',
    bars,
    sourceId: config.id,
    asOf: now.toISOString(),
  }
}

/** News payloads usually expose the list at root, `data`, `items` or `result.data`. */
function locateNewsArray(json: unknown): unknown[] | null {
  if (Array.isArray(json)) return json
  for (const path of ['data', 'items', 'results', 'result.data', 'data.items', 'data.list']) {
    const value = resolvePath(json, path)
    if (Array.isArray(value) && value.length > 0) return value
  }
  return null
}

function parseNews(config: CustomSourceConfig, json: unknown, now: Date): RawNewsItem[] {
  const raw = locateNewsArray(json)
  if (!raw) {
    throw new CustomParseError('未解析到资讯数组；接口需返回数组，或把列表放在 data / items / result.data 下。')
  }

  const items: RawNewsItem[] = []
  raw.forEach((row, index) => {
    if (!row || typeof row !== 'object') return
    const record = row as Record<string, unknown>
    const pick = (key: keyof CustomSourceConfig['fieldMap']): string =>
      config.fieldMap[key] ? toText(resolvePath(record, config.fieldMap[key]!)) : ''
    const title = pick('title')
    if (!title) return
    const symbolsValue = config.fieldMap.symbols ? resolvePath(record, config.fieldMap.symbols) : undefined
    const symbols = Array.isArray(symbolsValue)
      ? symbolsValue.map((item) => toText(item)).filter(Boolean)
      : typeof symbolsValue === 'string'
        ? symbolsValue.split(/[,，\s]+/).filter(Boolean)
        : []
    items.push({
      id: `${config.id}-${index}-${title.slice(0, 12)}`,
      sourceId: config.id,
      title,
      content: pick('content') || title,
      publishedAt: toIsoTime(
        config.fieldMap.publishedAt ? resolvePath(record, config.fieldMap.publishedAt!) : undefined,
        now,
      ),
      // Never pass untrusted `javascript:` / `data:` URLs through to the UI.
      url: safeExternalUrl(pick('url')) ?? undefined,
      symbols,
    })
  })

  if (items.length === 0) {
    throw new CustomParseError('资讯数组中没有可用的标题字段，请检查「标题」映射。')
  }
  return items
}

function failure(
  code: NonNullable<ConnectionTestResult['errorCode']>,
  message: string,
  elapsedMs: number,
  viaProxy: boolean,
  status = 0,
): ConnectionTestResult {
  return {
    ok: false,
    status,
    elapsedMs,
    sampleCount: 0,
    samples: [],
    errorCode: code,
    message,
    viaProxy,
    hint: CORS_HINT,
  }
}

/** Test a configuration without saving it and report concrete diagnostics. */
export async function testCustomSource(
  config: CustomSourceConfig,
  options: { symbol?: string; token?: string; now?: Date } = {},
): Promise<ConnectionTestResult> {
  const now = options.now ?? new Date()
  const symbol = options.symbol?.trim() || '600519'
  if (!config.urlTemplate.trim()) {
    return failure('FORMAT', '接口地址不能为空。', 0, config.viaProxy)
  }
  try {
    const response = await requestJson(config, symbol, options.token ?? '')
    if (config.kind === 'quote') {
      const snapshot = parseQuote(config, response.json, symbol, now)
      return {
        ok: true,
        status: response.status,
        elapsedMs: response.elapsedMs,
        sampleCount: snapshot.bars.length,
        samples: snapshot.bars.slice(-3).map((bar) => `${bar.date} 收 ${bar.close}`),
        message: `解析成功：${snapshot.bars.length} 根日 K，名称「${snapshot.name}」。`,
        viaProxy: response.viaProxy,
      }
    }
    const items = parseNews(config, response.json, now)
    return {
      ok: true,
      status: response.status,
      elapsedMs: response.elapsedMs,
      sampleCount: items.length,
      samples: items.slice(0, 3).map((item) => item.title.slice(0, 40)),
      message: `解析成功：${items.length} 条资讯。`,
      viaProxy: response.viaProxy,
    }
  } catch (error) {
    if (error instanceof CustomHttpError) {
      return failure(
        'HTTP',
        `接口返回 HTTP ${error.status}。${error.body ? `响应片段：${error.body}` : ''}`,
        error.elapsedMs,
        config.viaProxy,
        error.status,
      )
    }
    if (error instanceof CustomParseError) {
      return failure('MISSING_FIELD', error.message, 0, config.viaProxy)
    }
    if (error instanceof CustomRequestError) {
      return failure(error.code, error.message, error.elapsedMs, config.viaProxy)
    }
    return failure('FORMAT', `测试失败：${(error as Error).message}`, 0, config.viaProxy)
  }
}

function metaOf(config: CustomSourceConfig): ChannelMeta {
  return {
    id: config.id,
    name: config.name,
    kind: config.kind,
    provider: '自定义数据源',
    description: `用户配置的${config.kind === 'quote' ? '行情' : '资讯'}接口（${config.method} ${config.urlTemplate}）。`,
    requiresKey: false,
    reliability: 0.6,
    latencyMs: 0,
    simulated: false,
    rateLimit: '由用户自行控制请求频率',
  }
}

/** Wrap a saved quote configuration into the standard adapter contract. */
export function buildCustomQuoteAdapter(config: CustomSourceConfig, token: string): QuoteAdapter {
  const meta = metaOf(config)
  return {
    meta,
    async fetchQuotes(symbols: string[], ctx: AdapterContext): Promise<QuoteSnapshot[]> {
      const results = await mapWithConcurrency(
        symbols,
        2,
        async (symbol) => {
          try {
            const response = await requestJson(config, symbol, token)
            return parseQuote(config, response.json, symbol, ctx.now)
          } catch {
            return null
          }
        },
        80,
      )
      const valid = results.filter((item): item is QuoteSnapshot => item !== null)
      if (valid.length === 0) {
        throw new AdapterError('PARSE', `自定义行情源「${config.name}」未返回可用数据`)
      }
      return valid
    },
  }
}

/** Wrap a saved news configuration into the standard adapter contract. */
export function buildCustomNewsAdapter(config: CustomSourceConfig, token: string): NewsAdapter {
  const meta = metaOf(config)
  return {
    meta,
    async fetchNews(ctx: AdapterContext): Promise<RawNewsItem[]> {
      const symbol = ctx.symbols?.[0] ?? '600519'
      const response = await requestJson(config, symbol, token)
      return parseNews(config, response.json, ctx.now)
    },
  }
}
