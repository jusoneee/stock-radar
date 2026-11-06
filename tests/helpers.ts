import type { Indicators, QuoteBar, RawNewsItem } from '@/types'
import { extractEvent } from '@/analysis/news/extractor'
import { NEWS_SAMPLES } from './fixtures/news-samples'

export function makeBars(count = 60, start = 10, step = 0.17): QuoteBar[] {
  return Array.from({ length: count }, (_, index) => {
    const close = start + index * step
    return {
      // Sequential unique dates so date-keyed logic sees one bar per day.
      date: new Date(Date.UTC(2025, 0, 1) + index * 86_400_000).toISOString().slice(0, 10),
      open: close - step * 0.4,
      high: close + step * 0.8,
      low: close - step * 0.8,
      close,
      volume: 1000 + index * 12,
    }
  })
}

export function makeIndicators(patch: Partial<Indicators> = {}): Indicators {
  return {
    lastClose: 10,
    ma5: 10,
    ma10: 10,
    ma20: 10,
    ma60: 10,
    pctChange1d: 0,
    pctChange5d: 0,
    volumeRatio: 1,
    rangePosition: 0.5,
    breakout20: false,
    volatility20: 1.2,
    avgAmount: 1_000_000,
    ...patch,
  }
}

export function makeNewsItem(index: number, title: string, publishedAt: string): RawNewsItem {
  return {
    id: `n-${index}`,
    sourceId: 'test-news',
    title,
    content: title,
    publishedAt,
  }
}

/** Evaluate the labelled fixture set; returns match counters for assertions. */
export function evaluateFixtureSet(): { typeHits: number; sentimentHits: number; total: number } {
  let typeHits = 0
  let sentimentHits = 0
  for (const sample of NEWS_SAMPLES) {
    const result = extractEvent({
      id: 'fixture',
      sourceId: 'fixture',
      title: sample.title,
      content: sample.content,
      publishedAt: '2026-11-05T09:00:00+08:00',
    })
    if (result.eventType === sample.eventType) typeHits += 1
    if (result.sentiment === sample.sentiment) sentimentHits += 1
  }
  return { typeHits, sentimentHits, total: NEWS_SAMPLES.length }
}
