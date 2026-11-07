<script setup lang="ts">
import { computed } from 'vue'
import type { LineSeries } from './line-chart.types'

const props = withDefaults(
  defineProps<{
    series: LineSeries[]
    height?: number
    valueSuffix?: string
    ariaLabel?: string
  }>(),
  { height: 340, valueSuffix: '', ariaLabel: '折线对比图' },
)

const WIDTH = 900
const PAD_X = 48
const PAD_TOP = 18
const PAD_BOTTOM = 34

/** Union of labels, keeping first-seen order; every series is re-indexed on it. */
const labels = computed(() => {
  const seen: string[] = []
  for (const item of props.series) {
    for (const point of item.points) {
      if (!seen.includes(point.label)) seen.push(point.label)
    }
  }
  return seen
})

const layout = computed(() => {
  const values = props.series.flatMap((item) => item.points.map((point) => point.value)).filter(
    (value): value is number => value !== null && Number.isFinite(value),
  )
  if (values.length === 0 || labels.value.length === 0) {
    return { paths: [], ticks: [], min: 0, max: 0, xOf: () => 0, yOf: () => 0 }
  }
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const span = rawMax - rawMin || Math.abs(rawMax) || 1
  const min = rawMin - span * 0.08
  const max = rawMax + span * 0.08
  const plotWidth = WIDTH - PAD_X * 2
  const plotHeight = props.height - PAD_TOP - PAD_BOTTOM
  const xOf = (index: number): number =>
    PAD_X + (labels.value.length === 1 ? plotWidth / 2 : (index / (labels.value.length - 1)) * plotWidth)
  const yOf = (value: number): number => PAD_TOP + ((max - value) / (max - min)) * plotHeight

  const paths = props.series.map((item) => {
    const byLabel = new Map(item.points.map((point) => [point.label, point.value]))
    const segments: string[] = []
    let current: string[] = []
    labels.value.forEach((label, index) => {
      const value = byLabel.get(label)
      if (value === null || value === undefined || !Number.isFinite(value)) {
        if (current.length > 1) segments.push(current.join(' '))
        current = []
        return
      }
      current.push(`${xOf(index).toFixed(1)},${yOf(value).toFixed(1)}`)
    })
    if (current.length > 1) segments.push(current.join(' '))
    // A single point cannot form a polyline; emit a zero-length segment marker.
    const last = item.points.at(-1)
    const lastIndex = last ? labels.value.indexOf(last.label) : -1
    const lastValue = last?.value
    return {
      id: item.id,
      name: item.name,
      color: item.color,
      segments,
      last:
        lastValue !== null && lastValue !== undefined && lastIndex >= 0
          ? { x: xOf(lastIndex), y: yOf(lastValue), value: lastValue, label: last!.label }
          : null,
    }
  })

  const tickCount = 4
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const value = min + ((max - min) * index) / tickCount
    return { value, y: yOf(value) }
  })

  return { paths, ticks, min, max, xOf, yOf }
})

const firstLabel = computed(() => labels.value[0] ?? '')
const lastLabel = computed(() => labels.value.at(-1) ?? '')

function formatTick(value: number): string {
  return `${value.toFixed(1)}${props.valueSuffix}`
}

function formatValue(value: number): string {
  return `${value.toFixed(2)}${props.valueSuffix}`
}
</script>

<template>
  <figure class="line-chart">
    <svg
      v-if="layout.paths.length > 0"
      :viewBox="`0 0 ${WIDTH} ${height}`"
      role="img"
      :aria-label="ariaLabel"
    >
      <line
        v-for="tick in layout.ticks"
        :key="`tick-${tick.value}`"
        :x1="PAD_X"
        :x2="WIDTH - PAD_X"
        :y1="tick.y"
        :y2="tick.y"
        class="grid"
      />
      <text
        v-for="tick in layout.ticks"
        :key="`label-${tick.value}`"
        :x="PAD_X - 6"
        :y="tick.y + 4"
        text-anchor="end"
        class="axis"
      >
        {{ formatTick(tick.value) }}
      </text>

      <g v-for="item in layout.paths" :key="item.id">
        <polyline
          v-for="(segment, index) in item.segments"
          :key="`${item.id}-${index}`"
          :points="segment"
          :stroke="item.color"
          class="series"
        />
        <circle v-if="item.last" :cx="item.last.x" :cy="item.last.y" r="3.5" :fill="item.color">
          <title>{{ item.name }} {{ formatValue(item.last.value) }} · {{ item.last.label }}</title>
        </circle>
      </g>

      <text :x="PAD_X" :y="height - 8" class="axis">{{ firstLabel }}</text>
      <text :x="WIDTH - PAD_X" :y="height - 8" text-anchor="end" class="axis">{{ lastLabel }}</text>
    </svg>
    <p v-else class="line-empty">暂无可绘制的对比数据</p>

    <figcaption class="legend">
      <span v-for="item in layout.paths" :key="item.id" class="legend-item">
        <i class="dot" :style="{ background: item.color }" />
        {{ item.name }}
      </span>
    </figcaption>
  </figure>
</template>

<style scoped>
.line-chart {
  margin: 0;
}

.line-chart svg {
  width: 100%;
  height: auto;
  display: block;
  background: var(--surface-2);
  border-radius: 10px;
}

.grid {
  stroke: var(--border);
  stroke-width: 1;
}

.series {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
}

.axis {
  fill: var(--muted);
  font-size: 11px;
}

.line-empty {
  color: var(--muted);
  font-size: 13px;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
</style>
