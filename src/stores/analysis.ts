import { defineStore } from 'pinia'
import { AnalysisEngine } from '@/analysis/engine'
import { getAllNewsAdapters, getAllQuoteAdapters } from '@/adapters/registry'
import type { AnalysisReport } from '@/types'
import { useChannelsStore } from './channels'
import { useWatchlistStore } from './watchlist'

export const useAnalysisStore = defineStore('analysis', {
  state: () => ({
    report: null as AnalysisReport | null,
    loading: false,
    error: '',
  }),
  getters: {
    hasReport: (state): boolean => state.report !== null,
    topScore: (state): number => state.report?.recommendations[0]?.totalScore ?? 0,
  },
  actions: {
    async run(): Promise<void> {
      const channels = useChannelsStore()
      const watchlist = useWatchlistStore()
      watchlist.init()
      this.loading = true
      this.error = ''
      try {
        const engine = new AnalysisEngine({
          quoteAdapters: getAllQuoteAdapters(),
          newsAdapters: getAllNewsAdapters(),
        })
        this.report = await engine.run(channels.buildSettings(watchlist.symbols))
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
      } finally {
        this.loading = false
      }
    },
    async ensureReport(): Promise<void> {
      if (!this.report && !this.loading) {
        await this.run()
      }
    },
  },
})
