<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Lock } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const userStore = useUserStore();

const accountLabel = computed(() =>
  userStore.user ? `${userStore.user.name}（${userStore.user.account}）` : '未登录'
);

function backToLogin(): void {
  userStore.logout();
  ElMessage.info('已退出当前账号');
  void router.replace('/login');
}

function backToAdmin(): void {
  void router.replace('/admin');
}
</script>

<template>
  <div class="state-page">
    <div class="state-card">
      <div class="state-card__icon">
        <el-icon><Lock /></el-icon>
      </div>
      <p class="state-card__code">403</p>
      <h1>无管理端访问权限</h1>
      <p class="state-card__desc">
        当前账号为普通用户，管理端仅限管理员访问。如需维护用户、厂商与模拟数据，请使用管理员账号登录。
      </p>
      <div class="state-card__account">当前账号：{{ accountLabel }}</div>
      <div class="state-card__actions">
        <el-button type="primary" @click="backToLogin">使用管理员账号登录</el-button>
        <el-button v-if="userStore.isAdmin" @click="backToAdmin">返回管理端</el-button>
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
  max-width: 520px;
  padding: 40px 36px;
  text-align: center;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 3px;
}

.state-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  margin-bottom: 12px;
  font-size: 24px;
  color: var(--color-warning);
  background: #fbf3e5;
  border: 1px solid #f0dfc0;
  border-radius: 50%;
}

.state-card__code {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  letter-spacing: 3px;
  color: var(--color-text-muted);
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

.state-card__account {
  margin-top: 16px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  border-radius: 2px;
}

.state-card__actions {
  margin-top: 24px;
  display: flex;
  justify-content: center;
  gap: 8px;
}

.state-card__actions .el-button .el-icon {
  margin-right: 4px;
}
</style>
