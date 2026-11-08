<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useStorageStore } from '@/stores/storage'
import { getTradingStatus, type TradingPhase } from '@/lib/trading-calendar'
import { COMPLIANCE_VERSION } from '@/lib/compliance'
import { installScrollMemory } from '@/lib/scroll-memory'
import NavIcon from '@/components/NavIcon.vue'
import QuickLauncher from '@/components/QuickLauncher.vue'
import ProfileMenu from '@/components/ProfileMenu.vue'
import ThemeMenu from '@/components/ThemeMenu.vue'

type IconName = 'overview' | 'watchlist' | 'analysis' | 'compare' | 'settings' | 'sources' | 'screener' | 'sector'

const route = useRoute()
const router = useRouter()
const storage = useStorageStore()

interface NavItem {
  to: string
  label: string
  icon: IconName
}

/** Desktop sidebar: grouped by job-to-be-done instead of one long flat list. */
const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: '市场',
    items: [
      { to: '/', label: '首页概览', icon: 'overview' },
      { to: '/sectors', label: '行业排行', icon: 'sector' },
      { to: '/analysis', label: '数据分析', icon: 'analysis' },
      { to: '/compare', label: '多股对比', icon: 'compare' },
    ],
  },
  {
    label: '选股',
    items: [
      { to: '/screener', label: '股票检索', icon: 'screener' },
      { to: '/watchlist', label: '收藏', icon: 'watchlist' },
    ],
  },
  {
    label: '数据与设置',
    items: [
      { to: '/sources', label: '数据源', icon: 'sources' },
      { to: '/settings', label: '设置', icon: 'settings' },
    ],
  },
]

/** Mobile bottom bar: overview + stock screener first, then watchlist/analysis. */
const mobileTabs: NavItem[] = [
  { to: '/', label: '首页', icon: 'overview' },
  { to: '/screener', label: '选股', icon: 'screener' },
  { to: '/watchlist', label: '收藏', icon: 'watchlist' },
  { to: '/analysis', label: '分析', icon: 'analysis' },
]

const drawerOpen = ref(false)

// Clock / trading status are derived from one ticking "now" so both update together.
const now = ref(new Date())

const CLOCK_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})
const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
})

const clockText = computed(() => CLOCK_FORMATTER.format(now.value))
const dateText = computed(() => DATE_FORMATTER.format(now.value))
const status = computed(() => getTradingStatus(now.value))

const PHASE_TEXT: Record<TradingPhase, string> = {
  'pre-open': '盘前',
  session: '开盘',
  lunch: '午休',
  closed: '收盘',
  holiday: '休市',
}
const phaseLabel = computed(() => PHASE_TEXT[status.value.phase])

let clockTimer: number | undefined
let stopScrollMemory: (() => void) | undefined

function onVisibilityChange(): void {
  if (!document.hidden) now.value = new Date()
}

onMounted(() => {
  clockTimer = window.setInterval(() => {
    now.value = new Date()
  }, 1_000)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('keydown', onDrawerKeydown)
  stopScrollMemory = installScrollMemory(router)
})

onUnmounted(() => {
  if (clockTimer !== undefined) window.clearInterval(clockTimer)
  stopScrollMemory?.()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('keydown', onDrawerKeydown)
})

/** Stock detail is a secondary page: highlight the entry the user came from. */
const activePath = computed(() => {
  if (route.path.startsWith('/index/') || route.path.startsWith('/sector/')) return '/'
  if (route.path.startsWith('/stock/')) {
    const from = route.query.from
    if (from === 'analysis') return '/analysis'
    if (from === 'screener') return '/screener'
    if (from === 'compare') return '/compare'
    if (from === 'index' || from === 'sector') return '/'
    return '/watchlist'
  }
  return route.path
})

function onDrawerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    drawerOpen.value = false
  }
}

watch(
  () => route.path,
  () => {
    drawerOpen.value = false
  },
)
</script>

<template>
  <div class="app-root">
    <header class="app-header">
      <div class="header-inner">
        <div class="brand">
          <ProfileMenu />
          <RouterLink to="/" class="brand-copy" aria-label="返回概览">
            <span class="brand-name">炒股战士·老猪</span>
            <span class="brand-sub">行情 · 选股 · 资讯</span>
          </RouterLink>
        </div>

        <div class="header-actions">
          <ThemeMenu />
          <div class="header-clock" :title="`最近交易日 ${status.latestTradingDay}`">
            <span class="clock-time">{{ clockText }}</span>
            <span class="clock-date">{{ dateText }}</span>
          </div>

          <span class="market-state" :class="`is-${status.phase}`">
            <span class="state-dot" aria-hidden="true" />
            {{ phaseLabel }}
          </span>
        </div>
      </div>
    </header>

    <div class="app-shell">

    <div v-if="storage.notice" class="storage-banner" role="status">
      <span class="storage-banner-text">
        {{ storage.notice }}
        <span class="muted">当前存储：{{ storage.kindLabel }}</span>
      </span>
      <button class="btn btn-ghost" type="button" @click="storage.dismiss()">知道了</button>
    </div>

    <div class="app-body">
      <aside class="app-sidebar" aria-label="功能分组导航">
        <nav v-for="group in navGroups" :key="group.label" class="nav-group">
          <p class="nav-group-label">{{ group.label }}</p>
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            class="side-link"
            :class="{ 'is-active': activePath === item.to }"
          >
            <NavIcon :name="item.icon" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </nav>
        <div class="sidebar-tip">
          <span class="sidebar-tip-dot" />
          <p>首页悬浮按钮可拖动，点击展开全部功能入口。</p>
        </div>
      </aside>

      <main class="app-main">
        <RouterView />
      </main>
    </div>

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

    <nav class="tabbar" aria-label="移动端主导航">
      <RouterLink
        v-for="item in mobileTabs"
        :key="item.to"
        :to="item.to"
        class="tab-item"
        :class="{ 'is-active': activePath === item.to }"
      >
        <NavIcon :name="item.icon" />
        <span>{{ item.label }}</span>
      </RouterLink>
      <button class="tab-item tab-more" type="button" aria-label="打开全部功能" @click="drawerOpen = true">
        <NavIcon name="more" />
        <span>更多</span>
      </button>
    </nav>

    <Transition name="drawer">
      <div v-if="drawerOpen" class="drawer-root">
        <div class="drawer-backdrop" @click="drawerOpen = false" />
        <aside class="drawer" role="dialog" aria-modal="true" aria-label="全部功能">
          <header class="drawer-head">
            <div>
              <p class="muted">全部功能</p>
              <strong>炒股战士·老猪</strong>
            </div>
            <button class="btn btn-ghost drawer-close" type="button" aria-label="关闭" @click="drawerOpen = false">
              ×
            </button>
          </header>

          <nav class="drawer-groups">
            <section v-for="group in navGroups" :key="group.label" class="drawer-group">
              <p class="nav-group-label">{{ group.label }}</p>
              <RouterLink
                v-for="item in group.items"
                :key="item.to"
                :to="item.to"
                class="side-link drawer-link"
                :class="{ 'is-active': activePath === item.to }"
              >
                <NavIcon :name="item.icon" />
                <span>{{ item.label }}</span>
              </RouterLink>
            </section>
          </nav>

          <footer class="drawer-legal">
            <RouterLink to="/legal/terms">使用条款</RouterLink>
            <RouterLink to="/legal/privacy">隐私说明</RouterLink>
            <RouterLink to="/legal/sources">数据来源</RouterLink>
          </footer>
        </aside>
      </div>
    </Transition>

    <QuickLauncher />
    </div>
  </div>
</template>

<style scoped>
.brand-copy {
  display: flex;
  flex-direction: column;
  line-height: 1.18;
}

.brand-sub {
  display: block;
  font-size: 10px;
  color: var(--muted);
  letter-spacing: 0.4px;
}

.header-actions {
  position: relative;
  gap: 14px;
  min-width: 0;
  flex-wrap: nowrap;
  align-items: center;
}

/* ---------- clock + trading status ---------- */
.header-clock {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-end;
  height: 34px;
  line-height: 1.15;
  flex: none;
}

.clock-time {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.3px;
}

.clock-date {
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
}

.market-state {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-soft);
  font-size: 11.5px;
  white-space: nowrap;
  flex: none;
  box-sizing: border-box;
}

.state-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--muted);
  box-shadow: 0 0 0 3px var(--track);
}

.market-state.is-session {
  color: var(--up);
  border-color: var(--danger-border);
  background: var(--danger-soft);
}

.market-state.is-session .state-dot {
  background: var(--up);
  box-shadow: 0 0 0 3px var(--danger-soft);
  animation: statePulse 2.2s ease-in-out infinite;
}

.market-state.is-lunch,
.market-state.is-pre-open {
  color: var(--warn-text);
  border-color: var(--warn-border);
  background: var(--warn-soft);
}

.market-state.is-lunch .state-dot,
.market-state.is-pre-open .state-dot {
  background: var(--warn);
  box-shadow: 0 0 0 3px var(--warn-soft);
}

.market-state.is-closed,
.market-state.is-holiday {
  color: var(--muted);
}

.market-state.is-closed .state-dot,
.market-state.is-holiday .state-dot {
  background: var(--muted);
}

@keyframes statePulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.32;
  }
}

.sidebar-tip-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-soft);
}

.drawer-close {
  font-size: 18px;
  line-height: 1;
  padding: 4px 10px;
}

.drawer-link {
  font-size: 14px;
}

@media (max-width: 980px) {
  .clock-date {
    display: none;
  }

  .header-actions {
    gap: 10px;
  }
}

@media (max-width: 760px) {
  .brand-sub {
    display: none;
  }

  .brand-name {
    font-size: 13px;
  }

  .header-actions {
    gap: 6px;
  }

  .clock-time {
    font-size: 12px;
  }

  .market-state {
    padding: 4px 8px;
    font-size: 11px;
  }
}

@media (max-width: 420px) {
  .header-inner {
    gap: 8px;
  }

  .brand-name {
    font-size: 12.5px;
  }

  .clock-time {
    font-size: 11px;
    letter-spacing: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .market-state.is-session .state-dot {
    animation: none;
  }
}
</style>
