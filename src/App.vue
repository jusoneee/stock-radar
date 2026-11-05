<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useChannelsStore } from '@/stores/channels'
import { useAnalysisStore } from '@/stores/analysis'
import { useWatchlistStore } from '@/stores/watchlist'
import { getTradingStatus } from '@/lib/trading-calendar'
import { COMPLIANCE_VERSION } from '@/lib/compliance'

const route = useRoute()
const router = useRouter()
const channels = useChannelsStore()
const analysis = useAnalysisStore()
const watchlist = useWatchlistStore()

const navItems = [
  { to: '/', label: '仪表盘' },
  { to: '/watchlist', label: '自选池' },
  { to: '/compare', label: '多股对比' },
  { to: '/channels', label: '数据源配置' },
  { to: '/analysis', label: '分析结果' },
  { to: '/legal/sources', label: '合规与数据来源' },
]

const status = ref(getTradingStatus())
let timer: number | undefined

onMounted(() => {
  timer = window.setInterval(() => {
    status.value = getTradingStatus()
  }, 60_000)
})

onUnmounted(() => {
  if (timer !== undefined) window.clearInterval(timer)
})

const marketChip = computed(() => `${status.value.latestTradingDay} · ${status.value.phaseLabel}`)

async function runAnalysis(): Promise<void> {
  await analysis.run()
  if (!analysis.error) {
    await router.push('/analysis')
  }
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">
        <span class="brand-mark">SR</span>
        <div>
          <p class="brand-name">Stock Radar</p>
          <p class="brand-sub">A股行情 + 新闻事件 双引擎选股框架</p>
        </div>
      </div>
      <nav class="nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ 'is-active': route.path === item.to }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
      <div class="header-actions">
        <span class="chip">{{ marketChip }}</span>
        <span class="chip">自选 {{ watchlist.count }} · 渠道 {{ channels.enabledCount }}</span>
        <button class="btn btn-primary" :disabled="analysis.loading" @click="runAnalysis">
          {{ analysis.loading ? '分析中…' : '运行分析' }}
        </button>
      </div>
    </header>

    <main class="app-main">
      <RouterView />
    </main>

    <footer class="app-footer">
      <p>
        行情与资讯来自第三方公开接口，可能存在延迟、限流或字段变动；所有评分与「操作参考」均为规则化分析结论，
        <strong>不构成任何投资建议</strong>。
      </p>
      <p>
        请遵守各数据提供方的服务条款并控制请求频率；请勿在仓库或前端代码中硬编码密钥。
      </p>
      <p class="footer-links">
        <RouterLink to="/legal/terms">使用条款</RouterLink>
        <RouterLink to="/legal/privacy">隐私说明</RouterLink>
        <RouterLink to="/legal/sources">数据来源</RouterLink>
        <span class="muted">合规文案 v{{ COMPLIANCE_VERSION }}</span>
      </p>
    </footer>
  </div>
</template>
