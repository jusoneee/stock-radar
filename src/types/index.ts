/**
 * Domain model shared by adapters, analysis modules and UI.
 * Keep this file free of framework imports so analysis logic stays UI-agnostic.
 */

export type ChannelKind = 'quote' | 'news'

export interface ChannelMeta {
  id: string
  name: string
  kind: ChannelKind
  provider: string
  description: string
  /** Real integration requires a user-provided key. Keys are never persisted or committed. */
  requiresKey: boolean
  keyHint?: string
  docsUrl?: string
  /** 0 - 1, used as the default weight suggestion. */
  reliability: number
  /** Simulated latency of the mock channel, in milliseconds. */
  latencyMs: number
  /** True while the channel returns generated demo data instead of live data. */
  simulated: boolean
  /** Human readable rate-limit note for live providers (e.g. "≤2 req/s"). */
  rateLimit?: string
}

export interface ChannelConfig {
  id: string
  enabled: boolean
  /** Normalized weight, 0 - 1. */
  weight: number
}

export interface QuoteBar {
  /** Trading date in YYYY-MM-DD. */
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface QuoteSnapshot {
  symbol: string
  name: string
  sector: string
  bars: QuoteBar[]
  sourceId: string
  /** Timestamp of the mock data generation. */
  asOf: string
}

export interface RawNewsItem {
  id: string
  sourceId: string
  title: string
  content: string
  /** ISO timestamp. */
  publishedAt: string
  /** Symbols declared by the source, may be empty. */
  symbols?: string[]
  url?: string
}

export type TrendLabel = 'strong-up' | 'up' | 'range' | 'pullback' | 'down'

export interface Indicators {
  lastClose: number
  ma5: number
  ma10: number
  ma20: number
  ma60: number
  pctChange1d: number
  pctChange5d: number
  volumeRatio: number
  /** Close relative to the 20-day high/low box, 0 - 1. */
  rangePosition: number
  breakout20: boolean
  volatility20: number
  avgAmount: number
}

export interface TrendResult {
  label: TrendLabel
  /** 0 - 100 trend strength. */
  score: number
  reasons: string[]
}

export interface ScoreBreakdownItem {
  key: string
  label: string
  score: number
  weight: number
  detail: string
}

export type EventType =
  | 'policy'
  | 'earnings'
  | 'contract'
  | 'mna'
  | 'product'
  | 'supply-chain'
  | 'risk'
  | 'other'

export type Sentiment = 'positive' | 'neutral' | 'negative'

/** 发酵 -> 确认 -> 衰退 */
export type EventStage = 'fermenting' | 'confirmed' | 'fading'

export type ActionAdvice = 'buy-on-dip' | 'watch-breakout' | 'hold' | 'reduce' | 'avoid'

export interface NewsAnalysis {
  newsId: string
  title: string
  content: string
  publishedAt: string
  sourceId: string
  symbols: string[]
  eventType: EventType
  sentiment: Sentiment
  confidence: number
  keywords: string[]
  stage: EventStage
  stageReason: string
  advice: ActionAdvice
  adviceReason: string
  /** Suggested observation window in trading days. */
  impactWindow: number
  /** Hours between publication and the analysis run. */
  ageHours: number
  /** Old or repeatedly recycled coverage; down-weighted in scoring. */
  stale: boolean
  /** Number of near-duplicate headlines clustered into this event. */
  duplicateCount: number
  /** First trading day the event can affect (weekend/holiday aware). */
  effectiveTradingDay: string
}

export interface Recommendation {
  symbol: string
  name: string
  sector: string
  totalScore: number
  trend: TrendResult
  indicators: Indicators
  breakdown: ScoreBreakdownItem[]
  entryAdvice: string
  riskFlags: string[]
  bars: QuoteBar[]
  /** Channels that returned data for this symbol. */
  sourceIds: string[]
  news: NewsAnalysis[]
}

export interface MarketSummary {
  total: number
  advances: number
  declines: number
  avgPctChange: number
  strongCount: number
  /** Positive news events among all analyzed news. */
  positiveNews: number
  negativeNews: number
}

export type MarketPrefix = 'SH' | 'SZ' | 'BJ'

/** One A-share symbol from the full market list. */
export interface UniverseStock {
  symbol: string
  name: string
  market: MarketPrefix
  /** Industry classification reported by the list endpoint. */
  sector?: string
  /** Latest price reported by the list endpoint, if present. */
  price?: number
  /** Latest daily change in percent, if present. */
  pctChange?: number
  /** Provider quote timestamp (ISO string), used for freshness hints. */
  quoteTime?: string
  /** Name carries an ST / *ST prefix. */
  st?: boolean
  /** The provider reports no price for this symbol (suspended or delisted). */
  suspended?: boolean
}

/** localStorage payload of the cached full market list. */
export interface UniverseCachePayload {
  items: UniverseStock[]
  fetchedAt: string
  expiresAt: string
  source: string
  providerTotal: number
}

/** A user-maintained watchlist entry. */
export interface WatchItem {
  symbol: string
  name: string
  market?: MarketPrefix
  /** Free-form user group, empty means the default group. */
  group?: string
  addedAt?: string
}

/** Score weights used by the multi-factor model; all values are normalized at runtime. */
export interface ScoreWeights {
  trend: number
  momentum: number
  volume: number
  position: number
  news: number
}

/** Lightweight stock profile shared from the universe list into the engine. */
export interface StockProfileLite {
  name?: string
  sector?: string
  st?: boolean
  suspended?: boolean
}

export interface ChannelRunResult {
  channelId: string
  ok: boolean
  count: number
  elapsedMs: number
  error?: string
}

export interface AnalysisReport {
  generatedAt: string
  recommendations: Recommendation[]
  news: NewsAnalysis[]
  market: MarketSummary
  channelRuns: ChannelRunResult[]
  /** Symbols whose data could not be loaded. */
  missingSymbols: string[]
}

export interface AdapterSettings {
  /** Enabled quote channels with normalized weights. */
  quoteChannels: Array<{ id: string; weight: number }>
  /** Enabled news channels with normalized weights. */
  newsChannels: Array<{ id: string; weight: number }>
  symbols: string[]
  /** Runtime keys, injected by the store. Never persisted. */
  keys: Record<string, string>
  timeoutMs: number
  /** Extra attempts after a network failure. */
  retryCount: number
  /** In-memory response cache TTL, in milliseconds. 0 disables caching. */
  cacheTtlMs: number
  /** Optional universe metadata (industry, ST, suspension) keyed by symbol. */
  profiles?: Record<string, StockProfileLite>
}

/** Trimmed analysis result kept in local storage for history comparison. */
export interface SnapshotItem {
  symbol: string
  name: string
  sector: string
  totalScore: number
  trend: TrendLabel
  lastClose: number
  pctChange1d: number
}

export interface AnalysisSnapshot {
  id: string
  generatedAt: string
  items: SnapshotItem[]
  avgPctChange: number
  newsCount: number
}
