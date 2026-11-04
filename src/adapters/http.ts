import { AdapterError, type AdapterContext } from './types'

/**
 * Minimal HTTP client shared by live adapters.
 *
 * Responsibilities:
 * - enforce per-request timeout (AbortController)
 * - retry transient failures with a small backoff
 * - cache identical GET requests for a short TTL to respect provider rate limits
 * - normalize every failure into `AdapterError` so the engine can degrade per channel
 *
 * The browser cannot bypass CORS on its own, so every adapter calls a same-origin
 * path (`/api/...`) that the Vite dev server proxies to the real provider.
 * For production builds the same paths must be served by a reverse proxy.
 */
export interface RequestOptions {
  timeoutMs: number
  retryCount: number
  cacheTtlMs: number
  headers?: Record<string, string>
}

interface CacheEntry {
  expiresAt: number
  value: unknown
}

const responseCache = new Map<string, CacheEntry>()

function cacheGet<T>(url: string): T | undefined {
  const hit = responseCache.get(url)
  if (!hit) return undefined
  if (hit.expiresAt <= Date.now()) {
    responseCache.delete(url)
    return undefined
  }
  return hit.value as T
}

function cacheSet(url: string, value: unknown, ttlMs: number): void {
  if (ttlMs <= 0) return
  responseCache.set(url, { expiresAt: Date.now() + ttlMs, value })
}

function describe(status: number, url: string): string {
  return `接口返回 HTTP ${status}（${url}）`
}

async function request(url: string, options: RequestOptions, accept: 'json' | 'text', encoding?: string): Promise<unknown> {
  const cached = cacheGet(url)
  if (cached !== undefined) return cached

  let lastError: AdapterError | undefined
  const attempts = Math.max(1, options.retryCount + 1)

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: accept === 'json' ? 'application/json, text/plain, */*' : 'text/plain, */*',
          ...options.headers,
        },
      })
      if (!response.ok) {
        throw new AdapterError('NETWORK', describe(response.status, url))
      }
      let value: unknown
      if (accept === 'json') {
        value = await response.json()
      } else if (encoding && encoding !== 'utf-8') {
        // Text providers (e.g. qt.gtimg.cn) still serve GBK; decode from raw bytes.
        value = new TextDecoder(encoding).decode(await response.arrayBuffer())
      } else {
        value = await response.text()
      }
      cacheSet(url, value, options.cacheTtlMs)
      return value
    } catch (error) {
      if (error instanceof AdapterError) {
        lastError = error
      } else if ((error as { name?: string }).name === 'AbortError') {
        lastError = new AdapterError('TIMEOUT', `请求超时（${options.timeoutMs}ms）：${url}`)
      } else {
        lastError = new AdapterError('NETWORK', `网络请求失败：${(error as Error).message}`)
      }
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)))
      }
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError ?? new AdapterError('NETWORK', `请求失败：${url}`)
}

export async function fetchJson<T>(url: string, ctx: AdapterContext, headers?: Record<string, string>): Promise<T> {
  try {
    return (await request(url, { ...ctx, headers }, 'json')) as T
  } catch (error) {
    if (error instanceof AdapterError) throw error
    throw new AdapterError('PARSE', `响应解析失败：${url}`)
  }
}

export async function fetchText(
  url: string,
  ctx: AdapterContext,
  encoding = 'utf-8',
  headers?: Record<string, string>,
): Promise<string> {
  return (await request(url, { ...ctx, headers }, 'text', encoding)) as string
}

/** Clear the response cache, e.g. when the user explicitly re-runs the analysis. */
export function clearResponseCache(): void {
  responseCache.clear()
}
