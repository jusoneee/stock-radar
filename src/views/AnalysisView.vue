<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useAnalysisStore } from '@/stores/analysis'
import { useWatchlistStore } from '@/stores/watchlist'
import { useUniverseStore } from '@/stores/universe'
import { useAnalysisSettingsStore } from '@/stores/analysis-settings'
import { useSnapshotsStore } from '@/stores/snapshots'
import { useCustomSourcesStore } from '@/stores/custom-sources'
import { CHANNEL_CATALOG } from '@/adapters/registry'
import { getTradingStatus } from '@/lib/trading-calendar'
import type { AnalysisSnapshot, EventStage, NewsAnalysis, Recommendation, TrendLabel } from '@/types'
import { formatAmount, formatDateTime, formatPercent, formatPrice } from '@/lib/format'
import { adviceLabels, eventTypeLabels, sentimentLabels, stageLabels, trendLabels } from '@/lib/labels'
import {
  DISCLAIMER,
  exportRecommendationsCsv,
  exportRecommendationsJson,
  exportReportMarkdown,
} from '@/lib/export'
import RecommendationTable from '@/components/RecommendationTable.vue'
import NewsTimeline from '@/components/NewsTimeline.vue'
import TrendBadge from '@/components/TrendBadge.vue'
import StatTile from '@/components/StatTile.vue'
import KlineChart from '@/components/KlineChart.vue'

const analysis = useAnalysisStore()
const watchlist = useWatchlistStore()
const universe = useUniverseStore()
const settings = useAnalysisSettingsStore()
const snapshots = useSnapshotsStore()
const customSources = useCustomSourcesStore()
customSources.init()
const keyword = ref('')
const selectedSymbol = ref('')
const newsFilter = ref<'all' | 'positive' | 'negative'>('all')
const sectorFilter = ref('')
const trendFilter = ref<'all' | TrendLabel>('all')
const stageFilter = ref<'all' | EventStage>('all')
const minScore = ref(0)
const maxScore = ref(100)
const sortBy = ref<'score' | 'change' | 'volume' | 'name'>('score')
const compareId = ref('')

const trading = computed(() => getTradingStatus())
const report = computed(() => analysis.report)
const market = computed(() => analysis.report?.market)

const latestBarDate = computed(() => {
  const list = analysis.report?.recommendations ?? []
  let latest = ''
  for (const item of list) {
    const date = item.bars[item.bars.length - 1]?.date ?? ''
    if (date > latest) latest = date
  }
  return latest
})

const sectorOptions = computed(() => {
  const sectors = new Set<string>()
  for (const item of analysis.report?.recommendations ?? []) {
    if (item.sector) sectors.add(item.sector)
  }
  return Array.from(sectors).sort((a, b) => a.localeCompare(b, 'zh-CN'))
})

const trendOptions = Object.entries(trendLabels) as Array<[TrendLabel, { text: string }]>
const stageOptions = Object.entries(stageLabels) as Array<[EventStage, { text: string }]>
const stageRank: Record<EventStage, number> = { fermenting: 0, confirmed: 1, fading: 2 }

/** Most advanced event stage related to a stock, used by the stage filter. */
function primaryStage(item: Recommendation): EventStage | null {
  if (item.news.length === 0) return null
  return item.news.reduce<EventStage>(
    (current, news) => (stageRank[news.stage] > stageRank[current] ? news.stage : current),
    item.news[0]!.stage,
  )
}

const filtered = computed<Recommendation[]>(() => {
  const query = keyword.value.trim().toLowerCase()
  const list = (analysis.report?.recommendations ?? []).filter((item) => {
    if (query && !item.name.toLowerCase().includes(query) && !item.symbol.includes(query) && !item.sector.includes(query)) {
      return false
    }
    if (sectorFilter.value && item.sector !== sectorFilter.value) return false
    if (trendFilter.value !== 'all' && item.trend.label !== trendFilter.value) return false
    if (stageFilter.value !== 'all' && primaryStage(item) !== stageFilter.value) return false
    if (item.totalScore < minScore.value || item.totalScore > maxScore.value) return false
    return true
  })
  const sorted = [...list]
  switch (sortBy.value) {
    case 'change':
      return sorted.sort((a, b) => b.indicators.pctChange1d - a.indicators.pctChange1d)
    case 'volume':
      return sorted.sort((a, b) => b.indicators.volumeRatio - a.indicators.volumeRatio)
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    default:
      return sorted.sort((a, b) => b.totalScore - a.totalScore)
  }
})

const selected = computed<Recommendation | null>(() => {
  const list = analysis.report?.recommendations ?? []
  if (list.length === 0) return null
  return list.find((item) => item.symbol === selectedSymbol.value) ?? list[0]!
})

const newsList = computed<NewsAnalysis[]>(() => {
  const all = analysis.report?.news ?? []
  if (newsFilter.value === 'all') return all
  return all.filter((item) => item.sentiment === newsFilter.value)
})

const weightsText = computed(() => {
  const percent = settings.weightPercent
  return `趋势 ${percent.trend}% / 动量 ${percent.momentum}% / 量能 ${percent.volume}% / 区间 ${percent.position}% / 事件 ${percent.news}%`
})

function channelName(id: string): string {
  const custom = customSources.sources.find((item) => item.id === id)
  return CHANNEL_CATALOG.find((meta) => meta.id === id)?.name ?? custom?.name ?? id
}

/** Channels that failed or still return generated demo data, surfaced as a banner. */
const degraded = computed(() => {
  if (!report.value) return null
  const failed = report.value.channelRuns.filter((run) => !run.ok)
  const simulated = report.value.channelRuns.filter(
    (run) => CHANNEL_CATALOG.find((meta) => meta.id === run.channelId)?.simulated,
  )
  if (failed.length === 0 && simulated.length === 0) return null
  return { failed, simulated }
})

interface CompareRow {
  symbol: string
  name: string
  scoreNow: number
  scoreDelta: number | null
  trendNow: TrendLabel
  trendChanged: boolean
  pctChangeNow: number
  status: 'new' | 'existing'
}

const compareBaseline = computed<AnalysisSnapshot | null>(() => {
  const explicit = snapshots.items.find((item) => item.id === compareId.value)
  return explicit ?? snapshots.previous
})

const compareRows = computed<CompareRow[]>(() => {
  const baseline = compareBaseline.value
  if (!baseline || !report.value) return []
  const previous = new Map(baseline.items.map((item) => [item.symbol, item]))
  return report.value.recommendations.slice(0, 12).map((item) => {
    const old = previous.get(item.symbol)
    return {
      symbol: item.symbol,
      name: item.name,
      scoreNow: item.totalScore,
      scoreDelta: old ? Math.round((item.totalScore - old.totalScore) * 10) / 10 : null,
      trendNow: item.trend.label,
      trendChanged: Boolean(old && old.trend !== item.trend.label),
      pctChangeNow: item.indicators.pctChange1d,
      status: old ? 'existing' : 'new',
    }
  })
})

const removedCount = computed(() => {
  const baseline = compareBaseline.value
  if (!baseline || !report.value) return 0
  const current = new Set(report.value.recommendations.map((item) => item.symbol))
  return baseline.items.filter((item) => !current.has(item.symbol)).length
})

function selectSymbol(symbol: string): void {
  selectedSymbol.value = symbol
}

function resetFilters(): void {
  sectorFilter.value = ''
  trendFilter.value = 'all'
  stageFilter.value = 'all'
  minScore.value = 0
  maxScore.value = 100
  keyword.value = ''
}

function run(): void {
  void analysis.run().then(() => {
    if (analysis.error) return
    selectedSymbol.value = analysis.report?.recommendations[0]?.symbol ?? ''
    if (analysis.report) snapshots.capture(analysis.report)
  })
}

onMounted(async () => {
  watchlist.init()
  settings.init()
  snapshots.init()
  await analysis.ensureReport()
  selectedSymbol.value = analysis.report?.recommendations[0]?.symbol ?? ''
  if (analysis.report) snapshots.capture(analysis.report)
})

watch(
  () => analysis.report?.generatedAt,
  (generatedAt) => {
    if (generatedAt) snapshots.capture(analysis.report!)
  },
)
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h1>分析结果</h1>
        <p>
          推荐列表按「{{ weightsText }}」加权得出，权重可在「数据源配置」页调整；所有结论均可下钻查看计算依据。
        </p>
      </div>
      <div class="page-head-actions">
        <span class="chip">{{ trading.latestTradingDay }} · {{ trading.phaseLabel }}</span>
        <span v-if="report" class="muted">生成于 {{ formatDateTime(report.generatedAt) }}</span>
        <div class="filter-group">
          <button class="btn btn-mini" :disabled="!report" @click="report && exportRecommendationsCsv(report)">导出 CSV</button>
          <button class="btn btn-mini" :disabled="!report" @click="report && exportRecommendationsJson(report)">导出 JSON</button>
          <button class="btn btn-mini" :disabled="!report" @click="report && exportReportMarkdown(report)">导出 Markdown</button>
        </div>
        <button class="btn btn-primary" :disabled="analysis.loading" @click="run">
          {{ analysis.loading ? '分析中…' : '重新分析' }}
        </button>
      </div>
    </header>

    <div class="freshness-bar">
      <span class="tag">自选池 {{ watchlist.count }} 只</span>
      <span v-if="latestBarDate" class="tag">日 K 截至 {{ latestBarDate }}</span>
      <span v-if="universe.fetchedAt" class="tag">全市场列表 {{ formatDateTime(universe.fetchedAt) }} 更新</span>
      <span v-if="universe.isStale && universe.count" class="tag tag-key">全市场列表缓存已过期</span>
      <RouterLink to="/watchlist" class="muted history-link">管理自选池 →</RouterLink>
    </div>

    <p v-if="analysis.error" class="banner-error">{{ analysis.error }}</p>

    <div v-if="degraded" class="banner-warn">
      <p v-if="degraded.failed.length > 0">
        以下渠道请求失败（本次结果已自动降级为其余可用渠道）：
        <strong>{{ degraded.failed.map((run) => channelName(run.channelId)).join('、') }}</strong>
      </p>
      <p v-if="degraded.simulated.length > 0">
        以下渠道仍返回<strong>模拟数据</strong>，相关分项不代表真实行情：
        {{ degraded.simulated.map((run) => channelName(run.channelId)).join('、') }}
      </p>
    </div>

    <div v-if="analysis.loading && !report" class="card loading-card">
      <p>正在并行拉取渠道数据并计算指标…</p>
    </div>

    <div v-else-if="!report" class="card empty-state">
      <h2>{{ watchlist.isEmpty ? '自选池为空' : '还没有分析结果' }}</h2>
      <p v-if="watchlist.isEmpty">分析以自选池为输入，请先到「自选池」页面搜索添加至少一只股票。</p>
      <p v-else>先在「数据源配置」中选择行情与新闻渠道，然后运行一次分析。</p>
      <div class="empty-actions">
        <RouterLink v-if="watchlist.isEmpty" to="/watchlist" class="btn btn-primary">去添加股票</RouterLink>
        <button v-else class="btn btn-primary" @click="run">立即运行</button>
        <RouterLink to="/channels" class="btn btn-ghost">数据源配置</RouterLink>
      </div>
    </div>

    <template v-else>
      <div class="stat-grid">
        <StatTile label="上涨 / 下跌" :value="`${market?.advances ?? 0} / ${market?.declines ?? 0}`" hint="基于最新交易日涨跌" tone="neutral" />
        <StatTile label="平均涨跌" :value="formatPercent(market?.avgPctChange ?? 0)" hint="股票池等权" :tone="(market?.avgPctChange ?? 0) >= 0 ? 'up' : 'down'" />
        <StatTile label="强势上行" :value="market?.strongCount ?? 0" hint="多头排列 + 放量" tone="up" />
        <StatTile label="利好 / 利空事件" :value="`${market?.positiveNews ?? 0} / ${market?.negativeNews ?? 0}`" hint="去重后的事件数" tone="warn" />
      </div>

      <div class="card channel-runs">
        <header class="card-head">
          <h2>渠道运行状态</h2>
          <span class="tag">{{ report.channelRuns.filter((run) => run.ok).length }} / {{ report.channelRuns.length }} 成功</span>
        </header>
        <div class="run-list">
          <div v-for="run in report.channelRuns" :key="run.channelId" class="run-item" :class="{ 'is-failed': !run.ok }">
            <span class="dot" />
            <span class="run-name">{{ channelName(run.channelId) }}</span>
            <span class="run-meta">{{ run.count }} 条 · {{ run.elapsedMs }}ms</span>
            <span v-if="!run.ok" class="run-error">{{ run.error }}</span>
          </div>
        </div>
        <p v-if="report.missingSymbols.length > 0" class="inline-warn">
          以下标的所有渠道均未返回数据：{{ report.missingSymbols.join('、') }}
        </p>
      </div>

      <div class="analysis-layout">
        <div class="card list-panel">
          <header class="card-head">
            <h2>候选推荐</h2>
            <input v-model="keyword" class="search-input" type="search" placeholder="搜索名称 / 代码 / 行业" />
          </header>
          <div class="filter-bar">
            <select v-model="sectorFilter" class="select-input" aria-label="按行业筛选">
              <option value="">全部行业</option>
              <option v-for="sector in sectorOptions" :key="sector" :value="sector">{{ sector }}</option>
            </select>
            <select v-model="trendFilter" class="select-input" aria-label="按趋势筛选">
              <option value="all">全部趋势</option>
              <option v-for="[value, meta] in trendOptions" :key="value" :value="value">{{ meta.text }}</option>
            </select>
            <select v-model="stageFilter" class="select-input" aria-label="按事件阶段筛选">
              <option value="all">全部事件阶段</option>
              <option v-for="[value, meta] in stageOptions" :key="value" :value="value">{{ meta.text }}</option>
            </select>
            <label class="inline-label">
              评分
              <input v-model.number="minScore" class="range-input" type="number" min="0" max="100" aria-label="最低评分" />
              -
              <input v-model.number="maxScore" class="range-input" type="number" min="0" max="100" aria-label="最高评分" />
            </label>
            <select v-model="sortBy" class="select-input" aria-label="排序方式">
              <option value="score">按评分</option>
              <option value="change">按当日涨跌</option>
              <option value="volume">按量比</option>
              <option value="name">按名称</option>
            </select>
            <button class="btn btn-mini" @click="resetFilters">重置</button>
          </div>
          <p class="muted filter-summary">显示 {{ filtered.length }} / {{ report.recommendations.length }} 只</p>
          <RecommendationTable :items="filtered" :selected-symbol="selected?.symbol" @select="selectSymbol" />
        </div>

        <aside v-if="selected" class="card detail-panel">
          <header class="detail-head">
            <div>
              <h2>{{ selected.name }}</h2>
              <p class="muted">{{ selected.symbol }} · {{ selected.sector }}</p>
            </div>
            <div class="detail-score">
              <span>{{ selected.totalScore.toFixed(1) }}</span>
              <TrendBadge :label="selected.trend.label" :score="selected.trend.score" />
            </div>
          </header>

          <div class="detail-price">
            <div>
              <p class="price">{{ formatPrice(selected.indicators.lastClose) }}</p>
              <p :class="selected.indicators.pctChange1d >= 0 ? 'text-up' : 'text-down'">
                {{ formatPercent(selected.indicators.pctChange1d) }} · 5 日 {{ formatPercent(selected.indicators.pctChange5d) }}
              </p>
            </div>
          </div>

          <div class="detail-chart">
            <KlineChart :bars="selected.bars" />
          </div>

          <div class="indicator-grid">
            <div><span>MA5</span><strong>{{ formatPrice(selected.indicators.ma5) }}</strong></div>
            <div><span>MA10</span><strong>{{ formatPrice(selected.indicators.ma10) }}</strong></div>
            <div><span>MA20</span><strong>{{ formatPrice(selected.indicators.ma20) }}</strong></div>
            <div><span>量比</span><strong>{{ selected.indicators.volumeRatio }}</strong></div>
            <div><span>区间位置</span><strong>{{ (selected.indicators.rangePosition * 100).toFixed(0) }}%</strong></div>
            <div><span>20 日波动</span><strong>{{ selected.indicators.volatility20 }}%</strong></div>
            <div><span>5 日均额</span><strong>{{ formatAmount(selected.indicators.avgAmount) }}</strong></div>
            <div><span>数据源</span><strong>{{ selected.sourceIds.length }} 个</strong></div>
          </div>

          <div class="advice-box">
            <p class="box-title">买卖时机参考</p>
            <p>{{ selected.entryAdvice }}</p>
          </div>

          <div class="breakdown">
            <p class="box-title">评分构成</p>
            <div v-for="item in selected.breakdown" :key="item.key" class="breakdown-row">
              <div class="breakdown-head">
                <span>{{ item.label }} <em>权重 {{ (item.weight * 100).toFixed(0) }}%</em></span>
                <strong>{{ item.score.toFixed(0) }}</strong>
              </div>
              <div class="score-bar"><i :style="{ width: `${Math.min(100, item.score)}%` }" /></div>
              <p class="breakdown-detail">{{ item.detail }}</p>
            </div>
          </div>

          <div class="risk-box">
            <p class="box-title">风险与校验提示</p>
            <ul v-if="selected.riskFlags.length > 0">
              <li v-for="flag in selected.riskFlags" :key="flag">{{ flag }}</li>
            </ul>
            <p v-else class="muted">未触发规则化风险提示。</p>
            <p class="muted sources">
              来源：{{ selected.sourceIds.map(channelName).join(' / ') }}
            </p>
          </div>

          <div class="detail-news">
            <p class="box-title">相关事件（{{ selected.news.length }}）</p>
            <NewsTimeline :items="selected.news" empty-text="该标的暂未匹配到新闻事件" @select-symbol="selectSymbol" />
          </div>
        </aside>
      </div>

      <div v-if="snapshots.items.length > 0" class="card snapshot-compare">
        <header class="card-head">
          <h2>历史快照对比</h2>
          <div class="card-head-actions">
            <select v-model="compareId" class="select-input" aria-label="选择对比快照">
              <option value="">上一次分析</option>
              <option v-for="snapshot in snapshots.items" :key="snapshot.id" :value="snapshot.id">
                {{ formatDateTime(snapshot.generatedAt) }}（{{ snapshot.items.length }} 只）
              </option>
            </select>
            <button class="btn btn-mini" @click="snapshots.clear()">清空历史</button>
          </div>
        </header>
        <p v-if="compareBaseline" class="muted">
          对比基准：{{ formatDateTime(compareBaseline.generatedAt) }} · 平均涨跌 {{ formatPercent(compareBaseline.avgPctChange) }}
          · 事件 {{ compareBaseline.newsCount }} 条 · 本次移出 {{ removedCount }} 只
        </p>
        <table v-if="compareRows.length > 0" class="snapshot-table">
          <thead>
            <tr><th>股票</th><th>评分</th><th>评分变化</th><th>趋势</th><th>当日涨跌</th><th>状态</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in compareRows" :key="row.symbol">
              <td>{{ row.name }} <span class="muted">{{ row.symbol }}</span></td>
              <td>{{ row.scoreNow.toFixed(1) }}</td>
              <td :class="row.scoreDelta === null ? 'muted' : row.scoreDelta >= 0 ? 'text-up' : 'text-down'">
                {{ row.scoreDelta === null ? '—' : `${row.scoreDelta >= 0 ? '+' : ''}${row.scoreDelta.toFixed(1)}` }}
              </td>
              <td>
                {{ trendLabels[row.trendNow].text }}
                <span v-if="row.trendChanged" class="tag tag-key">变化</span>
              </td>
              <td :class="row.pctChangeNow >= 0 ? 'text-up' : 'text-down'">{{ formatPercent(row.pctChangeNow) }}</td>
              <td>{{ row.status === 'new' ? '新进' : '在池' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted">暂无更早快照可对比，下一次重新分析后即可看到评分与趋势变化。</p>
      </div>

      <div class="card">
        <header class="card-head">
          <h2>新闻事件时间线</h2>
          <div class="filter-group">
            <button class="btn btn-mini" :class="{ 'is-active': newsFilter === 'all' }" @click="newsFilter = 'all'">全部</button>
            <button class="btn btn-mini" :class="{ 'is-active': newsFilter === 'positive' }" @click="newsFilter = 'positive'">利好</button>
            <button class="btn btn-mini" :class="{ 'is-active': newsFilter === 'negative' }" @click="newsFilter = 'negative'">利空</button>
          </div>
        </header>
        <NewsTimeline :items="newsList" @select-symbol="selectSymbol" />
        <p class="hint-text">
          事件类型：{{ Object.keys(eventTypeLabels).length }} 类 · 情绪：{{ Object.values(sentimentLabels).map((item) => item.text).join(' / ') }}
          · 阶段：{{ Object.values(stageLabels).map((item) => item.text).join(' → ') }}
          · 建议：{{ Object.values(adviceLabels).map((item) => item.text).join(' / ') }}
        </p>
      </div>

      <p class="disclaimer">{{ DISCLAIMER }}</p>
    </template>
  </section>
</template>
