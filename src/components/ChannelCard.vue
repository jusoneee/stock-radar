<script setup lang="ts">
import { computed } from 'vue'
import type { ChannelMeta } from '@/types'
import type { ChannelTestResult } from '@/lib/channel-test'

const props = defineProps<{
  meta: ChannelMeta
  enabled: boolean
  weight: number
  apiKey: string
  normalizedWeight: number
  /** False when this deployment cannot reach the provider (e.g. proxy-only in static builds). */
  available?: boolean
  unavailableReason?: string
  testing?: boolean
  testResult?: ChannelTestResult | null
}>()

const emit = defineEmits<{
  (event: 'update:enabled', value: boolean): void
  (event: 'update:weight', value: number): void
  (event: 'update:apiKey', value: string): void
  (event: 'test'): void
}>()

const docsHost = computed(() => {
  if (!props.meta.docsUrl) return ''
  try {
    return new URL(props.meta.docsUrl).hostname
  } catch {
    return ''
  }
})

const scopeText = computed(() =>
  props.meta.kind === 'quote'
    ? '仅用于该渠道的行情请求，参与主行情序列与收盘价交叉校验。'
    : '仅用于该新闻源的资讯请求，影响事件驱动分项。',
)

const availabilityHint = computed(() => {
  if (props.available === false) return props.unavailableReason || '当前部署下该渠道不可用。'
  if (props.meta.requiresKey && !props.apiKey.trim()) return '未填写密钥时该渠道会被跳过，不会返回模拟数据。'
  return '具备启用条件，可点击「测试连接」做一次实时校验。'
})

function onToggle(): void {
  if (props.available === false) return
  emit('update:enabled', !props.enabled)
}

function onWeight(event: Event): void {
  emit('update:weight', Number((event.target as HTMLInputElement).value))
}

function onKey(event: Event): void {
  emit('update:apiKey', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <article class="channel-card" :class="{ 'is-off': !enabled || available === false }">
    <header class="channel-head">
      <div>
        <h3>{{ meta.name }}</h3>
        <p class="channel-provider">{{ meta.provider }}</p>
      </div>
      <button
        type="button"
        class="switch"
        :class="{ 'is-on': enabled && available !== false }"
        :aria-pressed="enabled && available !== false"
        :disabled="available === false"
        @click="onToggle"
      >
        <span />
      </button>
    </header>

    <p class="channel-desc">{{ meta.description }}</p>

    <div class="channel-meta">
      <span class="tag">{{ meta.kind === 'quote' ? '行情源' : '新闻源' }}</span>
      <span class="tag">可靠度 {{ (meta.reliability * 100).toFixed(0) }}%</span>
      <span class="tag">延时 {{ meta.latencyMs }}ms</span>
      <span v-if="meta.simulated" class="tag tag-mock">模拟数据</span>
      <span v-else class="tag tag-live">真实数据</span>
      <span v-if="meta.requiresKey" class="tag tag-key">需密钥</span>
      <span v-if="available === false" class="tag tag-key">纯静态不可用</span>
    </div>
    <p v-if="available === false && unavailableReason" class="channel-rate">{{ unavailableReason }}</p>
    <p v-else-if="meta.rateLimit" class="channel-rate">{{ meta.rateLimit }}</p>

    <div class="weight-row">
      <label :for="`weight-${meta.id}`">权重</label>
      <input
        :id="`weight-${meta.id}`"
        type="range"
        min="0.05"
        max="1"
        step="0.05"
        :value="weight"
        :disabled="!enabled || available === false"
        @input="onWeight"
      />
      <span class="weight-value">{{ weight.toFixed(2) }}</span>
    </div>
    <p class="weight-hint">
      同类型渠道归一化后占比约 {{ (normalizedWeight * 100).toFixed(0) }}%
    </p>

    <template v-if="meta.requiresKey">
      <label class="key-row">
        <span>{{ meta.kind === 'quote' ? 'Token' : 'API Key' }}</span>
        <input
          type="password"
          autocomplete="off"
          placeholder="仅保存在本机浏览器，勿填生产密钥"
          :value="apiKey"
          @input="onKey"
        />
      </label>
      <p v-if="meta.keyHint" class="key-hint">{{ meta.keyHint }}</p>

      <details class="key-guide">
        <summary>如何获取与填写</summary>
        <ul>
          <li>
            获取入口：
            <template v-if="meta.docsUrl">
              <a :href="meta.docsUrl" target="_blank" rel="noopener noreferrer">{{ docsHost || '官方站点' }}</a>
              注册并登录后，在开放平台或控制台中申请密钥；具体入口与资质要求以官方文档为准。
            </template>
            <template v-else>该渠道未提供公开申请入口，请向服务商索取凭据。</template>
          </li>
          <li>填写格式：直接粘贴密钥原文，前后空格会被忽略；不要加引号，也不要加 <code>Bearer</code> 前缀。</li>
          <li>生效范围：{{ scopeText }}</li>
          <li>不可用提示：{{ availabilityHint }}</li>
        </ul>
      </details>

      <p class="key-warn">密钥仅存于本机浏览器，静态站点无法保证密钥安全，勿填生产密钥。</p>
    </template>

    <div class="test-row">
      <button class="btn btn-mini" type="button" :disabled="testing || available === false" @click="emit('test')">
        {{ testing ? '测试中…' : '测试连接' }}
      </button>
      <span v-if="testResult" class="test-text" :class="testResult.ok ? 'is-ok' : 'is-fail'">
        {{ testResult.ok ? '通过' : '失败' }} · {{ testResult.message }}（{{ testResult.elapsedMs }}ms）
      </span>
      <span v-else class="test-text is-idle">用 600519 / 000001 做一次实时校验</span>
    </div>
  </article>
</template>

<style scoped>
.key-guide {
  margin: 8px 0 0;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-size: 11.5px;
  color: var(--text-soft);
}

.key-guide summary {
  padding: 6px 9px;
  color: var(--accent);
  cursor: pointer;
  font-size: 11.5px;
}

.key-guide ul {
  margin: 0;
  padding: 0 12px 9px 24px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  line-height: 1.55;
}

.key-guide a {
  color: var(--accent);
  text-decoration: underline;
}

.key-guide code {
  padding: 0 3px;
  border-radius: 4px;
  background: var(--surface-3);
  font-size: 10.5px;
}

.key-warn {
  margin: 6px 0 0;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--warn-text);
}

.test-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px dashed var(--border);
}

.test-text {
  flex: 1;
  min-width: 0;
  font-size: 10.5px;
  line-height: 1.5;
  word-break: break-word;
}

.test-text.is-ok {
  color: var(--down);
}

.test-text.is-fail {
  color: var(--up);
}

.test-text.is-idle {
  color: var(--muted);
}
</style>
