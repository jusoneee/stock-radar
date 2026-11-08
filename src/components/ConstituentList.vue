<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UniverseStock } from '@/types'
import { formatAmount, formatPercent, formatPrice } from '@/lib/format'

const props = defineProps<{
  stocks: UniverseStock[]
  searchPlaceholder?: string
  emptyText?: string
}>()

const emit = defineEmits<{ open: [stock: UniverseStock] }>()

const keyword = ref('')
const sortBy = ref<'pct-desc' | 'pct-asc' | 'cap-desc' | 'price-desc' | 'price-asc' | 'name' | 'code'>(
  'pct-desc',
)

const numeric = (value: number | undefined): number =>
  value === undefined || !Number.isFinite(value) ? Number.NEGATIVE_INFINITY : value

const filtered = computed<UniverseStock[]>(() => {
  const query = keyword.value.trim().toLowerCase()
  const base = query
    ? props.stocks.filter(
        (stock) =>
          stock.symbol.toLowerCase().includes(query) || stock.name.toLowerCase().includes(query),
      )
    : [...props.stocks]
  switch (sortBy.value) {
    case 'pct-asc':
      return base.sort((a, b) => numeric(a.pctChange) - numeric(b.pctChange))
    case 'cap-desc':
      return base.sort((a, b) => numeric(b.marketCap) - numeric(a.marketCap))
    case 'price-desc':
      return base.sort((a, b) => numeric(b.price) - numeric(a.price))
    case 'price-asc':
      return base.sort((a, b) => numeric(a.price) - numeric(b.price))
    case 'name':
      return base.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    case 'code':
      return base.sort((a, b) => a.symbol.localeCompare(b.symbol))
    default:
      return base.sort((a, b) => numeric(b.pctChange) - numeric(a.pctChange))
  }
})

function toneOf(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value === 0) return 'is-flat'
  return value > 0 ? 'is-up' : 'is-down'
}
</script>

<template>
  <div class="constituent-list">
    <div class="list-tools">
      <input
        v-model="keyword"
        class="search-input"
        type="search"
        :placeholder="searchPlaceholder ?? '搜索代码 / 名称'"
        aria-label="搜索股票"
      />
      <select v-model="sortBy" class="select-input" aria-label="列表排序">
        <option value="pct-desc">涨幅从高到低</option>
        <option value="pct-asc">涨幅从低到高</option>
        <option value="cap-desc">市值从高到低</option>
        <option value="price-desc">价格从高到低</option>
        <option value="price-asc">价格从低到高</option>
        <option value="name">按名称</option>
        <option value="code">按代码</option>
      </select>
      <span class="list-count">{{ filtered.length }} / {{ stocks.length }} 只</span>
    </div>

    <div class="list-scroll">
      <div class="list-head">
        <span>名称 / 代码</span>
        <span>价格</span>
        <span>涨跌幅</span>
        <span class="col-extra">换手率</span>
        <span class="col-extra">市值</span>
      </div>
      <button
        v-for="stock in filtered"
        :key="stock.symbol"
        class="list-row"
        type="button"
        :title="`查看 ${stock.name} 详情`"
        @click="emit('open', stock)"
      >
        <span class="row-main">
          <strong>{{ stock.name }}</strong>
          <small>{{ stock.symbol }}</small>
        </span>
        <span class="row-price">{{ formatPrice(stock.price ?? Number.NaN) }}</span>
        <span class="row-pct" :class="toneOf(stock.pctChange)">
          {{ stock.pctChange === undefined ? '—' : formatPercent(stock.pctChange) }}
        </span>
        <span class="row-extra col-extra">
          {{ stock.turnoverRate === undefined ? '—' : `${stock.turnoverRate.toFixed(2)}%` }}
        </span>
        <span class="row-extra col-extra">
          {{ stock.marketCap === undefined ? '—' : formatAmount(stock.marketCap) }}
        </span>
      </button>
      <p v-if="!filtered.length" class="list-empty">
        {{ emptyText ?? '没有匹配的股票，试试其他关键字。' }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.constituent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.list-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.list-tools .search-input {
  flex: 1;
  min-width: 160px;
}

.list-count {
  margin-left: auto;
  color: var(--muted);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.list-scroll {
  display: flex;
  flex-direction: column;
  max-height: min(62vh, 640px);
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  overscroll-behavior: contain;
}

.list-head,
.list-row {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) 0.7fr 0.8fr 0.7fr 0.9fr;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
}

.list-head {
  position: sticky;
  top: 0;
  z-index: 1;
  height: 32px;
  border-bottom: 1px solid var(--divider);
  background: var(--surface-3);
  color: var(--muted);
  font-size: 10.5px;
}

.list-head span:not(:first-child) {
  text-align: right;
}

.list-row {
  min-height: 42px;
  border: 0;
  border-bottom: 1px solid var(--divider);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.list-row:last-of-type {
  border-bottom: 0;
}

.list-row:hover {
  background: var(--surface-3);
}

.row-main {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
}

.row-main strong {
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-main small {
  color: var(--muted);
  font-size: 10px;
  flex: none;
}

.row-price,
.row-pct,
.row-extra {
  text-align: right;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.row-extra {
  color: var(--muted);
}

.row-pct {
  font-weight: 600;
}

.row-pct.is-up {
  color: var(--up);
}

.row-pct.is-down {
  color: var(--down);
}

.row-pct.is-flat {
  color: var(--muted);
}

.list-empty {
  padding: 18px 12px;
  color: var(--muted);
  font-size: 12px;
}

@media (max-width: 640px) {
  .list-head,
  .list-row {
    grid-template-columns: minmax(0, 1.5fr) 0.75fr 0.85fr;
    padding: 0 10px;
  }

  .col-extra {
    display: none;
  }

  .list-count {
    display: none;
  }
}
</style>
