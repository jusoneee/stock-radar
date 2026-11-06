import { describe, expect, it, vi } from 'vitest'
import { isSafeFieldPath, resolvePath, toDateKey, toNumber } from '@/adapters/custom/resolve'
import { defaultFieldMap, type CustomSourceConfig } from '@/adapters/custom/types'
import { buildCustomNewsAdapter, testCustomSource } from '@/adapters/custom/runtime'
import { validateUrlTemplate } from '@/stores/custom-sources'

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

  it('refuses prototype-chain paths', () => {
    expect(isSafeFieldPath('data.klines[*].close')).toBe(true)
    expect(isSafeFieldPath('$.data.items[0].title')).toBe(true)
    expect(isSafeFieldPath('__proto__.polluted')).toBe(false)
    expect(isSafeFieldPath('constructor.prototype')).toBe(false)
    expect(resolvePath({ data: { price: 1 } }, '__proto__')).toBeUndefined()
    expect(resolvePath({ data: { price: 1 } }, 'constructor.prototype')).toBeUndefined()
  })
})

describe('custom source config validation', () => {
  it('accepts absolute http(s) templates with a symbol placeholder', () => {
    expect(validateUrlTemplate('https://api.test/quote/{symbol}')).toBe('https://api.test/quote/{symbol}')
    expect(validateUrlTemplate('http://data.example.test:8080/api')).toBe('http://data.example.test:8080/api')
  })

  it('rejects script schemes, credentials, whitespace and private hosts', () => {
    expect(validateUrlTemplate('javascript:alert(1)')).toBeNull()
    expect(validateUrlTemplate('ftp://api.test/data')).toBeNull()
    expect(validateUrlTemplate('https://user:pass@api.test/quote')).toBeNull()
    expect(validateUrlTemplate('https://api.test/quote {symbol}')).toBeNull()
    expect(validateUrlTemplate('//api.test/quote')).toBeNull()
    expect(validateUrlTemplate('http://127.0.0.1:8080/api')).toBeNull()
    expect(validateUrlTemplate('http://192.168.1.10/api')).toBeNull()
    expect(validateUrlTemplate('http://localhost:8080/api')).toBeNull()
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

  it('strips script URLs from custom news while keeping https links', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                title: '<img src=x onerror="window.__xss=1">恶意标题',
                content: '<script>window.__xss=2</script>',
                publishedAt: '2026-03-04T08:00:00Z',
                url: 'javascript:window.__xss=3',
              },
              { title: '正常新闻', publishedAt: '2026-03-04T08:00:00Z', url: 'https://news.test/a' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const adapter = buildCustomNewsAdapter(config('news'), '')
    const items = await adapter.fetchNews({
      timeoutMs: 3_000,
      retryCount: 0,
      cacheTtlMs: 0,
      now: new Date('2026-03-05T00:00:00Z'),
      symbols: ['600519'],
    })
    expect(items).toHaveLength(2)
    // The title stays as plain text (the UI escapes it); only the href is dropped.
    expect(items[0]!.title).toContain('<img')
    expect(items[0]!.url).toBeUndefined()
    expect(items[1]!.url).toBe('https://news.test/a')
    vi.unstubAllGlobals()
  })
})
