import { marketOfSymbol } from '@/lib/market'

/**
 * Company profile from Eastmoney F10 (verified 2026-11-05: HTTP 200,
 * `Access-Control-Allow-Origin: *`, ~370ms, JSON). Only facts returned by the
 * endpoint are shown; when the endpoint has no row we report "unavailable"
 * instead of inventing text.
 */
export interface CompanyProfile {
  symbol: string
  orgName: string
  regCapital: number | null
  foundDate: string
  regAddress: string
  website: string
  mainBusiness: string
  businessScope: string
  profile: string
  source: string
  asOf: string
}

interface F10Response {
  success?: boolean
  message?: string
  result?: { data?: Array<Record<string, unknown>> | null }
}

function secucodeOf(symbol: string): string {
  const market = marketOfSymbol(symbol)
  return `${symbol}.${market}`
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function dateOnly(value: unknown): string {
  const raw = text(value)
  return raw.slice(0, 10)
}

export async function fetchCompanyProfile(symbol: string, signal?: AbortSignal): Promise<CompanyProfile | null> {
  const secucode = secucodeOf(symbol)
  const params = new URLSearchParams({
    reportName: 'RPT_F10_BASIC_ORGINFO',
    columns: 'SECUCODE,SECURITY_CODE,ORG_NAME,REG_CAPITAL,REG_ADDRESS,ADDRESS,ORG_WEB,MAIN_BUSINESS,BUSINESS_SCOPE,FOUND_DATE,ORG_PROFILE',
    filter: `(SECUCODE="${secucode}")`,
    pageNumber: '1',
    pageSize: '1',
    source: 'HSF10',
    client: 'PC',
  })
  const url = `https://datacenter.eastmoney.com/securities/api/data/v1/get?${params.toString()}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  signal?.addEventListener('abort', () => controller.abort(), { once: true })
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Referer: 'https://quote.eastmoney.com/', Accept: 'application/json' },
    })
    if (!response.ok) return null
    const payload = (await response.json()) as F10Response
    const row = payload.result?.data?.[0]
    if (!payload.success || !row) return null
    const capital = Number(row.REG_CAPITAL)
    return {
      symbol,
      orgName: text(row.ORG_NAME) || symbol,
      regCapital: Number.isFinite(capital) ? capital : null,
      foundDate: dateOnly(row.FOUND_DATE),
      regAddress: text(row.REG_ADDRESS) || text(row.ADDRESS),
      website: text(row.ORG_WEB),
      mainBusiness: text(row.MAIN_BUSINESS),
      businessScope: text(row.BUSINESS_SCOPE),
      profile: text(row.ORG_PROFILE),
      source: '东方财富 F10 · RPT_F10_BASIC_ORGINFO',
      asOf: new Date().toISOString(),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
