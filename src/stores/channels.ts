import { defineStore } from 'pinia'
import { CHANNEL_CATALOG, DEFAULT_ENABLED_CHANNELS } from '@/adapters/registry'
import type { AdapterSettings, ChannelMeta, StockProfileLite } from '@/types'

const STORAGE_KEY = 'stock-radar:channel-config:v1'

interface ChannelState {
  id: string
  enabled: boolean
  weight: number
}

interface PersistedConfig {
  channels: ChannelState[]
  timeoutMs?: number
  retryCount?: number
  cacheTtlMs?: number
}

function defaultChannels(): ChannelState[] {
  return CHANNEL_CATALOG.map((meta) => ({
    id: meta.id,
    enabled: DEFAULT_ENABLED_CHANNELS.includes(meta.id),
    weight: meta.reliability,
  }))
}

/**
 * Normalize weights inside a channel kind so the merged contribution always
 * sums to 1, regardless of how many channels the user enables.
 */
function normalize(items: Array<{ id: string; weight: number }>): Array<{ id: string; weight: number }> {
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  if (items.length === 0) return []
  if (total <= 0) {
    return items.map((item) => ({ id: item.id, weight: 1 / items.length }))
  }
  return items.map((item) => ({ id: item.id, weight: item.weight / total }))
}

export const useChannelsStore = defineStore('channels', {
  state: () => ({
    channels: [] as ChannelState[],
    /** Keys live in memory only: never persisted, never committed. */
    keys: {} as Record<string, string>,
    timeoutMs: 8_000,
    /** Extra attempts after a network failure. */
    retryCount: 1,
    /** Response cache TTL so repeated runs do not spam public APIs. */
    cacheTtlMs: 30_000,
    loaded: false,
  }),
  getters: {
    quoteCatalog: (): ChannelMeta[] => CHANNEL_CATALOG.filter((meta) => meta.kind === 'quote'),
    newsCatalog: (): ChannelMeta[] => CHANNEL_CATALOG.filter((meta) => meta.kind === 'news'),
    enabledCount(state): number {
      return state.channels.filter((channel) => channel.enabled).length
    },
    quoteSettings(state): Array<{ id: string; weight: number }> {
      const enabled = state.channels.filter((channel) => {
        const meta = CHANNEL_CATALOG.find((item) => item.id === channel.id)
        return channel.enabled && meta?.kind === 'quote'
      })
      return normalize(enabled.map((channel) => ({ id: channel.id, weight: channel.weight })))
    },
    newsSettings(state): Array<{ id: string; weight: number }> {
      const enabled = state.channels.filter((channel) => {
        const meta = CHANNEL_CATALOG.find((item) => item.id === channel.id)
        return channel.enabled && meta?.kind === 'news'
      })
      return normalize(enabled.map((channel) => ({ id: channel.id, weight: channel.weight })))
    },
    /** Enabled built-in quote channels without normalization, for merging with custom sources. */
    rawQuoteWeights(state): Array<{ id: string; weight: number }> {
      return state.channels
        .filter((channel) => channel.enabled && CHANNEL_CATALOG.find((item) => item.id === channel.id)?.kind === 'quote')
        .map((channel) => ({ id: channel.id, weight: channel.weight }))
    },
    /** Enabled built-in news channels without normalization, for merging with custom sources. */
    rawNewsWeights(state): Array<{ id: string; weight: number }> {
      return state.channels
        .filter((channel) => channel.enabled && CHANNEL_CATALOG.find((item) => item.id === channel.id)?.kind === 'news')
        .map((channel) => ({ id: channel.id, weight: channel.weight }))
    },
  },
  actions: {
    buildSettings(symbols: string[], profiles?: Record<string, StockProfileLite>): AdapterSettings {
      return {
        quoteChannels: this.quoteSettings,
        newsChannels: this.newsSettings,
        symbols: [...symbols],
        keys: { ...this.keys },
        timeoutMs: this.timeoutMs,
        retryCount: this.retryCount,
        cacheTtlMs: this.cacheTtlMs,
        profiles,
      }
    },
    init(): void {
      this.channels = defaultChannels()
      this.loadPersisted()
      this.loaded = true
    },
    loadPersisted(): void {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw) as PersistedConfig
        if (Array.isArray(parsed.channels)) {
          this.channels = this.channels.map((channel) => {
            const saved = parsed.channels.find((item) => item.id === channel.id)
            if (!saved) return channel
            return {
              id: channel.id,
              enabled: Boolean(saved.enabled),
              weight: Number.isFinite(saved.weight) ? Math.min(1, Math.max(0.05, saved.weight)) : channel.weight,
            }
          })
        }
        if (Number.isFinite(parsed.timeoutMs)) {
          this.timeoutMs = Math.min(60_000, Math.max(2_000, Number(parsed.timeoutMs)))
        }
        if (Number.isFinite(parsed.retryCount)) {
          this.retryCount = Math.min(5, Math.max(0, Math.round(Number(parsed.retryCount))))
        }
        if (Number.isFinite(parsed.cacheTtlMs)) {
          this.cacheTtlMs = Math.min(600_000, Math.max(0, Number(parsed.cacheTtlMs)))
        }
      } catch {
        // Corrupted local storage should never block the app; fall back to defaults.
        localStorage.removeItem(STORAGE_KEY)
      }
    },
    persist(): void {
      const payload: PersistedConfig = {
        channels: this.channels.map(({ id, enabled, weight }) => ({ id, enabled, weight })),
        timeoutMs: this.timeoutMs,
        retryCount: this.retryCount,
        cacheTtlMs: this.cacheTtlMs,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    },
    setTimeoutMs(value: number): void {
      this.timeoutMs = Math.min(60_000, Math.max(2_000, Math.round(value)))
      this.persist()
    },
    setRetryCount(value: number): void {
      this.retryCount = Math.min(5, Math.max(0, Math.round(value)))
      this.persist()
    },
    setCacheTtlMs(value: number): void {
      this.cacheTtlMs = Math.min(600_000, Math.max(0, Math.round(value)))
      this.persist()
    },
    toggle(id: string): void {
      const channel = this.channels.find((item) => item.id === id)
      if (!channel) return
      channel.enabled = !channel.enabled
      this.persist()
    },
    setWeight(id: string, weight: number): void {
      const channel = this.channels.find((item) => item.id === id)
      if (!channel) return
      channel.weight = Math.min(1, Math.max(0.05, weight))
      this.persist()
    },
    setKey(id: string, value: string): void {
      this.keys[id] = value.trim()
    },
    enableAll(kind: 'quote' | 'news', enabled: boolean): void {
      for (const channel of this.channels) {
        const meta = CHANNEL_CATALOG.find((item) => item.id === channel.id)
        if (meta?.kind === kind) channel.enabled = enabled
      }
      this.persist()
    },
    reset(): void {
      this.channels = defaultChannels()
      this.keys = {}
      this.timeoutMs = 8_000
      this.retryCount = 1
      this.cacheTtlMs = 30_000
      this.persist()
    },
  },
})
