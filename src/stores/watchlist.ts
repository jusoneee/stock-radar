import { defineStore } from 'pinia'
import type { WatchItem } from '@/types'
import { STOCK_UNIVERSE } from '@/adapters/mock/universe'

const STORAGE_KEY = 'stock-radar:watchlist:v1'
const LEGACY_CHANNEL_KEY = 'stock-radar:channel-config:v1'

/** Hard cap keeps one analysis run inside a safe request budget. */
export const MAX_WATCHLIST = 50

export type AddResult = 'added' | 'exists' | 'full' | 'invalid'

function marketOf(symbol: string): 'SH' | 'SZ' {
  return symbol.startsWith('6') ? 'SH' : 'SZ'
}

function isValidSymbol(symbol: string): boolean {
  return /^[036]\d{5}$/.test(symbol)
}

function defaultItems(): WatchItem[] {
  return STOCK_UNIVERSE.map((stock) => ({
    symbol: stock.symbol,
    name: stock.name,
    market: marketOf(stock.symbol),
    addedAt: 'default',
  }))
}

/** Old builds stored the pool inside the channel config; reuse it once. */
function readLegacySymbols(): WatchItem[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_CHANNEL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { symbols?: unknown }
    if (!Array.isArray(parsed.symbols)) return null
    const items: WatchItem[] = []
    for (const value of parsed.symbols) {
      if (typeof value !== 'string' || !isValidSymbol(value)) continue
      const profile = STOCK_UNIVERSE.find((stock) => stock.symbol === value)
      items.push({ symbol: value, name: profile?.name ?? value, market: marketOf(value), addedAt: 'migrated' })
    }
    return items.length > 0 ? items : null
  } catch {
    return null
  }
}

export const useWatchlistStore = defineStore('watchlist', {
  state: () => ({
    items: [] as WatchItem[],
    initialized: false,
    /** Last user-facing rejection reason, e.g. pool full. */
    notice: '',
  }),
  getters: {
    count: (state): number => state.items.length,
    symbols: (state): string[] => state.items.map((item) => item.symbol),
    isEmpty: (state): boolean => state.items.length === 0,
    isFull: (state): boolean => state.items.length >= MAX_WATCHLIST,
  },
  actions: {
    init(): void {
      if (this.initialized) return
      this.initialized = true
      this.items = defaultItems()
      this.loadPersisted()
    },
    loadPersisted(): void {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) {
          const legacy = readLegacySymbols()
          if (legacy) {
            this.items = legacy
            this.persist()
          }
          return
        }
        const parsed = JSON.parse(raw) as { items?: unknown }
        if (!Array.isArray(parsed.items)) return
        const seen = new Set<string>()
        const items: WatchItem[] = []
        for (const value of parsed.items) {
          const candidate = value as Partial<WatchItem> | null
          if (!candidate || typeof candidate.symbol !== 'string') continue
          if (!isValidSymbol(candidate.symbol) || seen.has(candidate.symbol)) continue
          seen.add(candidate.symbol)
          items.push({
            symbol: candidate.symbol,
            name: typeof candidate.name === 'string' && candidate.name ? candidate.name : candidate.symbol,
            market: candidate.market === 'SH' || candidate.market === 'SZ' ? candidate.market : marketOf(candidate.symbol),
            addedAt: candidate.addedAt,
          })
          if (items.length >= MAX_WATCHLIST) break
        }
        // An explicitly saved empty list is a valid user choice.
        this.items = items
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    },
    persist(): void {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: this.items }))
      } catch {
        // Ignore quota errors; the list stays usable in memory.
      }
    },
    has(symbol: string): boolean {
      return this.items.some((item) => item.symbol === symbol)
    },
    add(stock: { symbol: string; name: string; market?: 'SH' | 'SZ' }): AddResult {
      const symbol = stock.symbol.trim()
      if (!isValidSymbol(symbol)) return 'invalid'
      if (this.has(symbol)) return 'exists'
      if (this.items.length >= MAX_WATCHLIST) return 'full'
      this.items.push({
        symbol,
        name: stock.name.trim() || symbol,
        market: stock.market ?? marketOf(symbol),
        addedAt: new Date().toISOString(),
      })
      this.notice = ''
      this.persist()
      return 'added'
    },
    remove(symbol: string): void {
      this.items = this.items.filter((item) => item.symbol !== symbol)
      this.persist()
    },
    clear(): void {
      this.items = []
      this.notice = ''
      this.persist()
    },
    /** Restore the built-in 10-stock demo pool. */
    reset(): void {
      this.items = defaultItems()
      this.notice = ''
      this.persist()
    },
  },
})
