<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useUniverseStore } from '@/stores/universe'
import { MAX_WATCHLIST, useWatchlistStore } from '@/stores/watchlist'
import { useCompareStore, MAX_COMPARE, MIN_COMPARE } from '@/stores/compare'
import type { UniverseStock } from '@/types'
import { formatAmount, formatPercent, formatPrice } from '@/lib/format'
import { pinyinInitials } from '@/lib/pinyin'
import TrendIcon from '@/components/TrendIcon.vue'
import EmptyState from '@/components/EmptyState.vue'

type RangeKey = 'price' | 'volumeRatio' | 'turnoverRate' | 'marketCap'
type TrendValue = 'up' | 'down' | 'flat'
type PnlValue = 'profit' | 'loss' | 'breakeven'
type SortKey = RangeKey | 'pctChange' | 'trend' | 'pnl'
type Direction = 'asc' | 'desc'
type ConditionKey = RangeKey | 'trend' | 'pnl'
type ColumnKey = 'sector' | 'price' | 'pctChange' | 'volumeRatio' | 'turnoverRate' | 'marketCap' | 'trend' | 'pnl'

const LOCK_KEY = 'stock-radar:screener-locks:v1'
const COLUMN_KEY = 'stock-radar:screener-columns:v1'
const PRESET_KEY = 'stock-radar:screener-presets:v1'
const WIDTH_KEY = 'stock-radar:screener-col-widths:v1'

const columnMeta: Array<{ key: ColumnKey; label: string }> = [
  { key: 'sector', label: '行业' },
  { key: 'price', label: '价格' },
  { key: 'pctChange', label: '涨跌幅' },
  { key: 'volumeRatio', label: '量比' },
  { key: 'turnoverRate', label: '换手率' },
  { key: 'marketCap', label: '总市值' },
  { key: 'trend', label: '趋势' },
  { key: 'pnl', label: '盈亏' },
]

function defaultColumns(): Record<ColumnKey, boolean> {
  return {
    sector: true,
    price: true,
    pctChange: true,
    volumeRatio: true,
    turnoverRate: true,
    marketCap: true,
    trend: true,
    pnl: true,
  }
}

function loadColumns(): Record<ColumnKey, boolean> {
  const fallback = defaultColumns()
  try {
    const raw = localStorage.getItem(COLUMN_KEY)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return fallback
    for (const meta of columnMeta) {
      const value = (parsed as Record<string, unknown>)[meta.key]
      if (typeof value === 'boolean') fallback[meta.key] = value
    }
  } catch {
    localStorage.removeItem(COLUMN_KEY)
  }
  return fallback
}

function defaultLocks(): Record<ConditionKey, boolean> {
  return { price: false, volumeRatio: false, turnoverRate: false, marketCap: false, trend: false, pnl: false }
}

function loadLocks(): Record<ConditionKey, boolean> {
  const fallback = defaultLocks()
  try {
    const raw = localStorage.getItem(LOCK_KEY)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return fallback
    for (const key of Object.keys(fallback) as ConditionKey[]) {
      if (typeof (parsed as Record<string, unknown>)[key] === 'boolean') {
        fallback[key] = (parsed as Record<string, boolean>)[key] as boolean
      }
    }
  } catch {
    localStorage.removeItem(LOCK_KEY)
  }
  return fallback
}

interface RangeState {
  enabled: boolean
  /** `v-model` on `type="number"` yields numbers, so both shapes are accepted. */
  min: string | number
  max: string | number
}

interface RangeMeta {
  key: RangeKey
  label: string
  hint: string
  unit: string
  step: string
}

interface SortRule {
  id: number
  key: SortKey
  direction: Direction
}

interface PresetRange {
  enabled: boolean
  min: string
  max: string
}

interface PresetFilters {
  ranges: Record<RangeKey, PresetRange>
  trend: { enabled: boolean; value: TrendValue }
  pnl: { enabled: boolean; value: PnlValue }
  missingPolicy: 'exclude' | 'pass'
}

interface ScreenerPreset {
  id: string
  name: string
  filters: PresetFilters
  sort: Array<{ key: SortKey; direction: Direction }>
  createdAt: string
}

interface Row {
  stock: UniverseStock
  trend?: TrendValue
  pnl?: PnlValue
}

const universe = useUniverseStore()
const watchlist = useWatchlistStore()
const compare = useCompareStore()
const router = useRouter()
const actionNotice = ref('')

/* Condition locks: only affect what 「一键重置」 clears, persisted locally. */
const locks = reactive<Record<ConditionKey, boolean>>(loadLocks())
const lockedCount = computed(() => Object.values(locks).filter(Boolean).length)

function persistLocks(): void {
  localStorage.setItem(LOCK_KEY, JSON.stringify(locks))
}

function toggleLock(key: ConditionKey): void {
  locks[key] = !locks[key]
  persistLocks()
}

/* Column visibility, persisted locally. */
const columns = reactive<Record<ColumnKey, boolean>>(loadColumns())
const columnPanelOpen = ref(false)

function toggleColumn(key: ColumnKey): void {
  columns[key] = !columns[key]
  localStorage.setItem(COLUMN_KEY, JSON.stringify(columns))
}

function resetColumns(): void {
  Object.assign(columns, defaultColumns())
  localStorage.setItem(COLUMN_KEY, JSON.stringify(columns))
}

const hiddenColumnCount = computed(() => columnMeta.filter((meta) => !columns[meta.key]).length)

/* Column widths: drag the header edge on desktop, persisted locally. */
type WidthKey = 'name' | ColumnKey

/** Only dragged columns carry an explicit width; the rest keep the natural layout. */
type ColWidths = Partial<Record<WidthKey, number>>

const MIN_COL_WIDTH = 56
const MAX_COL_WIDTH = 420

function loadWidths(): ColWidths {
  const widths: ColWidths = {}
  try {
    const raw = localStorage.getItem(WIDTH_KEY)
    if (!raw) return widths
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return widths
    for (const key of Object.keys(parsed as Record<string, unknown>) as WidthKey[]) {
      const value = (parsed as Record<string, unknown>)[key]
      if (typeof value === 'number' && Number.isFinite(value)) {
        widths[key] = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.round(value)))
      }
    }
  } catch {
    localStorage.removeItem(WIDTH_KEY)
  }
  return widths
}

const colWidths = reactive<ColWidths>(loadWidths())

function thStyle(key: WidthKey): Record<string, string> {
  const width = colWidths[key]
  return width ? { width: `${width}px` } : {}
}

let resizing: { key: WidthKey; startX: number; startWidth: number } | null = null

function startResize(key: WidthKey, event: PointerEvent): void {
  event.preventDefault()
  event.stopPropagation()
  const header = (event.currentTarget as HTMLElement | null)?.closest('th')
  resizing = {
    key,
    startX: event.clientX,
    startWidth: header?.getBoundingClientRect().width ?? MIN_COL_WIDTH,
  }
  document.addEventListener('pointermove', onResizeMove)
  document.addEventListener('pointerup', onResizeEnd)
  document.addEventListener('pointercancel', onResizeEnd)
  document.body.classList.add('is-col-resizing')
}

function onResizeMove(event: PointerEvent): void {
  if (!resizing) return
  const next = resizing.startWidth + (event.clientX - resizing.startX)
  colWidths[resizing.key] = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.round(next)))
}

function onResizeEnd(): void {
  if (resizing) localStorage.setItem(WIDTH_KEY, JSON.stringify(colWidths))
  resizing = null
  document.removeEventListener('pointermove', onResizeMove)
  document.removeEventListener('pointerup', onResizeEnd)
  document.removeEventListener('pointercancel', onResizeEnd)
  document.body.classList.remove('is-col-resizing')
}

/* Toolbar popovers: only one open at a time, closed by outside clicks. */
const activePop = ref<'filter' | 'sort' | 'preset' | null>(null)
const toolsRef = ref<HTMLElement | null>(null)
const maskTop = ref(0)

/* Frozen first two columns (加入 / 代码·名称). */
const tableWrapRef = ref<HTMLElement | null>(null)
const tableScrolledX = ref(false)

function togglePop(pop: 'filter' | 'sort' | 'preset'): void {
  activePop.value = activePop.value === pop ? null : pop
  updateMaskTop()
}

/** The mask starts under the toolbar row so the row itself stays bright. */
function updateMaskTop(): void {
  if (!toolsRef.value) return
  maskTop.value = Math.max(0, Math.round(toolsRef.value.getBoundingClientRect().bottom))
}

function onTableScroll(event: Event): void {
  tableScrolledX.value = (event.target as HTMLElement).scrollLeft > 0
}

/** Frozen column offset must match the rendered first column width. */
function syncStickyOffsets(): void {
  const wrap = tableWrapRef.value
  if (!wrap) return
  const first = wrap.querySelector('thead th.join-col') as HTMLElement | null
  if (!first) return
  wrap.style.setProperty('--join-col-w', `${Math.round(first.getBoundingClientRect().width)}px`)
}

function onDocumentPointer(event: Event): void {
  const target = event.target as HTMLElement | null
  if (!target?.closest('.screen-tools') || target.closest('.tool-mask')) activePop.value = null
  if (!target?.closest('.add-pop') && !target?.closest('.join-cell')) closeAddPop()
  if (!target?.closest('.search-picker')) closeCandidates()
}

function onViewportChange(): void {
  closeAddPop()
  if (activePop.value) updateMaskTop()
  syncStickyOffsets()
}

/** Scrolling inside the group bubble (list or scrollbar) must not close it. */
function onViewportScroll(event: Event): void {
  const target = event.target
  // Page/document scroll has no closest(); only inner scrollable areas are exempt.
  if (target instanceof Element && target.closest('.add-pop')) return
  closeAddPop()
  if (activePop.value) updateMaskTop()
}

/* ---------- add-to-group bubble ---------- */
const addTarget = ref<{ stock: UniverseStock; top: number; left: number } | null>(null)
const addPopRef = ref<HTMLElement | null>(null)
const addNewGroupName = ref('')
const addError = ref('')

function openAddGroup(stock: UniverseStock, event: MouseEvent): void {
  if (addTarget.value?.stock.symbol === stock.symbol) {
    closeAddPop()
    return
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  addTarget.value = { stock, top: rect.bottom + 6, left: rect.left }
  addNewGroupName.value = ''
  addError.value = ''
  // Measure the rendered bubble so the flip/clamp uses its real size.
  void nextTick(() => positionAddPop(rect))
}

/** Left-aligned with the clicked cell; flips above it only when space is short. */
function positionAddPop(rect: DOMRect): void {
  const target = addTarget.value
  const pop = addPopRef.value
  if (!target || !pop) return
  const margin = 8
  const gap = 6
  const width = pop.offsetWidth
  const height = pop.offsetHeight
  const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin))
  const spaceBelow = window.innerHeight - rect.bottom - gap - margin
  const spaceAbove = rect.top - gap - margin
  const openUp = spaceBelow < height && spaceAbove > spaceBelow
  const rawTop = openUp ? rect.top - gap - height : rect.bottom + gap
  const top = Math.min(Math.max(margin, rawTop), Math.max(margin, window.innerHeight - height - margin))
  addTarget.value = { stock: target.stock, top, left }
}

function closeAddPop(): void {
  addTarget.value = null
}

function isInGroup(symbol: string, groupId: string): boolean {
  return watchlist.groupIdsOf(symbol).includes(groupId)
}

/** Clicking an active group removes the stock from it, otherwise it joins. */
function toggleGroupOption(groupId: string): void {
  const target = addTarget.value
  if (!target) return
  addError.value = ''
  const symbol = target.stock.symbol
  const groupName = watchlist.groups.find((group) => group.id === groupId)?.name ?? ''
  if (!groupName) return
  if (!watchlist.has(symbol)) {
    const result = watchlist.add({
      symbol,
      name: target.stock.name,
      market: target.stock.market,
      groupIds: [groupId],
    })
    actionNotice.value =
      result === 'full'
        ? `自选池已满（上限 ${MAX_WATCHLIST} 只），请先清理旧自选。`
        : result === 'added'
          ? `已加入自选「${target.stock.name}」· 分组：${groupName}`
          : `「${target.stock.name}」已在自选`
    return
  }
  const wasIn = isInGroup(symbol, groupId)
  watchlist.toggleGroup(symbol, groupId)
  actionNotice.value = wasIn
    ? `已从「${groupName}」移除：${target.stock.name}`
    : `已加入「${groupName}」：${target.stock.name}`
}

/** The footer is fixed outside the scrolling list, so new groups are always reachable. */
function createGroupForTarget(): void {
  const target = addTarget.value
  if (!target) return
  const name = addNewGroupName.value.trim().slice(0, 12)
  if (!name) {
    addError.value = '请输入分组名称'
    return
  }
  const groupId = watchlist.addGroup(name)
  if (!groupId) {
    addError.value = '分组名称为空或已存在'
    return
  }
  const symbol = target.stock.symbol
  if (!watchlist.has(symbol)) {
    const result = watchlist.add({
      symbol,
      name: target.stock.name,
      market: target.stock.market,
      groupIds: [groupId],
    })
    if (result === 'full') {
      addError.value = `自选池已满（上限 ${MAX_WATCHLIST} 只），请先清理旧自选。`
      return
    }
    addNewGroupName.value = ''
    actionNotice.value = `已加入自选「${target.stock.name}」· 分组：${name}`
    return
  }
  watchlist.toggleGroup(symbol, groupId)
  addNewGroupName.value = ''
  addError.value = ''
  actionNotice.value = `已加入「${name}」：${target.stock.name}`
}

/** Groups shown on the stacked marker; kept in sync with the watchlist page. */
function watchGroup(symbol: string): string {
  const names = watchlist.groupNamesOf(symbol)
  return names.length ? names.join('、') : '未分组'
}

/** Only values actually present in the list are compared; units are documented in the UI. */
const rangeMeta: RangeMeta[] = [
  { key: 'price', label: '价格', hint: '最新成交价', unit: '元', step: '0.01' },
  { key: 'volumeRatio', label: '量比', hint: '当日每分钟成交量 / 过去五日平均', unit: '倍', step: '0.01' },
  { key: 'turnoverRate', label: '换手率', hint: '当日换手比例', unit: '%', step: '0.01' },
  { key: 'marketCap', label: '市值', hint: '总市值（输入单位为亿元）', unit: '亿元', step: '1' },
]

const ranges = reactive<Record<RangeKey, RangeState>>({
  price: { enabled: false, min: '', max: '' },
  volumeRatio: { enabled: false, min: '', max: '' },
  turnoverRate: { enabled: false, min: '', max: '' },
  marketCap: { enabled: false, min: '', max: '' },
})

const trendFilter = reactive({ enabled: false, value: 'up' as TrendValue })
const pnlFilter = reactive({ enabled: false, value: 'profit' as PnlValue })
const missingPolicy = ref<'exclude' | 'pass'>('exclude')
const visibleLimit = ref(100)

let ruleSeq = 1
const sortRules = ref<SortRule[]>([{ id: ruleSeq, key: 'pctChange', direction: 'desc' }])

const sortOptions: Array<{ key: SortKey; label: string }> = [
  { key: 'pctChange', label: '涨跌幅' },
  { key: 'price', label: '价格' },
  { key: 'volumeRatio', label: '量比' },
  { key: 'turnoverRate', label: '换手率' },
  { key: 'marketCap', label: '总市值' },
  { key: 'trend', label: '趋势' },
  { key: 'pnl', label: '盈亏状态' },
]

const trendOptions: Array<{ value: TrendValue; label: string }> = [
  { value: 'up', label: '上涨' },
  { value: 'flat', label: '平盘' },
  { value: 'down', label: '下跌' },
]

const pnlOptions: Array<{ value: PnlValue; label: string }> = [
  { value: 'profit', label: '盈利' },
  { value: 'breakeven', label: '持平' },
  { value: 'loss', label: '亏损' },
]

function num(value: string | number): number | undefined {
  if (value === '' || value === null) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function rangeOf(stock: UniverseStock, key: RangeKey): number | undefined {
  switch (key) {
    case 'price':
      return stock.price
    case 'volumeRatio':
      return stock.volumeRatio
    case 'turnoverRate':
      return stock.turnoverRate
    case 'marketCap':
      return stock.marketCap === undefined ? undefined : stock.marketCap / 1e8
  }
}

function trendOf(stock: UniverseStock): TrendValue | undefined {
  if (stock.pctChange === undefined || !Number.isFinite(stock.pctChange)) return undefined
  if (stock.pctChange > 0) return 'up'
  if (stock.pctChange < 0) return 'down'
  return 'flat'
}

/**
 * The shared list carries no cost-basis field, so "盈亏状态" is derived from
 * today's change: up = profit, down = loss, flat = breakeven. This rule is
 * stated in the UI so results stay explainable.
 */
function pnlOf(stock: UniverseStock): PnlValue | undefined {
  const trend = trendOf(stock)
  if (!trend) return undefined
  return trend === 'up' ? 'profit' : trend === 'down' ? 'loss' : 'breakeven'
}

const rows = computed<Row[]>(() =>
  universe.items.map((stock) => ({ stock, trend: trendOf(stock), pnl: pnlOf(stock) })),
)

function inRange(value: number, state: RangeState): boolean {
  const min = num(state.min)
  const max = num(state.max)
  const low = min === undefined ? -Infinity : Math.min(min, max ?? min)
  const high = max === undefined ? Infinity : Math.max(max, min ?? max)
  return value >= low && value <= high
}

function matches(row: Row): boolean {
  const { stock } = row

  for (const meta of rangeMeta) {
    const state = ranges[meta.key]
    if (!state.enabled) continue
    const value = rangeOf(stock, meta.key)
    if (value === undefined || !Number.isFinite(value)) {
      if (missingPolicy.value === 'exclude') return false
      continue
    }
    if (!inRange(value, state)) return false
  }

  if (trendFilter.enabled) {
    if (!row.trend) {
      if (missingPolicy.value === 'exclude') return false
    } else if (row.trend !== trendFilter.value) {
      return false
    }
  }

  if (pnlFilter.enabled) {
    if (!row.pnl) {
      if (missingPolicy.value === 'exclude') return false
    } else if (row.pnl !== pnlFilter.value) {
      return false
    }
  }

  return true
}

const trendRank: Record<TrendValue, number> = { down: 0, flat: 1, up: 2 }
const pnlRank: Record<PnlValue, number> = { loss: 0, breakeven: 1, profit: 2 }

function sortValue(row: Row, key: SortKey): number | undefined {
  switch (key) {
    case 'trend':
      return row.trend ? trendRank[row.trend] : undefined
    case 'pnl':
      return row.pnl ? pnlRank[row.pnl] : undefined
    case 'pctChange':
      return row.stock.pctChange
    default:
      return rangeOf(row.stock, key)
  }
}

function compareRows(a: Row, b: Row): number {
  for (const rule of sortRules.value) {
    const left = sortValue(a, rule.key)
    const right = sortValue(b, rule.key)
    // Missing values are always pushed to the end, regardless of direction.
    if (left === undefined && right === undefined) continue
    if (left === undefined) return 1
    if (right === undefined) return -1
    const diff = rule.direction === 'asc' ? left - right : right - left
    if (diff !== 0) return diff
  }
  return a.stock.symbol.localeCompare(b.stock.symbol)
}

/* ---------- global fuzzy search over the whole market ---------- */
const searchInput = ref('')
const searchTerm = ref('')
const searchActive = computed(() => searchTerm.value.trim().length > 0)

function applySearch(): void {
  searchTerm.value = searchInput.value.trim()
  closeCandidates()
}

function clearSearch(): void {
  searchInput.value = ''
  searchTerm.value = ''
  closeCandidates()
}

/**
 * Ranks against the whole market, independent from the active conditions:
 * exact (0) > prefix (1) > contains (2); names/initials rank before code.
 */
function searchRank(stock: UniverseStock, term: string): number | undefined {
  const name = stock.name.toLowerCase()
  const symbol = stock.symbol.toLowerCase()
  const digits = symbol.replace(/\D/g, '')
  const termDigits = term.replace(/\D/g, '')
  const initials = pinyinInitials(stock.name)
  const isCodeQuery = termDigits.length > 0 && !/[^0-9]/.test(term)

  if (isCodeQuery) {
    if (digits === termDigits) return 0
    if (digits.startsWith(termDigits)) return 1
    if (digits.includes(termDigits)) return 2
    return undefined
  }

  if (name === term || initials === term) return 0
  if (name.startsWith(term) || initials.startsWith(term)) return 1
  if (name.includes(term) || initials.includes(term)) return 2
  return undefined
}

const searchResults = computed<Row[]>(() => {
  const term = searchTerm.value.trim().toLowerCase()
  if (!term) return []
  const scored: Array<{ row: Row; rank: number }> = []
  for (const stock of universe.items) {
    const rank = searchRank(stock, term)
    if (rank !== undefined) scored.push({ row: { stock }, rank })
  }
  scored.sort((a, b) => a.rank - b.rank || a.row.stock.symbol.localeCompare(b.row.stock.symbol))
  return scored.map((entry) => entry.row)
})

/* ---------- live candidates under the search box ---------- */
const CANDIDATE_LIMIT = 8
const candidatesOpen = ref(false)
const candidateIndex = ref(-1)

const candidates = computed<UniverseStock[]>(() => {
  const term = searchInput.value.trim().toLowerCase()
  if (!term) return []
  const scored: Array<{ stock: UniverseStock; rank: number }> = []
  for (const stock of universe.items) {
    const rank = searchRank(stock, term)
    if (rank !== undefined) scored.push({ stock, rank })
  }
  scored.sort((a, b) => a.rank - b.rank || a.stock.symbol.localeCompare(b.stock.symbol))
  return scored.slice(0, CANDIDATE_LIMIT).map((entry) => entry.stock)
})

function closeCandidates(): void {
  candidatesOpen.value = false
  candidateIndex.value = -1
}

function onSearchInput(): void {
  candidatesOpen.value = true
  candidateIndex.value = -1
}

function onSearchFocus(): void {
  if (candidates.value.length) {
    candidatesOpen.value = true
    candidateIndex.value = -1
  }
}

function moveCandidate(delta: number): void {
  const total = candidates.value.length
  if (!total) return
  candidatesOpen.value = true
  if (candidateIndex.value < 0) candidateIndex.value = delta > 0 ? 0 : total - 1
  else candidateIndex.value = (candidateIndex.value + delta + total) % total
}

function pickCandidate(stock: UniverseStock): void {
  closeCandidates()
  openDetail(stock.symbol)
}

function onSearchEnter(): void {
  if (candidatesOpen.value && candidateIndex.value >= 0) {
    const stock = candidates.value[candidateIndex.value]
    if (stock) {
      pickCandidate(stock)
      return
    }
  }
  applySearch()
}

const matchedRows = computed<Row[]>(() => rows.value.filter(matches).sort(compareRows))
const displayRows = computed<Row[]>(() => (searchActive.value ? searchResults.value : matchedRows.value))
const visibleRows = computed<Row[]>(() => displayRows.value.slice(0, visibleLimit.value))

const enabledCount = computed(() => {
  let count = 0
  for (const meta of rangeMeta) if (ranges[meta.key].enabled) count += 1
  if (trendFilter.enabled) count += 1
  if (pnlFilter.enabled) count += 1
  return count
})

/* Toolbar buttons show the current selection instead of their own label once set. */
const activePresetName = ref('')
let skipPresetClear = false

const filterSummary = computed(() => {
  const parts: string[] = []
  for (const meta of rangeMeta) if (ranges[meta.key].enabled) parts.push(meta.label)
  if (trendFilter.enabled) parts.push('趋势')
  if (pnlFilter.enabled) parts.push('盈亏')
  if (!parts.length) return ''
  return parts.length > 2 ? `${parts.slice(0, 2).join('/')}…` : parts.join('/')
})

const sortSummary = computed(() => {
  if (!sortRules.value.length) return ''
  const parts = sortRules.value.map((rule) => `${sortKeyLabel(rule.key)}${rule.direction === 'desc' ? '↓' : '↑'}`)
  return parts.length > 2 ? `${parts.slice(0, 2).join('/')}…` : parts.join('/')
})

const availability = computed(() => {
  const total = universe.count
  const present = (key: RangeKey) =>
    rows.value.filter((row) => {
      const value = rangeOf(row.stock, key)
      return value !== undefined && Number.isFinite(value)
    }).length
  return {
    total,
    price: present('price'),
    volumeRatio: present('volumeRatio'),
    turnoverRate: present('turnoverRate'),
    marketCap: present('marketCap'),
    trend: rows.value.filter((row) => row.trend !== undefined).length,
    pnl: rows.value.filter((row) => row.pnl !== undefined).length,
  }
})

const legacyCache = computed(
  () =>
    universe.count > 0 &&
    (availability.value.volumeRatio === 0 ||
      availability.value.turnoverRate === 0 ||
      availability.value.marketCap === 0),
)

const progressPercent = computed(() => {
  const total = universe.progress.total
  if (!total) return 0
  return Math.min(100, Math.round((universe.progress.loaded / total) * 100))
})

function toggleRange(state: RangeState): void {
  state.enabled = !state.enabled
}

function addRule(): void {
  if (sortRules.value.length >= 4) return
  ruleSeq += 1
  const used = new Set(sortRules.value.map((rule) => rule.key))
  const next = sortOptions.find((option) => !used.has(option.key))?.key ?? 'price'
  sortRules.value.push({ id: ruleSeq, key: next, direction: 'desc' })
}

function removeRule(id: number): void {
  if (sortRules.value.length <= 1) return
  sortRules.value = sortRules.value.filter((rule) => rule.id !== id)
}

function moveRule(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= sortRules.value.length) return
  const list = sortRules.value.slice()
  const [rule] = list.splice(index, 1)
  if (rule) list.splice(target, 0, rule)
  sortRules.value = list
}

function resetAll(): void {
  for (const meta of rangeMeta) {
    if (locks[meta.key]) continue
    ranges[meta.key].enabled = false
    ranges[meta.key].min = ''
    ranges[meta.key].max = ''
  }
  if (!locks.trend) {
    trendFilter.enabled = false
    trendFilter.value = 'up'
  }
  if (!locks.pnl) {
    pnlFilter.enabled = false
    pnlFilter.value = 'profit'
  }
  missingPolicy.value = 'exclude'
  ruleSeq = 1
  sortRules.value = [{ id: ruleSeq, key: 'pctChange', direction: 'desc' }]
  visibleLimit.value = 100
}

/* ---------- saved presets (filters + sort, persisted locally) ---------- */
function makePresetId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `preset-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function isSortKey(value: unknown): value is SortKey {
  return typeof value === 'string' && sortOptions.some((option) => option.key === value)
}

function isTrendValue(value: unknown): value is TrendValue {
  return value === 'up' || value === 'down' || value === 'flat'
}

function isPnlValue(value: unknown): value is PnlValue {
  return value === 'profit' || value === 'loss' || value === 'breakeven'
}

function presetNumber(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') return value.trim().slice(0, 12)
  return ''
}

function sanitizePreset(raw: unknown): ScreenerPreset | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 20) : ''
  if (!name) return null
  const filtersRaw = (value.filters ?? {}) as Record<string, unknown>
  const rangesRaw = (filtersRaw.ranges ?? {}) as Record<string, unknown>
  const presetRanges = {} as Record<RangeKey, PresetRange>
  for (const meta of rangeMeta) {
    const state = (rangesRaw[meta.key] ?? {}) as Record<string, unknown>
    presetRanges[meta.key] = {
      enabled: Boolean(state.enabled),
      min: presetNumber(state.min),
      max: presetNumber(state.max),
    }
  }
  const trendRaw = (filtersRaw.trend ?? {}) as Record<string, unknown>
  const pnlRaw = (filtersRaw.pnl ?? {}) as Record<string, unknown>
  const sortRaw = value.sort
  const sort = Array.isArray(sortRaw)
    ? sortRaw
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const rule = item as Record<string, unknown>
          if (!isSortKey(rule.key) || (rule.direction !== 'asc' && rule.direction !== 'desc')) return null
          return { key: rule.key, direction: rule.direction as Direction }
        })
        .filter((item): item is { key: SortKey; direction: Direction } => item !== null)
        .slice(0, 4)
    : []
  return {
    id: typeof value.id === 'string' && value.id ? value.id : makePresetId(),
    name,
    filters: {
      ranges: presetRanges,
      trend: { enabled: Boolean(trendRaw.enabled), value: isTrendValue(trendRaw.value) ? trendRaw.value : 'up' },
      pnl: { enabled: Boolean(pnlRaw.enabled), value: isPnlValue(pnlRaw.value) ? pnlRaw.value : 'profit' },
      missingPolicy: filtersRaw.missingPolicy === 'pass' ? 'pass' : 'exclude',
    },
    sort,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
  }
}

function loadPresets(): ScreenerPreset[] {
  try {
    const raw = localStorage.getItem(PRESET_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => sanitizePreset(item))
      .filter((item): item is ScreenerPreset => item !== null)
      .slice(0, 30)
  } catch {
    localStorage.removeItem(PRESET_KEY)
    return []
  }
}

const presets = ref<ScreenerPreset[]>(loadPresets())
const presetName = ref('')
const presetError = ref('')
const editingId = ref<string | null>(null)
const editingName = ref('')
const confirmDeleteId = ref<string | null>(null)

function persistPresets(): void {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets.value))
  } catch {
    // Quota errors should not break the toolbar.
  }
}

function captureFilters(): PresetFilters {
  const rangeState = {} as Record<RangeKey, PresetRange>
  for (const meta of rangeMeta) {
    const state = ranges[meta.key]
    rangeState[meta.key] = {
      enabled: state.enabled,
      min: String(state.min ?? ''),
      max: String(state.max ?? ''),
    }
  }
  return {
    ranges: rangeState,
    trend: { enabled: trendFilter.enabled, value: trendFilter.value },
    pnl: { enabled: pnlFilter.enabled, value: pnlFilter.value },
    missingPolicy: missingPolicy.value,
  }
}

function savePreset(): void {
  const name = presetName.value.trim().slice(0, 20)
  if (!name) {
    presetError.value = '请输入预设名称（1–20 个字符）'
    return
  }
  if (presets.value.some((preset) => preset.name === name)) {
    presetError.value = '名称已存在，请换一个'
    return
  }
  presetError.value = ''
  presets.value = [
    {
      id: makePresetId(),
      name,
      filters: captureFilters(),
      sort: sortRules.value.map((rule) => ({ key: rule.key, direction: rule.direction })),
      createdAt: new Date().toISOString(),
    },
    ...presets.value,
  ].slice(0, 30)
  presetName.value = ''
  persistPresets()
  activePresetName.value = name
  actionNotice.value = `已保存预设「${name}」`
}

function applyState(filters: PresetFilters, sort: Array<{ key: SortKey; direction: Direction }>): void {
  skipPresetClear = true
  for (const meta of rangeMeta) {
    const state = filters.ranges[meta.key]
    ranges[meta.key].enabled = Boolean(state?.enabled)
    ranges[meta.key].min = state?.min ?? ''
    ranges[meta.key].max = state?.max ?? ''
  }
  trendFilter.enabled = filters.trend.enabled
  trendFilter.value = filters.trend.value
  pnlFilter.enabled = filters.pnl.enabled
  pnlFilter.value = filters.pnl.value
  missingPolicy.value = filters.missingPolicy
  sortRules.value = sort.map((rule, index) => ({ id: index + 1, key: rule.key, direction: rule.direction }))
  ruleSeq = sortRules.value.length
  visibleLimit.value = 100
}

function applyPreset(preset: ScreenerPreset): void {
  applyState(preset.filters, preset.sort)
  activePop.value = null
  editingId.value = null
  confirmDeleteId.value = null
  activePresetName.value = preset.name
  actionNotice.value = `已应用预设「${preset.name}」`
  void nextTick(() => {
    skipPresetClear = false
  })
}

function startRename(preset: ScreenerPreset): void {
  editingId.value = preset.id
  editingName.value = preset.name
  confirmDeleteId.value = null
}

function cancelRename(): void {
  editingId.value = null
  editingName.value = ''
}

function commitRename(): void {
  const id = editingId.value
  if (!id) return
  const next = editingName.value.trim().slice(0, 20)
  if (!next) {
    cancelRename()
    return
  }
  if (presets.value.some((preset) => preset.id !== id && preset.name === next)) {
    actionNotice.value = '预设名称已存在，请换一个'
    return
  }
  const current = presets.value.find((preset) => preset.id === id)
  if (current && activePresetName.value === current.name) activePresetName.value = next
  presets.value = presets.value.map((preset) => (preset.id === id ? { ...preset, name: next } : preset))
  persistPresets()
  cancelRename()
}

function askDelete(preset: ScreenerPreset): void {
  if (confirmDeleteId.value !== preset.id) {
    confirmDeleteId.value = preset.id
    return
  }
  presets.value = presets.value.filter((item) => item.id !== preset.id)
  confirmDeleteId.value = null
  if (activePresetName.value === preset.name) activePresetName.value = ''
  if (editingId.value === preset.id) cancelRename()
  persistPresets()
}

function rangeSummary(meta: RangeMeta, state: PresetRange): string {
  const min = state.min === '' ? undefined : num(state.min)
  const max = state.max === '' ? undefined : num(state.max)
  if (min === undefined && max === undefined) return `${meta.label}（已启用）`
  if (min !== undefined && max !== undefined) {
    return `${meta.label} ${Math.min(min, max)}~${Math.max(min, max)}${meta.unit}`
  }
  if (min !== undefined) return `${meta.label} ≥${min}${meta.unit}`
  return `${meta.label} ≤${max}${meta.unit}`
}

function summaryFilters(preset: ScreenerPreset): string {
  const parts: string[] = []
  for (const meta of rangeMeta) {
    const state = preset.filters.ranges[meta.key]
    if (state?.enabled) parts.push(rangeSummary(meta, state))
  }
  if (preset.filters.trend.enabled) {
    const label = trendOptions.find((option) => option.value === preset.filters.trend.value)?.label ?? ''
    parts.push(`趋势${label}`)
  }
  if (preset.filters.pnl.enabled) {
    const label = pnlOptions.find((option) => option.value === preset.filters.pnl.value)?.label ?? ''
    parts.push(`盈亏${label}`)
  }
  return parts.length ? parts.join(' · ') : '无筛选条件'
}

function summarySort(preset: ScreenerPreset): string {
  if (!preset.sort.length) return '无排序规则'
  return preset.sort
    .map((rule) => `${sortKeyLabel(rule.key)}${rule.direction === 'desc' ? '降序' : '升序'}`)
    .join(' → ')
}

function clearSort(): void {
  sortRules.value = []
}

function sortKeyLabel(key: SortKey): string {
  return sortOptions.find((option) => option.key === key)?.label ?? key
}

/* Header sorting: click a data column to promote it, click again to flip direction. */
const sortableColumns: Array<{ key: SortKey; label: string; numeric: boolean }> = [
  { key: 'price', label: '价格', numeric: true },
  { key: 'pctChange', label: '涨跌幅', numeric: true },
  { key: 'volumeRatio', label: '量比', numeric: true },
  { key: 'turnoverRate', label: '换手率', numeric: true },
  { key: 'marketCap', label: '总市值', numeric: true },
  { key: 'trend', label: '趋势', numeric: false },
  { key: 'pnl', label: '盈亏', numeric: false },
]

function sortIndex(key: SortKey): number {
  return sortRules.value.findIndex((rule) => rule.key === key)
}

function sortDirection(key: SortKey): Direction | undefined {
  return sortRules.value.find((rule) => rule.key === key)?.direction
}

/** Tri-state header cycling: ascending → descending → off (default order). */
function onHeaderClick(key: SortKey, event: Event): void {
  if ((event.target as HTMLElement | null)?.closest('.col-resizer')) return
  const rule = sortRules.value.find((item) => item.key === key)
  if (!rule) {
    const next: SortRule[] = [{ id: 1, key, direction: 'asc' }, ...sortRules.value]
    sortRules.value = next.slice(0, 4).map((item, index) => ({ ...item, id: index + 1 }))
  } else if (rule.direction === 'asc') {
    rule.direction = 'desc'
  } else {
    sortRules.value = sortRules.value
      .filter((item) => item.key !== key)
      .map((item, index) => ({ ...item, id: index + 1 }))
  }
  ruleSeq = sortRules.value.length
}

function openDetail(symbol: string, event?: MouseEvent): void {
  const target = event?.target
  if (target instanceof HTMLElement && target.closest('a, button, input, select, label')) return
  saveSession()
  void router.push({ path: `/stock/${symbol}`, query: { from: 'screener' } })
}

async function refresh(): Promise<void> {
  await universe.ensureLoaded(true)
}

/* ---------- keep filters + scroll when returning from a stock detail ---------- */
const SESSION_KEY = 'stock-radar:screener-session:v1'
let pendingScrollY = 0

function saveSession(): void {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        filters: captureFilters(),
        sort: sortRules.value.map((rule) => ({ key: rule.key, direction: rule.direction })),
        presetName: activePresetName.value,
        visibleLimit: visibleLimit.value,
        scrollY: window.scrollY,
      }),
    )
  } catch {
    /* sessionStorage can be unavailable; the list still works without it. */
  }
}

function restoreSession(): void {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return
    const data = parsed as Record<string, unknown>
    const safe = sanitizePreset({ name: '会话', filters: data.filters, sort: data.sort })
    if (!safe) return
    applyState(safe.filters, safe.sort)
    activePresetName.value = typeof data.presetName === 'string' ? data.presetName.slice(0, 20) : ''
    if (typeof data.visibleLimit === 'number' && Number.isFinite(data.visibleLimit)) {
      visibleLimit.value = Math.min(1000, Math.max(100, Math.round(data.visibleLimit)))
    }
    if (typeof data.scrollY === 'number' && data.scrollY > 0) pendingScrollY = data.scrollY
    sessionStorage.removeItem(SESSION_KEY)
    void nextTick(() => {
      skipPresetClear = false
    })
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
  }
}

restoreSession()

function applyPendingScroll(): void {
  if (!pendingScrollY) return
  const top = pendingScrollY
  pendingScrollY = 0
  window.requestAnimationFrame(() => window.scrollTo(0, top))
}

watch(matchedRows, applyPendingScroll, { flush: 'post' })

/** Cache TTL is the next trading session, so this only refetches stale lists. */
let autoRefreshTimer: number | undefined
let tableResizeObserver: ResizeObserver | null = null

onMounted(() => {
  universe.init()
  compare.init()
  document.addEventListener('pointerdown', onDocumentPointer)
  window.addEventListener('resize', onViewportChange)
  document.addEventListener('scroll', onViewportScroll, true)
  if (universe.count === 0 && !universe.isLoading) void universe.ensureLoaded()
  void nextTick(() => window.requestAnimationFrame(applyPendingScroll))
  autoRefreshTimer = window.setInterval(() => void universe.ensureLoaded(), 60_000)
  void nextTick(() => {
    syncStickyOffsets()
    const table = tableWrapRef.value?.querySelector('table')
    if (table && typeof ResizeObserver !== 'undefined') {
      tableResizeObserver = new ResizeObserver(() => syncStickyOffsets())
      tableResizeObserver.observe(table)
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointer)
  window.removeEventListener('resize', onViewportChange)
  document.removeEventListener('scroll', onViewportScroll, true)
  if (autoRefreshTimer) window.clearInterval(autoRefreshTimer)
  tableResizeObserver?.disconnect()
  onResizeEnd()
})

watch(
  [ranges, trendFilter, pnlFilter, missingPolicy, sortRules],
  () => {
    visibleLimit.value = 100
    // Functional presets only keep their name while the state still matches them.
    if (skipPresetClear) {
      skipPresetClear = false
    } else {
      activePresetName.value = ''
    }
  },
  { deep: true },
)

function toneClass(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return 'is-flat'
  return value > 0 ? 'is-up' : value < 0 ? 'is-down' : 'is-flat'
}

</script>

<template>
  <section class="page screener-page">
    <p v-if="universe.error" class="banner-error">{{ universe.error }}</p>

    <div v-if="universe.isLoading" class="card load-card">
      <div class="load-head">
        <strong>正在加载全市场行情列表</strong>
        <span class="muted">{{ universe.progress.loaded }} / {{ universe.progress.total || '—' }}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: `${progressPercent}%` }" />
      </div>
      <p class="hint-text">分页拉取期间可继续调整条件，加载完成后结果会自动刷新。</p>
    </div>

    <div class="card screen-tools-card">
      <div ref="toolsRef" class="screen-tools">
        <div class="tool-brows">
          <button
            class="tool-btn"
            :class="{ 'is-open': activePop === 'filter', 'is-on': enabledCount > 0 }"
            type="button"
            :aria-expanded="activePop === 'filter'"
            :title="filterSummary ? `筛选：${filterSummary}` : '筛选条件'"
            @click="togglePop('filter')"
          >
            <span class="tool-text">{{ filterSummary || '筛选' }}</span>
            <svg class="tool-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          <button
            class="tool-btn"
            :class="{ 'is-open': activePop === 'sort', 'is-on': sortRules.length > 0 }"
            type="button"
            :aria-expanded="activePop === 'sort'"
            :title="sortSummary ? `排序：${sortSummary}` : '排序优先级'"
            @click="togglePop('sort')"
          >
            <span class="tool-text">{{ sortSummary || '排序' }}</span>
            <svg class="tool-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          <button
            class="tool-btn tool-reset"
            type="button"
            :title="lockedCount ? `重置：清空未锁定条件，保留 ${lockedCount} 项锁定` : '重置：清空全部条件'"
            @click="resetAll"
          >
            <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 4v6h6" />
              <path d="M4.6 10a7.6 7.6 0 1 1 1.6 5.8" />
            </svg>
            <span class="tool-text">重置</span>
          </button>
          <button
            class="tool-btn"
            :class="{ 'is-open': activePop === 'preset', 'is-on': Boolean(activePresetName) }"
            type="button"
            :aria-expanded="activePop === 'preset'"
            :title="activePresetName ? `预设：${activePresetName}` : '保存为预设'"
            @click="togglePop('preset')"
          >
            <span class="tool-text">{{ activePresetName || '预设' }}</span>
            <svg class="tool-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </div>

        <div class="tool-search">
          <div class="search-picker">
            <input
              v-model="searchInput"
              class="search-input tool-search-input"
              type="search"
              placeholder="搜索名称 / 代码"
              aria-label="搜索股票名称或代码"
              :aria-expanded="candidatesOpen && candidates.length > 0"
              autocomplete="off"
              @input="onSearchInput"
              @focus="onSearchFocus"
              @keydown.down.prevent="moveCandidate(1)"
              @keydown.up.prevent="moveCandidate(-1)"
              @keydown.enter.prevent="onSearchEnter"
              @keydown.esc="closeCandidates"
            />
            <div v-if="candidatesOpen && candidates.length" class="candidate-pop" role="listbox">
              <button
                v-for="(stock, index) in candidates"
                :key="stock.symbol"
                class="candidate-item"
                :class="{ 'is-active': index === candidateIndex }"
                type="button"
                role="option"
                :aria-selected="index === candidateIndex"
                @mouseenter="candidateIndex = index"
                @click="pickCandidate(stock)"
              >
                <span class="candidate-name">{{ stock.name }}</span>
                <span class="candidate-meta">{{ stock.symbol }}</span>
              </button>
            </div>
          </div>
          <button class="btn btn-mini" type="button" @click="applySearch">搜索</button>
          <button v-if="searchTerm" class="btn btn-mini" type="button" @click="clearSearch">清除</button>
        </div>

        <div v-if="activePop" class="tool-mask" :style="{ top: `${maskTop}px` }" aria-hidden="true" />

        <div v-if="activePop" class="tool-pop" :class="`is-${activePop}`" @click.stop>
          <header class="pop-head">
            <div>
              <strong>{{
                activePop === 'filter' ? '筛选条件' : activePop === 'sort' ? '排序优先级' : '保存为预设'
              }}</strong>
              <small v-if="activePop === 'filter'">{{ universe.count }} 只标的 · 锁定项在重置时保留</small>
              <small v-else-if="activePop === 'sort'">多条件按优先级依次比较</small>
              <small v-else>把当前筛选与排序存为可复用预设</small>
            </div>
            <button class="pop-close" type="button" aria-label="关闭" @click="activePop = null">×</button>
          </header>

          <template v-if="activePop === 'filter'">
            <div class="cond-list">
          <div
            v-for="meta in rangeMeta"
            :key="meta.key"
            class="cond-row"
            :class="{ 'is-enabled': ranges[meta.key].enabled, 'is-locked': locks[meta.key] }"
          >
            <span class="cond-name" :title="meta.hint">{{ meta.label }}</span>
            <div class="cond-inputs" :class="{ 'is-disabled': !ranges[meta.key].enabled }">
              <input
                v-model="ranges[meta.key].min"
                class="range-input"
                type="number"
                inputmode="decimal"
                :step="meta.step"
                :disabled="!ranges[meta.key].enabled"
                :placeholder="`最小 ${meta.unit}`"
                :aria-label="`${meta.label}最小值`"
              />
              <span class="range-sep">~</span>
              <input
                v-model="ranges[meta.key].max"
                class="range-input"
                type="number"
                inputmode="decimal"
                :step="meta.step"
                :disabled="!ranges[meta.key].enabled"
                :placeholder="`最大 ${meta.unit}`"
                :aria-label="`${meta.label}最大值`"
              />
            </div>
            <button
              class="switch"
              :class="{ 'is-on': ranges[meta.key].enabled }"
              type="button"
              :aria-pressed="ranges[meta.key].enabled"
              :aria-label="`启用${meta.label}筛选`"
              @click="toggleRange(ranges[meta.key])"
            >
              <span />
            </button>
            <button
              class="lock-btn"
              :class="{ 'is-locked': locks[meta.key] }"
              type="button"
              :aria-pressed="locks[meta.key]"
              :title="locks[meta.key] ? '已锁定：重置时保留' : '锁定该条件（重置时保留）'"
              :aria-label="`锁定${meta.label}条件`"
              @click="toggleLock(meta.key)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="10" width="14" height="10" rx="2" />
                <path v-if="locks[meta.key]" d="M8 10V7a4 4 0 0 1 8 0v3" />
                <path v-else d="M8 10V7a4 4 0 0 1 7.6-2.8" />
              </svg>
            </button>
            <span class="cond-status">
              可用 {{ availability[meta.key] }}/{{ availability.total }}
              <template v-if="meta.key === 'marketCap'"> · 亿元</template>
            </span>
          </div>

          <div class="cond-row" :class="{ 'is-enabled': trendFilter.enabled, 'is-locked': locks.trend }">
            <span class="cond-name" title="按当日涨跌方向">涨跌趋势</span>
            <div class="cond-inputs" :class="{ 'is-disabled': !trendFilter.enabled }">
              <select v-model="trendFilter.value" class="select-input" :disabled="!trendFilter.enabled">
                <option v-for="option in trendOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
            <button
              class="switch"
              :class="{ 'is-on': trendFilter.enabled }"
              type="button"
              :aria-pressed="trendFilter.enabled"
              aria-label="启用涨跌趋势筛选"
              @click="trendFilter.enabled = !trendFilter.enabled"
            >
              <span />
            </button>
            <button
              class="lock-btn"
              :class="{ 'is-locked': locks.trend }"
              type="button"
              :aria-pressed="locks.trend"
              :title="locks.trend ? '已锁定：重置时保留' : '锁定该条件（重置时保留）'"
              aria-label="锁定涨跌趋势条件"
              @click="toggleLock('trend')"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="10" width="14" height="10" rx="2" />
                <path v-if="locks.trend" d="M8 10V7a4 4 0 0 1 8 0v3" />
                <path v-else d="M8 10V7a4 4 0 0 1 7.6-2.8" />
              </svg>
            </button>
            <span class="cond-status">可用 {{ availability.trend }}/{{ availability.total }}</span>
          </div>

          <div class="cond-row" :class="{ 'is-enabled': pnlFilter.enabled, 'is-locked': locks.pnl }">
            <span class="cond-name" title="按当日涨跌推断：盈利=上涨、亏损=下跌">盈亏状态</span>
            <div class="cond-inputs" :class="{ 'is-disabled': !pnlFilter.enabled }">
              <select v-model="pnlFilter.value" class="select-input" :disabled="!pnlFilter.enabled">
                <option v-for="option in pnlOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
            <button
              class="switch"
              :class="{ 'is-on': pnlFilter.enabled }"
              type="button"
              :aria-pressed="pnlFilter.enabled"
              aria-label="启用盈亏状态筛选"
              @click="pnlFilter.enabled = !pnlFilter.enabled"
            >
              <span />
            </button>
            <button
              class="lock-btn"
              :class="{ 'is-locked': locks.pnl }"
              type="button"
              :aria-pressed="locks.pnl"
              :title="locks.pnl ? '已锁定：重置时保留' : '锁定该条件（重置时保留）'"
              aria-label="锁定盈亏状态条件"
              @click="toggleLock('pnl')"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="10" width="14" height="10" rx="2" />
                <path v-if="locks.pnl" d="M8 10V7a4 4 0 0 1 8 0v3" />
                <path v-else d="M8 10V7a4 4 0 0 1 7.6-2.8" />
              </svg>
            </button>
            <span class="cond-status">可用 {{ availability.pnl }}/{{ availability.total }}</span>
          </div>
        </div>

        <div class="missing-policy">
          <div>
            <strong>缺失数据处理</strong>
            <p class="hint-text">
              量比、换手率、市值等字段来自全市场列表接口，旧缓存可能缺失。缺失股票的默认处理方式：
            </p>
          </div>
          <select v-model="missingPolicy" class="select-input" aria-label="缺失数据处理方式">
            <option value="exclude">缺失即不匹配（推荐）</option>
            <option value="pass">缺失视为通过</option>
          </select>
        </div>

        <p v-if="legacyCache" class="banner-warn">
          当前缓存缺少部分筛选字段（量比 / 换手率 / 市值），相关条件可用标的为 0，列表自动刷新后会恢复。
        </p>
          </template>

          <template v-else-if="activePop === 'sort'">
            <div class="pop-actions">
              <button v-if="sortRules.length" class="btn btn-mini" type="button" @click="clearSort">
                清除排序
              </button>
              <button
                class="btn btn-mini"
                type="button"
                :disabled="sortRules.length >= 4"
                @click="addRule"
              >
                + 添加排序条件
              </button>
            </div>
            <p class="hint-text">按从上到下的优先级比较；缺失值的标的始终排在最后。条件改动后列表实时更新。</p>

            <p v-if="!sortRules.length" class="sort-empty">
              当前未设置排序，结果按代码升序展示。可点击「+ 添加排序条件」重新指定。
            </p>
            <div v-else class="sort-list">
        <div v-for="(rule, index) in sortRules" :key="rule.id" class="sort-row">
          <span class="sort-priority">{{ index === 0 ? '第一优先' : index === 1 ? '第二优先' : `第 ${index + 1} 优先` }}</span>
          <select v-model="rule.key" class="select-input" :aria-label="`第 ${index + 1} 排序字段`">
            <option v-for="option in sortOptions" :key="option.key" :value="option.key">
              {{ option.label }}
            </option>
          </select>
          <select v-model="rule.direction" class="select-input sort-direction" :aria-label="`第 ${index + 1} 排序方向`">
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select>
          <div class="sort-move">
            <button
              class="icon-btn"
              type="button"
              aria-label="上移优先级"
              :disabled="index === 0"
              @click="moveRule(index, -1)"
            >
              ↑
            </button>
            <button
              class="icon-btn"
              type="button"
              aria-label="下移优先级"
              :disabled="index === sortRules.length - 1"
              @click="moveRule(index, 1)"
            >
              ↓
            </button>
            <button
              class="icon-btn sort-remove"
              type="button"
              aria-label="删除排序条件"
              :disabled="sortRules.length <= 1"
              @click="removeRule(rule.id)"
            >
              ×
            </button>
          </div>
        </div>
      </div>
          </template>

          <template v-else>
            <label class="preset-name-field">
              <span>预设名称</span>
              <input
                v-model="presetName"
                type="text"
                maxlength="20"
                placeholder="例如：低价放量"
                @keydown.enter="savePreset"
              />
            </label>
            <p v-if="presetError" class="preset-error">{{ presetError }}</p>
            <div class="pop-actions">
              <button class="btn btn-primary btn-mini" type="button" @click="savePreset">
                保存当前筛选与排序
              </button>
            </div>
            <p class="hint-text">
              可只保存筛选、只保存排序，或两者都保存；保存后可在这里一键应用。
            </p>

            <div v-if="presets.length" class="preset-list">
              <div v-for="preset in presets" :key="preset.id" class="preset-row">
                <template v-if="editingId === preset.id">
                  <input
                    v-model="editingName"
                    class="preset-rename"
                    type="text"
                    maxlength="20"
                    :aria-label="`重命名 ${preset.name}`"
                    @keydown.enter="commitRename"
                    @keydown.esc="cancelRename"
                  />
                  <div class="preset-actions">
                    <button class="btn btn-mini" type="button" @click="commitRename">保存</button>
                    <button class="btn btn-mini" type="button" @click="cancelRename">取消</button>
                  </div>
                </template>
                <template v-else>
                  <button class="preset-main" type="button" @click="applyPreset(preset)">
                    <span class="preset-name">{{ preset.name }}</span>
                    <span class="preset-rules">
                      <span class="preset-filter">{{ summaryFilters(preset) }}</span>
                      <span class="preset-sort">{{ summarySort(preset) }}</span>
                    </span>
                  </button>
                  <div class="preset-actions">
                    <button class="btn btn-mini" type="button" @click="startRename(preset)">重命名</button>
                    <button
                      class="btn btn-mini"
                      :class="{ 'is-confirming': confirmDeleteId === preset.id }"
                      type="button"
                      @click="askDelete(preset)"
                    >
                      {{ confirmDeleteId === preset.id ? '确认删除' : '删除' }}
                    </button>
                  </div>
                </template>
              </div>
            </div>
            <p v-else class="preset-empty">
              还没有预设：输入名称并保存后，可在这里一键应用。
            </p>
          </template>
        </div>
      </div>
    </div>

    <div class="card result-card">
      <header class="card-head result-head">
        <h2>{{ searchActive ? '搜索结果' : '筛选结果' }} <span class="muted">{{ displayRows.length }} 只</span></h2>
        <div class="card-head-actions result-tools">
          <span v-if="searchTerm" class="tag">搜索「{{ searchTerm }}」</span>
          <span v-if="compare.count" class="tag">已选 {{ compare.count }} / {{ MAX_COMPARE }} 只</span>
          <button
            v-if="compare.count"
            class="btn btn-mini"
            type="button"
            @click="compare.clear()"
          >
            清空选择
          </button>
          <RouterLink
            v-if="compare.count >= MIN_COMPARE"
            to="/compare"
            class="btn btn-primary btn-mini compare-link"
          >
            对比已选
          </RouterLink>
          <span v-else-if="displayRows.length > visibleRows.length" class="tag">
            展示前 {{ visibleRows.length }} 只
          </span>
          <button class="btn btn-mini column-toggle" type="button" @click="columnPanelOpen = !columnPanelOpen">
            列显示{{ hiddenColumnCount ? `（隐藏 ${hiddenColumnCount}）` : '' }}
          </button>
        </div>
      </header>

      <div v-if="columnPanelOpen" class="column-panel">
        <label v-for="meta in columnMeta" :key="meta.key" class="column-option">
          <input type="checkbox" :checked="columns[meta.key]" @change="toggleColumn(meta.key)" />
          {{ meta.label }}
        </label>
        <button class="btn btn-mini column-reset" type="button" @click="resetColumns">恢复默认</button>
      </div>

      <p v-if="actionNotice" class="result-notice">{{ actionNotice }}</p>
      <p v-if="compare.notice" class="result-notice is-warn">{{ compare.notice }}</p>

      <EmptyState
        v-if="!universe.count && !universe.isLoading"
        title="还没有全市场行情列表"
        description="首次使用需要先拉取全市场列表；数据会按交易日缓存，后续筛选不会重复请求。"
      >
        <button class="btn btn-primary" type="button" @click="refresh">加载全市场列表</button>
        <RouterLink to="/watchlist" class="btn btn-ghost">先去管理自选</RouterLink>
      </EmptyState>

      <EmptyState
        v-else-if="!displayRows.length && !universe.isLoading"
        :title="searchActive ? '无匹配股票' : '没有符合当前条件的标的'"
        :description="
          searchActive
            ? `没有找到与「${searchTerm}」相近的股票，试试完整名称、拼音首字母（如 gsyh）或代码片段（如 6013）。`
            : '尝试放宽数值区间、关闭部分条件，或把缺失数据处理切换为「缺失视为通过」。'
        "
        compact
      >
        <button v-if="searchActive" class="btn btn-ghost" type="button" @click="clearSearch">清除搜索</button>
        <button v-else class="btn btn-ghost" type="button" @click="resetAll">重置全部条件</button>
      </EmptyState>

      <template v-else>
        <div
          ref="tableWrapRef"
          class="table-wrap"
          :class="{ 'is-x-scrolled': tableScrolledX }"
          @scroll="onTableScroll"
        >
          <table class="screen-table">
            <thead>
              <tr>
                <th class="join-col">加入</th>
                <th class="name-col" :style="thStyle('name')">
                  代码 / 名称
                  <span class="col-resizer" aria-hidden="true" @pointerdown="startResize('name', $event)" />
                </th>
                <th v-if="columns.sector" :style="thStyle('sector')">
                  行业
                  <span class="col-resizer" aria-hidden="true" @pointerdown="startResize('sector', $event)" />
                </th>
                <template v-for="meta in sortableColumns" :key="meta.key">
                  <th
                    v-if="columns[meta.key]"
                    :class="{ num: meta.numeric, sortable: true, 'is-sorted': sortIndex(meta.key) >= 0 }"
                    :style="thStyle(meta.key)"
                    tabindex="0"
                    :aria-sort="sortIndex(meta.key) >= 0 ? (sortDirection(meta.key) === 'desc' ? 'descending' : 'ascending') : 'none'"
                    @click="onHeaderClick(meta.key, $event)"
                    @keydown.enter.prevent="onHeaderClick(meta.key, $event)"
                  >
                    {{ meta.label }}
                    <span v-if="sortIndex(meta.key) >= 0" class="sort-mark" aria-hidden="true">
                      {{ sortDirection(meta.key) === 'desc' ? '↓' : '↑' }}
                    </span>
                    <span class="col-resizer" aria-hidden="true" @pointerdown="startResize(meta.key, $event)" />
                  </th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in visibleRows"
                :key="row.stock.symbol"
                class="result-row"
                tabindex="0"
                @click="openDetail(row.stock.symbol, $event)"
                @keydown.enter="openDetail(row.stock.symbol)"
              >
                <td
                  class="join-cell"
                  :class="{ 'is-open': addTarget?.stock.symbol === row.stock.symbol }"
                  :title="
                    watchlist.has(row.stock.symbol)
                      ? `已在自选 · 分组：${watchGroup(row.stock.symbol)}，点击可调整/加入其他分组`
                      : '点击整格加入自选分组'
                  "
                  @click.stop="openAddGroup(row.stock, $event)"
                >
                  <span class="join-mark" :class="{ 'is-added': watchlist.has(row.stock.symbol) }" aria-hidden="true">
                    <span v-if="watchlist.has(row.stock.symbol)" class="join-group">
                      {{ watchGroup(row.stock.symbol).slice(0, 1) }}
                    </span>
                    <span class="join-plus">+</span>
                  </span>
                </td>
                <td class="name-cell">
                  <span class="stock-link">
                    <strong>{{ row.stock.name }}</strong>
                    <small>{{ row.stock.symbol }} · {{ row.stock.market === 'SH' ? '沪市' : '深市' }}</small>
                  </span>
                </td>
                <td v-if="columns.sector" class="muted">{{ row.stock.sector || '—' }}</td>
                <td v-if="columns.price" class="num">{{ formatPrice(row.stock.price ?? NaN) }}</td>
                <td v-if="columns.pctChange" class="num" :class="toneClass(row.stock.pctChange)">
                  {{ row.stock.pctChange === undefined ? '—' : formatPercent(row.stock.pctChange) }}
                </td>
                <td v-if="columns.volumeRatio" class="num">{{ row.stock.volumeRatio === undefined ? '—' : row.stock.volumeRatio.toFixed(2) }}</td>
                <td v-if="columns.turnoverRate" class="num">
                  {{ row.stock.turnoverRate === undefined ? '—' : `${row.stock.turnoverRate.toFixed(2)}%` }}
                </td>
                <td v-if="columns.marketCap" class="num">{{ row.stock.marketCap === undefined ? '—' : formatAmount(row.stock.marketCap) }}</td>
                <td v-if="columns.trend">
                  <span v-if="row.trend" class="trend-cell">
                    <TrendIcon :state="row.trend" />
                    {{ row.trend === 'up' ? '上涨' : row.trend === 'down' ? '下跌' : '平盘' }}
                  </span>
                  <span v-else class="muted">—</span>
                </td>
                <td v-if="columns.pnl">
                  <span v-if="row.pnl" class="pnl-pill" :class="`is-${row.pnl}`">
                    {{ row.pnl === 'profit' ? '盈利' : row.pnl === 'loss' ? '亏损' : '持平' }}
                  </span>
                  <span v-else class="muted">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="displayRows.length > visibleRows.length" class="load-more">
          <button class="btn btn-ghost" type="button" @click="visibleLimit += 100">
            加载更多（剩余 {{ displayRows.length - visibleRows.length }} 只）
          </button>
        </div>
      </template>
    </div>

    <div
      v-if="addTarget"
      ref="addPopRef"
      class="add-pop"
      :style="{ top: `${addTarget.top}px`, left: `${addTarget.left}px` }"
      role="dialog"
      aria-label="加入自选分组"
      @click.stop
    >
      <header class="add-pop-head">
        <strong>加入分组</strong>
        <small>{{ addTarget.stock.name }} · {{ addTarget.stock.symbol }}</small>
      </header>
      <div class="group-list">
        <button
          v-for="group in watchlist.groups"
          :key="group.id"
          class="group-item"
          :class="{
            'is-active': isInGroup(addTarget.stock.symbol, group.id),
            'is-preset': !watchlist.has(addTarget.stock.symbol) && group.isDefault,
          }"
          type="button"
          :aria-pressed="isInGroup(addTarget.stock.symbol, group.id)"
          @click="toggleGroupOption(group.id)"
        >
          <span>{{ group.name }}</span>
          <span v-if="isInGroup(addTarget.stock.symbol, group.id)" class="group-check" aria-hidden="true">✓</span>
          <span
            v-else-if="group.isDefault"
            class="group-default-hint"
          >默认</span>
        </button>
      </div>
      <div class="add-pop-footer">
        <div class="group-new-row">
          <input
            v-model="addNewGroupName"
            class="group-name-input"
            type="text"
            maxlength="12"
            placeholder="新建分组（≤12 字）"
            @keydown.enter="createGroupForTarget"
          />
          <button class="btn btn-primary btn-mini" type="button" @click="createGroupForTarget">新建并加入</button>
        </div>
        <p v-if="addError" class="group-error">{{ addError }}</p>
        <button class="btn btn-mini add-pop-done" type="button" @click="closeAddPop">完成</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.load-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.load-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

/* Compact condition rows: name → inputs → switch → lock → status. */
.cond-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.cond-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-size: 12px;
  transition: border-color 0.18s ease, background-color 0.18s ease;
}

.cond-row:hover {
  background: var(--surface-2);
}

.cond-row.is-enabled {
  border-color: var(--accent-border);
  background: color-mix(in srgb, var(--accent-soft) 55%, transparent);
}

.cond-name {
  flex: none;
  width: 58px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.cond-inputs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
  transition: opacity 0.18s ease;
}

.cond-inputs.is-disabled {
  opacity: 0.4;
}

.cond-inputs .range-input {
  flex: 1 1 0;
  min-width: 0;
  height: 26px;
  padding: 0 6px;
  font-size: 11.5px;
}

.cond-inputs .select-input {
  width: 100%;
  max-width: 148px;
  height: 26px;
  font-size: 11.5px;
}

.cond-status {
  flex: none;
  color: var(--muted);
  font-size: 10px;
  white-space: nowrap;
}

.lock-btn {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--muted);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.lock-btn svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
}

.lock-btn:hover {
  color: var(--text);
  background: var(--surface-3);
}

.lock-btn.is-locked {
  color: var(--accent);
  border-color: var(--accent-border);
  background: var(--accent-soft);
}

/* ---------- four-segment toolbar ---------- */
/* Pins right under the global header (never above it) while scrolling. */
.screen-tools-card {
  position: sticky;
  /* Header is --header-h tall plus its 1px bottom border. */
  top: calc(var(--header-h) + 1px);
  z-index: var(--z-page-pop);
  padding: 0;
  border-bottom: 0;
  border-radius: var(--radius) var(--radius) 0 0;
}

/* Toolbar and results read as one block: no gap, no double border. */
.screener-page {
  gap: 0;
}

.screener-page > .banner-error,
.screener-page > .load-card {
  margin-bottom: 16px;
}

.result-card {
  margin-top: 0;
  border-top: 0;
  border-radius: 0 0 var(--radius) var(--radius);
}

.screen-tools {
  position: relative;
  z-index: 22;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px dashed var(--border);
  background: var(--surface);
}

/* One text row; horizontally scrollable on narrow screens. */
.tool-brows {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: none;
}

.tool-brows::-webkit-scrollbar {
  display: none;
}

/* Separate from the condition/sort controls by a vertical rule. */
.tool-search {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding-left: 12px;
  border-left: 1px solid var(--border);
}

.tool-search-input {
  width: 168px;
}

/* Live candidates drop under the search box, aligned to its right edge. */
.search-picker {
  position: relative;
  display: inline-flex;
  min-width: 0;
}

.candidate-pop {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 8;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: min(260px, calc(100vw - 32px));
  max-height: 300px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}

.candidate-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}

.candidate-item:hover,
.candidate-item.is-active {
  background: var(--surface-2);
}

.candidate-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.candidate-meta {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  max-width: 190px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  color: var(--text-soft);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.tool-btn:hover {
  color: var(--text);
  background: var(--surface-2);
}

.tool-btn.is-on {
  color: var(--accent);
}

.tool-btn.is-open {
  color: var(--accent);
  border-color: var(--accent-border);
  background: var(--accent-soft);
}

.tool-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-chevron,
.tool-icon {
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tool-chevron {
  width: 13px;
  height: 13px;
  stroke-width: 2;
}

.tool-icon {
  width: 14px;
  height: 14px;
  stroke-width: 1.8;
}

/* Starts right under the toolbar row so the row itself stays bright. */
.tool-mask {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
  background: rgba(6, 8, 12, 0.4);
  backdrop-filter: blur(2px);
}

.tool-pop {
  position: absolute;
  top: calc(100% - 4px);
  left: 14px;
  z-index: 3;
  width: min(720px, calc(100% - 28px));
  max-height: min(70vh, 620px);
  overflow-y: auto;
  padding: 12px 14px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}

.tool-pop.is-sort,
.tool-pop.is-preset {
  width: min(480px, calc(100% - 28px));
}

.pop-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.pop-head strong {
  font-size: 13.5px;
}

.pop-head small {
  display: block;
  margin-top: 2px;
  font-size: 10.5px;
  color: var(--muted);
}

.pop-close {
  flex: none;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.pop-close:hover {
  background: var(--surface-2);
  color: var(--text);
}

.pop-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

/* ---------- saved preset rows ---------- */
.preset-list {
  display: flex;
  flex-direction: column;
  margin-top: 10px;
  border-top: 1px dashed var(--border);
}

.preset-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
}

.preset-row + .preset-row {
  border-top: 1px solid var(--divider);
}

.preset-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.preset-main:hover .preset-name {
  color: var(--accent);
}

.preset-name {
  font-size: 12.5px;
  font-weight: 600;
}

.preset-rules {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--muted);
}

.preset-sort {
  color: var(--text-soft);
}

.preset-actions {
  display: flex;
  flex: none;
  gap: 6px;
}

.preset-actions .is-confirming {
  border-color: var(--up);
  color: var(--up);
}

.preset-rename {
  height: 30px;
  flex: 1;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 12px;
}

.preset-name-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
}

.preset-name-field span {
  color: var(--text-soft);
}

.preset-name-field input {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
}

.preset-name-field input:focus {
  outline: none;
  border-color: var(--accent-border);
}

.preset-error {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--up);
}

.preset-empty {
  margin: 10px 0 0;
  padding: 8px 0 0;
  border-top: 1px dashed var(--border);
  font-size: 11.5px;
  color: var(--muted);
}

.sort-summary {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sort-empty {
  margin: 10px 0 0;
  padding: 10px 12px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: 12px;
}

.column-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin: 8px 0 2px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.column-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  cursor: pointer;
}

.column-option input {
  width: 15px;
  height: 15px;
  accent-color: var(--accent);
}

.column-reset {
  margin-left: auto;
}

.range-sep {
  color: var(--muted);
  flex: none;
}

.missing-policy {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--divider);
}

.missing-policy strong {
  font-size: 13px;
}

.missing-policy p {
  margin: 3px 0 0;
  max-width: 640px;
}

.missing-policy .select-input {
  min-width: 190px;
}

.sort-card .hint-text {
  margin-top: -4px;
}

.sort-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.sort-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.sort-priority {
  flex: none;
  font-size: 11px;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  border-radius: 999px;
  padding: 2px 9px;
}

.sort-row .select-input {
  flex: 1 1 120px;
  min-width: 100px;
}

.sort-row .sort-direction {
  flex: 0 1 88px;
}

.sort-move {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-soft);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.icon-btn:hover:not(:disabled) {
  border-color: var(--accent-border);
  color: var(--accent);
  background: var(--accent-soft);
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sort-remove:hover:not(:disabled) {
  color: var(--danger-text);
  border-color: var(--danger-border);
  background: var(--danger-soft);
}

.screen-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  font-size: 12.5px;
  --join-col-w: 52px;
}

.join-col,
.join-cell {
  width: var(--join-col-w);
  min-width: var(--join-col-w);
}

/* The entire cell (full column width and row height) is the click target. */
.screen-table td.join-cell {
  padding: 0;
  text-align: center;
  cursor: pointer;
}

.join-cell:hover,
.join-cell.is-open {
  background: var(--surface-2);
}

.join-mark {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 24px;
  vertical-align: middle;
}

.join-plus,
.join-group {
  position: absolute;
  top: 2px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--text-soft);
  font-size: 11px;
  line-height: 1;
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.join-plus {
  left: 8px;
  z-index: 2;
}

/* Added: group circle on the left, the "+" circle overlaps on the right. */
.join-mark.is-added .join-group {
  left: 0;
  z-index: 1;
  border-color: var(--accent-border);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 10px;
  font-weight: 600;
}

.join-mark.is-added .join-plus {
  left: 16px;
}

.join-cell:hover .join-plus,
.join-cell.is-open .join-plus {
  border-color: var(--accent-border);
  color: var(--accent);
  background: var(--accent-soft);
}

/* ---------- add-to-group bubble ---------- */
.add-pop {
  position: fixed;
  z-index: var(--z-page-pop);
  display: flex;
  flex-direction: column;
  width: 244px;
  max-height: 320px;
  padding: 10px 12px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}

.add-pop-head {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.add-pop-head strong {
  font-size: 12.5px;
}

.add-pop-head small {
  color: var(--muted);
  font-size: 10.5px;
}

/* Only the group list scrolls; header and footer stay visible. */
.group-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  max-height: 148px;
  margin: 8px 0;
  overflow-y: auto;
}

.group-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 7px 9px;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-soft);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.group-item:hover {
  background: var(--surface-2);
  color: var(--text);
}

.group-item.is-active {
  background: var(--accent-soft);
  color: var(--accent);
}

/* Not-added yet: the always-present default group is preselected. */
.group-item.is-preset {
  background: var(--accent-soft);
  color: var(--accent);
  outline: 1px dashed var(--accent-border);
  outline-offset: -1px;
}

.group-default-hint {
  flex: none;
  color: var(--muted);
  font-size: 10px;
}

.group-item.is-preset .group-default-hint {
  color: var(--accent);
}

.group-item span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-check {
  flex: none;
  visibility: hidden;
}

.group-item.is-active .group-check {
  visibility: visible;
}

.group-name-input {
  width: 100%;
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 12px;
}

.group-name-input:focus {
  outline: none;
  border-color: var(--accent-border);
}

.group-error {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--up);
}

.add-pop-footer {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px dashed var(--divider);
}

.group-new-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.group-new-row .group-name-input {
  flex: 1 1 auto;
  min-width: 0;
}

.group-new-row .btn {
  flex: none;
  white-space: nowrap;
}

.add-pop-done {
  align-self: flex-end;
}

/* ---------- draggable column widths ---------- */
.col-resizer {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 0;
  bottom: 0;
  width: 10px;
  cursor: col-resize;
  touch-action: none;
}

.col-resizer::after {
  content: '';
  position: absolute;
  top: 22%;
  bottom: 22%;
  right: 3px;
  width: 1px;
  background: transparent;
}

.screen-table th:hover .col-resizer::after {
  background: var(--border-strong);
}

:global(body.is-col-resizing) {
  cursor: col-resize;
  user-select: none;
}

.result-tools {
  flex-wrap: wrap;
}

.result-notice {
  margin: 0 0 10px;
  padding: 8px 10px;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
}

.result-notice.is-warn {
  margin-top: -4px;
  border-color: var(--warn-border);
  background: var(--warn-soft);
  color: var(--warn-text);
}

.screen-table th {
  position: relative;
  text-align: left;
  color: var(--muted);
  font-weight: 500;
  font-size: 11.5px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--divider);
  white-space: nowrap;
}

.screen-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.screen-table th.sortable:hover {
  color: var(--text);
}

.screen-table th.is-sorted {
  color: var(--accent);
}

.sort-mark {
  margin-left: 2px;
  font-size: 10px;
}

.screen-table td {
  padding: 10px;
  border-bottom: 1px solid var(--divider);
  vertical-align: middle;
}

/* ---------- frozen first two columns (加入 / 代码·名称) ---------- */
.screen-table thead th.join-col,
.screen-table tbody td.join-cell {
  position: sticky;
  left: 0;
  z-index: 3;
  background: var(--surface);
}

.screen-table thead th.name-col,
.screen-table tbody td.name-cell {
  position: sticky;
  left: var(--join-col-w);
  z-index: 3;
  background: var(--surface);
}

.screen-table thead th.join-col,
.screen-table thead th.name-col {
  z-index: 4;
}

.screen-table tbody tr:hover td.join-cell,
.screen-table tbody tr:hover td.name-cell {
  background: var(--surface-2);
}

/* Separator shadow marks where the frozen area ends once horizontally scrolled. */
.screen-table thead th.name-col::after,
.screen-table tbody td.name-cell::after {
  content: '';
  position: absolute;
  top: 0;
  right: -10px;
  bottom: 0;
  width: 10px;
  pointer-events: none;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0));
  opacity: 0;
  transition: opacity 0.15s ease;
}

.table-wrap.is-x-scrolled .screen-table thead th.name-col::after,
.table-wrap.is-x-scrolled .screen-table tbody td.name-cell::after {
  opacity: 1;
}

.screen-table tbody tr {
  transition: background 0.12s ease;
}

.screen-table tbody tr.result-row {
  cursor: pointer;
}

.screen-table tbody tr:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.screen-table tbody tr:hover {
  background: var(--surface-2);
}

.screen-table tbody tr:last-child td {
  border-bottom: 0;
}

.screen-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.screen-table .is-up {
  color: var(--up);
}

.screen-table .is-down {
  color: var(--down);
}

.screen-table .is-flat {
  color: var(--muted);
}

.stock-link {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.stock-link strong {
  font-size: 13px;
  font-weight: 600;
}

.stock-link small {
  color: var(--muted);
  font-size: 11px;
}

.trend-cell {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.pnl-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid var(--border);
  color: var(--text-soft);
  white-space: nowrap;
}

.pnl-pill.is-profit {
  color: var(--up);
  border-color: color-mix(in srgb, var(--up) 40%, transparent);
  background: color-mix(in srgb, var(--up) 12%, transparent);
}

.pnl-pill.is-loss {
  color: var(--down);
  border-color: color-mix(in srgb, var(--down) 40%, transparent);
  background: color-mix(in srgb, var(--down) 12%, transparent);
}

.load-more {
  display: flex;
  justify-content: center;
  margin-top: 14px;
}

@media (max-width: 760px) {
  .col-resizer {
    display: none;
  }

  .tool-pop,
  .tool-pop.is-sort,
  .tool-pop.is-preset {
    top: calc(100% - 2px);
    left: 0;
    width: 100%;
    border-radius: 0 0 var(--radius) var(--radius);
  }

  .preset-row {
    flex-wrap: wrap;
    gap: 8px;
  }

  .preset-main {
    flex-basis: 100%;
  }

  .cond-row {
    gap: 5px;
    padding: 4px;
  }

  .cond-name {
    width: 52px;
    font-size: 11.5px;
  }

  .cond-row .switch {
    width: 34px;
    height: 20px;
  }

  .cond-row .switch span {
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
  }

  .cond-row .switch.is-on span {
    left: 18px;
  }

  .cond-status {
    font-size: 9.5px;
  }

  .sort-summary {
    max-width: 180px;
  }
}

@media (max-width: 640px) {
  .tool-search-input {
    width: 104px;
  }

  .missing-policy {
    align-items: stretch;
  }

  .missing-policy .select-input {
    width: 100%;
  }

  .sort-move {
    margin-left: 0;
    width: 100%;
    justify-content: flex-end;
  }

  .column-reset {
    margin-left: 0;
  }
}
</style>
