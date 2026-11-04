import type { QuoteBar, QuoteSnapshot } from '@/types'
import { findProfile, type MarketProfile, type StockProfile } from './universe'

interface ProfileParams {
  drift: number
  vol: number
  gap: number
}

const PROFILE_PARAMS: Record<MarketProfile, ProfileParams> = {
  strong: { drift: 0.014, vol: 0.016, gap: 0.004 },
  up: { drift: 0.005, vol: 0.011, gap: 0.003 },
  range: { drift: 0.0004, vol: 0.009, gap: 0.002 },
  pullback: { drift: -0.004, vol: 0.013, gap: 0.003 },
  down: { drift: -0.009, vol: 0.014, gap: 0.003 },
}

/** Deterministic LCG so mock data stays stable across reloads and builds. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Build `count` trading dates ending at `end`, skipping weekends. */
export function tradingDates(count: number, end: Date): string[] {
  const dates: string[] = []
  const cursor = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  while (dates.length < count) {
    const day = cursor.getDay()
    if (day !== 0 && day !== 6) dates.unshift(formatDate(cursor))
    cursor.setDate(cursor.getDate() - 1)
  }
  return dates
}

function driftAt(profile: StockProfile, index: number, days: number): number {
  const base = PROFILE_PARAMS[profile.profile]
  if (profile.profile === 'pullback') {
    // Rise for the first ~65% of the window, then step down into the latest bars.
    return index < days * 0.65 ? 0.011 : -0.015
  }
  return base.drift
}

export interface BarOptions {
  days?: number
  end?: Date
  /** Source-level price offset, e.g. 0.998 for an alternate feed. */
  priceScale?: number
  /** Extra seed salt so different channels produce slightly different series. */
  salt?: number
}

export function generateBars(profile: StockProfile, options: BarOptions = {}): QuoteBar[] {
  const days = options.days ?? 48
  const cadence = PROFILE_PARAMS[profile.profile]
  const rng = seededRandom(hashString(profile.symbol) + (options.salt ?? 0))
  const dates = tradingDates(days, options.end ?? new Date())
  const closes: number[] = new Array<number>(days)

  let close = profile.basePrice
  for (let i = days - 1; i >= 0; i -= 1) {
    closes[i] = close
    const ret = driftAt(profile, i, days) + (rng() - 0.5) * cadence.vol * 1.8
    close = close / (1 + ret)
  }

  const scale = options.priceScale ?? 1
  const bars: QuoteBar[] = []
  for (let i = 0; i < days; i += 1) {
    const prev = i > 0 ? closes[i - 1]! : closes[0]! / (1 + driftAt(profile, 0, days))
    const current = closes[i]!
    const open = prev * (1 + (rng() - 0.5) * cadence.gap)
    const wick = 0.002 + rng() * cadence.vol * 0.8
    const high = Math.max(open, current) * (1 + wick)
    const low = Math.min(open, current) * (1 - wick)
    const momentum = Math.abs(current / prev - 1) / Math.max(cadence.vol, 0.001)
    const volume = Math.round(profile.volumeBase * (0.65 + rng() * 0.9 + momentum * 0.45))

    bars.push({
      date: dates[i]!,
      open: round(open * scale),
      high: round(high * scale),
      low: round(low * scale),
      close: round(current * scale),
      volume,
    })
  }
  return bars
}

export interface SnapshotOptions extends BarOptions {
  sourceId: string
  asOf?: string
}

export function buildSnapshot(symbol: string, options: SnapshotOptions): QuoteSnapshot | undefined {
  const profile = findProfile(symbol)
  if (!profile) return undefined
  return {
    symbol: profile.symbol,
    name: profile.name,
    sector: profile.sector,
    bars: generateBars(profile, options),
    sourceId: options.sourceId,
    asOf: options.asOf ?? new Date().toISOString(),
  }
}

export function buildSnapshots(symbols: string[], options: SnapshotOptions): QuoteSnapshot[] {
  return symbols
    .map((symbol) => buildSnapshot(symbol, options))
    .filter((snapshot): snapshot is QuoteSnapshot => snapshot !== undefined)
}
