<script setup lang="ts">
import type { Recommendation } from '@/types'
import { formatPercent, formatPrice } from '@/lib/format'
import { marketOfSymbol } from '@/lib/market'
import { RouterLink } from 'vue-router'
import TrendBadge from './TrendBadge.vue'
import Sparkline from './Sparkline.vue'

const props = defineProps<{
  items: Recommendation[]
  selectedSymbol?: string
  /** Which top-level menu the user came from, used to highlight nav on the detail page. */
  from?: string
}>()

const emit = defineEmits<{ (event: 'select', symbol: string): void }>()

function symbolText(symbol: string): string {
  return `${marketOfSymbol(symbol)}${symbol}`
}

function detailTarget(symbol: string): { path: string; query?: Record<string, string> } {
  const path = `/stock/${symbol}`
  return props.from ? { path, query: { from: props.from } } : { path }
}
</script>

<template>
  <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>标的</th>
          <th>最新价</th>
          <th>涨跌</th>
          <th>20 日走势</th>
          <th>趋势</th>
          <th>评分</th>
          <th>操作参考</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(item, index) in items"
          :key="item.symbol"
          :class="{ 'is-selected': item.symbol === selectedSymbol }"
          @click="emit('select', item.symbol)"
        >
          <td class="rank">{{ index + 1 }}</td>
          <td>
            <div class="stock-cell">
              <strong>{{ item.name }}</strong>
              <span>
                {{ symbolText(item.symbol) }} · {{ item.sector }}
                <RouterLink
                  :to="detailTarget(item.symbol)"
                  class="stock-detail-link"
                  :aria-label="`查看 ${item.name} 的个股详情`"
                  @click.stop
                >
                  详情
                </RouterLink>
              </span>
            </div>
          </td>
          <td class="num">{{ formatPrice(item.indicators.lastClose) }}</td>
          <td class="num" :class="item.indicators.pctChange1d >= 0 ? 'text-up' : 'text-down'">
            {{ formatPercent(item.indicators.pctChange1d) }}
          </td>
          <td><Sparkline :bars="item.bars" /></td>
          <td><TrendBadge :label="item.trend.label" /></td>
          <td>
            <div class="score-cell">
              <span class="score-value">{{ item.totalScore.toFixed(1) }}</span>
              <div class="score-bar"><i :style="{ width: `${Math.min(100, item.totalScore)}%` }" /></div>
            </div>
          </td>
          <td class="advice-cell">{{ item.entryAdvice }}</td>
        </tr>
        <tr v-if="items.length === 0">
          <td colspan="8" class="empty-row">没有符合筛选条件的标的</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.stock-detail-link {
  margin-left: 2px;
  color: var(--accent);
  font-size: 11px;
  text-decoration: none;
  white-space: nowrap;
}

.stock-detail-link:hover {
  text-decoration: underline;
}
</style>
