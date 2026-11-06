#!/usr/bin/env node
/**
 * Minimal zero-dependency reverse proxy for stock-radar.
 *
 * Why it exists:
 * - Sina endpoints (`feed.mix.sina.com.cn`, `money.finance.sina.com.cn`,
 *   `hq.sinajs.cn`) do not send CORS headers, so a browser cannot call them
 *   directly in production.
 * - Deployments may prefer to keep third-party tokens (e.g. Tushare) on the
 *   server instead of in the browser.
 *
 * Usage:
 *   PORT=8787 ALLOWED_ORIGIN=http://localhost:5173 node server/proxy.mjs
 *   TUSHARE_TOKEN=xxx node server/proxy.mjs   # optional server-side token injection
 *
 * It also serves `dist/` when present, so `npm run build && npm run proxy`
 * yields a runnable single-process deployment. Secrets are read from env only.
 */
import { createServer } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PORT = Number(process.env.PORT ?? 8787)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173,http://localhost:4173')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
const TUSHARE_TOKEN = process.env.TUSHARE_TOKEN ?? ''
const RATE_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 40)
/**
 * Allow-list for user-defined sources, formatted as `host|pathPrefix` pairs:
 *   CUSTOM_SOURCE_ALLOWLIST="api.example.com|/v1,data.example.com|/api"
 * Requests are validated before any outbound call, so the proxy can never be
 * used as an open relay (SSRF) even though the target URL comes from the client.
 */
const CUSTOM_SOURCE_ALLOWLIST = (process.env.CUSTOM_SOURCE_ALLOWLIST ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [host, prefix = '/'] = entry.split('|')
    return { host: (host ?? '').trim().toLowerCase(), prefix: prefix.trim() || '/' }
  })
  .filter((entry) => entry.host)

const PRIVATE_IPV4 = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.)/

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

const buckets = new Map()

function allowOrigin(origin) {
  if (!origin) return null
  return ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*') ? origin : null
}

function corsHeaders(origin) {
  const allowed = allowOrigin(origin)
  if (!allowed) return {}
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

function rateLimited(ip) {
  const now = Date.now()
  const bucket = buckets.get(ip) ?? { tokens: RATE_LIMIT_PER_MINUTE, updated: now }
  const refill = ((now - bucket.updated) / 60_000) * RATE_LIMIT_PER_MINUTE
  bucket.tokens = Math.min(RATE_LIMIT_PER_MINUTE, bucket.tokens + refill)
  bucket.updated = now
  if (bucket.tokens < 1) {
    buckets.set(ip, bucket)
    return true
  }
  bucket.tokens -= 1
  buckets.set(ip, bucket)
  return false
}

function upstreamFor(url) {
  if (url.pathname.startsWith('/api/sina-kline/')) {
    return {
      hostname: 'money.finance.sina.com.cn',
      path: url.pathname.replace('/api/sina-kline', '') + url.search,
      headers: { Referer: 'https://finance.sina.com.cn/' },
    }
  }
  if (url.pathname.startsWith('/api/sina-hq/')) {
    return {
      hostname: 'hq.sinajs.cn',
      path: url.pathname.replace('/api/sina-hq', '') + url.search,
      headers: { Referer: 'https://finance.sina.com.cn/' },
    }
  }
  if (url.pathname.startsWith('/api/sina')) {
    return {
      hostname: 'feed.mix.sina.com.cn',
      path: url.pathname.replace(/^\/api\/sina/, '') + url.search,
      headers: { Referer: 'https://finance.sina.com.cn/' },
    }
  }
  if (url.pathname === '/api/tushare') {
    return { hostname: 'api.tushare.pro', path: '/', headers: {} }
  }
  return null
}

function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let chunked = ''
    req.on('data', (chunk) => {
      chunked += chunk
      if (chunked.length > 1_000_000) {
        rejectBody(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => resolveBody(chunked))
    req.on('error', rejectBody)
  })
}

function customUpstream(target) {
  let parsed
  try {
    parsed = new URL(target)
  } catch {
    return { error: 'target 不是合法 URL' }
  }
  if (parsed.protocol !== 'https:') return { error: '仅允许 https 目标' }
  if (parsed.username || parsed.password) return { error: 'URL 中不允许携带凭据' }
  const hostname = parsed.hostname.toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    PRIVATE_IPV4.test(hostname) ||
    hostname.startsWith('[') ||
    hostname.endsWith('.internal')
  ) {
    return { error: '禁止访问内网 / 本机地址' }
  }
  const allowed = CUSTOM_SOURCE_ALLOWLIST.find(
    (entry) => hostname === entry.host || hostname.endsWith(`.${entry.host}`),
  )
  if (!allowed) {
    return { error: `域名 ${hostname} 不在白名单，请配置 CUSTOM_SOURCE_ALLOWLIST` }
  }
  // `..` is normalised by the URL parser, but encoded variants survive and
  // would let a caller escape the allowed path prefix on the upstream.
  if (parsed.pathname.includes('..') || /%2e|\\/i.test(parsed.pathname)) {
    return { error: '目标路径包含非法片段' }
  }
  if (!parsed.pathname.startsWith(allowed.prefix)) {
    return { error: `路径 ${parsed.pathname} 不在允许前缀 ${allowed.prefix}` }
  }
  return {
    upstream: {
      hostname,
      path: `${parsed.pathname}${parsed.search}`,
      // Never forward cookies, Authorization or arbitrary user headers.
      headers: { Accept: 'application/json', 'User-Agent': 'stock-radar-proxy/1.0' },
    },
  }
}

function readSmallBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 100_000) {
        rejectBody(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => resolveBody(body))
    req.on('error', rejectBody)
  })
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}

/**
 * Copy only safe, content-related upstream headers. `set-cookie`, `location`,
 * `access-control-*` and hop-by-hop headers must never reach our origin.
 */
const FORWARDED_RESPONSE_HEADERS = new Set([
  'content-type',
  'content-encoding',
  'content-language',
  'cache-control',
  'expires',
  'etag',
  'last-modified',
  'vary',
])

function safeResponseHeaders(upstreamHeaders, cors) {
  const result = {}
  for (const [key, value] of Object.entries(upstreamHeaders ?? {})) {
    if (FORWARDED_RESPONSE_HEADERS.has(key.toLowerCase()) && value !== undefined) {
      result[key] = value
    }
  }
  return { ...result, ...cors }
}

async function serveStatic(url, res) {
  const relative = url.pathname === '/' ? '/index.html' : url.pathname
  const filePath = join(ROOT, 'dist', relative)
  try {
    const info = await stat(filePath)
    if (info.isFile()) {
      const content = await readFile(filePath)
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' })
      res.end(content)
      return
    }
  } catch {
    // Fall through to index.html for hash-routed SPA paths.
  }
  try {
    const index = await readFile(join(ROOT, 'dist', 'index.html'))
    res.writeHead(200, { 'Content-Type': MIME['.html'] })
    res.end(index)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('dist/index.html not found. Run `npm run build` first, or use the Vite dev server with its built-in proxy.')
  }
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  if (!url.pathname.startsWith('/api/')) {
    await serveStatic(url, res)
    return
  }

  const ip = req.socket.remoteAddress ?? 'unknown'
  if (rateLimited(ip)) {
    sendJson(res, 429, { error: 'rate_limited', message: '请求过于频繁，请稍后再试（默认 40 次/分钟）' })
    return
  }

  if (url.pathname === '/api/custom') {
    if (req.method !== 'GET' && req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed', message: '仅支持 GET / POST' })
      return
    }
    const target = url.searchParams.get('target')
    if (!target) {
      sendJson(res, 400, { error: 'missing_target', message: '缺少 target 参数' })
      return
    }
    const checked = customUpstream(target)
    if (checked.error) {
      sendJson(res, 403, { error: 'target_rejected', message: checked.error })
      return
    }
    let body = ''
    if (req.method === 'POST') {
      try {
        body = await readSmallBody(req)
      } catch {
        sendJson(res, 400, { error: 'bad_request', message: '请求体过大或读取失败' })
        return
      }
    }
    const headers = {
      ...checked.upstream.headers,
      ...cors,
      ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
    }
    const proxyReq = httpsRequest(
      {
        hostname: checked.upstream.hostname,
        path: checked.upstream.path,
        method: req.method,
        headers,
        timeout: 20_000,
      },
      (proxyRes) => {
        let received = 0
        proxyRes.on('data', (chunk) => {
          received += chunk.length
          if (received > 5_000_000) proxyRes.destroy(new Error('upstream response too large'))
        })
        res.writeHead(proxyRes.statusCode ?? 502, safeResponseHeaders(proxyRes.headers, cors))
        proxyRes.pipe(res)
      },
    )
    proxyReq.on('timeout', () => proxyReq.destroy(new Error('upstream timeout')))
    proxyReq.on('error', (error) => {
      if (!res.headersSent) sendJson(res, 502, { error: 'upstream_error', message: error.message })
      else res.end()
    })
    if (body) proxyReq.write(body)
    proxyReq.end()
    return
  }

  const upstream = upstreamFor(url)
  if (!upstream) {
    sendJson(res, 404, { error: 'unknown_route', message: `未允许的代理路径：${url.pathname}` })
    return
  }

  let body = ''
  if (req.method === 'POST' && url.pathname === '/api/tushare') {
    try {
      body = await readBody(req)
      if (TUSHARE_TOKEN) {
        const payload = JSON.parse(body || '{}')
        if (!payload.token) payload.token = TUSHARE_TOKEN
        body = JSON.stringify(payload)
      }
    } catch {
      sendJson(res, 400, { error: 'bad_request', message: 'Tushare 请求体必须是 JSON' })
      return
    }
  }

  const headers = {
    ...upstream.headers,
    ...cors,
    ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
  }

  const proxyReq = httpsRequest(
    {
      hostname: upstream.hostname,
      path: upstream.path,
      method: req.method,
      headers,
      timeout: 20_000,
    },
    (proxyRes) => {
      const responseHeaders = safeResponseHeaders(proxyRes.headers, cors)
      res.writeHead(proxyRes.statusCode ?? 502, responseHeaders)
      proxyRes.pipe(res)
    },
  )

  proxyReq.on('timeout', () => {
    proxyReq.destroy(new Error('upstream timeout'))
  })
  proxyReq.on('error', (error) => {
    sendJson(res, 502, { error: 'upstream_error', message: error.message })
  })

  if (body) proxyReq.write(body)
  proxyReq.end()
})

export { customUpstream, safeResponseHeaders, FORWARDED_RESPONSE_HEADERS }

// Only start listening when executed directly, so tests can import the helpers.
const isMain = process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false
if (isMain) {
  server.listen(PORT, () => {
    console.log(`[stock-radar] proxy listening on http://localhost:${PORT}`)
    console.log(`[stock-radar] allowed origins: ${ALLOWED_ORIGINS.join(', ')}`)
    console.log(`[stock-radar] tushare server token: ${TUSHARE_TOKEN ? 'configured' : 'not set'}`)
  })
}
