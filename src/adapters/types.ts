import type { ChannelMeta, QuoteSnapshot, RawNewsItem } from '@/types'

/**
 * Adapter contract. Any real data provider (REST API, websocket, local CSV, ...)
 * can implement these interfaces without touching analysis or UI code.
 */
export interface AdapterContext {
  /** User-provided key, in-memory only. */
  apiKey?: string
  timeoutMs: number
  now: Date
}

export type AdapterErrorCode = 'MISSING_KEY' | 'NOT_IMPLEMENTED' | 'NETWORK' | 'TIMEOUT' | 'PARSE'

export class AdapterError extends Error {
  readonly code: AdapterErrorCode

  constructor(code: AdapterErrorCode, message: string) {
    super(message)
    this.name = 'AdapterError'
    this.code = code
  }
}

export interface QuoteAdapter {
  readonly meta: ChannelMeta
  fetchQuotes(symbols: string[], ctx: AdapterContext): Promise<QuoteSnapshot[]>
}

export interface NewsAdapter {
  readonly meta: ChannelMeta
  fetchNews(ctx: AdapterContext): Promise<RawNewsItem[]>
}

export type ChannelAdapter = QuoteAdapter | NewsAdapter

export function isQuoteAdapter(adapter: ChannelAdapter): adapter is QuoteAdapter {
  return adapter.meta.kind === 'quote'
}

export function isNewsAdapter(adapter: ChannelAdapter): adapter is NewsAdapter {
  return adapter.meta.kind === 'news'
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
