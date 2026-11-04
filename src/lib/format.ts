/** Small formatting helpers shared by the presentation layer. */

export function formatPercent(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

export function formatPrice(value: number): string {
  return value >= 1000 ? value.toFixed(2) : value.toFixed(value >= 10 ? 2 : 3)
}

export function formatAmount(value: number): string {
  if (value >= 1e8) return `${(value / 1e8).toFixed(2)} 亿`
  if (value >= 1e4) return `${(value / 1e4).toFixed(1)} 万`
  return value.toFixed(0)
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime()
  const hours = diffMs / 3_600_000
  if (hours < 0) return '刚刚'
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} 分钟前`
  if (hours < 24) return `${Math.round(hours)} 小时前`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} 天前`
  return `${Math.round(days / 30)} 个月前`
}

export function pct(part: number, total: number): number {
  if (total <= 0) return 0
  return (part / total) * 100
}
