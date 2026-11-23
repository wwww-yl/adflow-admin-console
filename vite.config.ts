import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * - 默认（pnpm dev）：.env，VITE_USE_MOCK=true，前端本地假数据
 * - 真实后端（pnpm dev:backend）：.env.backend，VITE_USE_MOCK=false，
 *   并把 /api 代理到 VITE_API_PROXY_TARGET（见 .env.backend.example）
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000';

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      // 监听所有网卡，同一局域网内的设备可通过 http://<本机IP>:5173 访问；默认 127.0.0.1 仅本机
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true
        }
      },
      watch: {
        // 忽略非源码目录，以及编辑器/工具原子写入时产生的临时目录（Windows 下 Vite watcher 会因 EBUSY 崩溃）
        ignored: [
          '**/docs/**',
          '**/scripts/**',
          '**/dist/**',
          '**/*.tmpdir/**',
          '**/*.tmpdir',
          '**/*.tmp'
        ]
      }
    },
    build: {
      target: 'es2018',
      chunkSizeWarningLimit: 1200
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts']
    }
  };
});
