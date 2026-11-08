<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { MAX_WATCHLIST, useWatchlistStore } from '@/stores/watchlist'
import { useUniverseStore } from '@/stores/universe'
import { getTradingStatus } from '@/lib/trading-calendar'
import { formatAmount, formatDateTime, formatPercent, formatPrice } from '@/lib/format'
import { marketLabel, symbolText } from '@/lib/market'
import type { UniverseStock, WatchItem } from '@/types'

type ColumnKey =
  | 'price'
  | 'pctChange'
  | 'changeAmount'
  | 'volume'
  | 'amount'
  | 'turnoverRate'
  | 'volumeRatio'
  | 'pe'
  | 'pb'
  | 'marketCap'
  | 'floatCap'
  | 'amplitude'
  | 'high'
  | 'low'
  | 'open'
  | 'prevClose'
  | 'sector'
  | 'quoteTime'

const COLUMN_KEY = 'stock-radar:watchlist-columns:v1'

const columnMeta: Array<{ key: ColumnKey; label: string }> = [
  { key: 'price', label: '现价' },
  { key: 'pctChange', label: '涨跌幅' },
  { key: 'changeAmount', label: '涨跌额' },
  { key: 'volume', label: '总手' },
  { key: 'amount', label: '成交额' },
  { key: 'turnoverRate', label: '换手率' },
  { key: 'volumeRatio', label: '量比' },
  { key: 'pe', label: '市盈率' },
  { key: 'pb', label: '市净率' },
  { key: 'marketCap', label: '总市值' },
  { key: 'floatCap', label: '流通市值' },
  { key: 'amplitude', label: '振幅' },
  { key: 'high', label: '最高' },
  { key: 'low', label: '最低' },
  { key: 'open', label: '开盘' },
  { key: 'prevClose', label: '昨收' },
  { key: 'sector', label: '行业' },
  { key: 'quoteTime', label: '更新时间' },
]

function defaultColumns(): Record<ColumnKey, boolean> {
  return {
    price: true,
    pctChange: true,
    changeAmount: true,
    volume: true,
    amount: true,
    turnoverRate: true,
    volumeRatio: true,
    pe: false,
    pb: false,
    marketCap: true,
    floatCap: false,
    amplitude: false,
    high: false,
    low: false,
    open: false,
    prevClose: false,
    sector: true,
    quoteTime: false,
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

const columns = reactive<Record<ColumnKey, boolean>>(loadColumns())
const visibleColumns = computed(() => columnMeta.filter((meta) => columns[meta.key]))
const colsOpen = ref(false)
function toggleColumn(key: ColumnKey): void {
  columns[key] = !columns[key]
  localStorage.setItem(COLUMN_KEY, JSON.stringify(columns))
}

/* ---------- draggable column widths ---------- */
type WidthKey = 'name' | ColumnKey

type ColWidths = Partial<Record<WidthKey, number>>

const WIDTH_KEY = 'stock-radar:watchlist-col-widths:v1'
const MIN_COL_WIDTH = 56
const MAX_COL_WIDTH = 420

/** Sensible starting widths so every column keeps a stable, readable size. */
const defaultWidths: Record<WidthKey, number> = {
  name: 124,
  price: 78,
  pctChange: 84,
  changeAmount: 84,
  volume: 92,
  amount: 100,
  turnoverRate: 86,
  volumeRatio: 76,
  pe: 78,
  pb: 78,
  marketCap: 100,
  floatCap: 104,
  amplitude: 78,
  high: 76,
  low: 76,
  open: 76,
  prevClose: 76,
  sector: 90,
  quoteTime: 138,
}

function loadWidths(): ColWidths {
  const widths: ColWidths = { ...defaultWidths }
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

/** Table never shrinks below the sum of its column widths (horizontal scroll instead). */
const tableMinWidth = computed(() => {
  let total = 57 + (colWidths.name ?? defaultWidths.name)
  for (const meta of visibleColumns.value) {
    total += colWidths[meta.key] ?? defaultWidths[meta.key]
  }
  return Math.max(640, Math.round(total + 20))
})

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

const watchlist = useWatchlistStore()
const universe = useUniverseStore()
const trading = getTradingStatus()

const query = ref('')
const feedback = ref('')
/** Multi-select target groups for the next add; defaults to the current group. */
const addGroupOpen = ref(false)
const addGroupIds = ref<string[]>([])
const defaultGroupId = computed(() => watchlist.defaultGroup?.id ?? '')
const targetGroupIds = computed(() => {
  if (addGroupIds.value.length) return addGroupIds.value
  return defaultGroupId.value ? [defaultGroupId.value] : []
})
const addGroupLabel = computed(() => {
  const ids = addGroupIds.value
  if (!ids.length) return '选择分组'
  if (ids.length === 1) {
    return watchlist.groups.find((group) => group.id === ids[0])?.name ?? '选择分组'
  }
  return `${ids.length} 个分组`
})
const addGroupTitle = computed(() => {
  const names = addGroupIds.value
    .map((id) => watchlist.groups.find((group) => group.id === id)?.name)
    .filter((name): name is string => Boolean(name))
  return names.length ? names.join('、') : '添加到默认分组'
})

function toggleAddGroup(id: string): void {
  addGroupIds.value = addGroupIds.value.includes(id)
    ? addGroupIds.value.filter((entry) => entry !== id)
    : [...addGroupIds.value, id]
}
const groupManageName = ref('')
const groupError = ref('')
const pendingDeleteId = ref('')
/** Empty string means the 「全部」 entry. */
const selectedGroup = ref('')

/** Keep the add-target selection in sync: current group, or the default group under 「全部」. */
watch(
  [selectedGroup, defaultGroupId],
  () => {
    const id = selectedGroup.value || defaultGroupId.value
    addGroupIds.value = id ? [id] : []
  },
  { immediate: true },
)

const groupsOpen = ref(false)
const groupEditOpen = ref(false)
const deleteTargetId = ref('')
const deleteMode = ref<'' | 'migrate' | 'delete'>('')
const migrateTargetId = ref('')
const deleteError = ref('')
const deleteConfirmRef = ref<HTMLElement | null>(null)
/** Newest additions first by default; toggling flips to oldest first. */
const sortDesc = ref(true)
const clearConfirmOpen = ref(false)
const tableWrapRef = ref<HTMLElement | null>(null)
const tableScrolledX = ref(false)
let tableResizeObserver: ResizeObserver | null = null

const results = computed<UniverseStock[]>(() => universe.search(query.value, 24))
/** Quick add always targets the best-ranked match, and only after a query is typed. */
const topMatch = computed<UniverseStock | undefined>(() => (query.value.trim() ? results.value[0] : undefined))
const canQuickAdd = computed(() => Boolean(topMatch.value) && !watchlist.isFull && !watchlist.has(topMatch.value!.symbol))
const quickAddLabel = computed(() => (topMatch.value && watchlist.has(topMatch.value.symbol) ? '已添加' : '添加'))
const quickAddTitle = computed(() => {
  const top = topMatch.value
  if (!top) return '先输入代码或名称'
  return watchlist.has(top.symbol) ? `已在池中：${top.name}` : `添加 ${top.name}（${symbolText(top.symbol)}）`
})
const progressPercent = computed(() => {
  const total = universe.progress.total
  if (total <= 0) return 0
  return Math.min(100, Math.round((universe.progress.loaded / total) * 100))
})
const latestQuoteTime = computed(() => universe.latestQuoteTime())
const hasUniverse = computed(() => universe.items.length > 0)

const quotes = computed(() => {
  const map = new Map<string, UniverseStock>()
  for (const stock of universe.items) map.set(stock.symbol, stock)
  return map
})

/** Default group first, then custom groups newest-created first. */
const orderedGroups = computed(() =>
  watchlist.groups
    .filter((group) => !group.isDefault)
    .sort((a, b) => {
      const byTime = (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
      return byTime || a.name.localeCompare(b.name, 'zh-CN')
    }),
)

const groupCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  for (const group of watchlist.groups) counts[group.id] = 0
  for (const item of watchlist.items) {
    for (const id of item.groupIds ?? []) {
      if (counts[id] !== undefined) counts[id] += 1
    }
  }
  return counts
})

const selectedGroupName = computed(() => {
  if (!selectedGroup.value) return '全部'
  return watchlist.groups.find((group) => group.id === selectedGroup.value)?.name ?? '全部'
})

const groupItems = computed<WatchItem[]>(() => {
  const base = selectedGroup.value
    ? watchlist.items.filter((item) => item.groupIds?.includes(selectedGroup.value))
    : [...watchlist.items]
  const direction = sortDesc.value ? -1 : 1
  return base.sort(
    (a, b) => direction * ((Date.parse(a.addedAt ?? '') || 0) - (Date.parse(b.addedAt ?? '') || 0)),
  )
})

onMounted(async () => {
  watchlist.init()
  universe.init()
  document.addEventListener('pointerdown', onDocumentPointer)
  window.addEventListener('resize', onViewportChange)
  await universe.ensureLoaded()
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
  tableResizeObserver?.disconnect()
})

/* ---------- group sidebar ---------- */
function selectGroup(id: string): void {
  selectedGroup.value = id
}

function groupNameOf(id: string): string {
  return watchlist.groups.find((group) => group.id === id)?.name ?? ''
}

function createGroup(): void {
  if (!watchlist.addGroup(groupManageName.value)) {
    groupError.value = '分组名称为空或已存在'
    return
  }
  groupManageName.value = ''
  groupError.value = ''
}

function renameGroup(id: string, event: Event): void {
  const input = event.target as HTMLInputElement
  if (!watchlist.renameGroup(id, input.value)) {
    groupError.value = '名称为空或与现有分组重名'
    input.value = groupNameOf(id)
    return
  }
  groupError.value = ''
  input.value = groupNameOf(id)
}

/** Two-step delete: first click arms, second click removes the group and its memberships. */
function askDeleteGroup(id: string): void {
  if (pendingDeleteId.value !== id) {
    pendingDeleteId.value = id
    return
  }
  if (!watchlist.deleteGroup(id)) {
    groupError.value = '默认分组不可删除'
    return
  }
  pendingDeleteId.value = ''
  groupError.value = ''
  if (selectedGroup.value === id) selectedGroup.value = ''
}

/* ---------- mobile group editor ---------- */
const groupEditError = ref('')
const groupEditName = ref('')

function openGroupEdit(): void {
  groupEditOpen.value = true
  groupEditName.value = ''
  groupEditError.value = ''
  deleteTargetId.value = ''
  deleteMode.value = ''
  migrateTargetId.value = ''
  deleteError.value = ''
}

function closeGroupEdit(): void {
  groupEditOpen.value = false
  deleteTargetId.value = ''
  deleteMode.value = ''
  migrateTargetId.value = ''
  deleteError.value = ''
  groupEditError.value = ''
}

function createGroupInEdit(): void {
  if (!watchlist.addGroup(groupEditName.value)) {
    groupEditError.value = '分组名称为空或已存在'
    return
  }
  groupEditName.value = ''
  groupEditError.value = ''
}

function renameGroupInEdit(id: string, event: Event): void {
  const input = event.target as HTMLInputElement
  if (!watchlist.renameGroup(id, input.value)) {
    groupEditError.value = '名称为空或与现有分组重名'
    input.value = groupNameOf(id)
    return
  }
  groupEditError.value = ''
  input.value = groupNameOf(id)
}

function stocksInGroup(id: string): number {
  return watchlist.items.filter((item) => item.groupIds?.includes(id)).length
}

function requestDeleteGroup(id: string): void {
  deleteTargetId.value = deleteTargetId.value === id ? '' : id
  deleteMode.value = ''
  migrateTargetId.value = ''
  deleteError.value = ''
  // Make the confirmation visible even when the group list is long.
  void nextTick(() => {
    if (deleteTargetId.value) deleteConfirmRef.value?.scrollIntoView({ block: 'nearest' })
  })
}

/** Deleting a non-empty group requires an explicit migrate-or-delete choice. */
function confirmDeleteGroup(): void {
  const id = deleteTargetId.value
  if (!id) return
  const members = watchlist.items.filter((item) => item.groupIds?.includes(id))
  if (members.length > 0) {
    if (!deleteMode.value) {
      deleteError.value = '请选择「迁移到其他分组」或「连股票一起删除」'
      return
    }
    if (deleteMode.value === 'delete') {
      for (const item of members) watchlist.remove(item.symbol)
    } else {
      const target = migrateTargetId.value
      if (!target || target === id) {
        deleteError.value = '请选择迁移的目标分组'
        return
      }
      for (const item of members) {
        const ids = (item.groupIds ?? []).filter((groupId) => groupId !== id)
        if (!ids.includes(target)) ids.push(target)
        watchlist.setGroupIds(item.symbol, ids)
      }
    }
  }
  if (!watchlist.deleteGroup(id)) {
    deleteError.value = '默认分组不可删除'
    return
  }
  if (selectedGroup.value === id) selectedGroup.value = ''
  deleteTargetId.value = ''
  deleteMode.value = ''
  migrateTargetId.value = ''
  deleteError.value = ''
}

const migrateOptions = computed(() => watchlist.groups.filter((group) => group.id !== deleteTargetId.value))

/* ---------- row action bubble ---------- */
type RowPopMode = 'menu' | 'groups'
const rowPop = ref<{ item: WatchItem; top: number; left: number; mode: RowPopMode } | null>(null)

function openRowPop(item: WatchItem, event: MouseEvent): void {
  if (rowPop.value?.item.symbol === item.symbol) {
    rowPop.value = null
    return
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const width = 252
  const height = 320
  const left = Math.max(8, Math.min(rect.right + 6, window.innerWidth - width - 8))
  const top = Math.max(8, Math.min(rect.top, window.innerHeight - height - 8))
  rowPop.value = { item, top, left, mode: 'menu' }
}

function removeFromPool(item: WatchItem): void {
  watchlist.remove(item.symbol)
  rowPop.value = null
  feedback.value = `已移除 ${item.name}`
}

function isInGroup(symbol: string, groupId: string): boolean {
  return watchlist.groupIdsOf(symbol).includes(groupId)
}

/* ---------- sticky columns + column menu ---------- */
function onTableScroll(event: Event): void {
  tableScrolledX.value = (event.target as HTMLElement).scrollLeft > 0
}

function syncStickyOffsets(): void {
  const wrap = tableWrapRef.value
  if (!wrap) return
  const first = wrap.querySelector('thead th.action-col') as HTMLElement | null
  if (!first) return
  wrap.style.setProperty('--action-col-w', `${Math.round(first.getBoundingClientRect().width)}px`)
}

function onViewportChange(): void {
  rowPop.value = null
  colsOpen.value = false
  syncStickyOffsets()
  // The toggle only exists while the left menu is collapsed.
  if (window.innerWidth > 900) groupsOpen.value = false
  if (toggleTop.value !== null) {
    const rect = toggleRef.value?.getBoundingClientRect()
    toggleTop.value = clampToggleTop(toggleTop.value, rect?.height ?? 64)
  }
}

function onDocumentPointer(event: Event): void {
  const target = event.target as HTMLElement | null
  if (!target) return
  if (rowPop.value && !target.closest('.row-pop') && !target.closest('.row-action-btn')) {
    rowPop.value = null
  }
  if (colsOpen.value && !target.closest('.column-pop') && !target.closest('.column-btn')) {
    colsOpen.value = false
  }
  if (addGroupOpen.value && !target.closest('.add-group-picker')) {
    addGroupOpen.value = false
  }
  // The group bubble is a toggle: only taps outside both the panel and its
  // button close it, so selecting a group, scrolling inside or using the
  // editor never dismisses it.
  if (
    groupsOpen.value &&
    !target.closest('.group-pop') &&
    !target.closest('.groups-toggle') &&
    !target.closest('.group-edit') &&
    !target.closest('.group-edit-mask')
  ) {
    groupsOpen.value = false
  }
}

/* ---------- edge-docked group toggle (only when the left menu is hidden) ---------- */
const TOGGLE_POS_KEY = 'stock-radar:watchlist-groups-toggle-pos:v1'
const toggleRef = ref<HTMLElement | null>(null)

function loadToggleTop(): number | null {
  try {
    const raw = localStorage.getItem(TOGGLE_POS_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const top = (parsed as Record<string, unknown>).top
    if (typeof top !== 'number' || !Number.isFinite(top)) return null
    return Math.round(top)
  } catch {
    localStorage.removeItem(TOGGLE_POS_KEY)
    return null
  }
}

/** Only the vertical position varies; the strip always hugs the left edge. */
const toggleTop = ref(loadToggleTop())

/** Keeps the strip below the header and above the bottom tab bar. */
function clampToggleTop(top: number, height: number): number {
  const headerHeight = document.querySelector('.app-header')?.getBoundingClientRect().height ?? 60
  const topLimit = headerHeight + 8
  const tabbar = document.querySelector('.tabbar')
  const bottomLimit =
    tabbar && getComputedStyle(tabbar).display !== 'none' && getComputedStyle(tabbar).position === 'fixed'
      ? window.innerHeight - tabbar.getBoundingClientRect().height - 8
      : window.innerHeight - 8
  const maxTop = Math.max(topLimit, bottomLimit - height)
  return Math.min(Math.max(topLimit, top), maxTop)
}

function toggleStyle(): Record<string, string> {
  return toggleTop.value === null
    ? {}
    : { top: `${toggleTop.value}px`, transform: 'none' }
}

let toggleDrag: { startY: number; originTop: number; height: number; moved: boolean } | null = null
let suppressToggleClick = false

function onTogglePointerDown(event: PointerEvent): void {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  toggleDrag = {
    startY: event.clientY,
    originTop: rect.top,
    height: rect.height,
    moved: false,
  }
  suppressToggleClick = false
  document.addEventListener('pointermove', onToggleDragMove)
  document.addEventListener('pointerup', onToggleDragEnd)
  document.addEventListener('pointercancel', onToggleDragEnd)
}

function onToggleDragMove(event: PointerEvent): void {
  if (!toggleDrag) return
  const dy = event.clientY - toggleDrag.startY
  if (!toggleDrag.moved && Math.abs(dy) < 4) return
  toggleDrag.moved = true
  // Horizontal movement is ignored: dragging only slides along the edge.
  toggleTop.value = clampToggleTop(toggleDrag.originTop + dy, toggleDrag.height)
}

function onToggleDragEnd(): void {
  if (toggleDrag?.moved) {
    // Release snaps back to the left edge (left is fixed at 0) and persists.
    suppressToggleClick = true
    if (toggleTop.value !== null) localStorage.setItem(TOGGLE_POS_KEY, JSON.stringify({ top: toggleTop.value }))
  }
  toggleDrag = null
  document.removeEventListener('pointermove', onToggleDragMove)
  document.removeEventListener('pointerup', onToggleDragEnd)
  document.removeEventListener('pointercancel', onToggleDragEnd)
}

function toggleGroups(): void {
  // A drag ends with a click on the same button; swallow that one.
  if (suppressToggleClick) {
    suppressToggleClick = false
    return
  }
  groupsOpen.value = !groupsOpen.value
}

/* ---------- add stock ---------- */
function quickAdd(): void {
  const top = topMatch.value
  if (top) addStock(top)
}

function addStock(stock: UniverseStock): void {
  const result = watchlist.add({
    symbol: stock.symbol,
    name: stock.name,
    market: stock.market,
    groupIds: targetGroupIds.value,
  })
  if (result === 'added') feedback.value = `已添加 ${stock.name}（${symbolText(stock.symbol)}）`
  else if (result === 'exists') feedback.value = `${stock.name} 已在自选池中`
  else if (result === 'full') feedback.value = `自选池最多 ${MAX_WATCHLIST} 只，请先移除部分标的后再添加`
  else feedback.value = '股票代码无效'
}

function confirmClearGroup(): void {
  const groupId = selectedGroup.value
  if (!groupId) {
    watchlist.clear()
    feedback.value = '已清空收藏'
  } else {
    const name = selectedGroupName.value
    // Only drop membership of this group; stocks kept in other groups survive.
    for (const item of watchlist.items.filter((entry) => entry.groupIds?.includes(groupId))) {
      watchlist.setGroupIds(item.symbol, (item.groupIds ?? []).filter((id) => id !== groupId))
    }
    feedback.value = `已清空分组「${name}」`
  }
  clearConfirmOpen.value = false
}

async function loadUniverse(): Promise<void> {
  feedback.value = ''
  await universe.ensureLoaded(true)
}

/* ---------- table cells ---------- */
function quoteOf(symbol: string): UniverseStock | undefined {
  return quotes.value.get(symbol)
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`
}

function volumeText(value: number): string {
  if (value >= 1e4) return `${(value / 1e4).toFixed(2)} 万手`
  return `${value.toFixed(0)} 手`
}

function cellValue(item: WatchItem, key: ColumnKey): string {
  const quote = quoteOf(item.symbol)
  switch (key) {
    case 'price':
      return quote?.price !== undefined ? formatPrice(quote.price) : '—'
    case 'pctChange':
      return quote?.pctChange !== undefined ? formatPercent(quote.pctChange) : '—'
    case 'changeAmount':
      return quote?.changeAmount !== undefined ? signed(quote.changeAmount) : '—'
    case 'volume':
      return quote?.volume !== undefined ? volumeText(quote.volume) : '—'
    case 'amount':
      return quote?.amount !== undefined ? formatAmount(quote.amount) : '—'
    case 'turnoverRate':
      return quote?.turnoverRate !== undefined ? `${quote.turnoverRate.toFixed(2)}%` : '—'
    case 'volumeRatio':
      return quote?.volumeRatio !== undefined ? quote.volumeRatio.toFixed(2) : '—'
    case 'pe':
      return quote?.pe !== undefined ? quote.pe.toFixed(2) : '—'
    case 'pb':
      return quote?.pb !== undefined ? quote.pb.toFixed(2) : '—'
    case 'marketCap':
      return quote?.marketCap !== undefined ? formatAmount(quote.marketCap) : '—'
    case 'floatCap':
      return quote?.floatCap !== undefined ? formatAmount(quote.floatCap) : '—'
    case 'amplitude':
      return quote?.amplitude !== undefined ? `${quote.amplitude.toFixed(2)}%` : '—'
    case 'high':
      return quote?.high !== undefined ? formatPrice(quote.high) : '—'
    case 'low':
      return quote?.low !== undefined ? formatPrice(quote.low) : '—'
    case 'open':
      return quote?.open !== undefined ? formatPrice(quote.open) : '—'
    case 'prevClose':
      return quote?.prevClose !== undefined ? formatPrice(quote.prevClose) : '—'
    case 'sector':
      return quote?.sector ?? '—'
    case 'quoteTime':
      return quote?.quoteTime ? formatDateTime(quote.quoteTime) : '—'
    default:
      return '—'
  }
}

function cellClass(item: WatchItem, key: ColumnKey): Record<string, boolean> {
  const change = quoteOf(item.symbol)?.changeAmount
  if (key === 'pctChange') {
    const pctValue = quoteOf(item.symbol)?.pctChange
    if (pctValue === undefined) return {}
    return { 'text-up': pctValue >= 0, 'text-down': pctValue < 0 }
  }
  if (key === 'changeAmount') {
    if (change === undefined) return {}
    return { 'text-up': change >= 0, 'text-down': change < 0 }
  }
  return {}
}
</script>

<template>
  <section class="page">
    <div class="add-compact">
      <div class="add-row">
        <input
          v-model="query"
          class="search-input add-query"
          type="search"
          placeholder="代码 / 名称，如 600519 或 茅台"
          aria-label="搜索股票代码或名称"
          :disabled="!hasUniverse"
        />
        <div class="add-group-picker">
          <button
            class="btn btn-mini add-group-btn"
            type="button"
            :class="{ 'is-open': addGroupOpen }"
            :aria-expanded="addGroupOpen"
            :title="addGroupTitle"
            @click="addGroupOpen = !addGroupOpen"
          >
            <span class="add-group-label">{{ addGroupLabel }}</span>
            <span class="add-group-caret" aria-hidden="true">▾</span>
          </button>
          <div v-if="addGroupOpen" class="add-group-pop" @click.stop>
            <label v-for="group in watchlist.groups" :key="group.id" class="add-group-option">
              <input type="checkbox" :checked="addGroupIds.includes(group.id)" @change="toggleAddGroup(group.id)" />
              <span>{{ group.name }}</span>
            </label>
            <p v-if="!watchlist.groups.length" class="empty-text">暂无分组</p>
          </div>
        </div>
        <button
          class="btn btn-mini add-quick"
          type="button"
          :disabled="!canQuickAdd"
          :title="quickAddTitle"
          @click="quickAdd"
        >
          {{ quickAddLabel }}
        </button>
      </div>

      <div v-if="universe.status === 'loading'" class="progress-block">
        <div class="progress-track"><i class="progress-fill" :style="{ width: `${progressPercent}%` }" /></div>
        <p class="hint-text">
          第 {{ universe.progress.loaded }} / {{ universe.progress.total }} 页 · 抓取完成后缓存到本地，同一交易日内不重复请求。
        </p>
      </div>

      <div v-else-if="!hasUniverse" class="empty-state compact">
        <h3>未加载全市场列表</h3>
        <p>需要一次分页抓取（约 60 页）；失败时会明确提示，不会退回假数据。</p>
        <button class="btn btn-primary" :disabled="universe.isLoading" @click="loadUniverse">加载全市场列表</button>
      </div>

      <div v-else-if="query.trim()" class="result-list">
        <div v-for="stock in results" :key="stock.symbol" class="result-item">
          <div class="result-main">
            <strong>{{ stock.name }}</strong>
            <span class="muted">{{ symbolText(stock.symbol) }} · {{ marketLabel(stock.market) }}</span>
            <span v-if="stock.sector" class="tag">{{ stock.sector }}</span>
            <span v-if="stock.st" class="tag tag-key">ST</span>
            <span v-if="stock.suspended" class="tag tag-key">疑似停牌</span>
          </div>
          <div class="result-quote">
            <span v-if="stock.price !== undefined" class="num">{{ formatPrice(stock.price) }}</span>
            <span
              v-if="stock.pctChange !== undefined"
              class="num"
              :class="stock.pctChange >= 0 ? 'text-up' : 'text-down'"
            >
              {{ formatPercent(stock.pctChange) }}
            </span>
          </div>
          <button
            class="btn btn-mini"
            :class="{ 'is-active': watchlist.has(stock.symbol) }"
            :disabled="watchlist.has(stock.symbol) || watchlist.isFull"
            @click="addStock(stock)"
          >
            {{ watchlist.has(stock.symbol) ? '已在池中' : '添加' }}
          </button>
        </div>
        <p v-if="results.length === 0" class="empty-text">没有匹配的股票。</p>
      </div>
    </div>

    <header class="watch-head">
      <div class="watch-head-main">
        <h1>{{ selectedGroupName }}</h1>
        <span class="tag">{{ groupItems.length }} 只</span>
      </div>
      <div class="watch-head-actions">
        <div class="watch-tools">
          <button class="btn btn-mini column-btn" type="button" :class="{ 'is-active': colsOpen }" @click="colsOpen = !colsOpen">
            列设置
          </button>
          <div v-if="colsOpen" class="column-pop">
            <div class="column-pop-list">
              <label v-for="meta in columnMeta" :key="meta.key" class="column-option">
                <input type="checkbox" :checked="columns[meta.key]" @change="toggleColumn(meta.key)" />
                <span>{{ meta.label }}</span>
              </label>
            </div>
            <button
              class="column-pop-clear"
              type="button"
              :disabled="groupItems.length === 0"
              @click="colsOpen = false; clearConfirmOpen = true"
            >
              清空当前分组
            </button>
          </div>
        </div>
        <button class="btn btn-mini sort-toggle" type="button" @click="sortDesc = !sortDesc">
          添加时间 {{ sortDesc ? '↓' : '↑' }}
        </button>
      </div>
    </header>

    <div class="freshness-bar">
      <span class="tag" :class="trading.isSession ? 'tag-live' : ''">
        最近交易日 {{ trading.latestTradingDay }} · {{ trading.phaseLabel }}
      </span>
      <span class="tag">收藏 {{ watchlist.count }} / {{ MAX_WATCHLIST }}</span>
      <span v-if="universe.status === 'ready'" class="tag tag-live">全市场 {{ universe.providerTotal || universe.count }} 只</span>
      <span v-if="universe.status === 'loading'" class="tag">
        抓取中 {{ universe.progress.loaded }} / {{ universe.progress.total }} 页
      </span>
      <span v-if="latestQuoteTime" class="muted">行情 {{ formatDateTime(latestQuoteTime) }}</span>
    </div>

    <p v-if="feedback" class="inline-warn">{{ feedback }}</p>

    <p v-if="universe.error" class="banner-error">
      {{ universe.error }}
      <button class="btn btn-mini error-retry" :disabled="universe.isLoading" @click="loadUniverse">重试</button>
    </p>

    <div class="watch-layout">
      <aside class="group-panel">
        <header class="group-panel-head">
          <h2>分组</h2>
          <span class="muted">{{ watchlist.groups.length }} 个</span>
        </header>

        <div class="group-list">
          <button
            class="group-row"
            type="button"
            :class="{ 'is-active': selectedGroup === '' }"
            @click="selectGroup('')"
          >
            <span class="group-row-name">全部</span>
            <span class="group-row-count">{{ watchlist.count }}</span>
          </button>
          <button
            v-if="watchlist.defaultGroup"
            class="group-row"
            type="button"
            :class="{ 'is-active': selectedGroup === watchlist.defaultGroup.id }"
            @click="selectGroup(watchlist.defaultGroup.id)"
          >
            <span class="group-row-name">
              {{ watchlist.defaultGroup.name }}
              <em class="group-flag">默认</em>
            </span>
            <span class="group-row-count">{{ groupCounts[watchlist.defaultGroup.id] ?? 0 }}</span>
          </button>
          <button
            v-for="group in orderedGroups"
            :key="group.id"
            class="group-row"
            type="button"
            :class="{ 'is-active': selectedGroup === group.id }"
            @click="selectGroup(group.id)"
          >
            <span class="group-row-name">{{ group.name }}</span>
            <span class="group-row-count">{{ groupCounts[group.id] ?? 0 }}</span>
          </button>
        </div>
        <p class="group-order-hint">默认分组在前，自定义分组按创建时间新→旧</p>

        <details class="group-manage">
          <summary>管理分组</summary>
          <div class="group-manage-body">
            <div class="group-create">
              <input
                v-model="groupManageName"
                class="search-input group-manage-input"
                type="text"
                maxlength="12"
                placeholder="新分组名称"
                aria-label="新分组名称"
                @keydown.enter="createGroup"
              />
              <button class="btn btn-mini" type="button" @click="createGroup">新建</button>
            </div>
            <p v-if="groupError" class="inline-warn" role="alert">{{ groupError }}</p>
            <div class="group-manage-list">
              <div v-for="group in watchlist.groups" :key="group.id" class="group-manage-row">
                <input
                  class="search-input group-manage-name"
                  type="text"
                  maxlength="12"
                  :value="group.name"
                  :aria-label="`重命名分组 ${group.name}`"
                  @change="renameGroup(group.id, $event)"
                />
                <button
                  class="btn btn-mini"
                  :class="{ 'group-delete-armed': pendingDeleteId === group.id }"
                  :disabled="group.isDefault"
                  :aria-label="`删除分组 ${group.name}`"
                  @click="askDeleteGroup(group.id)"
                >
                  {{ group.isDefault ? '不可删除' : pendingDeleteId === group.id ? '确认删除' : '删除' }}
                </button>
              </div>
            </div>
          </div>
        </details>
      </aside>

      <div class="watch-main">
        <div v-if="groupItems.length === 0" class="empty-state compact">
          <h2>当前分组暂无股票</h2>
          <p>去选股页挑选标的，点击「加入」即可收藏。</p>
          <div class="empty-actions">
            <RouterLink to="/screener" class="btn btn-primary">去选股</RouterLink>
          </div>
        </div>

        <div
          v-else
          ref="tableWrapRef"
          class="table-wrap"
          :class="{ 'is-x-scrolled': tableScrolledX }"
          @scroll="onTableScroll"
        >
          <table class="watch-table" :style="{ minWidth: `${tableMinWidth}px` }">
            <thead>
              <tr>
                <th class="action-col">操作</th>
                <th class="name-col" :style="thStyle('name')">
                  名称
                  <span class="col-resizer" @pointerdown="startResize('name', $event)" />
                </th>
                <th v-for="col in visibleColumns" :key="col.key" :style="thStyle(col.key)">
                  {{ col.label }}
                  <span class="col-resizer" @pointerdown="startResize(col.key, $event)" />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in groupItems" :key="item.symbol">
                <td class="action-cell">
                  <button
                    class="row-action-btn"
                    type="button"
                    :class="{ 'is-active': rowPop?.item.symbol === item.symbol }"
                    :aria-label="`${item.name} 操作`"
                    aria-haspopup="menu"
                    @click="openRowPop(item, $event)"
                  >
                    ⋯
                  </button>
                </td>
                <td class="name-cell" :style="thStyle('name')">
                  <RouterLink :to="`/stock/${item.symbol}?from=watchlist`" class="watch-name" :title="item.name">{{ item.name }}</RouterLink>
                  <span class="watch-meta">
                    {{ symbolText(item.symbol) }}
                    <template v-if="watchlist.groupNamesOf(item.symbol).length">
                      · {{ watchlist.groupNamesOf(item.symbol).join('、') }}
                    </template>
                  </span>
                </td>
                <td v-for="col in visibleColumns" :key="col.key" :class="cellClass(item, col.key)" :style="thStyle(col.key)">
                  {{ cellValue(item, col.key) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p v-if="watchlist.isFull" class="inline-warn">
          已达到 {{ MAX_WATCHLIST }} 只上限，分析时按并发 3、间隔 120ms 串行取数。
        </p>
      </div>
    </div>

    <div v-if="rowPop" class="row-pop" :style="{ top: `${rowPop.top}px`, left: `${rowPop.left}px` }">
      <template v-if="rowPop.mode === 'menu'">
        <header class="row-pop-head">
          <strong>{{ rowPop.item.name }}</strong>
          <span class="muted">{{ symbolText(rowPop.item.symbol) }}</span>
        </header>
        <button class="row-pop-item" type="button" @click="rowPop.mode = 'groups'">修改分组</button>
        <button class="row-pop-item is-danger" type="button" @click="removeFromPool(rowPop.item)">移除自选</button>
      </template>
      <template v-else>
        <header class="row-pop-head">
          <strong>修改分组</strong>
          <span class="muted">{{ rowPop.item.name }}</span>
        </header>
        <div class="row-pop-groups">
          <label v-for="group in watchlist.groups" :key="group.id" class="row-pop-group">
            <input
              type="checkbox"
              :checked="isInGroup(rowPop.item.symbol, group.id)"
              @change="watchlist.toggleGroup(rowPop.item.symbol, group.id)"
            />
            <span>{{ group.name }}</span>
            <em v-if="group.isDefault" class="group-flag">默认</em>
          </label>
        </div>
        <footer class="row-pop-footer">
          <button class="btn btn-ghost" type="button" @click="rowPop.mode = 'menu'">返回</button>
          <button class="btn btn-primary" type="button" @click="rowPop = null">完成</button>
        </footer>
      </template>
    </div>

    <button
      ref="toggleRef"
      class="groups-toggle"
      type="button"
      :style="toggleStyle()"
      :aria-expanded="groupsOpen"
      aria-controls="group-pop"
      @pointerdown="onTogglePointerDown"
      @click="toggleGroups"
    >
      分组
    </button>

    <div v-if="groupsOpen" id="group-pop" class="group-pop">
      <header class="group-pop-head">
        <strong>分组</strong>
        <span class="muted">{{ watchlist.groups.length }} 个</span>
      </header>
      <div class="group-pop-list">
        <button class="group-row" type="button" :class="{ 'is-active': selectedGroup === '' }" @click="selectGroup('')">
          <span class="group-row-name">全部</span>
          <span class="group-row-count">{{ watchlist.count }}</span>
        </button>
        <button
          v-if="watchlist.defaultGroup"
          class="group-row"
          type="button"
          :class="{ 'is-active': selectedGroup === watchlist.defaultGroup.id }"
          @click="selectGroup(watchlist.defaultGroup.id)"
        >
          <span class="group-row-name">
            {{ watchlist.defaultGroup.name }}
            <em class="group-flag">默认</em>
          </span>
          <span class="group-row-count">{{ groupCounts[watchlist.defaultGroup.id] ?? 0 }}</span>
        </button>
        <button
          v-for="group in orderedGroups"
          :key="group.id"
          class="group-row"
          type="button"
          :class="{ 'is-active': selectedGroup === group.id }"
          @click="selectGroup(group.id)"
        >
          <span class="group-row-name">{{ group.name }}</span>
          <span class="group-row-count">{{ groupCounts[group.id] ?? 0 }}</span>
        </button>
      </div>
      <footer class="group-pop-footer">
        <button class="btn btn-primary" type="button" @click="openGroupEdit">分组编辑</button>
      </footer>
    </div>

    <div v-if="groupEditOpen" class="group-edit-mask" @click="closeGroupEdit" />
    <div v-if="groupEditOpen" class="group-edit" role="dialog" aria-modal="true" aria-label="分组编辑">
      <header class="group-edit-head">
        <h2>分组编辑</h2>
        <button class="btn btn-mini" type="button" @click="closeGroupEdit">关闭</button>
      </header>
      <div class="group-edit-body">
        <div class="group-create">
          <input
            v-model="groupEditName"
            class="search-input"
            type="text"
            maxlength="12"
            placeholder="新分组名称"
            aria-label="新分组名称"
            @keydown.enter="createGroupInEdit"
          />
          <button class="btn btn-mini" type="button" @click="createGroupInEdit">新建</button>
        </div>
        <p v-if="groupEditError" class="inline-warn" role="alert">{{ groupEditError }}</p>
        <div class="group-edit-list">
          <div v-for="group in watchlist.groups" :key="group.id" class="group-edit-row">
            <input
              class="search-input group-edit-name"
              type="text"
              maxlength="12"
              :value="group.name"
              :aria-label="`重命名分组 ${group.name}`"
              @change="renameGroupInEdit(group.id, $event)"
            />
            <em v-if="group.isDefault" class="group-flag">默认</em>
            <button
              class="btn btn-mini group-edit-delete"
              type="button"
              :disabled="group.isDefault"
              :title="group.isDefault ? '默认分组不可删除' : undefined"
              @click="requestDeleteGroup(group.id)"
            >
              {{ group.isDefault ? '不可删除' : '删除' }}
            </button>
          </div>
        </div>

        <div v-if="deleteTargetId" ref="deleteConfirmRef" class="delete-confirm">
          <p class="delete-confirm-title">
            删除「{{ groupNameOf(deleteTargetId) }}」<template v-if="stocksInGroup(deleteTargetId) > 0">
              · 该分组下有 {{ stocksInGroup(deleteTargetId) }} 只股票
            </template>
          </p>
          <template v-if="stocksInGroup(deleteTargetId) > 0">
            <label class="delete-option">
              <input v-model="deleteMode" type="radio" value="migrate" />
              迁移到其他分组
            </label>
            <label class="delete-option">
              <input v-model="deleteMode" type="radio" value="delete" />
              连股票一起删除
            </label>
            <select v-if="deleteMode === 'migrate'" v-model="migrateTargetId" class="select-input delete-target">
              <option value="">选择目标分组</option>
              <option v-for="group in migrateOptions" :key="group.id" :value="group.id">
                {{ group.name }}{{ group.isDefault ? '（默认）' : '' }}
              </option>
            </select>
          </template>
          <p v-else class="delete-confirm-hint">空分组，可直接删除。</p>
          <p v-if="deleteError" class="inline-warn" role="alert">{{ deleteError }}</p>
          <div class="delete-confirm-actions">
            <button class="btn btn-mini" type="button" @click="requestDeleteGroup(deleteTargetId)">取消</button>
            <button class="btn btn-mini group-delete-armed" type="button" @click="confirmDeleteGroup">确认删除</button>
          </div>
        </div>
      </div>
      <footer class="group-edit-footer">
        <button class="btn btn-primary" type="button" @click="closeGroupEdit">完成</button>
      </footer>
    </div>

    <div v-if="clearConfirmOpen" class="clear-mask" @click="clearConfirmOpen = false" />
    <div v-if="clearConfirmOpen" class="clear-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-title">
      <h2 id="clear-title">清空「{{ selectedGroupName }}」？</h2>
      <p class="clear-hint">是否清空当前分组的所有股票，确认后只清空当前分组。</p>
      <div class="clear-actions">
        <button class="btn btn-mini" type="button" @click="clearConfirmOpen = false">取消</button>
        <button class="btn btn-mini group-delete-armed" type="button" @click="confirmClearGroup">确认清空</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.watch-layout {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

/* ---------- compact add entry ---------- */
.add-compact {
  margin-bottom: 12px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.add-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
}

.add-row .add-query {
  flex: 0 1 220px;
  min-width: 0;
  width: auto;
}

.add-row .add-quick {
  flex: 0 0 auto;
  margin-left: auto;
  border: 1px solid var(--accent-border);
  background: var(--accent-soft);
  color: var(--accent);
}

.add-row .add-quick:disabled {
  border-color: var(--border);
  background: transparent;
  color: var(--muted);
}

.add-group-picker {
  position: relative;
  flex: 1 1 120px;
  display: flex;
  min-width: 90px;
  max-width: 260px;
}

.add-group-btn {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--border);
}

.add-group-btn.is-open {
  border-color: var(--accent-border);
  color: var(--text);
}

.add-group-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-group-caret {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 10px;
}

.add-group-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: var(--z-page-pop);
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: max-content;
  min-width: 100%;
  max-width: min(260px, calc(100vw - 32px));
  max-height: 240px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}

.add-group-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 12.5px;
  white-space: nowrap;
  cursor: pointer;
}

.add-group-option:hover {
  background: var(--surface-2);
}

.add-compact .progress-block,
.add-compact .result-list,
.add-compact .empty-state {
  margin-top: 8px;
}

.group-panel {
  flex: 0 0 210px;
  width: 210px;
  position: sticky;
  top: calc(var(--header-h) + 12px);
  max-height: calc(100vh - var(--header-h) - 24px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.group-panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-panel-head h2 {
  margin: 0;
  font-size: 14px;
}

.panel-close {
  display: none;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  overflow-y: auto;
}

.group-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.group-row:hover {
  background: var(--surface-2);
}

.group-row.is-active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
}

.group-row-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-row-count {
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.group-flag {
  margin-left: 4px;
  padding: 0 4px;
  border: 1px solid var(--accent-border);
  border-radius: 4px;
  color: var(--accent);
  font-size: 11px;
  font-style: normal;
}

.group-order-hint {
  margin: 0;
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.5;
}

.group-manage {
  padding-top: 8px;
  border-top: 1px solid var(--divider);
}

.group-manage > summary {
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}

.group-manage-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.group-create {
  display: flex;
  gap: 6px;
}

.group-create .btn,
.group-manage-row .btn {
  flex: 0 0 auto;
  white-space: nowrap;
}

.group-manage-input {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
}

.group-manage-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
}

.group-manage-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
}

.group-manage-name {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
}

.group-delete-armed {
  color: var(--up);
  border-color: var(--up);
}

.watch-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.watch-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: nowrap;
  padding-bottom: 2px;
}

.watch-head-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
}

.watch-head-main h1 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.watch-head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  flex: 0 0 auto;
}

.watch-tools {
  position: relative;
  display: inline-flex;
}

.sort-toggle {
  white-space: nowrap;
}

.clear-mask {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-page-pop) + 6);
  background: rgba(10, 12, 16, 0.55);
}

.clear-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: calc(var(--z-page-pop) + 7);
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(320px, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}

.clear-hint {
  margin: 0;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.5;
}

.clear-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* Edge-docked strip: hugs the left border, slides vertically, snaps back on
   release. Only rendered while the left group menu is collapsed. */
.groups-toggle {
  position: fixed;
  top: 50%;
  left: 0;
  z-index: calc(var(--z-page-pop) + 5);
  transform: translateY(-50%);
  display: none;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 64px;
  padding: 0;
  border: 1px solid var(--accent-border);
  border-left: 0;
  border-radius: 0 10px 10px 0;
  background: var(--accent-soft);
  color: var(--text);
  font-size: 12px;
  letter-spacing: 1px;
  writing-mode: vertical-rl;
  text-orientation: upright;
  box-shadow: var(--shadow-pop);
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.groups-toggle:active {
  cursor: grabbing;
}

.column-btn.is-active {
  color: var(--text);
  border-color: var(--accent-border);
  background: var(--accent-soft);
}

.column-pop {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: var(--z-page-pop);
  display: flex;
  flex-direction: column;
  width: 168px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}

.column-pop-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 260px;
  overflow-y: auto;
}

.column-pop-clear {
  margin-top: 4px;
  padding: 6px;
  border: 0;
  border-top: 1px solid var(--divider);
  background: transparent;
  color: var(--muted);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}

.column-pop-clear:hover:not(:disabled) {
  color: var(--up);
}

.column-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 12.5px;
  cursor: pointer;
}

.column-option:hover {
  background: var(--surface-2);
}

.table-wrap {
  position: relative;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.watch-table {
  width: 100%;
  min-width: 720px;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 12.5px;
}

.watch-table th,
.watch-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--divider);
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.watch-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--surface);
  color: var(--muted);
  font-weight: 500;
}

.watch-table thead th.action-col,
.watch-table tbody td.action-cell {
  position: sticky;
  left: 0;
  z-index: 4;
  width: 56px;
  background: var(--surface);
  text-align: center;
}

.watch-table thead th.name-col,
.watch-table tbody td.name-cell {
  position: sticky;
  left: var(--action-col-w, 56px);
  z-index: 3;
  background: var(--surface);
  text-align: left;
}

.watch-table th {
  position: relative;
}

.col-resizer {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 6;
  width: 9px;
  height: 100%;
  cursor: col-resize;
  touch-action: none;
}

.col-resizer::after {
  content: '';
  position: absolute;
  top: 4px;
  bottom: 4px;
  right: 3px;
  width: 2px;
  border-radius: 2px;
  background: transparent;
}

.col-resizer:hover::after {
  background: var(--accent);
}

:global(body.is-col-resizing) {
  cursor: col-resize;
  user-select: none;
}

.table-wrap.is-x-scrolled .watch-table th.name-col,
.table-wrap.is-x-scrolled .watch-table td.name-cell {
  box-shadow: 10px 0 10px -10px rgba(0, 0, 0, 0.45);
}

.watch-name {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
  font-weight: 500;
}

.watch-name:hover {
  color: var(--accent);
}

.watch-meta {
  display: block;
  margin-top: 2px;
  color: var(--muted);
  font-size: 11px;
}

.row-action-btn {
  min-width: 30px;
  min-height: 28px;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.row-action-btn:hover,
.row-action-btn.is-active {
  color: var(--text);
  border-color: var(--accent-border);
  background: var(--accent-soft);
}

.table-empty {
  margin: 0;
  padding: 14px;
  color: var(--muted);
  text-align: center;
}

.row-pop {
  position: fixed;
  z-index: var(--z-page-pop);
  display: flex;
  flex-direction: column;
  width: 252px;
  max-height: 320px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}

.row-pop-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--divider);
  font-size: 12.5px;
}

.row-pop-item {
  padding: 9px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.row-pop-item:hover {
  background: var(--surface-2);
}

.row-pop-item.is-danger {
  color: var(--up);
}

.row-pop-groups {
  flex: 1 1 auto;
  min-height: 0;
  max-height: 184px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
  overflow-y: auto;
}

.row-pop-group {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 6px;
  border-radius: 6px;
  font-size: 12.5px;
  cursor: pointer;
}

.row-pop-group:hover {
  background: var(--surface-2);
}

.row-pop-footer {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--divider);
}

.group-edit-mask,
.group-edit {
  display: none;
}

.group-pop {
  position: fixed;
  top: 50%;
  left: 42px;
  z-index: calc(var(--z-page-pop) + 4);
  transform: translateY(-50%);
  transform-origin: left center;
  animation: group-pop-in 160ms ease-out;
  display: flex;
  flex-direction: column;
  width: min(280px, calc(100vw - 56px));
  height: min(60vh, 420px);
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}

.group-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--divider);
  font-size: 13px;
}

.group-pop-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.group-pop-footer {
  padding-top: 8px;
  border-top: 1px solid var(--divider);
}

/* Slides out from the left edge, matching the toggle's new position. */
@keyframes group-pop-in {
  from {
    opacity: 0;
    transform: translate(-10px, -50%);
  }
  to {
    opacity: 1;
    transform: translate(0, -50%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .group-pop {
    animation: none;
  }
}

.group-pop-footer .btn {
  width: 100%;
  justify-content: center;
}

.group-edit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--divider);
}

.group-edit-head h2 {
  margin: 0;
  font-size: 15px;
}

.group-edit-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0;
}

.group-edit-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.group-edit-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.group-edit-name {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
}

.group-edit-delete {
  flex: 0 0 auto;
  white-space: nowrap;
}

.delete-confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--divider);
  border-radius: 8px;
  background: var(--surface-2);
}

.delete-confirm-title {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
}

.delete-confirm-hint {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

.delete-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
}

.delete-target {
  width: 100%;
}

.delete-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.group-edit-footer {
  padding-top: 8px;
  border-top: 1px solid var(--divider);
}

.group-edit-footer .btn {
  width: 100%;
  justify-content: center;
}

@media (max-width: 900px) {
  .watch-layout {
    flex-direction: column;
    align-items: stretch;
  }

  .group-panel {
    display: none;
  }

  .groups-toggle {
    display: inline-flex;
  }

  .watch-table {
    min-width: 760px;
  }

  .col-resizer {
    display: none;
  }

  .group-edit-mask {
    display: block;
    position: fixed;
    inset: calc(var(--header-h) + 1px) 0 0 0;
    z-index: calc(var(--z-page-pop) + 5);
    background: rgba(0, 0, 0, 0.42);
  }

  .group-edit {
    display: flex;
    flex-direction: column;
    position: fixed;
    left: 50%;
    top: calc(50% + var(--header-h) / 2);
    transform: translate(-50%, -50%);
    z-index: calc(var(--z-page-pop) + 7);
    width: min(430px, calc(100vw - 24px));
    max-height: calc(100vh - var(--header-h) - 32px);
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: var(--shadow-pop);
  }
}
</style>
