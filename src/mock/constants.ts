import type { CurveType, MockRatios, PlatformCode, Role } from '@/types';

/** 技术方案 4.8.3 要求的固定提示文案 */
export const MOCK_BANNER_TEXT = '当前为模拟数据，仅用于流程验证与演示';

/** 本地演示账号（仅 mock 模式下展示在登录页） */
export const DEMO_ACCOUNTS: { account: string; password: string; role: Role; label: string }[] = [
  { account: 'admin', password: 'admin123', role: 'admin', label: '系统管理员' },
  { account: 'user01', password: 'user123', role: 'user', label: '普通用户' }
];

export const PLATFORM_OPTIONS: { value: PlatformCode; label: string }[] = [
  { value: 'douyin', label: '抖音' },
  { value: 'wechat', label: '微信' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'kuaishou', label: '快手' },
  { value: 'baidu', label: '百度' },
  { value: 'other', label: '其他' }
];

export const CURVE_OPTIONS: { value: CurveType; label: string; hint: string }[] = [
  { value: 'even', label: '均匀', hint: '每日投放权重相同' },
  { value: 'asc', label: '前低后高', hint: '前半段收敛、后半段放量' },
  { value: 'desc', label: '前高后低', hint: '起量后逐步收量' },
  { value: 'weekend', label: '周末加权', hint: '周六、周日权重放大' }
];

export const RATIO_DIMENSIONS = {
  region: {
    label: '地域分布',
    items: ['江苏', '浙江', '上海', '安徽', '山东', '其他'],
    defaults: { 江苏: 46, 浙江: 18, 上海: 14, 安徽: 9, 山东: 7, 其他: 6 }
  },
  gender: {
    label: '性别分布',
    items: ['男', '女', '未知'],
    defaults: { 男: 52, 女: 45, 未知: 3 }
  },
  age: {
    label: '年龄分布',
    items: ['18-24', '25-29', '30-39', '40-49', '50+'],
    defaults: { '18-24': 12, '25-29': 24, '30-39': 31, '40-49': 21, '50+': 12 }
  }
} as const;

/** 全国均值默认人群比例（表 4-8），合计 100% */
export const DEFAULT_RATIOS: MockRatios = {
  region: { ...RATIO_DIMENSIONS.region.defaults },
  gender: { ...RATIO_DIMENSIONS.gender.defaults },
  age: { ...RATIO_DIMENSIONS.age.defaults }
};

/** 单计划单日明细生成后的完成率口径 */
export const COMPLETION_RATE_HINT = '完成率 = 实际曝光量 ÷ 计划目标曝光量';

export const ROLE_LABELS: Record<Role, string> = {
  admin: '管理员',
  user: '普通用户'
};
