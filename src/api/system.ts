import type {
  AgeDict,
  ChannelDict,
  LogTargetType,
  MetricDict,
  OperationLog,
  Paged,
  Role,
  User,
  Vendor
} from '@/types';
import { USE_MOCK } from '@/config';
import { del, get, post, put } from './request';
import * as backend from './backend';

/* ============================ 用户管理 ============================ */

export interface UserQuery {
  keyword?: string;
  role?: Role | '';
  status?: 0 | 1 | '';
  page: number;
  pageSize: number;
}

export interface CreateUserPayload {
  account: string;
  name: string;
  role: Role;
  password: string;
}

export interface UpdateUserPayload {
  name?: string;
  role?: Role;
  status?: 0 | 1;
}

export function listUsers(query: UserQuery): Promise<Paged<User>> {
  if (!USE_MOCK) return backend.listUsers(query);
  return get<Paged<User>>('/admin/users', { ...query });
}

export function createUser(payload: CreateUserPayload): Promise<User> {
  if (!USE_MOCK) return backend.createUser(payload);
  return post<User>('/admin/users', payload);
}

export function updateUser(id: number, payload: UpdateUserPayload): Promise<User> {
  if (!USE_MOCK) return backend.updateUser(id, payload);
  return put<User>(`/admin/users/${id}`, payload);
}

export function resetUserPassword(id: number): Promise<{ password: string }> {
  if (!USE_MOCK) return backend.resetUserPassword(id);
  return post<{ password: string }>(`/admin/users/${id}/reset-password`);
}

/* ============================ 厂商管理 ============================ */

export interface VendorQuery {
  keyword?: string;
  platform?: string;
  status?: 0 | 1 | '';
  page: number;
  pageSize: number;
}

export interface VendorPayload {
  code: string;
  name: string;
  platform: Vendor['platform'];
  contact: string;
  phone: string;
  remark: string;
}

export function listVendors(query: VendorQuery): Promise<Paged<Vendor>> {
  if (!USE_MOCK) return backend.listVendors(query);
  return get<Paged<Vendor>>('/vendors', { ...query });
}

export function createVendor(payload: VendorPayload): Promise<Vendor> {
  if (!USE_MOCK) return backend.createVendor(payload);
  return post<Vendor>('/vendors', payload);
}

export function updateVendor(id: number, payload: VendorPayload): Promise<Vendor> {
  if (!USE_MOCK) return backend.updateVendor(id, payload);
  return put<Vendor>(`/vendors/${id}`, payload);
}

export function updateVendorStatus(id: number, status: 0 | 1): Promise<Vendor> {
  if (!USE_MOCK) return backend.updateVendorStatus(id, status);
  return put<Vendor>(`/vendors/${id}/status`, { status });
}

export function deleteVendor(id: number): Promise<{ id: number }> {
  if (!USE_MOCK) return backend.deleteVendor(id);
  return del<{ id: number }>(`/vendors/${id}`);
}

/* ============================ 字典管理 ============================ */

export function listChannels(): Promise<ChannelDict[]> {
  if (!USE_MOCK) return backend.listChannels();
  return get<ChannelDict[]>('/admin/dicts/channels');
}

export function updateChannel(code: string, payload: Partial<ChannelDict>): Promise<ChannelDict> {
  if (!USE_MOCK) return backend.updateChannel(code, payload);
  return put<ChannelDict>(`/admin/dicts/channels/${encodeURIComponent(code)}`, payload);
}

export function listAges(): Promise<AgeDict[]> {
  if (!USE_MOCK) return backend.listAges();
  return get<AgeDict[]>('/admin/dicts/ages');
}

export function updateAge(value: string, payload: Partial<AgeDict>): Promise<AgeDict> {
  if (!USE_MOCK) return backend.updateAge(value, payload);
  return put<AgeDict>(`/admin/dicts/ages/${encodeURIComponent(value)}`, payload);
}

export function listMetrics(): Promise<MetricDict[]> {
  if (!USE_MOCK) return backend.listMetrics();
  return get<MetricDict[]>('/admin/dicts/metrics');
}

export function updateMetric(key: string, payload: Partial<MetricDict>): Promise<MetricDict> {
  if (!USE_MOCK) return backend.updateMetric(key, payload);
  return put<MetricDict>(`/admin/dicts/metrics/${encodeURIComponent(key)}`, payload);
}

/* ============================ 操作日志 ============================ */

export interface LogQuery {
  keyword?: string;
  targetType?: LogTargetType | '';
  operatorId?: number;
  startTime?: string;
  endTime?: string;
  page: number;
  pageSize: number;
}

export function listLogs(query: LogQuery): Promise<Paged<OperationLog>> {
  if (!USE_MOCK) return backend.listLogs(query);
  return get<Paged<OperationLog>>('/logs', { ...query });
}

/* ============================ 演示数据 ============================ */

export function resetDemoData(): Promise<{ resetAt: string }> {
  if (!USE_MOCK) return backend.resetDemoData();
  return post<{ resetAt: string }>('/admin/demo/reset');
}
