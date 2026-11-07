<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useChannelsStore } from '@/stores/channels'
import { useAnalysisStore } from '@/stores/analysis'
import { useWatchlistStore } from '@/stores/watchlist'
import { useUniverseStore } from '@/stores/universe'
import { getTradingStatus } from '@/lib/trading-calendar'
import { formatDateTime } from '@/lib/format'
import StatTile from '@/components/StatTile.vue'

const router = useRouter()
const channels = useChannelsStore()
const analysis = useAnalysisStore()
const watchlist = useWatchlistStore()
const universe = useUniverseStore()

const trading = getTradingStatus()
const report = computed(() => analysis.report)
const preview = computed(() => watchlist.items.slice(0, 10))

const universeFreshness = computed(() => {
  if (!universe.fetchedAt) return '全市场列表尚未加载'
  return `全市场列表 ${formatDateTime(universe.fetchedAt)} 更新`
})

async function run(): Promise<void> {
  await analysis.run()
  if (!analysis.error) await router.push('/analysis')
}
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h1>概览</h1>
        <p>
          {{ trading.latestTradingDay }} · {{ trading.phaseLabel }} · 自选 {{ watchlist.count }} 只 ·
          {{ report ? `最近分析 ${formatDateTime(report.generatedAt)}` : '尚未运行分析' }}
        </p>
      </div>
      <div class="page-head-actions">
        <RouterLink to="/watchlist" class="btn btn-ghost">管理自选</RouterLink>
        <button class="btn btn-primary" :disabled="analysis.loading" @click="run">
          {{ analysis.loading ? '正在分析…' : '运行分析' }}
        </button>
      </div>
    </header>

    <p v-if="analysis.error" class="banner-error">{{ analysis.error }}</p>

    <div class="stat-grid">
      <StatTile label="启用渠道" :value="channels.enabledCount" hint="行情源 + 新闻源" tone="neutral" />
      <StatTile label="覆盖标的" :value="watchlist.count" hint="自选池上限 50 只" tone="neutral" />
      <StatTile
        label="最高评分"
        :value="report ? analysis.topScore.toFixed(1) : '暂无'"
        hint="趋势 + 事件加权"
        :tone="report ? 'up' : 'neutral'"
      />
      <StatTile
        label="事件条数"
        :value="report ? report.news.length : '暂无'"
        hint="去重后的新闻事件"
        :tone="report && report.news.length > 0 ? 'warn' : 'neutral'"
      />
    </div>

    <div class="card">
      <header class="card-head">
        <h2>自选速览 <span class="muted">{{ watchlist.count }} 只</span></h2>
        <div class="card-head-actions">
          <RouterLink v-if="!watchlist.isEmpty" to="/analysis" class="btn btn-mini">查看分析</RouterLink>
          <RouterLink to="/watchlist" class="btn btn-mini">管理</RouterLink>
        </div>
      </header>

      <div v-if="watchlist.isEmpty" class="empty-state compact">
        <h3>自选池为空</h3>
        <p>分析以自选池为输入，先添加至少一只股票，再运行分析。</p>
        <div class="empty-actions">
          <RouterLink to="/watchlist" class="btn btn-primary">去添加股票</RouterLink>
          <RouterLink to="/settings" class="btn btn-ghost">检查数据源</RouterLink>
        </div>
      </div>
      <div v-else class="stock-pool">
        <RouterLink
          v-for="stock in preview"
          :key="stock.symbol"
          :to="`/stock/${stock.symbol}?from=watchlist`"
          class="pool-item"
        >
          <strong>{{ stock.name }}</strong>
          <span>{{ stock.symbol }} · {{ stock.market === 'SH' ? '沪市' : '深市' }}</span>
        </RouterLink>
      </div>
      <p v-if="!watchlist.isEmpty && watchlist.count > preview.length" class="hint-text">
        仅展示前 {{ preview.length }} 只，完整列表见「自选」。
      </p>
      <p class="hint-text">
        {{ universeFreshness }}<template v-if="universe.isStale && universe.count">（缓存已过期，可在自选页刷新）</template>
      </p>
    </div>

    <details class="section-collapse">
      <summary>工作方式与评分口径</summary>
      <div class="collapse-body">
        <ol class="flow-list">
          <li><b>1</b><span><strong>选渠道</strong> · 在设置中启用行情源与新闻源，并按可靠度分配权重。</span></li>
          <li><b>2</b><span><strong>拉数据</strong> · 并行请求各渠道，单渠道失败自动降级，收盘价按权重合并。</span></li>
          <li><b>3</b><span><strong>算指标</strong> · 均线结构、动量、量比、区间位置，以及新闻事件、情绪与阶段。</span></li>
          <li><b>4</b><span><strong>出结果</strong> · 趋势与事件加权打分，输出候选列表、时机参考和风险提示。</span></li>
        </ol>
        <p class="hint-text">
          评分只影响候选排序，不改变指标与事件判定；所有结论可在「分析」页逐项展开。行情与资讯来自第三方公开接口，
          不构成任何投资建议。
        </p>
      </div>
    </details>
  </section>
</template>
