import type { QuoteBar } from '@/types'

/**
 * Explainable statistical extrapolation for daily closes.
 *
 * This module is intentionally isolated from the scoring engine: forecasts are
 * an optional, clearly-labelled statistical view, not part of the stock score.
 * Method: log-linear regression drift + EMA momentum + volatility cone, with a
 * mild mean-reversion pull. Validation uses walk-forward (rolling origin) tests
 * so the reported error is out-of-sample for the recent window.
 *
 * It never claims to predict the market: callers must show `disclaimer`.
 */

export type ForecastStatus = 'ok' | 'insufficient'

export interface ForecastHorizon {
  /** Trading days ahead. */
  days: number
  /** Point estimate of the close on that day. */
  central: number
  /** Central estimate change vs the last close, in percent. */
  changePct: number
  /** 80% interval bounds (normal approximation on log returns). */
  lower: number
  upper: number
  /** Probability that the close is above the last close, 0 - 1. */
  upProbability: number
}

export interface WalkForwardResult {
  days: number
  /** Number of rolling origins that had a realised value. */
  windows: number
  /** Mean absolute error, in price units. */
  mae: number
  /** Mean absolute percentage error, in percent. */
  mape: number
  /** Share of origins whose predicted direction matched the realised one, 0 - 1. */
  directionHitRate: number
}

export interface ForecastResult {
  status: ForecastStatus
  /** Why the forecast is refused; empty when status is `ok`. */
  reason: string
  /** Human-readable method label shown in the UI. */
  method: string
  sampleSize: number
  lastClose: number
  lastDate: string
  horizons: ForecastHorizon[]
  validation: WalkForwardResult[]
  /** Regression slope in percent per day. */
  slopePctPerDay: number
  /** 5-day momentum in percent. */
  momentumPct: number
  /** Daily log-return volatility used by the cone, in percent. */
  volatilityPct: number
  /** Z-score of the last close against its 20-day mean. */
  meanReversionZ: number
  /** Confidence level of the interval (0.8). */
  ciLevel: number
  disclaimer: string
}

export interface ForecastOptions {
  /** Horizons in trading days. */
  horizons?: number[]
  /** Bars used by the regression; older bars are ignored. */
  lookback?: number
  /** Minimum bars required before any output is produced. */
  minSamples?: number
  /** Rolling origins used by the walk-forward validation. */
  validationWindows?: number
}

export const FORECAST_DISCLAIMER =
  '基于历史统计外推，不构成预测保证，也不构成投资建议。区间与方向概率均来自近期波动率与趋势的统计假设，实际走势可能显著偏离。'

export const DEFAULT_HORIZONS = [5, 10, 20]

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function std(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  const variance = mean(values.map((value) => (value - avg) ** 2))
  return Math.sqrt(variance)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Standard normal CDF via the Abramowitz-Stegun erf approximation. */
function normalCdf(value: number): number {
  const sign = value < 0 ? -1 : 1
  const x = Math.abs(value) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x)
  return 0.5 * (1 + sign * erf)
}

function logReturns(closes: number[]): number[] {
  const returns: number[] = []
  for (let index = 1; index < closes.length; index += 1) {
    const previous = closes[index - 1]!
    const current = closes[index]!
    if (previous > 0 && current > 0) returns.push(Math.log(current / previous))
  }
  return returns
}

function ema(values: number[], period: number): number[] {
  const alpha = 2 / (period + 1)
  const result: number[] = []
  let previous = values[0] ?? 0
  values.forEach((value, index) => {
    previous = index === 0 ? value : alpha * value + (1 - alpha) * previous
    result.push(previous)
  })
  return result
}

/** Least-squares slope of log(close) over time, expressed as a daily log return. */
function regressionSlope(closes: number[]): number {
  const n = closes.length
  if (n < 2) return 0
  const ys = closes.map((close) => Math.log(Math.max(close, 0.01)))
  const xMean = (n - 1) / 2
  const yMean = mean(ys)
  let numerator = 0
  let denominator = 0
  for (let index = 0; index < n; index += 1) {
    numerator += (index - xMean) * (ys[index]! - yMean)
    denominator += (index - xMean) ** 2
  }
  return denominator > 0 ? numerator / denominator : 0
}

interface CoreEstimate {
  drift: number
  sigma: number
  zScore: number
  slope: number
  momentum: number
  volatility: number
}

/** Fit the model on a slice of bars ending at the origin. */
function fitModel(bars: QuoteBar[], lookback: number): CoreEstimate | null {
  const closes = bars.map((bar) => bar.close)
  if (closes.length < 30) return null
  const window = closes.slice(-lookback)
  const returns = logReturns(window)
  if (returns.length < 20) return null

  const slope = regressionSlope(window)
  const fast = ema(window, 12).at(-1) ?? 0
  const slow = ema(window, 26).at(-1) ?? 0
  const emaGap = slow > 0 ? Math.log(fast / slow) : 0
  const momentum5 = window.length >= 6 ? Math.log(window.at(-1)! / window.at(-6)!) : 0

  const recentReturns = returns.slice(-20)
  const longReturns = returns
  const sigma = Math.sqrt(0.6 * std(recentReturns) ** 2 + 0.4 * std(longReturns) ** 2) || 0.0001

  const ma20 = mean(window.slice(-20))
  const sd20 = std(window.slice(-20).map((value) => Math.log(Math.max(value, 0.01))))
  const zScore = sd20 > 0 ? (Math.log(closes.at(-1)! / ma20) || 0) / sd20 : 0

  // Blend trend, short momentum, EMA structure and a mild mean-reversion pull.
  // Weights are deliberately conservative so one strong week cannot dominate.
  const meanReversion = clamp(zScore, -3, 3) * sigma / Math.sqrt(20)
  const drift = slope * 0.55 + (momentum5 / 5) * 0.15 + (emaGap / 10) * 0.15 - meanReversion * 0.15

  return {
    drift,
    sigma,
    zScore,
    slope,
    momentum: momentum5,
    volatility: sigma,
  }
}

function project(closes: number[], model: CoreEstimate, days: number, ciLevel: number): ForecastHorizon {
  const lastClose = closes.at(-1)!
  const central = lastClose * Math.exp(model.drift * days)
  const sigmaH = model.sigma * Math.sqrt(days)
  const z = ciLevel >= 0.95 ? 1.96 : ciLevel >= 0.9 ? 1.645 : 1.2816
  const upProbability = clamp(normalCdf(model.drift * Math.sqrt(days) / model.sigma), 0.02, 0.98)
  return {
    days,
    central: Math.round(central * 100) / 100,
    changePct: Math.round((central / lastClose - 1) * 10_000) / 100,
    lower: Math.round(lastClose * Math.exp(model.drift * days - z * sigmaH) * 100) / 100,
    upper: Math.round(lastClose * Math.exp(model.drift * days + z * sigmaH) * 100) / 100,
    upProbability: Math.round(upProbability * 1_000) / 1_000,
  }
}

/** Predict from a historical slice so validation never sees the future. */
function predictFrom(bars: QuoteBar[], days: number, lookback: number): number | null {
  const model = fitModel(bars, lookback)
  if (!model) return null
  return bars.at(-1)!.close * Math.exp(model.drift * days)
}

function walkForward(
  bars: QuoteBar[],
  days: number,
  lookback: number,
  windows: number,
): WalkForwardResult {
  const errors: number[] = []
  const percentageErrors: number[] = []
  let hits = 0
  let total = 0
  const firstOrigin = bars.length - days - windows

  for (let origin = Math.max(29, firstOrigin); origin < bars.length - days; origin += 1) {
    const history = bars.slice(0, origin + 1)
    const predicted = predictFrom(history, days, lookback)
    const actual = bars[origin + days]!.close
    if (predicted === null || !Number.isFinite(predicted) || actual <= 0) continue
    const last = history.at(-1)!.close
    errors.push(Math.abs(predicted - actual))
    percentageErrors.push(Math.abs(predicted / actual - 1) * 100)
    const predictedUp = predicted >= last
    const actualUp = actual >= last
    if (predictedUp === actualUp) hits += 1
    total += 1
  }

  return {
    days,
    windows: total,
    mae: total > 0 ? Math.round(mean(errors) * 100) / 100 : 0,
    mape: total > 0 ? Math.round(mean(percentageErrors) * 100) / 100 : 0,
    directionHitRate: total > 0 ? Math.round((hits / total) * 1_000) / 1_000 : 0,
  }
}

export function forecastBars(bars: QuoteBar[], options: ForecastOptions = {}): ForecastResult {
  const horizons = options.horizons ?? DEFAULT_HORIZONS
  const lookback = options.lookback ?? 60
  const minSamples = options.minSamples ?? 60
  const validationWindows = options.validationWindows ?? 20
  const ciLevel = 0.8
  // Upstream adapters are not guaranteed to be ordered: sort by date and drop
  // duplicate dates so regression / walk-forward never reads out of sequence.
  const byDate = new Map<string, QuoteBar>()
  for (const bar of bars) {
    if (Number.isFinite(bar.close) && bar.close > 0) byDate.set(bar.date, bar)
  }
  const usable = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  const last = usable.at(-1)

  if (!last) {
    return emptyResult('数据为空，无法计算预测。', 0, ciLevel, horizons)
  }
  if (usable.length < minSamples) {
    return emptyResult(
      `有效历史样本仅 ${usable.length} 个交易日，至少需要 ${minSamples} 个交易日；样本不足时不做外推，避免虚假精度。`,
      usable.length,
      ciLevel,
      horizons,
      last,
    )
  }

  const closes = usable.map((bar) => bar.close)
  const model = fitModel(usable, lookback)
  if (!model) {
    return emptyResult('历史数据不足或波动异常，模型无法拟合。', usable.length, ciLevel, horizons, last)
  }

  const projections = horizons.map((days) => project(closes, model, days, ciLevel))
  const validation = horizons.map((days) => walkForward(usable, days, lookback, validationWindows))

  return {
    status: 'ok',
    reason: '',
    method: '对数价格线性回归（55%）+ 5 日动量（15%）+ EMA12/26 差（15%）+ 20 日均值回归修正（15%）；波动率取 20/60 日混合标准差，区间为 80% 正态近似。',
    sampleSize: usable.length,
    lastClose: Math.round(last.close * 100) / 100,
    lastDate: last.date,
    horizons: projections,
    validation,
    slopePctPerDay: Math.round(model.slope * 10_000) / 100,
    momentumPct: Math.round(model.momentum * 10_000) / 100,
    volatilityPct: Math.round(model.volatility * 10_000) / 100,
    meanReversionZ: Math.round(model.zScore * 100) / 100,
    ciLevel,
    disclaimer: FORECAST_DISCLAIMER,
  }
}

function emptyResult(
  reason: string,
  sampleSize: number,
  ciLevel: number,
  horizons: number[],
  last?: QuoteBar,
): ForecastResult {
  return {
    status: 'insufficient',
    reason,
    method: '样本不足，未执行外推。',
    sampleSize,
    lastClose: last ? last.close : 0,
    lastDate: last?.date ?? '',
    horizons: [],
    validation: horizons.map((days) => ({ days, windows: 0, mae: 0, mape: 0, directionHitRate: 0 })),
    slopePctPerDay: 0,
    momentumPct: 0,
    volatilityPct: 0,
    meanReversionZ: 0,
    ciLevel,
    disclaimer: FORECAST_DISCLAIMER,
  }
}
