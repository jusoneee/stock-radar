<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

/**
 * Unified back entry for every non-tab page.
 * Uses browser history so the target is always the page the user came from
 * (and stays consistent with the browser's own back button); direct visits
 * without in-app history fall back to the dashboard.
 */
function goBack(): void {
  const state = window.history.state as { back?: string | null } | null
  if (state?.back) void router.back()
  else void router.push('/')
}
</script>

<template>
  <button class="back-button" type="button" aria-label="返回上一页" @click="goBack">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
    <span>返回</span>
  </button>
</template>

<style scoped>
.back-button {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  padding: 0 14px 0 9px;
  border: 1px solid var(--accent-border);
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.back-button:hover {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}

.back-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.back-button svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
}
</style>
