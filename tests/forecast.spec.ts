import { describe, expect, it } from 'vitest'
import { forecastBars, FORECAST_DISCLAIMER } from '@/analysis/forecast'
import { makeBars } from './helpers'

function series(count: number, start: number, step: number): ReturnType<typeof makeBars> {
  return makeBars(count, start, step)
}

describe('statistical forecast', () => {
  it('refuses to extrapolate when history is too short', () => {
    const result = forecastBars(series(30, 10, 0.1))
    expect(result.status).toBe('insufficient')
    expect(result.reason).toContain('样本')
    expect(result.horizons).toHaveLength(0)
    expect(result.disclaimer).toBe(FORECAST_DISCLAIMER)
  })

  it('leans upward on a steady uptrend with a confidence cone', () => {
    const result = forecastBars(series(120, 10, 0.12))
    expect(result.status).toBe('ok')
    const five = result.horizons.find((item) => item.days === 5)!
    expect(five.upProbability).toBeGreaterThan(0.5)
    expect(five.central).toBeGreaterThan(result.lastClose)
    expect(five.lower).toBeLessThan(five.central)
    expect(five.upper).toBeGreaterThan(five.central)
    expect(five.changePct).toBeGreaterThan(0)
  })

  it('leans downward on a steady downtrend', () => {
    const result = forecastBars(series(120, 30, -0.2))
    expect(result.status).toBe('ok')
    const five = result.horizons.find((item) => item.days === 5)!
    expect(five.upProbability).toBeLessThan(0.5)
    expect(five.changePct).toBeLessThan(0)
  })

  it('reports walk-forward validation for every horizon', () => {
    const result = forecastBars(series(160, 8, 0.1))
    expect(result.validation).toHaveLength(3)
    for (const item of result.validation) {
      expect(item.windows).toBeGreaterThan(0)
      expect(item.mape).toBeGreaterThanOrEqual(0)
      expect(item.directionHitRate).toBeGreaterThanOrEqual(0)
      expect(item.directionHitRate).toBeLessThanOrEqual(1)
    }
    const five = result.validation.find((item) => item.days === 5)!
    // A deterministic uptrend should be modelled reasonably well.
    expect(five.mape).toBeLessThan(5)
    expect(five.directionHitRate).toBeGreaterThan(0.8)
  })

  it('keeps probabilities inside a sane band on a flat series', () => {
    const flat = series(120, 20, 0).map((bar) => ({ ...bar, open: 20, high: 20.4, low: 19.6 }))
    const result = forecastBars(flat)
    expect(result.status).toBe('ok')
    for (const item of result.horizons) {
      expect(item.upProbability).toBeGreaterThan(0.3)
      expect(item.upProbability).toBeLessThan(0.7)
      expect(item.upper).toBeGreaterThanOrEqual(item.lower)
    }
  })

  it('is insensitive to input order and duplicate dates', () => {
    const ordered = series(120, 10, 0.12)
    const shuffled = [...ordered].sort(() => Math.random() - 0.5)
    const withDuplicates = [...shuffled, ...shuffled.slice(0, 5)]
    const base = forecastBars(ordered)
    expect(forecastBars(shuffled)).toEqual(base)
    expect(forecastBars(withDuplicates)).toEqual(base)
    expect(base.sampleSize).toBe(120)
  })

  it('does not leak the future: a post-trend crash lowers walk-forward direction accuracy', () => {
    const rising = series(140, 10, 0.1)
    const crash = rising.map((bar, index) =>
      index < 120 ? bar : { ...bar, close: 22 - (index - 119) * 0.6, open: 22 - (index - 119) * 0.6 },
    )
    const up = forecastBars(rising)
    const after = forecastBars(crash)
    const upHit = up.validation.find((item) => item.days === 5)!.directionHitRate
    const crashHit = after.validation.find((item) => item.days === 5)!.directionHitRate
    // A model that peeked at the crash would flip direction and keep a high hit rate.
    expect(upHit).toBeGreaterThan(0.8)
    expect(crashHit).toBeLessThan(0.6)
  })
})
