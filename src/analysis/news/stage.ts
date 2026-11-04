import type { RawNewsItem, Sentiment } from '@/types'

const CONFIRM_CUES = ['公告', '官宣', '正式', '签约', '落地', '完成', '披露', '确认', '已投产', '中标', '发布']
const RUMOR_CUES = ['传闻', '据悉', '或', '拟', '有望', '消息人士', '讨论', '预期', '将', '正在']
const FADE_CUES = ['不及预期', '回落', '取消', '终止', '澄清', '辟谣', '下调', '衰退', '消化', '兑现']

function hasCue(text: string, cues: string[]): string | undefined {
  return cues.find((cue) => text.includes(cue))
}

/** Hours elapsed since publication, never negative. */
export function hoursSince(publishedAt: string, now: Date): number {
  return Math.max(0, (now.getTime() - new Date(publishedAt).getTime()) / 3_600_000)
}

export interface StageResult {
  stage: 'fermenting' | 'confirmed' | 'fading'
  reason: string
}

/**
 * Event lifecycle: 发酵（消息扩散但未落地）-> 确认（正式公告/签约）-> 衰退（兑现或辟谣）。
 * Stage is driven by explicit cues first, then by elapsed time.
 */
export function detectStage(item: RawNewsItem, sentiment: Sentiment, now: Date): StageResult {
  const text = `${item.title} ${item.content}`
  const hours = hoursSince(item.publishedAt, now)
  const confirmCue = hasCue(text, CONFIRM_CUES)
  const rumorCue = hasCue(text, RUMOR_CUES)
  const fadeCue = hasCue(text, FADE_CUES)

  if (fadeCue && hours >= 8) {
    return {
      stage: 'fading',
      reason: `出现「${fadeCue}」等兑现/反转信号，发布已约 ${Math.round(hours)} 小时，事件进入衰退期`,
    }
  }
  if (confirmCue && hours >= 4) {
    return {
      stage: 'confirmed',
      reason: `出现「${confirmCue}」等落地信号，事件已被官方确认，进入确认期`,
    }
  }
  if (rumorCue && hours < 36) {
    return {
      stage: 'fermenting',
      reason: `含「${rumorCue}」等待证实表述，消息仍在发酵`,
    }
  }
  if (hours < 8) {
    return {
      stage: 'fermenting',
      reason: `发布仅 ${Math.max(1, Math.round(hours))} 小时，尚未看到落地信息，处于发酵期`,
    }
  }
  if (hours > 72) {
    return {
      stage: 'fading',
      reason: `发布已超过 ${Math.round(hours / 24)} 天，边际影响衰减`,
    }
  }
  if (sentiment === 'negative') {
    return {
      stage: 'confirmed',
      reason: '利空事实已披露，影响正在释放',
    }
  }
  return {
    stage: 'confirmed',
    reason: `信息发布约 ${Math.round(hours)} 小时且无反转信号，视为已确认`,
  }
}
