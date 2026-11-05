import { describe, expect, it } from 'vitest'
import { classifyTrend } from '@/analysis/trend'
import { makeIndicators } from './helpers'

describe('classifyTrend five-state boundaries', () => {
  it('detects a strong uptrend only with a full bullish stack and volume support', () => {
    const result = classifyTrend(
      makeIndicators({
        lastClose: 12,
        ma5: 11,
        ma10: 10,
        ma20: 9,
        pctChange5d: 5,
        volumeRatio: 1.2,
        rangePosition: 0.95,
      }),
    )
    expect(result.label).toBe('strong-up')
    expect(result.score).toBeGreaterThan(70)
  })

  it('detects a normal uptrend', () => {
    const result = classifyTrend(
      makeIndicators({ lastClose: 11.5, ma5: 11, ma10: 10.5, ma20: 10, pctChange5d: 2 }),
    )
    expect(result.label).toBe('up')
  })

  it('detects a downtrend', () => {
    const result = classifyTrend(
      makeIndicators({ lastClose: 8, ma5: 9, ma10: 9.5, ma20: 10, pctChange5d: -3 }),
    )
    expect(result.label).toBe('down')
  })

  it('detects a pullback above the 20-day average', () => {
    const result = classifyTrend(
      makeIndicators({
        lastClose: 8.9,
        ma5: 9,
        ma10: 10,
        ma20: 9.2,
        pctChange5d: -1,
        rangePosition: 0.3,
      }),
    )
    expect(result.label).toBe('pullback')
  })

  it('falls back to range when averages are glued together', () => {
    const result = classifyTrend(makeIndicators())
    expect(result.label).toBe('range')
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })
})
