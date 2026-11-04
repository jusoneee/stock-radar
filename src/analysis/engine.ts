import type {
  AdapterSettings,
  AnalysisReport,
  ChannelRunResult,
  MarketSummary,
  QuoteSnapshot,
  RawNewsItem,
  Recommendation,
} from '@/types'
import type { AdapterContext, NewsAdapter, QuoteAdapter } from '@/adapters/types'
import { computeIndicators } from './indicators'
import { classifyTrend } from './trend'
import { analyzeNews } from './news/pipeline'
import { scoreNews, scoreStock } from './scoring'

interface QuoteBatch {
  channelId: string
  weight: number
  snapshots: QuoteSnapshot[]
  result: ChannelRunResult
}

interface NewsBatch {
  channelId: string
  weight: number
  items: RawNewsItem[]
  result: ChannelRunResult
}

interface MergedQuote {
  primary: QuoteSnapshot
  primaryWeight: number
  sourceIds: string[]
  weightedClose: number
  totalWeight: number
  minClose: number
  maxClose: number
}

export interface EngineDeps {
  quoteAdapters: QuoteAdapter[]
  newsAdapters: NewsAdapter[]
  now?: () => Date
}

/**
 * Orchestrates: fetch (multi-channel) -> merge -> indicators -> trend -> news
 * pipeline -> scoring. UI only consumes `AnalysisReport`, so data sources and
 * analysis rules can evolve independently.
 */
export class AnalysisEngine {
  private readonly deps: EngineDeps

  constructor(deps: EngineDeps) {
    this.deps = deps
  }

  private context(settings: AdapterSettings, id: string, now: Date): AdapterContext {
    return {
      apiKey: settings.keys[id],
      timeoutMs: settings.timeoutMs,
      retryCount: settings.retryCount,
      cacheTtlMs: settings.cacheTtlMs,
      now,
    }
  }

  private async fetchQuotes(settings: AdapterSettings, now: Date): Promise<QuoteBatch[]> {
    return Promise.all(
      settings.quoteChannels.map(async (channel) => {
        const adapter = this.deps.quoteAdapters.find((item) => item.meta.id === channel.id)
        const startedAt = performance.now()
        if (!adapter) {
          return {
            channelId: channel.id,
            weight: channel.weight,
            snapshots: [],
            result: {
              channelId: channel.id,
              ok: false,
              count: 0,
              elapsedMs: 0,
              error: 'Adapter not registered',
            },
          }
        }
        try {
          const snapshots = await adapter.fetchQuotes(settings.symbols, this.context(settings, channel.id, now))
          return {
            channelId: channel.id,
            weight: channel.weight,
            snapshots,
            result: {
              channelId: channel.id,
              ok: true,
              count: snapshots.length,
              elapsedMs: Math.round(performance.now() - startedAt),
            },
          }
        } catch (error) {
          return {
            channelId: channel.id,
            weight: channel.weight,
            snapshots: [],
            result: {
              channelId: channel.id,
              ok: false,
              count: 0,
              elapsedMs: Math.round(performance.now() - startedAt),
              error: error instanceof Error ? error.message : String(error),
            },
          }
        }
      }),
    )
  }

  private async fetchNews(settings: AdapterSettings, now: Date): Promise<NewsBatch[]> {
    return Promise.all(
      settings.newsChannels.map(async (channel) => {
        const adapter = this.deps.newsAdapters.find((item) => item.meta.id === channel.id)
        const startedAt = performance.now()
        if (!adapter) {
          return {
            channelId: channel.id,
            weight: channel.weight,
            items: [],
            result: { channelId: channel.id, ok: false, count: 0, elapsedMs: 0, error: 'Adapter not registered' },
          }
        }
        try {
          const items = await adapter.fetchNews(this.context(settings, channel.id, now))
          return {
            channelId: channel.id,
            weight: channel.weight,
            items,
            result: {
              channelId: channel.id,
              ok: true,
              count: items.length,
              elapsedMs: Math.round(performance.now() - startedAt),
            },
          }
        } catch (error) {
          return {
            channelId: channel.id,
            weight: channel.weight,
            items: [],
            result: {
              channelId: channel.id,
              ok: false,
              count: 0,
              elapsedMs: Math.round(performance.now() - startedAt),
              error: error instanceof Error ? error.message : String(error),
            },
          }
        }
      }),
    )
  }

  /** Highest-weight channel becomes the primary series; others join the consensus. */
  private mergeQuotes(batches: QuoteBatch[]): Map<string, MergedQuote> {
    const merged = new Map<string, MergedQuote>()
    for (const batch of batches) {
      for (const snapshot of batch.snapshots) {
        const lastClose = snapshot.bars[snapshot.bars.length - 1]?.close ?? 0
        const current = merged.get(snapshot.symbol)
        if (!current) {
          merged.set(snapshot.symbol, {
            primary: snapshot,
            primaryWeight: batch.weight,
            sourceIds: [batch.channelId],
            weightedClose: lastClose * batch.weight,
            totalWeight: batch.weight,
            minClose: lastClose,
            maxClose: lastClose,
          })
          continue
        }
        current.sourceIds.push(batch.channelId)
        current.weightedClose += lastClose * batch.weight
        current.totalWeight += batch.weight
        current.minClose = Math.min(current.minClose, lastClose)
        current.maxClose = Math.max(current.maxClose, lastClose)
        if (batch.weight > current.primaryWeight) {
          current.primary = snapshot
          current.primaryWeight = batch.weight
        }
      }
    }
    return merged
  }

  async run(settings: AdapterSettings): Promise<AnalysisReport> {
    const now = this.deps.now ? this.deps.now() : new Date()
    if (settings.quoteChannels.length === 0) {
      throw new Error('未启用任何行情渠道，请先在「数据源配置」中开启至少一个行情源。')
    }
    if (settings.symbols.length === 0) {
      throw new Error('股票池为空，请先选择至少一只股票。')
    }

    const [quoteBatches, newsBatches] = await Promise.all([
      this.fetchQuotes(settings, now),
      this.fetchNews(settings, now),
    ])

    const merged = this.mergeQuotes(quoteBatches)
    if (merged.size === 0) {
      // Never fall back to fake data silently: surface why every provider failed.
      const failures = quoteBatches
        .filter((batch) => !batch.result.ok)
        .map((batch) => `${batch.channelId}：${batch.result.error ?? '无数据'}`)
      throw new Error(
        `所有行情渠道均未取到数据，请检查网络或数据源配置后重试。${failures.length > 0 ? `失败原因：${failures.join('；')}` : ''}`,
      )
    }
    const stockRefs = Array.from(merged.values()).map((entry) => ({
      symbol: entry.primary.symbol,
      name: entry.primary.name,
    }))

    const channelWeights: Record<string, number> = {}
    for (const batch of newsBatches) channelWeights[batch.channelId] = batch.weight
    const rawNews = newsBatches.flatMap((batch) => batch.items)
    const news = analyzeNews(rawNews, stockRefs, channelWeights, now)

    const recommendations: Recommendation[] = []
    for (const [symbol, entry] of merged) {
      const indicators = computeIndicators(entry.primary.bars)
      const trend = classifyTrend(indicators)
      const relatedNews = news.filter((item) => item.symbols.includes(symbol))
      const newsScore = scoreNews(relatedNews)
      const scored = scoreStock(trend, indicators, newsScore, relatedNews, entry.sourceIds.length)

      const consensusClose = entry.totalWeight > 0 ? entry.weightedClose / entry.totalWeight : indicators.lastClose
      const deviation = Math.abs(consensusClose - indicators.lastClose) / Math.max(indicators.lastClose, 0.01)
      const riskFlags = [...scored.riskFlags]
      if (entry.sourceIds.length > 1 && deviation > 0.005) {
        riskFlags.push(`多源收盘价偏差 ${(deviation * 100).toFixed(2)}%，建议核对数据`)
      }

      recommendations.push({
        symbol,
        name: entry.primary.name,
        sector: entry.primary.sector,
        totalScore: scored.totalScore,
        trend,
        indicators,
        breakdown: scored.breakdown,
        entryAdvice: scored.entryAdvice,
        riskFlags,
        bars: entry.primary.bars,
        sourceIds: entry.sourceIds,
        news: relatedNews,
      })
    }
    recommendations.sort((a, b) => b.totalScore - a.totalScore)

    const channelRuns: ChannelRunResult[] = [
      ...quoteBatches.map((batch) => batch.result),
      ...newsBatches.map((batch) => batch.result),
    ]
    const missingSymbols = settings.symbols.filter((symbol) => !merged.has(symbol))

    const market: MarketSummary = {
      total: recommendations.length,
      advances: recommendations.filter((item) => item.indicators.pctChange1d > 0).length,
      declines: recommendations.filter((item) => item.indicators.pctChange1d < 0).length,
      avgPctChange:
        recommendations.length > 0
          ? Math.round(
              (recommendations.reduce((sum, item) => sum + item.indicators.pctChange1d, 0) / recommendations.length) *
                100,
            ) / 100
          : 0,
      strongCount: recommendations.filter((item) => item.trend.label === 'strong-up').length,
      positiveNews: news.filter((item) => item.sentiment === 'positive').length,
      negativeNews: news.filter((item) => item.sentiment === 'negative').length,
    }

    return {
      generatedAt: now.toISOString(),
      recommendations,
      news,
      market,
      channelRuns,
      missingSymbols,
    }
  }
}
