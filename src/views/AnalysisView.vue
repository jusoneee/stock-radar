<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAnalysisStore } from '@/stores/analysis'
import { CHANNEL_CATALOG } from '@/adapters/registry'
import type { NewsAnalysis, Recommendation } from '@/types'
import { formatAmount, formatDateTime, formatPercent, formatPrice } from '@/lib/format'
import { adviceLabels, eventTypeLabels, sentimentLabels, stageLabels } from '@/lib/labels'
import RecommendationTable from '@/components/RecommendationTable.vue'
import NewsTimeline from '@/components/NewsTimeline.vue'
import TrendBadge from '@/components/TrendBadge.vue'
import StatTile from '@/components/StatTile.vue'
import Sparkline from '@/components/Sparkline.vue'

const analysis = useAnalysisStore()
const keyword = ref('')
const selectedSymbol = ref('')
const newsFilter = ref<'all' | 'positive' | 'negative'>('all')

const report = computed(() => analysis.report)
const market = computed(() => analysis.report?.market)

const filtered = computed<Recommendation[]>(() => {
  const list = analysis.report?.recommendations ?? []
  const query = keyword.value.trim().toLowerCase()
  if (!query) return list
  return list.filter(
    (item) => item.name.toLowerCase().includes(query) || item.symbol.includes(query) || item.sector.includes(query),
  )
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

function channelName(id: string): string {
  return CHANNEL_CATALOG.find((meta) => meta.id === id)?.name ?? id
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

function selectSymbol(symbol: string): void {
  selectedSymbol.value = symbol
}

async function run(): Promise<void> {
  await analysis.run()
  if (!analysis.error) selectedSymbol.value = analysis.report?.recommendations[0]?.symbol ?? ''
}

onMounted(async () => {
  await analysis.ensureReport()
  selectedSymbol.value = analysis.report?.recommendations[0]?.symbol ?? ''
})
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h1>分析结果</h1>
        <p>
          推荐列表由「趋势结构 40% + 动量 15% + 量能 15% + 区间位置 15% + 事件驱动 15%」加权得出，
          所有结论均可下钻查看计算依据。
        </p>
      </div>
      <div class="page-head-actions">
        <span v-if="report" class="muted">生成于 {{ formatDateTime(report.generatedAt) }}</span>
        <button class="btn btn-primary" :disabled="analysis.loading" @click="run">
          {{ analysis.loading ? '分析中…' : '重新分析' }}
        </button>
      </div>
    </header>

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
      <h2>还没有分析结果</h2>
      <p>先在「数据源配置」中选择行情与新闻渠道，然后运行一次分析。</p>
      <button class="btn btn-primary" @click="run">立即运行</button>
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
            <Sparkline :bars="selected.bars" :width="140" :height="42" />
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
    </template>
  </section>
</template>
