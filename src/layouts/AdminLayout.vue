<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowDown, Expand, Fold, Setting, SwitchButton } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import { MOCK_BANNER_TEXT } from '@/mock/constants';
import { IS_BACKEND_MODE } from '@/config';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const collapsed = ref(false);

const displayName = computed(() => userStore.user?.name ?? '未登录');
const avatarText = computed(() => displayName.value.slice(0, 1) || '管');
const pageTitle = computed(() => (route.meta.title as string | undefined) ?? '系统管理');
const isAdmin = computed(() => userStore.isAdmin);

function toggleCollapse(): void {
  collapsed.value = !collapsed.value;
}

async function handleCommand(command: string): Promise<void> {
  if (command !== 'logout') return;
  try {
    await ElMessageBox.confirm('退出后需要重新登录，是否继续？', '退出登录', {
      confirmButtonText: '退出登录',
      cancelButtonText: '取消',
      type: 'warning'
    });
  } catch {
    return;
  }
  userStore.logout();
  ElMessage.success('已退出登录');
  void router.replace('/login');
}
</script>

<template>
  <div class="admin-shell" :class="{ 'is-collapsed': collapsed }">
    <aside class="admin-aside">
      <div class="brand">
        <div class="brand__mark">TC</div>
        <div v-show="!collapsed" class="brand__meta">
          <strong>投流统计平台</strong>
          <span>管理端 · Admin Console</span>
        </div>
      </div>

      <nav class="nav">
        <div v-show="!collapsed" class="nav__group-label">系统配置</div>
        <RouterLink
          to="/admin"
          class="nav-item"
          :class="{ 'is-active': route.path === '/admin' || route.name === 'admin' }"
        >
          <el-icon class="nav-item__icon"><Setting /></el-icon>
          <span v-show="!collapsed" class="nav-item__text">系统管理</span>
          <span v-show="!collapsed" class="nav-item__badge">管理员</span>
        </RouterLink>
      </nav>

      <div class="aside-foot">
        <span v-show="!collapsed" class="aside-foot__label">{{ IS_BACKEND_MODE ? '真实后端模式' : '模拟数据模式' }}</span>
        <span v-show="!collapsed" class="aside-foot__version">{{ IS_BACKEND_MODE ? 'v0.1.0 · API 直连' : 'v0.1.0 · 本地演示' }}</span>
      </div>
    </aside>

    <div class="admin-main">
      <header class="admin-header">
        <div class="admin-header__left">
          <button class="collapse-btn" type="button" :aria-label="collapsed ? '展开侧边栏' : '收起侧边栏'" @click="toggleCollapse">
            <el-icon><Expand v-if="collapsed" /><Fold v-else /></el-icon>
          </button>
          <div class="crumb">
            <span class="crumb__root">管理端</span>
            <span class="crumb__sep">/</span>
            <span class="crumb__current">{{ pageTitle }}</span>
          </div>
        </div>

        <div class="admin-header__right">
          <span class="mock-pill" :title="IS_BACKEND_MODE ? '当前连接真实后端' : MOCK_BANNER_TEXT">{{ IS_BACKEND_MODE ? '真实后端' : '模拟数据' }}</span>
          <el-dropdown trigger="click" @command="handleCommand">
            <button class="user-chip" type="button">
              <span class="user-chip__avatar">{{ avatarText }}</span>
              <span class="user-chip__meta">
                <strong>{{ displayName }}</strong>
                <em>{{ isAdmin ? '管理员' : '普通用户' }}</em>
              </span>
              <el-icon class="user-chip__arrow"><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>账号：{{ userStore.user?.account ?? '—' }}</el-dropdown-item>
                <el-dropdown-item command="logout" divided>
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="admin-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-shell {
  display: flex;
  min-height: 100vh;
  background: var(--color-bg);
}

/* ===== 侧边栏 ===== */
.admin-aside {
  display: flex;
  flex-direction: column;
  width: 240px;
  flex-shrink: 0;
  background: var(--color-primary);
  color: rgba(255, 255, 255, 0.82);
  transition: width 0.2s ease;
  position: sticky;
  top: 0;
  height: 100vh;
}

.admin-shell.is-collapsed .admin-aside {
  width: 64px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.brand__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 3px;
}

.brand__meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.brand__meta strong {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
}

.brand__meta span {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
}

.nav {
  flex: 1;
  padding: 16px 12px;
  overflow-y: auto;
}

.nav__group-label {
  padding: 0 8px 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.48);
  letter-spacing: 0.5px;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 12px;
  border-radius: 2px;
  color: rgba(255, 255, 255, 0.78);
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.admin-shell.is-collapsed .nav-item {
  justify-content: center;
  padding: 0;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.nav-item.is-active {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
}

.nav-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 2px;
  background: #ffffff;
  border-radius: 1px;
}

.nav-item__icon {
  font-size: 16px;
  flex-shrink: 0;
}

.nav-item__text {
  flex: 1;
  font-size: 14px;
}

.nav-item__badge {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  padding: 0 4px;
  line-height: 16px;
  white-space: nowrap;
}

.aside-foot {
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.aside-foot__label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.66);
}

.aside-foot__version {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

/* ===== 主区域 ===== */
.admin-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 24px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.admin-header__left,
.admin-header__right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.collapse-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 2px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 15px;
}

.collapse-btn:hover {
  color: var(--color-primary);
  border-color: var(--color-accent);
}

.crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  line-height: 20px;
}

.crumb__root {
  color: var(--color-text-muted);
}

.crumb__sep {
  color: var(--color-border);
}

.crumb__current {
  color: var(--color-text);
  font-weight: 500;
}

.mock-pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  font-size: 12px;
  line-height: 18px;
  color: var(--color-warning);
  background: #fbf3e5;
  border: 1px solid #f0dfc0;
  border-radius: 2px;
  white-space: nowrap;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 2px;
  cursor: pointer;
  font-family: inherit;
}

.user-chip:hover {
  border-color: var(--color-border);
  background: var(--color-bg);
}

.user-chip__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 500;
  color: #ffffff;
  background: var(--color-accent);
  border-radius: 50%;
}

.user-chip__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 16px;
}

.user-chip__meta strong {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
}

.user-chip__meta em {
  font-size: 11px;
  font-style: normal;
  color: var(--color-text-muted);
}

.user-chip__arrow {
  font-size: 12px;
  color: var(--color-text-muted);
}

.admin-content {
  flex: 1;
  padding: 24px;
  width: 100%;
  max-width: 1680px;
  margin: 0 auto;
}
</style>
