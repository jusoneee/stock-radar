<script setup lang="ts">
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useChannelsStore } from '@/stores/channels'
import { useAnalysisStore } from '@/stores/analysis'

const route = useRoute()
const router = useRouter()
const channels = useChannelsStore()
const analysis = useAnalysisStore()

const navItems = [
  { to: '/', label: '仪表盘' },
  { to: '/channels', label: '数据源配置' },
  { to: '/analysis', label: '分析结果' },
]

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
        <span class="chip">已启用 {{ channels.enabledCount }} 个渠道</span>
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
        本工具仅做信息聚合与逻辑演示，所有数据均为本地生成的模拟数据，<strong>不构成任何投资建议</strong>。
      </p>
      <p>
        接入真实数据源需自行申请并配置密钥，请遵守各数据提供方的服务条款；请勿在仓库或前端代码中硬编码密钥。
      </p>
    </footer>
  </div>
</template>
