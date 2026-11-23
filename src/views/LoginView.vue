<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { ArrowRight, Lock, User } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import { DEMO_ACCOUNTS, MOCK_BANNER_TEXT } from '@/mock/constants';
import { IS_BACKEND_MODE } from '@/config';
import { errorMessage } from '@/utils/error';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const formRef = ref<FormInstance>();
const submitting = ref(false);

const form = reactive({
  account: '',
  password: ''
});

const rules: FormRules = {
  account: [{ required: true, message: '请输入登录账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入登录密码', trigger: 'blur' }]
};

const now = ref(Date.now());
let timer: number | undefined;

const lockSeconds = computed(() =>
  Math.max(0, Math.ceil((userStore.lockedUntil - now.value) / 1000))
);

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  if (timer !== undefined) window.clearInterval(timer);
});

function fillDemo(account: string, password: string): void {
  form.account = account;
  form.password = password;
}

async function handleSubmit(): Promise<void> {
  if (lockSeconds.value > 0) {
    ElMessage.warning(`登录尝试过于频繁，请 ${lockSeconds.value} 秒后重试`);
    return;
  }
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;
  submitting.value = true;
  try {
    const result = await userStore.login(form.account.trim(), form.password);
    ElMessage.success(`欢迎回来，${result.user.name}`);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '';
    if (result.user.role === 'admin') {
      void router.replace(redirect || '/admin');
    } else {
      void router.replace('/403');
    }
  } catch (error) {
    const locked = userStore.registerFailure();
    if (locked) {
      ElMessage.error('连续 3 次登录失败，账号已锁定 60 秒');
    } else {
      ElMessage.error(errorMessage(error, '登录失败，请重新输入账号密码'));
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <section class="login-hero">
      <div class="hero-brand">
        <span class="hero-brand__mark">TC</span>
        <span class="hero-brand__name">投流统计平台 · 管理端</span>
      </div>

      <div class="hero-body">
        <p class="hero-eyebrow">2026 年太仓分公司全域融数</p>
        <h1 class="hero-title">管理配置与<br /><em>模拟数据调节</em></h1>
        <p class="hero-desc">
          投放计划、数据回收与看板报表由业务端完成；管理端集中维护用户、厂商主数据、模拟参数、
          字典口径与操作日志。
        </p>

        <ul class="hero-points">
          <li><span class="hero-points__index">01</span>用户账号与身份、厂商主数据维护</li>
          <li><span class="hero-points__index">02</span>模拟参数配置、效果预览与一键生成</li>
          <li><span class="hero-points__index">03</span>渠道 / 年龄段 / 指标口径字典</li>
        </ul>
      </div>

      <div class="hero-foot">
        <span class="hero-foot__dot" />
        <span>{{ IS_BACKEND_MODE ? '真实后端模式：数据来自投流统计平台 API（Vite 代理 /api）' : MOCK_BANNER_TEXT }}</span>
      </div>
    </section>

    <section class="login-panel">
      <div class="login-card">
        <header class="login-card__head">
          <h2>登录管理端</h2>
          <p>管理端仅管理员可访问，普通用户请使用业务端</p>
        </header>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          size="large"
          @submit.prevent="handleSubmit"
        >
          <el-form-item label="登录账号" prop="account">
            <el-input v-model="form.account" placeholder="请输入账号" autocomplete="username">
              <template #prefix>
                <el-icon><User /></el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item label="登录密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              show-password
              autocomplete="current-password"
              @keyup.enter="handleSubmit"
            >
              <template #prefix>
                <el-icon><Lock /></el-icon>
              </template>
            </el-input>
          </el-form-item>

          <div v-if="lockSeconds > 0" class="login-lock">
            连续 3 次登录失败，请 {{ lockSeconds }} 秒后重试
          </div>

          <el-button
            class="login-submit"
            type="primary"
            size="large"
            native-type="submit"
            :loading="submitting"
            :disabled="lockSeconds > 0"
          >
            登录
            <el-icon class="login-submit__icon"><ArrowRight /></el-icon>
          </el-button>
        </el-form>

        <div v-if="!IS_BACKEND_MODE" class="demo-block">
          <div class="demo-block__title">演示账号（本地模拟数据）</div>
          <div v-for="item in DEMO_ACCOUNTS" :key="item.account" class="demo-row">
            <div class="demo-row__meta">
              <span class="demo-row__account">{{ item.account }}</span>
              <span class="demo-row__password">/ {{ item.password }}</span>
              <span class="demo-row__role">{{ item.label }}</span>
            </div>
            <el-button link type="primary" @click="fillDemo(item.account, item.password)">
              使用此账号
            </el-button>
          </div>
        </div>
        <div v-else class="demo-block">
          <div class="demo-block__title">真实后端模式</div>
          <p class="demo-backend-hint">
            当前连接投流统计平台后端（/api 代理）。请使用后端管理员账号登录（默认 root），
            普通用户账号登录后没有管理端权限。
          </p>
        </div>

        <footer class="login-card__foot">
          <template v-if="IS_BACKEND_MODE">
            当前连接真实后端，登录、用户、厂商、计划、模拟数据生成与日志均为后端真实数据。
          </template>
          <template v-else>
            本地模拟数据，不会连接任何真实投放平台；刷新或重置演示数据后可恢复初始状态。
          </template>
        </footer>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  min-height: 100vh;
  background: var(--color-bg);
}

/* ===== 左侧品牌区 ===== */
.login-hero {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 52%;
  max-width: 760px;
  padding: 40px 56px;
  color: #ffffff;
  background:
    radial-gradient(circle at 18% 22%, rgba(255, 255, 255, 0.1), transparent 42%),
    radial-gradient(circle at 82% 78%, rgba(46, 109, 164, 0.55), transparent 46%),
    linear-gradient(135deg, #123456 0%, #17416b 52%, #1d4f80 100%);
  overflow: hidden;
}

.login-hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 48px 48px;
  pointer-events: none;
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.9), transparent 78%);
}

.hero-brand {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 10px;
}

.hero-brand__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 3px;
}

.hero-brand__name {
  font-size: 14px;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.88);
}

.hero-body {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 520px;
  padding-bottom: 40px;
}

.hero-eyebrow {
  margin-bottom: 18px;
  font-size: 12px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
}

.hero-title {
  font-size: 40px;
  font-weight: 600;
  line-height: 54px;
  letter-spacing: 1px;
  color: #ffffff;
}

.hero-title em {
  font-style: normal;
  color: #a8c6e8;
}

.hero-desc {
  margin-top: 20px;
  max-width: 460px;
  font-size: 14px;
  line-height: 24px;
  color: rgba(255, 255, 255, 0.68);
}

.hero-points {
  margin: 32px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hero-points li {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  line-height: 20px;
  color: rgba(255, 255, 255, 0.82);
}

.hero-points__index {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  color: #a8c6e8;
}

.hero-foot {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.52);
}

.hero-foot__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #7fb0e0;
}

/* ===== 右侧登录区 ===== */
.login-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: 32px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  box-shadow: 0 8px 28px rgba(23, 65, 107, 0.06);
}

.login-card__head {
  margin-bottom: 24px;
}

.login-card__head h2 {
  font-size: 22px;
  font-weight: 600;
  line-height: 30px;
  color: var(--color-text);
}

.login-card__head p {
  margin-top: 6px;
  font-size: 13px;
  line-height: 20px;
  color: var(--color-text-secondary);
}

.login-lock {
  margin-bottom: 16px;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 18px;
  color: var(--color-danger);
  background: #fbf0ef;
  border: 1px solid #f0d2cf;
  border-radius: 2px;
}

.login-submit {
  width: 100%;
  margin-top: 4px;
}

.login-submit__icon {
  margin-left: 6px;
}

.demo-block {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px dashed var(--color-border);
}

.demo-block__title {
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.demo-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 2px;
  background: var(--color-bg);
}

.demo-row + .demo-row {
  margin-top: 6px;
}

.demo-backend-hint {
  margin-top: 6px;
  font-size: 12px;
  line-height: 19px;
  color: var(--color-text-secondary);
  text-align: left;
}

.demo-row__meta {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  min-width: 0;
}

.demo-row__account {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 13px;
  color: var(--color-text);
}

.demo-row__password {
  font-family: 'JetBrains Mono', Consolas, monospace;
  color: var(--color-text-secondary);
}

.demo-row__role {
  color: var(--color-text-muted);
}

.login-card__foot {
  margin-top: 24px;
  font-size: 12px;
  line-height: 18px;
  color: var(--color-text-muted);
}

@media (max-width: 1024px) {
  .login-hero {
    display: none;
  }
}
</style>
