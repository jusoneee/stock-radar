import type { NewsAnalysis, RawNewsItem } from '@/types'
import { extractEvent } from './extractor'
import { mapSymbols, type StockRef } from './mapper'
import { detectStage } from './stage'
import { buildAdvice } from './advice'

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, '').replace(/[，,。！!？?：:；;"'“”]/g, '').slice(0, 30)
}

/**
 * Run the news pipeline:
 * raw item -> dedupe -> event extraction -> symbol mapping -> stage -> advice.
 * Channel weights decide which duplicate survives; additional coverage raises
 * confidence because multiple independent sources reported the same fact.
 */
export function analyzeNews(
  items: RawNewsItem[],
  stocks: StockRef[],
  channelWeights: Record<string, number>,
  now: Date,
): NewsAnalysis[] {
  const groups = new Map<string, RawNewsItem[]>()
  for (const item of items) {
    const key = normalizeTitle(item.title)
    const bucket = groups.get(key) ?? []
    bucket.push(item)
    groups.set(key, bucket)
  }

  const results: NewsAnalysis[] = []
  for (const bucket of groups.values()) {
    const primary = [...bucket].sort(
      (a, b) => (channelWeights[b.sourceId] ?? 0) - (channelWeights[a.sourceId] ?? 0),
    )[bucket.length - 1]!
    const extraction = extractEvent(primary)
    const symbols = mapSymbols(primary, stocks)
    const stage = detectStage(primary, extraction.sentiment, now)
    const advice = buildAdvice(extraction.sentiment, stage.stage, extraction.confidence)

    const corroboration = bucket.length > 1 ? 0.05 * Math.min(bucket.length - 1, 2) : 0
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
    })
  }

  return results.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
}
