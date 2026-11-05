<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useChannelsStore } from '@/stores/channels'
import { useWatchlistStore } from '@/stores/watchlist'
import ChannelCard from '@/components/ChannelCard.vue'
import type { ChannelMeta } from '@/types'

const store = useChannelsStore()
const watchlist = useWatchlistStore()

interface ChannelView {
  meta: ChannelMeta
  enabled: boolean
  weight: number
  share: number
  apiKey: string
}

function buildView(kind: 'quote' | 'news', normalized: Array<{ id: string; weight: number }>): ChannelView[] {
  const catalog = kind === 'quote' ? store.quoteCatalog : store.newsCatalog
  return catalog.map((meta) => {
    const state = store.channels.find((item) => item.id === meta.id)
    const share = normalized.find((item) => item.id === meta.id)?.weight ?? 0
    return {
      meta,
      enabled: state?.enabled ?? false,
      weight: state?.weight ?? meta.reliability,
      share,
      apiKey: store.keys[meta.id] ?? '',
    }
  })
}

const quoteCards = computed(() => buildView('quote', store.quoteSettings))
const newsCards = computed(() => buildView('news', store.newsSettings))

const quoteEnabled = computed(() => quoteCards.value.filter((item) => item.enabled).length)
const newsEnabled = computed(() => newsCards.value.filter((item) => item.enabled).length)

function onTimeout(event: Event): void {
  store.setTimeoutMs(Number((event.target as HTMLInputElement).value))
}

function onRetry(event: Event): void {
  store.setRetryCount(Number((event.target as HTMLInputElement).value))
}

function onCacheTtl(event: Event): void {
  store.setCacheTtlMs(Number((event.target as HTMLInputElement).value))
}
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h1>数据源配置</h1>
        <p>选择信息来源渠道，设置权重与密钥。配置会持久化到浏览器本地，密钥仅保存在当前会话内存中。</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-ghost" @click="store.reset()">恢复默认</button>
      </div>
    </header>

    <div class="card">
      <header class="card-head">
        <h2>行情源 <span class="muted">已启用 {{ quoteEnabled }} / {{ quoteCards.length }}</span></h2>
        <div class="card-head-actions">
          <button class="btn btn-mini" @click="store.enableAll('quote', true)">全部启用</button>
          <button class="btn btn-mini" @click="store.enableAll('quote', false)">全部关闭</button>
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
          @update:enabled="store.toggle(card.meta.id)"
          @update:weight="(value) => store.setWeight(card.meta.id, value)"
          @update:apiKey="(value) => store.setKey(card.meta.id, value)"
        />
      </div>
      <p v-if="quoteEnabled === 0" class="inline-warn">未启用任何行情源，分析将无法运行。</p>
    </div>

    <div class="card">
      <header class="card-head">
        <h2>新闻源 <span class="muted">已启用 {{ newsEnabled }} / {{ newsCards.length }}</span></h2>
        <div class="card-head-actions">
          <button class="btn btn-mini" @click="store.enableAll('news', true)">全部启用</button>
          <button class="btn btn-mini" @click="store.enableAll('news', false)">全部关闭</button>
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
          @update:enabled="store.toggle(card.meta.id)"
          @update:weight="(value) => store.setWeight(card.meta.id, value)"
          @update:apiKey="(value) => store.setKey(card.meta.id, value)"
        />
      </div>
      <p v-if="newsEnabled === 0" class="inline-warn">未启用新闻源时，事件驱动分项按中性 50 分处理。</p>
    </div>

    <div class="card">
      <header class="card-head">
        <h2>请求策略</h2>
        <span class="tag">对公开接口的限频保护</span>
      </header>
      <div class="policy-grid">
        <label class="policy-field">
          <span>请求超时（ms）</span>
          <input type="number" min="2000" max="60000" step="1000" :value="store.timeoutMs" @change="onTimeout" />
        </label>
        <label class="policy-field">
          <span>失败重试次数</span>
          <input type="number" min="0" max="5" step="1" :value="store.retryCount" @change="onRetry" />
        </label>
        <label class="policy-field">
          <span>响应缓存 TTL（ms）</span>
          <input type="number" min="0" max="600000" step="5000" :value="store.cacheTtlMs" @change="onCacheTtl" />
        </label>
      </div>
      <p class="hint-text">
        缓存命中时不发起网络请求，避免连续点击「重新分析」触发上游限流；设为 0 表示每次实时请求。
        真实接口为公开但非官方承诺的地址，字段可能调整，请以实际返回为准。
      </p>
    </div>

    <div class="card">
      <header class="card-head">
        <h2>自选池 <span class="muted">已选 {{ watchlist.count }} 只</span></h2>
        <RouterLink to="/watchlist" class="btn btn-mini">前往管理</RouterLink>
      </header>
      <p class="hint-text">
        自选池已独立为「自选池」页面：支持按代码/名称搜索全市场、单个删除、清空、恢复默认，
        最多 50 只并持久化到浏览器本地；分析页与分析引擎只读取该池。
      </p>
      <p class="hint-text">
        权重在同类型渠道内归一化（例如两个行情源权重 0.9 / 0.8 → 实际占比 53% / 47%）。
        主行情序列取权重最高的渠道，其余渠道用于多源收盘价交叉校验。
      </p>
    </div>

    <div class="notice">
      <strong>密钥与合规</strong>
      <p>
        页面输入的密钥不会写入 localStorage，也不会进入 git 仓库。生产环境建议由后端代理持有密钥，
        前端只调用自建网关；接入第三方数据前请阅读其服务条款与授权范围。
      </p>
    </div>
  </section>
</template>
