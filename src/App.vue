<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useChannelsStore } from '@/stores/channels'
import { useWatchlistStore } from '@/stores/watchlist'
import { useStorageStore } from '@/stores/storage'
import { getTradingStatus } from '@/lib/trading-calendar'
import { COMPLIANCE_VERSION } from '@/lib/compliance'
import NavIcon from '@/components/NavIcon.vue'

const route = useRoute()
const channels = useChannelsStore()
const watchlist = useWatchlistStore()
const storage = useStorageStore()

const navItems = [
  { to: '/', label: '概览', icon: 'overview' as const },
  { to: '/watchlist', label: '自选', icon: 'watchlist' as const },
  { to: '/analysis', label: '分析', icon: 'analysis' as const },
  { to: '/compare', label: '对比', icon: 'compare' as const },
  { to: '/settings', label: '设置', icon: 'settings' as const },
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

/** Stock detail is a secondary page: highlight the entry the user came from. */
const activePath = computed(() => {
  if (route.path.startsWith('/stock/')) {
    return route.query.from === 'analysis' ? '/analysis' : '/watchlist'
  }
  return route.path
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink to="/" class="brand" aria-label="返回概览">
        <span class="brand-mark">SR</span>
        <span class="brand-name">Stock Radar</span>
      </RouterLink>
      <nav class="nav" aria-label="主导航">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ 'is-active': activePath === item.to }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
      <div class="header-actions">
        <span class="chip">{{ marketChip }}</span>
        <span class="chip">自选 {{ watchlist.count }} · 渠道 {{ channels.enabledCount }}</span>
      </div>
    </header>

    <div v-if="storage.notice" class="storage-banner" role="status">
      <span class="storage-banner-text">
        {{ storage.notice }}
        <span class="muted">当前存储：{{ storage.kindLabel }}</span>
      </span>
      <button class="btn btn-ghost" type="button" @click="storage.dismiss()">知道了</button>
    </div>

    <main class="app-main">
      <RouterView />
    </main>

    <footer class="app-footer">
      <p>
        行情与资讯来自第三方公开接口，可能存在延迟、限流或字段变动；所有评分与操作参考均为规则化分析结论，
        <strong>不构成任何投资建议</strong>。
      </p>
      <p class="footer-links">
        <RouterLink to="/legal/terms">使用条款</RouterLink>
        <RouterLink to="/legal/privacy">隐私说明</RouterLink>
        <RouterLink to="/legal/sources">数据来源</RouterLink>
        <span class="muted">合规文案 v{{ COMPLIANCE_VERSION }}</span>
      </p>
    </footer>

    <nav class="tabbar" aria-label="移动端导航">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="tab-item"
        :class="{ 'is-active': activePath === item.to }"
      >
        <NavIcon :name="item.icon" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>
