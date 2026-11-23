/**
 * 真实后端数据源（投流统计平台 API，OpenAPI 见后端 /api-docs）
 *
 * 本文件把后端的字段与接口约定翻译成管理端内部契约（src/types），
 * 让 5 个管理页签在 VITE_USE_MOCK=false 时无需改动即可工作。
 *
 * 后端与文档附录 A 的差异：
 * - 用户管理实际是 /users（不是 /admin/users），重置密码需要传新密码；
 * - 厂商启停通过 PUT /vendors/{id} 传 status；
 * - 没有字典接口、没有模拟参数「清空 / 批量 / 常用方案 / 调节记录」接口；
 *   字典使用前端内置口径（只读），常用方案存浏览器 localStorage，
 *   调节记录用操作日志里 action=mock_generate 的记录反推；
 * - 没有演示数据重置接口，真实后端模式禁用该按钮。
 */
import dayjs from 'dayjs';
import type {
  AgeDict,
  CampaignRow,
  CampaignStatus,
  ChannelDict,
  CurveType,
  LoginResult,
  LogTargetType,
  MetricDict,
  MockGenerateResult,
  MockMode,
  MockParamsInput,
  MockPreset,
  MockProfile,
  MockRatios,
  MockRecord,
  OperationLog,
  Paged,
  PlatformCode,
  Project,
  Role,
  User,
  Vendor
} from '@/types';
import { DEFAULT_RATIOS } from '@/mock/constants';
import { PLATFORM_LABELS } from '@/utils/domain';
import { hashSeed } from '@/mock/engine';
import { ApiError, del, get, post, put } from './request';

const ADMIN_PERMISSIONS = [
  'user:manage',
  'vendor:manage',
  'mock:manage',
  'dict:manage',
  'log:view',
  'demo:reset'
];

/* ============================ 通用 ============================ */

interface BackendList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

function nowText(): string {
  return dayjs().format('YYYY-MM-DD HH:mm:ss');
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/* ============================ 登录 ============================ */

interface BackendUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
  status?: number;
  lastLoginAt?: string | null;
  createdAt?: string;
}

function mapRole(role: string): Role {
  return role === 'admin' ? 'admin' : 'user';
}

function mapUser(raw: BackendUser): User {
  return {
    id: toNumber(raw.id),
    account: raw.username,
    name: raw.displayName,
    role: mapRole(raw.role),
    status: raw.status === 0 ? 0 : 1,
    createdAt: raw.createdAt ?? '',
    lastLoginAt: raw.lastLoginAt ?? null
  };
}

export async function login(account: string, password: string): Promise<LoginResult> {
  const data = await post<{ token: string; user: BackendUser }>('/auth/login', {
    username: account,
    password
  });
  const user = mapUser({ ...data.user, status: 1 });
  return {
    token: data.token,
    user,
    permissions: user.role === 'admin' ? ADMIN_PERMISSIONS : []
  };
}

/* ============================ 用户管理 ============================ */

export interface BackendUserQuery {
  keyword?: string;
  role?: Role | '';
  status?: 0 | 1 | '';
  page: number;
  pageSize: number;
}

export interface BackendUserPayload {
  account: string;
  name: string;
  role: Role;
  password: string;
}

export async function listUsers(query: BackendUserQuery): Promise<Paged<User>> {
  const data = await get<BackendList<BackendUser>>('/users', {
    keyword: query.keyword || undefined,
    role: query.role || undefined,
    status: query.status === '' || query.status === undefined ? undefined : query.status,
    page: query.page,
    pageSize: query.pageSize
  });
  return { list: data.items.map(mapUser), total: data.total };
}

export async function createUser(payload: BackendUserPayload): Promise<User> {
  const data = await post<BackendUser>('/users', {
    username: payload.account,
    password: payload.password,
    displayName: payload.name,
    role: payload.role,
    status: 1
  });
  return mapUser(data);
}

export async function updateUser(
  id: number,
  payload: { name?: string; role?: Role; status?: 0 | 1 }
): Promise<User> {
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) body.displayName = payload.name;
  if (payload.role !== undefined) body.role = payload.role;
  if (payload.status !== undefined) body.status = payload.status;
  const data = await put<BackendUser>(`/users/${id}`, body);
  return mapUser(data);
}

/** 后端要求管理员提交新密码（6-64 位），这里生成一个随机临时密码返回给前端展示 */
export async function resetUserPassword(id: number): Promise<{ password: string }> {
  const password = `Ad${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}`;
  await post(`/users/${id}/reset-password`, { password });
  return { password };
}

/* ============================ 厂商管理 ============================ */

interface BackendVendor {
  id: string;
  code: string;
  name: string;
  platform: string;
  contactName?: string | null;
  contactPhone?: string | null;
  status: number;
  remark?: string | null;
  campaignCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

function mapVendor(raw: BackendVendor): Vendor {
  return {
    id: toNumber(raw.id),
    code: raw.code,
    name: raw.name,
    platform: raw.platform as PlatformCode,
    contact: raw.contactName ?? '',
    phone: raw.contactPhone ?? '',
    status: raw.status === 0 ? 0 : 1,
    remark: raw.remark ?? '',
    updatedAt: raw.updatedAt ?? raw.createdAt ?? '',
    planCount: raw.campaignCount ?? 0
  };
}

export interface BackendVendorQuery {
  keyword?: string;
  platform?: string;
  status?: 0 | 1 | '';
  page: number;
  pageSize: number;
}

export interface BackendVendorPayload {
  code: string;
  name: string;
  platform: PlatformCode;
  contact: string;
  phone: string;
  remark: string;
}

function toVendorBody(payload: BackendVendorPayload): Record<string, unknown> {
  return {
    code: payload.code,
    name: payload.name,
    platform: payload.platform,
    contactName: payload.contact,
    contactPhone: payload.phone,
    remark: payload.remark
  };
}

export async function listVendors(query: BackendVendorQuery): Promise<Paged<Vendor>> {
  const data = await get<BackendList<BackendVendor>>('/vendors', {
    keyword: query.keyword || undefined,
    platform: query.platform || undefined,
    status: query.status === '' || query.status === undefined ? undefined : query.status,
    page: query.page,
    pageSize: query.pageSize
  });
  return { list: data.items.map(mapVendor), total: data.total };
}

export async function createVendor(payload: BackendVendorPayload): Promise<Vendor> {
  const data = await post<BackendVendor>('/vendors', { ...toVendorBody(payload), status: 1 });
  return mapVendor(data);
}

export async function updateVendor(id: number, payload: BackendVendorPayload): Promise<Vendor> {
  const data = await put<BackendVendor>(`/vendors/${id}`, toVendorBody(payload));
  return mapVendor(data);
}

export async function updateVendorStatus(id: number, status: 0 | 1): Promise<Vendor> {
  const current = await get<BackendVendor>(`/vendors/${id}`);
  const data = await put<BackendVendor>(`/vendors/${id}`, {
    ...toVendorBody({
      code: current.code,
      name: current.name,
      platform: current.platform as PlatformCode,
      contact: current.contactName ?? '',
      phone: current.contactPhone ?? '',
      remark: current.remark ?? ''
    }),
    status
  });
  return mapVendor(data);
}

export async function deleteVendor(id: number): Promise<{ id: number }> {
  await del(`/vendors/${id}`);
  return { id };
}

/* ============================ 字典（后端未提供接口，前端内置口径只读） ============================ */

const CHANNEL_DICTS: ChannelDict[] = [
  { code: 'douyin', name: '抖音', icon: '抖', color: '#111827', enabled: true, bidMode: 'cpm', updatedAt: nowText() },
  { code: 'wechat', name: '微信', icon: '微', color: '#07c160', enabled: true, bidMode: 'cpm', updatedAt: nowText() },
  { code: 'xiaohongshu', name: '小红书', icon: '红', color: '#ff2442', enabled: true, bidMode: 'cpc', updatedAt: nowText() },
  { code: 'kuaishou', name: '快手', icon: '快', color: '#ff7a00', enabled: true, bidMode: 'cpm', updatedAt: nowText() },
  { code: 'baidu', name: '百度', icon: '百', color: '#2932e1', enabled: true, bidMode: 'cpc', updatedAt: nowText() },
  { code: 'other', name: '其他', icon: '其', color: '#5b6673', enabled: false, bidMode: 'cpm', updatedAt: nowText() }
];

const AGE_DICTS: AgeDict[] = ['18-24', '25-29', '30-39', '40-49', '50+'].map((value, index) => ({
  value,
  enabled: true,
  sort: index + 1,
  updatedAt: nowText()
}));

const METRIC_DICTS: MetricDict[] = [
  { key: 'impressions', name: '曝光量', formula: '媒体后台曝光计数', decimals: 0, visible: true, updatedAt: nowText() },
  { key: 'reach', name: '曝光人数', formula: '去重触达人数', decimals: 0, visible: true, updatedAt: nowText() },
  { key: 'ctr', name: '点击率', formula: '点击人数 ÷ 曝光人数', decimals: 2, visible: true, updatedAt: nowText() },
  { key: 'cost', name: '消耗', formula: '媒体后台消耗汇总', decimals: 2, visible: true, updatedAt: nowText() },
  { key: 'cpm', name: '千次曝光成本', formula: '消耗 ÷ 曝光量 × 1000', decimals: 2, visible: false, updatedAt: nowText() },
  { key: 'completionRate', name: '完成率', formula: '实际曝光量 ÷ 计划目标曝光量', decimals: 2, visible: true, updatedAt: nowText() }
];

const DICT_READONLY_MESSAGE = '真实后端暂未提供字典接口，字典为前端内置口径，无法保存';

export function listChannels(): Promise<ChannelDict[]> {
  return Promise.resolve(CHANNEL_DICTS.map((item) => ({ ...item })));
}

export function updateChannel(
  _code?: string,
  _payload?: Partial<ChannelDict>
): Promise<ChannelDict> {
  return Promise.reject(new ApiError(DICT_READONLY_MESSAGE, 501));
}

export function listAges(): Promise<AgeDict[]> {
  return Promise.resolve(AGE_DICTS.map((item) => ({ ...item })));
}

export function updateAge(_value?: string, _payload?: Partial<AgeDict>): Promise<AgeDict> {
  return Promise.reject(new ApiError(DICT_READONLY_MESSAGE, 501));
}

export function listMetrics(): Promise<MetricDict[]> {
  return Promise.resolve(METRIC_DICTS.map((item) => ({ ...item })));
}

export function updateMetric(_key?: string, _payload?: Partial<MetricDict>): Promise<MetricDict> {
  return Promise.reject(new ApiError(DICT_READONLY_MESSAGE, 501));
}

/* ============================ 操作日志 ============================ */

interface BackendLog {
  id: string;
  objectType: string;
  objectId: string | null;
  action: string;
  before: unknown;
  after: unknown;
  operatorId: string;
  operatorName: string;
  ip?: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  login: '登录系统',
  logout: '退出登录',
  create: '新增',
  update: '更新',
  delete: '删除',
  set_vendors: '关联厂商',
  save_mock_profile: '保存模拟参数',
  mock_generate: '生成模拟数据',
  publish: '发布计划',
  approve: '审核通过',
  reject: '审核驳回',
  pause: '暂停投放',
  resume: '恢复投放',
  finish: '结束投放',
  close: '结案'
};

interface UserDirectoryEntry {
  role: Role;
  name: string;
}

let userDirectoryCache: Map<number, UserDirectoryEntry> | null = null;

async function resolveUserDirectory(): Promise<Map<number, UserDirectoryEntry>> {
  if (userDirectoryCache) return userDirectoryCache;
  const map = new Map<number, UserDirectoryEntry>();
  try {
    const data = await get<BackendList<BackendUser>>('/users', { page: 1, pageSize: 100 });
    data.items.forEach((item) =>
      map.set(toNumber(item.id), { role: mapRole(item.role), name: item.displayName })
    );
  } catch {
    // 拿不到用户列表时按普通用户展示，不阻塞日志页
  }
  userDirectoryCache = map;
  return map;
}

function mapLogTargetType(objectType: string, action: string): LogTargetType {
  if (action === 'login' || action === 'logout') return 'auth';
  if (objectType === 'user') return 'user';
  if (objectType === 'vendor') return 'vendor';
  if (objectType === 'campaign') return action.includes('mock') ? 'mock' : 'campaign';
  if (objectType === 'project') return 'project';
  if (objectType === 'dict') return 'dict';
  return 'user';
}

/** 前端筛选条件 -> 后端查询参数（后端缺关键词检索，先透传，后端忽略时前端会做二次过滤） */
function toBackendLogQuery(query: {
  keyword?: string;
  targetType?: LogTargetType | '';
  operatorId?: number;
  startTime?: string;
  endTime?: string;
  page: number;
  pageSize: number;
}): Record<string, unknown> {
  const params: Record<string, unknown> = {
    operatorId: query.operatorId,
    from: query.startTime,
    to: query.endTime,
    page: query.page,
    pageSize: query.pageSize
  };
  switch (query.targetType) {
    case 'user':
      params.objectType = 'user';
      params.action = undefined;
      break;
    case 'vendor':
      params.objectType = 'vendor';
      break;
    case 'campaign':
      params.objectType = 'campaign';
      break;
    case 'project':
      params.objectType = 'project';
      break;
    case 'auth':
      params.objectType = 'user';
      params.action = 'login';
      break;
    case 'mock':
      params.objectType = 'campaign';
      params.action = 'mock_generate';
      break;
    case 'dict':
      params.objectType = '__none__';
      break;
    default:
      break;
  }
  if (query.keyword) params.keyword = query.keyword;
  return params;
}

export async function listLogs(query: {
  keyword?: string;
  targetType?: LogTargetType | '';
  operatorId?: number;
  startTime?: string;
  endTime?: string;
  page: number;
  pageSize: number;
}): Promise<Paged<OperationLog>> {
  const [data, directory, campaigns, projects] = await Promise.all([
    get<BackendList<BackendLog>>('/logs', toBackendLogQuery(query)),
    resolveUserDirectory(),
    listCampaigns().catch(() => [] as CampaignRow[]),
    listProjects().catch(() => [] as Project[])
  ]);
  const campaignMap = new Map(campaigns.map((item) => [item.id, item]));
  const projectMap = new Map(projects.map((item) => [item.id, item]));
  const nameOf = (type: LogTargetType, id: number | null): string => {
    if (id === null) return '';
    if (type === 'user') {
      return directory.get(id)?.name ?? `用户 #${id}`;
    }
    if (type === 'auth') return '管理端登录';
    if (type === 'mock' || type === 'campaign') {
      const campaign = campaignMap.get(id);
      return campaign ? `${campaign.code ?? `#${id}`} ${campaign.name}` : `投放计划 #${id}`;
    }
    if (type === 'project') return projectMap.get(id)?.name ?? `项目 #${id}`;
    return `ID ${id}`;
  };

  let items = data.items;
  const keyword = (query.keyword ?? '').trim().toLowerCase();
  if (keyword) {
    items = items.filter((item) =>
      [item.operatorName, ACTION_LABELS[item.action] ?? item.action, item.objectType, item.objectId ?? '']
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    );
  }
  return {
    list: items.map((raw) => {
      const type = mapLogTargetType(raw.objectType, raw.action);
      const targetId = raw.objectId ?? null;
      const targetNumberId = targetId === null ? null : toNumber(targetId, NaN);
      return {
        id: toNumber(raw.id),
        time: raw.createdAt,
        operatorId: toNumber(raw.operatorId),
        operatorName: raw.operatorName,
        operatorRole: directory.get(toNumber(raw.operatorId))?.role ?? 'admin',
        action: ACTION_LABELS[raw.action] ?? raw.action,
        targetType: type,
        targetId,
        targetName: Number.isNaN(targetNumberId) ? '' : nameOf(type, targetNumberId),
        detail:
          raw.before || raw.after || raw.ip
            ? { before: raw.before, after: raw.after, ip: raw.ip ?? null }
            : null
      } as OperationLog;
    }),
    total: data.total
  };
}

/* ============================ 项目 / 投放计划 ============================ */

interface BackendProject {
  id: string;
  name: string;
  client?: string;
  startDate?: string;
  endDate?: string;
  budget?: string;
  createdAt?: string;
}

interface BackendCampaign {
  id: string;
  projectId: string;
  projectName?: string;
  code: string | null;
  name: string;
  channel: string;
  objective?: string;
  status: string;
  budget: string;
  targetImpressions: string;
  startDate: string;
  endDate: string;
  reasoning?: unknown;
  targeting?: unknown;
  remark?: string | null;
  createdBy?: string;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  vendors?: { id: string; code: string; name: string; platform: string }[];
  actualImpressions?: string | null;
  actualReach?: string | null;
  actualClicks?: string | null;
  actualCost?: string | null;
  completionRate?: number | null;
  clickRate?: number | null;
}

const CAMPAIGN_STATUSES: CampaignStatus[] = [
  'draft',
  'pending',
  'scheduled',
  'running',
  'paused',
  'finished',
  'closed'
];

function toCampaignRow(raw: BackendCampaign): CampaignRow {
  const status = CAMPAIGN_STATUSES.includes(raw.status as CampaignStatus)
    ? (raw.status as CampaignStatus)
    : 'draft';
  const actualImpressions = toNumber(raw.actualImpressions);
  const hasMock = actualImpressions > 0;
  const target = toNumber(raw.targetImpressions);
  const platform = raw.channel as PlatformCode;
  const completionRate =
    raw.completionRate !== null && raw.completionRate !== undefined
      ? Number((raw.completionRate * 100).toFixed(2))
      : hasMock && target > 0
        ? Number(((actualImpressions / target) * 100).toFixed(2))
        : null;
  return {
    id: toNumber(raw.id),
    code: raw.code,
    name: raw.name,
    projectId: toNumber(raw.projectId),
    channelCodes: [raw.channel],
    vendorIds: (raw.vendors ?? []).map((vendor) => toNumber(vendor.id)),
    status,
    budget: raw.budget ?? '0',
    targetImpressions: raw.targetImpressions ?? '0',
    startDate: raw.startDate,
    endDate: raw.endDate,
    createdAt: raw.createdAt,
    projectName: raw.projectName ?? '',
    channels: [{ code: raw.channel, name: PLATFORM_LABELS[platform] ?? raw.channel }],
    vendors: (raw.vendors ?? []).map((vendor) => ({ id: toNumber(vendor.id), name: vendor.name })),
    hasMock,
    statsDays: 0,
    actualImpressions: hasMock ? actualImpressions : null,
    completionRate,
    lastGeneratedAt: null
  };
}

export async function listProjects(): Promise<Project[]> {
  const data = await get<BackendProject[]>('/projects');
  return data.map((raw) => ({
    id: toNumber(raw.id),
    code: `PRJ-${raw.id}`,
    name: raw.name,
    remainingBudget: raw.budget ?? '0'
  }));
}

/** 管理端需要一次拿到全部计划用于批量勾选，后端分页时循环取全 */
export async function listCampaigns(projectId?: number | null): Promise<CampaignRow[]> {
  const items: BackendCampaign[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const data = await get<BackendList<BackendCampaign>>('/campaigns', {
      projectId: projectId ?? undefined,
      page,
      pageSize: 100
    });
    items.push(...data.items);
    if (data.items.length === 0 || items.length >= data.total) break;
  }
  return items.map(toCampaignRow);
}

/* ============================ 模拟参数 ============================ */

const CURVE_TO_BACKEND: Record<CurveType, string> = {
  even: 'uniform',
  asc: 'front_load',
  desc: 'back_load',
  weekend: 'weekend'
};

const CURVE_FROM_BACKEND: Record<string, CurveType> = {
  uniform: 'even',
  front_load: 'asc',
  back_load: 'desc',
  weekend: 'weekend'
};

interface BackendMockProfile {
  campaignId: string;
  totalImpressions: string;
  curveType: string;
  ctr: number;
  cpm: number;
  frequency: number;
  dimRatio: MockRatios | null;
  seed: number;
  saved?: boolean;
}

function normalizeSeed(seed: string): number {
  const numeric = Number(seed);
  if (Number.isInteger(numeric) && numeric > 0 && numeric <= 2147483647) return numeric;
  return (Math.abs(hashSeed(seed || 'adflow')) % 2147483647) + 1;
}

function toBackendMockParams(params: MockParamsInput): Record<string, unknown> {
  return {
    totalImpressions: Math.max(1, Math.round(params.targetImpressions)),
    curveType: CURVE_TO_BACKEND[params.curve],
    ctr: Number((Math.min(20, Math.max(0, params.ctr)) / 100).toFixed(4)),
    cpm: params.cpm,
    frequency: params.frequency,
    dimRatio: params.ratios,
    seed: normalizeSeed(params.seed)
  };
}

function toMockProfile(campaignId: number, raw: BackendMockProfile): MockProfile {
  return {
    campaignId,
    targetImpressions: toNumber(raw.totalImpressions),
    curve: CURVE_FROM_BACKEND[raw.curveType] ?? 'even',
    ctr: Number((toNumber(raw.ctr) * 100).toFixed(2)),
    cpm: toNumber(raw.cpm),
    frequency: toNumber(raw.frequency),
    seed: String(raw.seed),
    ratios: raw.dimRatio ?? DEFAULT_RATIOS,
    updatedAt: nowText(),
    updatedBy: '真实后端'
  };
}

export async function saveMockProfile(campaignId: number, params: MockParamsInput): Promise<MockProfile> {
  const data = await put<BackendMockProfile>(
    `/campaigns/${campaignId}/mock-profile`,
    toBackendMockParams(params)
  );
  return toMockProfile(campaignId, data);
}

interface BackendGenerateResult {
  campaignId: string;
  from: string;
  to: string;
  days: number;
  totals: { impressions?: string | number; reach?: string | number; clicks?: string | number; cost?: string | number };
}

export async function generateMock(
  campaignId: number,
  params: MockParamsInput,
  mode: MockMode
): Promise<MockGenerateResult> {
  // 后端生成需要计划排期：先取计划详情，再保存参数、触发生成
  const campaign = await get<BackendCampaign>(`/campaigns/${campaignId}`);
  await put(`/campaigns/${campaignId}/mock-profile`, toBackendMockParams(params));
  const data = await post<BackendGenerateResult>(`/campaigns/${campaignId}/mock/generate`, {
    from: campaign.startDate,
    to: campaign.endDate
  });
  const total = toNumber(data.totals?.impressions);
  const target = toNumber(campaign.targetImpressions) || total;
  return {
    campaignId,
    campaignCode: campaign.code ?? `#${campaignId}`,
    campaignName: campaign.name,
    mode,
    days: toNumber(data.days),
    totalImpressions: total,
    completionRate: target > 0 ? Number(((total / target) * 100).toFixed(2)) : 0,
    generatedAt: nowText()
  };
}

/** 后端没有清空模拟数据接口 */
export function clearMock(campaignId: number): Promise<{ campaignId: number }> {
  return Promise.reject(
    new ApiError(`真实后端未提供清空模拟数据接口，如需清空计划 #${campaignId} 请联系后端处理`, 501)
  );
}

/* 常用方案：后端无接口，存浏览器 localStorage（仅当前浏览器可用） */

const PRESET_KEY = 'adflow.real.mock-presets.v1';

function readPresets(): MockPreset[] {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    return raw ? (JSON.parse(raw) as MockPreset[]) : [];
  } catch {
    return [];
  }
}

function writePresets(presets: MockPreset[]): void {
  localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
}

export function listPresets(): Promise<MockPreset[]> {
  return Promise.resolve(readPresets());
}

export function createPreset(payload: { name: string; params: MockParamsInput }): Promise<MockPreset> {
  const presets = readPresets();
  const preset: MockPreset = {
    id: presets.reduce((max, item) => Math.max(max, item.id), 0) + 1,
    name: payload.name,
    params: payload.params,
    createdAt: nowText(),
    createdBy: '真实后端'
  };
  presets.unshift(preset);
  writePresets(presets);
  return Promise.resolve(preset);
}

export function deletePreset(id: number): Promise<{ id: number }> {
  writePresets(readPresets().filter((item) => item.id !== id));
  return Promise.resolve({ id });
}

/* 调节记录：后端没有接口，用操作日志中 action=mock_generate 的记录反推 */

async function fetchMockGenerateLogs(): Promise<BackendLog[]> {
  const items: BackendLog[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const data = await get<BackendList<BackendLog>>('/logs', {
      objectType: 'campaign',
      action: 'mock_generate',
      page,
      pageSize: 100
    });
    items.push(...data.items);
    if (data.items.length === 0 || items.length >= data.total) break;
  }
  return items;
}

async function fetchMockProfiles(campaignIds: number[]): Promise<Map<number, MockProfile>> {
  const map = new Map<number, MockProfile>();
  await Promise.all(
    [...new Set(campaignIds)].map(async (id) => {
      try {
        const raw = await get<BackendMockProfile>(`/campaigns/${id}/mock-profile`);
        map.set(id, toMockProfile(id, raw));
      } catch {
        // 拿不到参数时回退到日志里的摘要
      }
    })
  );
  return map;
}

export async function listMockRecords(query: {
  campaignId?: number;
  page: number;
  pageSize: number;
}): Promise<Paged<MockRecord>> {
  const [logs, campaigns] = await Promise.all([fetchMockGenerateLogs(), listCampaigns()]);
  const campaignMap = new Map(campaigns.map((item) => [item.id, item]));
  let items = logs;
  if (query.campaignId) {
    items = items.filter((item) => toNumber(item.objectId) === query.campaignId);
  }
  const profiles = await fetchMockProfiles(
    items
      .map((item) => toNumber(item.objectId))
      // 计划可能已被删除（日志仍在），跳过可避免无意义的 404
      .filter((id) => campaignMap.has(id))
  );
  const records: MockRecord[] = items.map((raw) => {
    const campaignId = toNumber(raw.objectId);
    const campaign = campaignMap.get(campaignId);
    const profile = profiles.get(campaignId);
    const after = (raw.after ?? {}) as { days?: number; totals?: { impressions?: string | number } };
    const total = toNumber(after.totals?.impressions, campaign?.actualImpressions ?? 0);
    const target = toNumber(campaign?.targetImpressions) || total || 1;
    return {
      id: toNumber(raw.id),
      time: raw.createdAt,
      operatorName: raw.operatorName,
      campaignId,
      campaignCode: campaign?.code ?? `#${campaignId}`,
      campaignName: campaign?.name ?? `计划 #${campaignId}`,
      params: profile
        ? {
            targetImpressions: profile.targetImpressions,
            curve: profile.curve,
            ctr: profile.ctr,
            cpm: profile.cpm,
            frequency: profile.frequency,
            seed: profile.seed,
            ratios: profile.ratios
          }
        : {
            targetImpressions: total,
            curve: 'even',
            ctr: 0,
            cpm: 0,
            frequency: 0,
            seed: '',
            ratios: DEFAULT_RATIOS
          },
      days: toNumber(after.days),
      totalImpressions: total,
      completionRate: Number(((total / target) * 100).toFixed(2))
    };
  });
  const start = (query.page - 1) * query.pageSize;
  return { list: records.slice(start, start + query.pageSize), total: records.length };
}

/* ============================ 演示数据 ============================ */

export function resetDemoData(): Promise<{ resetAt: string }> {
  return Promise.reject(new ApiError('真实后端不提供演示数据重置接口，请使用 mock 模式演示', 501));
}
