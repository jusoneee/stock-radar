<script setup lang="ts">
import { computed } from 'vue'
import type { TrendLabel } from '@/types'
import { toneClass, trendLabels } from '@/lib/labels'

const props = defineProps<{ label: TrendLabel; score?: number }>()

const meta = computed(() => trendLabels[props.label])
</script>

<template>
  <span class="badge" :class="toneClass(meta.tone)">
    {{ meta.text }}
    <em v-if="score !== undefined">{{ score }}</em>
  </span>
</template>
