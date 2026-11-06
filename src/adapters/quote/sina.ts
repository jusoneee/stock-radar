import type { ChannelMeta, QuoteBar, QuoteSnapshot } from '@/types'
import { AdapterError, type AdapterContext, type QuoteAdapter } from '@/adapters/types'
import { fetchJson, fetchText } from '@/adapters/http'
import { marketPrefix } from '@/lib/market'
import { findProfile } from '@/adapters/mock/universe'
import { mapWithConcurrency } from '@/lib/concurrency'

/**
 * Live Sina Finance quote adapter, used as a third source for closing-price
 * cross-checks.
 *
 * Endpoints (verified 2026-11-05):
 * - daily kline: money.finance.sina.com.cn `CN_MarketData.getKLineData`
 *   (raw/unadjusted OHLCV, JSON, GBK charset, HTTP 200)
 * - snapshot:    hq.sinajs.cn `list=sh600519,...` (GBK text, HTTP 200)
 *
 * Neither host sends a CORS header, so every request goes through a same-origin
 * path (`/api/sina-kline`, `/api/sina-hq`) served by the Vite dev proxy or the
 * bundled `server/proxy.mjs`. Without a proxy the channel fails explicitly.
 *
 * The kline endpoint is NOT dividend-adjusted. Keep it enabled only as a
 * cross-check source (its latest close still matches the adjusted series), and
 * do not make it the primary series for long-horizon indicators.
 */
const KLINE_BASE = '/api/sina-kline'
const SNAPSHOT_BASE = '/api/sina-hq'

const META: ChannelMeta = {
  id: 'sina-quote',
  name: '新浪财经行情',
  kind: 'quote',
  provider: '新浪财经',
  description: '未复权日 K 线 + 实时快照，作为东财/腾讯之外的第三个价格校验源（需同源代理）。',
  requiresKey: false,
  docsUrl: 'https://finance.sina.com.cn/',
  reliability: 0.75,
  latencyMs: 420,
  simulated: false,
  requiresProxy: true,
  rateLimit: '公开接口，建议 ≤2 请求/秒；无 CORS，需经 /api/sina-* 代理',
}

interface SinaKlineRow {
  day?: string
  open?: string
  high?: string
  low?: string
  close?: string
  volume?: string
}

function toIsoFromNow(ctx: AdapterContext): string {
  return ctx.now.toISOString()
}

function parseKline(rows: SinaKlineRow[]): QuoteBar[] {
  const bars: QuoteBar[] = []
  for (const row of rows) {
    const bar: QuoteBar = {
      date: row.day ?? '',
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    }
    if (!bar.date || !Number.isFinite(bar.close) || bar.close <= 0) continue
    bars.push(bar)
  }
  return bars
}

/** Snapshot text: var hq_str_sh600519="贵州茅台,1446.44,1446.44,..."; */
function parseSnapshots(text: string): Map<string, { name: string; price: number }> {
  const result = new Map<string, { name: string; price: number }>()
  const pattern = /hq_str_(?:sh|sz|bj)(\d{6})="([^"]*)"/g
  for (const match of text.matchAll(pattern)) {
    const code = match[1]
    const fields = (match[2] ?? '').split(',')
    const name = fields[0]
    const price = Number(fields[3])
    if (!code || !name) continue
    result.set(code, { name, price })
  }
  return result
}

async function fetchDailyBars(symbol: string, ctx: AdapterContext): Promise<QuoteBar[]> {
  const url =
    `${KLINE_BASE}/quotes_service/api/json_v2.php/CN_MarketData.getKLineData` +
    `?symbol=${marketPrefix(symbol)}${symbol}&scale=240&ma=no&datalen=120`
  const payload = await fetchJson<SinaKlineRow[]>(url, ctx)
  if (!Array.isArray(payload)) return []
  return parseKline(payload)
}

export const sinaQuoteAdapter: QuoteAdapter = {
  meta: META,
  async fetchQuotes(symbols: string[], ctx: AdapterContext): Promise<QuoteSnapshot[]> {
    if (symbols.length === 0) {
      throw new AdapterError('PARSE', '股票池为空')
    }

    const snapshotUrl = `${SNAPSHOT_BASE}/list=${symbols.map((symbol) => `${marketPrefix(symbol)}${symbol}`).join(',')}`
    let snapshots = new Map<string, { name: string; price: number }>()
    try {
      snapshots = parseSnapshots(await fetchText(snapshotUrl, ctx, 'gbk'))
    } catch {
      // Names are a nice-to-have; kline alone can build the series.
      snapshots = new Map()
    }

    const results = await mapWithConcurrency(
      symbols,
      3,
      async (symbol): Promise<QuoteSnapshot | null> => {
        try {
          const bars = await fetchDailyBars(symbol, ctx)
          if (bars.length < 20) return null
          const quote = snapshots.get(symbol)
          const profile = findProfile(symbol)
          return {
            symbol,
            name: quote?.name ?? profile?.name ?? symbol,
            sector: profile?.sector ?? '未分类',
            bars,
            sourceId: META.id,
            asOf: toIsoFromNow(ctx),
          }
        } catch {
          return null
        }
      },
      120,
    )

    const valid = results.filter((item): item is QuoteSnapshot => item !== null)
    if (valid.length === 0) {
      throw new AdapterError(
        'NETWORK',
        '新浪行情日 K 全部获取失败：请确认已通过 Vite 代理或 server/proxy.mjs 提供 /api/sina-kline（该接口无 CORS）',
      )
    }
    return valid
  },
}
