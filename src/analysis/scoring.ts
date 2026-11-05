import type { Indicators, NewsAnalysis, ScoreBreakdownItem, ScoreWeights, TrendResult } from '@/types'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/** Default factor weights; the settings store can override them at runtime. */
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  trend: 0.4,
  momentum: 0.15,
  volume: 0.15,
  position: 0.15,
  news: 0.15,
}

const WEIGHT_LABELS: Record<keyof ScoreWeights, string> = {
  trend: '趋势结构',
  momentum: '动量强度',
  volume: '量能配合',
  position: '区间位置',
  news: '事件驱动',
}

/** Normalize user weights to sum to 1; all-zero input falls back to equal weights. */
export function normalizeWeights(weights: ScoreWeights): ScoreWeights {
  const values = Object.values(weights).map((value) => Math.max(0, value))
  const total = values.reduce((sum, value) => sum + value, 0)
  if (total <= 0) {
    const share = 1 / values.length
    return { trend: share, momentum: share, volume: share, position: share, news: share }
  }
  return {
    trend: weights.trend / total,
    momentum: weights.momentum / total,
    volume: weights.volume / total,
    position: weights.position / total,
    news: weights.news / total,
  }
}

const STAGE_ADJUST: Record<NewsAnalysis['sentiment'], Record<NewsAnalysis['stage'], number>> = {
  positive: { fermenting: 12, confirmed: 25, fading: -8 },
  neutral: { fermenting: 0, confirmed: 0, fading: 0 },
  negative: { fermenting: -18, confirmed: -32, fading: -8 },
}

export interface NewsScore {
  score: number
  detail: string
}

export function scoreNews(news: NewsAnalysis[]): NewsScore {
  if (news.length === 0) {
    return { score: 50, detail: '未匹配到相关新闻事件，按中性处理' }
  }
  let adjustment = 0
  let staleCount = 0
  let duplicateCount = 0
  for (const item of news) {
    const base = STAGE_ADJUST[item.sentiment][item.stage]
    // Old / recycled coverage must not be treated with the same weight as fresh news.
    const freshness = item.stale ? 0.35 : 1
    adjustment += base * (0.6 + item.confidence * 0.4) * freshness
    if (item.stale) staleCount += 1
    duplicateCount += Math.max(0, item.duplicateCount - 1)
  }
  const score = clamp(50 + adjustment, 0, 100)
  const positive = news.filter((item) => item.sentiment === 'positive').length
  const negative = news.filter((item) => item.sentiment === 'negative').length
  const staleNote = staleCount > 0 ? `，其中 ${staleCount} 条为旧闻已降权` : ''
  const duplicateNote = duplicateCount > 0 ? `，合并 ${duplicateCount} 条重复报道` : ''
  return {
    score: round(score),
    detail: `${news.length} 条相关事件（利好 ${positive} / 利空 ${negative}）${staleNote}${duplicateNote}，事件周期加权后 ${score >= 50 ? '偏正面' : '偏负面'}`,
  }
}

export interface ScoreResult {
  totalScore: number
  breakdown: ScoreBreakdownItem[]
  entryAdvice: string
  riskFlags: string[]
}

function entryAdviceFor(trend: TrendResult, news: NewsScore, hasNews: boolean): string {
  const positiveNews = news.score >= 62
  const negativeNews = news.score <= 38
  switch (trend.label) {
    case 'strong-up':
      if (negativeNews) return '趋势强但事件面转弱，控制仓位，跌破 5 日线先减仓'
      if (positiveNews && hasNews) return '趋势与事件共振，回踩 5 日均线不破可分批参与'
      return '强势突破形态，回踩 5 日线可跟进，注意追高风险'
    case 'up':
      if (positiveNews && hasNews) return '上行趋势叠加事件催化，突破前高可小仓位跟进'
      if (negativeNews) return '上行趋势中出现利空，先观察量价是否走弱再决定'
      return '温和上行，等待缩量回踩 10 日线附近的低吸机会'
    case 'range':
      if (positiveNews && hasNews) return '事件仍在发酵，等待放量突破区间上沿再介入'
      if (negativeNews) return '区间震荡且事件偏空，暂时观望'
      return '区间震荡，靠近区间下沿低吸、上沿减仓，等待方向选择'
    case 'pullback':
      if (negativeNews) return '回调叠加利空，等待止跌信号，不宜提前抄底'
      return '高位回调未破中期均线，等待缩量企稳后再介入'
    case 'down':
      return '下降趋势中不主动参与，等待右侧放量企稳信号'
  }
}

export function scoreStock(
  trend: TrendResult,
  indicators: Indicators,
  news: NewsScore,
  newsItems: NewsAnalysis[],
  sourceCount: number,
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
): ScoreResult {
  const momentumScore = clamp(50 + indicators.pctChange5d * 4, 0, 100)
  const volumeScore = clamp(indicators.volumeRatio * 60, 0, 100)
  const positionScore = clamp(indicators.rangePosition * 100, 0, 100)
  const normalized = normalizeWeights(weights)

  const breakdown: ScoreBreakdownItem[] = [
    {
      key: 'trend',
      label: WEIGHT_LABELS.trend,
      score: trend.score,
      weight: round(normalized.trend * 100) / 100,
      detail: trend.reasons.join('；'),
    },
    {
      key: 'momentum',
      label: WEIGHT_LABELS.momentum,
      score: round(momentumScore),
      weight: round(normalized.momentum * 100) / 100,
      detail: `5 日涨跌 ${indicators.pctChange5d}%，1 日涨跌 ${indicators.pctChange1d}%`,
    },
    {
      key: 'volume',
      label: WEIGHT_LABELS.volume,
      score: round(volumeScore),
      weight: round(normalized.volume * 100) / 100,
      detail: `量比 ${indicators.volumeRatio} 倍（近 5 日均量基准）`,
    },
    {
      key: 'position',
      label: WEIGHT_LABELS.position,
      score: round(positionScore),
      weight: round(normalized.position * 100) / 100,
      detail: indicators.breakout20
        ? '收盘价突破 20 日区间上沿'
        : `位于 20 日区间 ${(indicators.rangePosition * 100).toFixed(0)}% 分位`,
    },
    {
      key: 'news',
      label: WEIGHT_LABELS.news,
      score: round(news.score),
      weight: round(normalized.news * 100) / 100,
      detail: news.detail,
    },
  ]

  const totalScore = round(breakdown.reduce((sum, item) => sum + item.score * item.weight, 0))

  const riskFlags: string[] = []
  if (indicators.volumeRatio < 0.9) riskFlags.push('量能低于近期均值，突破有效性待验证')
  if (indicators.rangePosition > 0.95) riskFlags.push('价格贴近 20 日区间上沿，追高风险偏高')
  if (indicators.volatility20 > 3.5) riskFlags.push('近 20 日波动率偏高，需放宽止损区间')
  if (sourceCount < 2) riskFlags.push('仅单一数据源覆盖，数据可靠性待交叉校验')
  if (newsItems.some((item) => item.sentiment === 'negative' && item.stage === 'confirmed')) {
    riskFlags.push('存在已确认的利空事件，需关注后续影响')
  }
  if (newsItems.some((item) => item.stale)) {
    riskFlags.push('部分关联事件为旧闻或重复报道，已在评分中降权')
  }

  return {
    totalScore,
    breakdown,
    entryAdvice: entryAdviceFor(trend, news, newsItems.length > 0),
    riskFlags,
  }
}
