import type { ActionAdvice, EventStage, Sentiment } from '@/types'

export interface AdviceResult {
  advice: ActionAdvice
  reason: string
  /** Observation window in trading days. */
  impactWindow: number
}

interface AdviceRule {
  advice: ActionAdvice
  reason: string
  impactWindow: number
}

const MATRIX: Record<Sentiment, Record<EventStage, AdviceRule>> = {
  positive: {
    fermenting: {
      advice: 'watch-breakout',
      reason: '利好仍在发酵且未落地，等待放量突破或事件确认后再介入',
      impactWindow: 3,
    },
    confirmed: {
      advice: 'buy-on-dip',
      reason: '利好已确认，可等待回踩重要均线时分批参与，避免追高',
      impactWindow: 5,
    },
    fading: {
      advice: 'hold',
      reason: '利好已部分兑现，持有者考虑逢高兑现，不宜再追高',
      impactWindow: 2,
    },
  },
  neutral: {
    fermenting: { advice: 'hold', reason: '信息中性，方向不明，等待更多信号', impactWindow: 3 },
    confirmed: { advice: 'hold', reason: '信息中性，对价格趋势影响有限', impactWindow: 3 },
    fading: { advice: 'hold', reason: '中性事件影响消退，按趋势自行决策', impactWindow: 2 },
  },
  negative: {
    fermenting: {
      advice: 'avoid',
      reason: '利空尚未被证实，先行回避，等待澄清或确认',
      impactWindow: 3,
    },
    confirmed: {
      advice: 'reduce',
      reason: '利空已确认，建议降低仓位或设置明确止损',
      impactWindow: 5,
    },
    fading: {
      advice: 'hold',
      reason: '利空情绪开始消化，观察能否止跌后再做决定',
      impactWindow: 3,
    },
  },
}

export function buildAdvice(sentiment: Sentiment, stage: EventStage, confidence: number): AdviceResult {
  const rule = MATRIX[sentiment][stage]
  const confidenceNote = confidence < 0.5 ? '（事件识别置信度偏低，建议人工复核原文）' : ''
  return { ...rule, reason: rule.reason + confidenceNote }
}
