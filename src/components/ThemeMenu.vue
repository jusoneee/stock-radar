<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { THEMES, useThemeStore, type ThemeMode } from '@/stores/theme'

const theme = useThemeStore()
const open = ref(false)

const resolvedIsDark = computed(() => theme.resolved === 'midnight' || theme.resolved === 'dark')

function toggle(): void {
  open.value = !open.value
}

function close(): void {
  open.value = false
}

function pick(mode: ThemeMode): void {
  theme.setMode(mode)
  close()
}

function onPointerDown(event: Event): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('.theme-menu')) return
  close()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) close()
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="theme-menu" @click.stop>
    <button
      class="theme-trigger"
      type="button"
      :aria-expanded="open"
      aria-label="切换主题"
      :title="theme.isSystem ? `主题：跟随系统（${theme.resolvedLabel}）` : `主题：${theme.currentLabel}`"
      @click="toggle"
    >
      <svg v-if="resolvedIsDark" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 14.4A8.2 8.2 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4z" />
      </svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.6v2.4M12 19v2.4M2.6 12H5M19 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" />
      </svg>
    </button>

    <div v-if="open" class="theme-pop" role="dialog" aria-label="主题选择">
      <header class="pop-head">
        <strong>主题</strong>
        <span>选择后立即生效，保存在本机</span>
      </header>

      <button
        class="theme-option"
        type="button"
        :class="{ 'is-active': theme.mode === 'system' }"
        :aria-pressed="theme.mode === 'system'"
        @click="pick('system')"
      >
        <span class="swatch swatch-system" aria-hidden="true">
          <i class="half-light" />
          <i class="half-dark" />
        </span>
        <span class="option-copy">
          <b>跟随系统</b>
          <small>当前 {{ theme.resolvedLabel }}</small>
        </span>
        <span v-if="theme.mode === 'system'" class="check" aria-hidden="true">✓</span>
      </button>

      <button
        v-for="item in THEMES"
        :key="item.id"
        class="theme-option"
        type="button"
        :class="{ 'is-active': theme.mode === item.id }"
        :aria-pressed="theme.mode === item.id"
        @click="pick(item.id)"
      >
        <span class="swatch" aria-hidden="true">
          <i v-for="color in item.swatches" :key="color" :style="{ background: color }" />
        </span>
        <span class="option-copy">
          <b>{{ item.label }}</b>
          <small>{{ item.hint }}</small>
        </span>
        <span v-if="theme.mode === item.id" class="check" aria-hidden="true">✓</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.theme-menu {
  position: relative;
  flex: none;
}

.theme-trigger {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-2);
  color: var(--text-soft);
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
}

.theme-trigger:hover {
  border-color: var(--accent-border);
  color: var(--accent);
  background: var(--surface-3);
}

.theme-trigger svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.theme-pop {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 56;
  width: 248px;
  padding: 10px 10px 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}

.pop-head {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 6px 8px;
  border-bottom: 1px solid var(--divider);
}

.pop-head strong {
  font-size: 12.5px;
}

.pop-head span {
  color: var(--muted);
  font-size: 10px;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 6px;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.theme-option:hover {
  background: var(--surface-2);
}

.theme-option.is-active {
  background: var(--accent-soft);
}

.swatch {
  display: flex;
  flex: none;
  width: 32px;
  height: 22px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.swatch i {
  flex: 1;
  height: 100%;
}

.swatch-system .half-light {
  background: #f5f7fb;
}

.swatch-system .half-dark {
  background: #0a0c10;
}

.option-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.option-copy b {
  font-size: 12px;
  font-weight: 600;
}

.option-copy small {
  color: var(--muted);
  font-size: 9.5px;
}

.check {
  flex: none;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
}

@media (max-width: 640px) {
  .theme-trigger {
    width: 30px;
    height: 30px;
  }

  .theme-pop {
    width: min(248px, calc(100vw - 28px));
  }
}
</style>
