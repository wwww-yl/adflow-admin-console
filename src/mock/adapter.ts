/**
 * 本地模拟后端：axios 自定义 adapter + localStorage 持久化。
 *
 * 管理端接口在附录 A 中并不完备（用户管理、字典、模拟参数清空等均无后端接口），
 * 因此这里按 /api/v1 的真实路径与返回结构模拟后端，接口就绪后关掉 VITE_USE_MOCK 即可切换。
 */
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import dayjs from 'dayjs';
import type {
  AgeDict,
  Campaign,
  CampaignRow,
  ChannelDict,
  LogTargetType,
  LoginResult,
  MetricDict,
  MockGenerateResult,
  MockMode,
  MockParamsInput,
  MockPreset,
  MockProfile,
  MockRecord,
  OperationLog,
  Paged,
  Role,
  User,
  Vendor
} from '@/types';
import { getDb, resetDb, saveDb } from './db';
import type { MockDb, StoredUser, VendorEntity } from './db';
import { buildDateRange, generateCampaignMock, validateMockParams } from './engine';

const ADMIN_PERMISSIONS = [
  'user:manage',
  'vendor:manage',
  'mock:manage',
  'dict:manage',
  'log:view',
  'demo:reset'
];

const USER_PERMISSIONS: string[] = [];

/** 业务错误（HTTP 200 + code != 0）或鉴权错误（401） */
class MockApiError extends Error {
  status: number;
  code: number;

  constructor(status: number, message: string, code = 1001) {
    super(message);
    this.name = 'MockApiError';
    this.status = status;
    this.code = code;
  }
}

function fail(message: string): never {
  throw new MockApiError(200, message);
}

function unauthorized(message = '登录状态已失效，请重新登录'): never {
  throw new MockApiError(401, message, 401);
}

function notFound(message = '资源不存在'): never {
  throw new MockApiError(404, message, 404);
}

function now(): string {
  return dayjs().format('YYYY-MM-DD HH:mm');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toPublicUser(user: StoredUser): User {
  return {
    id: user.id,
    account: user.account,
    name: user.name,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt
  };
}

function permissionsOf(role: Role): string[] {
  return role === 'admin' ? [...ADMIN_PERMISSIONS] : [...USER_PERMISSIONS];
}

function campaignRow(db: MockDb, campaign: Campaign): CampaignRow {
  const stats = db.dailyStats[campaign.id] ?? [];
  const actual = stats.reduce((sum, item) => sum + item.impressions, 0);
  const target = Number(campaign.targetImpressions);
  const completionRate = stats.length > 0 && target > 0 ? Number(((actual / target) * 100).toFixed(2)) : null;
  return {
    ...campaign,
    projectName: db.projects.find((project) => project.id === campaign.projectId)?.name ?? '—',
    channels: campaign.channelCodes.map((code) => ({
      code,
      name: db.channels.find((channel) => channel.code === code)?.name ?? code
    })),
    vendors: campaign.vendorIds.map((vendorId) => ({
      id: vendorId,
      name: db.vendors.find((vendor) => vendor.id === vendorId)?.name ?? `厂商 #${vendorId}`
    })),
    hasMock: stats.length > 0,
    statsDays: stats.length,
    actualImpressions: stats.length > 0 ? actual : null,
    completionRate,
    lastGeneratedAt: db.generatedAt[campaign.id] ?? null
  };
}

function vendorWithPlanCount(db: MockDb, vendor: VendorEntity): Vendor {
  const planCount = db.campaigns.filter((campaign) => campaign.vendorIds.includes(vendor.id)).length;
  return { ...vendor, planCount };
}

function findStoredUser(db: MockDb, id: number): StoredUser {
  const user = db.users.find((item) => item.id === id);
  if (!user) notFound('账号不存在');
  return user;
}

function findCampaign(db: MockDb, id: number): Campaign {
  const campaign = db.campaigns.find((item) => item.id === id);
  if (!campaign) notFound('投放计划不存在');
  return campaign;
}

function findVendor(db: MockDb, id: number): VendorEntity {
  const vendor = db.vendors.find((item) => item.id === id);
  if (!vendor) notFound('厂商不存在');
  return vendor;
}

function activeAdminCount(db: MockDb, excludeId?: number): number {
  return db.users.filter(
    (user) => user.role === 'admin' && user.status === 1 && user.id !== excludeId
  ).length;
}

function addLog(
  db: MockDb,
  operator: StoredUser,
  action: string,
  targetType: LogTargetType,
  targetId: string | number | null,
  targetName: string,
  detail: Record<string, unknown> | null = null
): void {
  const log: OperationLog = {
    id: db.nextIds.log,
    time: now(),
    operatorId: operator.id,
    operatorName: operator.name,
    operatorRole: operator.role,
    action,
    targetType,
    targetId,
    targetName,
    detail
  };
  db.nextIds.log += 1;
  db.logs.push(log);
}

function pageSlice<T>(items: T[], page: number, pageSize: number): Paged<T> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 10;
  const start = (safePage - 1) * safeSize;
  return { list: items.slice(start, start + safeSize), total: items.length };
}

interface RouteContext {
  db: MockDb;
  operator: StoredUser;
  query: URLSearchParams;
  body: unknown;
  params: Record<string, string>;
}

type RouteHandler = (context: RouteContext) => unknown;

interface RouteDefinition {
  method: string;
  pattern: RegExp;
  keys: string[];
  public?: boolean;
  handler: RouteHandler;
}

const routes: RouteDefinition[] = [];

function define(method: string, path: string, handler: RouteHandler, isPublic = false): void {
  const keys: string[] = [];
  const pattern = new RegExp(
    `^${path
      .split('/')
      .map((segment) => {
        if (segment.startsWith(':')) {
          keys.push(segment.slice(1));
          return '([^/]+)';
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/')}$`
  );
  routes.push({ method, pattern, keys, handler, public: isPublic });
}

function readQueryNumber(query: URLSearchParams, key: string, fallback: number): number {
  const raw = query.get(key);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** 兼容传入 RouteContext 或直接传 body 两种调用方式 */
function readBody<T>(input: RouteContext | unknown): T {
  if (input && typeof input === 'object' && 'body' in input && 'query' in input && 'params' in input) {
    return ((input as RouteContext).body ?? {}) as T;
  }
  return (input ?? {}) as T;
}

/* ============================ 登录 ============================ */

define(
  'POST',
  '/auth/login',
  ({ db, body }) => {
    const payload = readBody<{ account?: string; password?: string }>({
      db,
      body,
      operator: db.users[0],
      query: new URLSearchParams(),
      params: {}
    });
    const account = (payload.account ?? '').trim();
    const password = payload.password ?? '';
    const user = db.users.find((item) => item.account === account);
    if (!user || user.password !== password) fail('账号或密码错误，请重新输入');
    if (user.status === 0) fail('该账号已被停用，请联系管理员');
    user.lastLoginAt = now();
    addLog(db, user, '登录系统', 'auth', null, '管理端登录');
    saveDb(db);
    const result: LoginResult = {
      token: `mock-token-${user.id}`,
      user: toPublicUser(user),
      permissions: permissionsOf(user.role)
    };
    return result;
  },
  true
);

/* ============================ 用户管理 ============================ */

define('GET', '/admin/users', ({ db, query }) => {
  const keyword = (query.get('keyword') ?? '').trim().toLowerCase();
  const role = query.get('role') ?? '';
  const status = query.get('status') ?? '';
  let users = [...db.users];
  if (keyword) {
    users = users.filter(
      (user) =>
        user.account.toLowerCase().includes(keyword) || user.name.toLowerCase().includes(keyword)
    );
  }
  if (role === 'admin' || role === 'user') users = users.filter((user) => user.role === role);
  if (status === '0' || status === '1') users = users.filter((user) => user.status === Number(status));
  users.sort((a, b) => a.id - b.id);
  const paged = pageSlice(
    users,
    readQueryNumber(query, 'page', 1),
    readQueryNumber(query, 'pageSize', 10)
  );
  return { list: paged.list.map(toPublicUser), total: paged.total };
});

interface CreateUserPayload {
  account?: string;
  name?: string;
  role?: Role;
  password?: string;
}

define('POST', '/admin/users', ({ db, body, operator }) => {
  const payload = readBody<CreateUserPayload>({ db, body, operator, query: new URLSearchParams(), params: {} });
  const account = (payload.account ?? '').trim();
  const name = (payload.name ?? '').trim();
  const role = payload.role;
  const password = payload.password ?? '';
  if (!/^[a-zA-Z][a-zA-Z0-9_]{3,19}$/.test(account)) fail('账号需以字母开头，长度 4-20 位，可包含数字与下划线');
  if (db.users.some((user) => user.account === account)) fail('该账号已存在，请更换后重试');
  if (name.length < 2 || name.length > 20) fail('姓名长度需为 2-20 个字符');
  if (role !== 'admin' && role !== 'user') fail('请选择账号身份');
  if (password.length < 8 || password.length > 20) fail('初始密码需为 8-20 位字符');
  const user: StoredUser = {
    id: db.nextIds.user,
    account,
    name,
    role,
    status: 1,
    createdAt: now(),
    lastLoginAt: null,
    password
  };
  db.nextIds.user += 1;
  db.users.push(user);
  addLog(db, operator, '新增用户', 'user', user.id, user.name, { account, role });
  saveDb(db);
  return toPublicUser(user);
});

interface UpdateUserPayload {
  name?: string;
  role?: Role;
  status?: 0 | 1;
}

define('PUT', '/admin/users/:id', ({ db, body, params, operator }) => {
  const target = findStoredUser(db, Number(params.id));
  const payload = readBody<UpdateUserPayload>({ db, body, operator, query: new URLSearchParams(), params });
  const nextName = (payload.name ?? target.name).trim();
  const nextRole = payload.role ?? target.role;
  const nextStatus = payload.status ?? target.status;
  if (nextName.length < 2 || nextName.length > 20) fail('姓名长度需为 2-20 个字符');
  if (nextRole !== 'admin' && nextRole !== 'user') fail('身份只能是管理员或普通用户');
  if (target.id === operator.id) {
    if (nextStatus === 0) fail('不能停用当前登录的账号');
    if (nextRole !== target.role) fail('不能修改当前登录账号的身份');
  }
  if (nextStatus === 0 && target.role === 'admin' && activeAdminCount(db, target.id) === 0) {
    fail('至少需要保留一个启用状态的管理员账号');
  }
  if (nextRole !== 'admin' && target.role === 'admin' && activeAdminCount(db, target.id) === 0) {
    fail('至少需要保留一个启用状态的管理员账号');
  }
  const action =
    nextStatus !== target.status
      ? nextStatus === 1
        ? '启用账号'
        : '停用账号'
      : nextRole !== target.role
        ? '修改用户身份'
        : '修改用户';
  target.name = nextName;
  target.role = nextRole;
  target.status = nextStatus;
  addLog(db, operator, action, 'user', target.id, target.name, {
    name: nextName,
    role: nextRole,
    status: nextStatus
  });
  saveDb(db);
  return toPublicUser(target);
});

define('POST', '/admin/users/:id/reset-password', ({ db, params, operator }) => {
  const target = findStoredUser(db, Number(params.id));
  const temporary = `Adflow@${Math.floor(1000 + Math.random() * 9000)}`;
  target.password = temporary;
  addLog(db, operator, '重置密码', 'user', target.id, target.name, { account: target.account });
  saveDb(db);
  return { password: temporary };
});

/* ============================ 厂商管理 ============================ */

define('GET', '/vendors', ({ db, query }) => {
  const keyword = (query.get('keyword') ?? '').trim().toLowerCase();
  const platform = query.get('platform') ?? '';
  const status = query.get('status') ?? '';
  let vendors = db.vendors.map((vendor) => vendorWithPlanCount(db, vendor));
  if (keyword) {
    vendors = vendors.filter(
      (vendor) =>
        vendor.code.toLowerCase().includes(keyword) ||
        vendor.name.toLowerCase().includes(keyword) ||
        vendor.contact.toLowerCase().includes(keyword) ||
        vendor.phone.includes(keyword)
    );
  }
  if (platform) vendors = vendors.filter((vendor) => vendor.platform === platform);
  if (status === '0' || status === '1') vendors = vendors.filter((vendor) => vendor.status === Number(status));
  vendors.sort((a, b) => a.id - b.id);
  const page = readQueryNumber(query, 'page', 1);
  const pageSize = readQueryNumber(query, 'pageSize', 10);
  return pageSlice(vendors, page, pageSize);
});

interface VendorPayload {
  code?: string;
  name?: string;
  platform?: VendorEntity['platform'];
  contact?: string;
  phone?: string;
  remark?: string;
}

function validateVendorPayload(payload: VendorPayload): {
  code: string;
  name: string;
  platform: VendorEntity['platform'];
  contact: string;
  phone: string;
  remark: string;
} {
  const code = (payload.code ?? '').trim();
  const name = (payload.name ?? '').trim();
  const platform = payload.platform ?? 'other';
  const contact = (payload.contact ?? '').trim();
  const phone = (payload.phone ?? '').trim();
  const remark = (payload.remark ?? '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,19}$/.test(code)) {
    fail('厂商编码需为 2-20 位字母、数字、下划线或中划线，且以字母或数字开头');
  }
  if (name.length < 2 || name.length > 40) fail('厂商名称长度需为 2-40 个字符');
  if (!['douyin', 'wechat', 'xiaohongshu', 'kuaishou', 'baidu', 'other'].includes(platform)) {
    fail('请选择所属平台');
  }
  if (contact.length < 2 || contact.length > 20) fail('联系人长度需为 2-20 个字符');
  if (!/^(1[3-9]\d{9}|0\d{2,3}-?\d{7,8})$/.test(phone)) fail('联系电话格式不正确，请填写手机号或座机号');
  if (remark.length > 200) fail('备注不能超过 200 个字符');
  return { code, name, platform, contact, phone, remark };
}

define('POST', '/vendors', ({ db, body, operator }) => {
  const payload = readBody<VendorPayload>({ db, body, operator, query: new URLSearchParams(), params: {} });
  const data = validateVendorPayload(payload);
  if (db.vendors.some((vendor) => vendor.code === data.code)) fail('该厂商编码已存在，请更换后重试');
  const vendor: VendorEntity = {
    id: db.nextIds.vendor,
    ...data,
    status: 1,
    updatedAt: now()
  };
  db.nextIds.vendor += 1;
  db.vendors.push(vendor);
  addLog(db, operator, '新增厂商', 'vendor', vendor.id, vendor.name, { code: vendor.code, platform: vendor.platform });
  saveDb(db);
  return vendorWithPlanCount(db, vendor);
});

define('PUT', '/vendors/:id', ({ db, body, params, operator }) => {
  const vendor = findVendor(db, Number(params.id));
  const payload = readBody<VendorPayload>({ db, body, operator, query: new URLSearchParams(), params });
  const data = validateVendorPayload(payload);
  if (db.vendors.some((item) => item.code === data.code && item.id !== vendor.id)) {
    fail('该厂商编码已存在，请更换后重试');
  }
  vendor.code = data.code;
  vendor.name = data.name;
  vendor.platform = data.platform;
  vendor.contact = data.contact;
  vendor.phone = data.phone;
  vendor.remark = data.remark;
  vendor.updatedAt = now();
  addLog(db, operator, '更新厂商', 'vendor', vendor.id, vendor.name, { code: vendor.code, platform: vendor.platform });
  saveDb(db);
  return vendorWithPlanCount(db, vendor);
});

define('PUT', '/vendors/:id/status', ({ db, body, params, operator }) => {
  const vendor = findVendor(db, Number(params.id));
  const payload = readBody<{ status?: 0 | 1 }>({ db, body, operator, query: new URLSearchParams(), params });
  const status = payload.status;
  if (status !== 0 && status !== 1) fail('状态参数不正确');
  vendor.status = status;
  vendor.updatedAt = now();
  addLog(db, operator, status === 1 ? '启用厂商' : '停用厂商', 'vendor', vendor.id, vendor.name, {
    status
  });
  saveDb(db);
  return vendorWithPlanCount(db, vendor);
});

define('DELETE', '/vendors/:id', ({ db, params, operator }) => {
  const vendor = findVendor(db, Number(params.id));
  const planCount = db.campaigns.filter((campaign) => campaign.vendorIds.includes(vendor.id)).length;
  if (planCount > 0) fail('该厂商已被投放计划引用，只能停用，不能删除');
  db.vendors = db.vendors.filter((item) => item.id !== vendor.id);
  addLog(db, operator, '删除厂商', 'vendor', vendor.id, vendor.name, { code: vendor.code });
  saveDb(db);
  return { id: vendor.id };
});

/* ============================ 投放计划 / 项目 ============================ */

define('GET', '/projects', ({ db }) => db.projects);

define('GET', '/campaigns', ({ db, query }) => {
  const projectIdRaw = query.get('projectId');
  const projectId = projectIdRaw ? Number(projectIdRaw) : null;
  const campaigns = db.campaigns
    .filter((campaign) => (projectId === null ? true : campaign.projectId === projectId))
    .map((campaign) => campaignRow(db, campaign));
  campaigns.sort((a, b) => a.id - b.id);
  return campaigns;
});

interface MockParamsPayload {
  params?: MockParamsInput;
}

function parseMockParams(payload: MockParamsPayload): MockParamsInput {
  const params = payload.params;
  if (!params) fail('模拟参数不能为空');
  const normalized: MockParamsInput = {
    targetImpressions: Number(params.targetImpressions),
    curve: params.curve,
    ctr: Number(params.ctr),
    cpm: Number(params.cpm),
    frequency: Number(params.frequency),
    seed: String(params.seed ?? ''),
    ratios: {
      region: { ...params.ratios.region },
      gender: { ...params.ratios.gender },
      age: { ...params.ratios.age }
    }
  };
  if (!['even', 'asc', 'desc', 'weekend'].includes(normalized.curve)) fail('请选择投放曲线');
  if (!normalized.seed.trim()) fail('随机种子不能为空');
  const message = validateMockParams(normalized);
  if (message) fail(message);
  return normalized;
}

define('PUT', '/campaigns/:id/mock-profile', ({ db, body, params, operator }) => {
  const campaign = findCampaign(db, Number(params.id));
  const normalized = parseMockParams(readBody<MockParamsPayload>({ db, body, operator, query: new URLSearchParams(), params }));
  const profile: MockProfile = {
    campaignId: campaign.id,
    ...normalized,
    updatedAt: now(),
    updatedBy: operator.name
  };
  db.profiles[campaign.id] = profile;
  addLog(db, operator, '保存模拟参数方案', 'mock', campaign.id, campaign.name, {
    params: normalized
  });
  saveDb(db);
  return profile;
});

define('POST', '/campaigns/:id/mock/generate', ({ db, body, params, operator }) => {
  const campaign = findCampaign(db, Number(params.id));
  const payload = readBody<MockParamsPayload & { mode?: MockMode }>({
    db,
    body,
    operator,
    query: new URLSearchParams(),
    params
  });
  const normalized = parseMockParams(payload);
  const mode: MockMode = payload.mode === 'overwrite' ? 'overwrite' : 'generate';
  const existing = db.dailyStats[campaign.id] ?? [];
  if (mode === 'generate' && existing.length > 0) {
    fail('该计划已存在模拟数据，请使用“覆盖生成”或先清空数据');
  }
  const dates = buildDateRange(campaign.startDate, campaign.endDate);
  if (dates.length === 0) fail('计划排期不完整，无法生成模拟数据');
  const generated = generateCampaignMock(normalized, dates, campaign.code ?? `campaign-${campaign.id}`);
  db.dailyStats[campaign.id] = generated.daily;
  db.generatedAt[campaign.id] = now();
  db.profiles[campaign.id] = {
    campaignId: campaign.id,
    ...normalized,
    updatedAt: now(),
    updatedBy: operator.name
  };
  const target = Number(campaign.targetImpressions);
  const completionRate = target > 0 ? Number(((generated.totals.impressions / target) * 100).toFixed(2)) : 0;
  const action = mode === 'overwrite' ? '覆盖模拟数据' : '生成模拟数据';
  addLog(db, operator, action, 'mock', campaign.id, campaign.name, {
    params: normalized,
    days: generated.totals.days,
    totalImpressions: generated.totals.impressions,
    completionRate
  });
  saveDb(db);
  const result: MockGenerateResult = {
    campaignId: campaign.id,
    campaignCode: campaign.code ?? `计划 #${campaign.id}`,
    campaignName: campaign.name,
    mode,
    days: generated.totals.days,
    totalImpressions: generated.totals.impressions,
    completionRate,
    generatedAt: db.generatedAt[campaign.id]
  };
  return result;
});

define('POST', '/campaigns/:id/mock/clear', ({ db, params, operator }) => {
  const campaign = findCampaign(db, Number(params.id));
  delete db.dailyStats[campaign.id];
  delete db.generatedAt[campaign.id];
  addLog(db, operator, '清空模拟数据', 'mock', campaign.id, campaign.name, { scope: '该计划全部分日数据' });
  saveDb(db);
  return { campaignId: campaign.id };
});

/* ============================ 模拟参数常用方案 / 调节记录 ============================ */

define('GET', '/admin/mock-presets', ({ db }) =>
  [...db.presets].sort((a, b) => a.id - b.id)
);

define('POST', '/admin/mock-presets', ({ db, body, operator }) => {
  const payload = readBody<{ name?: string; params?: MockParamsInput }>({
    db,
    body,
    operator,
    query: new URLSearchParams(),
    params: {}
  });
  const name = (payload.name ?? '').trim();
  if (name.length < 2 || name.length > 30) fail('方案名称长度需为 2-30 个字符');
  if (db.presets.some((preset) => preset.name === name)) fail('该方案名称已存在，请更换后重试');
  const normalized = parseMockParams({ params: payload.params });
  const preset: MockPreset = {
    id: db.nextIds.preset,
    name,
    params: normalized,
    createdAt: now(),
    createdBy: operator.name
  };
  db.nextIds.preset += 1;
  db.presets.push(preset);
  addLog(db, operator, '新增模拟参数方案', 'mock', preset.id, name, { name });
  saveDb(db);
  return preset;
});

define('DELETE', '/admin/mock-presets/:id', ({ db, params, operator }) => {
  const preset = db.presets.find((item) => item.id === Number(params.id));
  if (!preset) notFound('常用方案不存在');
  db.presets = db.presets.filter((item) => item.id !== preset.id);
  addLog(db, operator, '删除模拟参数方案', 'mock', preset.id, preset.name);
  saveDb(db);
  return { id: preset.id };
});

define('GET', '/admin/mock-records', ({ db, query }) => {
  const campaignIdRaw = query.get('campaignId');
  const campaignId = campaignIdRaw ? Number(campaignIdRaw) : null;
  const records: MockRecord[] = db.logs
    .filter((log) => log.targetType === 'mock' && log.detail !== null && 'params' in log.detail)
    .map((log) => {
      const campaign = db.campaigns.find((item) => item.id === Number(log.targetId));
      const detail = log.detail as {
        params: MockParamsInput;
        days?: number;
        totalImpressions?: number;
        completionRate?: number;
      };
      const target = campaign ? Number(campaign.targetImpressions) : 0;
      const totalImpressions = Number(detail.totalImpressions ?? 0);
      return {
        id: log.id,
        time: log.time,
        operatorName: log.operatorName,
        campaignId: campaign?.id ?? Number(log.targetId ?? 0),
        campaignCode: campaign?.code ?? '—',
        campaignName: campaign?.name ?? log.targetName,
        params: detail.params,
        days: Number(detail.days ?? 0),
        totalImpressions,
        completionRate:
          detail.completionRate ??
          (target > 0 ? Number(((totalImpressions / target) * 100).toFixed(2)) : 0)
      } satisfies MockRecord;
    })
    .filter((record) => (campaignId === null ? true : record.campaignId === campaignId))
    .sort((a, b) => b.id - a.id);
  return pageSlice(records, readQueryNumber(query, 'page', 1), readQueryNumber(query, 'pageSize', 10));
});

/* ============================ 字典管理 ============================ */

define('GET', '/admin/dicts/channels', ({ db }) => [...db.channels]);
define('GET', '/admin/dicts/ages', ({ db }) => [...db.ages].sort((a, b) => a.sort - b.sort));
define('GET', '/admin/dicts/metrics', ({ db }) => [...db.metrics]);

define('PUT', '/admin/dicts/channels/:code', ({ db, params, body, operator }) => {
  const channel = db.channels.find((item) => item.code === params.code);
  if (!channel) notFound('渠道不存在');
  const payload = readBody<Partial<ChannelDict>>({ db, body, operator, query: new URLSearchParams(), params });
  if (payload.enabled !== undefined) channel.enabled = Boolean(payload.enabled);
  if (payload.bidMode === 'cpm' || payload.bidMode === 'cpc') channel.bidMode = payload.bidMode;
  channel.updatedAt = now();
  addLog(db, operator, '更新渠道字典', 'dict', channel.code, channel.name, {
    enabled: channel.enabled,
    bidMode: channel.bidMode
  });
  saveDb(db);
  return channel;
});

define('PUT', '/admin/dicts/ages/:value', ({ db, params, body, operator }) => {
  const age = db.ages.find((item) => item.value === decodeURIComponent(params.value));
  if (!age) notFound('年龄段不存在');
  const payload = readBody<Partial<AgeDict>>({ db, body, operator, query: new URLSearchParams(), params });
  if (payload.enabled !== undefined) age.enabled = Boolean(payload.enabled);
  if (typeof payload.sort === 'number' && Number.isFinite(payload.sort)) age.sort = payload.sort;
  age.updatedAt = now();
  addLog(db, operator, '更新年龄段字典', 'dict', age.value, age.value, {
    enabled: age.enabled,
    sort: age.sort
  });
  saveDb(db);
  return age;
});

define('PUT', '/admin/dicts/metrics/:key', ({ db, params, body, operator }) => {
  const metric = db.metrics.find((item) => item.key === params.key);
  if (!metric) notFound('指标不存在');
  const payload = readBody<Partial<MetricDict>>({ db, body, operator, query: new URLSearchParams(), params });
  if (payload.formula !== undefined) metric.formula = String(payload.formula).slice(0, 100);
  if (payload.decimals !== undefined) {
    const decimals = Number(payload.decimals);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 4) fail('小数位需为 0-4 的整数');
    metric.decimals = decimals;
  }
  if (payload.visible !== undefined) metric.visible = Boolean(payload.visible);
  metric.updatedAt = now();
  addLog(db, operator, '更新指标口径', 'dict', metric.key, metric.name, {
    formula: metric.formula,
    decimals: metric.decimals,
    visible: metric.visible
  });
  saveDb(db);
  return metric;
});

/* ============================ 操作日志 ============================ */

define('GET', '/logs', ({ db, query }) => {
  const keyword = (query.get('keyword') ?? '').trim().toLowerCase();
  const targetType = query.get('targetType') ?? '';
  const operatorIdRaw = query.get('operatorId');
  const operatorId = operatorIdRaw ? Number(operatorIdRaw) : null;
  const startTime = query.get('startTime') ?? '';
  const endTime = query.get('endTime') ?? '';
  let logs = [...db.logs];
  if (keyword) {
    logs = logs.filter(
      (log) =>
        log.action.toLowerCase().includes(keyword) ||
        log.targetName.toLowerCase().includes(keyword) ||
        log.operatorName.toLowerCase().includes(keyword)
    );
  }
  if (targetType) logs = logs.filter((log) => log.targetType === targetType);
  if (operatorId !== null) logs = logs.filter((log) => log.operatorId === operatorId);
  if (startTime) logs = logs.filter((log) => log.time.slice(0, 10) >= startTime);
  if (endTime) logs = logs.filter((log) => log.time.slice(0, 10) <= endTime);
  logs.sort((a, b) => (a.time === b.time ? b.id - a.id : a.time < b.time ? 1 : -1));
  return pageSlice(
    logs,
    readQueryNumber(query, 'page', 1),
    readQueryNumber(query, 'pageSize', 10)
  );
});

/* ============================ 演示数据重置 ============================ */

define('POST', '/admin/demo/reset', () => {
  resetDb();
  return { resetAt: now() };
});

/* ============================ adapter ============================ */

function parseRequestBody(config: InternalAxiosRequestConfig): unknown {
  if (config.data === undefined || config.data === null || config.data === '') return undefined;
  if (typeof config.data === 'string') {
    try {
      return JSON.parse(config.data) as unknown;
    } catch {
      return undefined;
    }
  }
  return config.data;
}

function readToken(config: InternalAxiosRequestConfig): string {
  const headers = config.headers as unknown as {
    get?: (name: string) => unknown;
  };
  const raw =
    typeof headers?.get === 'function'
      ? headers.get('Authorization')
      : (config.headers as unknown as Record<string, unknown>)?.Authorization;
  if (typeof raw !== 'string') return '';
  return raw.replace(/^Bearer\s+/i, '');
}

function buildResponse(
  config: InternalAxiosRequestConfig,
  status: number,
  data: unknown
): AxiosResponse<unknown> {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : status === 401 ? 'Unauthorized' : 'Error',
    headers: { 'content-type': 'application/json' },
    config,
    request: null
  } as AxiosResponse<unknown>;
}

export const mockAdapter: AxiosAdapter = async (config) => {
  await sleep(120 + Math.floor(Math.random() * 160));
  const fullUrl = `${config.baseURL ?? ''}${config.url ?? ''}`;
  const [pathPart, searchPart] = fullUrl.split('?');
  const path = pathPart.replace(/^\/api\/v1/, '') || '/';
  const query = new URLSearchParams(searchPart ?? '');
  const params = config.params as Record<string, unknown> | undefined;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) value.forEach((item) => query.append(key, String(item)));
      else query.set(key, String(value));
    });
  }
  const method = (config.method ?? 'get').toUpperCase();
  const match = routes.find((route) => route.method === method && route.pattern.test(path));
  if (!match) {
    return buildResponse(config, 404, { code: 404, message: `接口不存在：${method} ${path}`, data: null });
  }
  const matched = match.pattern.exec(path);
  const routeParams: Record<string, string> = {};
  match.keys.forEach((key, index) => {
    routeParams[key] = decodeURIComponent(matched?.[index + 1] ?? '');
  });
  const db = getDb();
  try {
    let operator: StoredUser | null = null;
    if (!match.public) {
      const token = readToken(config);
      const matchedUser = /^mock-token-(\d+)$/.exec(token);
      if (!matchedUser) unauthorized();
      const user = db.users.find((item) => item.id === Number(matchedUser[1]));
      if (!user) unauthorized();
      if (user.status === 0) unauthorized('该账号已被停用，请联系管理员');
      operator = user;
    }
    const body = parseRequestBody(config);
    const data = match.handler({
      db,
      operator: operator ?? db.users[0],
      query,
      body,
      params: routeParams
    });
    return buildResponse(config, 200, { code: 0, message: 'ok', data });
  } catch (error) {
    if (error instanceof MockApiError) {
      if (error.status === 200) {
        return buildResponse(config, 200, { code: error.code, message: error.message, data: null });
      }
      return buildResponse(config, error.status, {
        code: error.code,
        message: error.message,
        data: null
      });
    }
    if (error instanceof Error) {
      return buildResponse(config, 500, { code: 500, message: error.message, data: null });
    }
    return buildResponse(config, 500, { code: 500, message: '模拟接口内部异常', data: null });
  }
};
