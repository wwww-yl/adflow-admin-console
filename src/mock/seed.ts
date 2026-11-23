/**
 * 演示种子数据（技术方案 12.3）
 *
 * 预置项目「2026 年太仓分公司全域融数」与三条计划，主计划：
 *   目标曝光量 16,880,000，实际曝光量 17,125,369，完成率 101.45%，曝光人数约 19.7 万，点击率 1.15%。
 *
 * 关于文档内部矛盾（已在 README 标注）：
 * 文档 12.3 给出的曝光人数 196,942 恰好等于 17,125,369 × 1.15%，但 7.1 又写明
 * “曝光人数为去重触达人数，不可由曝光量直接推算”。本演示按人数口径还原为
 * 17,125,369 ÷ 87 ≈ 196,843，与文档演示值在展示精度上仍约为 19.7 万。
 */
import type {
  AgeDict,
  Campaign,
  CampaignDailyStat,
  ChannelDict,
  MetricDict,
  MockParamsInput,
  MockPreset,
  MockProfile,
  MockRatios,
  OperationLog,
  Project
} from '@/types';
import { DEFAULT_RATIOS } from './constants';
import { calibrateTotal, buildDateRange, findSeedForTotal, generateCampaignMock } from './engine';
import type { MockDb, StoredUser, VendorEntity } from './db';

export const SEED_VERSION = '2026.11.23.1';

const MAIN_TARGET = 16880000;
const MAIN_EXPECTED = 17125369;
const ENDED_TARGET = 3200000;
const ENDED_EXPECTED = 3168400;

export function cloneRatios(ratios: MockRatios = DEFAULT_RATIOS): MockRatios {
  return {
    region: { ...ratios.region },
    gender: { ...ratios.gender },
    age: { ...ratios.age }
  };
}

function createMainMock(): { params: MockParamsInput; daily: CampaignDailyStat[] } {
  const dates = buildDateRange('2026-10-01', '2026-12-31');
  const baseParams: MockParamsInput = {
    targetImpressions: MAIN_TARGET,
    curve: 'even',
    ctr: 1.15,
    cpm: 12,
    frequency: 87,
    seed: 'DC20261001-0003',
    ratios: cloneRatios()
  };
  const best = findSeedForTotal(baseParams, dates, 'DC20261001-0003', MAIN_EXPECTED, 4000);
  const params: MockParamsInput = { ...baseParams, seed: best.seed };
  const generated = generateCampaignMock(params, dates, 'DC20261001-0003');
  const daily = calibrateTotal(generated.daily, MAIN_EXPECTED, params);
  return { params, daily };
}

function createEndedMock(): { params: MockParamsInput; daily: CampaignDailyStat[] } {
  const dates = buildDateRange('2026-08-01', '2026-09-15');
  const baseParams: MockParamsInput = {
    targetImpressions: ENDED_TARGET,
    curve: 'desc',
    ctr: 1.32,
    cpm: 14,
    frequency: 72,
    seed: 'DC20260801-0001',
    ratios: cloneRatios()
  };
  const best = findSeedForTotal(baseParams, dates, 'DC20260801-0001', ENDED_EXPECTED, 2000);
  const params: MockParamsInput = { ...baseParams, seed: best.seed };
  const generated = generateCampaignMock(params, dates, 'DC20260801-0001');
  const daily = calibrateTotal(generated.daily, ENDED_EXPECTED, params);
  return { params, daily };
}

function createUsers(): StoredUser[] {
  return [
    {
      id: 1,
      account: 'admin',
      name: '系统管理员',
      role: 'admin',
      status: 1,
      createdAt: '2026-09-01 09:00',
      lastLoginAt: '2026-11-23 09:12',
      password: 'admin123'
    },
    {
      id: 2,
      account: 'user01',
      name: '张投手',
      role: 'user',
      status: 1,
      createdAt: '2026-09-12 10:24',
      lastLoginAt: '2026-11-22 18:40',
      password: 'user123'
    },
    {
      id: 3,
      account: 'ops01',
      name: '李运营',
      role: 'admin',
      status: 1,
      createdAt: '2026-10-08 14:10',
      lastLoginAt: '2026-11-21 10:05',
      password: 'admin123'
    },
    {
      id: 4,
      account: 'media02',
      name: '王媒介',
      role: 'user',
      status: 0,
      createdAt: '2026-10-15 11:32',
      lastLoginAt: '2026-11-02 14:20',
      password: 'user123'
    }
  ];
}

function createVendors(): VendorEntity[] {
  return [
    {
      id: 1,
      code: 'VD-2026-001',
      name: '苏州星驰数字营销有限公司',
      platform: 'douyin',
      contact: '周敏',
      phone: '13812345678',
      status: 1,
      remark: '抖音一级代理，季度返点 8%，配合度较高',
      updatedAt: '2026-11-18 16:40'
    },
    {
      id: 2,
      code: 'VD-2026-002',
      name: '上海云聚传媒有限公司',
      platform: 'wechat',
      contact: '李想',
      phone: '13998765432',
      status: 1,
      remark: '朋友圈与视频号资源，结算周期 T+7',
      updatedAt: '2026-11-17 10:12'
    },
    {
      id: 3,
      code: 'VD-2026-003',
      name: '杭州新芒文化传媒有限公司',
      platform: 'xiaohongshu',
      contact: '王倩',
      phone: '13711112222',
      status: 1,
      remark: '小红书 KOL 资源，需提前 5 天预约排期',
      updatedAt: '2026-11-16 09:08'
    },
    {
      id: 4,
      code: 'VD-2026-004',
      name: '南京汇量信息科技有限公司',
      platform: 'baidu',
      contact: '陈昊',
      phone: '13600001111',
      status: 0,
      remark: '暂停合作，历史计划数据保留',
      updatedAt: '2026-11-21 09:30'
    },
    {
      id: 5,
      code: 'VD-2026-005',
      name: '北京快手直投服务中心',
      platform: 'kuaishou',
      contact: '赵磊',
      phone: '13522223333',
      status: 1,
      remark: '新接入，暂无关联计划',
      updatedAt: '2026-11-19 15:26'
    }
  ];
}

function createProjects(): Project[] {
  return [
    { id: 1, code: 'PRJ-2026-TC-01', name: '2026 年太仓分公司全域融数', remainingBudget: '128600.00' },
    { id: 2, code: 'PRJ-2026-TC-02', name: '太仓本地生活秋冬旺季', remainingBudget: '56000.00' },
    { id: 3, code: 'PRJ-2026-TC-03', name: '昆山区域品牌种草', remainingBudget: '88000.00' }
  ];
}

function createCampaigns(): Campaign[] {
  return [
    {
      id: 1,
      code: 'DC20261001-0003',
      name: '全域曝光 · 双 11 返场计划',
      projectId: 1,
      channelCodes: ['douyin', 'wechat'],
      vendorIds: [1, 2],
      status: 'running',
      budget: '900000.00',
      targetImpressions: String(MAIN_TARGET),
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      createdAt: '2026-09-28 15:20'
    },
    {
      id: 2,
      code: null,
      name: '太仓本地生活 · 朋友圈投放',
      projectId: 2,
      channelCodes: ['wechat'],
      vendorIds: [2],
      status: 'pending',
      budget: '120000.00',
      targetImpressions: '5600000',
      startDate: '2026-12-01',
      endDate: '2027-01-31',
      createdAt: '2026-11-20 11:05'
    },
    {
      id: 3,
      code: 'DC20260801-0001',
      name: '小红书种草 · 声量测试',
      projectId: 1,
      channelCodes: ['xiaohongshu'],
      vendorIds: [3],
      status: 'finished',
      budget: '60000.00',
      targetImpressions: String(ENDED_TARGET),
      startDate: '2026-08-01',
      endDate: '2026-09-15',
      createdAt: '2026-07-28 09:40'
    },
    {
      id: 4,
      code: null,
      name: '抖音直播引流 · 测试计划',
      projectId: 3,
      channelCodes: ['douyin'],
      vendorIds: [],
      status: 'draft',
      budget: '30000.00',
      targetImpressions: '1200000',
      startDate: '2026-12-10',
      endDate: '2026-12-31',
      createdAt: '2026-11-22 17:30'
    }
  ];
}

function createChannels(): ChannelDict[] {
  return [
    {
      code: 'douyin',
      name: '抖音',
      icon: '抖',
      color: '#161823',
      enabled: true,
      bidMode: 'cpm',
      updatedAt: '2026-11-02 10:20'
    },
    {
      code: 'wechat',
      name: '微信',
      icon: '微',
      color: '#07c160',
      enabled: true,
      bidMode: 'cpm',
      updatedAt: '2026-11-02 10:20'
    },
    {
      code: 'xiaohongshu',
      name: '小红书',
      icon: '红',
      color: '#ff2442',
      enabled: true,
      bidMode: 'cpc',
      updatedAt: '2026-11-02 10:21'
    },
    {
      code: 'kuaishou',
      name: '快手',
      icon: '快',
      color: '#ff4906',
      enabled: false,
      bidMode: 'cpm',
      updatedAt: '2026-11-21 09:42'
    },
    {
      code: 'baidu',
      name: '百度',
      icon: '百',
      color: '#2932e1',
      enabled: true,
      bidMode: 'cpc',
      updatedAt: '2026-11-02 10:22'
    },
    {
      code: 'other',
      name: '其他',
      icon: '其',
      color: '#8a94a6',
      enabled: false,
      bidMode: 'cpm',
      updatedAt: '2026-11-02 10:22'
    }
  ];
}

function createAges(): AgeDict[] {
  return ['18-24', '25-29', '30-39', '40-49', '50+'].map((value, index) => ({
    value,
    enabled: true,
    sort: index + 1,
    updatedAt: '2026-11-02 10:10'
  }));
}

function createMetrics(): MetricDict[] {
  return [
    {
      key: 'plannedImpressions',
      name: '计划曝光量',
      formula: 'Σ 各计划目标曝光量',
      decimals: 0,
      visible: true,
      updatedAt: '2026-11-02 10:30'
    },
    {
      key: 'actualImpressions',
      name: '实际曝光量',
      formula: 'Σ 各计划实际曝光量',
      decimals: 0,
      visible: true,
      updatedAt: '2026-11-02 10:30'
    },
    {
      key: 'completionRate',
      name: '曝光完成率',
      formula: '实际曝光量 ÷ 计划曝光量 × 100%',
      decimals: 2,
      visible: true,
      updatedAt: '2026-11-02 10:30'
    },
    {
      key: 'reach',
      name: '曝光人数',
      formula: '去重触达人数（媒体侧回传）',
      decimals: 0,
      visible: true,
      updatedAt: '2026-11-02 10:31'
    },
    {
      key: 'ctr',
      name: '点击率',
      formula: '点击人数 ÷ 曝光人数 × 100%',
      decimals: 2,
      visible: true,
      updatedAt: '2026-11-02 10:31'
    },
    {
      key: 'runningCampaigns',
      name: '在投计划',
      formula: '状态为投放中的计划数',
      decimals: 0,
      visible: true,
      updatedAt: '2026-11-02 10:32'
    }
  ];
}

function createPresets(mainParams: MockParamsInput, endedParams: MockParamsInput): MockPreset[] {
  return [
    {
      id: 1,
      name: '标准曝光 · 均匀投放',
      params: { ...mainParams, seed: '', targetImpressions: MAIN_TARGET },
      createdAt: '2026-11-10 14:20',
      createdBy: '系统管理员'
    },
    {
      id: 2,
      name: '晚间集中 · 前高后低',
      params: {
        ...endedParams,
        seed: '',
        curve: 'desc',
        ctr: 1.2,
        cpm: 14,
        frequency: 60,
        targetImpressions: ENDED_TARGET
      },
      createdAt: '2026-11-18 16:05',
      createdBy: '李运营'
    }
  ];
}

function createLogs(main: MockParamsInput, ended: MockParamsInput): OperationLog[] {
  const mainDetail = {
    params: main,
    days: 92,
    totalImpressions: MAIN_EXPECTED,
    completionRate: Number(((MAIN_EXPECTED / MAIN_TARGET) * 100).toFixed(2))
  };
  const endedDetail = {
    params: ended,
    days: 46,
    totalImpressions: ENDED_EXPECTED,
    completionRate: Number(((ENDED_EXPECTED / ENDED_TARGET) * 100).toFixed(2))
  };
  return [
    {
      id: 1,
      time: '2026-11-20 10:12',
      operatorId: 1,
      operatorName: '系统管理员',
      operatorRole: 'admin',
      action: '登录系统',
      targetType: 'auth',
      targetId: null,
      targetName: '管理端登录',
      detail: null
    },
    {
      id: 2,
      time: '2026-11-20 10:16',
      operatorId: 1,
      operatorName: '系统管理员',
      operatorRole: 'admin',
      action: '生成模拟数据',
      targetType: 'mock',
      targetId: 3,
      targetName: '小红书种草 · 声量测试',
      detail: endedDetail
    },
    {
      id: 3,
      time: '2026-11-21 09:30',
      operatorId: 3,
      operatorName: '李运营',
      operatorRole: 'admin',
      action: '停用厂商',
      targetType: 'vendor',
      targetId: 4,
      targetName: '南京汇量信息科技有限公司',
      detail: { from: '启用', to: '停用' }
    },
    {
      id: 4,
      time: '2026-11-21 09:42',
      operatorId: 1,
      operatorName: '系统管理员',
      operatorRole: 'admin',
      action: '更新渠道字典',
      targetType: 'dict',
      targetId: 'kuaishou',
      targetName: '快手',
      detail: { enabled: false, bidMode: 'cpm' }
    },
    {
      id: 5,
      time: '2026-11-22 14:05',
      operatorId: 1,
      operatorName: '系统管理员',
      operatorRole: 'admin',
      action: '生成模拟数据',
      targetType: 'mock',
      targetId: 1,
      targetName: '全域曝光 · 双 11 返场计划',
      detail: mainDetail
    },
    {
      id: 6,
      time: '2026-11-22 15:20',
      operatorId: 1,
      operatorName: '系统管理员',
      operatorRole: 'admin',
      action: '新增用户',
      targetType: 'user',
      targetId: 3,
      targetName: '李运营',
      detail: { account: 'ops01', role: 'admin' }
    },
    {
      id: 7,
      time: '2026-11-23 09:12',
      operatorId: 1,
      operatorName: '系统管理员',
      operatorRole: 'admin',
      action: '登录系统',
      targetType: 'auth',
      targetId: null,
      targetName: '管理端登录',
      detail: null
    },
    {
      id: 8,
      time: '2026-11-23 09:16',
      operatorId: 1,
      operatorName: '系统管理员',
      operatorRole: 'admin',
      action: '重置演示数据',
      targetType: 'mock',
      targetId: null,
      targetName: '全部模拟数据',
      detail: { scope: '全部项目与计划', mode: 'reset' }
    }
  ];
}

export function buildSeedDb(): MockDb {
  const main = createMainMock();
  const ended = createEndedMock();
  const mainProfile: MockProfile = {
    campaignId: 1,
    ...main.params,
    updatedAt: '2026-11-22 14:05',
    updatedBy: '系统管理员'
  };
  const endedProfile: MockProfile = {
    campaignId: 3,
    ...ended.params,
    updatedAt: '2026-11-20 10:16',
    updatedBy: '系统管理员'
  };
  const dailyStats: Record<number, CampaignDailyStat[]> = {
    1: main.daily,
    3: ended.daily
  };
  const generatedAt: Record<number, string> = {
    1: '2026-11-22 14:05',
    3: '2026-11-20 10:16'
  };
  return {
    version: SEED_VERSION,
    users: createUsers(),
    vendors: createVendors(),
    projects: createProjects(),
    campaigns: createCampaigns(),
    dailyStats,
    profiles: { 1: mainProfile, 3: endedProfile },
    presets: createPresets(main.params, ended.params),
    channels: createChannels(),
    ages: createAges(),
    metrics: createMetrics(),
    logs: createLogs(main.params, ended.params),
    generatedAt,
    nextIds: {
      user: 5,
      vendor: 6,
      preset: 3,
      campaign: 5,
      log: 9
    }
  };
}
