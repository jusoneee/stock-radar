<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { MAX_WATCHLIST, useWatchlistStore, type WatchSortMode } from '@/stores/watchlist'
import { useUniverseStore } from '@/stores/universe'
import { useCompareStore } from '@/stores/compare'
import FavoritesPreview from '@/components/FavoritesPreview.vue'
import { getTradingStatus } from '@/lib/trading-calendar'
import { formatDateTime, formatPercent, formatPrice } from '@/lib/format'
import { marketLabel, symbolText } from '@/lib/market'
import type { UniverseStock, WatchItem } from '@/types'

const watchlist = useWatchlistStore()
const universe = useUniverseStore()
const compare = useCompareStore()

const query = ref('')
const feedback = ref('')
const groupFilter = ref('')
const groupInput = ref('')
const onlyFavorites = ref(false)

const trading = getTradingStatus()

const results = computed<UniverseStock[]>(() => universe.search(query.value, 24))
const progressPercent = computed(() => {
  const total = universe.progress.total
  if (total <= 0) return 0
  return Math.min(100, Math.round((universe.progress.loaded / total) * 100))
})
const latestQuoteTime = computed(() => universe.latestQuoteTime())
const hasUniverse = computed(() => universe.items.length > 0)

const sortOptions: Array<{ value: WatchSortMode; label: string }> = [
  { value: 'manual', label: '手动顺序' },
  { value: 'name', label: '按名称' },
  { value: 'symbol', label: '按代码' },
  { value: 'added', label: '按添加时间' },
]

const sortedItems = computed<WatchItem[]>(() => {
  const items = [...watchlist.items]
  switch (watchlist.sortMode) {
    case 'name':
      return items.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    case 'symbol':
      return items.sort((a, b) => a.symbol.localeCompare(b.symbol))
    case 'added':
      return items.sort((a, b) => (a.addedAt ?? '').localeCompare(b.addedAt ?? ''))
    default:
      return items
  }
})

const poolItems = computed<WatchItem[]>(() => {
  const base = onlyFavorites.value
    ? sortedItems.value.filter((item) => item.favorite !== false)
    : sortedItems.value
  const filter = groupFilter.value
  if (!filter) return base
  if (filter === '__default__') return base.filter((item) => !item.group)
  return base.filter((item) => item.group === filter)
})

const previewNames = computed<Record<string, string>>(() =>
  Object.fromEntries(watchlist.items.map((item) => [item.symbol, item.name])),
)

const favoriteCount = computed(() => watchlist.favorites.length)

onMounted(async () => {
  watchlist.init()
  universe.init()
  compare.init()
  await universe.ensureLoaded()
})

function addStock(stock: UniverseStock): void {
  const result = watchlist.add({
    symbol: stock.symbol,
    name: stock.name,
    market: stock.market,
    group: groupInput.value.trim() || undefined,
  })
  if (result === 'added') feedback.value = `已添加 ${stock.name}（${symbolText(stock.symbol)}）`
  else if (result === 'exists') feedback.value = `${stock.name} 已在自选池中`
  else if (result === 'full') feedback.value = `自选池最多 ${MAX_WATCHLIST} 只，请先移除部分标的后再添加`
  else feedback.value = '股票代码无效'
}

function applyGroup(symbol: string, event: Event): void {
  const target = event.target as HTMLInputElement
  watchlist.setGroup(symbol, target.value)
  target.value = target.value.trim()
}

function restoreDefaults(): void {
  watchlist.reset()
  feedback.value = '已恢复默认自选池（10 只，全部标记为收藏）'
}

function clearPool(): void {
  watchlist.clear()
  compare.clear()
  feedback.value = '已清空自选池与对比选择'
}

function togglePreview(symbol: string): void {
  compare.toggle(symbol)
  if (compare.notice) feedback.value = compare.notice
}

async function refreshUniverse(): Promise<void> {
  feedback.value = ''
  await universe.load()
}

async function loadUniverse(): Promise<void> {
  feedback.value = ''
  await universe.ensureLoaded(true)
}
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h1>自选池</h1>
        <p>
          从真实全市场列表（沪深 + 北交所 A 股，约 5900 只）搜索并维护分析标的。支持分组与手动排序，
          分析页与分析引擎只读取这里的池子，最多 {{ MAX_WATCHLIST }} 只，配置保存在浏览器本地。
        </p>
      </div>
      <div class="page-head-actions">
        <RouterLink to="/analysis" class="btn btn-primary">去分析</RouterLink>
      </div>
    </header>

    <div class="freshness-bar card">
      <span class="tag" :class="trading.isSession ? 'tag-live' : 'tag'">
        最近交易日 {{ trading.latestTradingDay }} · {{ trading.phaseLabel }}
      </span>
      <span class="tag">自选池 {{ watchlist.count }} / {{ MAX_WATCHLIST }}</span>
      <span class="tag">收藏 {{ favoriteCount }}</span>
      <span class="tag" :class="{ 'tag-live': compare.count >= 2 }">预览选择 {{ compare.count }} / 6</span>
      <span v-if="universe.status === 'ready'" class="tag tag-live">全市场 {{ universe.providerTotal || universe.count }} 只</span>
      <span v-if="universe.status === 'loading'" class="tag">分页抓取中 {{ universe.progress.loaded }} / {{ universe.progress.total }} 页</span>
      <span v-if="universe.fetchedAt" class="muted">列表更新时间 {{ formatDateTime(universe.fetchedAt) }}</span>
      <span v-if="universe.expiresAt" class="muted">缓存有效期至 {{ formatDateTime(universe.expiresAt) }}</span>
      <span v-if="latestQuoteTime" class="muted">行情时间戳 {{ formatDateTime(latestQuoteTime) }}</span>
      <span class="freshness-spacer" />
      <button class="btn btn-mini" :disabled="universe.isLoading" @click="refreshUniverse">
        {{ universe.isLoading ? '刷新中…' : '刷新列表' }}
      </button>
    </div>

    <p v-if="feedback" class="inline-warn">{{ feedback }}</p>

    <p v-if="universe.error" class="banner-error">
      {{ universe.error }}
      <button class="btn btn-mini error-retry" :disabled="universe.isLoading" @click="loadUniverse">重试</button>
    </p>

    <div class="card">
      <header class="card-head">
        <h2>全市场搜索</h2>
        <span class="tag">按代码 / 名称模糊匹配 · 本地缓存</span>
      </header>

      <div class="search-bar">
        <input
          v-model="query"
          class="search-input"
          type="search"
          placeholder="输入股票代码或名称，例如 600519 / 茅台"
          :disabled="!hasUniverse"
        />
        <input
          v-model="groupInput"
          class="search-input group-input"
          type="text"
          maxlength="12"
          placeholder="新加标的分组（可选）"
          list="watch-groups"
          :disabled="!hasUniverse"
        />
        <datalist id="watch-groups">
          <option v-for="name in watchlist.groups" :key="name" :value="name" />
        </datalist>
        <span class="muted">
          <template v-if="universe.status === 'loading'">正在分页抓取全市场列表…</template>
          <template v-else-if="hasUniverse">
            {{ query.trim() ? `匹配 ${results.length} 条（最多显示 24 条）` : `共 ${universe.count} 只，已展示前 ${results.length} 只` }}
          </template>
          <template v-else>尚未加载全市场列表</template>
        </span>
      </div>

      <div v-if="universe.status === 'loading'" class="progress-block">
        <div class="progress-track"><i class="progress-fill" :style="{ width: `${progressPercent}%` }" /></div>
        <p class="hint-text">
          第 {{ universe.progress.loaded }} / {{ universe.progress.total }} 页 · 每页 100 条 · 并发 3、请求间隔 150ms，
          以规避上游风控；抓取完成后会缓存到本地，同一交易日内不会重复请求。
        </p>
      </div>

      <div v-else-if="!hasUniverse" class="empty-state compact">
        <h3>未加载全市场列表</h3>
        <p>全市场列表需要一次分页抓取（约 56 页），失败时会明确提示，不会退回假数据。</p>
        <button class="btn btn-primary" :disabled="universe.isLoading" @click="loadUniverse">加载全市场列表</button>
      </div>

      <div v-else class="result-list">
        <div v-for="stock in results" :key="stock.symbol" class="result-item">
          <div class="result-main">
            <strong>{{ stock.name }}</strong>
            <span class="muted">{{ symbolText(stock.symbol) }} · {{ marketLabel(stock.market) }}</span>
            <span v-if="stock.sector" class="tag">{{ stock.sector }}</span>
            <span v-if="stock.st" class="tag tag-key">ST</span>
            <span v-if="stock.suspended" class="tag tag-key">疑似停牌</span>
          </div>
          <div class="result-quote">
            <span v-if="stock.price !== undefined" class="num">{{ formatPrice(stock.price) }}</span>
            <span
              v-if="stock.pctChange !== undefined"
              class="num"
              :class="stock.pctChange >= 0 ? 'text-up' : 'text-down'"
            >
              {{ formatPercent(stock.pctChange) }}
            </span>
          </div>
          <button
            class="btn btn-mini"
            :class="{ 'is-active': watchlist.has(stock.symbol) }"
            :disabled="watchlist.has(stock.symbol) || watchlist.isFull"
            @click="addStock(stock)"
          >
            {{ watchlist.has(stock.symbol) ? '已在池中' : '添加' }}
          </button>
        </div>
        <p v-if="results.length === 0" class="empty-text">没有匹配的股票，试试完整代码或名称中的关键字。</p>
      </div>
    </div>

    <div class="card">
      <header class="card-head">
        <h2>当前自选池 <span class="muted">{{ watchlist.count }} / {{ MAX_WATCHLIST }}</span></h2>
        <div class="card-head-actions">
          <label class="inline-label">
            <input v-model="onlyFavorites" type="checkbox" />
            只看收藏
          </label>
          <label class="inline-label">
            分组
            <select v-model="groupFilter" class="select-input">
              <option value="">全部</option>
              <option value="__default__">未分组</option>
              <option v-for="name in watchlist.groups" :key="name" :value="name">{{ name }}</option>
            </select>
          </label>
          <label class="inline-label">
            排序
            <select
              :value="watchlist.sortMode"
              class="select-input"
              @change="watchlist.setSortMode(($event.target as HTMLSelectElement).value as WatchSortMode)"
            >
              <option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <button class="btn btn-mini" @click="restoreDefaults">恢复默认</button>
          <button class="btn btn-mini" :disabled="watchlist.isEmpty" @click="clearPool">清空</button>
        </div>
      </header>

      <div v-if="watchlist.isEmpty" class="empty-state compact">
        <h2>自选池为空</h2>
        <p>上方搜索添加至少一只股票后才能运行分析；也可以直接恢复默认的 10 只演示标的。</p>
        <div class="empty-actions">
          <button class="btn btn-primary" @click="restoreDefaults">恢复默认自选池</button>
          <RouterLink to="/channels" class="btn btn-ghost">检查数据源</RouterLink>
        </div>
      </div>

      <div v-else class="pool-grid">
        <div v-for="(item, index) in poolItems" :key="item.symbol" class="pool-card">
          <div class="pool-card-main">
            <RouterLink :to="`/stock/${item.symbol}`" class="pool-name">{{ item.name }}</RouterLink>
            <span class="muted">{{ symbolText(item.symbol) }} · {{ marketLabel(item.market) }}</span>
          </div>
          <div class="pool-card-tools">
            <button
              class="pool-star"
              type="button"
              :class="{ 'is-favorite': item.favorite !== false }"
              :aria-label="item.favorite !== false ? `取消收藏 ${item.name}` : `收藏 ${item.name}`"
              :aria-pressed="item.favorite !== false"
              @click="watchlist.toggleFavorite(item.symbol)"
            >
              {{ item.favorite !== false ? '★' : '☆' }}
            </button>
            <button
              class="pool-compare"
              type="button"
              :class="{ 'is-active': compare.has(item.symbol) }"
              :aria-label="compare.has(item.symbol) ? `取消预览 ${item.name}` : `加入预览 ${item.name}`"
              :aria-pressed="compare.has(item.symbol)"
              @click="togglePreview(item.symbol)"
            >
              {{ compare.has(item.symbol) ? '已选预览' : '预览' }}
            </button>
            <input
              class="group-input"
              type="text"
              maxlength="12"
              placeholder="分组"
              :value="item.group ?? ''"
              :aria-label="`${item.name} 的分组`"
              @change="applyGroup(item.symbol, $event)"
            />
            <button
              class="pool-move"
              type="button"
              :disabled="watchlist.sortMode !== 'manual' || index === 0"
              :aria-label="`上移 ${item.name}`"
              @click="watchlist.move(item.symbol, -1)"
            >
              ↑
            </button>
            <button
              class="pool-move"
              type="button"
              :disabled="watchlist.sortMode !== 'manual' || index === poolItems.length - 1"
              :aria-label="`下移 ${item.name}`"
              @click="watchlist.move(item.symbol, 1)"
            >
              ↓
            </button>
          </div>
          <button class="pool-remove" type="button" :aria-label="`移除 ${item.name}`" @click="watchlist.remove(item.symbol)">
            ×
          </button>
        </div>
        <p v-if="poolItems.length === 0" class="empty-text">
          {{ onlyFavorites ? '当前筛选下没有收藏股票，试试取消「只看收藏」。' : '当前分组下没有股票。' }}
        </p>
      </div>

      <FavoritesPreview :symbols="compare.symbols" :names="previewNames" />

      <p v-if="watchlist.isFull" class="inline-warn">
        已达到 {{ MAX_WATCHLIST }} 只上限：批量取数按并发 3、间隔 120ms 串行调度，避免触发上游风控。
      </p>
      <p class="hint-text">
        自选池写入 localStorage；分析时每只股票会向每个已启用的行情源请求日 K，池子越大耗时越长。
      </p>
    </div>

    <div class="notice">
      <strong>合规提示</strong>
      <p>
        全市场列表与行情来自东方财富公开接口，非官方授权接口，字段与可用性不受服务方承诺；
        本工具仅做信息聚合与规则化分析，<strong>不构成任何投资建议</strong>。
      </p>
    </div>
  </section>
</template>

<style scoped>
.pool-name {
  font-size: 13px;
  font-weight: 600;
  color: inherit;
  text-decoration: none;
}

.pool-name:hover {
  color: #7fb6ff;
}

.pool-star,
.pool-compare {
  min-height: 44px;
  min-width: 44px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
}

.pool-star {
  font-size: 18px;
  color: #5b6472;
}

.pool-star.is-favorite {
  color: #f5b544;
}

.pool-compare.is-active {
  border-color: #2563eb;
  color: #7fb6ff;
  background: rgba(37, 99, 235, 0.12);
}

.pool-card-tools {
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .pool-card {
    flex-wrap: wrap;
  }

  .pool-card-tools {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
