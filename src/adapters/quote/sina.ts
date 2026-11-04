import type { ChannelMeta, QuoteSnapshot } from '@/types'
import { AdapterError, delay, type AdapterContext, type QuoteAdapter } from '@/adapters/types'
import { buildSnapshots } from '@/adapters/mock/market'

const META: ChannelMeta = {
  id: 'sina-quote',
  name: '新浪财经行情',
  kind: 'quote',
  provider: '新浪财经',
  description: '公开行情接口，延时约 15 秒，稳定性好，常作为东方财富的交叉校验源。',
  requiresKey: false,
  docsUrl: 'https://finance.sina.com.cn/',
  reliability: 0.8,
  latencyMs: 420,
  simulated: true,
}

/**
 * Mock implementation of the Sina quote channel.
 * Real integration: request https://hq.sinajs.cn/list=sh600519,sz000001 and
 * parse the comma separated payload into `QuoteBar` values.
 */
export const sinaQuoteAdapter: QuoteAdapter = {
  meta: META,
  async fetchQuotes(symbols: string[], ctx: AdapterContext): Promise<QuoteSnapshot[]> {
    await delay(META.latencyMs)
    if (symbols.length === 0) {
      throw new AdapterError('PARSE', 'Empty symbol list')
    }
    const snapshots = buildSnapshots(symbols, {
      sourceId: META.id,
      salt: 23,
      // Slight price offset so weighted merging can be observed in the UI.
      priceScale: 0.9985,
      asOf: ctx.now.toISOString(),
    })
    if (snapshots.length === 0) {
      throw new AdapterError('PARSE', 'No quote returned by Sina channel')
    }
    return snapshots
  },
}
