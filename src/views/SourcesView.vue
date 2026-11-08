<script setup lang="ts">
import { computed } from 'vue'
import { useChannelsStore } from '@/stores/channels'
import { useCustomSourcesStore } from '@/stores/custom-sources'
import ChannelCard from '@/components/ChannelCard.vue'
import CustomSourcesPanel from '@/components/CustomSourcesPanel.vue'
import BackButton from '@/components/BackButton.vue'
import { PROXY_AVAILABLE, channelAvailability } from '@/adapters/availability'
import type { ChannelMeta } from '@/types'

const store = useChannelsStore()
const customSources = useCustomSourcesStore()
customSources.init()

interface ChannelView {
  meta: ChannelMeta
  enabled: boolean
  weight: number
  share: number
  apiKey: string
  available: boolean
  unavailableReason: string
}

const staticMode = !PROXY_AVAILABLE

function buildView(kind: 'quote' | 'news', normalized: Array<{ id: string; weight: number }>): ChannelView[] {
  const catalog = kind === 'quote' ? store.quoteCatalog : store.newsCatalog
  return catalog.map((meta) => {
    const state = store.channels.find((item) => item.id === meta.id)
    const share = normalized.find((item) => item.id === meta.id)?.weight ?? 0
    const availability = channelAvailability(meta)
    return {
      meta,
      enabled: state?.enabled ?? false,
      weight: state?.weight ?? meta.reliability,
      share,
      apiKey: store.keys[meta.id] ?? '',
      available: availability.available,
      unavailableReason: availability.reason,
    }
  })
}

const quoteCards = computed(() => buildView('quote', store.quoteSettings))
const newsCards = computed(() => buildView('news', store.newsSettings))

const quoteEnabled = computed(() => quoteCards.value.filter((item) => item.enabled && item.available).length)
const newsEnabled = computed(() => newsCards.value.filter((item) => item.enabled && item.available).length)
const unavailableCount = computed(() => [...quoteCards.value, ...newsCards.value].filter((item) => !item.available).length)
const customEnabled = computed(() => customSources.sources.filter((item) => item.enabled).length)
const customTotal = computed(() => customSources.sources.length)
</script>

<template>
  <section class="page sources-page">
    <header class="page-head">
      <div class="page-head-lead">
        <BackButton />
        <div>
          <h1>数据源管理</h1>
          <p>内置行情与资讯渠道、自定义源统一管理；禁用后相关取数逻辑会自动跳过该来源。</p>
        </div>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-ghost" type="button" @click="store.reset()">恢复默认渠道</button>
      </div>
    </header>

    <div class="source-stats">
      <div class="source-stat">
        <span class="source-stat-icon quote">↗</span>
        <div>
          <strong>{{ quoteEnabled }} / {{ quoteCards.length }}</strong>
          <small>行情源已启用</small>
        </div>
      </div>
      <div class="source-stat">
        <span class="source-stat-icon news">≡</span>
        <div>
          <strong>{{ newsEnabled }} / {{ newsCards.length }}</strong>
          <small>新闻源已启用</small>
        </div>
      </div>
      <div class="source-stat">
        <span class="source-stat-icon custom">✚</span>
        <div>
          <strong>{{ customEnabled }} / {{ customTotal }}</strong>
          <small>自定义源已启用</small>
        </div>
      </div>
      <div class="source-stat">
        <span class="source-stat-icon limit">!</span>
        <div>
          <strong>{{ unavailableCount }}</strong>
          <small>当前部署不可用</small>
        </div>
      </div>
    </div>

    <div v-if="staticMode && unavailableCount > 0" class="notice">
      <strong>纯静态部署说明</strong>
      <p>
        当前构建不含 <code>/api</code> 同源代理，{{ unavailableCount }} 个依赖代理的渠道（如 Tushare、AKShare 等）
        已标记为「纯静态不可用」并自动跳过；它们不会发起请求，也不会返回模拟数据。需要启用时请使用带代理的部署方式。
      </p>
    </div>

    <div class="card">
      <header class="card-head">
        <h2>行情源 <span class="muted">已启用 {{ quoteEnabled }} / {{ quoteCards.length }}</span></h2>
        <div class="card-head-actions">
          <button class="btn btn-mini" type="button" @click="store.enableAll('quote', true)">全部启用</button>
          <button class="btn btn-mini" type="button" @click="store.enableAll('quote', false)">全部关闭</button>
        </div>
      </header>
      <div class="channel-grid">
        <ChannelCard
          v-for="card in quoteCards"
          :key="card.meta.id"
          :meta="card.meta"
          :enabled="card.enabled"
          :weight="card.weight"
          :normalized-weight="card.share"
          :api-key="card.apiKey"
          :available="card.available"
          :unavailable-reason="card.unavailableReason"
          @update:enabled="store.toggle(card.meta.id)"
          @update:weight="(value) => store.setWeight(card.meta.id, value)"
          @update:apiKey="(value) => store.setKey(card.meta.id, value)"
        />
      </div>
      <p v-if="quoteEnabled === 0" class="inline-warn">未启用任何可用行情源，分析将无法运行。</p>
      <p class="hint-text">
        同类型渠道内按权重归一化；禁用某个来源后，分析请求会跳过它，剩余启用来源按权重重新归一。
      </p>
    </div>

    <div class="card">
      <header class="card-head">
        <h2>新闻源 <span class="muted">已启用 {{ newsEnabled }} / {{ newsCards.length }}</span></h2>
        <div class="card-head-actions">
          <button class="btn btn-mini" type="button" @click="store.enableAll('news', true)">全部启用</button>
          <button class="btn btn-mini" type="button" @click="store.enableAll('news', false)">全部关闭</button>
        </div>
      </header>
      <div class="channel-grid">
        <ChannelCard
          v-for="card in newsCards"
          :key="card.meta.id"
          :meta="card.meta"
          :enabled="card.enabled"
          :weight="card.weight"
          :normalized-weight="card.share"
          :api-key="card.apiKey"
          :available="card.available"
          :unavailable-reason="card.unavailableReason"
          @update:enabled="store.toggle(card.meta.id)"
          @update:weight="(value) => store.setWeight(card.meta.id, value)"
          @update:apiKey="(value) => store.setKey(card.meta.id, value)"
        />
      </div>
      <p v-if="newsEnabled === 0" class="inline-warn">
        未启用任何可用新闻源时，事件驱动分项按中性 50 分处理；可通过自定义资讯源补齐。
      </p>
    </div>

    <CustomSourcesPanel />

    <p class="hint-text sources-footnote">
      渠道启用状态与自定义源配置保存在本机浏览器；删除自定义源前会二次确认。评分算法不会因渠道切换而改变，
      仅跳过被禁用来源的取数。
    </p>
  </section>
</template>

<style scoped>
.source-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}

.source-stat {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: linear-gradient(180deg, var(--surface-2), var(--surface));
  box-shadow: var(--shadow-card);
}

.source-stat-icon {
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 15px;
  border: 1px solid var(--border);
  background: var(--surface-3);
  color: var(--text-soft);
}

.source-stat-icon.quote {
  color: var(--accent);
  border-color: var(--accent-border);
  background: var(--accent-soft);
}

.source-stat-icon.news {
  color: var(--warn);
  border-color: var(--warn-border);
  background: var(--warn-soft);
}

.source-stat-icon.custom {
  color: var(--down);
  border-color: color-mix(in srgb, var(--down) 35%, transparent);
  background: color-mix(in srgb, var(--down) 10%, transparent);
}

.source-stat-icon.limit {
  color: var(--up);
  border-color: var(--danger-border);
  background: var(--danger-soft);
}

.source-stat strong {
  display: block;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}

.source-stat small {
  color: var(--muted);
  font-size: 11.5px;
}

.sources-footnote {
  margin-top: 16px;
}

@media (max-width: 640px) {
  .source-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
