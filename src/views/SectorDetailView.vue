<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUniverseStore } from '@/stores/universe'
import type { UniverseStock } from '@/types'
import { computeSectorStats } from '@/lib/sector-stats'
import { formatDateTime, formatPercent } from '@/lib/format'
import ConstituentList from '@/components/ConstituentList.vue'
import EmptyState from '@/components/EmptyState.vue'
import BackButton from '@/components/BackButton.vue'

const route = useRoute()
const router = useRouter()
const universe = useUniverseStore()

const sectorName = computed(() => String(route.params.name ?? '').trim())

const stocks = computed<UniverseStock[]>(() =>
  universe.items.filter((stock) => (stock.sector ?? '').trim() === sectorName.value),
)

const stat = computed(() =>
  computeSectorStats(universe.items).find((item) => item.name === sectorName.value),
)

const freshness = computed(() =>
  universe.fetchedAt ? `全市场列表 ${formatDateTime(universe.fetchedAt)} 更新` : '全市场列表尚未加载',
)

function toneOf(value: number): string {
  if (!Number.isFinite(value) || value === 0) return 'is-flat'
  return value > 0 ? 'is-up' : 'is-down'
}

function openStock(stock: UniverseStock): void {
  void router.push({
    path: `/stock/${stock.symbol}`,
    query: { from: 'sector', sector: sectorName.value },
  })
}

onMounted(() => {
  if (universe.count === 0 && !universe.isLoading) void universe.ensureLoaded()
})
</script>

<template>
  <section class="page sector-detail">
    <header class="page-head detail-head">
      <div class="detail-title-row">
        <BackButton />
        <div>
          <h1>{{ sectorName || '未知行业' }}</h1>
          <p>
            {{ stocks.length }} 只成分股
            <template v-if="stat">
              · 上涨 {{ stat.up }} · 下跌 {{ stat.down }} · 平均涨跌
              <b :class="toneOf(stat.avg)">{{ formatPercent(stat.avg) }}</b>
            </template>
          </p>
        </div>
      </div>
      <RouterLink
        :to="{ path: '/sectors', query: { from: 'sector', sector: sectorName } }"
        class="btn btn-mini"
      >全部行业排行</RouterLink>
    </header>

    <div class="card">
      <header class="card-head">
        <div>
          <h2>全部股票</h2>
          <p class="detail-meta">点击任意一行进入个股详情，返回可回到本页。</p>
        </div>
      </header>

      <p class="detail-notice">
        口径：行业取自东财全市场列表的板块字段（每只股票一个行业），因此这里是该行业字段下的全部股票；
        平均涨跌幅为等权平均，剔除缺失涨跌幅的标的。该分类不参与个股评分。
      </p>

      <div v-if="universe.isLoading" class="detail-loading">
        <span class="detail-spinner" aria-hidden="true" />
        正在同步全市场列表 {{ universe.progress.loaded }} / {{ universe.progress.total || '—' }}
      </div>
      <EmptyState
        v-else-if="!universe.count"
        title="还没有全市场数据"
        description="行业详情依赖全市场列表的板块字段，先同步一次行情。"
        compact
      >
        <button class="btn btn-primary" type="button" @click="universe.ensureLoaded(true)">
          加载全市场列表
        </button>
      </EmptyState>
      <ConstituentList
        v-else
        :stocks="stocks"
        :search-placeholder="`在 ${sectorName} 中搜索代码 / 名称`"
        empty-text="该行业在当前全市场列表中没有匹配股票。"
        @open="openStock"
      />

      <p class="detail-foot">{{ freshness }}</p>
    </div>
  </section>
</template>

<style scoped>
.sector-detail {
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

.detail-head p {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--text-soft);
}

.detail-head b.is-up {
  color: var(--up);
}

.detail-head b.is-down {
  color: var(--down);
}

.detail-head b.is-flat {
  color: var(--muted);
}

.detail-meta {
  margin: 3px 0 0;
  font-size: 11px;
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

.detail-foot {
  margin: 8px 0 0;
  font-size: 10.5px;
  color: var(--muted);
}

@media (prefers-reduced-motion: reduce) {
  .detail-spinner {
    animation: none;
  }
}
</style>
