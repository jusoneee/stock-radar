<script setup lang="ts">
import { computed } from 'vue'

type IconName = 'overview' | 'watchlist' | 'analysis' | 'compare' | 'settings'

const props = defineProps<{ name: IconName }>()

const icons: Record<IconName, { paths: string[]; circles: Array<{ cx: number; cy: number; r: number }> }> = {
  overview: {
    paths: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
    circles: [],
  },
  watchlist: {
    paths: ['M12 3.6l2.6 5.3 5.8.9-4.2 4.1 1 5.7-5.2-2.7-5.2 2.7 1-5.7-4.2-4.1 5.8-.9z'],
    circles: [],
  },
  analysis: {
    paths: ['M4 19h16', 'M7 19V9', 'M12 19V5', 'M17 19v-6'],
    circles: [],
  },
  compare: {
    paths: ['M4 19h16', 'M5 15l4-6 4 3 5-8'],
    circles: [],
  },
  settings: {
    paths: ['M4 8h16', 'M4 16h16'],
    circles: [
      { cx: 9, cy: 8, r: 2.2 },
      { cx: 15, cy: 16, r: 2.2 },
    ],
  },
}

const icon = computed(() => icons[props.name])
</script>

<template>
  <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path v-for="path in icon.paths" :key="path" :d="path" />
    <circle v-for="circle in icon.circles" :key="`${circle.cx}-${circle.cy}`" :cx="circle.cx" :cy="circle.cy" :r="circle.r" />
  </svg>
</template>
