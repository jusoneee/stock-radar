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
})
