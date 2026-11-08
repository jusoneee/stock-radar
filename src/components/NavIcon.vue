<script setup lang="ts">
import { computed } from 'vue'

type IconName =
  | 'overview'
  | 'watchlist'
  | 'analysis'
  | 'compare'
  | 'settings'
  | 'terms'
  | 'privacy'
  | 'sources'
  | 'screener'
  | 'sector'
  | 'more'

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
  terms: {
    paths: ['M6 3h8l4 4v14H6z', 'M9 10h6', 'M9 14h6', 'M9 18h4'],
    circles: [],
  },
  privacy: {
    paths: ['M12 3l7 3v6c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V6z', 'M9.5 12l1.8 1.8 3.4-3.6'],
    circles: [],
  },
  sources: {
    paths: ['M4 8c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 8v8c0 1.7 3.6 3 8 3s8-1.3 8-3V8'],
    circles: [],
  },
  screener: {
    paths: ['M4 5h16l-6 7v6l-4 2v-8z'],
    circles: [],
  },
  sector: {
    paths: ['M4 6h16', 'M4 12h11', 'M4 18h6'],
    circles: [],
  },
  more: {
    paths: [],
    circles: [
      { cx: 6, cy: 12, r: 1.8 },
      { cx: 12, cy: 12, r: 1.8 },
      { cx: 18, cy: 12, r: 1.8 },
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
