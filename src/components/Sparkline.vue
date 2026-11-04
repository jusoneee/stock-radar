<script setup lang="ts">
import { computed } from 'vue'
import type { QuoteBar } from '@/types'

const props = withDefaults(defineProps<{ bars: QuoteBar[]; width?: number; height?: number }>(), {
  width: 96,
  height: 30,
})

const recent = computed(() => props.bars.slice(-20))

const points = computed(() => {
  const bars = recent.value
  if (bars.length < 2) return ''
  const closes = bars.map((bar) => bar.close)
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const span = max - min || 1
  return bars
    .map((bar, index) => {
      const x = (index / (bars.length - 1)) * props.width
      const y = props.height - ((bar.close - min) / span) * props.height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})

const tone = computed(() => {
  const bars = recent.value
  if (bars.length < 2) return 'flat'
  return bars[bars.length - 1]!.close >= bars[0]!.close ? 'up' : 'down'
})
</script>

<template>
  <svg class="sparkline" :class="tone" :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`">
    <polyline v-if="points" :points="points" fill="none" stroke="currentColor" stroke-width="1.6" />
    <line v-else x1="0" :y1="height / 2" :x2="width" :y2="height / 2" stroke="currentColor" stroke-dasharray="3 3" />
  </svg>
</template>
