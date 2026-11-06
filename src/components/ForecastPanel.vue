<script setup lang="ts">
import { computed } from 'vue'
import type { QuoteBar } from '@/types'
import { forecastBars } from '@/analysis/forecast'
import { formatPercent, formatPrice } from '@/lib/format'

const props = withDefaults(
  defineProps<{
    bars: QuoteBar[]
    compact?: boolean
  }>(),
  { compact: false },
)

const forecast = computed(() => forecastBars(props.bars))

function probability(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}
</script>

<template>
  <section class="forecast" :class="{ compact }">
    <header class="forecast-head">
      <div>
        <h2>趋势预测 <span class="tag">统计外推</span></h2>
        <p class="muted">
          样本 {{ forecast.sampleSize }} 个交易日
          <template v-if="forecast.status === 'ok'">
            · 斜率 {{ forecast.slopePctPerDay }}%/日 · 5 日动量 {{ forecast.momentumPct }}% · 日波动率
            {{ forecast.volatilityPct }}% · 20 日偏离 Z={{ forecast.meanReversionZ }}
          </template>
        </p>
      </div>
    </header>

    <p v-if="forecast.status === 'insufficient'" class="forecast-empty">{{ forecast.reason }}</p>

    <template v-else>
      <div v-if="compact" class="compact-row">
        <span class="compact-main">
          5 日方向概率 <strong>{{ probability(forecast.horizons[0]?.upProbability ?? 0) }}</strong>
        </span>
        <span class="muted">
          区间 {{ forecast.horizons[0] ? `${formatPrice(forecast.horizons[0].lower)} ~ ${formatPrice(forecast.horizons[0].upper)}` : '—' }}
        </span>
      </div>

      <template v-else>
        <div class="table-wrap">
          <table class="forecast-table">
            <thead>
              <tr>
                <th>周期</th>
                <th>中枢价</th>
                <th>涨跌幅</th>
                <th>方向概率（涨）</th>
                <th>80% 区间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in forecast.horizons" :key="item.days">
                <td>{{ item.days }} 日</td>
                <td>{{ formatPrice(item.central) }}</td>
                <td :class="item.changePct >= 0 ? 'up' : 'down'">{{ formatPercent(item.changePct) }}</td>
                <td>
                  <span class="prob-bar">
                    <i :style="{ width: `${Math.round(item.upProbability * 100)}%` }" />
                  </span>
                  {{ probability(item.upProbability) }}
                </td>
                <td>{{ formatPrice(item.lower) }} ~ {{ formatPrice(item.upper) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="method">{{ forecast.method }}</p>

        <h3 class="sub-title">Walk-forward 误差验证 <span class="muted">滚动起点，预测值与实际值逐日比对</span></h3>
        <div class="table-wrap">
          <table class="forecast-table">
            <thead>
              <tr>
                <th>周期</th>
                <th>有效窗口</th>
                <th>MAE（元）</th>
                <th>MAPE</th>
                <th>方向命中率</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in forecast.validation" :key="item.days">
                <td>{{ item.days }} 日</td>
                <td>{{ item.windows }}</td>
                <td>{{ item.windows > 0 ? item.mae.toFixed(2) : '样本不足' }}</td>
                <td>{{ item.windows > 0 ? `${item.mape.toFixed(2)}%` : '样本不足' }}</td>
                <td>{{ item.windows > 0 ? probability(item.directionHitRate) : '样本不足' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="hint-text">
          MAPE 越低、方向命中率越接近 50% 以上仅代表该历史窗口的拟合表现，不代表未来可复现；20 日验证窗口通常显著少于此数。
        </p>
      </template>

      <p class="disclaimer">{{ forecast.disclaimer }}</p>
    </template>
  </section>
</template>

<style scoped>
.forecast {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  background: var(--surface);
}

.forecast.compact {
  padding: 10px;
}

.forecast-head h2 {
  margin: 0 0 4px;
}

.forecast-head p {
  margin: 0;
  font-size: 12px;
}

.forecast-empty {
  margin: 10px 0 0;
  color: #b42318;
  font-size: 13px;
  line-height: 1.6;
}

.table-wrap {
  overflow-x: auto;
  margin-top: 10px;
  -webkit-overflow-scrolling: touch;
}

.forecast-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.forecast-table th,
.forecast-table td {
  text-align: left;
  padding: 8px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.forecast-table th {
  color: #64748b;
  font-weight: 600;
}

.up {
  color: #c0392b;
}

.down {
  color: #0f8a55;
}

.prob-bar {
  display: inline-block;
  width: 54px;
  height: 6px;
  border-radius: 3px;
  background: #e5e7eb;
  margin-right: 6px;
  vertical-align: middle;
  overflow: hidden;
}

.prob-bar i {
  display: block;
  height: 100%;
  background: #2563eb;
}

.method {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #475569;
}

.sub-title {
  margin: 16px 0 0;
  font-size: 14px;
}

.disclaimer {
  margin: 12px 0 0;
  padding: 8px 10px;
  border-left: 3px solid #f0a020;
  background: #fff8e6;
  color: #7a5200;
  font-size: 12px;
  line-height: 1.6;
}

.compact-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  font-size: 13px;
}

.compact-main strong {
  color: #1d4ed8;
  font-size: 16px;
}
</style>
