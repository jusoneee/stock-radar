import type { ChannelMeta } from '@/types'

/**
 * Build-time capability flag. Defaults to false because the project ships as a
 * pure static site; set `VITE_PROXY_AVAILABLE=true` only when the optional
 * same-origin proxy (server/proxy.mjs) is part of the deployment.
 */
export const PROXY_AVAILABLE = import.meta.env.VITE_PROXY_AVAILABLE === 'true'

export interface UnavailableChannel {
  id: string
  name: string
  reason: string
}

/** Whether a channel can run in the current deployment, and why not. */
export function channelAvailability(meta: ChannelMeta): { available: boolean; reason: string } {
  if (!meta.requiresProxy || PROXY_AVAILABLE) return { available: true, reason: '' }
  return {
    available: false,
    reason:
      '纯静态部署不含同源 /api 代理；该渠道无 CORS 响应头，浏览器无法直接请求，已自动跳过。',
  }
}

export function isChannelAvailable(meta: ChannelMeta): boolean {
  return channelAvailability(meta).available
}

export function unavailableReasonOf(meta: ChannelMeta): string {
  return channelAvailability(meta).reason
}

export function unavailableList(metas: ChannelMeta[]): UnavailableChannel[] {
  const result: UnavailableChannel[] = []
  for (const meta of metas) {
    const state = channelAvailability(meta)
    if (!state.available) result.push({ id: meta.id, name: meta.name, reason: state.reason })
  }
  return result
}
