import { defineStore } from 'pinia'
import type { StockProfileLite, UniverseCachePayload, UniverseStock } from '@/types'
import { fetchUniverse, UNIVERSE_SOURCE } from '@/adapters/universe/eastmoney'
import { nextTradingSessionStart } from '@/lib/trading-calendar'
import { readJson, writeJson } from '@/lib/storage'

const STORAGE_KEY = 'stock-radar:universe:v1'
const CACHE_VERSION = 2

type UniverseStatus = 'idle' | 'loading' | 'ready' | 'error'

interface PersistedCache extends UniverseCachePayload {
  version?: number
}

function readCache(): PersistedCache | null {
  const parsed = readJson<PersistedCache>(STORAGE_KEY)
  if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null
  const sample = parsed.items[0]
  if (!sample || typeof sample.symbol !== 'string' || typeof sample.name !== 'string') return null
  return parsed
}

function isFresh(expiresAt: string): boolean {
  const expires = new Date(expiresAt).getTime()
  return Number.isFinite(expires) && expires > Date.now()
}

export const useUniverseStore = defineStore('universe', {
  state: () => ({
    items: [] as UniverseStock[],
    status: 'idle' as UniverseStatus,
    error: '',
    fetchedAt: '',
    expiresAt: '',
    source: UNIVERSE_SOURCE,
    providerTotal: 0,
    progress: { loaded: 0, total: 0 },
    loadedFromCache: false,
    initialized: false,
  }),
  getters: {
    count: (state): number => state.items.length,
    isStale(state): boolean {
      if (!state.expiresAt) return true
      return !isFresh(state.expiresAt)
    },
    isLoading: (state): boolean => state.status === 'loading',
    /** Industry / ST / suspension profile passed to the analysis engine. */
    profiles: (state): Record<string, StockProfileLite> => {
      const result: Record<string, StockProfileLite> = {}
      for (const stock of state.items) {
        result[stock.symbol] = {
          name: stock.name,
          sector: stock.sector,
          st: stock.st,
          suspended: stock.suspended,
        }
      }
      return result
    },
  },
  actions: {
    /** Loads the local cache only; never triggers a network request. */
    init(): void {
      if (this.initialized) return
      this.initialized = true
      const cache = readCache()
      if (!cache || cache.version !== CACHE_VERSION) return
      this.items = cache.items
      this.fetchedAt = cache.fetchedAt
      this.expiresAt = cache.expiresAt
      this.providerTotal = cache.providerTotal
      this.source = cache.source
      this.status = 'ready'
      this.loadedFromCache = true
    },
    /** Apply the persisted list once IndexedDB hydration has completed. */
    rehydrateFromStorage(): void {
      // A network sync already started or finished; its result is authoritative.
      if (this.status === 'loading' || this.status === 'ready') return
      this.initialized = false
      this.init()
    },
    persist(): void {
      // readCache() now resolves through the unified storage layer (IndexedDB in the browser).
      const payload: PersistedCache = {
        version: CACHE_VERSION,
        items: this.items,
        fetchedAt: this.fetchedAt,
        expiresAt: this.expiresAt,
        source: this.source,
        providerTotal: this.providerTotal,
      }
      writeJson(STORAGE_KEY, payload)
    },
    async load(): Promise<void> {
      if (this.status === 'loading') return
      this.status = 'loading'
      this.error = ''
      this.progress = { loaded: 0, total: 0 }

      const now = new Date()
      try {
        const result = await fetchUniverse(
          {
            timeoutMs: 12_000,
            retryCount: 1,
            cacheTtlMs: 0,
            now,
          },
          {
            concurrency: 3,
            spacingMs: 150,
            onProgress: (loaded, total) => {
              this.progress = { loaded, total }
            },
          },
        )
        this.items = result.items
        this.providerTotal = result.providerTotal
        this.fetchedAt = result.fetchedAt
        this.expiresAt = nextTradingSessionStart(now).toISOString()
        this.source = UNIVERSE_SOURCE
        this.status = 'ready'
        this.loadedFromCache = false
        this.persist()
      } catch (error) {
        this.status = 'error'
        this.error = error instanceof Error ? error.message : String(error)
        // Keep a previously cached list visible but flagged as stale.
      }
    },
    /** Fetch when the cache is missing or expired; cached data is served instantly. */
    async ensureLoaded(force = false): Promise<void> {
      this.init()
      if (!force && this.items.length > 0 && isFresh(this.expiresAt)) {
        this.status = 'ready'
        return
      }
      await this.load()
    },
    /** Local fuzzy search by code or name; the list is already cached in memory. */
    search(query: string, limit = 24): UniverseStock[] {
      const keyword = query.trim().toLowerCase()
      if (!this.items.length) return []
      if (!keyword) return this.items.slice(0, limit)

      const scored: Array<{ stock: UniverseStock; score: number }> = []
      for (const stock of this.items) {
        const symbol = stock.symbol
        const name = stock.name.toLowerCase()
        let score = -1
        if (symbol === keyword) score = 0
        else if (symbol.startsWith(keyword)) score = 1
        else if (name === keyword) score = 2
        else if (name.includes(keyword)) score = 3
        else if (symbol.includes(keyword)) score = 4
        if (score >= 0) scored.push({ stock, score })
      }
      scored.sort((a, b) => a.score - b.score || a.stock.symbol.localeCompare(b.stock.symbol))
      return scored.slice(0, limit).map((entry) => entry.stock)
    },
    /** Provider-reported quote time of the most recent item. */
    latestQuoteTime(): string {
      let latest = 0
      for (const stock of this.items) {
        if (!stock.quoteTime) continue
        const value = new Date(stock.quoteTime).getTime()
        if (value > latest) latest = value
      }
      return latest > 0 ? new Date(latest).toISOString() : ''
    },
  },
})
