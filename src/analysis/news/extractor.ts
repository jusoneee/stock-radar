import type { EventType, RawNewsItem, Sentiment } from '@/types'

interface TypeRule {
  type: EventType
  keywords: string[]
}

const TYPE_RULES: TypeRule[] = [
  { type: 'policy', keywords: ['政策', '监管', '降准', '降息', '补贴', '税', '试点', '指导意见', '中长期资金', '支持'] },
  { type: 'earnings', keywords: ['业绩', '财报', '净利润', '营收', '销量', '产销', '预增', '快报', '同比增长'] },
  { type: 'contract', keywords: ['订单', '合同', '中标', '签约', '供货', '采购', '交付'] },
  { type: 'mna', keywords: ['并购', '重组', '收购', '参股', '股权转让', '回购'] },
  { type: 'product', keywords: ['新品', '发布', '投产', '量产', '技术', '研发', '专利', '产能'] },
  { type: 'supply-chain', keywords: ['价格', '涨价', '提价', '库存', '上游', '下游', '原材料', '碳酸锂', '铜价', '批价'] },
  { type: 'risk', keywords: ['处罚', '立案', '违规', '退市', '减持', '诉讼', '制裁', '限制', '召回', '停产', '不良率', '不及预期', '澄清', '辟谣', '风险'] },
]

const POSITIVE_KEYWORDS = [
  '增长', '上调', '中标', '签约', '创新高', '超预期', '回购', '补贴', '降准', '受益', '回暖',
  '改善', '突破', '确定性强', '预增', '投产', '量产', '支持', '稳定', '修复', '改善', '完成',
]

const NEGATIVE_KEYWORDS = [
  '下滑', '下调', '不及预期', '处罚', '立案', '违规', '退市', '减持', '制裁', '限制',
  '召回', '停产', '亏损', '不良率', '澄清', '辟谣', '取消', '终止', '高企', '压力',
  '回落', '风险', '下降',
]

export interface ExtractionResult {
  eventType: EventType
  sentiment: Sentiment
  confidence: number
  keywords: string[]
}

function countHits(text: string, keywords: string[], weight: number): { hits: string[]; score: number } {
  const hits: string[] = []
  let score = 0
  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      hits.push(keyword)
      score += weight
    }
  }
  return { hits, score }
}

/**
 * Rule based event extraction. Kept deterministic and dependency free so the
 * framework can run offline; a real deployment would swap in an NER/LLM step
 * behind the same return shape.
 */
export function extractEvent(item: RawNewsItem): ExtractionResult {
  const title = item.title
  const body = item.content
  const keywords = new Set<string>()

  let bestType: EventType = 'other'
  let bestScore = 0
  for (const rule of TYPE_RULES) {
    const titleHits = countHits(title, rule.keywords, 2)
    const bodyHits = countHits(body, rule.keywords, 1)
    titleHits.hits.forEach((hit) => keywords.add(hit))
    bodyHits.hits.forEach((hit) => keywords.add(hit))
    const score = titleHits.score + bodyHits.score
    if (score > bestScore) {
      bestScore = score
      bestType = rule.type
    }
  }

  const positive = countHits(title, POSITIVE_KEYWORDS, 2).score + countHits(body, POSITIVE_KEYWORDS, 1).score
  const negative = countHits(title, NEGATIVE_KEYWORDS, 2).score + countHits(body, NEGATIVE_KEYWORDS, 1).score
  const positiveHits = countHits(title + body, POSITIVE_KEYWORDS, 1).hits
  const negativeHits = countHits(title + body, NEGATIVE_KEYWORDS, 1).hits
  positiveHits.forEach((hit) => keywords.add(hit))
  negativeHits.forEach((hit) => keywords.add(hit))

  let sentiment: Sentiment = 'neutral'
  if (positive > negative * 1.15) sentiment = 'positive'
  else if (negative > positive * 1.15) sentiment = 'negative'

  const matched = keywords.size
  const divergence = Math.abs(positive - negative)
  const confidence = Math.round(Math.min(0.95, 0.35 + matched * 0.08 + (divergence >= 3 ? 0.1 : 0)) * 100) / 100

  return { eventType: bestType, sentiment, confidence, keywords: Array.from(keywords).slice(0, 8) }
}
