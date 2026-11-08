<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import type { ChartPeriod, NewsAnalysis, QuoteSnapshot } from '@/types'
import type { CompanyProfile } from '@/adapters/profile/eastmoney'
import { fetchCompanyProfile } from '@/adapters/profile/eastmoney'
import { loadChartPeriod, loadQuoteSeries, loadStockNews, type ChartPeriodSeries } from '@/services/stock-data'
import { useWatchlistStore } from '@/stores/watchlist'
import { useUniverseStore } from '@/stores/universe'
import { useChannelsStore } from '@/stores/channels'
import { useCompareStore, MAX_COMPARE } from '@/stores/compare'
import KlineChart from '@/components/KlineChart.vue'
import ForecastPanel from '@/components/ForecastPanel.vue'
import StockNewsPanel from '@/components/StockNewsPanel.vue'
import BackButton from '@/components/BackButton.vue'
import { formatAmount, formatDateTime, formatPercent, formatPrice } from '@/lib/format'

const route = useRoute()
const watchlist = useWatchlistStore()
const universe = useUniverseStore()
const channels = useChannelsStore()
const compare = useCompareStore()
watchlist.init()
universe.init()
compare.init()

const symbol = computed(() => String(route.params.symbol ?? '').trim())
const hintName = computed(
  () => watchlist.items.find((item) => item.symbol === symbol.value)?.name ?? universe.profiles[symbol.value]?.name ?? '',
)

const snapshot = ref<QuoteSnapshot | null>(null)
const profile = ref<CompanyProfile | null>(null)
const news = ref<NewsAnalysis[]>([])
const rawNewsCount = ref(0)
const failedNews = ref<string[]>([])
const sourceName = ref('')
const sourceId = ref('')
const failedSources = ref<string[]>([])
const loading = ref(false)
const newsLoading = ref(false)
const error = ref('')
const profileChecked = ref(false)

const periods: Array<{ id: ChartPeriod; label: string }> = [
  { id: 'intraday', label: '分时' },
  { id: 'fiveDay', label: '五日' },
  { id: 'day', label: '日K' },
  { id: 'week', label: '周K' },
  { id: 'month', label: '月K' },
]
const period = ref<ChartPeriod>('day')
const periodLabel = computed(() => periods.find((item) => item.id === period.value)?.label ?? '日K')
const chartSeries = ref<ChartPeriodSeries | null>(null)
const chartNote = ref('')
const chartLoading = ref(false)
const chartCache = new Map<ChartPeriod, ChartPeriodSeries>()
let chartRequest = 0

const displayName = computed(() => snapshot.value?.name || hintName.value || symbol.value)
const websiteLabel = computed(() => profile.value?.website.replace(/^https?:\/\//i, '').replace(/\/$/, '') ?? '')
const freshness = computed(() => {
  const bars = snapshot.value?.bars ?? []
  const lastBar = bars.at(-1)
  const asOf = snapshot.value?.asOf
  return {
    lastDate: lastBar?.date ?? '',
    asOf: asOf ? formatDateTime(asOf) : '',
    sessions: bars.length,
  }
})
const isFavorite = computed(() => {
  const entry = watchlist.items.find((item) => item.symbol === symbol.value)
  return Boolean(entry && entry.favorite !== false)
})

const favoriteOpen = ref(false)
const favoriteWrap = ref<HTMLElement | null>(null)
const favoriteNotice = ref('')
let noticeTimer: number | null = null

const favoriteItem = computed(() => watchlist.items.find((item) => item.symbol === symbol.value))
/** Implicit default-group membership for favorites saved without explicit groups. */
const favoriteGroupIds = computed(() => {
  const ids = favoriteItem.value?.groupIds ?? []
  if (ids.length > 0) return ids
  const fallback = watchlist.defaultGroup?.id
  return fallback ? [fallback] : []
})

function showFavoriteNotice(message: string): void {
  favoriteNotice.value = message
  if (noticeTimer !== null) window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    favoriteNotice.value = ''
    noticeTimer = null
  }, 4000)
}

function addToFavorites(): void {
  const defaultId = watchlist.defaultGroup?.id
  const existing = favoriteItem.value
  if (!existing) {
    const result = watchlist.add({
      symbol: symbol.value,
      name: displayName.value,
      groupIds: defaultId ? [defaultId] : [],
    })
    if (result === 'full') {
      showFavoriteNotice('收藏已达 50 只上限，请先在收藏页移除后再添加。')
      return
    }
  } else {
    if (existing.favorite === false) watchlist.toggleFavorite(symbol.value)
    if (defaultId && !existing.groupIds?.length) watchlist.setGroupIds(symbol.value, [defaultId])
  }
  favoriteNotice.value = ''
  favoriteOpen.value = false
}

/** Main button: add when not favorited, remove from every group when favorited. */
function handleFavoriteClick(): void {
  if (!isFavorite.value) {
    addToFavorites()
    return
  }
  watchlist.remove(symbol.value)
  favoriteOpen.value = false
  favoriteNotice.value = ''
}

function toggleGroupMembership(groupId: string): void {
  const item = favoriteItem.value
  if (!item) return
  const current = favoriteGroupIds.value
  const next = current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
  if (next.length === 0) {
    // Removing the last group means removing it from the 收藏 list entirely.
    watchlist.remove(symbol.value)
    favoriteOpen.value = false
    favoriteNotice.value = ''
    return
  }
  if (item.favorite === false) watchlist.toggleFavorite(symbol.value)
  watchlist.setGroupIds(symbol.value, next)
  favoriteNotice.value = ''
}

function handleDocumentClick(event: MouseEvent): void {
  if (!favoriteOpen.value) return
  const target = event.target as Node | null
  if (favoriteWrap.value && target && favoriteWrap.value.contains(target)) return
  favoriteOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
  if (noticeTimer !== null) window.clearTimeout(noticeTimer)
})

const metrics = computed(() => {
  const bars = snapshot.value?.bars ?? []
  if (bars.length === 0) return null
  const last = bars.at(-1)!
  const previous = bars.at(-2)
  const prevClose = previous?.close ?? null
  const recent = bars.slice(-20)
  const avgVolume = (values: number[]): number =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
  const avg5 = avgVolume(recent.slice(-5).map((bar) => bar.volume))
  const avg20 = avgVolume(recent.map((bar) => bar.volume))
  const window60 = bars.slice(-60)
  return {
    tradeDate: last.date,
    close: last.close,
    open: last.open,
    prevClose,
    high: last.high,
    low: last.low,
    change: prevClose ? last.close - prevClose : 0,
    changePct: prevClose && prevClose > 0 ? (last.close / prevClose - 1) * 100 : 0,
    amplitude: prevClose && prevClose > 0 ? ((last.high - last.low) / prevClose) * 100 : 0,
    volume: last.volume,
    avg5,
    avg20,
    volumeRatio: avg20 > 0 ? avg5 / avg20 : 0,
    high60: Math.max(...window60.map((bar) => bar.high)),
    low60: Math.min(...window60.map((bar) => bar.low)),
  }
})

async function loadChart(target: ChartPeriod): Promise<void> {
  const daily = snapshot.value?.bars ?? []
  if (daily.length === 0) return
  const token = ++chartRequest
  const cached = chartCache.get(target)
  if (cached) {
    if (token === chartRequest && period.value === target) {
      chartSeries.value = cached
      chartNote.value = cached.note
      chartLoading.value = false
    }
    return
  }
  chartLoading.value = period.value === target
  try {
    const result = await loadChartPeriod(symbol.value, target, daily)
    chartCache.set(target, result)
    if (token !== chartRequest || period.value !== target) return
    chartSeries.value = result
    chartNote.value = result.note
  } catch (chartError) {
    if (token !== chartRequest || period.value !== target) return
    chartSeries.value = null
    chartNote.value = chartError instanceof Error ? chartError.message : String(chartError)
  } finally {
    if (token === chartRequest && period.value === target) chartLoading.value = false
  }
}

watch(period, (next) => {
  void loadChart(next)
})

async function load(): Promise<void> {
  if (!/^\d{6}$/.test(symbol.value)) {
    error.value = '股票代码格式不正确，应为 6 位数字。'
    return
  }
  loading.value = true
  error.value = ''
  favoriteOpen.value = false
  favoriteNotice.value = ''
  snapshot.value = null
  profile.value = null
  profileChecked.value = false
  news.value = []
  chartSeries.value = null
  chartNote.value = ''
  chartLoading.value = false
  chartCache.clear()
  try {
    const quote = await loadQuoteSeries(symbol.value)
    snapshot.value = quote.snapshot
    sourceName.value = quote.sourceName
    sourceId.value = quote.sourceId
    failedSources.value = quote.failed
    void loadChart(period.value)

    newsLoading.value = true
    const [profileResult, newsResult] = await Promise.allSettled([
      fetchCompanyProfile(symbol.value),
      loadStockNews(symbol.value, quote.snapshot.name || hintName.value || symbol.value),
    ])
    profileChecked.value = true
    if (profileResult.status === 'fulfilled') profile.value = profileResult.value
    if (newsResult.status === 'fulfilled') {
      news.value = newsResult.value.items
      rawNewsCount.value = newsResult.value.rawCount
      failedNews.value = newsResult.value.failed
    } else {
      failedNews.value = [newsResult.reason instanceof Error ? newsResult.reason.message : String(newsResult.reason)]
    }
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : String(loadError)
  } finally {
    loading.value = false
    newsLoading.value = false
  }
}

onMounted(load)
watch(symbol, load)
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div class="page-head-lead">
        <BackButton />
        <div>
          <h1>{{ displayName }} <span class="code">{{ symbol }}</span></h1>
          <p v-if="sourceName" class="muted">
            {{ sourceName }}<template v-if="snapshot?.sector"> · {{ snapshot.sector }}</template>
            · 前复权日线
            <template v-if="freshness.lastDate">
              · 最新交易日 {{ freshness.lastDate }} · {{ freshness.sessions }} 根
            </template>
          </p>
        </div>
      </div>
      <div class="page-head-actions">
        <div ref="favoriteWrap" class="favorite-control">
          <button
            class="btn fav-btn"
            :class="{ 'is-saved': isFavorite }"
            type="button"
            :title="isFavorite ? '从所有分组中移除' : '加入默认分组'"
            @click="handleFavoriteClick"
          >
            {{ isFavorite ? '★ 已收藏' : '☆ 加入收藏' }}
          </button>
          <button
            class="btn fav-caret"
            :class="{ 'is-hidden': !isFavorite }"
            type="button"
            aria-label="展开收藏分组"
            :aria-expanded="favoriteOpen"
            :disabled="!isFavorite"
            @click="favoriteOpen = !favoriteOpen"
          >
            ▾
          </button>
          <div v-if="favoriteOpen" class="fav-pop" role="dialog" aria-label="收藏分组">
            <p class="fav-pop-title">收藏分组（可多选）</p>
            <label v-for="group in watchlist.groups" :key="group.id" class="fav-group">
              <input
                type="checkbox"
                :checked="favoriteGroupIds.includes(group.id)"
                @change="toggleGroupMembership(group.id)"
              />
              <span class="fav-group-name">{{ group.name }}</span>
              <span v-if="group.isDefault" class="fav-tag">默认</span>
            </label>
            <p class="fav-pop-tip">取消最后一组即取消收藏；收藏与收藏页、选股页共用同一份数据。</p>
          </div>
          <p v-if="favoriteNotice" class="fav-warn">{{ favoriteNotice }}</p>
        </div>
        <button class="btn btn-ghost" :class="{ 'is-active': compare.has(symbol) }" @click="compare.toggle(symbol)">
          {{ compare.has(symbol) ? '移出对比' : '加入对比' }}
        </button>
        <RouterLink class="btn btn-primary" to="/compare">
          对比（{{ compare.count }}/{{ MAX_COMPARE }}）
        </RouterLink>
      </div>
    </header>

    <div v-if="error" class="inline-warn">
      <span>{{ error }}</span>
      <button class="btn btn-mini" @click="load">重试</button>
    </div>
    <p v-else-if="loading" class="hint-text">正在加载行情与资料…</p>

    <template v-if="snapshot && metrics">
      <section class="quote-strip" aria-label="最新行情指标">
        <div class="quote-lead">
          <span class="quote-price" :class="metrics.changePct >= 0 ? 'tone-up' : 'tone-down'">
            {{ formatPrice(metrics.close) }}
          </span>
          <span class="quote-delta" :class="metrics.changePct >= 0 ? 'tone-up' : 'tone-down'">
            {{ metrics.change >= 0 ? '+' : '' }}{{ formatPrice(metrics.change) }}
            · {{ formatPercent(metrics.changePct) }}
          </span>
          <span class="quote-date">{{ metrics.tradeDate }}</span>
        </div>
        <div class="quote-facts">
          <div class="fact"><span>今开</span><b>{{ formatPrice(metrics.open) }}</b></div>
          <div class="fact"><span>昨收</span><b>{{ metrics.prevClose !== null ? formatPrice(metrics.prevClose) : '—' }}</b></div>
          <div class="fact"><span>日内高</span><b class="tone-up">{{ formatPrice(metrics.high) }}</b></div>
          <div class="fact"><span>日内低</span><b class="tone-down">{{ formatPrice(metrics.low) }}</b></div>
          <div class="fact"><span>振幅</span><b>{{ formatPercent(metrics.amplitude) }}</b></div>
          <div class="fact"><span>成交量</span><b>{{ formatAmount(metrics.volume) }} 手</b></div>
          <div class="fact"><span>5 日均量</span><b>{{ formatAmount(metrics.avg5) }} 手</b></div>
          <div class="fact"><span>20 日均量</span><b>{{ formatAmount(metrics.avg20) }} 手</b></div>
          <div class="fact"><span>5/20 均量比</span><b>{{ metrics.volumeRatio.toFixed(2) }}</b></div>
          <div class="fact"><span>60 日高/低</span><b>{{ formatPrice(metrics.high60) }} / {{ formatPrice(metrics.low60) }}</b></div>
        </div>
      </section>

      <p v-if="failedSources.length" class="hint-text">降级使用了其他行情源；失败项：{{ failedSources.join('；') }}</p>

      <div class="detail-grid">
        <div class="card chart-card">
          <header class="card-head chart-head">
            <h2>行情走势 <span class="chart-period">{{ periodLabel }}</span></h2>
            <div class="period-tabs" role="tablist" aria-label="行情周期">
              <button
                v-for="item in periods"
                :key="item.id"
                type="button"
                class="btn btn-mini"
                :class="{ 'is-active': period === item.id }"
                role="tab"
                :aria-selected="period === item.id"
                @click="period = item.id"
              >
                {{ item.label }}
              </button>
            </div>
          </header>
          <KlineChart
            :bars="chartSeries?.bars ?? []"
            :mode="chartSeries?.mode ?? 'candle'"
            :baseline="chartSeries?.baseline ?? null"
            :period-label="periodLabel"
            :loading="chartLoading"
          />
          <p v-if="chartNote" class="hint-text">{{ chartNote }}</p>
          <p class="hint-text">
            红涨绿跌，副图为成交量；分时/五日为分钟线，周/月线取自同一行情源，取不到时自动降级并在上方说明。
            <template v-if="sourceName">来源：{{ sourceName }}。</template>盘中最后一根可能尚未收盘。
          </p>
        </div>

        <ForecastPanel :bars="snapshot.bars" />
      </div>

      <div class="detail-grid">
        <div class="card">
          <header class="card-head">
            <h2>公司资料</h2>
            <span class="tag" :class="profile ? 'tag-live' : 'tag-mock'">
              {{ profile ? '东方财富 F10' : '暂无可用资料' }}
            </span>
          </header>
          <template v-if="profile">
            <dl class="profile-list">
              <dt>主营业务</dt>
              <dd>{{ profile.mainBusiness || '未返回' }}</dd>
            </dl>
            <details class="profile-more">
              <summary>完整公司资料</summary>
              <dl class="profile-list">
                <dt>公司全称</dt><dd>{{ profile.orgName }}</dd>
                <dt>注册资本</dt><dd>{{ profile.regCapital !== null ? `${profile.regCapital.toFixed(2)} 万元` : '未返回' }}</dd>
                <dt>成立日期</dt><dd>{{ profile.foundDate || '未返回' }}</dd>
                <dt>注册地址</dt><dd>{{ profile.regAddress || '未返回' }}</dd>
                <dt>公司网站</dt>
                <dd>
                  <a v-if="profile.website" :href="profile.website" target="_blank" rel="noopener noreferrer">
                    {{ websiteLabel }}
                  </a>
                  <span v-else>未返回</span>
                </dd>
                <dt>经营范围</dt><dd>{{ profile.businessScope || '未返回' }}</dd>
              </dl>
              <p class="hint-text">来源：{{ profile.source }}；字段按接口原样展示，不补写缺失事实。</p>
            </details>
          </template>
          <p v-else class="hint-text">
            {{ profileChecked ? '东方财富 F10 未返回该公司资料（新代码、北交所代码或接口暂缺均可能）。' : '正在查询公司资料…' }}
            本页不编造公司简介、注册资本等事实数据。
          </p>
        </div>

        <StockNewsPanel
          :news="news"
          :raw-count="rawNewsCount"
          :failed="failedNews"
          :loading="newsLoading"
          :degraded="channels.unavailableNews"
        />
      </div>

      <p class="disclaimer">
        趋势预测为基于历史统计的外推，不构成预测保证或投资建议；公司资料来自第三方公开接口，可能延迟或缺失，
        行情与资讯请以交易所及上市公司公告为准。
      </p>
    </template>
  </section>
</template>

<style scoped>
.code {
  margin-left: 6px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 400;
}

/* Segmented favorite button + group popover. */
.favorite-control {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  white-space: nowrap;
}

.page-head-actions .favorite-control .btn {
  flex: 0 0 auto;
}

.fav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 96px;
  white-space: nowrap;
}

.fav-btn.is-saved {
  color: #f0a020;
  border-color: rgba(240, 160, 32, 0.45);
  background: rgba(240, 160, 32, 0.1);
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.fav-btn.is-saved:hover:not(:disabled),
.fav-caret:hover:not(:disabled) {
  color: #ffb52e;
  border-color: rgba(240, 160, 32, 0.7);
}

.fav-caret {
  margin-left: -1px;
  padding: 0 8px;
  color: #f0a020;
  border-color: rgba(240, 160, 32, 0.45);
  background: rgba(240, 160, 32, 0.1);
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

/* Reserve the caret slot in both states so the button never shifts or resizes. */
.fav-caret.is-hidden {
  visibility: hidden;
  pointer-events: none;
}

.fav-pop {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: var(--z-page-pop, 40);
  width: max-content;
  min-width: 196px;
  max-width: 260px;
  padding: 7px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}

.fav-pop-title {
  margin: 2px 5px 6px;
  font-size: 11.5px;
  color: var(--muted);
}

.fav-group {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 5px;
  border-radius: 6px;
  font-size: 12.5px;
  cursor: pointer;
}

.fav-group:hover {
  background: var(--surface-2);
}

.fav-group input {
  margin: 0;
  accent-color: var(--accent);
}

.fav-group-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fav-tag {
  flex: 0 0 auto;
  padding: 0 4px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 10px;
  color: var(--muted);
}

.fav-pop-tip {
  margin: 6px 5px 2px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--muted);
}

.fav-warn {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: var(--z-page-pop, 40);
  max-width: 240px;
  margin: 0;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-pop);
  color: var(--down);
  font-size: 11px;
  line-height: 1.5;
  text-align: right;
}

/* Compact quote metrics: one dense strip instead of large stat tiles. */
.quote-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 20px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  min-width: 0;
}

.quote-lead {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.quote-price {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.quote-delta {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.quote-date {
  font-size: 11px;
  color: var(--muted);
}

.quote-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 3px 16px;
  flex: 1 1 420px;
  min-width: 0;
}

.fact {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  font-size: 11.5px;
  min-width: 0;
}

.fact span {
  color: var(--muted);
  white-space: nowrap;
}

.fact b {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.tone-up {
  color: var(--up);
}

.tone-down {
  color: var(--down);
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
  gap: 14px;
}

.detail-grid > * {
  min-width: 0;
}

.chart-card {
  min-width: 0;
}

.chart-head {
  margin-bottom: 10px;
}

.chart-period {
  margin-left: 4px;
  font-size: 11.5px;
  font-weight: 400;
  color: var(--muted);
}

.period-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}

.is-active {
  color: var(--text);
  border-color: var(--accent-border);
  background: var(--accent-soft);
}

.profile-list {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 6px 12px;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
}

.profile-list dt {
  color: var(--muted);
}

.profile-list dd {
  margin: 0;
  word-break: break-word;
}

.profile-more {
  margin-top: 12px;
  font-size: 12.5px;
  line-height: 1.7;
}

.profile-more > summary {
  cursor: pointer;
  color: var(--text-soft);
  font-size: 12px;
  padding: 4px 0;
}

.profile-more > summary:hover {
  color: var(--text);
}

.profile-more[open] > summary {
  margin-bottom: 8px;
}

@media (max-width: 900px) {
  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .quote-strip {
    padding: 10px 12px;
    gap: 6px 14px;
  }

  .quote-price {
    font-size: 24px;
  }

  .quote-facts {
    flex-basis: 100%;
    grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
    gap: 3px 12px;
  }

  .profile-list {
    grid-template-columns: 1fr;
  }

  .profile-list dt {
    margin-top: 4px;
  }
}
</style>
