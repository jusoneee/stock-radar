import type { ChannelMeta, RawNewsItem } from '@/types'
import { AdapterError, type AdapterContext, type NewsAdapter } from '@/adapters/types'

const META: ChannelMeta = {
  id: 'cls-news',
  name: '财联社电报',
  kind: 'news',
  provider: '财联社',
  description: '分钟级快讯，时效性强；开放平台需签约账号，未配置时该渠道明确显示未启用，不返回模拟数据。',
  requiresKey: true,
  keyHint: '财联社开放平台 Key（仅保存在本机浏览器）',
  docsUrl: 'https://www.cls.cn/',
  reliability: 0.9,
  latencyMs: 260,
  simulated: false,
  rateLimit: '按开放平台协议限频',
}

/**
 * CLS telegraph news requires a signed commercial agreement; there is no public
 * endpoint that can be verified from this project. The key slot exists for
 * deployments that already hold API access, but the request format is provider
 * specific and is therefore not guessed here.
 */
export const clsNewsAdapter: NewsAdapter = {
  meta: META,
  async fetchNews(ctx: AdapterContext): Promise<RawNewsItem[]> {
    if (!ctx.apiKey?.trim()) {
      throw new AdapterError('MISSING_KEY', '未配置财联社开放平台 Key，该渠道未启用')
    }
    throw new AdapterError(
      'NOT_IMPLEMENTED',
      '财联社开放平台接口需签约账号且未公开文档，当前版本未接入；请改用新浪资讯源或自行部署代理',
    )
  },
}
