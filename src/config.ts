/**
 * 数据源配置
 * - .env（默认）：VITE_USE_MOCK=true，使用浏览器 localStorage 假数据
 * - .env.backend：VITE_USE_MOCK=false，走 Vite 代理连接真实后端（见 vite.config.ts 的 VITE_API_PROXY_TARGET）
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
export const IS_BACKEND_MODE = !USE_MOCK;
