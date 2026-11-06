const CONTROL_CHARS = /[\u0000-\u001f\u007f\s]/

/**
 * Accept only absolute http(s) URLs without embedded credentials.
 * External strings come from third-party APIs and user-defined sources, so
 * they must never reach `href` as `javascript:` / `data:` / `file:` URLs.
 */
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw || CONTROL_CHARS.test(raw)) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

/** Normalise a company website into a safe absolute URL, or null when invalid. */
export function safeWebsite(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return safeExternalUrl(withScheme)
}

/**
 * Detect loopback / private / link-local hosts.
 * User-defined data sources must not be able to probe the user's LAN or
 * localhost services from inside the app.
 */
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number)
    if (octets.some((octet) => octet > 255)) return false
    const [a, b] = octets
    if (a === 0 || a === 127 || a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    return false
  }

  if (host === '::1' || host === '::') return true
  const ipv6 = /^[0-9a-f]{1,4}:/.test(host)
  if (ipv6) {
    const first = Number.parseInt(host.split(':')[0] || '0', 16)
    if ((first & 0xfe00) === 0xfc00) return true
    if ((first & 0xffc0) === 0xfe80) return true
    if (host.startsWith('::ffff:')) {
      const mapped = host.slice('::ffff:'.length)
      return /^\d/.test(mapped) && isPrivateHostname(mapped)
    }
  }
  return false
}

