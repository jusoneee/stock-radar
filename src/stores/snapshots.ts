import { defineStore } from 'pinia'
import type { AnalysisReport, AnalysisSnapshot } from '@/types'

const STORAGE_KEY = 'stock-radar:snapshots:v1'
const MAX_SNAPSHOTS = 8

function read(): AnalysisSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is AnalysisSnapshot => {
      const candidate = item as Partial<AnalysisSnapshot> | null
      return Boolean(candidate && typeof candidate.id === 'string' && Array.isArray(candidate.items))
    })
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return []
  }
}

function persist(list: AnalysisSnapshot[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // History is best-effort; quota failures must not break analysis.
  }
}

/**
 * Compact local history of analysis runs. Full K-line series are dropped so
 * localStorage stays small; only score, trend and price deltas are comparable.
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
