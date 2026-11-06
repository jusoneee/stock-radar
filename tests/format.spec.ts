import { describe, expect, it } from 'vitest'
import { formatAmount, formatDateTime, formatPercent, formatPrice, formatRelativeTime, pct } from '@/lib/format'

describe('number formatting', () => {
  it('adds a sign only for positive percentages and keeps precision', () => {
    expect(formatPercent(1.234)).toBe('+1.23%')
    expect(formatPercent(-1.234)).toBe('-1.23%')
    expect(formatPercent(0)).toBe('0.00%')
    expect(formatPercent(3.14159, 1)).toBe('+3.1%')
  })

  it('renders a dash instead of NaN', () => {
    expect(formatPercent(Number.NaN)).toBe('—')
    expect(formatPrice(Number.POSITIVE_INFINITY)).toBe('—')
    expect(formatAmount(Number.NaN)).toBe('—')
    expect(pct(Number.NaN, 10)).toBe(0)
    expect(formatDateTime('not-a-date')).toBe('—')
    expect(formatRelativeTime('not-a-date')).toBe('—')
  })

  it('scales amounts to 万 / 亿', () => {
    expect(formatAmount(9_999)).toBe('9999')
    expect(formatAmount(12_345)).toBe('1.2 万')
    expect(formatAmount(123_456_789)).toBe('1.23 亿')
  })
})
