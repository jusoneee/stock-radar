import type { MarketPrefix } from '@/types'

/** Infer the exchange from the six-digit code when the provider omits it. */
export function marketOfSymbol(symbol: string): MarketPrefix {
  if (symbol.startsWith('6')) return 'SH'
  if (symbol.startsWith('4') || symbol.startsWith('8') || symbol.startsWith('92')) return 'BJ'
  return 'SZ'
}

/** Lower-case prefix used by Sina / Tencent style URLs. */
export function marketPrefix(symbol: string): 'sh' | 'sz' | 'bj' {
  const market = marketOfSymbol(symbol)
  if (market === 'SH') return 'sh'
  if (market === 'BJ') return 'bj'
  return 'sz'
}

export function marketLabel(market: MarketPrefix | undefined): string {
  if (market === 'SH') return '沪市'
  if (market === 'BJ') return '北交所'
  return '深市'
}

/** Display code, e.g. SH600519 / SZ000001 / BJ920992. */
export function symbolText(symbol: string): string {
  return `${marketOfSymbol(symbol)}${symbol}`
}
