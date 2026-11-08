import { fetchJson } from '@/adapters/http'

/**
 * Index snapshots for the top bar and its "全部指数" panel.
 *
 * Reuses the same Eastmoney public quote host as the main quote adapter, but
 * asks only for batch snapshot fields (no per-symbol K-line), so refreshing
 * nine indices is still one cheap request. Failure is surfaced to the caller
 * as an error; the header renders placeholders instead of crashing.
 */
export interface MarketIndex {
  code: string
  name: string
  price: number
  change: number
  pctChange: number
  /** Intraday turnover (成交额) in CNY; undefined when the provider omits it. */
  turnover?: number
  /** Shown inline in the header strip; every index is listed in the panel. */
  primary: boolean
  /** Optional short label used by very narrow header layouts. */
  shortName: string
}

export interface IndexDefinition {
  code: string
  secid: string
  name: string
  shortName: string
  primary: boolean
}

export const MARKET_INDEX_DEFINITIONS: IndexDefinition[] = [
  { code: '000001', secid: '1.000001', name: '上证指数', shortName: '上证', primary: true },
  { code: '399001', secid: '0.399001', name: '深证成指', shortName: '深证', primary: true },
  { code: '399006', secid: '0.399006', name: '创业板指', shortName: '创业板', primary: true },
  { code: '000688', secid: '1.000688', name: '科创50', shortName: '科创50', primary: false },
  { code: '000300', secid: '1.000300', name: '沪深300', shortName: '沪深300', primary: false },
  { code: '000016', secid: '1.000016', name: '上证50', shortName: '上证50', primary: false },
  { code: '000905', secid: '1.000905', name: '中证500', shortName: '中证500', primary: false },
  { code: '000852', secid: '1.000852', name: '中证1000', shortName: '中证1000', primary: false },
  { code: '899050', secid: '0.899050', name: '北证50', shortName: '北证50', primary: false },
]

interface EastmoneyIndexRow {
  f2?: number
  f3?: number
  f4?: number
  f6?: number
  f12?: string
  f14?: string
}

interface EastmoneyIndexResponse {
  data?: {
    diff?: EastmoneyIndexRow[] | Record<string, EastmoneyIndexRow>
  }
}

const URL =
  'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2' +
  '&fields=f2,f3,f4,f6,f12,f14' +
  `&secids=${MARKET_INDEX_DEFINITIONS.map((item) => item.secid).join(',')}`

export async function fetchMarketIndices(): Promise<MarketIndex[]> {
  const payload = await fetchJson<EastmoneyIndexResponse>(URL, {
    timeoutMs: 8000,
    retryCount: 1,
    cacheTtlMs: 0,
    now: new Date(),
  })
  const rawDiff = payload.data?.diff
  const rows = Array.isArray(rawDiff) ? rawDiff : Object.values(rawDiff ?? {})
  if (rows.length === 0) {
    throw new Error('指数接口未返回数据')
  }

  return MARKET_INDEX_DEFINITIONS.map((definition) => {
    const row = rows.find((item) => item.f12 === definition.code)
    return {
      code: definition.code,
      name: definition.name,
      shortName: definition.shortName,
      primary: definition.primary,
      price: typeof row?.f2 === 'number' ? row.f2 : Number.NaN,
      change: typeof row?.f4 === 'number' ? row.f4 : Number.NaN,
      pctChange: typeof row?.f3 === 'number' ? row.f3 : Number.NaN,
      turnover: typeof row?.f6 === 'number' ? row.f6 : undefined,
    }
  })
}

export interface IndexTrend {
  code: string
  points: number[]
  /** Which series the mini chart shows, so the UI can label it honestly. */
  basis: 'intraday' | 'daily'
  label: string
  previousClose?: number
}

interface TrendsResponse {
  data?: {
    preClose?: number
    trends?: string[]
  }
}

interface KlineResponse {
  data?: {
    klines?: string[]
  }
}

const TRENDS_BASE = 'https://push2his.eastmoney.com/api/qt/stock/trends2/get'
const KLINE_BASE = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'

async function fetchIntraday(def: IndexDefinition): Promise<IndexTrend | null> {
  const url =
    `${TRENDS_BASE}?secid=${def.secid}` +
    '&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14' +
    '&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ndays=1&iscr=0&iscca=0'
  const payload = await fetchJson<TrendsResponse>(url, {
    timeoutMs: 8000,
    retryCount: 0,
    cacheTtlMs: 0,
    now: new Date(),
  })
  const trends = payload.data?.trends ?? []
  // Each row is "time,open,close,high,low,volume,amount,avg"; chart the close.
  const points = trends
    .map((row) => Number(row.split(',')[2]))
    .filter((value) => Number.isFinite(value))
  if (points.length < 2) return null
  return {
    code: def.code,
    points,
    basis: 'intraday',
    label: '当日分时',
    previousClose: typeof payload.data?.preClose === 'number' ? payload.data.preClose : undefined,
  }
}

async function fetchDaily(def: IndexDefinition): Promise<IndexTrend | null> {
  const url =
    `${KLINE_BASE}?secid=${def.secid}&klt=101&fqt=0&lmt=20&end=20500101` +
    '&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57'
  const payload = await fetchJson<KlineResponse>(url, {
    timeoutMs: 8000,
    retryCount: 0,
    cacheTtlMs: 0,
    now: new Date(),
  })
  const klines = payload.data?.klines ?? []
  const points = klines
    .map((row) => Number(row.split(',')[2]))
    .filter((value) => Number.isFinite(value))
  if (points.length < 2) return null
  return { code: def.code, points, basis: 'daily', label: '近 20 日收盘' }
}

/**
 * Mini sparkline data for one index: today's intraday line when the session is
 * available, otherwise a 20-day closing-price fallback. Both are public
 * Eastmoney endpoints; failure is left to the caller to render a placeholder.
 */
export async function fetchIndexTrend(def: IndexDefinition): Promise<IndexTrend> {
  try {
    const intraday = await fetchIntraday(def)
    if (intraday) return intraday
  } catch {
    // Fall through to the daily series.
  }
  const daily = await fetchDaily(def)
  if (daily) return daily
  throw new Error('指数趋势数据不可用')
}
