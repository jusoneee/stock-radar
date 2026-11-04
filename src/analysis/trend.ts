import type { Indicators, TrendLabel, TrendResult } from '@/types'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Rule based trend classifier. Order of checks is intentional: stronger and
 * riskier states are resolved before the neutral fallback.
 */
export function classifyTrend(indicators: Indicators): TrendResult {
  const { lastClose, ma5, ma10, ma20, pctChange5d, volumeRatio, rangePosition } = indicators
  const reasons: string[] = []

  let label: TrendLabel = 'range'
  if (lastClose > ma5 && ma5 > ma10 && ma10 > ma20 && pctChange5d > 4 && volumeRatio >= 0.9) {
    label = 'strong-up'
    reasons.push('收盘价站上 5/10/20 日均线，多头排列', `5 日累计涨幅 ${pctChange5d}%，量能 ${volumeRatio} 倍`)
  } else if (ma5 > ma20 && lastClose > ma10 && pctChange5d > 1) {
    label = 'up'
    reasons.push('短期均线上穿中期均线', `5 日累计上涨 ${pctChange5d}%`)
  } else if (lastClose < ma5 && ma5 < ma20 && pctChange5d < -1.5) {
    label = 'down'
    reasons.push('均线空头排列，价格持续走弱', `5 日累计下跌 ${Math.abs(pctChange5d)}%`)
  } else if (ma5 < ma10 && lastClose < ma5 && lastClose >= ma20 * 0.95 && rangePosition > 0.25) {
    label = 'pullback'
    reasons.push('价格低于 5 日均线，但仍在 20 日均线附近', `区间位置 ${(rangePosition * 100).toFixed(0)}%，属回调范畴`)
  } else {
    label = 'range'
    reasons.push('均线粘合，未形成明确方向', `区间位置 ${(rangePosition * 100).toFixed(0)}%`)
  }

  const structureScore =
    (ma5 > ma10 ? 8 : 0) + (ma10 > ma20 ? 9 : 0) + (lastClose > ma20 ? 8 : 0)
  const momentumScore = clamp(10 + pctChange5d * 2.2, 0, 25)
  const volumeScore = clamp((volumeRatio - 0.7) * 18, 0, 18)
  const positionScore = rangePosition * 14
  const stabilityScore = clamp(16 - indicators.volatility20 * 2.2, 0, 16)
  const score = Math.round(clamp(structureScore + momentumScore + volumeScore + positionScore + stabilityScore, 0, 100))

  return { label, score, reasons }
}
