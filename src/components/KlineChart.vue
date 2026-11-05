<script setup lang="ts">
import { computed } from 'vue'
import type { QuoteBar } from '@/types'
import { formatPrice } from '@/lib/format'

const props = withDefaults(
  defineProps<{
    bars: QuoteBar[]
    /** Number of most recent candles to draw. */
    count?: number
  }>(),
  { count: 60 },
)

const WIDTH = 720
const HEIGHT = 320
const PAD_X = 10
const PRICE_TOP = 12
const PRICE_HEIGHT = 196
const VOL_TOP = 224
const VOL_HEIGHT = 68

interface Candle {
  x: number
  openY: number
  closeY: number
  highY: number
  lowY: number
  width: number
  up: boolean
  volumeHeight: number
  volumeY: number
  date: string
  close: number
}

const visible = computed(() => props.bars.slice(-props.count))

function movingAverage(values: number[], period: number): Array<number | null> {
  const result: Array<number | null> = []
  let sum = 0
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index]!
    if (index >= period) sum -= values[index - period]!
    result.push(index >= period - 1 ? sum / period : null)
  }
  return result
}

const maData = computed(() => {
  const closes = props.bars.map((bar) => bar.close)
  const length = visible.value.length
  const tail = (period: number): Array<number | null> =>
    movingAverage(closes, period).slice(-length)
  return { ma5: tail(5), ma10: tail(10), ma20: tail(20) }
})

const layout = computed(() => {
  const bars = visible.value
  if (bars.length === 0) return { candles: [], linePoints: { ma5: '', ma10: '', ma20: '' }, min: 0, max: 0, dates: [] }

  const maValues = [...maData.value.ma5, ...maData.value.ma10, ...maData.value.ma20].filter(
    (value): value is number => value !== null,
  )
  const lows = bars.map((bar) => bar.low)
  const highs = bars.map((bar) => bar.high)
  const min = Math.min(...lows, ...maValues)
  const max = Math.max(...highs, ...maValues)
  const span = max - min || 1
  const slot = (WIDTH - PAD_X * 2) / bars.length
  const candleWidth = Math.max(2, Math.min(10, slot * 0.62))
  const maxVolume = Math.max(...bars.map((bar) => bar.volume), 1)

  const priceY = (value: number): number => PRICE_TOP + ((max - value) / span) * PRICE_HEIGHT
  const candles: Candle[] = bars.map((bar, index) => {
    const center = PAD_X + slot * index + slot / 2
    const volumeHeight = (bar.volume / maxVolume) * VOL_HEIGHT
    return {
      x: center - candleWidth / 2,
      openY: priceY(bar.open),
      closeY: priceY(bar.close),
      highY: priceY(bar.high),
      lowY: priceY(bar.low),
      width: candleWidth,
      up: bar.close >= bar.open,
      volumeHeight,
      volumeY: VOL_TOP + (VOL_HEIGHT - volumeHeight),
      date: bar.date,
      close: bar.close,
    }
  })

  const lineFor = (series: Array<number | null>): string => {
    const points: string[] = []
    series.forEach((value, index) => {
      if (value === null) return
      const center = PAD_X + slot * index + slot / 2
      points.push(`${center.toFixed(1)},${priceY(value).toFixed(1)}`)
    })
    return points.join(' ')
  }

  return {
    candles,
    linePoints: {
      ma5: lineFor(maData.value.ma5),
      ma10: lineFor(maData.value.ma10),
      ma20: lineFor(maData.value.ma20),
    },
    min,
    max,
    dates: [bars[0]?.date ?? '', bars[bars.length - 1]?.date ?? ''],
  }
})
</script>

<template>
  <figure class="kline">
    <svg
      v-if="layout.candles.length > 0"
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      role="img"
      :aria-label="`日 K 线图，共 ${layout.candles.length} 根，区间 ${formatPrice(layout.min)} 至 ${formatPrice(layout.max)}`"
    >
      <line :x1="PAD_X" :x2="WIDTH - PAD_X" :y1="PRICE_TOP" :y2="PRICE_TOP" class="grid" />
      <line :x1="PAD_X" :x2="WIDTH - PAD_X" :y1="PRICE_TOP + PRICE_HEIGHT" :y2="PRICE_TOP + PRICE_HEIGHT" class="grid" />
      <line :x1="PAD_X" :x2="WIDTH - PAD_X" :y1="VOL_TOP" :y2="VOL_TOP" class="grid" />

      <g v-for="(candle, index) in layout.candles" :key="`${candle.date}-${index}`">
        <rect
          :x="candle.x"
          :y="candle.volumeY"
          :width="candle.width"
          :height="Math.max(1, candle.volumeHeight)"
          :class="candle.up ? 'vol-up' : 'vol-down'"
        />
        <line :x1="candle.x + candle.width / 2" :x2="candle.x + candle.width / 2" :y1="candle.highY" :y2="candle.lowY" :class="candle.up ? 'wick-up' : 'wick-down'" />
        <rect
          :x="candle.x"
          :y="Math.min(candle.openY, candle.closeY)"
          :width="candle.width"
          :height="Math.max(1, Math.abs(candle.closeY - candle.openY))"
          :class="candle.up ? 'body-up' : 'body-down'"
        />
      </g>

      <polyline v-if="layout.linePoints.ma5" :points="layout.linePoints.ma5" class="ma ma5" />
      <polyline v-if="layout.linePoints.ma10" :points="layout.linePoints.ma10" class="ma ma10" />
      <polyline v-if="layout.linePoints.ma20" :points="layout.linePoints.ma20" class="ma ma20" />

      <text :x="PAD_X" :y="PRICE_TOP + 10" class="axis-label">{{ formatPrice(layout.max) }}</text>
      <text :x="PAD_X" :y="PRICE_TOP + PRICE_HEIGHT - 4" class="axis-label">{{ formatPrice(layout.min) }}</text>
      <text :x="PAD_X" :y="HEIGHT - 6" class="axis-label">{{ layout.dates[0] }}</text>
      <text :x="WIDTH - PAD_X" :y="HEIGHT - 6" class="axis-label" text-anchor="end">{{ layout.dates[1] }}</text>
    </svg>
    <p v-else class="kline-empty">暂无可绘制的日 K 数据</p>
    <figcaption class="kline-legend">
      <span class="legend ma5">MA5</span>
      <span class="legend ma10">MA10</span>
      <span class="legend ma20">MA20</span>
      <span class="legend">红涨绿跌 · 前复权日线 · 最近 {{ layout.candles.length }} 根</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.kline {
  margin: 0;
}
.kline svg {
  width: 100%;
  height: auto;
  display: block;
  background: #0f1420;
  border-radius: 10px;
}
.grid {
  stroke: #263043;
  stroke-width: 1;
}
.body-up,
.wick-up,
.vol-up {
  fill: #e5484d;
  stroke: #e5484d;
}
.body-down,
.wick-down,
.vol-down {
  fill: #0f9960;
  stroke: #0f9960;
}
.wick-up,
.wick-down {
  stroke-width: 1;
}
.vol-up,
.vol-down {
  opacity: 0.35;
}
.ma {
  fill: none;
  stroke-width: 1.4;
}
.ma5 {
  stroke: #f5b544;
}
.ma10 {
  stroke: #4d9fff;
}
.ma20 {
  stroke: #b07cff;
}
.axis-label {
  fill: #7c889e;
  font-size: 11px;
}
.kline-empty {
  color: #7c889e;
  font-size: 13px;
}
.kline-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 6px;
  font-size: 12px;
  color: #7c889e;
}
.legend.ma5 {
  color: #f5b544;
}
.legend.ma10 {
  color: #4d9fff;
}
.legend.ma20 {
  color: #b07cff;
}
</style>
