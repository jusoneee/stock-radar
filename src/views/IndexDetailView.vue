<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUniverseStore } from '@/stores/universe'
import type { UniverseStock } from '@/types'
import { fetchMarketIndices, MARKET_INDEX_DEFINITIONS, type MarketIndex } from '@/lib/market-indices'
import { formatAmount, formatPercent, formatPrice } from '@/lib/format'
import ConstituentList from '@/components/ConstituentList.vue'
import EmptyState from '@/components/EmptyState.vue'
import BackButton from '@/components/BackButton.vue'

const route = useRoute()
const router = useRouter()
const universe = useUniverseStore()

const code = computed(() => String(route.params.code ?? '').trim())
const definition = computed(() => MARKET_INDEX_DEFINITIONS.find((item) => item.code === code.value))

const quote = ref<MarketIndex | null>(null)
const quoteError = ref(false)

async function loadQuote(): Promise<void> {
  try {
    const list = await fetchMarketIndices()
    quote.value = list.find((item) => item.code === code.value) ?? null
    quoteError.value = !quote.value
  } catch {
    quoteError.value = true
  }
}

/**
 * Eastmoney's public quote list exposed by this project has no index-constituent
 * endpoint, so the list below is an explicit approximation built from the cached
 * full-market snapshot (exchange / code segment / market-cap ranking).
 */
const approximation = computed(() => {
  switch (code.value) {
    case '000001':
      return { note: '沪市全部 A 股（按交易所近似）', filter: (stock: UniverseStock) => stock.market === 'SH' }
    case '399001':
      return { note: '深市全部 A 股（按交易所近似）', filter: (stock: UniverseStock) => stock.market === 'SZ' }
    case '399006':
      return {
        note: '深市 300 开头个股（按代码段近似）',
        filter: (stock: UniverseStock) => stock.market === 'SZ' && stock.symbol.startsWith('3'),
      }
    case '000688':
      return {
        note: '沪市 688 开头个股（按代码段近似）',
        filter: (stock: UniverseStock) => stock.market === 'SH' && stock.symbol.startsWith('688'),
      }
    default:
      return null
  }
})

const byMarketCap = computed(() =>
  [...universe.items]
    .filter((stock) => stock.marketCap !== undefined && Number.isFinite(stock.marketCap))
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)),
)

const constituents = computed<UniverseStock[]>(() => {
  if (approximation.value) return universe.items.filter(approximation.value.filter)
  const cap = byMarketCap.value
  switch (code.value) {
    case '000300':
      return cap.slice(0, 300)
    case '000016':
      return cap.filter((stock) => stock.market === 'SH').slice(0, 50)
    case '000905':
      return cap.slice(300, 800)
    case '000852':
      return cap.slice(800, 1800)
    case '899050':
      return cap.filter((stock) => stock.market === 'BJ').slice(0, 50)
    default:
      return []
  }
})

const basisNote = computed(() => {
  if (approximation.value) return approximation.value.note
  switch (code.value) {
    case '000300':
      return '全市场总市值前 300 只（按市值近似）'
    case '000016':
      return '沪市总市值前 50 只（按市值近似）'
    case '000905':
      return '全市场市值排名 301–800 只（按市值近似）'
    case '000852':
      return '全市场市值排名 801–1800 只（按市值近似）'
    case '899050':
      return '北交所总市值前 50 只（按市值近似）'
    default:
      return '暂无匹配规则'
  }
})

const breadth = computed(() => {
  let up = 0
  let down = 0
  let sum = 0
  let counted = 0
  for (const stock of constituents.value) {
    const pct = stock.pctChange
    if (pct === undefined || !Number.isFinite(pct)) continue
    if (pct > 0) up += 1
    else if (pct < 0) down += 1
    sum += pct
    counted += 1
  }
  return { up, down, avg: counted > 0 ? sum / counted : Number.NaN }
})

function toneOf(value: number): string {
  if (!Number.isFinite(value) || value === 0) return 'is-flat'
  return value > 0 ? 'is-up' : 'is-down'
}

function openStock(stock: UniverseStock): void {
  void router.push({
    path: `/stock/${stock.symbol}`,
    query: { from: 'index', index: code.value },
  })
}

onMounted(() => {
  void loadQuote()
  if (universe.count === 0 && !universe.isLoading) void universe.ensureLoaded()
})
</script>

<template>
  <section class="page index-detail">
    <header class="page-head detail-head">
      <div class="detail-title-row">
        <BackButton />
        <div>
          <h1>
            {{ definition?.name ?? '未知指数' }}
            <span class="muted detail-code">{{ code }}</span>
          </h1>
          <p>
            指数 {{ formatPrice(quote?.price ?? Number.NaN) }} ·
            <span :class="toneOf(quote?.pctChange ?? Number.NaN)">
              {{ formatPercent(quote?.pctChange ?? Number.NaN) }}
            </span>
            <span v-if="quoteError || !quote" class="muted">指数行情暂不可用</span>
          </p>
        </div>
      </div>
      <span v-if="quote?.turnover" class="tag">成交额 {{ formatAmount(quote.turnover) }}</span>
    </header>

    <div class="card">
      <header class="card-head">
        <div>
          <h2>成分股列表</h2>
          <p class="detail-meta">
            {{ constituents.length }} 只 · 上涨 {{ breadth.up }} · 下跌 {{ breadth.down }} ·
            平均涨跌
            <b :class="toneOf(breadth.avg)">{{ formatPercent(breadth.avg) }}</b>
          </p>
        </div>
      </header>

      <p class="detail-notice">
        说明：现有数据源只提供指数点位与分时，没有官方成分股接口；这里的列表是<b>替代方案</b>——{{ basisNote }}。
        因此与实际指数成分、权重存在差异，仅用于快速查看对应范围个股行情。
      </p>

      <div v-if="universe.isLoading" class="detail-loading">
        <span class="detail-spinner" aria-hidden="true" />
        正在同步全市场列表 {{ universe.progress.loaded }} / {{ universe.progress.total || '—' }}
      </div>
      <EmptyState
        v-else-if="!universe.count"
        title="还没有全市场数据"
        description="成分股替代列表需要先同步一次全市场行情。"
        compact
      >
        <button class="btn btn-primary" type="button" @click="universe.ensureLoaded(true)">
          加载全市场列表
        </button>
      </EmptyState>
      <ConstituentList
        v-else
        :stocks="constituents"
        :search-placeholder="`在 ${definition?.name ?? code} 中搜索代码 / 名称`"
        @open="openStock"
      />
    </div>
  </section>
</template>

<style scoped>
.index-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-head {
  align-items: flex-start;
  padding-bottom: 0;
  gap: 10px;
}

.detail-title-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

@media (max-width: 640px) {
  .detail-head {
    flex-wrap: wrap;
  }

  .detail-title-row {
    width: 100%;
  }
}

.detail-code {
  font-size: 12px;
  font-weight: 400;
}

.detail-head p {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--text-soft);
}

.detail-head .is-up {
  color: var(--up);
}

.detail-head .is-down {
  color: var(--down);
}

.detail-head .is-flat {
  color: var(--muted);
}

.detail-meta {
  margin: 3px 0 0;
  font-size: 11px;
  color: var(--muted);
}

.detail-meta b {
  font-weight: 600;
}

.detail-meta b.is-up {
  color: var(--up);
}

.detail-meta b.is-down {
  color: var(--down);
}

.detail-meta b.is-flat {
  color: var(--muted);
}

.detail-notice {
  margin: 0 0 10px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-soft);
  font-size: 11.5px;
  line-height: 1.7;
}

.detail-notice b {
  color: var(--accent);
  font-weight: 600;
}

.detail-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 8px;
  color: var(--muted);
  font-size: 12px;
}

.detail-spinner {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  border-top-color: var(--accent);
  animation: detailSpin 0.8s linear infinite;
}

@keyframes detailSpin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .detail-spinner {
    animation: none;
  }
}
</style>
