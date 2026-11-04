import type { ChannelMeta, RawNewsItem } from '@/types'
import { AdapterError, delay, type AdapterContext, type NewsAdapter } from '@/adapters/types'
import { buildNewsItems } from '@/adapters/mock/news'

const META: ChannelMeta = {
  id: 'news-aggregator',
  name: '新闻聚合（多源）',
  kind: 'news',
  provider: '自建聚合器',
  description: '聚合公告、财经媒体与研报摘要，覆盖面广但噪声较多，需要更严格的去重与可信度打分。',
  requiresKey: false,
  docsUrl: 'https://docs.example.com/news-aggregator',
  reliability: 0.78,
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
