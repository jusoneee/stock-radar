<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useUniverseStore } from '@/stores/universe'
import { computeSectorStats } from '@/lib/sector-stats'
import { formatPercent } from '@/lib/format'
import EmptyState from '@/components/EmptyState.vue'
import BackButton from '@/components/BackButton.vue'

type SortMode = 'avg-desc' | 'avg-asc' | 'count-desc' | 'name' | 'up-desc'

const route = useRoute()
const universe = useUniverseStore()
const keyword = ref('')
const sortMode = ref<SortMode>(route.query.tab === 'cold' ? 'avg-asc' : 'avg-desc')

/** Same grouping rule as the dashboard cards: industry field, sample ≥ 3. */
const sectors = computed(() => computeSectorStats(universe.items).filter((item) => item.count >= 3))

const rows = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  const base = query
    ? sectors.value.filter((item) => item.name.toLowerCase().includes(query))
    : [...sectors.value]
  switch (sortMode.value) {
    case 'avg-asc':
      return base.sort((a, b) => a.avg - b.avg)
    case 'count-desc':
      return base.sort((a, b) => b.count - a.count)
    case 'up-desc':
      return base.sort((a, b) => b.up / b.count - a.up / a.count)
    case 'name':
      return base.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    default:
      return base.sort((a, b) => b.avg - a.avg)
  }
})

const breadth = (up: number, count: number): string => `${Math.round((up / count) * 100)}% 上涨`

onMounted(() => {
  universe.init()
  if (universe.count === 0 && !universe.isLoading) void universe.ensureLoaded()
})

async function refresh(): Promise<void> {
  await universe.ensureLoaded(true)
}

function toneOf(value: number): string {
  return value > 0 ? 'is-up' : value < 0 ? 'is-down' : 'is-flat'
}
</script>

<template>
  <section class="page sector-page">
    <header class="page-head">
      <div class="page-head-lead">
        <BackButton />
        <div>
          <h1>行业排行榜</h1>
          <p>全部行业的当日平均涨跌幅排行；数据与首页热榜、冷榜同源同口径。</p>
        </div>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-ghost" type="button" :disabled="universe.isLoading" @click="refresh">
          {{ universe.isLoading ? '同步中…' : '刷新列表' }}
        </button>
      </div>
    </header>

    <p v-if="universe.error" class="banner-error">{{ universe.error }}</p>

    <div class="card controls-card">
      <div class="rank-controls">
        <input
          v-model="keyword"
          class="search-input"
          type="search"
          placeholder="搜索行业名称"
          aria-label="搜索行业"
        />
        <select v-model="sortMode" class="select-input" aria-label="行业排序方式">
          <option value="avg-desc">平均涨幅从高到低</option>
          <option value="avg-asc">平均涨幅从低到高</option>
          <option value="count-desc">成分股数量从多到少</option>
          <option value="up-desc">上涨占比从高到低</option>
          <option value="name">按行业名称</option>
        </select>
        <span class="tag">{{ rows.length }} / {{ sectors.length }} 个行业</span>
      </div>
      <p class="hint-text">
        口径：取全市场列表的板块字段分组，对当日涨跌幅做简单平均，样本至少 3 只；剔除「未分类」与缺失涨跌幅的标的。
        {{ universe.count }} 只样本，更新于 {{ universe.fetchedAt ? new Date(universe.fetchedAt).toLocaleString('zh-CN') : '—' }}。
      </p>
    </div>

    <div v-if="universe.isLoading" class="card load-card">
      <div class="load-head">
        <strong>正在同步全市场列表</strong>
        <span class="muted">{{ universe.progress.loaded }} / {{ universe.progress.total || '—' }}</span>
      </div>
      <div class="progress-track">
        <div
          class="progress-fill"
          :style="{ width: `${universe.progress.total ? Math.min(100, Math.round((universe.progress.loaded / universe.progress.total) * 100)) : 0}%` }"
        />
      </div>
    </div>

    <EmptyState
      v-else-if="!sectors.length"
      title="还没有行业样本"
      description="首次使用需要先拉取全市场行情列表，完成后再按板块聚合。"
    >
      <button class="btn btn-primary" type="button" @click="refresh">加载全市场列表</button>
    </EmptyState>

    <div v-else class="card rank-card">
      <div class="table-wrap">
        <table class="rank-table">
          <thead>
            <tr>
              <th class="rank-col">#</th>
              <th>行业</th>
              <th class="num">平均涨跌幅</th>
              <th class="num">成分股</th>
              <th class="num">上涨 / 下跌</th>
              <th class="breadth-cell">涨跌分布</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in rows" :key="item.name">
              <td class="rank-col">{{ index + 1 }}</td>
              <td><strong>{{ item.name }}</strong></td>
              <td class="num" :class="toneOf(item.avg)">{{ formatPercent(item.avg) }}</td>
              <td class="num">{{ item.count }}</td>
              <td class="num">{{ item.up }} / {{ item.down }}</td>
              <td class="breadth-cell">
                <div class="breadth-track">
                  <span class="breadth-up" :style="{ width: `${(item.up / item.count) * 100}%` }" />
                </div>
                <small>{{ breadth(item.up, item.count) }}</small>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="6" class="empty-row">没有匹配的行业，试试其他关键字。</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.controls-card {
  padding-bottom: 10px;
}

.rank-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.rank-controls .search-input {
  flex: 1 1 220px;
  min-width: 0;
}

.rank-controls .select-input {
  flex: 0 1 200px;
}

.controls-card .hint-text {
  margin-top: 8px;
}

.rank-card {
  padding-top: 4px;
}

.table-wrap {
  overflow-x: auto;
}

.rank-table {
  width: 100%;
  min-width: 680px;
  border-collapse: collapse;
  font-size: 12.5px;
}

.rank-table th {
  text-align: left;
  padding: 9px 10px;
  border-bottom: 1px solid var(--divider);
  color: var(--muted);
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
}

.rank-table td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--divider);
  vertical-align: middle;
}

.rank-table tbody tr:last-child td {
  border-bottom: 0;
}

.rank-table tbody tr:hover {
  background: var(--surface-2);
}

.rank-col {
  width: 44px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.rank-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.rank-table .is-up {
  color: var(--up);
}

.rank-table .is-down {
  color: var(--down);
}

.rank-table .is-flat {
  color: var(--muted);
}

.breadth-cell {
  min-width: 150px;
}

.breadth-track {
  height: 5px;
  border-radius: 999px;
  background: var(--track);
  overflow: hidden;
}

.breadth-up {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--up), var(--accent));
}

.breadth-cell small {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 10px;
}

.empty-row {
  text-align: center;
  color: var(--muted);
  padding: 22px 10px;
}

.load-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.load-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

@media (max-width: 640px) {
  .rank-controls .select-input,
  .rank-controls .search-input {
    flex-basis: 100%;
  }

  .rank-table {
    min-width: 600px;
  }

  .breadth-cell {
    display: none;
  }
}
</style>
