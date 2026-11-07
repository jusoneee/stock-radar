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
import { formatAmount, formatPercent, formatPrice } from '@/lib/format'

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
  missingDays: number
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
  const dateSet = new Set(dates)
  const firstDate = dates[0]
  const lastDate = dates.at(-1)
  return results.value.map((item) => {
    if (item.bars.length === 0 || !firstDate || !lastDate) {
      return {
        symbol: item.symbol,
        name: nameOf(item.symbol),
        error: item.bars.length === 0 ? item.error || '无可用日 K 数据' : '所选区间内无共同交易日',
        latest: null,
        changePct: null,
        avgVolume: null,
        forecastUp: null,
        coverage: 0,
        missingDays: dates.length,
        missing: true,
        sourceName: item.sourceName,
      }
    }
    const byDate = new Map(item.bars.map((bar) => [bar.date, bar]))
    const first = byDate.get(firstDate)
    const last = byDate.get(lastDate)
    const covered = item.bars.filter((bar) => dateSet.has(bar.date))
    const coverage = dates.length > 0 ? Math.round((covered.length / dates.length) * 100) : 0
    const missingDays = dates.length - covered.length
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
      missingDays,
      missing: missingDays > 0 || first === undefined || last === undefined,
      sourceName: item.sourceName,
    }
  })
})

/** Stocks that failed to load entirely (missing only some dates is not an error). */
const failedRows = computed(() => rows.value.filter((row) => row.error !== ''))

/** Plain-text summary so the chart is readable without seeing the graphic. */
const chartSummary = computed(() =>
  rows.value
    .filter((row) => row.changePct !== null)
    .map((row) => `${row.name} ${row.changePct! >= 0 ? '+' : ''}${row.changePct!.toFixed(2)}%`)
    .join('；'),
)

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

onMounted(load)
watch(symbols, load, { deep: true })
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h1>对比</h1>
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
        至少选择 {{ MIN_COMPARE }} 只股票才能对比；也可在自选或个股详情页加入对比。
      </p>
    </div>

    <p v-if="loading" class="hint-text">正在加载 {{ compare.count }} 只股票的行情…</p>
    <p v-if="failedRows.length" class="hint-text">
      部分标的加载失败：{{ failedRows.map((row) => row.name || row.symbol).join('、') }}
      <button class="btn btn-mini" :disabled="loading" @click="load">重试</button>
    </p>

    <div v-if="compare.count < MIN_COMPARE" class="card empty-state compact">
      <h3>选择至少 2 只股票</h3>
      <p>从上方自选列表或自选页添加标的，选满 2 只后自动加载对比走势。</p>
    </div>

    <template v-else-if="!loading">
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
        <p v-if="chartSummary" class="hint-text">文字摘要：{{ chartSummary }}</p>
        <p v-if="commonDates.length >= 2" class="hint-text">
          对齐区间 {{ commonDates[0] }} → {{ commonDates.at(-1) }}；缺失交易日的股票在表格中标注。
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
                  <RouterLink :to="`/stock/${row.symbol}?from=compare`">{{ row.name }}</RouterLink>
                  <span class="muted code">{{ row.symbol }}</span>
                </td>
                <td>{{ row.latest !== null ? formatPrice(row.latest) : '—' }}</td>
                <td v-if="row.changePct !== null" :class="row.changePct >= 0 ? 'up' : 'down'">
                  {{ formatPercent(row.changePct) }}
                </td>
                <td v-else class="missing">数据缺失</td>
                <td>{{ row.forecastUp !== null ? `${(row.forecastUp * 100).toFixed(1)}%` : '样本不足' }}</td>
                <td>{{ row.avgVolume !== null ? formatAmount(row.avgVolume) : '—' }}</td>
                <td>
                  <span v-if="row.error" class="missing">{{ row.error }}</span>
                  <span v-else :class="{ missing: row.missingDays > 0 }">
                    {{ row.coverage }}%<template v-if="row.missingDays > 0">（缺 {{ row.missingDays }} 日）</template>
                  </span>
                </td>
                <td>{{ row.sourceName || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <details class="section-collapse">
        <summary>对齐与预测口径</summary>
        <div class="collapse-body">
          <p class="hint-text">
            取所有已加载股票的共同交易日（最近 120 个），首日收盘价归一化为 100；区间涨跌与日均量能基于同一组交易日，
            方向概率基于该股自身完整日 K。缺失交易日不做插值，停牌、上市时间不足或数据源缺日都会表现为缺失。
          </p>
          <p class="hint-text">5 日方向概率来自独立统计模块，误差验证见个股详情页；预测不构成投资建议。</p>
        </div>
      </details>
    </template>
  </section>
</template>

<style scoped>
.picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.pick-chip {
  border: 1px solid var(--border);
  background: var(--surface-2);
  border-radius: 999px;
  padding: 6px 12px;
  min-height: 34px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-soft);
}

.pick-chip:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.pick-chip.selected {
  border-color: var(--accent-border);
  background: var(--accent-soft);
  color: var(--text);
}

.manual-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.manual-row input {
  min-height: 34px;
  max-width: 220px;
}

.compare-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.compare-table th,
.compare-table td {
  text-align: left;
  padding: 9px 8px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.compare-table th {
  color: var(--muted);
  font-weight: 500;
  font-size: 11px;
}

.row-missing {
  background: rgba(217, 161, 59, 0.05);
}

.code {
  margin-left: 6px;
  font-size: 11px;
}

.up {
  color: var(--up);
}

.down {
  color: var(--down);
}

.missing {
  color: var(--warn);
}

@media (max-width: 760px) {
  .pick-chip,
  .manual-row input {
    min-height: 44px;
  }

  .compare-table th,
  .compare-table td {
    padding: 8px 6px;
    font-size: 12px;
  }
}
</style>
