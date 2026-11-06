import { describe, expect, it } from 'vitest'
import { channelAvailability, isChannelAvailable } from '@/adapters/availability'
import { CHANNEL_CATALOG } from '@/adapters/registry'

function byId(id: string) {
  const meta = CHANNEL_CATALOG.find((item) => item.id === id)
  if (!meta) throw new Error(`missing channel ${id}`)
  return meta
}

describe('static deployment channel availability', () => {
  it('keeps CORS-enabled quote feeds available', () => {
    expect(isChannelAvailable(byId('eastmoney-quote'))).toBe(true)
    expect(isChannelAvailable(byId('tencent-quote'))).toBe(true)
  })

  it('marks proxy-only feeds unavailable with a concrete reason', () => {
    for (const id of ['sina-quote', 'sina-news', 'tushare-quote', 'akshare-quote']) {
      const state = channelAvailability(byId(id))
      expect(state.available).toBe(false)
      expect(state.reason).toContain('/api')
    }
  })
})
