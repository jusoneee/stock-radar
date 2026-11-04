import type { Indicators, QuoteBar } from '@/types'

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Indicators are derived only from OHLCV bars, so the same function works for
 * every quote adapter regardless of the upstream vendor.
 */
export function computeIndicators(bars: QuoteBar[]): Indicators {
  const closes = bars.map((bar) => bar.close)
  const volumes = bars.map((bar) => bar.volume)
  const lastBar = bars[bars.length - 1]!
  const prevBar = bars[bars.length - 2] ?? lastBar

  const ma = (period: number) => mean(closes.slice(-period))
  const closeAgo = (ago: number) => closes[Math.max(0, closes.length - 1 - ago)] ?? lastBar.close

  const pctChange1d = (lastBar.close / prevBar.close - 1) * 100
  const pctChange5d = (lastBar.close / closeAgo(5) - 1) * 100

  const prevVolumes = volumes.slice(-6, -1)
  const avgPrevVolume = mean(prevVolumes)
  const volumeRatio = avgPrevVolume > 0 ? lastBar.volume / avgPrevVolume : 1

  const box = bars.slice(-21, -1)
  const high20 = box.length > 0 ? Math.max(...box.map((bar) => bar.high)) : lastBar.high
  const low20 = box.length > 0 ? Math.min(...box.map((bar) => bar.low)) : lastBar.low
  const rangePosition = high20 > low20 ? clamp((lastBar.close - low20) / (high20 - low20), 0, 1) : 0.5
  const breakout20 = lastBar.close > high20

  const recentReturns: number[] = []
  for (let i = Math.max(1, bars.length - 20); i < bars.length; i += 1) {
    recentReturns.push((bars[i]!.close / bars[i - 1]!.close - 1) * 100)
  }
  const avgReturn = mean(recentReturns)
  const variance = mean(recentReturns.map((value) => (value - avgReturn) ** 2))
  const volatility20 = Math.sqrt(variance)

  const avgAmount = mean(bars.slice(-5).map((bar) => bar.close * bar.volume))

  return {
    lastClose: round(lastBar.close, 2),
    ma5: round(ma(5), 2),
    ma10: round(ma(10), 2),
    ma20: round(ma(20), 2),
    ma60: round(ma(Math.min(60, bars.length)), 2),
    pctChange1d: round(pctChange1d, 2),
    pctChange5d: round(pctChange5d, 2),
    volumeRatio: round(volumeRatio, 2),
    rangePosition: round(rangePosition, 3),
    breakout20,
    volatility20: round(volatility20, 2),
    avgAmount: round(avgAmount, 0),
  }
}

/** Simple moving average helper exposed for charts and future indicators. */
export function movingAverage(bars: QuoteBar[], period: number): number[] {
  return bars.map((_, index) => {
    const start = Math.max(0, index - period + 1)
    const window = bars.slice(start, index + 1).map((bar) => bar.close)
    return round(mean(window), 2)
  })
}
