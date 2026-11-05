/**
 * A-share trading calendar helpers.
 *
 * Rules are evaluated in Asia/Shanghai regardless of the machine timezone.
 * Weekend + statutory holiday table is the fallback; when a provider timestamp
 * is available the UI shows it alongside this local status so users can spot
 * disagreement (e.g. a delayed feed on a trading day).
 *
 * The holiday table covers 2025-2026 and must be reviewed every December when
 * exchanges publish the next year's schedule.
 */

const TIME_ZONE = 'Asia/Shanghai'

/** Full-day market closures. Weekends are handled separately. */
const HOLIDAYS = new Set<string>([
  // 2025
  '2025-01-01',
  '2025-01-28',
  '2025-01-29',
  '2025-01-30',
  '2025-01-31',
  '2025-02-03',
  '2025-02-04',
  '2025-04-04',
  '2025-05-01',
  '2025-05-02',
  '2025-05-05',
  '2025-06-02',
  '2025-09-03',
  '2025-10-01',
  '2025-10-02',
  '2025-10-03',
  '2025-10-06',
  '2025-10-07',
  '2025-10-08',
  // 2026
  '2026-01-01',
  '2026-01-02',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-02-19',
  '2026-02-20',
  '2026-04-06',
  '2026-05-01',
  '2026-05-04',
  '2026-05-05',
  '2026-06-19',
  '2026-10-01',
  '2026-10-02',
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
])

export type TradingPhase = 'holiday' | 'pre-open' | 'session' | 'lunch' | 'closed'

export interface TradingStatus {
  /** Beijing date, YYYY-MM-DD. */
  today: string
  isTradingDay: boolean
  /** True only during 09:30-11:30 and 13:00-15:00 on a trading day. */
  isSession: boolean
  phase: TradingPhase
  /** Chinese label for UI badges. */
  phaseLabel: string
  /** Most recent trading day at or before today, YYYY-MM-DD. */
  latestTradingDay: string
}

const PHASE_LABELS: Record<TradingPhase, string> = {
  holiday: '休市',
  'pre-open': '盘前',
  session: '盘中',
  lunch: '午间休市',
  closed: '已收盘',
}

interface BeijingParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

const BEIJING_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function beijingParts(date: Date): BeijingParts {
  const parts: Record<string, string> = {}
  for (const part of BEIJING_FORMATTER.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // A few engines render midnight as "24" instead of "00".
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

/** Weekday of a Beijing calendar date, 0 = Sunday. */
function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function isTradingDay(year: number, month: number, day: number): boolean {
  const weekday = weekdayOf(year, month, day)
  if (weekday === 0 || weekday === 6) return false
  return !HOLIDAYS.has(toDateKey(year, month, day))
}

/**
 * Walk backwards from the given Beijing date until a trading day is found.
 * The 45-day window comfortably bridges the longest holiday break.
 */
export function latestTradingDay(now: Date = new Date()): string {
  const { year, month, day } = beijingParts(now)
  let cursor = Date.UTC(year, month - 1, day)
  for (let step = 0; step < 45; step += 1) {
    const candidate = new Date(cursor)
    const y = candidate.getUTCFullYear()
    const m = candidate.getUTCMonth() + 1
    const d = candidate.getUTCDate()
    if (isTradingDay(y, m, d)) return toDateKey(y, m, d)
    cursor -= 86_400_000
  }
  return toDateKey(year, month, day)
}

export function getTradingStatus(now: Date = new Date()): TradingStatus {
  const { year, month, day, hour, minute } = beijingParts(now)
  const today = toDateKey(year, month, day)
  const tradingDay = isTradingDay(year, month, day)
  const minutes = hour * 60 + minute

  let phase: TradingPhase
  if (!tradingDay) {
    phase = 'holiday'
  } else if (minutes < 570) {
    phase = 'pre-open'
  } else if (minutes < 690) {
    phase = 'session'
  } else if (minutes < 780) {
    phase = 'lunch'
  } else if (minutes <= 900) {
    phase = 'session'
  } else {
    phase = 'closed'
  }

  return {
    today,
    isTradingDay: tradingDay,
    isSession: phase === 'session',
    phase,
    phaseLabel: tradingDay ? PHASE_LABELS[phase] : PHASE_LABELS.holiday,
    latestTradingDay: tradingDay ? today : latestTradingDay(now),
  }
}

/**
 * Start (09:30 Beijing) of the next trading session strictly after `now`.
 * Used as the expiry of the full-market list cache: names and codes rarely
 * change intraday, so one fetch per trading day is enough.
 */
export function nextTradingSessionStart(now: Date = new Date()): Date {
  const { year, month, day } = beijingParts(now)
  let cursor = Date.UTC(year, month - 1, day)

  for (let step = 0; step <= 45; step += 1) {
    const candidate = new Date(cursor)
    const y = candidate.getUTCFullYear()
    const m = candidate.getUTCMonth() + 1
    const d = candidate.getUTCDate()
    // 09:30 Beijing == 01:30 UTC.
    const sessionStart = Date.UTC(y, m - 1, d, 1, 30)
    if (isTradingDay(y, m, d) && sessionStart > now.getTime()) {
      return new Date(sessionStart)
    }
    cursor += 86_400_000
  }

  // Fallback: 24 hours from now; the cache layer will retry on the next visit.
  return new Date(now.getTime() + 86_400_000)
}
