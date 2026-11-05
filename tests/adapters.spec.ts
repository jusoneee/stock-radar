import { describe, expect, it } from 'vitest'
import type { AdapterContext } from '@/adapters/types'
import {
  CHANNEL_CATALOG,
  DEFAULT_ENABLED_CHANNELS,
  getAllNewsAdapters,
  getAllQuoteAdapters,
  getQuoteAdapter,
} from '@/adapters/registry'

function context(apiKey?: string): AdapterContext {
  return {
    now: new Date('2026-11-05T04:00:00Z'),
    timeoutMs: 1_000,
    retryCount: 0,
    cacheTtlMs: 0,
    apiKey,
  }
}

describe('adapter registry contract', () => {
  it('has unique ids and valid metadata for every channel', () => {
    const ids = new Set<string>()
    for (const meta of CHANNEL_CATALOG) {
      expect(meta.id).toMatch(/^[a-z0-9-]+$/)
      expect(ids.has(meta.id)).toBe(false)
      ids.add(meta.id)
      expect(meta.name.length).toBeGreaterThan(1)
      expect(meta.reliability).toBeGreaterThan(0)
      expect(meta.reliability).toBeLessThanOrEqual(1)
      expect(['quote', 'news']).toContain(meta.kind)
      if (meta.simulated) expect(meta.description).toContain('模拟')
    }
  })

  it('ships two live quote sources by default', () => {
    expect(DEFAULT_ENABLED_CHANNELS).toContain('eastmoney-quote')
    expect(DEFAULT_ENABLED_CHANNELS).toContain('tencent-quote')
    expect(getAllQuoteAdapters().length).toBeGreaterThanOrEqual(4)
  })

  it('excludes quote adapters from the news adapter list and vice versa', () => {
    const quoteIds = new Set(getAllQuoteAdapters().map((adapter) => adapter.meta.id))
    for (const adapter of getAllNewsAdapters()) {
      expect(quoteIds.has(adapter.meta.id)).toBe(false)
    }
  })

  it('rejects an empty symbol list before hitting the network', async () => {
    const adapter = getQuoteAdapter('sina-quote')
    expect(adapter).toBeDefined()
    await expect(adapter!.fetchQuotes([], context())).rejects.toThrow('股票池为空')
  })

  it('fails explicitly instead of fabricating data when a key is missing', async () => {
    const tushare = getQuoteAdapter('tushare-quote')
    await expect(tushare!.fetchQuotes(['600519'], context())).rejects.toMatchObject({ code: 'MISSING_KEY' })

    const akshare = getQuoteAdapter('akshare-quote')
    await expect(akshare!.fetchQuotes(['600519'], context())).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' })
  })
})
