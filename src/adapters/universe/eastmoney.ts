import type { MarketPrefix, UniverseStock } from '@/types'
import { AdapterError, type AdapterContext } from '@/adapters/types'
import { fetchJson } from '@/adapters/http'
import { mapWithConcurrency } from '@/lib/concurrency'

/**
 * Live full-market A-share list from Eastmoney.
 *
 * Endpoint (verified 2026-11-05, direct connection, no key):
 *   https://push2.eastmoney.com/api/qt/clist/get
 *
 * - `fs` selects Shanghai / Shenzhen main boards, STAR, ChiNext and the Beijing
 *   Stock Exchange (market prefix `bj`).
 * - The server caps `pz` at 100, so the ~5.9k universe needs ~60 pages.
 * - Response echoes the caller Origin (`Access-Control-Allow-Origin: *`), so a
 *   browser can call it directly.
 * - `f100` carries the industry classification, `f2` is `"-"` while suspended.
 *
 * Fetching is serialized with a small concurrency limit and a per-request
 * spacing delay to avoid tripping provider risk-control; callers cache the
 * result for one trading day so a full sync happens at most once per session.
 */
const LIST_BASE = 'https://push2.eastmoney.com/api/qt/clist/get'
const PAGE_SIZE = 100
const MAX_PAGES = 80
const FS = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048'

export const UNIVERSE_SOURCE = '东方财富行情列表（push2.clist，沪深 + 北交所）'

interface EastmoneyRow {
  f2?: number | string
  f3?: number | string
  f12?: string
  f13?: number
  f14?: string
  f100?: string
  f124?: number
}

interface EastmoneyListResponse {
  rc?: number
  data?: {
    total?: number
    diff?: EastmoneyRow[] | Record<string, EastmoneyRow>
  }
}

export interface UniverseFetchOptions {
  onProgress?: (loaded: number, total: number) => void
  /** Requests allowed in flight at the same time. */
  concurrency?: number
  /** Pause before each request after the first, in milliseconds. */
  spacingMs?: number
}

export interface UniverseFetchResult {
  items: UniverseStock[]
  providerTotal: number
  fetchedAt: string
}

function buildPageUrl(page: number): string {
  return (
    `${LIST_BASE}?pn=${page}&pz=${PAGE_SIZE}&po=1&np=1&fltt=2&invt=2&fid=f12` +
    `&fs=${FS}&fields=f12,f13,f14,f2,f3,f100,f124`
  )
}

function rowsOf(payload: EastmoneyListResponse): EastmoneyRow[] {
  const diff = payload.data?.diff
  if (Array.isArray(diff)) return diff
  return Object.values(diff ?? {})
}

function toNumber(value: number | string | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string' || value.trim() === '' || value.trim() === '-') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function marketOf(symbol: string, flag: number | undefined): MarketPrefix | null {
  if (symbol.startsWith('6')) return 'SH'
  if (symbol.startsWith('0') || symbol.startsWith('3')) return 'SZ'
  if (symbol.startsWith('4') || symbol.startsWith('8') || symbol.startsWith('92')) return 'BJ'
  // Anything else (B shares, funds, indices) is intentionally excluded.
  void flag
  return null
}

function toStock(row: EastmoneyRow): UniverseStock | null {
  const symbol = row.f12?.trim()
  const name = row.f14?.trim()
  if (!symbol || !name || name === '-') return null
  if (!/^(0|3|4|6|8|9)[0-9]{5}$/.test(symbol)) return null
  const market = marketOf(symbol, row.f13)
  if (!market) return null

  const price = toNumber(row.f2)
  const pctChange = toNumber(row.f3)
  const sector = row.f100?.trim() && row.f100.trim() !== '-' ? row.f100.trim() : undefined

  return {
    symbol,
    name,
    market,
    sector,
    price,
    pctChange,
    quoteTime: row.f124 ? new Date(row.f124 * 1000).toISOString() : undefined,
    st: /^\*?ST/.test(name),
    suspended: price === undefined,
  }
}

/** Fetch every page and return a de-duplicated, code-sorted list. */
export async function fetchUniverse(
  ctx: AdapterContext,
  options: UniverseFetchOptions = {},
): Promise<UniverseFetchResult> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 4))
  const spacingMs = Math.max(0, options.spacingMs ?? 150)
  const onProgress = options.onProgress

  let first: EastmoneyListResponse
  try {
    first = await fetchJson<EastmoneyListResponse>(buildPageUrl(1), ctx)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new AdapterError('NETWORK', `全市场列表首页请求失败：${reason}`)
  }

  const providerTotal = Number(first.data?.total ?? 0)
  if (!Number.isFinite(providerTotal) || providerTotal <= 0) {
    throw new AdapterError('PARSE', '全市场列表接口未返回有效总量，接口结构可能已变更')
  }

  const pageCount = Math.min(MAX_PAGES, Math.ceil(providerTotal / PAGE_SIZE))
  const collected: UniverseStock[] = []
  const failedPages: number[] = []
  let loaded = 0

  const merge = (rows: EastmoneyRow[]): void => {
    for (const row of rows) {
      const stock = toStock(row)
      if (stock) collected.push(stock)
    }
  }

  merge(rowsOf(first))
  loaded = 1
  onProgress?.(loaded, pageCount)

  const pages = Array.from({ length: pageCount - 1 }, (_, index) => index + 2)
  const responses = await mapWithConcurrency(
    pages,
    concurrency,
    async (page): Promise<{ page: number; rows: EastmoneyRow[] | null }> => {
      try {
        const payload = await fetchJson<EastmoneyListResponse>(buildPageUrl(page), ctx)
        return { page, rows: rowsOf(payload) }
      } catch {
        return { page, rows: null }
      }
    },
    spacingMs,
  )

  for (const response of responses) {
    if (response.rows === null) {
      failedPages.push(response.page)
      continue
    }
    merge(response.rows)
    loaded += 1
    onProgress?.(loaded, pageCount)
  }

  if (failedPages.length > 0) {
    const pagesText = failedPages.slice(0, 8).join(', ') + (failedPages.length > 8 ? ' …' : '')
    throw new AdapterError(
      'NETWORK',
      `全市场列表抓取不完整：${failedPages.length}/${pageCount} 页失败（第 ${pagesText} 页），已放弃本次结果，请稍后重试`,
    )
  }

  const unique = new Map<string, UniverseStock>()
  for (const stock of collected) unique.set(stock.symbol, stock)
  const items = Array.from(unique.values()).sort((a, b) => a.symbol.localeCompare(b.symbol))

  if (items.length < providerTotal * 0.9) {
    throw new AdapterError(
      'PARSE',
      `全市场列表数量异常：解析到 ${items.length} 条，接口声明 ${providerTotal} 条`,
    )
  }

  return {
    items,
    providerTotal,
    fetchedAt: ctx.now.toISOString(),
  }
}
