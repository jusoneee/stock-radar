/**
 * Minimal dot-path / JSONPath-subset resolver.
 *
 * Supported syntax:
 * - `data.price`, `$.data.price`
 * - `data.klines[0].close`
 * - `data.klines[*].close` (a wildcard maps the following path over an array)
 *
 * It intentionally stops there: no filters, no recursive descent, no scripts.
 * A small, predictable grammar keeps user-supplied paths safe to evaluate.
 */

export function tokenizePath(path: string): string[] {
  const clean = path.trim().replace(/^\$\.?/, '')
  if (!clean) return []
  const tokens: string[] = []
  const pattern = /([^.[\]]+)|\[(\*|\d+|'[^']*'|"[^"]*")\]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(clean)) !== null) {
    if (match[1]) tokens.push(match[1])
    else if (match[2]) tokens.push(match[2].replace(/^['"]|['"]$/g, ''))
  }
  return tokens
}

/** Keys that could reach the prototype chain when walking plain objects. */
const FORBIDDEN_TOKENS = new Set(['__proto__', 'prototype', 'constructor'])

/** Reject paths that try to traverse the prototype chain. */
export function isSafeFieldPath(path: string): boolean {
  return tokenizePath(path).every((token) => token === '*' || !FORBIDDEN_TOKENS.has(token))
}

export function resolvePath(root: unknown, path: string): unknown {
  const tokens = tokenizePath(path)
  return walk(root, tokens)
}

function walk(value: unknown, tokens: string[]): unknown {
  if (tokens.length === 0) return value
  if (value === null || value === undefined) return undefined

  const [head, ...rest] = tokens
  if (FORBIDDEN_TOKENS.has(head)) return undefined
  if (head === '*') {
    if (Array.isArray(value)) {
      return value.map((item) => walk(item, rest)).filter((item) => item !== undefined)
    }
    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>)
        .map((item) => walk(item, rest))
        .filter((item) => item !== undefined)
    }
    return undefined
  }

  if (Array.isArray(value)) {
    const index = Number(head)
    if (!Number.isInteger(index) || index < 0) return undefined
    return walk(value[index], rest)
  }

  if (typeof value === 'object') {
    return walk((value as Record<string, unknown>)[head], rest)
  }

  return undefined
}

/** Coerce a mapped value to a finite number; returns null when unusable. */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[%,，\s]/g, '')
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** Coerce a mapped value to a trimmed string. */
export function toText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/** Accept `YYYY-MM-DD`, `YYYY/MM/DD`, ISO timestamps, or seconds/milliseconds. */
export function toDateKey(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const match = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(trimmed)
    if (match) return `${match[1]}-${match[2]}-${match[3]}`
    const parsed = Date.parse(trimmed)
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10)
    return ''
  }
  const numeric = toNumber(value)
  if (numeric === null || numeric <= 0) return ''
  const ms = numeric > 1e12 ? numeric : numeric * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

/** Accept ISO timestamps, seconds/milliseconds, or plain dates. */
export function toIsoTime(value: unknown, fallback: Date): string {
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
    return fallback.toISOString()
  }
  const numeric = toNumber(value)
  if (numeric === null || numeric <= 0) return fallback.toISOString()
  const ms = numeric > 1e12 ? numeric : numeric * 1000
  return new Date(ms).toISOString()
}
