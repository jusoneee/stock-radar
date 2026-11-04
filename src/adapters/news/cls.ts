import type { ChannelMeta, RawNewsItem } from '@/types'
import { AdapterError, delay, type AdapterContext, type NewsAdapter } from '@/adapters/types'
import { buildNewsItems } from '@/adapters/mock/news'

const META: ChannelMeta = {
  id: 'cls-news',
  name: '财联社电报',
  kind: 'news',
  provider: '财联社',
  description: '以分钟级快讯为主，时效性强，适合捕捉事件「发酵期」的早期信号。',
  requiresKey: true,
  keyHint: '财联社开放平台 Key（仅存于浏览器内存）',
  docsUrl: 'https://www.cls.cn/',
  reliability: 0.9,
  latencyMs: 260,
  simulated: true,
}

/**
 * Mock implementation of the CLS news channel.
 * Real integration: subscribe to the provider's telegraph API, normalize the
 * payload into `RawNewsItem`, and keep the raw body for auditability.
 */
export const clsNewsAdapter: NewsAdapter = {
  meta: META,
  async fetchNews(ctx: AdapterContext): Promise<RawNewsItem[]> {
    await delay(META.latencyMs)
    const items = buildNewsItems('cls-news', ctx.now)
    if (items.length === 0) {
      throw new AdapterError('PARSE', 'No news returned by CLS channel')
    }
    return items
  },
}
