<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useUniverseStore } from '@/stores/universe'
import { getTradingStatus } from '@/lib/trading-calendar'
import { formatAmount, formatDateTime, formatPercent, formatPrice, formatRelativeTime } from '@/lib/format'
import {
  fetchIndexTrend,
  fetchMarketIndices,
  MARKET_INDEX_DEFINITIONS,
  type MarketIndex,
} from '@/lib/market-indices'
import { fetchSectorBoardMap, fetchSectorTrend } from '@/lib/sector-trends'
import { computeSectorStats } from '@/lib/sector-stats'
import { loadMarketNews, type MarketNewsItem } from '@/services/stock-data'
import EmptyState from '@/components/EmptyState.vue'

const router = useRouter()
const universe = useUniverseStore()

const trading = getTradingStatus()

/* ---------- index board (collapsed, 40px chips) ---------- */
type LoadState = 'loading' | 'ready' | 'error'

const INDEX_SELECTION_KEY = 'stock-radar:dashboard-indices:v1'
const DEFAULT_INDEX_CODES = ['000001', '399001', '399006', '000300']

function loadIndexSelection(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_SELECTION_KEY)
    if (!raw) return [...DEFAULT_INDEX_CODES]
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(
        (code): code is string =>
          typeof code === 'string' && MARKET_INDEX_DEFINITIONS.some((item) => item.code === code),
      )
      if (valid.length > 0) return [...new Set(valid)]
    }
  } catch {
    localStorage.removeItem(INDEX_SELECTION_KEY)
  }
  return [...DEFAULT_INDEX_CODES]
}

const indices = ref<MarketIndex[]>([])
const indexState = ref<LoadState>('loading')
const indexRefreshing = ref(false)
const selectedCodes = ref<string[]>(loadIndexSelection())
const pickerOpen = ref(false)
const pickerNotice = ref('')
const lastIndexRefresh = ref<Date | null>(null)

const indexTrends = ref<Record<string, SectorTrendEntry>>({})

async function loadIndexTrends(): Promise<void> {
  for (const code of selectedCodes.value) {
    const current = indexTrends.value[code]
    if (current?.state === 'loading' || current?.state === 'ready') continue
    const definition = MARKET_INDEX_DEFINITIONS.find((item) => item.code === code)
    if (!definition) continue
    indexTrends.value = { ...indexTrends.value, [code]: { state: 'loading', points: [] } }
    void fetchIndexTrend(definition)
      .then((trend) => {
        indexTrends.value = { ...indexTrends.value, [code]: { state: 'ready', points: trend.points } }
      })
      .catch(() => {
        indexTrends.value = { ...indexTrends.value, [code]: { state: 'error', points: [] } }
      })
  }
}

const indexPlaceholders = MARKET_INDEX_DEFINITIONS.map((item) => ({
  code: item.code,
  name: item.name,
  shortName: item.shortName,
  primary: item.primary,
  price: Number.NaN,
  change: Number.NaN,
  pctChange: Number.NaN,
  turnover: undefined as number | undefined,
}))
const displayedIndices = computed(() => (indices.value.length > 0 ? indices.value : indexPlaceholders))
const selectedIndices = computed(() => {
  const byCode = new Map(displayedIndices.value.map((item) => [item.code, item]))
  return MARKET_INDEX_DEFINITIONS.map((definition) => byCode.get(definition.code))
    .filter(
      (item): item is MarketIndex => item !== undefined && selectedCodes.value.includes(item.code),
    )
})
const primaryQuotes = computed(() =>
  displayedIndices.value.filter((item) => item.primary && Number.isFinite(item.pctChange)),
)

function isIndexSelected(code: string): boolean {
  return selectedCodes.value.includes(code)
}

function persistIndexSelection(): void {
  localStorage.setItem(INDEX_SELECTION_KEY, JSON.stringify(selectedCodes.value))
}

function toggleIndex(code: string): void {
  if (isIndexSelected(code)) {
    if (selectedCodes.value.length <= 1) {
      pickerNotice.value = '至少保留 1 个指数'
      return
    }
    selectedCodes.value = selectedCodes.value.filter((item) => item !== code)
  } else {
    selectedCodes.value = [...selectedCodes.value, code]
  }
  pickerNotice.value = ''
  persistIndexSelection()
}

async function refreshIndices(): Promise<void> {
  if (indexRefreshing.value) return
  indexRefreshing.value = true
  if (indices.value.length === 0) indexState.value = 'loading'
  try {
    indices.value = await fetchMarketIndices()
    indexState.value = 'ready'
    lastIndexRefresh.value = new Date()
  } catch {
    indexState.value = 'error'
  } finally {
    indexRefreshing.value = false
  }
}

function refreshOverview(): void {
  void universe.ensureLoaded(true)
  void refreshIndices()
}

function openIndex(code: string): void {
  void router.push({ path: `/index/${code}`, query: { from: 'home' } })
}

type TrendState = 'up' | 'down' | 'flat'

function trendOf(value: number): TrendState {
  if (!Number.isFinite(value) || value === 0) return 'flat'
  return value > 0 ? 'up' : 'down'
}

function toneOf(value: number): string {
  return `is-${trendOf(value)}`
}

/* ---------- market breadth / sentiment ---------- */
const breadth = computed(() => {
  let up = 0
  let down = 0
  let flat = 0
  let sum = 0
  for (const stock of universe.items) {
    const pct = stock.pctChange
    if (pct === undefined || !Number.isFinite(pct)) continue
    if (pct > 0) up += 1
    else if (pct < 0) down += 1
    else flat += 1
    sum += pct
  }
  const total = up + down + flat
  const risingShare = up + down > 0 ? up / (up + down) : 0
  return { up, down, flat, total, avg: total > 0 ? sum / total : 0, risingShare }
})

const sentimentLabel = computed(() => {
  const share = breadth.value.risingShare
  if (breadth.value.total === 0) return '数据同步中'
  if (share >= 0.6) return '情绪偏强'
  if (share >= 0.45) return '多空分化'
  if (share >= 0.3) return '情绪偏弱'
  return '弱势调整'
})

const indexSentence = computed(() => {
  const list = primaryQuotes.value
  if (!list.length) return '指数数据加载中'
  return list
    .map((item) => `${item.shortName} ${formatPercent(item.pctChange)}`)
    .join('、')
})

const summaryText = computed(() => {
  if (universe.count === 0) {
    return '正在同步全市场列表，涨跌家数与情绪将以当日行情计算；指数与资讯无需等待。'
  }
  const { up, down, flat, total, avg, risingShare } = breadth.value
  return (
    `今日全市场 ${total} 只有效样本中，上涨 ${up} 家、下跌 ${down} 家、平盘 ${flat} 家，` +
    `上涨占比 ${(risingShare * 100).toFixed(1)}%（不含平盘），` +
    `等权平均涨跌幅 ${formatPercent(avg)}，${sentimentLabel.value}；` +
    `主要指数：${indexSentence.value}。`
  )
})

const breadthMetrics = computed(() => {
  const { up, down, flat, avg } = breadth.value
  return [
    { label: '上涨', value: `${up} 家`, tone: 'is-up' },
    { label: '下跌', value: `${down} 家`, tone: 'is-down' },
    { label: '平盘', value: `${flat} 家`, tone: 'is-flat' },
    { label: '平均涨跌', value: formatPercent(avg), tone: toneOf(avg) },
    { label: '市场情绪', value: sentimentLabel.value, tone: '' },
  ]
})

const universeFreshness = computed(() => {
  if (!universe.fetchedAt) return '全市场列表尚未加载'
  return `全市场列表 ${formatDateTime(universe.fetchedAt)} 更新`
})

/* ---------- industry heat ---------- */
const sectorExpanded = ref(false)
const sectorStats = computed(() => computeSectorStats(universe.items))
const eligibleSectors = computed(() => sectorStats.value.filter((item) => item.count >= 3))
const hotSectors = computed(() => [...eligibleSectors.value].sort((a, b) => b.avg - a.avg).slice(0, 10))
const coldSectors = computed(() => [...eligibleSectors.value].sort((a, b) => a.avg - b.avg).slice(0, 10))
const visibleHotSectors = computed(() => (sectorExpanded.value ? hotSectors.value : hotSectors.value.slice(0, 5)))
const visibleColdSectors = computed(() => (sectorExpanded.value ? coldSectors.value : coldSectors.value.slice(0, 5)))
const canExpandSectors = computed(() => hotSectors.value.length > 5 || coldSectors.value.length > 5)

/* Sector mini sparkline: Eastmoney industry-board intraday trend. */
interface SectorTrendEntry {
  state: 'loading' | 'ready' | 'error'
  points: number[]
}

const SPARK_W = 120
const SPARK_H = 32
const sectorTrends = ref<Record<string, SectorTrendEntry>>({})

function sparkLine(points: number[]): string {
  if (points.length < 2) return ''
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const step = SPARK_W / (points.length - 1)
  return points
    .map((value, index) => {
      const x = (index * step).toFixed(1)
      const y = (4 + ((max - value) / span) * (SPARK_H - 8)).toFixed(1)
      return `${index === 0 ? 'M' : 'L'}${x},${y}`
    })
    .join(' ')
}

async function loadSectorTrends(): Promise<void> {
  const names = [...new Set([...hotSectors.value, ...coldSectors.value].map((item) => item.name))]
  if (!names.length) return
  let boardMap: Map<string, string>
  try {
    boardMap = await fetchSectorBoardMap()
  } catch {
    return
  }
  for (const name of names) {
    const current = sectorTrends.value[name]
    if (current?.state === 'loading' || current?.state === 'ready') continue
    const boardCode = boardMap.get(name)
    if (!boardCode) {
      sectorTrends.value = { ...sectorTrends.value, [name]: { state: 'error', points: [] } }
      continue
    }
    sectorTrends.value = { ...sectorTrends.value, [name]: { state: 'loading', points: [] } }
    void fetchSectorTrend(boardCode)
      .then((points) => {
        sectorTrends.value = { ...sectorTrends.value, [name]: { state: 'ready', points } }
      })
      .catch(() => {
        sectorTrends.value = { ...sectorTrends.value, [name]: { state: 'error', points: [] } }
      })
  }
}

function sectorSparkPath(name: string): string {
  const entry = sectorTrends.value[name]
  return entry?.state === 'ready' ? sparkLine(entry.points) : ''
}

function indexSparkPath(code: string): string {
  const entry = indexTrends.value[code]
  return entry?.state === 'ready' ? sparkLine(entry.points) : ''
}

function sectorSparkLabel(name: string): string {
  const entry = sectorTrends.value[name]
  if (!entry || entry.state === 'loading') return '板块分时加载中'
  if (entry.state === 'error') return '板块分时暂缺'
  return '板块分时'
}

function openSector(name: string): void {
  void router.push({ path: `/sector/${encodeURIComponent(name)}`, query: { from: 'home' } })
}

async function loadSectors(): Promise<void> {
  await universe.ensureLoaded(true)
  void loadSectorTrends()
}

/* ---------- news ---------- */
const news = ref<MarketNewsItem[]>([])
const newsState = ref<LoadState>('loading')
const newsRefreshing = ref(false)
const newsFailed = ref<string[]>([])
const newsCategory = ref<'all' | 'market' | 'industry' | 'policy' | 'stock' | 'other'>('all')
const newsSubCategory = ref<string | null>(null)
const categoryOpen = ref(false)
const expandedCategory = ref<string | null>(null)
const lastNewsRefresh = ref<Date | null>(null)

const POLICY_KEYWORDS = ['政策', '监管', '证监会', '央行', '国务院', '财政部', '发改委', '降准', '降息', '利率', '印花税']
const MARKET_KEYWORDS = ['指数', '大盘', 'A股', '沪指', '深成指', '创业板', '成交额', '两市', '行情', '北向']
const INDUSTRY_KEYWORDS = ['行业', '板块', '产业', '光伏', '半导体', '芯片', '新能源', '医药', '汽车', '地产', '银行', '券商', '消费', '军工', '有色', '煤炭']

function hasSymbol(item: MarketNewsItem): boolean {
  return (item.symbols?.length ?? 0) > 0
}

const sectorNames = computed(() => new Set(sectorStats.value.map((item) => item.name)))

function newsCategoryOf(item: MarketNewsItem): Exclude<typeof newsCategory.value, 'all'> {
  const title = `${item.title}${item.content ?? ''}`
  if (hasSymbol(item)) return 'stock'
  if (POLICY_KEYWORDS.some((word) => title.includes(word))) return 'policy'
  if (INDUSTRY_KEYWORDS.some((word) => title.includes(word))) return 'industry'
  if ([...sectorNames.value].some((name) => title.includes(name))) return 'industry'
  if (MARKET_KEYWORDS.some((word) => title.includes(word))) return 'market'
  return 'other'
}

const newsCategories = computed(() => {
  const counts = { all: news.value.length, market: 0, industry: 0, policy: 0, stock: 0, other: 0 }
  for (const item of news.value) counts[newsCategoryOf(item)] += 1
  const tabs = [
    { key: 'all' as const, label: '全部', count: counts.all },
    { key: 'market' as const, label: '市场行情', count: counts.market },
    { key: 'industry' as const, label: '行业板块', count: counts.industry },
    { key: 'policy' as const, label: '政策监管', count: counts.policy },
    { key: 'stock' as const, label: '个股相关', count: counts.stock },
    { key: 'other' as const, label: '其他', count: counts.other },
  ]
  // Keep the selector short: only categories with matching headlines, plus 全部.
  return tabs.filter((tab) => tab.key === 'all' || tab.count > 0)
})

function newsText(item: MarketNewsItem): string {
  return `${item.title}${item.content ?? ''}`
}

/** Industry subcategories come from sectors that actually appear in headlines. */
const newsCategoryGroups = computed(() => {
  const industryChildren = [...sectorNames.value]
    .map((name) => ({ name, count: news.value.filter((item) => newsText(item).includes(name)).length }))
    .filter((child) => child.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  return newsCategories.value.map((tab) => ({
    key: tab.key,
    label: tab.label,
    count: tab.count,
    children: tab.key === 'industry' ? industryChildren : [],
  }))
})

const currentCategoryLabel = computed(() => {
  if (newsSubCategory.value) return newsSubCategory.value
  return newsCategories.value.find((tab) => tab.key === newsCategory.value)?.label ?? '全部'
})

function selectCategory(key: typeof newsCategory.value, sub: string | null = null): void {
  newsCategory.value = key
  newsSubCategory.value = sub
  categoryOpen.value = false
}

function toggleCategoryPop(): void {
  categoryOpen.value = !categoryOpen.value
  if (!categoryOpen.value) expandedCategory.value = null
}

const filteredNews = computed(() => {
  if (newsSubCategory.value) {
    return news.value.filter((item) => newsText(item).includes(newsSubCategory.value!))
  }
  if (newsCategory.value === 'all') return news.value
  return news.value.filter((item) => newsCategoryOf(item) === newsCategory.value)
})

async function refreshNews(): Promise<void> {
  if (newsRefreshing.value) return
  newsRefreshing.value = true
  if (news.value.length === 0) newsState.value = 'loading'
  try {
    const result = await loadMarketNews(24)
    news.value = result.items
    newsFailed.value = result.failed
    newsState.value = 'ready'
    lastNewsRefresh.value = new Date()
    if (
      newsCategory.value !== 'all' &&
      !newsCategories.value.some((tab) => tab.key === newsCategory.value)
    ) {
      newsCategory.value = 'all'
      newsSubCategory.value = null
    }
    if (
      newsSubCategory.value &&
      !news.value.some((item) => newsText(item).includes(newsSubCategory.value!))
    ) {
      newsSubCategory.value = null
    }
  } catch {
    newsState.value = 'error'
  } finally {
    newsRefreshing.value = false
  }
}

/* ---------- lifecycle / auto refresh ---------- */
let indexTimer: number | undefined
let newsTimer: number | undefined

function closePicker(event: Event): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('.picker-anchor') || target?.closest('.news-category-anchor')) return
  pickerOpen.value = false
  categoryOpen.value = false
}

/* Per-card update stamps: only successful fetch times, never the local clock. */
function clockText(value: string | Date | null): string {
  const stamp =
    value === null ? Number.NaN : typeof value === 'string' ? new Date(value).getTime() : value.getTime()
  if (!Number.isFinite(stamp)) return '尚未更新'
  const d = new Date(stamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `更新 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const overviewStamp = computed(() => clockText(universe.fetchedAt))
const overviewFailed = computed(() => universe.status === 'error')
const indexStamp = computed(() => clockText(lastIndexRefresh.value))
const indexFailed = computed(() => indexState.value === 'error')
const sectorStamp = computed(() => clockText(universe.fetchedAt))
const newsStamp = computed(() => clockText(lastNewsRefresh.value))
const newsFailedState = computed(() => newsState.value === 'error')

onMounted(() => {
  void refreshIndices()
  void loadIndexTrends()
  void refreshNews()
  if (universe.count === 0 && !universe.isLoading) void universe.ensureLoaded()
  document.addEventListener('click', closePicker)
  indexTimer = window.setInterval(() => {
    if (!document.hidden) void refreshIndices()
  }, 30_000)
  newsTimer = window.setInterval(() => {
    if (!document.hidden) void refreshNews()
  }, 120_000)
})

watch(selectedCodes, () => void loadIndexTrends())

watch(
  () => universe.count,
  (count) => {
    if (count > 0) void loadSectorTrends()
  },
  { immediate: true },
)

onUnmounted(() => {
  if (indexTimer !== undefined) window.clearInterval(indexTimer)
  if (newsTimer !== undefined) window.clearInterval(newsTimer)
  document.removeEventListener('click', closePicker)
})

const autoRefreshTip = computed(() => {
  const indexAt = lastIndexRefresh.value ? formatRelativeTime(lastIndexRefresh.value.toISOString()) : '等待首次刷新'
  return `指数每 30 秒自动刷新（最近 ${indexAt}），资讯每 2 分钟自动刷新`
})
</script>

<template>
  <section class="page dashboard-page">
    <header class="page-head overview-head">
      <div class="overview-title">
        <h1>市场概览</h1>
        <p>{{ trading.latestTradingDay }} · {{ trading.phaseLabel }} · {{ autoRefreshTip }}</p>
      </div>
    </header>

    <div class="card market-summary">
      <header class="card-head">
        <div class="card-title">
          <h2>今日概览</h2>
          <p class="card-desc">A 股当日整体表现与情绪，随指数轮询更新。</p>
        </div>
        <div class="card-head-actions">
          <button class="btn btn-mini" type="button" :disabled="universe.isLoading" @click="refreshOverview">
            {{ universe.isLoading ? '刷新中…' : '刷新' }}
          </button>
          <span class="tag card-time" :class="{ 'tag-warn': overviewFailed }">
            {{ overviewStamp }}<template v-if="overviewFailed"> · 刷新失败</template>
          </span>
        </div>
      </header>
      <p class="summary-text">{{ summaryText }}</p>
      <div class="summary-metrics">
        <span v-for="item in breadthMetrics" :key="item.label" class="summary-metric">
          <small>{{ item.label }}</small>
          <b :class="item.tone">{{ item.value }}</b>
        </span>
      </div>
      <p class="hint-text summary-note">
        口径：涨跌家数按东财全市场列表当日涨跌幅统计（剔除停牌与无涨跌幅标的），平均涨跌幅为等权平均；
        情绪按上涨家数占比分档（≥60% 偏强、45–60% 分化、30–45% 偏弱、&lt;30% 弱势）；指数取上证 / 深证 / 创业板。
        该段仅描述当日市场，不参与个股评分。{{ universeFreshness }}
      </p>
    </div>

    <div class="card index-card">
      <header class="card-head">
        <div class="card-title">
          <h2>实时指数 <span class="muted">已选 {{ selectedIndices.length }} / {{ MARKET_INDEX_DEFINITIONS.length }}</span></h2>
          <p class="card-desc">点击指数卡片查看该指数下的股票列表。</p>
        </div>
        <div class="card-head-actions picker-anchor">
          <button
            class="btn btn-mini"
            type="button"
            :aria-expanded="pickerOpen"
            @click="pickerOpen = !pickerOpen"
          >
            {{ pickerOpen ? '收起' : '全部指数' }}
          </button>
          <button
            class="btn btn-mini"
            type="button"
            :disabled="indexRefreshing"
            @click="refreshIndices"
          >
            {{ indexRefreshing ? '刷新中…' : '刷新' }}
          </button>
          <span class="tag card-time" :class="{ 'tag-warn': indexFailed }">
            {{ indexStamp }}<template v-if="indexFailed"> · 刷新失败</template>
          </span>
          <div v-if="pickerOpen" class="index-pop" role="dialog" aria-label="选择要展示的指数">
            <header class="pop-head">
              <strong>全部指数</strong>
              <span>勾选后即时生效，选择保存在本机</span>
            </header>
            <div class="pop-list">
              <label v-for="item in displayedIndices" :key="item.code" class="pop-item">
                <input
                  type="checkbox"
                  :checked="isIndexSelected(item.code)"
                  :disabled="indexState !== 'ready'"
                  @change="toggleIndex(item.code)"
                />
                <span class="pop-name">{{ item.name }}</span>
                <span class="pop-price">{{ formatPrice(item.price) }}</span>
                <span class="pop-pct" :class="toneOf(item.pctChange)">{{ formatPercent(item.pctChange) }}</span>
              </label>
            </div>
            <p v-if="pickerNotice" class="pop-notice">{{ pickerNotice }}</p>
          </div>
        </div>
      </header>

      <div class="index-row">
        <button
          v-for="item in selectedIndices"
          :key="item.code"
          class="index-chip"
          type="button"
          :title="`${item.name} ${item.code}${item.turnover ? ` · 成交额 ${formatAmount(item.turnover)}` : ''}`"
          :class="{ 'is-placeholder': indexState !== 'ready' }"
          @click="openIndex(item.code)"
        >
          <span class="chip-main">
            <span class="chip-name">{{ item.name }}</span>
            <span class="chip-values">
              <span class="chip-price">{{ formatPrice(item.price) }}</span>
              <span class="chip-pct" :class="toneOf(item.pctChange)">{{ formatPercent(item.pctChange) }}</span>
            </span>
          </span>
          <svg class="chip-spark" viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true">
            <path
              v-if="indexSparkPath(item.code)"
              class="chip-spark-line"
              :class="toneOf(item.pctChange)"
              :d="indexSparkPath(item.code)"
            />
            <line v-else x1="0" y1="16" x2="120" y2="16" class="chip-spark-placeholder" />
          </svg>
        </button>
      </div>

      <p v-if="indexState === 'error'" class="index-error-hint">
        指数接口请求失败，将在 30 秒后自动重试；也可
        <button class="link-btn" type="button" :disabled="indexRefreshing" @click="refreshIndices">立即重试</button>
      </p>
    </div>

    <div class="card sector-board">
      <header class="card-head sector-board-head">
        <div class="sector-title-row">
          <h2>行业冷热榜</h2>
          <div class="card-head-actions">
            <button
              v-if="canExpandSectors"
              class="btn btn-mini"
              type="button"
              @click="sectorExpanded = !sectorExpanded"
            >
              {{ sectorExpanded ? '收起前 5' : '展开前 10' }}
            </button>
            <RouterLink :to="{ path: '/sectors', query: { from: 'home' } }" class="btn btn-mini">更多</RouterLink>
            <button class="btn btn-mini" type="button" :disabled="universe.isLoading" @click="loadSectors">
              {{ universe.isLoading ? '同步中…' : '刷新' }}
            </button>
            <span class="tag card-time">{{ sectorStamp }}</span>
          </div>
        </div>
        <p class="card-desc sector-desc">
          按东财板块字段分组的当日平均涨跌幅排序，样本 ≥ 3 只；默认展示前 5，可展开前 10，点击行业查看全部股票。
        </p>
      </header>

      <div v-if="universe.isLoading" class="sector-loading">
        <span class="sector-spinner" aria-hidden="true" />
        正在同步全市场列表 {{ universe.progress.loaded }} / {{ universe.progress.total || '—' }}
      </div>
      <div v-else-if="!universe.count" class="sector-empty">
        <EmptyState
          title="还没有板块样本"
          description="行业冷热榜基于全市场列表的板块字段计算，先同步一次全市场行情。"
          compact
        >
          <button class="btn btn-primary" type="button" @click="loadSectors">加载全市场列表</button>
        </EmptyState>
      </div>
      <div v-else class="sector-columns">
        <section class="sector-column">
          <header class="sector-column-head">
            <h3>热榜 <span class="muted">涨幅居前</span></h3>
            <span class="tag">TOP 10</span>
          </header>
          <ol class="sector-list">
            <li v-for="(item, index) in visibleHotSectors" :key="item.name">
              <button
                class="sector-row"
                type="button"
                :title="`查看 ${item.name} 全部股票`"
                @click="openSector(item.name)"
              >
                <span class="sector-rank">{{ index + 1 }}</span>
                <span class="sector-name">{{ item.name }}</span>
                <span class="sector-count">{{ item.count }}只</span>
                <svg
                  class="sector-spark"
                  viewBox="0 0 120 32"
                  preserveAspectRatio="none"
                  :aria-label="sectorSparkLabel(item.name)"
                >
                  <path
                    v-if="sectorSparkPath(item.name)"
                    class="sector-spark-line"
                    :class="toneOf(item.avg)"
                    :d="sectorSparkPath(item.name)"
                  />
                  <line v-else x1="0" y1="16" x2="120" y2="16" class="sector-spark-placeholder" />
                </svg>
                <span class="sector-avg" :class="toneOf(item.avg)">{{ formatPercent(item.avg) }}</span>
              </button>
            </li>
            <li v-if="!visibleHotSectors.length" class="sector-row-empty">
              暂无满足样本数（≥3）的板块
            </li>
          </ol>
        </section>

        <section class="sector-column">
          <header class="sector-column-head">
            <h3>冷榜 <span class="muted">跌幅居前</span></h3>
            <span class="tag">TOP 10</span>
          </header>
          <ol class="sector-list">
            <li v-for="(item, index) in visibleColdSectors" :key="item.name">
              <button
                class="sector-row"
                type="button"
                :title="`查看 ${item.name} 全部股票`"
                @click="openSector(item.name)"
              >
                <span class="sector-rank">{{ index + 1 }}</span>
                <span class="sector-name">{{ item.name }}</span>
                <span class="sector-count">{{ item.count }}只</span>
                <svg
                  class="sector-spark"
                  viewBox="0 0 120 32"
                  preserveAspectRatio="none"
                  :aria-label="sectorSparkLabel(item.name)"
                >
                  <path
                    v-if="sectorSparkPath(item.name)"
                    class="sector-spark-line"
                    :class="toneOf(item.avg)"
                    :d="sectorSparkPath(item.name)"
                  />
                  <line v-else x1="0" y1="16" x2="120" y2="16" class="sector-spark-placeholder" />
                </svg>
                <span class="sector-avg" :class="toneOf(item.avg)">{{ formatPercent(item.avg) }}</span>
              </button>
            </li>
            <li v-if="!visibleColdSectors.length" class="sector-row-empty">
              暂无满足样本数（≥3）的板块
            </li>
          </ol>
        </section>
      </div>

      <p class="hint-text sector-footnote">
        口径：按东财全市场列表的板块字段分组，对当日涨跌幅做简单平均，要求样本 ≥ 3 只，剔除「未分类」与缺失涨跌幅的标的。
        迷你折线为对应东财行业板块的当日分时，映射或请求失败时显示占位；该榜单只用于观察板块强弱，不参与个股评分。
      </p>
    </div>

    <div class="card news-card">
      <header class="card-head news-card-head">
        <div class="card-title">
          <h2>时事资讯</h2>
          <p class="card-desc">按标题关键词做规则归类，仅用于快速筛选；点击标题在新窗口打开原文。</p>
        </div>
        <div class="card-head-actions">
          <button class="btn btn-mini" type="button" :disabled="newsRefreshing" @click="refreshNews">
            {{ newsRefreshing ? '刷新中…' : '刷新' }}
          </button>
          <span class="tag card-time" :class="{ 'tag-warn': newsFailedState }">
            {{ newsStamp }}<template v-if="newsFailedState"> · 刷新失败</template>
          </span>
        </div>
      </header>

      <div class="news-toolbar">
        <div class="news-category-anchor">
          <button
            class="news-category-trigger"
            type="button"
            :aria-expanded="categoryOpen"
            aria-haspopup="listbox"
            @click="toggleCategoryPop"
          >
            <span class="news-category-current">{{ currentCategoryLabel }}</span>
            <span class="news-category-count">{{ filteredNews.length }}</span>
            <span class="news-category-chevron" :class="{ 'is-open': categoryOpen }" aria-hidden="true">▾</span>
          </button>

          <div v-if="categoryOpen" class="news-category-pop" role="listbox" aria-label="资讯分类">
            <div v-for="group in newsCategoryGroups" :key="group.key" class="news-category-group">
              <div class="news-category-row" :class="{ 'is-active': newsCategory === group.key && !newsSubCategory }">
                <button class="news-category-main" type="button" @click="selectCategory(group.key)">
                  <span>{{ group.label }}</span>
                  <small>{{ group.count }}</small>
                </button>
                <button
                  v-if="group.children.length"
                  class="news-category-expand"
                  type="button"
                  :aria-expanded="expandedCategory === group.key"
                  :aria-label="`展开 ${group.label} 子分类`"
                  @click="expandedCategory = expandedCategory === group.key ? null : group.key"
                >
                  <span :class="{ 'is-open': expandedCategory === group.key }" aria-hidden="true">›</span>
                </button>
              </div>
              <div v-if="group.children.length && expandedCategory === group.key" class="news-category-children">
                <button
                  v-for="child in group.children"
                  :key="child.name"
                  class="news-category-child"
                  :class="{ 'is-active': newsSubCategory === child.name }"
                  type="button"
                  @click="selectCategory(group.key, child.name)"
                >
                  <span>{{ child.name }}</span>
                  <small>{{ child.count }}</small>
                </button>
              </div>
            </div>
          </div>
        </div>
        <span class="news-toolbar-hint">支持逐级展开子分类，点击大类直接筛选整个大类</span>
      </div>

      <div v-if="newsState === 'loading'" class="news-loading">
        <span class="news-skeleton" />
        <span class="news-skeleton" />
        <span class="news-skeleton" />
      </div>
      <EmptyState
        v-else-if="newsState === 'error'"
        title="资讯暂时获取失败"
        description="已启用的新闻源均未返回数据，请检查网络或稍后重试。"
        compact
      >
        <button class="btn btn-ghost" type="button" :disabled="newsRefreshing" @click="refreshNews">重试</button>
      </EmptyState>
      <EmptyState
        v-else-if="!filteredNews.length"
        title="该分类暂无资讯"
        description="切换其他分类，或等待下一次自动刷新。"
        compact
      />
      <ul v-else class="news-list">
        <li v-for="item in filteredNews" :key="item.id">
          <a
            v-if="item.url"
            class="news-row"
            :href="item.url"
            target="_blank"
            rel="noopener noreferrer"
          >
            <strong>{{ item.title }}</strong>
            <span class="news-meta">{{ item.sourceName }} · {{ formatRelativeTime(item.publishedAt) }}</span>
          </a>
          <div v-else class="news-row">
            <strong>{{ item.title }}</strong>
            <span class="news-meta">{{ item.sourceName }} · {{ formatRelativeTime(item.publishedAt) }}</span>
          </div>
        </li>
      </ul>
      <p class="hint-text news-note">
        分类为按标题关键词的规则归类（新闻源本身不返回分类字段），仅用于快速筛选；点击标题在新窗口打开原文。
      </p>
      <p v-if="newsFailed.length" class="hint-text news-failed">
        部分来源未返回：{{ newsFailed.join('；') }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.dashboard-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.overview-head {
  padding-bottom: 0;
}

.overview-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.market-summary {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-text {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--text);
}

.summary-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.summary-metric {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  font-size: 11.5px;
}

.summary-metric small {
  color: var(--muted);
  font-size: 10.5px;
}

.summary-metric b {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.summary-metric b.is-up {
  color: var(--up);
}

.summary-metric b.is-down {
  color: var(--down);
}

.summary-metric b.is-flat {
  color: var(--muted);
}

.summary-note {
  margin: 0;
}

.card-title {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.card-desc {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.5;
}

.picker-anchor {
  position: relative;
}

.index-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.index-chip {
  flex: 1 1 150px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  height: 40px;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.index-chip:hover {
  border-color: var(--accent-border);
  background: var(--surface-3);
}

.index-chip.is-placeholder {
  opacity: 0.7;
}

.chip-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.chip-spark {
  width: 46px;
  height: 16px;
  flex: none;
}

.chip-spark-line {
  fill: none;
  stroke-width: 1.2;
  vector-effect: non-scaling-stroke;
}

.chip-spark-line.is-up {
  stroke: var(--up);
}

.chip-spark-line.is-down {
  stroke: var(--down);
}

.chip-spark-line.is-flat {
  stroke: var(--muted);
}

.chip-spark-placeholder {
  stroke: var(--border-strong);
  stroke-dasharray: 3 3;
  stroke-width: 1;
}

.chip-name {
  font-size: 10px;
  line-height: 1.1;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chip-values {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
  line-height: 1.2;
}

.chip-price {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.chip-pct {
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.chip-pct.is-up {
  color: var(--up);
}

.chip-pct.is-down {
  color: var(--down);
}

.chip-pct.is-flat {
  color: var(--muted);
}

.index-pop {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: var(--z-page-pop);
  width: min(330px, calc(100vw - 28px));
  padding: 10px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}

.pop-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 2px 10px;
  margin-bottom: 6px;
  font-size: 10.5px;
  color: var(--muted);
}

.pop-head strong {
  font-size: 12px;
  color: var(--text);
}

.pop-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: min(46vh, 330px);
  overflow-y: auto;
}

.pop-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 6px;
  font-size: 11.5px;
  cursor: pointer;
}

.pop-item:hover {
  background: var(--surface-2);
}

.pop-item input {
  width: 15px;
  height: 15px;
  accent-color: var(--accent);
}

.pop-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pop-price {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.pop-pct {
  min-width: 52px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.pop-pct.is-up {
  color: var(--up);
}

.pop-pct.is-down {
  color: var(--down);
}

.pop-pct.is-flat {
  color: var(--muted);
}

.pop-notice {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--warn-text);
}

.index-error-hint {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--warn-text);
}

.link-btn {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent);
  font: inherit;
  cursor: pointer;
}

/* ---------- sector board ---------- */
.sector-board {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Title and actions share the first row; the description sits on its own line below. */
.sector-board-head {
  display: block;
}

.sector-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.sector-title-row h2 {
  flex: none;
}

.sector-desc {
  margin-top: 3px;
}

.sector-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: stretch;
}

.sector-column {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 8px 10px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.sector-column-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--divider);
}

.sector-column-head h3 {
  font-size: 12.5px;
}

.sector-column-head .muted {
  font-size: 10.5px;
  font-weight: 400;
  margin-left: 2px;
}

.sector-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sector-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.sector-row:hover {
  background: var(--surface-3);
}

.sector-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.sector-rank {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex: none;
  border-radius: 5px;
  background: var(--surface-3);
  color: var(--muted);
  font-size: 10.5px;
  font-weight: 600;
}

.sector-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sector-count {
  flex: none;
  color: var(--muted);
  font-size: 9.5px;
  white-space: nowrap;
}

.sector-spark {
  width: 56px;
  height: 18px;
  flex: 0 1 56px;
  min-width: 22px;
}

.sector-spark-line {
  fill: none;
  stroke-width: 1.2;
  vector-effect: non-scaling-stroke;
}

.sector-spark-line.is-up {
  stroke: var(--up);
}

.sector-spark-line.is-down {
  stroke: var(--down);
}

.sector-spark-line.is-flat {
  stroke: var(--muted);
}

.sector-spark-placeholder {
  stroke: var(--border-strong);
  stroke-dasharray: 3 3;
  stroke-width: 1;
}

.sector-avg {
  flex: none;
  width: 50px;
  text-align: right;
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.sector-avg.is-up {
  color: var(--up);
}

.sector-avg.is-down {
  color: var(--down);
}

.sector-avg.is-flat {
  color: var(--muted);
}

.sector-row-empty {
  padding: 14px 8px;
  color: var(--muted);
  font-size: 12px;
}

.sector-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 8px;
  color: var(--muted);
  font-size: 12px;
}

.sector-spinner {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  border-top-color: var(--accent);
  animation: sectorSpin 0.8s linear infinite;
}

@keyframes sectorSpin {
  to {
    transform: rotate(360deg);
  }
}

.sector-footnote {
  margin: 0;
}

/* ---------- news ---------- */
.news-card-head {
  align-items: flex-start;
}

/* All four card heads: actions sit on the right, wrapping right-aligned in order. */
.card-head-actions {
  margin-left: auto;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* Update stamps use fixed-width digits so the seconds do not jitter. */
.card-time {
  font-variant-numeric: tabular-nums;
}

.tag-warn {
  color: var(--warn-text);
  border-color: var(--warn-border);
}

.news-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}

.news-category-anchor {
  position: relative;
  flex: none;
}

/* Fixed-width selector: narrows on small screens without overflowing. */
.news-category-trigger {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 172px;
  max-width: 100%;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 11.5px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.news-category-trigger:hover,
.news-category-trigger[aria-expanded='true'] {
  border-color: var(--accent-border);
  background: var(--surface-3);
}

.news-category-current {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.news-category-count {
  flex: none;
  color: var(--accent);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.news-category-chevron {
  flex: none;
  color: var(--muted);
  font-size: 10px;
  transition: transform 0.15s ease;
}

.news-category-chevron.is-open {
  transform: rotate(180deg);
}

.news-category-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: var(--z-page-pop);
  width: 240px;
  max-width: calc(100vw - 28px);
  max-height: 320px;
  overflow-y: auto;
  padding: 5px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}

.news-category-group + .news-category-group {
  border-top: 1px solid var(--divider);
}

.news-category-row {
  display: flex;
  align-items: center;
  border-radius: 6px;
}

.news-category-row:hover {
  background: var(--surface-2);
}

.news-category-row.is-active {
  background: var(--accent-soft);
}

.news-category-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 7px 8px;
  border: 0;
  background: none;
  color: var(--text-soft);
  font: inherit;
  font-size: 11.5px;
  text-align: left;
  cursor: pointer;
}

.news-category-row.is-active .news-category-main {
  color: var(--accent);
  font-weight: 600;
}

.news-category-main small,
.news-category-child small {
  flex: none;
  color: var(--muted);
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
}

.news-category-expand {
  flex: none;
  width: 26px;
  height: 28px;
  margin-right: 3px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--muted);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.news-category-expand:hover {
  background: var(--surface-3);
  color: var(--text);
}

.news-category-expand span {
  display: inline-block;
  transition: transform 0.15s ease;
}

.news-category-expand span.is-open {
  transform: rotate(90deg);
  color: var(--accent);
}

.news-category-children {
  display: flex;
  flex-direction: column;
  margin: 0 0 5px;
  padding-left: 12px;
  border-left: 2px solid var(--accent-border);
}

.news-category-child {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.news-category-child:hover {
  background: var(--surface-2);
  color: var(--text);
}

.news-category-child.is-active {
  background: var(--accent-soft);
  color: var(--accent);
}

.news-toolbar-hint {
  font-size: 10.5px;
  color: var(--muted);
}

.news-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  max-height: 430px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.news-list li + li {
  border-top: 1px solid var(--divider);
}

.news-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding: 9px 6px;
  color: var(--text);
  text-decoration: none;
  border-radius: var(--radius-sm);
  transition: background-color 0.15s ease;
}

a.news-row:hover {
  background: var(--surface-2);
}

.news-row strong {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.55;
}

.news-meta {
  flex: none;
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
}

.news-note {
  margin: 8px 0 0;
}

.news-failed {
  margin-top: 6px;
  color: var(--warn-text);
  word-break: break-word;
}

.news-loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 4px;
}

.news-skeleton {
  display: block;
  height: 38px;
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2));
  background-size: 200% 100%;
  animation: skeleton 1.4s ease-in-out infinite;
}

@keyframes skeleton {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

/* 热榜 / 冷榜在所有宽度下都保持左右两栏并排，窄屏只压缩字号与间距。 */
@media (max-width: 640px) {
  .sector-columns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .sector-column {
    padding: 6px 6px 8px;
    gap: 3px;
  }

  .sector-column-head {
    gap: 4px;
    padding-bottom: 3px;
  }

  .sector-column-head h3 {
    font-size: 11px;
  }

  .sector-column-head .muted {
    display: none;
  }

  .sector-row {
    height: 30px;
    gap: 4px;
    padding: 0 3px;
  }

  .sector-rank {
    width: 15px;
    height: 15px;
    border-radius: 4px;
    font-size: 9px;
  }

  .sector-name {
    font-size: 10.5px;
  }

  .sector-spark {
    flex-basis: 34px;
    min-width: 18px;
    height: 16px;
  }

  .sector-avg {
    width: 42px;
    font-size: 10px;
  }
}

@media (max-width: 480px) {
  .sector-count {
    display: none;
  }

  .sector-column {
    padding: 5px 4px 6px;
  }

  .sector-column-head .tag {
    display: none;
  }

  .sector-row {
    gap: 3px;
    padding: 0 1px;
  }

  .sector-name {
    font-size: 10px;
  }

  .sector-spark {
    flex-basis: 26px;
    min-width: 14px;
  }

  .sector-avg {
    width: 36px;
    font-size: 9.5px;
  }
}

@media (max-width: 640px) {
  .index-row {
    gap: 6px;
  }

  .index-chip {
    flex: 0 0 calc((100% - 12px) / 3);
    gap: 4px;
    padding: 0 6px;
  }

  .chip-values {
    gap: 3px;
  }

  .chip-spark {
    width: 18px;
    height: 14px;
  }

  .chip-price {
    font-size: 10.5px;
  }

  .chip-pct {
    font-size: 9px;
    flex: none;
  }

  .chip-name {
    font-size: 9.5px;
  }

  .summary-text {
    font-size: 12.5px;
  }

  .news-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .news-meta {
    white-space: normal;
  }

  .news-category-trigger {
    width: 146px;
  }

  .news-toolbar-hint {
    display: none;
  }
}

@media (max-width: 420px) {
  .chip-name {
    font-size: 9.5px;
  }

  .chip-values {
    gap: 4px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sector-spinner,
  .news-skeleton {
    animation: none;
  }
}
</style>
