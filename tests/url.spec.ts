import { describe, expect, it } from 'vitest'
import { isPrivateHostname, safeExternalUrl, safeWebsite } from '@/lib/url'

describe('safeExternalUrl', () => {
  it('keeps absolute http(s) URLs', () => {
    expect(safeExternalUrl('https://example.test/a?b=1')).toBe('https://example.test/a?b=1')
    expect(safeExternalUrl('http://example.test:8080/news')).toBe('http://example.test:8080/news')
  })

  it('rejects script, data, file and relative URLs', () => {
    for (const raw of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'mailto:a@b.test',
      '/relative/path',
      'example.test/news',
    ]) {
      expect(safeExternalUrl(raw)).toBeNull()
    }
  })

  it('rejects embedded credentials and control characters', () => {
    expect(safeExternalUrl('https://user:pass@example.test/a')).toBeNull()
    expect(safeExternalUrl('https://example.test/\nalert(1)')).toBeNull()
    expect(safeExternalUrl('https://example.test/\u0000')).toBeNull()
    expect(safeExternalUrl('   ')).toBeNull()
    expect(safeExternalUrl(null)).toBeNull()
    expect(safeExternalUrl(42)).toBeNull()
  })
})

describe('isPrivateHostname', () => {
  it('flags loopback, LAN and link-local ranges', () => {
    for (const host of ['localhost', '127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.0.5', '169.254.1.1', '::1', 'fd00::1']) {
      expect(isPrivateHostname(host)).toBe(true)
    }
    for (const host of ['example.test', '203.0.113.9', '172.32.0.1', '8.8.8.8']) {
      expect(isPrivateHostname(host)).toBe(false)
    }
  })
})

describe('safeWebsite', () => {
  it('normalises bare domains to https', () => {
    expect(safeWebsite('example.test')).toBe('https://example.test/')
    expect(safeWebsite('www.example.test/about')).toBe('https://www.example.test/about')
  })

  it('keeps an existing scheme but refuses unsafe ones', () => {
    expect(safeWebsite('http://example.test')).toBe('http://example.test/')
    expect(safeWebsite('javascript:alert(1)')).toBeNull()
    expect(safeWebsite('https://user:pass@example.test')).toBeNull()
    expect(safeWebsite('')).toBeNull()
  })
})
