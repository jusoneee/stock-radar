<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    value: string | number
    hint?: string
    tone?: 'up' | 'down' | 'neutral' | 'warn'
  }>(),
  { hint: '', tone: 'neutral' },
)
</script>

<template>
  <div class="stat-tile" :class="`tone-${tone}`">
    <p class="stat-label">{{ label }}</p>
    <p class="stat-value">{{ value }}</p>
    <p v-if="hint" class="stat-hint">{{ hint }}</p>
  </div>
</template>
