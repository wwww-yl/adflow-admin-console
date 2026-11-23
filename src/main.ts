import { createApp } from 'vue';
import ElementPlus, { ElMessage } from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import '@/styles/index.css';
import App from './App.vue';
import { pinia } from '@/stores';
import { useUserStore } from '@/stores/user';
import { router } from '@/router';
import { permDirective } from '@/directives/perm';

const app = createApp(App);

app.use(pinia);
app.use(router);
app.use(ElementPlus, { locale: zhCn });
app.directive('perm', permDirective);
app.mount('#app');

/** 统一处理登录态失效（响应拦截器派发事件） */
window.addEventListener('auth:expired', () => {
  const userStore = useUserStore(pinia);
  userStore.clearSession();
  ElMessage.warning('登录状态已失效，请重新登录');
  const current = router.currentRoute.value;
  if (current.name !== 'login') {
    void router.replace({ path: '/login', query: { redirect: current.fullPath } });
  }
});
