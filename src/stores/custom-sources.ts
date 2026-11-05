import { defineStore } from 'pinia'
import type { CustomFieldMap, CustomSourceConfig, CustomSourceKind } from '@/adapters/custom/types'
import { defaultFieldMap } from '@/adapters/custom/types'
import { buildCustomNewsAdapter, buildCustomQuoteAdapter } from '@/adapters/custom/runtime'

const STORAGE_KEY = 'stock-radar:custom-sources:v1'

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/[^\s]+$/.test(value)
}

function clampWeight(value: number): number {
  if (!Number.isFinite(value)) return 0.6
  return Math.min(1, Math.max(0.05, value))
}

function clampTimeout(value: number): number {
  if (!Number.isFinite(value)) return 8_000
  return Math.min(60_000, Math.max(2_000, Math.round(value)))
}

function makeId(kind: CustomSourceKind): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `custom-${kind}-${random.slice(0, 8)}`
}

function sanitize(raw: unknown): CustomSourceConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<CustomSourceConfig>
  if (typeof value.id !== 'string' || !value.id.startsWith('custom-')) return null
  if (value.kind !== 'quote' && value.kind !== 'news') return null
  if (typeof value.urlTemplate !== 'string' || !isHttpUrl(value.urlTemplate)) return null
  if (typeof value.name !== 'string' || !value.name.trim()) return null
  return {
    id: value.id,
    name: value.name.trim().slice(0, 30),
    kind: value.kind,
    urlTemplate: value.urlTemplate.trim(),
    method: value.method === 'POST' ? 'POST' : 'GET',
    bodyTemplate: typeof value.bodyTemplate === 'string' ? value.bodyTemplate : undefined,
    timeoutMs: clampTimeout(Number(value.timeoutMs)),
    fieldMap: sanitizeMap(value.fieldMap, value.kind),
    viaProxy: Boolean(value.viaProxy),
    enabled: value.enabled !== false,
    weight: clampWeight(Number(value.weight)),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
  }
}

function sanitizeMap(raw: unknown, kind: CustomSourceKind): CustomFieldMap {
  const fallback = defaultFieldMap(kind)
  if (!raw || typeof raw !== 'object') return fallback
  const result: CustomFieldMap = { ...fallback }
  for (const [key, path] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof path !== 'string' || !path.trim()) continue
    result[key as keyof CustomFieldMap] = path.trim().slice(0, 120)
  }
  return result
}

export const useCustomSourcesStore = defineStore('customSources', {
  state: () => ({
    sources: [] as CustomSourceConfig[],
    /** Tokens are memory-only: never persisted, never committed. */
    tokens: {} as Record<string, string>,
    initialized: false,
  }),
  getters: {
    quoteSources: (state): CustomSourceConfig[] => state.sources.filter((item) => item.kind === 'quote'),
    newsSources: (state): CustomSourceConfig[] => state.sources.filter((item) => item.kind === 'news'),
    enabledQuote: (state): CustomSourceConfig[] =>
      state.sources.filter((item) => item.kind === 'quote' && item.enabled),
    enabledNews: (state): CustomSourceConfig[] =>
      state.sources.filter((item) => item.kind === 'news' && item.enabled),
    /** Standard adapters for enabled sources, ready to append to the engine lists. */
    quoteAdapters(): ReturnType<typeof buildCustomQuoteAdapter>[] {
      return this.enabledQuote.map((item) => buildCustomQuoteAdapter(item, this.tokens[item.id] ?? ''))
    },
    newsAdapters(): ReturnType<typeof buildCustomNewsAdapter>[] {
      return this.enabledNews.map((item) => buildCustomNewsAdapter(item, this.tokens[item.id] ?? ''))
    },
  },
  actions: {
    init(): void {
      if (this.initialized) return
      this.initialized = true
      this.loadPersisted()
    },
    loadPersisted(): void {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw) as { sources?: unknown }
        if (!Array.isArray(parsed.sources)) return
        this.sources = parsed.sources
          .map((item) => sanitize(item))
          .filter((item): item is CustomSourceConfig => item !== null)
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    },
    persist(): void {
      // Persisted payload keeps connection settings only; tokens stay in memory.
      const payload = {
        sources: this.sources.map(({ id, name, kind, urlTemplate, method, bodyTemplate, timeoutMs, fieldMap, viaProxy, enabled, weight, createdAt }) => ({
          id,
          name,
          kind,
          urlTemplate,
          method,
          bodyTemplate,
          timeoutMs,
          fieldMap,
          viaProxy,
          enabled,
          weight,
          createdAt,
        })),
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
      } catch {
        // Quota errors should not break the feature.
      }
    },
    add(input: {
      name: string
      kind: CustomSourceKind
      urlTemplate: string
      method: 'GET' | 'POST'
      bodyTemplate?: string
      timeoutMs: number
      fieldMap: CustomFieldMap
      viaProxy: boolean
      enabled?: boolean
    }): CustomSourceConfig | null {
      if (!input.name.trim() || !isHttpUrl(input.urlTemplate.trim())) return null
      const config: CustomSourceConfig = {
        id: makeId(input.kind),
        name: input.name.trim().slice(0, 30),
        kind: input.kind,
        urlTemplate: input.urlTemplate.trim(),
        method: input.method,
        bodyTemplate: input.bodyTemplate?.trim() || undefined,
        timeoutMs: clampTimeout(input.timeoutMs),
        fieldMap: sanitizeMap(input.fieldMap, input.kind),
        viaProxy: input.viaProxy,
        enabled: input.enabled ?? true,
        weight: 0.6,
        createdAt: new Date().toISOString(),
      }
      this.sources.push(config)
      this.persist()
      return config
    },
    update(id: string, patch: Partial<CustomSourceConfig>): void {
      const target = this.sources.find((item) => item.id === id)
      if (!target) return
      if (typeof patch.name === 'string' && patch.name.trim()) target.name = patch.name.trim().slice(0, 30)
      if (typeof patch.urlTemplate === 'string' && isHttpUrl(patch.urlTemplate.trim())) {
        target.urlTemplate = patch.urlTemplate.trim()
      }
      if (patch.method === 'GET' || patch.method === 'POST') target.method = patch.method
      if (typeof patch.bodyTemplate === 'string') target.bodyTemplate = patch.bodyTemplate.trim() || undefined
      if (patch.timeoutMs !== undefined) target.timeoutMs = clampTimeout(patch.timeoutMs)
      if (patch.fieldMap) target.fieldMap = sanitizeMap(patch.fieldMap, target.kind)
      if (patch.viaProxy !== undefined) target.viaProxy = Boolean(patch.viaProxy)
      if (patch.weight !== undefined) target.weight = clampWeight(patch.weight)
      this.persist()
    },
    toggle(id: string): void {
      const target = this.sources.find((item) => item.id === id)
      if (!target) return
      target.enabled = !target.enabled
      this.persist()
    },
    setWeight(id: string, weight: number): void {
      const target = this.sources.find((item) => item.id === id)
      if (!target) return
      target.weight = clampWeight(weight)
      this.persist()
    },
    remove(id: string): void {
      this.sources = this.sources.filter((item) => item.id !== id)
      delete this.tokens[id]
      this.persist()
    },
    setToken(id: string, token: string): void {
      this.tokens[id] = token.trim()
    },
    clearTokens(): void {
      this.tokens = {}
    },
  },
})
