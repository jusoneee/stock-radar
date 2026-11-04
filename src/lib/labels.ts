import type { ActionAdvice, EventStage, EventType, Sentiment, TrendLabel } from '@/types'

export type Tone = 'up' | 'down' | 'neutral' | 'warn'

interface LabelValue {
  text: string
  tone: Tone
}

export const trendLabels: Record<TrendLabel, LabelValue> = {
  'strong-up': { text: '强势上行', tone: 'up' },
  up: { text: '温和上行', tone: 'up' },
  range: { text: '区间震荡', tone: 'neutral' },
  pullback: { text: '高位回调', tone: 'warn' },
  down: { text: '弱势下行', tone: 'down' },
}

export const sentimentLabels: Record<Sentiment, LabelValue> = {
  positive: { text: '利好', tone: 'up' },
  neutral: { text: '中性', tone: 'neutral' },
  negative: { text: '利空', tone: 'down' },
}

export const stageLabels: Record<EventStage, LabelValue> = {
  fermenting: { text: '发酵期', tone: 'warn' },
  confirmed: { text: '确认期', tone: 'up' },
  fading: { text: '衰退期', tone: 'neutral' },
}

export const eventTypeLabels: Record<EventType, string> = {
  policy: '政策监管',
  earnings: '业绩财报',
  contract: '订单合同',
  mna: '并购重组',
  product: '产品技术',
  'supply-chain': '产业链',
  risk: '风险事件',
  other: '其他',
}

export const adviceLabels: Record<ActionAdvice, LabelValue> = {
  'buy-on-dip': { text: '回踩参与', tone: 'up' },
  'watch-breakout': { text: '等待确认', tone: 'warn' },
  hold: { text: '持有观察', tone: 'neutral' },
  reduce: { text: '减仓兑现', tone: 'warn' },
  avoid: { text: '回避观望', tone: 'down' },
}

export function toneClass(tone: Tone): string {
  return `tone-${tone}`
}
