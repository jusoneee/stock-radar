import type { ChannelMeta } from '@/types'
import type { ChannelAdapter, NewsAdapter, QuoteAdapter } from './types'
import { isNewsAdapter, isQuoteAdapter } from './types'
import { eastmoneyQuoteAdapter } from './quote/eastmoney'
import { sinaQuoteAdapter } from './quote/sina'
import { tushareQuoteAdapter } from './quote/tushare'
import { akshareQuoteAdapter } from './quote/akshare'
import { clsNewsAdapter } from './news/cls'
import { newsAggregatorAdapter } from './news/aggregator'

/**
 * Single registration point for every channel adapter. Add a new provider by
 * implementing the interface and appending it here - stores, analysis and UI
 * pick it up automatically.
 */
const ALL_ADAPTERS: ChannelAdapter[] = [
  eastmoneyQuoteAdapter,
  sinaQuoteAdapter,
  tushareQuoteAdapter,
  akshareQuoteAdapter,
  clsNewsAdapter,
  newsAggregatorAdapter,
]

export const CHANNEL_CATALOG: ChannelMeta[] = ALL_ADAPTERS.map((adapter) => adapter.meta)

export function getAdapter(id: string): ChannelAdapter | undefined {
  return ALL_ADAPTERS.find((adapter) => adapter.meta.id === id)
}

export function getQuoteAdapter(id: string): QuoteAdapter | undefined {
  const adapter = getAdapter(id)
  return adapter && isQuoteAdapter(adapter) ? adapter : undefined
}

export function getNewsAdapter(id: string): NewsAdapter | undefined {
  const adapter = getAdapter(id)
  return adapter && isNewsAdapter(adapter) ? adapter : undefined
}

export function getQuoteChannels(): ChannelMeta[] {
  return CHANNEL_CATALOG.filter((meta) => meta.kind === 'quote')
}

export function getNewsChannels(): ChannelMeta[] {
  return CHANNEL_CATALOG.filter((meta) => meta.kind === 'news')
}

export function getAllQuoteAdapters(): QuoteAdapter[] {
  return ALL_ADAPTERS.filter(isQuoteAdapter)
}

export function getAllNewsAdapters(): NewsAdapter[] {
  return ALL_ADAPTERS.filter(isNewsAdapter)
}

/** Channels enabled by default for a fresh visit. */
export const DEFAULT_ENABLED_CHANNELS = ['eastmoney-quote', 'sina-quote', 'cls-news']
