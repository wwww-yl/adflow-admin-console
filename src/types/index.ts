/**
 * 投流统计平台 · 管理端领域类型
 * 金额、曝光量按技术方案 7.4 约定以字符串传输，避免浮点误差；生成算法内部使用 number。
 */

export type Role = 'admin' | 'user';

export interface User {
  id: number;
  account: string;
  name: string;
  role: Role;
  status: 0 | 1;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface LoginResult {
  token: string;
  user: User;
  permissions: string[];
}

export type PlatformCode = 'douyin' | 'wechat' | 'xiaohongshu' | 'kuaishou' | 'baidu' | 'other';

export interface Vendor {
  id: number;
  code: string;
  name: string;
  platform: PlatformCode;
  contact: string;
  phone: string;
  status: 0 | 1;
  remark: string;
  updatedAt: string;
  /** 被投放计划引用的数量，>0 时禁止物理删除（技术方案 4.8.2） */
  planCount: number;
}

export interface Project {
  id: number;
  code: string;
  name: string;
  remainingBudget: string;
}

export type CampaignStatus = 'draft' | 'pending' | 'scheduled' | 'running' | 'paused' | 'finished' | 'closed';

export interface Campaign {
  id: number;
  code: string | null;
  name: string;
  projectId: number;
  channelCodes: string[];
  vendorIds: number[];
  status: CampaignStatus;
  budget: string;
  targetImpressions: string;
  startDate: string;
  endDate: string;
  createdAt: string;
}

export interface CampaignRow extends Campaign {
  projectName: string;
  channels: { code: string; name: string }[];
  vendors: { id: number; name: string }[];
  hasMock: boolean;
  statsDays: number;
  /** 已生成数据时：Σ实际曝光量 */
  actualImpressions: number | null;
  /** 完成率（百分比数值，如 101.45），口径 = 实际曝光量 ÷ 计划目标曝光量 */
  completionRate: number | null;
  lastGeneratedAt: string | null;
}

export interface CampaignDailyStat {
  date: string;
  impressions: number;
  reach: number;
  clicks: number;
  cost: number;
}

export type CurveType = 'even' | 'asc' | 'desc' | 'weekend';

export interface MockRatios {
  region: Record<string, number>;
  gender: Record<string, number>;
  age: Record<string, number>;
}

/** 一次模拟参数提交（生成 / 保存方案 共用） */
export interface MockParamsInput {
  targetImpressions: number;
  curve: CurveType;
  /** 点击率，百分比数值（1.15 表示 1.15%） */
  ctr: number;
  /** 千人曝光成本（元） */
  cpm: number;
  /** 人均曝光频次 */
  frequency: number;
  seed: string;
  ratios: MockRatios;
}

export interface MockProfile extends MockParamsInput {
  campaignId: number;
  updatedAt: string;
  updatedBy: string;
}

export interface MockPreset {
  id: number;
  name: string;
  params: MockParamsInput;
  createdAt: string;
  createdBy: string;
}

export type MockMode = 'generate' | 'overwrite';

export interface MockGenerateResult {
  campaignId: number;
  campaignCode: string;
  campaignName: string;
  mode: MockMode;
  days: number;
  totalImpressions: number;
  completionRate: number;
  generatedAt: string;
}

export interface MockRecord {
  id: number;
  time: string;
  operatorName: string;
  campaignId: number;
  campaignCode: string;
  campaignName: string;
  params: MockParamsInput;
  days: number;
  totalImpressions: number;
  completionRate: number;
}

export type LogTargetType = 'user' | 'vendor' | 'campaign' | 'project' | 'mock' | 'dict' | 'auth';

export interface OperationLog {
  id: number;
  time: string;
  operatorId: number;
  operatorName: string;
  operatorRole: Role;
  action: string;
  targetType: LogTargetType;
  targetId: string | number | null;
  targetName: string;
  detail: Record<string, unknown> | null;
}

export interface ChannelDict {
  code: string;
  name: string;
  /** 列表中的单字图标 */
  icon: string;
  color: string;
  enabled: boolean;
  /** 默认出价方式 */
  bidMode: 'cpm' | 'cpc';
  updatedAt: string;
}

export interface AgeDict {
  value: string;
  enabled: boolean;
  sort: number;
  updatedAt: string;
}

export interface MetricDict {
  key: string;
  name: string;
  formula: string;
  decimals: number;
  visible: boolean;
  updatedAt: string;
}

export interface Paged<T> {
  list: T[];
  total: number;
}

export interface ApiResult<T> {
  code: number;
  message: string;
  data: T;
}
