import axios from 'axios';
import type { AxiosError, AxiosInstance } from 'axios';
import type { ApiResult } from '@/types';
import { mockAdapter } from '@/mock/adapter';

export const TOKEN_KEY = 'adflow.token';
export const USER_KEY = 'adflow.user';

const useMock = import.meta.env.VITE_USE_MOCK !== 'false';

/** 统一业务异常：message 可直接展示给用户 */
export class ApiError extends Error {
  code: number;

  constructor(message: string, code = -1) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

function createTraceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function clearSessionStorage(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

const http: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
  ...(useMock ? { adapter: mockAdapter } : {})
});

http.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['X-Trace-Id'] = createTraceId();
  return config;
});

http.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResult<unknown> | null;
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) {
        // 拦截器统一解包业务数据，调用方拿到的就是 data 本身
        return body.data as unknown as typeof response;
      }
      return Promise.reject(new ApiError(body.message || '请求失败', body.code));
    }
    return response.data as unknown as typeof response;
  },
  (error: AxiosError<ApiResult<unknown>>) => {
    if (error.response?.status === 401) {
      clearSessionStorage();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth:expired'));
      }
      return Promise.reject(new ApiError('登录状态已失效，请重新登录', 401));
    }
    const message =
      error.response?.data?.message ||
      (error.code === 'ECONNABORTED' ? '请求超时，请稍后重试' : '网络异常，请检查网络后重试');
    return Promise.reject(new ApiError(message, error.response?.status ?? -1));
  }
);

export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const data = (await http.get(url, { params })) as unknown;
  return data as T;
}

export async function post<T>(url: string, payload?: unknown): Promise<T> {
  const data = (await http.post(url, payload)) as unknown;
  return data as T;
}

export async function put<T>(url: string, payload?: unknown): Promise<T> {
  const data = (await http.put(url, payload)) as unknown;
  return data as T;
}

export async function del<T>(url: string): Promise<T> {
  const data = (await http.delete(url)) as unknown;
  return data as T;
}

export default http;
