<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ChartBar } from '@/types'
import { formatAmount, formatPercent, formatPrice } from '@/lib/format'

const props = withDefaults(
  defineProps<{
    bars: ChartBar[]
    /** Candles for K periods, a close-price line for intraday periods. */
    mode?: 'candle' | 'line'
    /** Previous close baseline (分时 only). */
    baseline?: number | null
    periodLabel?: string
    loading?: boolean
  }>(),
  { mode: 'candle', baseline: null, periodLabel: '', loading: false },
)

const HEIGHT = 340
const PAD_L = 12
const PAD_R = 58
const PRICE_TOP = 14
const PRICE_H = 198
const VOL_TOP = 234
const VOL_H = 56
const MIN_BARS = 12

const wrapRef = ref<HTMLDivElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const width = ref(800)
let observer: ResizeObserver | null = null

onMounted(() => {
  const element = wrapRef.value
  if (!element) return
  width.value = Math.max(280, Math.round(element.clientWidth))
  observer = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (entry) width.value = Math.max(280, Math.round(entry.contentRect.width))
  })
  observer.observe(element)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  cancelTouch()
  clearFade()
})

const vbW = computed(() => Math.max(280, Math.round(width.value)))
const plotW = computed(() => Math.max(80, vbW.value - PAD_L - PAD_R))

const count = ref(1)
const start = ref(0)
const hoverIndex = ref<number | null>(null)

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function resetView(): void {
  const total = props.bars.length
  const visibleCount = props.mode === 'line' ? total : Math.min(total, 120)
  count.value = Math.max(1, visibleCount)
  start.value = Math.max(0, total - count.value)
  hoverIndex.value = null
}

watch(() => props.bars, resetView, { immediate: true })
watch(() => props.mode, resetView)

const startIndex = computed(() => {
  const total = props.bars.length
  return clamp(start.value, 0, Math.max(0, total - 1))
})
const visible = computed(() => props.bars.slice(startIndex.value, startIndex.value + count.value))
const zoomed = computed(() => count.value < props.bars.length || startIndex.value > 0)

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

const fullMa = computed(() => {
  const closes = props.bars.map((bar) => bar.close)
  return { ma5: movingAverage(closes, 5), ma10: movingAverage(closes, 10), ma20: movingAverage(closes, 20) }
})

interface CandleShape {
  key: string
  label: string
  center: number
  bodyX: number
  bodyY: number
  bodyW: number
  bodyH: number
  wickY1: number
  wickY2: number
  up: boolean
  volumeY: number
  volumeH: number
  volumeX: number
  volumeW: number
  closeY: number
  close: number
}

const layout = computed(() => {
  const data = visible.value
  const total = data.length
  if (total === 0) {
    return {
      candles: [] as CandleShape[],
      linePoints: '',
      maLines: { ma5: '', ma10: '', ma20: '' },
      ticks: [] as Array<{ value: number; y: number }>,
      xLabels: [] as Array<{ x: number; text: string; anchor: string }>,
      baselineY: null as number | null,
      volumeLabelY: VOL_TOP,
      volumeMax: 0,
      centerOf: (_index: number) => 0,
      priceY: (_value: number) => 0,
      min: 0,
      max: 0,
      slot: 0,
    }
  }

  const offset = startIndex.value
  const ma5 = fullMa.value.ma5.slice(offset, offset + total)
  const ma10 = fullMa.value.ma10.slice(offset, offset + total)
  const ma20 = fullMa.value.ma20.slice(offset, offset + total)
  const maValues = [ma5, ma10, ma20]
    .flat()
    .filter((value): value is number => value !== null && Number.isFinite(value))

  const candidates: number[] = []
  for (const bar of data) {
    if (props.mode === 'candle') {
      candidates.push(bar.open, bar.high, bar.low, bar.close)
    } else {
      candidates.push(bar.close)
    }
  }
  if (props.mode === 'candle') candidates.push(...maValues)
  if (props.baseline !== null && Number.isFinite(props.baseline)) candidates.push(props.baseline)

  const rawMin = Math.min(...candidates)
  const rawMax = Math.max(...candidates)
  const rawSpan = rawMax - rawMin || Math.abs(rawMax) * 0.01 || 1
  const min = rawMin - rawSpan * 0.05
  const max = rawMax + rawSpan * 0.05
  const slot = plotW.value / total
  const candleW = Math.max(1.4, Math.min(11, slot * 0.62))
  const volumeMax = Math.max(...data.map((bar) => bar.volume), 1)

  const priceY = (value: number): number => PRICE_TOP + ((max - value) / (max - min)) * PRICE_H
  const centerOf = (index: number): number => PAD_L + slot * index + slot / 2

  const candles: CandleShape[] = data.map((bar, index) => {
    const previous = index > 0 ? data[index - 1]! : props.bars[offset - 1]
    const up =
      props.mode === 'candle'
        ? bar.close >= bar.open
        : bar.close >= (previous ? previous.close : (props.baseline ?? bar.close))
    const volumeH = Math.max(1, (bar.volume / volumeMax) * VOL_H)
    return {
      key: `${bar.label}-${index}`,
      label: bar.label,
      center: centerOf(index),
      bodyX: centerOf(index) - candleW / 2,
      bodyY: Math.min(priceY(bar.open), priceY(bar.close)),
      bodyW: candleW,
      bodyH: Math.max(1, Math.abs(priceY(bar.close) - priceY(bar.open))),
      wickY1: priceY(bar.high),
      wickY2: priceY(bar.low),
      up,
      volumeY: VOL_TOP + (VOL_H - volumeH),
      volumeH,
      volumeX: centerOf(index) - Math.max(0.6, candleW) / 2,
      volumeW: Math.max(0.6, candleW),
      closeY: priceY(bar.close),
      close: bar.close,
    }
  })

  const linePoints =
    props.mode === 'line'
      ? data.map((bar, index) => `${centerOf(index).toFixed(1)},${priceY(bar.close).toFixed(1)}`).join(' ')
      : ''

  const maLine = (series: Array<number | null>): string =>
    series
      .map((value, index) => (value === null ? null : `${centerOf(index).toFixed(1)},${priceY(value).toFixed(1)}`))
      .filter((point): point is string => point !== null)
      .join(' ')

  const tickCount = 4
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const value = max - ((max - min) * index) / tickCount
    return { value, y: PRICE_TOP + (PRICE_H * index) / tickCount }
  })

  const labelCount = plotW.value >= 520 ? 4 : 2
  const xLabels: Array<{ x: number; text: string; anchor: string }> = []
  for (let index = 0; index < labelCount; index += 1) {
    const dataIndex = Math.round(((total - 1) * index) / (labelCount - 1))
    const anchor = index === 0 ? 'start' : index === labelCount - 1 ? 'end' : 'middle'
    xLabels.push({ x: centerOf(dataIndex), text: data[dataIndex]?.label ?? '', anchor })
  }

  return {
    candles,
    linePoints,
    maLines: { ma5: maLine(ma5), ma10: maLine(ma10), ma20: maLine(ma20) },
    ticks,
    xLabels,
    baselineY:
      props.baseline !== null && Number.isFinite(props.baseline) ? priceY(props.baseline) : null,
    volumeLabelY: VOL_TOP + 10,
    volumeMax,
    centerOf,
    priceY,
    min: rawMin,
    max: rawMax,
    slot,
  }
})

const hoverBar = computed(() => {
  if (hoverIndex.value === null) return null
  return visible.value[hoverIndex.value] ?? null
})

const hover = computed(() => {
  const bar = hoverBar.value
  if (!bar || hoverIndex.value === null) return null
  const globalIndex = startIndex.value + hoverIndex.value
  const previous = globalIndex > 0 ? props.bars[globalIndex - 1] : undefined
  const reference = previous?.close ?? props.baseline ?? null
  const changePct = reference && reference > 0 ? (bar.close / reference - 1) * 100 : null
  const x = layout.value.centerOf(hoverIndex.value)
  return {
    label: bar.label,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    changePct,
    x,
    y: layout.value.priceY(bar.close),
    flip: x > vbW.value * 0.66,
    left: `${(x / vbW.value) * 100}%`,
  }
})

let dragState: { startX: number; startIndex: number } | null = null
let touchTimer: number | null = null
let touchOrigin: { x: number; y: number } | null = null
let touchActive = false
let fadeTimer: number | null = null
const tipFading = ref(false)

const maxStart = computed(() => Math.max(0, props.bars.length - count.value))
const minCount = computed(() => Math.min(MIN_BARS, props.bars.length))
const canZoomIn = computed(() => count.value > minCount.value)
const canZoomOut = computed(() => count.value < props.bars.length)
const canPanForward = computed(() => startIndex.value > 0)
const canPanBack = computed(() => startIndex.value < maxStart.value)

function clearFade(): void {
  if (fadeTimer !== null) {
    window.clearTimeout(fadeTimer)
    fadeTimer = null
  }
  tipFading.value = false
}

function indexFromClientX(clientX: number): number {
  const rect = svgRef.value?.getBoundingClientRect()
  if (!rect || rect.width === 0) return 0
  const ratio = (clientX - rect.left) / rect.width
  const plotRatio = (ratio * vbW.value - PAD_L) / plotW.value
  const index = Math.floor(plotRatio * visible.value.length)
  return clamp(index, 0, Math.max(0, visible.value.length - 1))
}

function zoomAt(factor: number, anchorIndex?: number): void {
  const total = props.bars.length
  if (total <= MIN_BARS) return
  const nextCount = clamp(Math.round(count.value * factor), minCount.value, total)
  if (nextCount === count.value) return
  const anchor = anchorIndex ?? Math.round((count.value - 1) / 2)
  const ratio = count.value > 1 ? clamp(anchor / (count.value - 1), 0, 1) : 0.5
  const anchorGlobal = startIndex.value + anchor
  count.value = nextCount
  start.value = clamp(Math.round(anchorGlobal - ratio * (nextCount - 1)), 0, total - nextCount)
  hoverIndex.value = clamp(anchor, 0, nextCount - 1)
}

function zoomIn(): void {
  clearFade()
  zoomAt(0.75)
}

function zoomOut(): void {
  clearFade()
  zoomAt(1.35)
}

function panStep(): number {
  return Math.max(3, Math.round(count.value * 0.5))
}

function panForward(): void {
  if (!canPanForward.value) return
  clearFade()
  start.value = clamp(startIndex.value - panStep(), 0, maxStart.value)
  hoverIndex.value = null
}

function panBack(): void {
  if (!canPanBack.value) return
  clearFade()
  start.value = clamp(startIndex.value + panStep(), 0, maxStart.value)
  hoverIndex.value = null
}

function resetChart(): void {
  clearFade()
  resetView()
}

function onPointerDown(event: PointerEvent): void {
  if (event.pointerType !== 'mouse' || event.button !== 0) return
  clearFade()
  dragState = { startX: event.clientX, startIndex: startIndex.value }
  hoverIndex.value = indexFromClientX(event.clientX)
}

function onPointerMove(event: PointerEvent): void {
  if (event.pointerType !== 'mouse') return
  clearFade()
  if (dragState) {
    const rect = svgRef.value?.getBoundingClientRect()
    if (!rect) return
    const pxPerBar = (rect.width * plotW.value) / (vbW.value * Math.max(1, visible.value.length))
    const next = dragState.startIndex - Math.round((event.clientX - dragState.startX) / pxPerBar)
    start.value = clamp(next, 0, maxStart.value)
    return
  }
  hoverIndex.value = indexFromClientX(event.clientX)
}

function onPointerUp(): void {
  dragState = null
}

function onPointerLeave(): void {
  if (dragState || touchActive) return
  hoverIndex.value = null
}

function onWheel(event: WheelEvent): void {
  if (props.bars.length <= MIN_BARS) return
  event.preventDefault()
  clearFade()
  zoomAt(event.deltaY > 0 ? 1.35 : 0.74, indexFromClientX(event.clientX))
}

function cancelTouch(): void {
  if (touchTimer !== null) {
    window.clearTimeout(touchTimer)
    touchTimer = null
  }
  touchActive = false
  touchOrigin = null
}

function onTouchStart(event: TouchEvent): void {
  if (event.touches.length !== 1) {
    cancelTouch()
    return
  }
  clearFade()
  const touch = event.touches[0]!
  touchOrigin = { x: touch.clientX, y: touch.clientY }
  touchActive = false
  if (touchTimer !== null) window.clearTimeout(touchTimer)
  // Long press first, then the crosshair follows the finger; a normal swipe
  // cancels the timer so page scrolling still works.
  touchTimer = window.setTimeout(() => {
    touchTimer = null
    if (!touchOrigin) return
    touchActive = true
    hoverIndex.value = indexFromClientX(touchOrigin.x)
  }, 320)
}

function onTouchMove(event: TouchEvent): void {
  if (!touchOrigin) return
  const touch = event.touches[0]
  if (!touch) return
  if (!touchActive) {
    const dx = touch.clientX - touchOrigin.x
    const dy = touch.clientY - touchOrigin.y
    if (Math.hypot(dx, dy) > 12) cancelTouch()
    return
  }
  event.preventDefault()
  hoverIndex.value = indexFromClientX(touch.clientX)
}

function onTouchEnd(): void {
  if (touchTimer !== null) {
    window.clearTimeout(touchTimer)
    touchTimer = null
  }
  const wasActive = touchActive
  touchActive = false
  touchOrigin = null
  if (!wasActive) return
  // Keep the reading visible for a moment, then fade it out.
  clearFade()
  fadeTimer = window.setTimeout(() => {
    tipFading.value = true
    fadeTimer = window.setTimeout(() => {
      hoverIndex.value = null
      tipFading.value = false
      fadeTimer = null
    }, 450)
  }, 2000)
}

const ariaLabel = computed(
  () => `${props.periodLabel || '行情'}图，共 ${props.bars.length} 根，区间 ${formatPrice(layout.value.min)} 至 ${formatPrice(layout.value.max)}`,
)
</script>

<template>
  <figure class="kline">
    <div class="kline-tools" role="toolbar" aria-label="图表操作">
      <button type="button" class="tool" :disabled="!canZoomIn" title="放大：显示更少 K 线" @click="zoomIn">放大</button>
      <button type="button" class="tool" :disabled="!canZoomOut" title="缩小：显示更多 K 线" @click="zoomOut">缩小</button>
      <button type="button" class="tool" :disabled="!canPanForward" title="向前：查看更早的数据" @click="panForward">← 向前</button>
      <button type="button" class="tool" :disabled="!canPanBack" title="向后：回到更近的数据" @click="panBack">向后 →</button>
      <button type="button" class="tool tool-reset" :disabled="!zoomed" title="恢复默认显示范围" @click="resetChart">重置</button>
      <span class="tool-hint">显示 {{ visible.length }} / {{ bars.length }} 根</span>
    </div>
    <div ref="wrapRef" class="kline-wrap">
      <svg
        v-if="layout.candles.length > 0"
        ref="svgRef"
        :viewBox="`0 0 ${vbW} ${HEIGHT}`"
        role="img"
        :aria-label="ariaLabel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="onPointerLeave"
        @wheel="onWheel"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
        @touchcancel="onTouchEnd"
      >
        <line
          v-for="tick in layout.ticks"
          :key="`grid-${tick.y}`"
          :x1="PAD_L"
          :x2="vbW - PAD_R"
          :y1="tick.y"
          :y2="tick.y"
          class="grid"
        />
        <text
          v-for="tick in layout.ticks"
          :key="`tick-${tick.y}`"
          :x="vbW - PAD_R + 6"
          :y="tick.y + 4"
          class="axis-label"
        >
          {{ formatPrice(tick.value) }}
        </text>

        <line :x1="PAD_L" :x2="vbW - PAD_R" :y1="VOL_TOP" :y2="VOL_TOP" class="grid" />
        <line :x1="PAD_L" :x2="vbW - PAD_R" :y1="VOL_TOP + VOL_H" :y2="VOL_TOP + VOL_H" class="grid" />
        <text :x="vbW - PAD_R + 6" :y="layout.volumeLabelY" class="axis-label">
          {{ formatAmount(layout.volumeMax) }}
        </text>

        <line
          v-if="layout.baselineY !== null"
          :x1="PAD_L"
          :x2="vbW - PAD_R"
          :y1="layout.baselineY"
          :y2="layout.baselineY"
          class="baseline"
        />

        <g v-for="candle in layout.candles" :key="candle.key">
          <rect
            :x="candle.volumeX"
            :y="candle.volumeY"
            :width="candle.volumeW"
            :height="candle.volumeH"
            :class="candle.up ? 'vol-up' : 'vol-down'"
          />
          <template v-if="mode === 'candle'">
            <line
              :x1="candle.center"
              :x2="candle.center"
              :y1="candle.wickY1"
              :y2="candle.wickY2"
              :class="candle.up ? 'wick-up' : 'wick-down'"
            />
            <rect
              :x="candle.bodyX"
              :y="candle.bodyY"
              :width="candle.bodyW"
              :height="candle.bodyH"
              :class="candle.up ? 'body-up' : 'body-down'"
            />
          </template>
        </g>

        <polyline v-if="mode === 'line' && layout.linePoints" :points="layout.linePoints" class="price-line" />
        <template v-if="mode === 'candle'">
          <polyline v-if="layout.maLines.ma5" :points="layout.maLines.ma5" class="ma ma5" />
          <polyline v-if="layout.maLines.ma10" :points="layout.maLines.ma10" class="ma ma10" />
          <polyline v-if="layout.maLines.ma20" :points="layout.maLines.ma20" class="ma ma20" />
        </template>

        <text
          v-for="label in layout.xLabels"
          :key="`x-${label.text}-${label.x}`"
          :x="label.x"
          :y="VOL_TOP + VOL_H + 18"
          :text-anchor="label.anchor"
          class="axis-label"
        >
          {{ label.text }}
        </text>

        <g v-if="hover" class="crosshair-group" :class="{ fading: tipFading }">
          <line :x1="hover.x" :x2="hover.x" :y1="PRICE_TOP" :y2="VOL_TOP + VOL_H" class="crosshair" />
          <circle :cx="hover.x" :cy="hover.y" r="3" class="crosshair-dot" />
        </g>
      </svg>
      <p v-else class="kline-empty">{{ loading ? '正在加载行情…' : '暂无该周期数据' }}</p>
      <p v-if="loading && layout.candles.length > 0" class="kline-loading">加载中…</p>

      <div v-if="hover" class="kline-tip" :class="{ flip: hover.flip, fading: tipFading }" :style="{ left: hover.left }">
        <p class="tip-head">
          {{ hover.label }}
          <span v-if="hover.changePct !== null" :class="hover.changePct >= 0 ? 'tone-up' : 'tone-down'">
            {{ formatPercent(hover.changePct) }}
          </span>
        </p>
        <dl class="tip-grid">
          <template v-if="mode === 'candle'">
            <dt>开</dt><dd>{{ formatPrice(hover.open) }}</dd>
            <dt>高</dt><dd class="tone-up">{{ formatPrice(hover.high) }}</dd>
            <dt>低</dt><dd class="tone-down">{{ formatPrice(hover.low) }}</dd>
            <dt>收</dt><dd>{{ formatPrice(hover.close) }}</dd>
          </template>
          <template v-else>
            <dt>价格</dt><dd>{{ formatPrice(hover.close) }}</dd>
          </template>
          <dt>量</dt><dd>{{ formatAmount(hover.volume) }} 手</dd>
        </dl>
      </div>
    </div>

    <figcaption class="kline-legend">
      <template v-if="mode === 'candle'">
        <span class="legend ma5">MA5</span>
        <span class="legend ma10">MA10</span>
        <span class="legend ma20">MA20</span>
      </template>
      <span v-else class="legend price">价格走势</span>
      <span v-if="baseline !== null" class="legend baseline-legend">虚线为昨收</span>
      <span class="legend">{{ periodLabel || 'K 线' }} · {{ visible.length }} 根 · 副图为成交量</span>
      <span class="legend tip-hint">滚轮缩放 · 拖拽平移 · 悬停/长按查看</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.kline {
  margin: 0;
  min-width: 0;
}

.kline-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

.tool {
  min-height: 26px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text-soft);
  font-size: 11.5px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.08s ease;
}

.tool:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border-strong);
}

.tool:active:not(:disabled) {
  transform: translateY(1px);
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: var(--text);
}

.tool:disabled {
  opacity: 0.4;
  background: transparent;
  cursor: not-allowed;
}

.tool-reset {
  margin-left: 2px;
}

.tool-hint {
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.kline-wrap {
  position: relative;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.kline svg {
  width: 100%;
  height: 340px;
  display: block;
  background: var(--surface-2);
  border-radius: 10px;
  touch-action: pan-y;
  user-select: none;
}

@media (max-width: 640px) {
  .kline svg {
    height: 280px;
  }

  .tool {
    min-height: 32px;
    padding: 0 10px;
    font-size: 12px;
  }
}

.grid {
  stroke: var(--border);
  stroke-width: 1;
}

.baseline {
  stroke: var(--muted);
  stroke-width: 1;
  stroke-dasharray: 4 4;
  opacity: 0.7;
}

.body-up,
.wick-up,
.vol-up {
  fill: var(--up);
  stroke: var(--up);
}

.body-down,
.wick-down,
.vol-down {
  fill: var(--down);
  stroke: var(--down);
}

.wick-up,
.wick-down {
  stroke-width: 1;
}

.vol-up,
.vol-down {
  opacity: 0.35;
}

.price-line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 1.6;
  stroke-linejoin: round;
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
  fill: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.crosshair {
  stroke: var(--border-strong);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.crosshair-dot {
  fill: var(--accent);
}

.crosshair-group {
  transition: opacity 0.35s ease;
}

.crosshair-group.fading {
  opacity: 0;
}

.kline-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  background: var(--surface-2);
  border-radius: 10px;
}

.kline-loading {
  position: absolute;
  top: 8px;
  left: 10px;
  margin: 0;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--surface);
  color: var(--muted);
  font-size: 11px;
}

.kline-tip {
  position: absolute;
  top: 8px;
  transform: translateX(10px);
  min-width: 128px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-pop);
  pointer-events: none;
  font-size: 11.5px;
  z-index: var(--z-page-pop, 40);
  transition: opacity 0.35s ease;
}

.kline-tip.fading {
  opacity: 0;
}

.kline-tip.flip {
  transform: translateX(calc(-100% - 10px));
}

.tip-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin: 0 0 4px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.tip-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 10px;
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.tip-grid dt {
  color: var(--muted);
}

.tip-grid dd {
  margin: 0;
  text-align: right;
}

.tone-up {
  color: var(--up);
}

.tone-down {
  color: var(--down);
}

.kline-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--muted);
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

.legend.price {
  color: var(--accent);
}


</style>
