import type { ChartBar, ChartPeriod, NewsAnalysis, QuoteBar, QuoteSnapshot, RawNewsItem } from '@/types'
import { getAllNewsAdapters, getAllQuoteAdapters, getNewsChannels } from '@/adapters/registry'
import type { AdapterContext } from '@/adapters/types'
import { fetchJson } from '@/adapters/http'
import { toSecId } from '@/adapters/quote/eastmoney'
import { analyzeNews } from '@/analysis/news/pipeline'
import type { StockRef } from '@/analysis/news/mapper'
import { useChannelsStore } from '@/stores/channels'
import { useCustomSourcesStore } from '@/stores/custom-sources'

export interface LoadedQuote {
  snapshot: QuoteSnapshot
  sourceId: string
  sourceName: string
  /** Other enabled sources that failed, for transparency in the UI. */
  failed: string[]
}

export interface LoadedNews {
  items: NewsAnalysis[]
  rawCount: number
  failed: string[]
  /** Normalised weights used by the dedupe pipeline. */
  weights: Record<string, number>
}

function normalize(items: Array<{ id: string; weight: number }>): Record<string, number> {
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  const result: Record<string, number> = {}
  if (items.length === 0) return result
  for (const item of items) {
    result[item.id] = total > 0 ? item.weight / total : 1 / items.length
  }
  return result
}

function ensureStores(): {
  channels: ReturnType<typeof useChannelsStore>
  custom: ReturnType<typeof useCustomSourcesStore>
} {
  const channels = useChannelsStore()
  const custom = useCustomSourcesStore()
  if (!channels.loaded) channels.init()
  custom.init()
  return { channels, custom }
}

function context(
  channels: ReturnType<typeof useChannelsStore>,
  custom: ReturnType<typeof useCustomSourcesStore>,
  adapterId: string,
  symbol: string,
): AdapterContext {
  return {
    apiKey: channels.keys[adapterId] ?? custom.tokens[adapterId] ?? '',
    timeoutMs: channels.timeoutMs,
    retryCount: channels.retryCount,
    cacheTtlMs: channels.cacheTtlMs,
    symbols: [symbol],
    now: new Date(),
  }
}

/**
 * Resolve one symbol through the enabled quote channels, highest weight first.
 * A single stock page can use either a built-in provider or a user-defined one.
 */
export async function loadQuoteSeries(symbol: string): Promise<LoadedQuote> {
  const { channels, custom } = ensureStores()
  const weights = normalize([
    ...channels.rawQuoteWeights,
    ...custom.enabledQuote.map((item) => ({ id: item.id, weight: item.weight })),
  ])
  const adapters = [...getAllQuoteAdapters(), ...custom.quoteAdapters]
    .filter((adapter) => weights[adapter.meta.id] !== undefined)
    .sort((a, b) => (weights[b.meta.id] ?? 0) - (weights[a.meta.id] ?? 0))

  if (adapters.length === 0) throw new Error('没有启用的行情数据源，请先在「数据源配置」中启用至少一个渠道。')

  const failed: string[] = []
  for (const adapter of adapters) {
    try {
      const snapshots = await adapter.fetchQuotes([symbol], context(channels, custom, adapter.meta.id, symbol))
      const snapshot = snapshots.find((item) => item.symbol === symbol && item.bars.length > 0)
      if (snapshot) {
        return { snapshot, sourceId: adapter.meta.id, sourceName: adapter.meta.name, failed }
      }
      failed.push(`${adapter.meta.name}：空数据`)
    } catch (error) {
      failed.push(`${adapter.meta.name}：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new Error(`所有已启用的行情源均失败：${failed.join('；')}`)
}

/**
 * One chart period for the detail page. Uses the same Eastmoney kline/trends
 * endpoints already used by the quote adapter. Weekly/monthly fall back to
 * aggregating the daily bars we already hold; intraday has no local fallback.
 */
export interface ChartPeriodSeries {
  bars: ChartBar[]
  mode: 'line' | 'candle'
  /** Previous close, drawn as a dashed baseline on the 分时 chart. */
  baseline: number | null
  /** Non-empty when the preferred endpoint failed and data was degraded. */
  note: string
}

const TRENDS_BASE = 'https://push2his.eastmoney.com/api/qt/stock/trends2/get'
const KLINE_BASE = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'

interface TrendsResponse {
  data?: { preClose?: number; trends?: string[] }
}

interface KlineResponse {
  data?: { klines?: string[] }
}

function toChartBar(bar: QuoteBar): ChartBar {
  return { label: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume }
}

function parseTrends(rows: string[], multiDay: boolean): ChartBar[] {
  const bars: ChartBar[] = []
  for (const row of rows) {
    // time,open,close,high,low,volume,amount,avg
    const [time, open, close, high, low, volume] = row.split(',')
    const price = Number(close)
    if (!time || !Number.isFinite(price) || price <= 0) continue
    const openValue = Number(open)
    const highValue = Number(high)
    const lowValue = Number(low)
    const volumeValue = Number(volume)
    const label = multiDay ? time.replace(/^\d{4}-?/u, '').slice(-11) : time.slice(-5)
    bars.push({
      label,
      open: Number.isFinite(openValue) && openValue > 0 ? openValue : price,
      high: Number.isFinite(highValue) && highValue > 0 ? highValue : price,
      low: Number.isFinite(lowValue) && lowValue > 0 ? lowValue : price,
      close: price,
      volume: Number.isFinite(volumeValue) ? volumeValue : 0,
    })
  }
  return bars
}

function parseKlineRows(rows: string[]): ChartBar[] {
  const bars: ChartBar[] = []
  for (const row of rows) {
    // date,open,close,high,low,volume,amount,pct
    const [date, open, close, high, low] = row.split(',')
    const volume = Number(row.split(',')[5])
    const closeValue = Number(close)
    if (!date || !Number.isFinite(closeValue) || closeValue <= 0) continue
    bars.push({
      label: date,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: closeValue,
      volume: Number.isFinite(volume) ? volume : 0,
    })
  }
  return bars
}

/** Group daily bars into calendar weeks (Monday start) or calendar months. */
function aggregateDaily(daily: QuoteBar[], period: 'week' | 'month'): ChartBar[] {
  const groups = new Map<string, QuoteBar[]>()
  for (const bar of daily) {
    const stamp = new Date(`${bar.date}T00:00:00`)
    if (Number.isNaN(stamp.getTime())) continue
    let key: string
    if (period === 'month') {
      key = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}`
    } else {
      const monday = new Date(stamp)
      monday.setDate(stamp.getDate() - ((stamp.getDay() + 6) % 7))
      key = monday.toISOString().slice(0, 10)
    }
    const bucket = groups.get(key)
    if (bucket) bucket.push(bar)
    else groups.set(key, [bar])
  }
  return [...groups.values()].map((bucket) => ({
    label: bucket[bucket.length - 1]!.date,
    open: bucket[0]!.open,
    high: Math.max(...bucket.map((bar) => bar.high)),
    low: Math.min(...bucket.map((bar) => bar.low)),
    close: bucket[bucket.length - 1]!.close,
    volume: bucket.reduce((sum, bar) => sum + bar.volume, 0),
  }))
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function loadChartPeriod(
  symbol: string,
  period: ChartPeriod,
  daily: QuoteBar[],
): Promise<ChartPeriodSeries> {
  if (period === 'day') {
    return { bars: daily.map(toChartBar), mode: 'candle', baseline: null, note: '' }
  }
  const ctx: AdapterContext = {
    apiKey: '',
    timeoutMs: 8000,
    retryCount: 1,
    cacheTtlMs: 30_000,
    symbols: [symbol],
    now: new Date(),
  }
  const secid = toSecId(symbol)
  const label = period === 'intraday' ? '分时' : period === 'fiveDay' ? '五日' : period === 'week' ? '周 K' : '月 K'

  try {
    if (period === 'intraday' || period === 'fiveDay') {
      const ndays = period === 'intraday' ? 1 : 5
      const url =
        `${TRENDS_BASE}?secid=${secid}` +
        '&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14' +
        `&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ndays=${ndays}&iscr=0&iscca=0`
      const payload = await fetchJson<TrendsResponse>(url, ctx)
      const bars = parseTrends(payload.data?.trends ?? [], ndays > 1)
      if (bars.length < 2) throw new Error('接口未返回分钟数据')
      const baseline = typeof payload.data?.preClose === 'number' ? payload.data.preClose : null
      return {
        bars,
        mode: 'line',
        baseline: period === 'intraday' ? baseline : null,
        note: '',
      }
    }

    const klt = period === 'week' ? 102 : 103
    const lmt = period === 'week' ? 120 : 60
    const url =
      `${KLINE_BASE}?secid=${secid}&klt=${klt}&fqt=1&end=20500101&lmt=${lmt}` +
      '&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58'
    const payload = await fetchJson<KlineResponse>(url, ctx)
    const bars = parseKlineRows(payload.data?.klines ?? [])
    if (bars.length < 2) throw new Error('接口未返回 K 线数据')
    return { bars, mode: 'candle', baseline: null, note: '' }
  } catch (error) {
    if (period === 'week' || period === 'month') {
      const bars = aggregateDaily(daily, period)
      return {
        bars,
        mode: 'candle',
        baseline: null,
        note: bars.length
          ? `${label}接口暂不可用，已改用现有 ${daily.length} 根日线聚合为 ${bars.length} 根${period === 'week' ? '周' : '月'}线。`
          : `${label}接口暂不可用，且现有日线不足以聚合。`,
      }
    }
    return { bars: [], mode: 'line', baseline: null, note: `${label}接口暂不可用：${errorText(error)}` }
  }
}

/**
 * Aggregate news from every enabled news channel, then run the same semantic
 * pipeline as the analysis engine. When nothing maps to the symbol we return an
 * empty list instead of padding with unrelated headlines.
 */
export async function loadStockNews(symbol: string, name: string): Promise<LoadedNews> {
  const { channels, custom } = ensureStores()
  const merged = [...channels.rawNewsWeights, ...custom.enabledNews.map((item) => ({ id: item.id, weight: item.weight }))]
  const weights = normalize(merged)
  const adapters = [...getAllNewsAdapters(), ...custom.newsAdapters]
    .filter((adapter) => weights[adapter.meta.id] !== undefined)
    .sort((a, b) => (weights[b.meta.id] ?? 0) - (weights[a.meta.id] ?? 0))
  if (adapters.length === 0) return { items: [], rawCount: 0, failed: [], weights }

  const failed: string[] = []
  const gathered: RawNewsItem[] = []
  const now = new Date()
  const settled = await Promise.allSettled(
    adapters.map(async (adapter) => {
      const ctx = context(channels, custom, adapter.meta.id, symbol)
      ctx.now = now
      return adapter.fetchNews(ctx)
    }),
  )
  settled.forEach((result, index) => {
    const adapter = adapters[index]!
    if (result.status === 'fulfilled') {
      gathered.push(...result.value)
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason)
      failed.push(`${adapter.meta.name}：${reason}`)
    }
  })

  const stocks: StockRef[] = [{ symbol, name }]
  const items = analyzeNews(gathered, stocks, weights, now)
  return { items, rawCount: gathered.length, failed, weights }
}

export interface MarketNewsItem extends RawNewsItem {
  sourceName: string
}

export interface LoadedMarketNews {
  items: MarketNewsItem[]
  failed: string[]
}

/**
 * Home-page headline feed: aggregate raw news from every enabled news channel
 * (built-in + custom) without running the per-stock semantic pipeline. Used by
 * the overview page, so it intentionally adds no new provider or data layer.
 */
export async function loadMarketNews(limit = 14): Promise<LoadedMarketNews> {
  const { channels, custom } = ensureStores()
  // The overview is read-only and intentionally attempts every enabled news
  // feed, even when the build-time proxy flag marks it unavailable: the dev
  // server / optional proxy can still serve it, and a static build simply shows
  // the failure note instead of pretending the feed does not exist.
  const newsIds = new Set(getNewsChannels().map((meta) => meta.id))
  const enabledBuiltIn = channels.channels
    .filter((channel) => channel.enabled && newsIds.has(channel.id))
    .map((channel) => ({ id: channel.id, weight: channel.weight }))
  const weights = normalize([
    ...enabledBuiltIn,
    ...custom.enabledNews.map((item) => ({ id: item.id, weight: item.weight })),
  ])
  const adapters = [...getAllNewsAdapters(), ...custom.newsAdapters]
    .filter((adapter) => weights[adapter.meta.id] !== undefined)
    .sort((a, b) => (weights[b.meta.id] ?? 0) - (weights[a.meta.id] ?? 0))
  if (adapters.length === 0) {
    return { items: [], failed: ['没有启用任何新闻源'] }
  }

  const failed: string[] = []
  const gathered: MarketNewsItem[] = []
  const now = new Date()
  const settled = await Promise.allSettled(
    adapters.map(async (adapter) => {
      const ctx = context(channels, custom, adapter.meta.id, '')
      ctx.now = now
      const items = await adapter.fetchNews(ctx)
      return items.map((item) => ({ ...item, sourceName: adapter.meta.name }))
    }),
  )
  settled.forEach((result, index) => {
    const adapter = adapters[index]!
    if (result.status === 'fulfilled') {
      gathered.push(...result.value)
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason)
      failed.push(`${adapter.meta.name}：${reason}`)
    }
  })

  const seen = new Set<string>()
  const items = gathered
    .filter((item) => {
      const key = item.title.replace(/\s+/g, '').toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => {
      const left = Date.parse(a.publishedAt ?? '')
      const right = Date.parse(b.publishedAt ?? '')
      if (!Number.isFinite(left) && !Number.isFinite(right)) return 0
      if (!Number.isFinite(left)) return 1
      if (!Number.isFinite(right)) return -1
      return right - left
    })
    .slice(0, limit)

  return { items, failed }
}
