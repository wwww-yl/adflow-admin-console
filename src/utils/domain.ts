import type { CampaignStatus, LogTargetType, PlatformCode, Role } from '@/types';

/** Element Plus 标签可用语义色 */
export type TagType = 'primary' | 'success' | 'warning' | 'info' | 'danger';

export const PLATFORM_LABELS: Record<PlatformCode, string> = {
  douyin: '抖音',
  wechat: '微信',
  xiaohongshu: '小红书',
  kuaishou: '快手',
  baidu: '百度',
  other: '其他'
};

export const PLATFORM_TAG_TYPES: Record<PlatformCode, TagType> = {
  douyin: 'danger',
  wechat: 'success',
  xiaohongshu: 'warning',
  kuaishou: 'info',
  baidu: 'primary',
  other: 'info'
};

export const CAMPAIGN_STATUS_META: Record<CampaignStatus, { label: string; type: TagType }> = {
  draft: { label: '草稿', type: 'info' },
  pending: { label: '待审核', type: 'warning' },
  scheduled: { label: '已排期', type: 'primary' },
  running: { label: '投放中', type: 'success' },
  paused: { label: '已暂停', type: 'warning' },
  finished: { label: '已结束', type: 'info' },
  closed: { label: '已结案', type: 'info' }
};

export const LOG_TARGET_META: Record<LogTargetType, { label: string; type: TagType }> = {
  user: { label: '用户', type: 'primary' },
  vendor: { label: '厂商', type: 'success' },
  campaign: { label: '投放计划', type: 'primary' },
  project: { label: '项目', type: 'info' },
  mock: { label: '模拟数据', type: 'warning' },
  dict: { label: '字典', type: 'info' },
  auth: { label: '登录', type: 'info' }
};

export const LOG_TARGET_OPTIONS: { value: LogTargetType; label: string }[] = [
  { value: 'user', label: '用户' },
  { value: 'vendor', label: '厂商' },
  { value: 'campaign', label: '投放计划' },
  { value: 'project', label: '项目' },
  { value: 'mock', label: '模拟数据' },
  { value: 'dict', label: '字典' },
  { value: 'auth', label: '登录' }
];

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'admin', label: '管理员' },
  { value: 'user', label: '普通用户' }
];

export const ROLE_TAG_TYPES: Record<Role, TagType> = {
  admin: 'primary',
  user: 'info'
};

export const STATUS_OPTIONS: { value: 1 | 0; label: string }[] = [
  { value: 1, label: '启用' },
  { value: 0, label: '停用' }
];

export const BID_MODE_OPTIONS: { value: 'cpm' | 'cpc'; label: string }[] = [
  { value: 'cpm', label: '按曝光计费' },
  { value: 'cpc', label: '按点击计费' }
];
