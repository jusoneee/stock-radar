<script setup lang="ts">
import { computed } from 'vue'
import type { NewsAnalysis } from '@/types'
import { sentimentLabels, stageLabels, toneClass } from '@/lib/labels'

const props = defineProps<{
  news: NewsAnalysis[]
  rawCount: number
  failed: string[]
  loading?: boolean
  compact?: boolean
}>()

const distribution = computed(() => {
  const counts = { positive: 0, neutral: 0, negative: 0 }
  for (const item of props.news) counts[item.sentiment] += 1
  const total = props.news.length || 1
  return (['positive', 'neutral', 'negative'] as const).map((key) => ({
    key,
    label: sentimentLabels[key].text,
    count: counts[key],
    share: Math.round((counts[key] / total) * 100),
    tone: sentimentLabels[key].tone,
  }))
})

const stages = computed(() => {
  const counts = new Map<string, number>()
  for (const item of props.news) counts.set(item.stage, (counts.get(item.stage) ?? 0) + 1)
  return Array.from(counts.entries()).map(([stage, count]) => ({
    stage,
    label: stageLabels[stage as keyof typeof stageLabels]?.text ?? stage,
    count,
  }))
})

const latest = computed(() => props.news[0] ?? null)
const visible = computed(() => (props.compact ? props.news.slice(0, 2) : props.news))
</script>

<template>
  <section class="news-panel">
    <header class="news-head">
      <h2>相关资讯与舆情 <span class="muted">{{ news.length }} 条命中 / 原始 {{ rawCount }} 条</span></h2>
    </header>

    <p v-if="loading" class="hint-text">正在聚合已启用的新闻源…</p>
    <template v-else>
      <div v-if="news.length === 0" class="news-empty">
        <strong>暂无相关资讯</strong>
        <span>已抓取 {{ rawCount }} 条市场资讯，但没有任何一条被映射到该股票；可能是指标股曝光度低或新闻源暂未覆盖。</span>
      </div>

      <template v-else>
        <div class="sentiment-row">
          <span
            v-for="item in distribution"
            :key="item.key"
            class="sentiment-chip"
            :class="toneClass(item.tone)"
          >
            {{ item.label }} {{ item.count }} 条 · {{ item.share }}%
          </span>
        </div>
        <div v-if="stages.length" class="stage-row">
          <span v-for="item in stages" :key="item.stage" class="tag">{{ item.label }} {{ item.count }}</span>
        </div>

        <p v-if="latest" class="latest">
          最近舆论：{{ latest.title }}（{{ latest.stageReason }}；{{ latest.adviceReason }}）
        </p>

        <ul class="news-list">
          <li v-for="item in visible" :key="item.newsId" class="news-item">
            <div class="news-title-line">
              <span>{{ item.title }}</span>
              <span class="tag" :class="toneClass(sentimentLabels[item.sentiment].tone)">
                {{ sentimentLabels[item.sentiment].text }}
              </span>
            </div>
            <p class="news-meta">
              {{ item.publishedAt.slice(0, 16).replace('T', ' ') }} · 来源 {{ item.sourceId }} ·
              {{ stageLabels[item.stage].text }} · 置信度 {{ Math.round(item.confidence * 100) }}%
              <template v-if="item.duplicateCount > 1"> · {{ item.duplicateCount }} 家报道</template>
              <template v-if="item.stale"> · 可能已过期</template>
            </p>
          </li>
        </ul>
      </template>

      <p v-if="failed.length" class="source-fail">
        部分新闻源失败：{{ failed.join('；') }}
      </p>
    </template>
  </section>
</template>

<style scoped>
.news-panel {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}

.news-head h2 {
  margin: 0 0 8px;
  font-size: 16px;
}

.news-empty {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: 10px;
  background: var(--surface-2, #f8fafc);
  color: #475569;
  font-size: 13px;
}

.news-empty strong {
  color: #0f172a;
}

.sentiment-row,
.stage-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0;
}

.sentiment-chip {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: #f1f5f9;
}

.latest {
  margin: 8px 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f8fafc;
  font-size: 13px;
  line-height: 1.6;
  color: #334155;
}

.news-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}

.news-item {
  padding: 8px 0;
  border-bottom: 1px dashed var(--border);
}

.news-title-line {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
  font-size: 13px;
  line-height: 1.5;
}

.news-title-line a {
  color: inherit;
  text-decoration: none;
}

.news-meta {
  margin: 2px 0 0;
  font-size: 11px;
  color: #7c889e;
}

.source-fail {
  margin-top: 8px;
  font-size: 12px;
  color: #b42318;
}

.tone-up {
  color: #c0392b;
}

.tone-down {
  color: #0f8a55;
}

.tone-neutral {
  color: #475569;
}

.tone-warn {
  color: #b45309;
}
</style>
