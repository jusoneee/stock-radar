import type { ChannelMeta, QuoteBar, QuoteSnapshot } from '@/types'
import { AdapterError, type AdapterContext, type QuoteAdapter } from '@/adapters/types'
import { fetchJson } from '@/adapters/http'
import { findProfile } from '@/adapters/mock/universe'
import { mapWithConcurrency } from '@/lib/concurrency'

/**
 * Live Eastmoney adapter.
 *
 * Endpoints (verified 2026-11-04, direct connection from mainland China):
 * - batch snapshot: https://push2.eastmoney.com/api/qt/ulist.np/get
 * - daily kline:    https://push2his.eastmoney.com/api/qt/stock/kline/get
 *
 * Both hosts echo the caller Origin in `Access-Control-Allow-Origin`, so the
 * browser can call them directly without a proxy. Providers are public but
 * undocumented: keep the request rate low.
 */
const QUOTE_BASE = 'https://push2.eastmoney.com'
const KLINE_BASE = 'https://push2his.eastmoney.com'

const META: ChannelMeta = {
  id: 'eastmoney-quote',
  name: '东方财富行情',
  kind: 'quote',
  provider: '东方财富',
  description: '沪深 A 股实时快照 + 前复权日 K 线，公开接口无需密钥，作为主行情源。',
  requiresKey: false,
  docsUrl: 'https://quote.eastmoney.com/',
  reliability: 0.92,
  latencyMs: 280,
  simulated: false,
  rateLimit: '公开接口，建议 ≤2 请求/秒；日 K 按股票逐个请求',
}

interface EastmoneyDiff {
  f2?: number
  f3?: number
  f5?: number
  f6?: number
  f12?: string
  f14?: string
  f15?: number
  f16?: number
  f17?: number
  f18?: number
  f124?: number
}

interface EastmoneyListResponse {
  rc?: number
  data?: { diff?: EastmoneyDiff[] | Record<string, EastmoneyDiff> }
}

interface EastmoneyKlineResponse {
  rc?: number
  data?: { code?: string; name?: string; klines?: string[] }
}

/** Eastmoney secid: 1.<code> for Shanghai, 0.<code> for Shenzhen/Beijing. */
function toSecId(symbol: string): string {
  const prefix = symbol.startsWith('6') || symbol.startsWith('5') ? '1' : '0'
  return `${prefix}.${symbol}`
}

function parseKlineLines(lines: string[]): QuoteBar[] {
  const bars: QuoteBar[] = []
  for (const line of lines) {
    const [date, open, close, high, low, volume] = line.split(',')
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
  const url =
    `${KLINE_BASE}/api/qt/stock/kline/get?secid=${toSecId(symbol)}` +
    '&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&end=20500101&lmt=120'
  const payload = await fetchJson<EastmoneyKlineResponse>(url, ctx)
  const lines = payload.data?.klines ?? []
  return parseKlineLines(lines)
}

export const eastmoneyQuoteAdapter: QuoteAdapter = {
  meta: META,
  async fetchQuotes(symbols: string[], ctx: AdapterContext): Promise<QuoteSnapshot[]> {
    if (symbols.length === 0) {
      throw new AdapterError('PARSE', '股票池为空')
    }

    const listUrl =
      `${QUOTE_BASE}/api/qt/ulist.np/get?fltt=2` +
      '&fields=f2,f3,f5,f6,f12,f14,f15,f16,f17,f18,f124' +
      `&secids=${symbols.map(toSecId).join(',')}`
    const listPayload = await fetchJson<EastmoneyListResponse>(listUrl, ctx)
    const rawDiff = listPayload.data?.diff
    const diffs = Array.isArray(rawDiff) ? rawDiff : Object.values(rawDiff ?? {})
    if (diffs.length === 0) {
      throw new AdapterError('PARSE', '东方财富未返回任何行情数据')
    }

    // Limit concurrency: a 50-symbol pool would otherwise fire 50 kline
    // requests at once and risk provider rate-limiting.
    const snapshots = await mapWithConcurrency(
      symbols,
      3,
      async (symbol): Promise<QuoteSnapshot | null> => {
        const diff = diffs.find((item) => item.f12 === symbol)
        if (!diff) return null
        try {
          const bars = await fetchDailyBars(symbol, ctx)
          if (bars.length < 20) return null
          const profile = findProfile(symbol)
          const asOf = diff.f124 ? new Date(diff.f124 * 1000).toISOString() : ctx.now.toISOString()
          return {
            symbol,
            name: diff.f14 ?? profile?.name ?? symbol,
            sector: profile?.sector ?? '未分类',
            bars,
            sourceId: META.id,
            asOf,
          }
        } catch {
          // One failing symbol must not break the whole channel.
          return null
        }
      },
      120,
    )

    const valid = snapshots.filter((item): item is QuoteSnapshot => item !== null)
    if (valid.length === 0) {
      throw new AdapterError('PARSE', '东方财富日线数据全部获取失败')
    }
    return valid
  },
}
