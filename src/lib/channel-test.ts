import { channelAvailability } from '@/adapters/availability'
import { getAdapter } from '@/adapters/registry'
import { AdapterError, isNewsAdapter, isQuoteAdapter, type AdapterContext } from '@/adapters/types'

export interface ChannelTestResult {
  ok: boolean
  message: string
  elapsedMs: number
}

/** Two liquid symbols are enough to prove connectivity and parsing. */
const TEST_SYMBOLS = ['600519', '000001']

const CODE_HINT: Record<string, string> = {
  MISSING_KEY: '请先在下方填入密钥；纯静态部署没有服务端注入密钥的能力。',
  NOT_IMPLEMENTED: '该渠道需要签约账号或自建代理，当前版本未接入公开接口。',
  NETWORK: '网络请求失败：可能被上游限流、浏览器 CORS 拦截或同源代理不可用。',
  TIMEOUT: '请求超时，可稍后重试或调大设置页的请求超时。',
  PARSE: '返回内容与预期结构不符，未解析到有效样本。',
}

function elapsedSince(started: number): number {
  return Math.round(performance.now() - started)
}

/**
 * Validate a built-in channel with a small live request. Uses the same adapter
 * and context as the analysis pipeline; never writes anything to storage.
 */
export async function testChannel(id: string, apiKey: string, timeoutMs = 8_000): Promise<ChannelTestResult> {
  const started = performance.now()
  const adapter = getAdapter(id)
  if (!adapter) {
    return { ok: false, message: '未找到该渠道的适配器。', elapsedMs: elapsedSince(started) }
  }

  const availability = channelAvailability(adapter.meta)
  if (!availability.available) {
    return { ok: false, message: availability.reason, elapsedMs: elapsedSince(started) }
  }

  const ctx: AdapterContext = {
    apiKey: apiKey.trim() || undefined,
    timeoutMs,
    retryCount: 0,
    cacheTtlMs: 0,
    now: new Date(),
    symbols: [...TEST_SYMBOLS],
  }

  try {
    let count = 0
    if (isQuoteAdapter(adapter)) {
      count = (await adapter.fetchQuotes([...TEST_SYMBOLS], ctx)).length
    } else if (isNewsAdapter(adapter)) {
      count = (await adapter.fetchNews(ctx)).length
    }
    if (count === 0) {
      return { ok: false, message: '接口连通但没有返回可用样本。', elapsedMs: elapsedSince(started) }
    }
    return { ok: true, message: `连接成功，返回 ${count} 条样本。`, elapsedMs: elapsedSince(started) }
  } catch (error) {
    if (error instanceof AdapterError) {
      const hint = CODE_HINT[error.code] ? `（${CODE_HINT[error.code]}）` : ''
      return { ok: false, message: `${error.message}${hint}`, elapsedMs: elapsedSince(started) }
    }
    const message = error instanceof Error ? error.message : '未知错误'
    return { ok: false, message: `请求失败：${message}`, elapsedMs: elapsedSince(started) }
  }
}
