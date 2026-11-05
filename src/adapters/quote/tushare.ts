import type { ChannelMeta, QuoteBar, QuoteSnapshot } from '@/types'
import { AdapterError, type AdapterContext, type QuoteAdapter } from '@/adapters/types'
import { fetchJsonPost } from '@/adapters/http'
import { findProfile } from '@/adapters/mock/universe'
import { marketOfSymbol } from '@/lib/market'
import { mapWithConcurrency } from '@/lib/concurrency'

/**
 * Optional Tushare Pro quote channel.
 *
 * Requires a user-supplied token (kept in memory only, never persisted). The
 * request is POSTed to the same-origin `/api/tushare` path so the Vite dev proxy
 * or `server/proxy.mjs` can forward it; the bundled proxy can also inject a
 * server-side token instead of exposing it to the browser.
 *
 * API contract (Tushare Pro):
 *   POST https://api.tushare.pro
 *   { api_name: "daily", token, params: { ts_code, start_date, end_date }, fields }
 *   -> { code: 0, data: { fields: string[], items: (string|number)[][] } }
 *
 * Free accounts are rate-limited per minute, so calls are serialized (concurrency 1)
 * with a 300 ms gap and rely on the shared response cache.
 */
const META: ChannelMeta = {
  id: 'tushare-quote',
  name: 'Tushare 数据',
  kind: 'quote',
  provider: 'Tushare Pro',
  description: '需自备 Token 的量化数据源，历史日线质量高；未配置 Token 时该渠道明确显示未启用。',
  requiresKey: true,
  keyHint: 'Tushare Pro Token（仅存于浏览器内存，不落盘）',
  docsUrl: 'https://tushare.pro/',
  reliability: 0.95,
  latencyMs: 700,
  simulated: false,
  rateLimit: '按账号积分限频（免费账号约每分钟 50 次），本适配器串行请求 + 缓存',
}

interface TushareResponse {
  code?: number
  msg?: string
  data?: {
    fields?: string[]
    items?: Array<Array<string | number | null>>
  }
}

function tsCode(symbol: string): string {
  const market = marketOfSymbol(symbol)
  if (market === 'SH') return `${symbol}.SH`
  if (market === 'BJ') return `${symbol}.BJ`
  return `${symbol}.SZ`
}

function compactDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function toIsoDate(value: string): string {
  if (!/^\d{8}$/.test(value)) return value
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function parseRows(payload: TushareResponse): QuoteBar[] {
  const fields = payload.data?.fields ?? []
  const items = payload.data?.items ?? []
  const column = (name: string): number => fields.indexOf(name)
  const indexDate = column('trade_date')
  const indexOpen = column('open')
  const indexHigh = column('high')
  const indexLow = column('low')
  const indexClose = column('close')
  const indexVolume = column('vol')
  if (indexDate < 0 || indexClose < 0) return []

  const bars: QuoteBar[] = []
  for (const row of items) {
    const date = toIsoDate(String(row[indexDate] ?? ''))
    const close = Number(row[indexClose])
    if (!date || !Number.isFinite(close) || close <= 0) continue
    bars.push({
      date,
      open: Number(row[indexOpen]),
      high: Number(row[indexHigh]),
      low: Number(row[indexLow]),
      close,
      volume: indexVolume >= 0 ? Number(row[indexVolume]) : 0,
    })
  }
  // Tushare returns rows newest-first; the engine expects oldest-first.
  return bars.sort((a, b) => a.date.localeCompare(b.date))
}

export const tushareQuoteAdapter: QuoteAdapter = {
  meta: META,
  async fetchQuotes(symbols: string[], ctx: AdapterContext): Promise<QuoteSnapshot[]> {
    const token = ctx.apiKey?.trim()
    if (!token) {
      throw new AdapterError(
        'MISSING_KEY',
        '未配置 Tushare Token，该渠道未启用：请在「数据源配置」填入 Token，或由服务端代理注入',
      )
    }
    if (symbols.length === 0) {
      throw new AdapterError('PARSE', '股票池为空')
    }

    const end = compactDate(ctx.now)
    const start = compactDate(new Date(ctx.now.getTime() - 300 * 86_400_000))

    const results = await mapWithConcurrency(
      symbols,
      1,
      async (symbol): Promise<QuoteSnapshot | null> => {
        try {
          const payload = await fetchJsonPost<TushareResponse>(
            '/api/tushare',
            {
              api_name: 'daily',
              token,
              params: { ts_code: tsCode(symbol), start_date: start, end_date: end },
              fields: 'trade_date,open,high,low,close,vol',
            },
            ctx,
          )
          if (payload.code !== 0) {
            throw new AdapterError('NETWORK', `Tushare 返回错误（code=${payload.code}）：${payload.msg ?? '未知错误'}`)
          }
          const bars = parseRows(payload).slice(-120)
          if (bars.length < 20) return null
          const profile = findProfile(symbol)
          return {
            symbol,
            name: profile?.name ?? symbol,
            sector: profile?.sector ?? '未分类',
            bars,
            sourceId: META.id,
            asOf: ctx.now.toISOString(),
          }
        } catch (error) {
          if (error instanceof AdapterError && error.code === 'NETWORK' && error.message.includes('Tushare 返回错误')) {
            throw error
          }
          return null
        }
      },
      300,
    )

    const valid = results.filter((item): item is QuoteSnapshot => item !== null)
    if (valid.length === 0) {
      throw new AdapterError('NETWORK', 'Tushare 日线全部获取失败：请检查 Token 积分、限频状态或 /api/tushare 代理')
    }
    return valid
  },
}
