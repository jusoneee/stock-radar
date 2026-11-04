import type { ChannelMeta, QuoteSnapshot } from '@/types'
import { AdapterError, delay, type AdapterContext, type QuoteAdapter } from '@/adapters/types'
import { buildSnapshots } from '@/adapters/mock/market'

const META: ChannelMeta = {
  id: 'eastmoney-quote',
  name: '东方财富行情',
  kind: 'quote',
  provider: '东方财富',
  description: 'A 股实时行情与日线数据，覆盖沪深两市，接口响应快，适合作为主行情源。',
  requiresKey: false,
  docsUrl: 'https://quote.eastmoney.com/',
  reliability: 0.92,
  latencyMs: 320,
  simulated: true,
}

/**
 * Mock implementation of the Eastmoney quote channel.
 *
 * Real integration TODO:
 * 1. Require `ctx.apiKey` (or a public endpoint) and call the provider API.
 * 2. Map the provider payload into `QuoteSnapshot` / `QuoteBar` without leaking
 *    vendor-specific fields into the analysis layer.
 * 3. Throw `AdapterError('NETWORK' | 'TIMEOUT', ...)` so the engine can degrade
 *    gracefully and keep analyzing with the remaining channels.
 */
export const eastmoneyQuoteAdapter: QuoteAdapter = {
  meta: META,
  async fetchQuotes(symbols: string[], ctx: AdapterContext): Promise<QuoteSnapshot[]> {
    await delay(META.latencyMs)
    if (symbols.length === 0) {
      throw new AdapterError('PARSE', 'Empty symbol list')
    }
    const snapshots = buildSnapshots(symbols, {
      sourceId: META.id,
      salt: 11,
      priceScale: 1,
      asOf: ctx.now.toISOString(),
    })
    if (snapshots.length === 0) {
      throw new AdapterError('PARSE', 'No quote returned by Eastmoney channel')
    }
    return snapshots
  },
}
