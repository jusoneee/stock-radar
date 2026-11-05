import type { NewsAnalysis, RawNewsItem } from '@/types'
import { extractEvent } from './extractor'
import { mapSymbols, type StockRef } from './mapper'
import { hoursSince, detectStage } from './stage'
import { buildAdvice } from './advice'
import { effectiveTradingDay } from '@/lib/trading-calendar'

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, '').replace(/[，,。！!？?：:；;"'“”]/g, '').slice(0, 30)
}

/** Character bigrams make headline similarity work without a tokenizer dependency. */
function bigrams(text: string): Set<string> {
  const clean = text.replace(/[^\u4e00-\u9fa5a-z0-9]/gi, '')
  const set = new Set<string>()
  for (let index = 0; index < clean.length - 1; index += 1) {
    set.add(clean.slice(index, index + 2))
  }
  if (clean.length === 1) set.add(clean)
  return set
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const value of a) {
    if (b.has(value)) shared += 1
  }
  return shared / (a.size + b.size - shared)
}

interface NewsCluster {
  items: RawNewsItem[]
  grams: Set<string>
}

/** Cluster near-duplicate headlines (same fact reported by several outlets). */
function clusterNews(items: RawNewsItem[]): NewsCluster[] {
  const clusters: NewsCluster[] = []
  for (const item of items) {
    const grams = bigrams(normalizeTitle(item.title))
    const target = clusters.find((cluster) => jaccard(cluster.grams, grams) >= 0.6)
    if (target) {
      target.items.push(item)
            target.grams = new Set([...target.grams, ...grams])
      continue
    }
    clusters.push({ items: [item], grams })
  }
  return clusters
}

/**
 * Run the news pipeline:
 * raw item -> semantic dedupe -> event extraction -> symbol mapping -> stage -> advice.
 * Channel weights decide which duplicate survives; additional coverage raises
 * confidence because multiple independent sources reported the same fact.
 * Old or recycled coverage is flagged as `stale` so scoring can down-weight it.
 */
export function analyzeNews(
  items: RawNewsItem[],
  stocks: StockRef[],
  channelWeights: Record<string, number>,
  now: Date,
): NewsAnalysis[] {
  const results: NewsAnalysis[] = []

  for (const cluster of clusterNews(items)) {
    const primary = [...cluster.items].sort(
      (a, b) => (channelWeights[b.sourceId] ?? 0) - (channelWeights[a.sourceId] ?? 0),
    )[cluster.items.length - 1]!
    const extraction = extractEvent(primary)
    const symbols = mapSymbols(primary, stocks)
    const stage = detectStage(primary, extraction.sentiment, now)
    const advice = buildAdvice(extraction.sentiment, stage.stage, extraction.confidence)
    const ageHours = hoursSince(primary.publishedAt, now)

    const corroboration = cluster.items.length > 1 ? 0.05 * Math.min(cluster.items.length - 1, 2) : 0
    // Old news and repeatedly recycled headlines get down-weighted downstream.
    const stale = ageHours >= 72 || (stage.stage === 'fading' && ageHours >= 48)

    results.push({
      newsId: primary.id,
      title: primary.title,
      content: primary.content,
      publishedAt: primary.publishedAt,
      sourceId: primary.sourceId,
      symbols,
      eventType: extraction.eventType,
      sentiment: extraction.sentiment,
      confidence: Math.min(0.98, Math.round((extraction.confidence + corroboration) * 100) / 100),
      keywords: extraction.keywords,
      stage: stage.stage,
      stageReason: stage.reason,
      advice: advice.advice,
      adviceReason: advice.reason,
      impactWindow: advice.impactWindow,
      ageHours: Math.round(ageHours * 10) / 10,
      stale,
      duplicateCount: cluster.items.length,
      effectiveTradingDay: effectiveTradingDay(primary.publishedAt),
    })
  }

  return results.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
}
