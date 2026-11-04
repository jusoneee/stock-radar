import type { ChannelMeta, QuoteSnapshot } from '@/types'
import { AdapterError, delay, type AdapterContext, type QuoteAdapter } from '@/adapters/types'
import { buildSnapshots } from '@/adapters/mock/market'

const META: ChannelMeta = {
  id: 'akshare-quote',
  name: 'AKShare 开源数据',
  kind: 'quote',
  provider: 'AKShare',
  description: '开源爬虫型数据源，字段齐全但偶有延迟，建议在本地服务端代理后接入以规避跨域。',
  requiresKey: false,
  docsUrl: 'https://akshare.akfamily.xyz/',
  reliability: 0.86,
  latencyMs: 650,
  simulated: true,
}

/**
 * Mock implementation of the AKShare channel.
 * Real integration: AKShare is a Python library, so expose it through a small
 * local proxy service and point this adapter at that proxy endpoint.
 */
export const akshareQuoteAdapter: QuoteAdapter = {
  meta: META,
  async fetchQuotes(symbols: string[], ctx: AdapterContext): Promise<QuoteSnapshot[]> {
    await delay(META.latencyMs)
    if (symbols.length === 0) {
      throw new AdapterError('PARSE', 'Empty symbol list')
    }
    const snapshots = buildSnapshots(symbols, {
      sourceId: META.id,
      salt: 51,
      priceScale: 1.0005,
      asOf: ctx.now.toISOString(),
    })
    if (snapshots.length === 0) {
      throw new AdapterError('PARSE', 'No quote returned by AKShare channel')
    }
    return snapshots
  },
}
