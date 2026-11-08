<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useChannelsStore } from '@/stores/channels'
import { useAnalysisSettingsStore } from '@/stores/analysis-settings'
import ChannelCard from '@/components/ChannelCard.vue'
import CustomSourcesPanel from '@/components/CustomSourcesPanel.vue'
import BackButton from '@/components/BackButton.vue'
import { PROXY_AVAILABLE, channelAvailability } from '@/adapters/availability'
import { testChannel, type ChannelTestResult } from '@/lib/channel-test'
import { THEMES, useThemeStore } from '@/stores/theme'
import type { ChannelMeta, ScoreWeights } from '@/types'

const store = useChannelsStore()
const analysisSettings = useAnalysisSettingsStore()
const theme = useThemeStore()
analysisSettings.init()

const weightFields: Array<{ key: keyof ScoreWeights; label: string; hint: string }> = [
  { key: 'trend', label: '趋势结构', hint: '均线排列与斜率' },
  { key: 'momentum', label: '动量强度', hint: '5 日累计涨跌' },
  { key: 'volume', label: '量能配合', hint: '量比与放量' },
  { key: 'position', label: '区间位置', hint: '20 日区间与突破' },
  { key: 'news', label: '事件驱动', hint: '事件阶段与情绪' },
]

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

function onTimeout(event: Event): void {
  store.setTimeoutMs(Number((event.target as HTMLInputElement).value))
}

function onRetry(event: Event): void {
  store.setRetryCount(Number((event.target as HTMLInputElement).value))
}

function onCacheTtl(event: Event): void {
  store.setCacheTtlMs(Number((event.target as HTMLInputElement).value))
}

/** Leaving system mode pins the palette that is currently visible. */
function toggleSystem(): void {
  theme.setMode(theme.isSystem ? theme.resolved : 'system')
}

/* ---------- per-channel connection test ---------- */
const channelTesting = reactive<Record<string, boolean>>({})
const channelResults = reactive<Record<string, ChannelTestResult | null>>({})

async function runChannelTest(card: ChannelView): Promise<void> {
  if (channelTesting[card.meta.id]) return
  channelTesting[card.meta.id] = true
  channelResults[card.meta.id] = null
  try {
    channelResults[card.meta.id] = await testChannel(
      card.meta.id,
      card.apiKey,
      Math.max(4_000, store.timeoutMs),
    )
  } finally {
    channelTesting[card.meta.id] = false
  }
}
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div class="page-head-lead">
        <BackButton />
        <div>
          <h1>设置</h1>
          <p>配置数据来源、凭证、评分权重与请求策略，配置保存在本机浏览器；凭证不会写入构建产物或仓库。</p>
        </div>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-ghost" @click="store.reset()">恢复默认配置</button>
      </div>
    </header>

    <div class="notice">
      <strong>凭证仅保存在本机浏览器</strong>
      <p>
        Token / API Key / 自定义请求头写入当前浏览器的 localStorage，刷新后仍保留；纯静态站点无法保证密钥安全，
        <strong>请勿填入生产密钥</strong>，也不要把密钥写进仓库或构建配置。禁用数据源后，相关取数逻辑会直接跳过。
      </p>
    </div>

    <div v-if="staticMode && unavailableCount > 0" class="notice">
      <strong>纯静态部署说明</strong>
      <p>
        当前构建不含 <code>/api</code> 同源代理，{{ unavailableCount }} 个依赖代理的渠道已标记为「纯静态不可用」并自动跳过；
        这些渠道不会发起请求，也不会返回模拟数据。
      </p>
    </div>

    <div class="card">
      <header class="card-head">
        <h2>外观主题</h2>
        <div class="card-head-actions">
          <span class="tag">{{ theme.isSystem ? `跟随系统 · ${theme.resolvedLabel}` : theme.currentLabel }}</span>
        </div>
      </header>
      <div class="theme-layout">
        <div class="theme-system">
          <button
            class="switch"
            :class="{ 'is-on': theme.isSystem }"
            type="button"
            :aria-pressed="theme.isSystem"
            aria-label="跟随系统深浅色"
            @click="toggleSystem"
          >
            <span />
          </button>
          <div class="theme-system-text">
            <strong>跟随系统</strong>
            <small>随系统深浅色实时切换，当前为{{ theme.resolvedLabel }}</small>
          </div>
        </div>
        <div class="theme-grid">
          <button
            v-for="option in THEMES"
            :key="option.id"
            class="theme-option"
            :class="{ 'is-active': theme.mode === option.id }"
            type="button"
            :aria-pressed="theme.mode === option.id"
            @click="theme.setMode(option.id)"
          >
            <span class="theme-swatches" aria-hidden="true">
              <i v-for="color in option.swatches" :key="color" :style="{ background: color }" />
            </span>
            <span class="theme-text">
              <strong>{{ option.label }}</strong>
              <small>{{ option.hint }}</small>
            </span>
            <span v-if="theme.mode === option.id" class="theme-check" aria-hidden="true">✓</span>
          </button>
        </div>
      </div>
      <p class="hint-text">主题选择保存在本机浏览器，刷新后保持；跟随系统模式会同时响应系统与应用内的切换。</p>
    </div>

    <div class="card">
      <header class="card-head">
        <h2>评分权重</h2>
        <div class="card-head-actions">
          <span class="tag">自动归一化为 100%</span>
          <button class="btn btn-mini" @click="analysisSettings.resetWeights()">恢复默认</button>
        </div>
      </header>
      <div class="policy-grid">
        <label v-for="field in weightFields" :key="field.key" class="policy-field">
          <span>{{ field.label }} <em>{{ analysisSettings.weightPercent[field.key] }}%</em></span>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            :value="analysisSettings.weights[field.key]"
            @change="analysisSettings.setWeight(field.key, Number(($event.target as HTMLInputElement).value))"
          />
          <small class="muted">{{ field.hint }}</small>
        </label>
      </div>
      <p class="hint-text">权重只影响候选排序，不改变指标与事件判定；调整后需重新运行分析才会生效。</p>
    </div>

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
          :available="card.available"
          :unavailable-reason="card.unavailableReason"
          :testing="channelTesting[card.meta.id] ?? false"
          :test-result="channelResults[card.meta.id] ?? null"
          @update:enabled="store.toggle(card.meta.id)"
          @update:weight="(value) => store.setWeight(card.meta.id, value)"
          @update:apiKey="(value) => store.setKey(card.meta.id, value)"
          @test="runChannelTest(card)"
        />
      </div>
      <p v-if="quoteEnabled === 0" class="inline-warn">未启用任何可用行情源，分析将无法运行。</p>
      <p class="hint-text">同类型渠道内按权重归一化；主行情序列取权重最高的渠道，其余用于收盘价交叉校验。</p>
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
          :available="card.available"
          :unavailable-reason="card.unavailableReason"
          :testing="channelTesting[card.meta.id] ?? false"
          :test-result="channelResults[card.meta.id] ?? null"
          @update:enabled="store.toggle(card.meta.id)"
          @update:weight="(value) => store.setWeight(card.meta.id, value)"
          @update:apiKey="(value) => store.setKey(card.meta.id, value)"
          @test="runChannelTest(card)"
        />
      </div>
      <p v-if="newsEnabled === 0" class="inline-warn">
        未启用任何可用新闻源时，事件驱动分项按中性 50 分处理；可通过支持 CORS 的自定义资讯源补齐。
      </p>
    </div>

    <details class="section-collapse">
      <summary>自定义数据源</summary>
      <div class="collapse-body flatten-panel">
        <CustomSourcesPanel />
      </div>
    </details>

    <details class="section-collapse">
      <summary>请求策略</summary>
      <div class="collapse-body">
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
          缓存命中时不发起网络请求，避免连续「重新分析」触发上游限流；设为 0 表示每次实时请求。
          页面上填写的凭证只保存在本机 localStorage，不会进入 git 仓库或构建产物。
        </p>
      </div>
    </details>

    <details class="section-collapse">
      <summary>AI 增强（未启用）</summary>
      <div class="collapse-body">
        <div class="policy-grid">
          <label class="policy-field">
            <span>启用 LLM / NER 增强</span>
            <input
              type="checkbox"
              :checked="analysisSettings.llm.enabled"
              @change="analysisSettings.setLlm({ enabled: ($event.target as HTMLInputElement).checked })"
            />
          </label>
          <label class="policy-field">
            <span>接口地址</span>
            <input
              type="url"
              placeholder="https://your-llm-gateway/v1"
              :value="analysisSettings.llm.endpoint"
              @change="analysisSettings.setLlm({ endpoint: ($event.target as HTMLInputElement).value })"
            />
          </label>
          <label class="policy-field">
            <span>模型名称</span>
            <input
              type="text"
              placeholder="例如 qwen-plus"
              :value="analysisSettings.llm.model"
              @change="analysisSettings.setLlm({ model: ($event.target as HTMLInputElement).value })"
            />
          </label>
          <label class="policy-field">
            <span>API Key（仅本次会话）</span>
            <input
              type="password"
              autocomplete="off"
              placeholder="不会写入本地存储"
              :value="analysisSettings.llmApiKey"
              @input="analysisSettings.llmApiKey = ($event.target as HTMLInputElement).value"
            />
          </label>
        </div>
        <p class="hint-text">
          当前版本只提供配置位：未配置外部密钥时不会发起任何 LLM 请求，事件抽取、情绪与阶段全部由本地规则完成。
        </p>
      </div>
    </details>
  </section>
</template>

<style scoped>
.flatten-panel :deep(.card) {
  border: 0;
  background: transparent;
  padding: 0;
}
</style>
