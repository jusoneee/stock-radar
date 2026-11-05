import { describe, expect, it } from 'vitest'
import {
  effectiveTradingDay,
  getTradingStatus,
  latestTradingDay,
  nextTradingDay,
  isTradingDay,
} from '@/lib/trading-calendar'

describe('trading calendar', () => {
  it('maps a weekend publication to the next trading day', () => {
    // 2026-11-01 is a Sunday.
    expect(effectiveTradingDay('2026-11-01T10:00:00+08:00')).toBe('2026-11-02')
  })

  it('maps a post-close publication to the next trading day', () => {
    expect(effectiveTradingDay('2026-11-05T16:30:00+08:00')).toBe('2026-11-06')
  })

  it('keeps an in-session publication on the same day', () => {
    expect(effectiveTradingDay('2026-11-05T10:00:00+08:00')).toBe('2026-11-05')
  })

  it('skips statutory holidays', () => {
    // 2026-10-01 is National Day and a full-day closure.
    expect(nextTradingDay(new Date('2026-09-30T03:00:00Z'))).toBe('2026-10-08')
  })

  it('reports a consistent phase and latest trading day', () => {
    const status = getTradingStatus(new Date('2026-11-05T04:00:00Z'))
    expect(status.isTradingDay).toBe(true)
    expect(status.latestTradingDay).toBe('2026-11-05')
    expect(['pre-open', 'session', 'lunch', 'closed']).toContain(status.phase)
  })

  it('knows that a holiday is closed', () => {
    expect(isTradingDay(2026, 10, 1)).toBe(false)
    expect(latestTradingDay(new Date('2026-10-01T04:00:00Z'))).toBe('2026-09-30')
  })
})
