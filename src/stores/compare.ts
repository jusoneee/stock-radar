import { defineStore } from 'pinia'

const STORAGE_KEY = 'stock-radar:compare:v1'
export const MAX_COMPARE = 6
export const MIN_COMPARE = 2

export const useCompareStore = defineStore('compare', {
  state: () => ({
    symbols: [] as string[],
    initialized: false,
    notice: '',
  }),
  getters: {
    count: (state): number => state.symbols.length,
    canAdd: (state): boolean => state.symbols.length < MAX_COMPARE,
  },
  actions: {
    init(): void {
      if (this.initialized) return
      this.initialized = true
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw) as { symbols?: unknown }
        if (Array.isArray(parsed.symbols)) {
          this.symbols = parsed.symbols
            .filter((value): value is string => typeof value === 'string' && /^\d{6}$/.test(value))
            .slice(0, MAX_COMPARE)
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    },
    persist(): void {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ symbols: this.symbols }))
      } catch {
        // Ignore quota errors.
      }
    },
    has(symbol: string): boolean {
      return this.symbols.includes(symbol)
    },
    toggle(symbol: string): void {
      this.notice = ''
      if (this.symbols.includes(symbol)) {
        this.symbols = this.symbols.filter((item) => item !== symbol)
      } else if (this.symbols.length >= MAX_COMPARE) {
        this.notice = `最多同时对比 ${MAX_COMPARE} 只股票`
        return
      } else {
        this.symbols.push(symbol)
      }
      this.persist()
    },
    remove(symbol: string): void {
      this.symbols = this.symbols.filter((item) => item !== symbol)
      this.persist()
    },
    clear(): void {
      this.symbols = []
      this.notice = ''
      this.persist()
    },
  },
 })
