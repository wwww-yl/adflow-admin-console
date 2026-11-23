import type { LoginResult } from '@/types';
import { USE_MOCK } from '@/config';
import { post } from './request';
import { login as loginBackend } from './backend';

export function login(account: string, password: string): Promise<LoginResult> {
  if (!USE_MOCK) return loginBackend(account, password);
  return post<LoginResult>('/auth/login', { account, password });
}
