<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { QuoteBar } from '@/types'
import { loadQuoteSeries } from '@/services/stock-data'
import { forecastBars } from '@/analysis/forecast'
import { useCompareStore, MAX_COMPARE, MIN_COMPARE } from '@/stores/compare'
import { useWatchlistStore } from '@/stores/watchlist'
import LineChart from '@/components/LineChart.vue'
import type { LineSeries } from '@/components/line-chart.types'

const compare = useCompareStore()
const watchlist = useWatchlistStore()
compare.init()
watchlist.init()

const COLORS = ['#4d9fff', '#f5b544', '#b07cff', '#e5484d', '#0f9960', '#f97316']

interface StockResult {
  symbol: string
  name: string
  bars: QuoteBar[]
  error: string
  sourceName: string
}

interface CompareRow {
  symbol: string
  name: string
  error: string
  latest: number | null
  changePct: number | null
  avgVolume: number | null
  forecastUp: number | null
  coverage: number
  missing: boolean
  sourceName: string
}

const results = ref<StockResult[]>([])
const loading = ref(false)
const manual = ref('')
const addError = ref('')

const symbols = computed(() => compare.symbols)
const loaded = computed(() => results.value.filter((item) => item.bars.length > 0))
const sourceNames = computed(() => {
  const map = new Map(watchlist.items.map((item) => [item.symbol, item.name]))
  for (const item of results.value) map.set(item.symbol, item.name)
  return map
})

function nameOf(symbol: string): string {
  return sourceNames.value.get(symbol) ?? symbol
}

/** Common trading days across every stock that loaded successfully. */
const commonDates = computed(() => {
  if (loaded.value.length === 0) return []
  const sets = loaded.value.map((item) => new Set(item.bars.map((bar) => bar.date)))
  const reference = loaded.value[0]!.bars.map((bar) => bar.date)
  return reference.filter((date) => sets.every((set) => set.has(date))).slice(-120)
})

const chartSeries = computed<LineSeries[]>(() => {
  const dates = commonDates.value
  if (dates.length < 2) return []
  return loaded.value.map((item, index) => {
    const byDate = new Map(item.bars.map((bar) => [bar.date, bar.close]))
    const base = byDate.get(dates[0]!) ?? 0
    return {
      id: item.symbol,
      name: nameOf(item.symbol),
      color: COLORS[index % COLORS.length]!,
      points: dates.map((date) => {
        const value = byDate.get(date)
        return {
          label: date,
          value: value !== undefined && base > 0 ? (value / base) * 100 : null,
        }
      }),
    }
  })
})

const rows = computed<CompareRow[]>(() => {
  const dates = commonDates.value
  const firstDate = dates[0]
  const lastDate = dates.at(-1)
  return results.value.map((item) => {
    if (item.bars.length === 0 || !firstDate || !lastDate) {
      return {
        symbol: item.symbol,
        name: nameOf(item.symbol),
        error: item.error || '无可用日 K 数据',
        latest: null,
        changePct: null,
        avgVolume: null,
        forecastUp: null,
        coverage: 0,
        missing: true,
        sourceName: item.sourceName,
      }
    }
    const byDate = new Map(item.bars.map((bar) => [bar.date, bar]))
    const first = byDate.get(firstDate)
    const last = byDate.get(lastDate)
    const covered = item.bars.filter((bar) => dates.includes(bar.date))
    const coverage = dates.length > 0 ? Math.round((covered.length / dates.length) * 100) : 0
    const forecast = forecastBars(item.bars)
    return {
      symbol: item.symbol,
      name: nameOf(item.symbol),
      error: '',
      latest: last?.close ?? null,
      changePct: first && last && first.close > 0 ? (last.close / first.close - 1) * 100 : null,
      avgVolume:
        covered.length > 0 ? covered.reduce((sum, bar) => sum + bar.volume, 0) / covered.length : null,
      forecastUp: forecast.status === 'ok' ? (forecast.horizons.find((item) => item.days === 5)?.upProbability ?? null) : null,
      coverage,
      missing: covered.length < dates.length || first === undefined || last === undefined,
      sourceName: item.sourceName,
    }
  })
})

async function load(): Promise<void> {
  if (symbols.value.length === 0) {
    results.value = []
    return
  }
  loading.value = true
  const settled = await Promise.allSettled(
    symbols.value.map(async (symbol) => {
      const quote = await loadQuoteSeries(symbol)
      return {
        symbol,
        name: quote.snapshot.name,
        bars: quote.snapshot.bars,
        error: '',
        sourceName: quote.sourceName,
      } satisfies StockResult
    }),
  )
  results.value = settled.map((result, index) => {
    const symbol = symbols.value[index]!
    if (result.status === 'fulfilled') return result.value
    return {
      symbol,
      name: nameOf(symbol),
      bars: [],
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      sourceName: '',
    }
  })
  loading.value = false
}

function addManual(): void {
  addError.value = ''
  const value = manual.value.trim()
  if (!/^\d{6}$/.test(value)) {
    addError.value = '请输入 6 位股票代码'
    return
  }
  if (compare.has(value)) {
    addError.value = '该股票已在对比列表中'
    return
  }
  if (!compare.canAdd) {
    addError.value = `最多同时对比 ${MAX_COMPARE} 只`
    return
  }
  compare.toggle(value)
  manual.value = ''
}

function formatVolume(value: number | null): string {
  if (value === null) return '—'
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(2)} 亿`
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)} 万`
  return value.toFixed(0)
}

onMounted(load)
watch(symbols, load, { deep: true })
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h1>多股对比</h1>
        <p>2~6 只股票按共同交易日对齐，首日归一化为 100，对比区间涨跌与量能。</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-ghost" :disabled="compare.count === 0" @click="compare.clear()">清空</button>
      </div>
    </header>

    <div class="card">
      <header class="card-head">
        <h2>选择股票 <span class="muted">{{ compare.count }} / {{ MAX_COMPARE }}</span></h2>
      </header>
      <div class="picker">
        <button
          v-for="item in watchlist.items"
          :key="item.symbol"
          class="pick-chip"
          :class="{ selected: compare.has(item.symbol) }"
          @click="compare.toggle(item.symbol)"
        >
          {{ item.name }} <span class="muted">{{ item.symbol }}</span>
        </button>
        <span v-if="watchlist.items.length === 0" class="muted">自选池为空，可直接输入代码添加。</span>
      </div>
      <div class="manual-row">
        <input
          v-model.trim="manual"
          type="text"
          maxlength="6"
          placeholder="输入 6 位代码，如 600519"
          @keyup.enter="addManual"
        />
        <button class="btn btn-mini" @click="addManual">加入对比</button>
        <span v-if="addError" class="inline-warn">{{ addError }}</span>
        <span v-if="compare.notice" class="inline-warn">{{ compare.notice }}</span>
      </div>
      <p v-if="compare.count < MIN_COMPARE" class="hint-text">
        至少选择 {{ MIN_COMPARE }} 只股票才能进行对比；也可在个股详情页点击「加入对比」。
      </p>
    </div>

    <p v-if="loading" class="hint-text">正在加载 {{ compare.count }} 只股票的行情…</p>

    <template v-if="compare.count >= MIN_COMPARE && !loading">
      <div class="card">
        <header class="card-head">
          <h2>归一化走势（首日 = 100）</h2>
          <span class="tag">
            {{ commonDates.length > 0 ? `共同交易日 ${commonDates.length} 个` : '无共同交易日' }}
          </span>
        </header>
        <LineChart
          :series="chartSeries"
          aria-label="多股归一化走势对比图"
          value-suffix=""
        />
        <p class="hint-text">
          <template v-if="commonDates.length >= 2">
            对齐区间 {{ commonDates[0] }} → {{ commonDates.at(-1) }}；缺失交易日的股票在表格中标注为数据缺失。
          </template>
          <template v-else>
            所选股票没有足够的共同交易日，无法绘制归一化曲线；请查看下方表格中的缺失原因。
          </template>
        </p>
      </div>

      <div class="card">
        <header class="card-head">
          <h2>同期指标对比</h2>
        </header>
        <div class="table-wrap">
          <table class="compare-table">
            <thead>
              <tr>
                <th>股票</th>
                <th>最新价</th>
                <th>区间涨跌</th>
                <th>5 日方向概率</th>
                <th>日均量能</th>
                <th>数据覆盖</th>
                <th>来源</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.symbol" :class="{ 'row-missing': row.missing }">
                <td>
                  <RouterLink :to="`/stock/${row.symbol}`">{{ row.name }}</RouterLink>
                  <span class="muted code">{{ row.symbol }}</span>
                </td>
                <td>{{ row.latest !== null ? row.latest.toFixed(2) : '—' }}</td>
                <td v-if="row.changePct !== null" :class="row.changePct >= 0 ? 'up' : 'down'">
                  {{ row.changePct >= 0 ? '+' : '' }}{{ row.changePct.toFixed(2) }}%
                </td>
                <td v-else class="missing">数据缺失</td>
                <td>{{ row.forecastUp !== null ? `${(row.forecastUp * 100).toFixed(1)}%` : '样本不足' }}</td>
                <td>{{ formatVolume(row.avgVolume) }}</td>
                <td>
                  <span v-if="row.error" class="missing">{{ row.error }}</span>
                  <span v-else>{{ row.coverage }}%</span>
                </td>
                <td>{{ row.sourceName || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="hint-text">
          区间涨跌基于共同交易日的首尾收盘价；5 日方向概率来自独立统计模块（walk-forward 误差见个股详情页）。
          预测不构成投资建议。
        </p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.pick-chip {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 999px;
  padding: 8px 14px;
  min-height: 44px;
  font-size: 13px;
  cursor: pointer;
  color: inherit;
}

.pick-chip.selected {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
}

.manual-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.manual-row input {
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  max-width: 220px;
}

.table-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.compare-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.compare-table th,
.compare-table td {
  text-align: left;
  padding: 10px 8px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.compare-table th {
  color: #64748b;
}

.row-missing {
  background: #fffbf2;
}

.code {
  margin-left: 6px;
  font-size: 11px;
}

.up {
  color: #c0392b;
}

.down {
  color: #0f8a55;
}

.missing {
  color: #b45309;
}

@media (max-width: 720px) {
  .compare-table th,
  .compare-table td {
    padding: 8px 6px;
    font-size: 12px;
  }
}
</style>
