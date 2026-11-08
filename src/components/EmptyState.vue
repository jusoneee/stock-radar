<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  compact?: boolean
}>()
</script>

<template>
  <div class="empty-state" :class="{ compact }">
    <svg class="empty-art" viewBox="0 0 160 116" aria-hidden="true">
      <defs>
        <linearGradient id="empty-glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.22" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.04" />
        </linearGradient>
      </defs>
      <circle cx="80" cy="58" r="46" fill="url(#empty-glow)" />
      <rect x="30" y="72" width="16" height="20" rx="3" fill="none" stroke="var(--border-strong)" />
      <rect x="52" y="60" width="16" height="32" rx="3" fill="none" stroke="var(--border-strong)" />
      <rect x="74" y="48" width="16" height="44" rx="3" fill="none" stroke="var(--border-strong)" />
      <path d="M30 40L48 32L66 38L84 24L102 30" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" />
      <circle cx="110" cy="66" r="19" fill="none" stroke="var(--accent)" stroke-width="2" />
      <path d="M124 80L136 92" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" />
      <circle cx="110" cy="66" r="12" fill="none" stroke="var(--border-strong)" stroke-dasharray="4 3" />
    </svg>
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <div v-if="$slots.default" class="empty-actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 28px 16px 30px;
}

.empty-art {
  width: 160px;
  max-width: 60%;
  height: auto;
  margin-bottom: 10px;
}

.empty-state h3 {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
}

.empty-state p {
  margin: 0;
  max-width: 460px;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.65;
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
}

.empty-state.compact .empty-art {
  width: 112px;
}

.empty-state.compact {
  padding: 18px 12px 20px;
}
</style>
