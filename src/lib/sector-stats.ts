import type { UniverseStock } from '@/types'

export interface SectorStat {
  name: string
  count: number
  avg: number
  up: number
  down: number
}

/**
 * Group the cached full-market list by its industry field and average today's
 * pct change. Only the fields already present on `UniverseStock` are used;
 * "未分类" and rows without a finite pct are skipped. Shared by the dashboard
 * hot/cold cards and the full industry ranking page so both use one metric.
 */
export function computeSectorStats(stocks: UniverseStock[]): SectorStat[] {
  const groups = new Map<string, { count: number; sum: number; up: number; down: number }>()
  for (const stock of stocks) {
    const sector = stock.sector?.trim()
    if (!sector || sector === '未分类') continue
    if (stock.pctChange === undefined || !Number.isFinite(stock.pctChange)) continue
    const current = groups.get(sector) ?? { count: 0, sum: 0, up: 0, down: 0 }
    current.count += 1
    current.sum += stock.pctChange
    if (stock.pctChange > 0) current.up += 1
    if (stock.pctChange < 0) current.down += 1
    groups.set(sector, current)
  }
  return [...groups.entries()].map(([name, value]) => ({
    name,
    count: value.count,
    avg: value.sum / value.count,
    up: value.up,
    down: value.down,
  }))
}
