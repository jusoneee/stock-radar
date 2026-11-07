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
import StatTile from '@/components/StatTile.vue'
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

const parent = computed(() => {
  if (route.query.from === 'analysis') return { to: '/analysis', label: '分析' }
  if (route.query.from === 'compare') return { to: '/compare', label: '对比' }
  return { to: '/watchlist', label: '自选' }
})

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
          <RouterLink :to="parent.to">← {{ parent.label }}</RouterLink>
          <span class="muted">/ 个股详情</span>
        </p>
        <h1>{{ displayName }} <span class="code">{{ symbol }}</span></h1>
        <p v-if="sourceName" class="muted">
          {{ sourceName }}<template v-if="snapshot?.sector"> · {{ snapshot.sector }}</template>
          · 前复权日线
          <template v-if="freshness.lastDate">
            · 最新交易日 {{ freshness.lastDate }} · {{ freshness.sessions }} 根
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
      <div class="stat-grid">
        <StatTile
          label="最新收盘"
          :value="formatPrice(metrics.close)"
          :hint="formatPercent(metrics.changePct)"
          :tone="metrics.changePct >= 0 ? 'up' : 'down'"
        />
        <StatTile
          :label="`${metrics.count} 日区间涨跌`"
          :value="formatPercent(metrics.rangeChangePct)"
          :hint="`${metrics.startDate} → ${metrics.endDate}`"
          :tone="metrics.rangeChangePct >= 0 ? 'up' : 'down'"
        />
        <StatTile label="区间最高 / 最低" :value="`${formatPrice(metrics.high)} / ${formatPrice(metrics.low)}`" hint="复权收盘" tone="neutral" />
        <StatTile
          label="成交量"
          :value="formatAmount(metrics.lastVolume)"
          :hint="`5 日均 ${formatAmount(metrics.avg5)} · 20 日均 ${formatAmount(metrics.avg20)}`"
          tone="neutral"
        />
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
          <p class="hint-text">红色上涨 / 绿色下跌，来源为权重最高的已启用行情源；盘中最后一根可能尚未收盘。</p>
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
.crumbs {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--muted);
  display: flex;
  gap: 6px;
}

.crumbs a {
  color: var(--muted);
}

.crumbs a:hover {
  color: var(--text);
}

.code {
  margin-left: 6px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 400;
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

.range-switch {
  display: flex;
  gap: 6px;
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
  .profile-list {
    grid-template-columns: 1fr;
  }

  .profile-list dt {
    margin-top: 4px;
  }
}
</style>
