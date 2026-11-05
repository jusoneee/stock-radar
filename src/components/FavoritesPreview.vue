<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { NewsAnalysis, QuoteBar } from '@/types'
import { loadQuoteSeries, loadStockNews } from '@/services/stock-data'
import { forecastBars } from '@/analysis/forecast'
import { formatPercent, formatPrice } from '@/lib/format'
import Sparkline from '@/components/Sparkline.vue'

interface PreviewItem {
  symbol: string
  name: string
  bars: QuoteBar[]
  sourceName: string
  error: string
  news: NewsAnalysis[]
  newsFailed: string[]
}

const props = defineProps<{
  symbols: string[]
  names: Record<string, string>
}>()

const items = ref<PreviewItem[]>([])
const loading = ref(false)
const failed = ref(false)

const canPreview = computed(() => props.symbols.length >= 2 && props.symbols.length <= 6)

function summarize(bars: QuoteBar[]): { last: number | null; change20: number | null; volume20: number | null } {
  if (bars.length === 0) return { last: null, change20: null, volume20: null }
  const recent = bars.slice(-20)
  const first = recent[0]!
  const last = recent.at(-1)!
  return {
    last: last.close,
    change20: first.close > 0 ? (last.close / first.close - 1) * 100 : null,
    volume20: recent.reduce((sum, bar) => sum + bar.volume, 0) / recent.length,
  }
}

async function load(): Promise<void> {
  if (!canPreview.value) {
    items.value = []
    return
  }
  loading.value = true
  failed.value = false
  const settled = await Promise.allSettled(
    props.symbols.map(async (symbol) => {
      const quote = await loadQuoteSeries(symbol)
      const news = await loadStockNews(symbol, quote.snapshot.name || props.names[symbol] || symbol)
      return {
        symbol,
        name: quote.snapshot.name || props.names[symbol] || symbol,
        bars: quote.snapshot.bars,
        sourceName: quote.sourceName,
        error: '',
        news: news.items,
        newsFailed: news.failed,
      } satisfies PreviewItem
    }),
  )
  items.value = settled.map((result, index) => {
    const symbol = props.symbols[index]!
    if (result.status === 'fulfilled') return result.value
    return {
      symbol,
      name: props.names[symbol] ?? symbol,
      bars: [],
      sourceName: '',
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      news: [],
      newsFailed: [],
    }
  })
  failed.value = items.value.every((item) => item.error !== '')
  loading.value = false
}

function forecastOf(bars: QuoteBar[]): string {
  const forecast = forecastBars(bars)
  if (forecast.status !== 'ok') return '样本不足，未输出预测'
  const five = forecast.horizons.find((item) => item.days === 5)
  const validation = forecast.validation.find((item) => item.days === 5)
  if (!five) return '—'
  const mapeText = validation && validation.windows > 0 ? `5 日 MAPE ${validation.mape.toFixed(2)}%` : '5 日误差样本不足'
  return `5 日方向概率 ${(five.upProbability * 100).toFixed(1)}%，${mapeText}`
}

function formatVolume(value: number | null): string {
  if (value === null) return '—'
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(2)} 亿`
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)} 万`
  return value.toFixed(0)
}

watch(() => props.symbols, load, { deep: true, immediate: true })
</script>

<template>
  <section class="preview">
    <header class="preview-head">
      <h2>收藏多选预览 <span class="muted">{{ symbols.length }} / 6</span></h2>
      <RouterLink v-if="symbols.length >= 2" to="/compare" class="btn btn-mini">打开对比页</RouterLink>
    </header>

    <p v-if="symbols.length < 2" class="hint-text">在自选卡片上勾选 2~6 只「对比 / 预览」，即可并列查看小图、预测摘要、关键指标与新闻摘要。</p>
    <p v-else-if="loading" class="hint-text">正在加载 {{ symbols.length }} 只股票的预览数据…</p>

    <div v-else class="preview-grid">
      <article v-for="item in items" :key="item.symbol" class="preview-card">
        <div class="preview-title">
          <RouterLink :to="`/stock/${item.symbol}`">{{ item.name }}</RouterLink>
          <span class="muted">{{ item.symbol }}</span>
        </div>

        <template v-if="item.bars.length > 0">
          <div class="preview-chart-row">
            <Sparkline :bars="item.bars" :width="150" :height="44" />
            <div class="preview-price">
              <strong>{{ formatPrice(summarize(item.bars).last ?? 0) }}</strong>
              <span :class="(summarize(item.bars).change20 ?? 0) >= 0 ? 'text-up' : 'text-down'">
                {{ formatPercent(summarize(item.bars).change20 ?? 0) }} / 20 日
              </span>
            </div>
          </div>

          <ul class="preview-metrics">
            <li>20 日均量 {{ formatVolume(summarize(item.bars).volume20) }}</li>
            <li>{{ forecastOf(item.bars) }}</li>
            <li class="muted">数据源 {{ item.sourceName }}</li>
          </ul>

          <div class="preview-news">
            <h3>新闻摘要</h3>
            <p v-if="item.news.length === 0" class="muted">暂无相关资讯</p>
            <ul v-else>
              <li v-for="newsItem in item.news.slice(0, 2)" :key="newsItem.newsId">
                {{ newsItem.title }}
              </li>
            </ul>
            <p v-if="item.newsFailed.length" class="source-fail">部分源失败：{{ item.newsFailed.join('；') }}</p>
          </div>
        </template>
        <p v-else class="inline-warn">预览失败：{{ item.error }}</p>
      </article>
    </div>

    <div v-if="failed" class="empty-actions">
      <button class="btn btn-mini" @click="load">重试加载预览</button>
    </div>
  </section>
</template>

<style scoped>
.preview {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  background: var(--surface);
}

.preview-head {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
  align-items: center;
}

.preview-head h2 {
  margin: 0;
  font-size: 16px;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.preview-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  min-width: 0;
}

.preview-title {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
}

.preview-chart-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 8px 0;
}

.preview-price {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.preview-price strong {
  font-size: 16px;
}

.preview-metrics {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
  line-height: 1.5;
}

.preview-news {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
  font-size: 12px;
  line-height: 1.5;
}

.preview-news h3 {
  margin: 0 0 4px;
  font-size: 12px;
  color: #64748b;
}

.preview-news ul {
  margin: 0;
  padding-left: 16px;
}

.preview-news li {
  margin-bottom: 3px;
}

.source-fail {
  color: #b42318;
  margin: 4px 0 0;
}

.empty-actions {
  margin-top: 10px;
}
</style>
