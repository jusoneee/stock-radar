import { fetchJson } from '@/adapters/http'

/**
 * Sector-board sparkline source.
 *
 * The hot/cold ranking is computed locally from the Eastmoney full-market
 * universe (industry field + daily pct). To draw the intraday trend of the same
 * industry we map its name to Eastmoney's industry board code and request the
 * board's one-day trend line from the public `push2his` host. Both endpoints
 * are the same provider as the rest of the app, need no key, and echo the
 * caller origin. Missing mappings/requests degrade to a placeholder in the UI.
 */
const BOARD_LIST_BASE = 'https://push2.eastmoney.com/api/qt/clist/get'
const TRENDS_BASE = 'https://push2his.eastmoney.com/api/qt/stock/trends2/get'

interface BoardRow {
  f12?: string
  f14?: string
}

interface BoardResponse {
  data?: {
    total?: number
    diff?: BoardRow[] | Record<string, BoardRow>
  }
}

interface TrendsResponse {
  data?: {
    trends?: string[]
  }
}

let boardMapPromise: Promise<Map<string, string>> | null = null

function rowsOf(payload: BoardResponse): BoardRow[] {
  const diff = payload.data?.diff
  return Array.isArray(diff) ? diff : Object.values(diff ?? {})
}

async function fetchBoardPage(page: number): Promise<BoardResponse> {
  const url =
    `${BOARD_LIST_BASE}?pn=${page}&pz=100&po=1&np=1&fltt=2&invt=2&fid=f12` +
    '&fs=m:90+t:2&fields=f12,f14'
  return fetchJson<BoardResponse>(url, {
    timeoutMs: 8000,
    retryCount: 1,
    cacheTtlMs: 0,
    now: new Date(),
  })
}

async function loadBoardMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const first = await fetchBoardPage(1)
  for (const row of rowsOf(first)) {
    if (row.f12 && row.f14) map.set(row.f14.trim(), row.f12)
  }
  const total = first.data?.total ?? 0
  const pages = Math.min(8, Math.ceil(total / 100))
  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, index) => fetchBoardPage(index + 2)),
    )
    for (const payload of rest) {
      for (const row of rowsOf(payload)) {
        if (row.f12 && row.f14) map.set(row.f14.trim(), row.f12)
      }
    }
  }
  return map
}

/** Cached session-wide industry-name → Eastmoney board-code mapping. */
export function fetchSectorBoardMap(): Promise<Map<string, string>> {
  if (!boardMapPromise) {
    boardMapPromise = loadBoardMap().catch((error) => {
      boardMapPromise = null
      throw error
    })
  }
  return boardMapPromise
}

/** One-day intraday trend of an industry board, expressed as close prices. */
export async function fetchSectorTrend(boardCode: string): Promise<number[]> {
  const url =
    `${TRENDS_BASE}?secid=90.${boardCode}` +
    '&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14' +
    '&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ndays=1&iscr=0&iscca=0'
  const payload = await fetchJson<TrendsResponse>(url, {
    timeoutMs: 8000,
    retryCount: 0,
    cacheTtlMs: 0,
    now: new Date(),
  })
  const trends = payload.data?.trends ?? []
  const points = trends
    .map((row) => Number(row.split(',')[2]))
    .filter((value) => Number.isFinite(value))
  if (points.length < 2) throw new Error('板块分时数据不可用')
  return points
}
