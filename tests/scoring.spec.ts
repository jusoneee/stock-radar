import { describe, expect, it } from 'vitest'
import type { NewsAnalysis, ScoreWeights } from '@/types'
import { DEFAULT_SCORE_WEIGHTS, normalizeWeights, scoreNews, scoreStock } from '@/analysis/scoring'
import { classifyTrend } from '@/analysis/trend'
import { makeIndicators } from './helpers'

function news(overrides: Partial<NewsAnalysis> = {}): NewsAnalysis {
  return {
    newsId: 'n1',
    title: '公司中标重大项目',
    content: '签订供货合同',
    publishedAt: '2026-11-04T10:00:00+08:00',
    sourceId: 'sina-news',
    symbols: ['600519'],
    eventType: 'contract',
    sentiment: 'positive',
    confidence: 0.9,
    keywords: ['中标'],
    stage: 'confirmed',
    stageReason: '',
    advice: 'hold',
    adviceReason: '',
    impactWindow: 3,
    ageHours: 2,
    stale: false,
    duplicateCount: 1,
    effectiveTradingDay: '2026-11-04',
    ...overrides,
  }
}

describe('normalizeWeights', () => {
  it('normalizes arbitrary weights to a 100% sum', () => {
    const weights: ScoreWeights = { trend: 10, momentum: 5, volume: 5, position: 5, news: 5 }
    const result = normalizeWeights(weights)
    const sum = Object.values(result).reduce((total, value) => total + value, 0)
    expect(sum).toBeCloseTo(1, 6)
    expect(result.trend).toBeCloseTo(1 / 3, 6)
  })

  it('falls back to equal weights when everything is zero', () => {
    const result = normalizeWeights({ trend: 0, momentum: 0, volume: 0, position: 0, news: 0 })
    expect(Object.values(result).every((value) => Math.abs(value - 0.2) < 1e-9)).toBe(true)
  })
})

describe('scoreNews', () => {
  it('down-weights stale coverage instead of treating it as fresh', () => {
    const fresh = scoreNews([news({ sentiment: 'negative', stage: 'confirmed', stale: false })])
    const stale = scoreNews([news({ sentiment: 'negative', stage: 'confirmed', stale: true })])
    expect(stale.score).toBeGreaterThan(fresh.score)
    expect(stale.detail).toContain('旧闻')
  })

  it('counts merged duplicate coverage in the explanation', () => {
    const result = scoreNews([news({ duplicateCount: 4 })])
    expect(result.detail).toContain('合并 3 条重复报道')
  })
})

describe('scoreStock', () => {
  it('honours custom weights and keeps the total in range', () => {
    const indicators = makeIndicators({ pctChange5d: 6, volumeRatio: 1.5, rangePosition: 0.95 })
    const trend = classifyTrend(indicators)
    const newsScore = scoreNews([])
    const result = scoreStock(trend, indicators, newsScore, [], 2, {
      trend: 100,
      momentum: 0,
      volume: 0,
      position: 0,
      news: 0,
    })
    expect(result.totalScore).toBeCloseTo(trend.score, 5)
    expect(result.breakdown.find((item) => item.key === 'trend')?.weight).toBe(1)
  })

  it('uses the default weights when none are supplied', () => {
    const indicators = makeIndicators()
    const trend = classifyTrend(indicators)
    const result = scoreStock(trend, indicators, scoreNews([]), [], 2)
    const weightSum = result.breakdown.reduce((sum, item) => sum + item.weight, 0)
    expect(weightSum).toBeCloseTo(1, 2)
    expect(result.totalScore).toBeGreaterThanOrEqual(0)
    expect(result.totalScore).toBeLessThanOrEqual(100)
    expect(DEFAULT_SCORE_WEIGHTS.trend).toBeGreaterThan(0)
  })
})
