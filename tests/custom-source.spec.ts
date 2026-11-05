import { describe, expect, it, vi } from 'vitest'
import { resolvePath, toDateKey, toNumber } from '@/adapters/custom/resolve'
import { defaultFieldMap, type CustomSourceConfig } from '@/adapters/custom/types'
import { testCustomSource } from '@/adapters/custom/runtime'

function config(kind: 'quote' | 'news' = 'quote'): CustomSourceConfig {
  return {
    id: 'custom-test',
    name: '测试源',
    kind,
    urlTemplate: 'https://example.test/quote/{symbol}',
    method: 'GET',
    timeoutMs: 3_000,
    fieldMap: defaultFieldMap(kind),
    viaProxy: false,
    enabled: true,
    weight: 0.6,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('custom source path resolver', () => {
  it('reads dot paths, array indexes and wildcards', () => {
    const payload = { data: { price: 12.5, klines: [{ close: 1 }, { close: 2 }] } }
    expect(resolvePath(payload, 'data.price')).toBe(12.5)
    expect(resolvePath(payload, '$.data.klines[1].close')).toBe(2)
    expect(resolvePath(payload, '$.data.klines[*].close')).toEqual([1, 2])
    expect(resolvePath(payload, 'data.missing')).toBeUndefined()
  })

  it('coerces numbers and dates from API payloads', () => {
    expect(toNumber('1,234.5')).toBe(1234.5)
    expect(toNumber('abc')).toBeNull()
    expect(toDateKey('2026/03/05')).toBe('2026-03-05')
    expect(toDateKey('not-a-date')).toBe('')
  })
})

describe('custom source connection test', () => {
  it('reports status, elapsed time and parsed sample count', async () => {
    const bars = [
      { date: '2026-01-01', open: 10, high: 11, low: 9, close: 10.5, volume: 100 },
      { date: '2026-01-02', open: 10.5, high: 12, low: 10, close: 11.8, volume: 120 },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: { price: 11.8, name: '样例股份', klines: bars } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    const result = await testCustomSource(config(), { symbol: '600519' })
    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.sampleCount).toBe(2)
    expect(result.message).toContain('样例股份')
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
    vi.unstubAllGlobals()
  })

  it('gives a readable reason when the mapped array is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: { price: 10 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const result = await testCustomSource(config(), { symbol: '600519' })
    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('MISSING_FIELD')
    expect(result.message).toContain('data.klines')
    expect(result.hint).toContain('CORS')
    vi.unstubAllGlobals()
  })

  it('surfaces HTTP failures with the upstream status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"nope"}', { status: 502 })),
    )
    const result = await testCustomSource(config(), { symbol: '600519' })
    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('HTTP')
    expect(result.status).toBe(502)
    vi.unstubAllGlobals()
  })

  it('parses a news list located under data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ title: '示例新闻', content: '摘要', publishedAt: '2026-03-04T08:00:00Z', url: 'https://x.test/a' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const result = await testCustomSource(config('news'), { symbol: '600519' })
    expect(result.ok).toBe(true)
    expect(result.sampleCount).toBe(1)
    expect(result.samples[0]).toContain('示例新闻')
    vi.unstubAllGlobals()
  })
})
