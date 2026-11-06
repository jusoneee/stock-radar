<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import type { NewsAnalysis, QuoteSnapshot } from '@/types'
import type { CompanyProfile } from '@/adapters/profile/eastmoney'
import { fetchCompanyProfile } from '@/adapters/profile/eastmoney'
import { loadQuoteSeries, loadStockNews } from '@/services/stock-data'
import { useWatchlistStore } from '@/stores/watchlist'
import { useUniverseStore } from '@/stores/universe'
import { useChannelsStore } from '@/stores/channels'
import { useCompareStore, MAX_COMPARE } from '@/stores/compare'
import KlineChart from '@/components/KlineChart.vue'
import ForecastPanel from '@/components/ForecastPanel.vue'
import StockNewsPanel from '@/components/StockNewsPanel.vue'
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
const range = ref<60 | 120>(60)
const profileChecked = ref(false)

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

const metrics = computed(() => {
  const bars = snapshot.value?.bars ?? []
  const selected = bars.slice(-range.value)
  if (selected.length === 0) return null
  const last = selected.at(-1)!
  const previous = selected.at(-2)
  const first = selected[0]!
  const volumes = selected.map((bar) => bar.volume)
  const avgVolume = (values: number[]): number =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
  const avg5 = avgVolume(volumes.slice(-5))
  const avg20 = avgVolume(volumes.slice(-20))
  return {
    count: selected.length,
    close: last.close,
    changePct: previous && previous.close > 0 ? (last.close / previous.close - 1) * 100 : 0,
    rangeChangePct: first.close > 0 ? (last.close / first.close - 1) * 100 : 0,
    high: Math.max(...selected.map((bar) => bar.high)),
    low: Math.min(...selected.map((bar) => bar.low)),
    lastVolume: last.volume,
    avg5,
    avg20,
    volumeRatio: avg20 > 0 ? avg5 / avg20 : 0,
    startDate: first.date,
    endDate: last.date,
  }
})

async function load(): Promise<void> {
  if (!/^\d{6}$/.test(symbol.value)) {
    error.value = '股票代码格式不正确，应为 6 位数字。'
    return
  }
  loading.value = true
  error.value = ''
  snapshot.value = null
  profile.value = null
  profileChecked.value = false
  news.value = []
  try {
    const quote = await loadQuoteSeries(symbol.value)
    snapshot.value = quote.snapshot
    sourceName.value = quote.sourceName
    sourceId.value = quote.sourceId
    failedSources.value = quote.failed

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

function toggleWatch(): void {
  if (watchlist.has(symbol.value)) {
    watchlist.remove(symbol.value)
    return
  }
  watchlist.add({
    symbol: symbol.value,
    name: displayName.value,
  })
}

onMounted(load)
watch(symbol, load)
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <p class="crumbs">
          <RouterLink to="/">仪表盘</RouterLink> / 个股详情
        </p>
        <h1>{{ displayName }} <span class="code">{{ symbol }}</span></h1>
        <p v-if="sourceName" class="muted">
          数据源：{{ sourceName }}<template v-if="snapshot?.sector"> · {{ snapshot.sector }}</template>
          · 前复权日线
          <template v-if="freshness.lastDate">
            · 最新交易日 {{ freshness.lastDate }} · 快照 {{ freshness.asOf }} · 共 {{ freshness.sessions }} 根
          </template>
        </p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-ghost" @click="toggleWatch">
          {{ watchlist.has(symbol) ? '移出自选' : '加入自选' }}
        </button>
        <button
          v-if="watchlist.has(symbol)"
          class="btn btn-ghost"
          :aria-pressed="isFavorite"
          @click="watchlist.toggleFavorite(symbol)"
        >
          {{ isFavorite ? '★ 已收藏' : '☆ 收藏' }}
        </button>
        <button class="btn btn-ghost" :class="{ 'is-active': compare.has(symbol) }" @click="compare.toggle(symbol)">
          {{ compare.has(symbol) ? '移出对比' : '加入对比' }}
        </button>
        <RouterLink class="btn btn-primary" :to="`/compare`">多股对比（{{ compare.count }}/{{ MAX_COMPARE }}）</RouterLink>
      </div>
    </header>

    <div v-if="error" class="inline-warn">
      <span>{{ error }}</span>
      <button class="btn btn-mini" @click="load">重试</button>
    </div>
    <p v-else-if="loading" class="hint-text">正在加载行情与资料…</p>

    <template v-if="snapshot && metrics">
      <div class="stat-grid">
        <div class="stat">
          <span class="stat-label">最新收盘</span>
          <strong>{{ formatPrice(metrics.close) }}</strong>
          <em :class="metrics.changePct >= 0 ? 'up' : 'down'">
            {{ formatPercent(metrics.changePct) }}
          </em>
        </div>
        <div class="stat">
          <span class="stat-label">{{ metrics.count }} 日区间涨跌（{{ metrics.startDate }} → {{ metrics.endDate }}）</span>
          <strong :class="metrics.rangeChangePct >= 0 ? 'up' : 'down'">
            {{ formatPercent(metrics.rangeChangePct) }}
          </strong>
        </div>
        <div class="stat">
          <span class="stat-label">区间最高 / 最低</span>
          <strong>{{ formatPrice(metrics.high) }} / {{ formatPrice(metrics.low) }}</strong>
        </div>
        <div class="stat">
          <span class="stat-label">成交量（最近 / 5 日均 / 20 日均）</span>
          <strong>{{ formatAmount(metrics.lastVolume) }}</strong>
          <em class="muted">{{ formatAmount(metrics.avg5) }} / {{ formatAmount(metrics.avg20) }}</em>
        </div>
      </div>

      <p v-if="failedSources.length" class="hint-text">降级使用了其他行情源；失败项：{{ failedSources.join('；') }}</p>

      <div class="detail-grid">
        <div class="card chart-card">
          <header class="card-head">
            <h2>日 K 与成交量</h2>
            <div class="range-switch">
              <button class="btn btn-mini" :class="{ 'is-active': range === 60 }" @click="range = 60">近 60 日</button>
              <button class="btn btn-mini" :class="{ 'is-active': range === 120 }" @click="range = 120">近 120 日</button>
            </div>
          </header>
          <KlineChart :bars="snapshot.bars" :count="range" />
          <p class="hint-text">
            图表为收盘价与成交量（红色上涨 / 绿色下跌），数据来自已启用的最高权重行情源；缺失交易日按接口返回为准。盘中快照会随行情刷新，日线最后一根若为当日则可能尚未收盘。
          </p>
        </div>

        <ForecastPanel :bars="snapshot.bars" />
      </div>

      <div class="detail-grid">
        <div class="card">
          <header class="card-head">
            <h2>公司资料</h2>
            <span class="tag" :class="profile ? 'tag-live' : 'tag-missing'">
              {{ profile ? '东方财富 F10' : '暂无可用资料' }}
            </span>
          </header>
          <template v-if="profile">
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
              <dt>主营业务</dt><dd>{{ profile.mainBusiness || '未返回' }}</dd>
              <dt>经营范围</dt><dd>{{ profile.businessScope || '未返回' }}</dd>
            </dl>
            <details v-if="profile.profile" class="profile-more">
              <summary>公司简介</summary>
              <p>{{ profile.profile }}</p>
            </details>
            <p class="hint-text">来源：{{ profile.source }}；字段按接口原样展示，不补写缺失事实。</p>
          </template>
          <p v-else class="hint-text">
            {{ profileChecked ? '东方财富 F10 未返回该公司资料（新代码、北交所代码或接口暂缺均可能）。' : '正在查询公司资料…' }}
            本页不编造公司简介、注册资本等事实数据，行情与新闻画像仍可使用。
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

      <div class="notice">
        <strong>风险提示</strong>
        <p>
          趋势预测为基于历史统计的外推，不构成预测保证，也不构成投资建议；公司资料来自第三方公开接口，可能存在延迟或缺失。
          行情与资讯请以交易所与上市公司公告为准。
        </p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.crumbs {
  margin: 0 0 4px;
  font-size: 12px;
  color: #7c889e;
}

.crumbs a {
  color: inherit;
}

.code {
  margin-left: 6px;
  font-size: 14px;
  color: #7c889e;
  font-weight: 400;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.stat {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--surface);
}

.stat-label {
  font-size: 12px;
  color: #64748b;
}

.stat strong {
  font-size: 20px;
}

.stat em {
  font-style: normal;
  font-size: 12px;
}

.up {
  color: #c0392b;
}

.down {
  color: #0f8a55;
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 16px;
}

/* Grid items default to min-width:auto, which lets wide inner tables push the
   whole page sideways on narrow screens. */
.detail-grid > * {
  min-width: 0;
}

.chart-card {
  min-width: 0;
}

.range-switch {
  display: flex;
  gap: 8px;
}

.is-active {
  outline: 2px solid #2563eb;
  outline-offset: 1px;
}

.profile-list {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 8px 12px;
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}

.profile-list dt {
  color: #64748b;
}

.profile-list dd {
  margin: 0;
  word-break: break-word;
}

.profile-more {
  margin-top: 12px;
  font-size: 13px;
  line-height: 1.7;
}

.profile-more summary {
  cursor: pointer;
  color: #2563eb;
}

.tag-live {
  background: #e8f7ee;
  color: #0f8a55;
}

.tag-missing {
  background: #fff4e5;
  color: #8a5200;
}

@media (max-width: 900px) {
  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .page-head-actions {
    width: 100%;
  }

  .page-head-actions .btn {
    flex: 1 1 calc(50% - 6px);
    min-width: 0;
    justify-content: center;
    white-space: normal;
  }

  .profile-list {
    grid-template-columns: 1fr;
  }

  .profile-list dt {
    margin-top: 4px;
  }
}
</style>
