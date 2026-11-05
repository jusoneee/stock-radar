import { describe, expect, it } from 'vitest'
import { computeIndicators, movingAverage } from '@/analysis/indicators'
import { makeBars } from './helpers'

describe('computeIndicators', () => {
  it('derives moving averages and momentum from an uptrend', () => {
    const bars = makeBars()
    const result = computeIndicators(bars)
    expect(result.ma5).toBeGreaterThan(result.ma10)
    expect(result.ma10).toBeGreaterThan(result.ma20)
    expect(result.lastClose).toBeGreaterThan(result.ma5)
    expect(result.pctChange1d).toBeGreaterThan(0)
    expect(result.pctChange5d).toBeGreaterThan(0)
    expect(result.rangePosition).toBeGreaterThan(0.9)
    expect(result.breakout20).toBe(true)
    expect(result.volumeRatio).toBeGreaterThan(1)
    expect(result.volatility20).toBeGreaterThanOrEqual(0)
  })

  it('handles a flat series without dividing by zero', () => {
    const bars = makeBars(30, 10, 0).map((bar) => ({ ...bar, open: 10, high: 10, low: 10, close: 10, volume: 1000 }))
    const result = computeIndicators(bars)
    expect(result.volumeRatio).toBeCloseTo(1, 2)
    expect(result.rangePosition).toBe(0.5)
    expect(result.pctChange1d).toBe(0)
    expect(result.breakout20).toBe(false)
  })

  it('exposes movingAverage aligned with the input length', () => {
    const bars = makeBars(10, 10, 1)
    const ma = movingAverage(bars, 3)
    expect(ma).toHaveLength(10)
    expect(ma[0]).toBe(10)
    expect(ma[9]).toBeGreaterThan(ma[0]!)
  })
})
