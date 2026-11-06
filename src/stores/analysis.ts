import { defineStore } from 'pinia'
import { AnalysisEngine } from '@/analysis/engine'
import { getAllNewsAdapters, getAllQuoteAdapters } from '@/adapters/registry'
import type { AnalysisReport } from '@/types'
import { useChannelsStore } from './channels'
import { useWatchlistStore } from './watchlist'
import { useUniverseStore } from './universe'
import { useAnalysisSettingsStore } from './analysis-settings'
import { useCustomSourcesStore } from './custom-sources'

function normalizeWeights(items: Array<{ id: string; weight: number }>): Array<{ id: string; weight: number }> {
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  if (items.length === 0) return []
  if (total <= 0) return items.map((item) => ({ id: item.id, weight: 1 / items.length }))
  return items.map((item) => ({ id: item.id, weight: item.weight / total }))
}

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
      const universe = useUniverseStore()
      const analysisSettings = useAnalysisSettingsStore()
      const customSources = useCustomSourcesStore()
      watchlist.init()
      universe.init()
      analysisSettings.init()
      customSources.init()
      this.loading = true
      this.error = ''
      try {
        const base = channels.buildSettings(watchlist.symbols, universe.profiles)
        const customQuote = customSources.enabledQuote
        const customNews = customSources.enabledNews
        const quoteChannels = normalizeWeights([
          ...channels.rawQuoteWeights,
          ...customQuote.map((item) => ({ id: item.id, weight: item.weight })),
        ])
        const newsChannels = normalizeWeights([
          ...channels.rawNewsWeights,
          ...customNews.map((item) => ({ id: item.id, weight: item.weight })),
        ])
        const engine = new AnalysisEngine({
          quoteAdapters: [...getAllQuoteAdapters(), ...customSources.quoteAdapters],
          newsAdapters: [...getAllNewsAdapters(), ...customSources.newsAdapters],
        })
        this.report = await engine.run(
          {
            ...base,
            quoteChannels,
            newsChannels,
            keys: { ...base.keys, ...customSources.tokens },
          },
          {
            scoreWeights: analysisSettings.normalizedWeights,
          },
        )
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
