/**
 * User-defined data source model.
 *
 * Configurations are persisted in localStorage, but token values are kept in
 * memory only. Requests never forward arbitrary user headers through the
 * bundled proxy: the proxy accepts an allow-listed target URL only.
 */

export type CustomSourceKind = 'quote' | 'news'
export type CustomHttpMethod = 'GET' | 'POST'

export type CustomFieldKey =
  | 'price'
  | 'name'
  | 'changePct'
  | 'bars'
  | 'date'
  | 'open'
  | 'high'
  | 'low'
  | 'close'
  | 'volume'
  | 'title'
  | 'content'
  | 'publishedAt'
  | 'url'
  | 'symbols'

export type CustomFieldMap = Partial<Record<CustomFieldKey, string>>

export interface CustomSourceConfig {
  id: string
  name: string
  kind: CustomSourceKind
  /** URL template; `{symbol}` is replaced with the requested symbol. */
  urlTemplate: string
  method: CustomHttpMethod
  /** JSON body template for POST; `{symbol}` is replaced as well. */
  bodyTemplate?: string
  timeoutMs: number
  fieldMap: CustomFieldMap
  /** Route the request through the local `/api/custom` allow-list proxy. */
  viaProxy: boolean
  enabled: boolean
  /** Relative weight inside its own kind, 0.05 - 1. */
  weight: number
  createdAt: string
}

export type ConnectionErrorCode =
  | 'CORS'
  | 'TIMEOUT'
  | 'HTTP'
  | 'NOT_JSON'
  | 'MISSING_FIELD'
  | 'FORMAT'
  | 'PROXY'
  | 'NETWORK'

export interface ConnectionTestResult {
  ok: boolean
  /** HTTP status, 0 when the request never reached the server. */
  status: number
  elapsedMs: number
  sampleCount: number
  samples: string[]
  errorCode?: ConnectionErrorCode
  message: string
  /** True when the request went through the local allow-list proxy. */
  viaProxy: boolean
  /** Universal hint shown next to a failed test. */
  hint?: string
}

export const QUOTE_FIELD_KEYS: CustomFieldKey[] = [
  'price',
  'name',
  'changePct',
  'bars',
  'date',
  'open',
  'high',
  'low',
  'close',
  'volume',
]

export const NEWS_FIELD_KEYS: CustomFieldKey[] = ['title', 'content', 'publishedAt', 'url', 'symbols']

export const FIELD_LABELS: Record<CustomFieldKey, string> = {
  price: '最新价',
  name: '名称',
  changePct: '涨跌幅(%)',
  bars: '日K 数组（kline）',
  date: '日期',
  open: '开盘',
  high: '最高',
  low: '最低',
  close: '收盘',
  volume: '成交量',
  title: '标题',
  content: '摘要/正文',
  publishedAt: '发布时间',
  url: '原文链接',
  symbols: '股票代码数组',
}

/** Mapping defaults: users only adjust the paths their API actually uses. */
export const DEFAULT_QUOTE_MAP: CustomFieldMap = {
  price: 'data.price',
  name: 'data.name',
  changePct: 'data.changePct',
  bars: 'data.klines',
  date: 'date',
  open: 'open',
  high: 'high',
  low: 'low',
  close: 'close',
  volume: 'volume',
}

export const DEFAULT_NEWS_MAP: CustomFieldMap = {
  title: 'title',
  content: 'content',
  publishedAt: 'publishedAt',
  url: 'url',
  symbols: 'symbols',
}

export function defaultFieldMap(kind: CustomSourceKind): CustomFieldMap {
  return { ...(kind === 'quote' ? DEFAULT_QUOTE_MAP : DEFAULT_NEWS_MAP) }
}
