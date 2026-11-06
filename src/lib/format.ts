/** Small formatting helpers shared by the presentation layer. */

export function formatPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value >= 1e8) return `${(value / 1e8).toFixed(2)} 亿`
  if (value >= 1e4) return `${(value / 1e4).toFixed(1)} 万`
  return value.toFixed(0)
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const stamp = new Date(iso).getTime()
  if (!Number.isFinite(stamp)) return '—'
  const diffMs = now.getTime() - stamp
  const hours = diffMs / 3_600_000
  if (hours < 0) return '刚刚'
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} 分钟前`
  if (hours < 24) return `${Math.round(hours)} 小时前`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} 天前`
  return `${Math.round(days / 30)} 个月前`
}

export function pct(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0
  return (part / total) * 100
}
