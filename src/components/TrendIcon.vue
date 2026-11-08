<script setup lang="ts">
type TrendState = 'up' | 'down' | 'flat'

defineProps<{ state: TrendState }>()
</script>

<template>
  <svg class="trend-icon" :class="`is-${state}`" viewBox="0 0 16 16" aria-hidden="true">
    <g v-if="state === 'up'">
      <path d="M2.5 11.5L6.5 7.5L9.5 10.5L13.5 4.5" />
      <path d="M10 4.5H13.5V8" />
    </g>
    <g v-else-if="state === 'down'">
      <path d="M2.5 4.5L6.5 8.5L9.5 5.5L13.5 11.5" />
      <path d="M10 11.5H13.5V8" />
    </g>
    <path v-else d="M2.5 8H13.5" stroke-dasharray="3 2" />
  </svg>
</template>

<style scoped>
.trend-icon {
  width: 14px;
  height: 14px;
  display: inline-block;
  vertical-align: -2px;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.trend-icon.is-up {
  color: var(--up);
}

.trend-icon.is-down {
  color: var(--down);
}

.trend-icon.is-flat {
  color: var(--muted);
}
</style>
