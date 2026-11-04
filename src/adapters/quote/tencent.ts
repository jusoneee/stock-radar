import type { ChannelMeta, QuoteBar, QuoteSnapshot } from '@/types'
import { AdapterError, type AdapterContext, type QuoteAdapter } from '@/adapters/types'
import { fetchJson, fetchText } from '@/adapters/http'
import { findProfile } from '@/adapters/mock/universe'

/**
 * Live Tencent (腾讯证券) adapter, used as the second quote source so the engine
 * can cross-check closing prices between two independent providers.
 *
 * Endpoints (verified 2026-11-04):
 * - daily kline: https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh600519,day,,,120,qfq
 * - snapshot:    https://qt.gtimg.cn/q=sh600519,sz000001  (GBK encoded text)
 *
 * Both hosts return `Access-Control-Allow-Origin: *`, so no proxy is required.
 */
const KLINE_BASE = 'https://web.ifzq.gtimg.cn'
const QUOTE_BASE = 'https://qt.gtimg.cn'

const META: ChannelMeta = {
  id: 'tencent-quote',
  name: '腾讯证券行情',
  kind: 'quote',
  provider: '腾讯财经',
  description: '前复权日 K 线与实时快照，作为东财之外的第二行情源，用于多源收盘价交叉校验。',
  requiresKey: false,
  docsUrl: 'https://gu.qq.com/',
  reliability: 0.86,
  latencyMs: 260,
  simulated: false,
  rateLimit: '公开接口，建议 ≤2 请求/秒；单次最多批量 60 只',
}

interface TencentKlineResponse {
  code?: number
  data?: Record<string, { qfqday?: string[][] | Array<[string, string, string, string, string, string]>; day?: string[][] }>
}

function toMarketSymbol(symbol: string): string {
  return `${symbol.startsWith('6') ? 'sh' : 'sz'}${symbol}`
}

/** Tencent kline rows: [date, open, close, high, low, volume]. */
function parseKlineRows(rows: string[][]): QuoteBar[] {
  const bars: QuoteBar[] = []
  for (const row of rows) {
    const [date, open, close, high, low, volume] = row
    const bar: QuoteBar = {
      date: date ?? '',
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume),
    }
    if (!bar.date || !Number.isFinite(bar.close) || bar.close <= 0) continue
    bars.push(bar)
  }
  return bars
}

async function fetchDailyBars(symbol: string, ctx: AdapterContext): Promise<QuoteBar[]> {
  const url = `${KLINE_BASE}/appstock/app/fqkline/get?param=${toMarketSymbol(symbol)},day,,,120,qfq`
  const payload = await fetchJson<TencentKlineResponse>(url, ctx)
  const node = payload.data?.[toMarketSymbol(symbol)]
  const rows = node?.qfqday ?? node?.day ?? []
  return parseKlineRows(rows as string[][])
}

/** Snapshot text lines look like: v_sh600519="1~贵州茅台~600519~1446.44~...~20261104161448~...". */
function parseSnapshot(text: string): Map<string, { name: string; price: number; timestamp: string }> {
  const result = new Map<string, { name: string; price: number; timestamp: string }>()
  const pattern = /v_(?:sh|sz)(\d{6})="([^"]*)"/g
  for (const match of text.matchAll(pattern)) {
    const code = match[1]
    const fields = (match[2] ?? '').split('~')
    const name = fields[1]
    const price = Number(fields[3])
    const timestamp = fields[30]
    if (!code || !name) continue
    result.set(code, { name, price, timestamp })
  }
  return result
}

export const tencentQuoteAdapter: QuoteAdapter = {
  meta: META,
  async fetchQuotes(symbols: string[], ctx: AdapterContext): Promise<QuoteSnapshot[]> {
    if (symbols.length === 0) {
      throw new AdapterError('PARSE', '股票池为空')
    }

    const snapshotUrl = `${QUOTE_BASE}/q=${symbols.map(toMarketSymbol).join(',')}`
    let snapshot = new Map<string, { name: string; price: number; timestamp: string }>()
    try {
      // GBK payload: decode explicitly, otherwise Chinese names become mojibake.
      snapshot = parseSnapshot(await fetchText(snapshotUrl, ctx, 'gbk'))
    } catch {
      // Snapshot is a nice-to-have; kline alone is enough to build a series.
      snapshot = new Map()
    }

    const snapshots = await Promise.all(
      symbols.map(async (symbol): Promise<QuoteSnapshot | null> => {
        try {
          const bars = await fetchDailyBars(symbol, ctx)
          if (bars.length < 20) return null
          const quote = snapshot.get(symbol)
          const profile = findProfile(symbol)
          return {
            symbol,
            name: quote?.name ?? profile?.name ?? symbol,
            sector: profile?.sector ?? '未分类',
            bars,
            sourceId: META.id,
            asOf: ctx.now.toISOString(),
          }
        } catch {
          return null
        }
      }),
    )

    const valid = snapshots.filter((item): item is QuoteSnapshot => item !== null)
    if (valid.length === 0) {
      throw new AdapterError('PARSE', '腾讯证券日线数据全部获取失败')
    }
    return valid
  },
}
