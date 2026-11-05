import type { ChannelMeta, RawNewsItem } from '@/types'
import { AdapterError, delay, type AdapterContext, type NewsAdapter } from '@/adapters/types'
import { buildNewsItems } from '@/adapters/mock/news'

const META: ChannelMeta = {
  id: 'news-aggregator',
  name: '新闻聚合（模拟兜底）',
  kind: 'news',
  provider: '自建聚合器',
  description: '模拟离线兜底数据：用于无网络演示，不代表真实资讯；真实多源聚合尚未接入。',
  requiresKey: false,
  reliability: 0.5,
  latencyMs: 480,
  simulated: true,
}

/**
 * Mock implementation of the multi-source news aggregator.
 * Real integration: pull RSS / webhook feeds from several outlets, deduplicate
 * by title similarity, then merge into the shared `RawNewsItem` shape.
 */
export const newsAggregatorAdapter: NewsAdapter = {
  meta: META,
  async fetchNews(ctx: AdapterContext): Promise<RawNewsItem[]> {
    await delay(META.latencyMs)
    const items = buildNewsItems('news-aggregator', ctx.now)
    if (items.length === 0) {
      throw new AdapterError('PARSE', 'No news returned by aggregator channel')
    }
    return items
  },
}
