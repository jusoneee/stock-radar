import type { ChannelMeta, RawNewsItem } from '@/types'
import { AdapterError, type AdapterContext, type NewsAdapter } from '@/adapters/types'
import { fetchJson } from '@/adapters/http'

/**
 * Live Sina Finance news adapter (rolling news feed).
 *
 * Endpoint (verified 2026-11-04): https://feed.mix.sina.com.cn/api/roll/get
 * Returns title / abstract / publish time / source / article URL, which is enough
 * for the event pipeline to run: extraction -> sentiment -> symbol mapping -> stage.
 *
 * The endpoint sends no CORS header, so it is requested through `/api/sina`,
 * proxied by the Vite dev server (or any reverse proxy in production).
 *
 * The feed has no per-stock tagging, so symbol mapping relies on the analyzer's
 * keyword + company-name matching, and `symbols` stays empty here.
 */
const BASE = '/api/sina'

const META: ChannelMeta = {
  id: 'sina-news',
  name: '新浪财经资讯',
  kind: 'news',
  provider: '新浪财经',
  description: '财经滚动资讯（标题/摘要/发布时间/来源/原文链接），公开 JSON 接口，无需密钥。',
  requiresKey: false,
  docsUrl: 'https://finance.sina.com.cn/',
  reliability: 0.84,
  latencyMs: 180,
  simulated: false,
  rateLimit: '公开接口，建议 ≤1 请求/秒',
}

interface SinaRollItem {
  docid?: string
  title?: string
  intro?: string
  url?: string
  media_name?: string
  ctime?: number | string
}

interface SinaRollResponse {
  result?: {
    status?: { code?: number; msg?: string }
    data?: SinaRollItem[]
  }
}

function toIso(value: number | string | undefined, fallback: Date): string {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback.toISOString()
  return new Date(seconds * 1000).toISOString()
}

export const sinaNewsAdapter: NewsAdapter = {
  meta: META,
  async fetchNews(ctx: AdapterContext): Promise<RawNewsItem[]> {
    const url = `${BASE}/api/roll/get?pageid=153&lid=2516&num=30&page=1`
    const payload = await fetchJson<SinaRollResponse>(url, ctx, { Referer: 'https://finance.sina.com.cn' })
    const rows = payload.result?.data ?? []
    if (rows.length === 0) {
      throw new AdapterError('PARSE', '新浪财经未返回资讯数据')
    }

    return rows
      .filter((row) => Boolean(row.title))
      .map((row, index) => {
        const publishedAt = toIso(row.ctime, ctx.now)
        const id = row.docid ? `sina-${row.docid}` : `sina-${index}-${publishedAt}`
        return {
          id,
          sourceId: META.id,
          title: row.title ?? '',
          content: row.intro?.trim() || row.title || '',
          publishedAt,
          url: row.url,
          symbols: [],
        }
      })
  },
}
