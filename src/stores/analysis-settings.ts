import { defineStore } from 'pinia'
import type { ScoreWeights } from '@/types'
import { DEFAULT_SCORE_WEIGHTS, normalizeWeights } from '@/analysis/scoring'

const STORAGE_KEY = 'stock-radar:analysis-settings:v1'

export interface LlmSettings {
  /** Feature is off until the user provides an external API key and endpoint. */
  enabled: boolean
  endpoint: string
  model: string
}

interface PersistedSettings {
  weights: ScoreWeights
  llm: LlmSettings
}

function defaultWeights(): ScoreWeights {
  return { ...DEFAULT_SCORE_WEIGHTS }
}

/**
 * Analysis tuning persisted in the browser.
 *
 * The LLM/NER enhancement is intentionally a configuration slot only: it needs
 * an external paid API key, so it stays `enabled: false` and never sends data
 * anywhere until the user explicitly turns it on. The key itself is kept in
 * memory only and is never written to localStorage.
 */
export const useAnalysisSettingsStore = defineStore('analysis-settings', {
  state: () => ({
    weights: defaultWeights(),
    llm: {
      enabled: false,
      endpoint: '',
      model: '',
    } as LlmSettings,
    /** Session-only secret; not persisted by design. */
    llmApiKey: '',
    initialized: false,
  }),
  getters: {
    normalizedWeights: (state): ScoreWeights => normalizeWeights(state.weights),
    weightPercent: (state): ScoreWeights => {
      const normalized = normalizeWeights(state.weights)
      return {
        trend: Math.round(normalized.trend * 100),
        momentum: Math.round(normalized.momentum * 100),
        volume: Math.round(normalized.volume * 100),
        position: Math.round(normalized.position * 100),
        news: Math.round(normalized.news * 100),
      }
    },
  },
  actions: {
    init(): void {
      if (this.initialized) return
      this.initialized = true
      this.load()
    },
    load(): void {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw) as Partial<PersistedSettings>
        if (parsed.weights) {
          this.weights = {
            trend: Number(parsed.weights.trend) || 0,
            momentum: Number(parsed.weights.momentum) || 0,
            volume: Number(parsed.weights.volume) || 0,
            position: Number(parsed.weights.position) || 0,
            news: Number(parsed.weights.news) || 0,
          }
          if (Object.values(this.weights).every((value) => value <= 0)) this.weights = defaultWeights()
        }
        if (parsed.llm) {
          this.llm = {
            enabled: Boolean(parsed.llm.enabled),
            endpoint: typeof parsed.llm.endpoint === 'string' ? parsed.llm.endpoint : '',
            model: typeof parsed.llm.model === 'string' ? parsed.llm.model : '',
          }
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    },
    persist(): void {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ weights: this.weights, llm: this.llm }))
      } catch {
        // Quota errors are non-fatal: settings remain active in memory.
      }
    },
    setWeight(key: keyof ScoreWeights, value: number): void {
      this.weights = { ...this.weights, [key]: Math.max(0, Math.min(100, Math.round(value))) }
      this.persist()
    },
    resetWeights(): void {
      this.weights = defaultWeights()
      this.persist()
    },
    setLlm(patch: Partial<LlmSettings>): void {
      this.llm = { ...this.llm, ...patch }
      this.persist()
    },
  },
})
