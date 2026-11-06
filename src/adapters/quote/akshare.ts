import type { ChannelMeta, QuoteSnapshot } from '@/types'
import { AdapterError, type AdapterContext, type QuoteAdapter } from '@/adapters/types'

const META: ChannelMeta = {
  id: 'akshare-quote',
  name: 'AKShare 开源数据',
  kind: 'quote',
  provider: 'AKShare',
  description: '开源爬虫型数据源，需自行部署本地 AKShare 代理服务；未部署时该渠道明确显示未启用，不返回模拟数据。',
  requiresKey: false,
  docsUrl: 'https://akshare.akfamily.xyz/',
  reliability: 0.86,
  latencyMs: 650,
  simulated: false,
  requiresProxy: true,
  rateLimit: '取决于本地代理与上游站点，建议串行 + 缓存',
}

/**
 * AKShare is a Python library and cannot run in the browser.
 *
 * Configuration slot: deploy a small HTTP wrapper around `akshare.stock_zh_a_hist`
 * and expose it at `/api/akshare` (see docs/05-usage-guide.md). Until that service
 * exists this adapter fails explicitly instead of fabricating bars.
 */
export const akshareQuoteAdapter: QuoteAdapter = {
  meta: META,
  async fetchQuotes(symbols: string[], _ctx: AdapterContext): Promise<QuoteSnapshot[]> {
    void symbols
    throw new AdapterError(
      'NOT_IMPLEMENTED',
      'AKShare 渠道未启用：需先部署本地 AKShare 代理服务并挂载到 /api/akshare（本项目不含该 Python 服务）',
    )
  },
}
