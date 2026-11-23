<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Collection,
  InfoFilled,
  MagicStick,
  RefreshRight,
  Shop,
  Tickets,
  User
} from '@element-plus/icons-vue';
import { resetDemoData } from '@/api/system';
import { COMPLETION_RATE_HINT, MOCK_BANNER_TEXT } from '@/mock/constants';
import { IS_BACKEND_MODE } from '@/config';
import { errorMessage } from '@/utils/error';
import UsersTab from './admin/UsersTab.vue';
import VendorsTab from './admin/VendorsTab.vue';
import MockTab from './admin/MockTab.vue';
import DictTab from './admin/DictTab.vue';
import LogsTab from './admin/LogsTab.vue';

const activeTab = ref('users');
const refreshing = ref(false);
const resetting = ref(false);
/** 自增后各页签重新拉取数据（重置演示数据后使用） */
const refreshToken = ref(0);

const tabs = [
  { name: 'users', label: '用户管理', icon: User },
  { name: 'vendors', label: '厂商管理', icon: Shop },
  { name: 'mock', label: '模拟参数', icon: MagicStick },
  { name: 'dicts', label: '字典配置', icon: Collection },
  { name: 'logs', label: '操作日志', icon: Tickets }
];

async function handleResetDemo(): Promise<void> {
  if (IS_BACKEND_MODE) {
    ElMessage.warning('真实后端模式不提供演示数据重置，请使用 mock 模式演示');
    return;
  }
  if (resetting.value) return;
  try {
    await ElMessageBox.confirm(
      '将清空当前浏览器中的本地模拟数据，并恢复为演示初始状态（预置厂商、计划与主计划模拟数据）。该操作会写入操作日志，是否继续？',
      '重置演示数据',
      {
        confirmButtonText: '重置演示数据',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );
  } catch {
    return;
  }
  resetting.value = true;
  try {
    await resetDemoData();
    refreshToken.value += 1;
    activeTab.value = 'users';
    ElMessage.success('演示数据已恢复初始状态');
  } catch (error) {
    ElMessage.error(errorMessage(error, '重置演示数据失败'));
  } finally {
    resetting.value = false;
  }
}

onMounted(() => {
  // 预留：管理页打开时不需要额外请求，各页签 lazy 加载时自行拉取
  refreshing.value = false;
});
</script>

<template>
  <div class="admin-page">
    <header class="page-head">
      <div class="page-head__meta">
        <p class="page-head__eyebrow">2026 年太仓分公司全域融数 · 管理端</p>
        <h1 class="page-head__title">系统管理</h1>
        <p class="page-head__desc">
          集中维护用户账号、厂商主数据、模拟数据参数、渠道与指标字典，所有管理动作都会写入操作日志。
        </p>
      </div>
      <div class="page-head__actions">
        <el-button
          :icon="RefreshRight"
          :loading="resetting"
          :disabled="IS_BACKEND_MODE"
          :title="IS_BACKEND_MODE ? '真实后端模式不提供演示数据重置' : ''"
          @click="handleResetDemo"
        >
          重置演示数据
        </el-button>
      </div>
    </header>

    <div class="mock-banner">
      <el-icon class="mock-banner__icon"><InfoFilled /></el-icon>
      <span class="mock-banner__text">
        {{ IS_BACKEND_MODE ? '当前连接真实后端：数据由投流统计平台 API 提供，写操作会真实落库' : MOCK_BANNER_TEXT }}
      </span>
      <span class="mock-banner__divider" />
      <span class="mock-banner__hint">
        {{ IS_BACKEND_MODE ? '数据来源 /api/v1（开发环境经 Vite 代理转发到后端）' : COMPLETION_RATE_HINT }}
      </span>
    </div>

    <div class="admin-panel">
      <el-tabs v-model="activeTab" class="admin-tabs">
        <el-tab-pane v-for="tab in tabs" :key="tab.name" :name="tab.name" lazy>
          <template #label>
            <span class="tab-label">
              <el-icon><component :is="tab.icon" /></el-icon>
              {{ tab.label }}
            </span>
          </template>

          <UsersTab v-if="tab.name === 'users'" :refresh-token="refreshToken" />
          <VendorsTab v-else-if="tab.name === 'vendors'" :refresh-token="refreshToken" />
          <MockTab v-else-if="tab.name === 'mock'" :refresh-token="refreshToken" />
          <DictTab v-else-if="tab.name === 'dicts'" :refresh-token="refreshToken" />
          <LogsTab v-else :refresh-token="refreshToken" />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1560px;
  margin: 0 auto;
}

.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.page-head__eyebrow {
  font-size: 12px;
  line-height: 18px;
  letter-spacing: 0.5px;
  color: var(--color-text-muted);
}

.page-head__title {
  margin-top: 2px;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  color: var(--color-text);
}

.page-head__desc {
  margin-top: 4px;
  font-size: 13px;
  line-height: 20px;
  color: var(--color-text-secondary);
}

.page-head__actions {
  display: flex;
  gap: 8px;
}

.mock-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  font-size: 12px;
  line-height: 18px;
  color: #8a5b0b;
  background: #fdf8ef;
  border: 1px solid #f0e0c2;
  border-radius: 2px;
}

.mock-banner__icon {
  font-size: 14px;
  flex-shrink: 0;
}

.mock-banner__text {
  font-weight: 500;
}

.mock-banner__divider {
  width: 1px;
  height: 12px;
  background: #e6d3b0;
}

.mock-banner__hint {
  color: #9b7a3f;
}

.admin-panel {
  padding: 4px 20px 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 2px;
}

.admin-tabs :deep(.el-tabs__header) {
  margin-bottom: 20px;
  border-bottom-color: var(--color-border-light);
}

.admin-tabs :deep(.el-tabs__item) {
  height: 48px;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.admin-tabs :deep(.el-tabs__item.is-active) {
  color: var(--color-primary);
  font-weight: 500;
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tab-label .el-icon {
  font-size: 14px;
}
</style>
