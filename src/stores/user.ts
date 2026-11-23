import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { LoginResult, Role, User } from '@/types';
import { login as loginApi } from '@/api/auth';
import { TOKEN_KEY, USER_KEY } from '@/api/request';

const FAIL_COUNT_KEY = 'adflow.login.fail';
const LOCK_UNTIL_KEY = 'adflow.login.lockedUntil';
const MAX_FAILURES = 3;
const LOCK_SECONDS = 60;

const ADMIN_PERMISSIONS = [
  'user:manage',
  'vendor:manage',
  'mock:manage',
  'dict:manage',
  'log:view',
  'demo:reset'
];

function readStoredUser(): User | null {
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function readNumber(key: string): number {
  const raw = sessionStorage.getItem(key);
  return raw ? Number(raw) || 0 : 0;
}

export const useUserStore = defineStore('user', () => {
  const token = ref<string>(sessionStorage.getItem(TOKEN_KEY) ?? '');
  const user = ref<User | null>(readStoredUser());
  const failCount = ref<number>(readNumber(FAIL_COUNT_KEY));
  const lockedUntil = ref<number>(readNumber(LOCK_UNTIL_KEY));

  const isLoggedIn = computed(() => Boolean(token.value) && user.value !== null);
  const isAdmin = computed(() => user.value?.role === 'admin');
  const roleLabel = computed(() => (user.value?.role === 'admin' ? '管理员' : '普通用户'));
  const permissions = computed<string[]>(() => (user.value?.role === 'admin' ? ADMIN_PERMISSIONS : []));

  function hasPerm(permission: string): boolean {
    return isAdmin.value || permissions.value.includes(permission);
  }

  function persistUser(): void {
    if (user.value) sessionStorage.setItem(USER_KEY, JSON.stringify(user.value));
    else sessionStorage.removeItem(USER_KEY);
  }

  function setSession(result: LoginResult): void {
    token.value = result.token;
    user.value = result.user;
    sessionStorage.setItem(TOKEN_KEY, result.token);
    persistUser();
    clearFailures();
  }

  function clearSession(): void {
    token.value = '';
    user.value = null;
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  }

  function lockRemaining(): number {
    const remain = Math.ceil((lockedUntil.value - Date.now()) / 1000);
    return remain > 0 ? remain : 0;
  }

  function registerFailure(): boolean {
    failCount.value += 1;
    sessionStorage.setItem(FAIL_COUNT_KEY, String(failCount.value));
    if (failCount.value >= MAX_FAILURES) {
      lockedUntil.value = Date.now() + LOCK_SECONDS * 1000;
      sessionStorage.setItem(LOCK_UNTIL_KEY, String(lockedUntil.value));
      return true;
    }
    return false;
  }

  function clearFailures(): void {
    failCount.value = 0;
    lockedUntil.value = 0;
    sessionStorage.removeItem(FAIL_COUNT_KEY);
    sessionStorage.removeItem(LOCK_UNTIL_KEY);
  }

  async function login(account: string, password: string): Promise<LoginResult> {
    const result = await loginApi(account, password);
    setSession(result);
    return result;
  }

  function logout(): void {
    clearSession();
  }

  function updateProfile(payload: Partial<User>): void {
    if (!user.value) return;
    user.value = { ...user.value, ...payload };
    persistUser();
  }

  function roleOf(): Role | null {
    return user.value?.role ?? null;
  }

  return {
    token,
    user,
    isLoggedIn,
    isAdmin,
    roleLabel,
    permissions,
    failCount,
    lockedUntil,
    hasPerm,
    lockRemaining,
    clearFailures,
    registerFailure,
    login,
    logout,
    clearSession,
    updateProfile,
    roleOf
  };
});
