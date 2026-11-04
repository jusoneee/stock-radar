<script setup lang="ts">
import type { NewsAnalysis } from '@/types'
import { adviceLabels, eventTypeLabels, sentimentLabels, stageLabels } from '@/lib/labels'
import { formatRelativeTime } from '@/lib/format'

defineProps<{
  items: NewsAnalysis[]
  emptyText?: string
}>()

const emit = defineEmits<{ (event: 'select-symbol', symbol: string): void }>()
</script>

<template>
  <ol v-if="items.length > 0" class="timeline">
    <li v-for="item in items" :key="item.newsId" class="timeline-item">
      <span class="timeline-dot" :class="`dot-${item.sentiment}`" />
      <div class="timeline-body">
        <div class="timeline-head">
          <h4>{{ item.title }}</h4>
          <time>{{ formatRelativeTime(item.publishedAt) }}</time>
        </div>
        <p class="timeline-content">{{ item.content }}</p>
        <div class="tag-row">
          <span class="tag tag-event">{{ eventTypeLabels[item.eventType] }}</span>
          <span class="badge small" :class="`tone-${sentimentLabels[item.sentiment].tone}`">
            {{ sentimentLabels[item.sentiment].text }}
          </span>
          <span class="badge small" :class="`tone-${stageLabels[item.stage].tone}`">
            {{ stageLabels[item.stage].text }}
          </span>
          <span class="badge small" :class="`tone-${adviceLabels[item.advice].tone}`">
            建议：{{ adviceLabels[item.advice].text }}
          </span>
          <span class="tag">置信度 {{ (item.confidence * 100).toFixed(0) }}%</span>
          <span class="tag">观察窗口 {{ item.impactWindow }} 个交易日</span>
        </div>
        <div class="timeline-detail">
          <p><span>阶段判定：</span>{{ item.stageReason }}</p>
          <p><span>时机建议：</span>{{ item.adviceReason }}</p>
          <p v-if="item.keywords.length > 0"><span>命中关键词：</span>{{ item.keywords.join(' / ') }}</p>
        </div>
        <div v-if="item.symbols.length > 0" class="tag-row">
          <button
            v-for="symbol in item.symbols"
            :key="symbol"
            class="symbol-chip"
            type="button"
            @click="emit('select-symbol', symbol)"
          >
            关联 {{ symbol }}
          </button>
        </div>
      </div>
    </li>
  </ol>
  <p v-else class="empty-text">{{ emptyText ?? '暂无新闻事件' }}</p>
</template>
