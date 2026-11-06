import { defineStore } from 'pinia'
import type { AnalysisReport, AnalysisSnapshot } from '@/types'
import { readJson, writeJson } from '@/lib/storage'

const STORAGE_KEY = 'stock-radar:snapshots:v1'
const MAX_SNAPSHOTS = 8

function read(): AnalysisSnapshot[] {
  const parsed = readJson<unknown>(STORAGE_KEY)
  if (!Array.isArray(parsed)) return []
  return parsed.filter((item): item is AnalysisSnapshot => {
    const candidate = item as Partial<AnalysisSnapshot> | null
    return Boolean(candidate && typeof candidate.id === 'string' && Array.isArray(candidate.items))
  })
}

function persist(list: AnalysisSnapshot[]): void {
  writeJson(STORAGE_KEY, list)
}

/**
 * Compact local history of analysis runs. Full K-line series are dropped so
 * the persisted payload stays small; only score, trend and price deltas are
 * comparable. Stored through the unified storage layer (IndexedDB).
 */
export const useSnapshotsStore = defineStore('snapshots', {
  state: () => ({
    items: [] as AnalysisSnapshot[],
    initialized: false,
  }),
  getters: {
    latest: (state): AnalysisSnapshot | null => state.items[0] ?? null,
    previous: (state): AnalysisSnapshot | null => state.items[1] ?? null,
  },
  actions: {
    init(): void {
      if (this.initialized) return
      this.initialized = true
      this.items = read()
    },
    /** Apply persisted history once IndexedDB hydration has completed. */
    rehydrateFromStorage(): void {
      // Snapshots captured before hydration stay authoritative; the storage
      // layer persists those writes when it becomes ready.
      if (this.items.length > 0) return
      this.initialized = false
      this.init()
    },
    capture(report: AnalysisReport): void {
      this.init()
      if (this.items[0]?.generatedAt === report.generatedAt) return
      const snapshot: AnalysisSnapshot = {
        id: report.generatedAt,
        generatedAt: report.generatedAt,
        avgPctChange: report.market.avgPctChange,
        newsCount: report.news.length,
        items: report.recommendations.map((item) => ({
          symbol: item.symbol,
          name: item.name,
          sector: item.sector,
          totalScore: item.totalScore,
          trend: item.trend.label,
          lastClose: item.indicators.lastClose,
          pctChange1d: item.indicators.pctChange1d,
        })),
      }
      this.items = [snapshot, ...this.items].slice(0, MAX_SNAPSHOTS)
      persist(this.items)
    },
    remove(id: string): void {
      this.items = this.items.filter((item) => item.id !== id)
      persist(this.items)
    },
    clear(): void {
      this.items = []
      persist(this.items)
    },
  },
})
