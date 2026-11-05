import type { NewsAnalysis, QuoteSnapshot, RawNewsItem } from '@/types'
import { getAllNewsAdapters, getAllQuoteAdapters } from '@/adapters/registry'
import type { AdapterContext } from '@/adapters/types'
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
