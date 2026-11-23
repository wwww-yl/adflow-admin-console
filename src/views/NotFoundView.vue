<script setup lang="ts">
import { useRouter } from 'vue-router';
import { Back } from '@element-plus/icons-vue';

const router = useRouter();

function goHome(): void {
  void router.replace('/');
}
</script>

<template>
  <div class="state-page">
    <div class="state-card">
      <p class="state-card__code">404</p>
      <h1>页面不存在</h1>
      <p class="state-card__desc">你访问的地址不存在或已被移除，请检查链接后重试。</p>
      <div class="state-card__actions">
        <el-button type="primary" :icon="Back" @click="goHome">返回管理端</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.state-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--color-bg);
}

.state-card {
  width: 100%;
  max-width: 480px;
  padding: 40px 36px;
  text-align: center;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 3px;
}

.state-card__code {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 48px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 4px;
  color: var(--color-primary-light);
}

.state-card h1 {
  margin-top: 8px;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  color: var(--color-text);
}

.state-card__desc {
  margin-top: 12px;
  font-size: 13px;
  line-height: 22px;
  color: var(--color-text-secondary);
}

.state-card__actions {
  margin-top: 24px;
}
</style>
