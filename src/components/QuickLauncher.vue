<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NavIcon from '@/components/NavIcon.vue'

const FAB_SIZE = 54
const EDGE = 12
const POSITION_KEY = 'stock-radar:quick-launcher:v1'

interface Entry {
  path: string
  label: string
  hint: string
  icon:
    | 'overview'
    | 'watchlist'
    | 'analysis'
    | 'compare'
    | 'screener'
    | 'settings'
    | 'sources'
    | 'terms'
    | 'privacy'
}

const entries: Entry[] = [
  { path: '/', label: '首页概览', hint: '指数、行业冷热榜与资讯', icon: 'overview' },
  { path: '/screener', label: '股票检索', hint: '组合筛选、收藏与多选对比', icon: 'screener' },
  { path: '/watchlist', label: '收藏', hint: '搜索、分组与管理标的', icon: 'watchlist' },
  { path: '/analysis', label: '数据分析', hint: '运行分析并查看候选', icon: 'analysis' },
  { path: '/compare', label: '多股对比', hint: '多股归一化走势对比', icon: 'compare' },
  { path: '/sources', label: '数据源', hint: '内置渠道与自定义源管理', icon: 'sources' },
  { path: '/settings', label: '设置', hint: '主题、渠道与评分权重', icon: 'settings' },
  { path: '/legal/terms', label: '使用条款', hint: '产品使用边界说明', icon: 'terms' },
  { path: '/legal/privacy', label: '隐私说明', hint: '本地数据与隐私', icon: 'privacy' },
  { path: '/legal/sources', label: '数据来源', hint: '第三方接口清单', icon: 'sources' },
]

const router = useRouter()
const route = useRoute()

const isMenuOpen = ref(false)
const pos = ref({ right: EDGE, bottom: EDGE })
const viewport = ref({ width: 0, height: 0 })
const menuRef = ref<HTMLElement | null>(null)

const fab = FAB_SIZE
const drag = reactive({
  pointerId: null as number | null,
  startX: 0,
  startY: 0,
  startRight: EDGE,
  startBottom: EDGE,
  moved: false,
})

/** Keep the button clear of the mobile tab bar as well as the viewport edges. */
function minBottom(): number {
  return viewport.value.width <= 980 ? 78 : EDGE
}

function clampPosition(right: number, bottom: number): { right: number; bottom: number } {
  const maxRight = Math.max(EDGE, viewport.value.width - fab - EDGE)
  const maxBottom = Math.max(minBottom(), viewport.value.height - fab - EDGE)
  return {
    right: Math.min(Math.max(EDGE, right), maxRight),
    bottom: Math.min(Math.max(minBottom(), bottom), maxBottom),
  }
}

function readPosition(): { right: number; bottom: number } {
  try {
    const raw = localStorage.getItem(POSITION_KEY)
    if (!raw) throw new Error('empty')
    const parsed = JSON.parse(raw) as { right?: unknown; bottom?: unknown }
    if (typeof parsed.right !== 'number' || typeof parsed.bottom !== 'number') throw new Error('invalid')
    return { right: parsed.right, bottom: parsed.bottom }
  } catch {
    const narrow = window.innerWidth <= 980
    return { right: EDGE, bottom: narrow ? 78 : EDGE }
  }
}

function persistPosition(): void {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(pos.value))
  } catch {
    // Private mode / quota errors are non-fatal: the position stays for this session.
  }
}

function updateViewport(): void {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
  pos.value = clampPosition(pos.value.right, pos.value.bottom)
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 && event.pointerType === 'mouse') return
  drag.pointerId = event.pointerId
  drag.startX = event.clientX
  drag.startY = event.clientY
  drag.startRight = pos.value.right
  drag.startBottom = pos.value.bottom
  drag.moved = false
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (drag.pointerId === null || event.pointerId !== drag.pointerId) return
  const dx = event.clientX - drag.startX
  const dy = event.clientY - drag.startY
  if (!drag.moved && Math.hypot(dx, dy) < 4) return
  drag.moved = true
  if (isMenuOpen.value) isMenuOpen.value = false
  pos.value = clampPosition(drag.startRight - dx, drag.startBottom - dy)
}

function onPointerUp(event: PointerEvent): void {
  if (event.pointerId !== drag.pointerId) return
  const wasMoved = drag.moved
  drag.pointerId = null
  if (wasMoved) {
    pos.value = clampPosition(pos.value.right, pos.value.bottom)
    persistPosition()
  } else {
    toggleMenu()
  }
}

function toggleMenu(): void {
  isMenuOpen.value = !isMenuOpen.value
}

function closeMenu(): void {
  isMenuOpen.value = false
}

const fabStyle = computed(() => ({
  right: `${pos.value.right}px`,
  bottom: `${pos.value.bottom}px`,
}))

/** Keep the popover inside the viewport, flipping above/below the button. */
const menuStyle = computed(() => {
  const width = Math.min(248, Math.max(200, viewport.value.width - 16))
  const left = Math.min(
    Math.max(8, viewport.value.width - pos.value.right - width),
    Math.max(8, viewport.value.width - width - 8),
  )
  const style: Record<string, string> = { width: `${width}px`, left: `${left}px` }
  const fabTop = viewport.value.height - pos.value.bottom - fab
  if (fabTop > 320 || fabTop > viewport.value.height - fabTop) {
    style.bottom = `${pos.value.bottom + fab + 10}px`
    style.maxHeight = `${Math.max(120, fabTop - 22)}px`
  } else {
    const top = fabTop + fab + 10
    style.top = `${top}px`
    style.maxHeight = `${Math.max(120, viewport.value.height - top - 12)}px`
  }
  return style
})

function go(entry: Entry): void {
  isMenuOpen.value = false
  if (route.path === entry.path) return
  void router.push(entry.path)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeMenu()
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!isMenuOpen.value) return
  const target = event.target as Node | null
  if (!target) return
  if (menuRef.value?.contains(target)) return
  if ((target as HTMLElement).closest?.('.quick-fab')) return
  closeMenu()
}

onMounted(() => {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
  const saved = readPosition()
  pos.value = clampPosition(saved.right, saved.bottom)
  window.addEventListener('resize', updateViewport)
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport)
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})

watch(
  () => route.path,
  () => {
    if (isMenuOpen.value) {
      nextTick(() => closeMenu())
    }
  },
)
</script>

<template>
  <div class="quick-launcher" :style="fabStyle">
    <Transition name="quick-pop">
      <section
        v-if="isMenuOpen"
        ref="menuRef"
        class="quick-menu"
        :style="menuStyle"
        role="menu"
        aria-label="全部功能入口"
      >
        <p class="quick-menu-title">全部功能入口</p>
        <button
          v-for="entry in entries"
          :key="entry.path"
          class="quick-item"
          :class="{ 'is-current': route.path === entry.path }"
          type="button"
          role="menuitem"
          @click="go(entry)"
        >
          <span class="quick-icon"><NavIcon :name="entry.icon" /></span>
          <span class="quick-item-text">
            <strong>{{ entry.label }}</strong>
            <small>{{ entry.hint }}</small>
          </span>
          <span v-if="route.path === entry.path" class="quick-current">当前</span>
        </button>
        <p class="quick-tip">按住按钮可拖动位置，位置会自动保存</p>
      </section>
    </Transition>

    <button
      class="quick-fab"
      :class="{ 'is-open': isMenuOpen }"
      type="button"
      :aria-label="isMenuOpen ? '收起功能入口' : '展开全部功能入口'"
      :aria-expanded="isMenuOpen"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <svg v-if="!isMenuOpen" class="quick-fab-grid" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" />
        <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" />
        <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" />
        <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" />
      </svg>
      <svg v-else class="quick-fab-close" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.quick-launcher {
  position: fixed;
  z-index: var(--z-page-pop);
}

.quick-fab {
  width: 54px;
  height: 54px;
  opacity: 0.94;
  border-radius: 50%;
  border: 1px solid var(--accent-border);
  background: linear-gradient(160deg, var(--accent), var(--accent-strong));
  color: var(--on-accent);
  display: grid;
  place-items: center;
  cursor: grab;
  touch-action: none;
  box-shadow: var(--shadow-pop);
  transition: transform 0.16s ease, opacity 0.16s ease, box-shadow 0.16s ease;
}

.quick-fab:hover {
  opacity: 1;
  transform: translateY(-1px) scale(1.02);
}

.quick-fab:active {
  cursor: grabbing;
}

.quick-fab svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.2s ease;
}

.quick-fab.is-open {
  background: linear-gradient(160deg, var(--accent-strong), var(--accent));
}

.quick-menu {
  position: fixed;
  padding: 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
  max-height: min(70vh, 460px);
  overflow-y: auto;
}

.quick-menu-title {
  padding: 6px 10px 8px;
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--muted);
}

.quick-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text-soft);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.quick-item:hover {
  background: var(--surface-2);
  color: var(--text);
}

.quick-item.is-current {
  color: var(--accent);
}

.quick-icon {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  flex: none;
  background: var(--accent-soft);
  color: var(--accent);
}

.quick-icon :deep(.tab-icon) {
  width: 17px;
  height: 17px;
}

.quick-item-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.quick-item-text strong {
  font-weight: 500;
  font-size: 13px;
}

.quick-item-text small {
  color: var(--muted);
  font-size: 11px;
}

.quick-current {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--accent);
  border: 1px solid var(--accent-border);
  border-radius: 999px;
  padding: 1px 7px;
  flex: none;
}

.quick-tip {
  margin: 4px 4px 2px;
  padding-top: 8px;
  border-top: 1px solid var(--divider);
  font-size: 10.5px;
  color: var(--muted);
}

.quick-pop-enter-active,
.quick-pop-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
  transform-origin: bottom right;
}

.quick-pop-enter-from,
.quick-pop-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}

@media (max-width: 760px) {
  .quick-fab svg {
    width: 20px;
    height: 20px;
  }
}
</style>
