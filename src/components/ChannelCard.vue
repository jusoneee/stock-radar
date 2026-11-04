<script setup lang="ts">
import type { ChannelMeta } from '@/types'

const props = defineProps<{
  meta: ChannelMeta
  enabled: boolean
  weight: number
  apiKey: string
  normalizedWeight: number
}>()

const emit = defineEmits<{
  (event: 'update:enabled', value: boolean): void
  (event: 'update:weight', value: number): void
  (event: 'update:apiKey', value: string): void
}>()

function onToggle(): void {
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
  <article class="channel-card" :class="{ 'is-off': !enabled }">
    <header class="channel-head">
      <div>
        <h3>{{ meta.name }}</h3>
        <p class="channel-provider">{{ meta.provider }}</p>
      </div>
      <button
        type="button"
        class="switch"
        :class="{ 'is-on': enabled }"
        :aria-pressed="enabled"
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
    </div>
    <p v-if="meta.rateLimit" class="channel-rate">{{ meta.rateLimit }}</p>

    <div class="weight-row">
      <label :for="`weight-${meta.id}`">权重</label>
      <input
        :id="`weight-${meta.id}`"
        type="range"
        min="0.05"
        max="1"
        step="0.05"
        :value="weight"
        :disabled="!enabled"
        @input="onWeight"
      />
      <span class="weight-value">{{ weight.toFixed(2) }}</span>
    </div>
    <p class="weight-hint">
      同类型渠道归一化后占比约 {{ (normalizedWeight * 100).toFixed(0) }}%
    </p>

    <label v-if="meta.requiresKey" class="key-row">
      <span>访问密钥</span>
      <input
        type="password"
        autocomplete="off"
        placeholder="仅保存在当前页面内存，刷新即清除"
        :value="apiKey"
        @input="onKey"
      />
    </label>
    <p v-if="meta.requiresKey && meta.keyHint" class="key-hint">{{ meta.keyHint }}</p>
  </article>
</template>
