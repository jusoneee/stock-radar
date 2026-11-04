import type { RawNewsItem } from '@/types'

export interface StockRef {
  symbol: string
  name: string
}

/**
 * Resolve which stocks a piece of news refers to. Explicit symbols from the
 * source win; otherwise the title/body are matched against the known universe.
 * Unknown names stay unmapped instead of being guessed.
 */
export function mapSymbols(item: RawNewsItem, stocks: StockRef[]): string[] {
  const known = new Set(stocks.map((stock) => stock.symbol))
  const explicit = (item.symbols ?? []).filter((symbol) => known.has(symbol))
  if (explicit.length > 0) return Array.from(new Set(explicit))

  const text = `${item.title} ${item.content}`
  const matched = stocks
    .filter((stock) => text.includes(stock.name) || text.includes(stock.symbol))
    .map((stock) => stock.symbol)
  return Array.from(new Set(matched))
}
