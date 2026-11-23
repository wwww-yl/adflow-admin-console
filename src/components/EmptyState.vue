<script setup lang="ts">
withDefaults(
  defineProps<{
    description?: string;
    hint?: string;
  }>(),
  {
    description: '暂无数据',
    hint: ''
  }
);
</script>

<template>
  <div class="empty-state">
    <span class="empty-state__mark" aria-hidden="true">▦</span>
    <p class="empty-state__text">{{ description }}</p>
    <span v-if="hint" class="empty-state__hint">{{ hint }}</span>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 120px;
  color: var(--color-text-secondary);
  text-align: center;
}

.empty-state__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  font-size: 18px;
  color: #8fa3b8;
  background: var(--color-bg);
  border: 1px dashed var(--color-border);
  border-radius: 50%;
}

.empty-state__text {
  font-size: 13px;
  line-height: 20px;
  color: var(--color-text-secondary);
}

.empty-state__hint {
  font-size: 12px;
  line-height: 18px;
  color: var(--color-text-muted);
}
</style>
