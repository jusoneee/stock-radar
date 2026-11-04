import type { ChannelMeta, QuoteSnapshot } from '@/types'
import { AdapterError, delay, type AdapterContext, type QuoteAdapter } from '@/adapters/types'
import { buildSnapshots } from '@/adapters/mock/market'

const META: ChannelMeta = {
  id: 'tushare-quote',
  name: 'Tushare 数据',
  kind: 'quote',
  provider: 'Tushare Pro',
  description: '需要用户 Token 的量化数据源，历史日线质量高，适合做回测与指标计算。',
  requiresKey: true,
  keyHint: 'Tushare Pro Token（仅存于浏览器内存，不落盘）',
  docsUrl: 'https://tushare.pro/',
  reliability: 0.95,
  latencyMs: 700,
  simulated: true,
}

/**
 * Mock implementation of the Tushare channel.
 * Real integration: call https://api.tushare.pro with `api_name=daily` and pass
 * `ctx.apiKey` as the token; cache responses to stay inside the rate limits.
 */
export const tushareQuoteAdapter: QuoteAdapter = {
  meta: META,
  async fetchQuotes(symbols: string[], ctx: AdapterContext): Promise<QuoteSnapshot[]> {
    await delay(META.latencyMs)
    if (symbols.length === 0) {
      throw new AdapterError('PARSE', 'Empty symbol list')
    }
    const snapshots = buildSnapshots(symbols, {
      sourceId: META.id,
      salt: 37,
      priceScale: 1.001,
      asOf: ctx.now.toISOString(),
    })
    if (snapshots.length === 0) {
      throw new AdapterError('PARSE', 'No quote returned by Tushare channel')
    }
    return snapshots
  },
}
