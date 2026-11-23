/**
 * 模拟数据生成算法（技术方案 4.5.4）
 *
 * 规则：
 * 1. 按计划排期逐日生成，当日曝光量 = 目标总曝光量 × 当日权重 × (1 ± 15%)；
 * 2. 曝光人数 = 曝光量 ÷ 曝光频次（去重触达，不能由曝光量反推真实人数，这里只做近似模拟）；
 * 3. 点击人数 = 曝光人数 × 点击率，且不得大于曝光人数；
 * 4. 日消耗 = 曝光量 ÷ 1000 × 千人曝光成本；
 * 5. 人群维度按比例拆分后用“最大余数法”取整，各维度合计严格等于当日总量；
 * 6. 固定随机种子 + 计划编码，同一组参数每次生成结果一致；
 * 7. 若目标总曝光量取计划目标，则完成率 = 实际生成总量 ÷ 计划目标曝光量。
 */
import dayjs from 'dayjs';
import type { CampaignDailyStat, CurveType, MockParamsInput } from '@/types';

export interface MockDimensions {
  region: Record<string, number>;
  gender: Record<string, number>;
  age: Record<string, number>;
}

export interface GeneratedCampaignMock {
  daily: CampaignDailyStat[];
  dimensions: { date: string; split: MockDimensions }[];
  totals: {
    days: number;
    impressions: number;
    reach: number;
    clicks: number;
    cost: number;
  };
}

export interface MockPreviewDay {
  date: string;
  impressions: number;
  completion: number;
}

export interface MockPreview {
  campaignId: number;
  campaignCode: string;
  campaignName: string;
  days: number;
  totalImpressions: number;
  targetImpressions: number;
  completionRate: number;
  daysData: MockPreviewDay[];
}

/** FNV-1a 32 位散列，用于把字符串种子转成数字 */
export function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 伪随机数生成器：同一种子序列固定，保证可复现 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDateRange(startDate: string, endDate: string): string[] {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) return [];
  const dates: string[] = [];
  let cursor = start;
  while (cursor.isBefore(end) || cursor.isSame(end)) {
    dates.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }
  return dates;
}

/** 投放曲线权重，归一化后返回（合计 = 1） */
export function buildCurveWeights(dates: string[], curve: CurveType): number[] {
  const length = dates.length;
  if (length === 0) return [];
  const raw = dates.map((date, index) => {
    const ratio = length === 1 ? 0 : index / (length - 1);
    switch (curve) {
      case 'asc':
        return 0.6 + ratio * 0.8;
      case 'desc':
        return 1.4 - ratio * 0.8;
      case 'weekend': {
        const week = dayjs(date).day();
        return week === 0 || week === 6 ? 1.35 : 1;
      }
      case 'even':
      default:
        return 1;
    }
  });
  const total = raw.reduce((sum, item) => sum + item, 0);
  return raw.map((item) => (total === 0 ? 1 / length : item / total));
}

/** 最大余数法：按比例拆分整数，保证合计恰好等于 total */
export function splitByRatio(total: number, ratios: Record<string, number>): Record<string, number> {
  const entries = Object.entries(ratios);
  const result: Record<string, number> = {};
  if (total <= 0 || entries.length === 0) {
    entries.forEach(([key]) => {
      result[key] = 0;
    });
    return result;
  }
  const raw = entries.map(([key, ratio]) => {
    const exact = (total * ratio) / 100;
    return { key, base: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let remaining = total - raw.reduce((sum, item) => sum + item.base, 0);
  raw.forEach((item) => {
    result[item.key] = item.base;
  });
  const ordered = [...raw].sort((a, b) => b.fraction - a.fraction);
  let index = 0;
  while (remaining > 0) {
    const target = ordered[index % ordered.length];
    result[target.key] += 1;
    remaining -= 1;
    index += 1;
  }
  return result;
}

function roundCost(impressions: number, cpm: number): number {
  return Math.round((impressions / 1000) * cpm * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 单日曝光量（不含 ±15% 之外的其他波动） */
function exposureForDay(target: number, weight: number, jitter: number): number {
  return Math.max(0, Math.round(target * weight * (1 + jitter)));
}

/** 根据曝光量与参数推导曝光人数 / 点击人数 / 消耗 */
export function deriveDailyMetrics(
  impressions: number,
  params: Pick<MockParamsInput, 'frequency' | 'ctr' | 'cpm'>
): Pick<CampaignDailyStat, 'reach' | 'clicks' | 'cost'> {
  const frequency = params.frequency || 1;
  const reach = clamp(Math.round(impressions / frequency), 0, impressions);
  const clicks = clamp(Math.round((reach * params.ctr) / 100), 0, reach);
  return { reach, clicks, cost: roundCost(impressions, params.cpm) };
}

export function validateMockParams(params: MockParamsInput): string | null {
  if (!Number.isFinite(params.targetImpressions) || params.targetImpressions <= 0) {
    return '目标总曝光量需大于 0，请检查后重试';
  }
  if (!Number.isFinite(params.ctr) || params.ctr <= 0 || params.ctr > 20) {
    return '模拟参数超出合理范围，请检查后重试';
  }
  if (!Number.isFinite(params.cpm) || params.cpm <= 0) {
    return '模拟参数超出合理范围，请检查后重试';
  }
  if (!Number.isFinite(params.frequency) || params.frequency <= 0) {
    return '模拟参数超出合理范围，请检查后重试';
  }
  const ratioGroups: { label: string; ratios: Record<string, number> }[] = [
    { label: '地域', ratios: params.ratios.region },
    { label: '性别', ratios: params.ratios.gender },
    { label: '年龄', ratios: params.ratios.age }
  ];
  for (const group of ratioGroups) {
    const values = Object.values(group.ratios);
    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      return `${group.label}分布比例不能为负数，请检查后重试`;
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 100) > 0.001) {
      return `${group.label}分布比例合计需等于 100%，当前为 ${total.toFixed(2)}%`;
    }
  }
  return null;
}

/**
 * 生成单计划模拟数据。
 * @param params 参数（targetImpressions 为本次生成的目标总曝光量）
 * @param dates 排期日期数组
 * @param campaignKey 计划编码，与种子一起参与随机数生成，保证同计划可复现
 */
export function generateCampaignMock(
  params: MockParamsInput,
  dates: string[],
  campaignKey: string
): GeneratedCampaignMock {
  const weights = buildCurveWeights(dates, params.curve);
  const random = mulberry32(hashSeed(`${params.seed}:${campaignKey}`));
  const daily: CampaignDailyStat[] = [];
  const dimensions: { date: string; split: MockDimensions }[] = [];

  dates.forEach((date, index) => {
    const jitter = random() * 0.3 - 0.15;
    const impressions = exposureForDay(params.targetImpressions, weights[index] ?? 0, jitter);
    const derived = deriveDailyMetrics(impressions, params);
    daily.push({ date, impressions, ...derived });
    dimensions.push({
      date,
      split: {
        region: splitByRatio(impressions, params.ratios.region),
        gender: splitByRatio(impressions, params.ratios.gender),
        age: splitByRatio(impressions, params.ratios.age)
      }
    });
  });

  const totals = daily.reduce(
    (acc, item) => {
      acc.impressions += item.impressions;
      acc.reach += item.reach;
      acc.clicks += item.clicks;
      acc.cost = Math.round((acc.cost + item.cost) * 100) / 100;
      return acc;
    },
    { days: daily.length, impressions: 0, reach: 0, clicks: 0, cost: 0 }
  );

  return { daily, dimensions, totals };
}

/**
 * 校准生成总量到指定值（仅用于演示预置数据，使 12.3 的 17,125,369 精确命中）。
 * 把差额按“从后往前、每日本身曝光量”逐步吸收，再重算曝光人数/点击/消耗，保证数据自洽。
 */
export function calibrateTotal(
  daily: CampaignDailyStat[],
  expectedTotal: number,
  params: Pick<MockParamsInput, 'frequency' | 'ctr' | 'cpm'>
): CampaignDailyStat[] {
  if (daily.length === 0) return [];
  const currentTotal = daily.reduce((sum, item) => sum + item.impressions, 0);
  let diff = expectedTotal - currentTotal;
  if (diff === 0) return daily;
  const result = daily.map((item) => ({ ...item }));
  let cursor = result.length - 1;
  let guard = 0;
  while (diff !== 0 && guard < result.length * 3) {
    const target = result[cursor];
    const step = diff > 0 ? Math.min(diff, Math.max(1, Math.round(expectedTotal / result.length))) : diff;
    const next = Math.max(0, target.impressions + step);
    const applied = next - target.impressions;
    if (applied !== 0) {
      target.impressions = next;
      diff -= applied;
    }
    cursor -= 1;
    guard += 1;
    if (cursor < 0) cursor = result.length - 1;
  }
  return result.map((item) => ({
    date: item.date,
    impressions: item.impressions,
    ...deriveDailyMetrics(item.impressions, params)
  }));
}

/** 搜索一个使生成总量最接近期望值的种子变体（演示数据用） */
export function findSeedForTotal(
  params: MockParamsInput,
  dates: string[],
  campaignKey: string,
  expectedTotal: number,
  maxCandidates = 4000
): { seed: string; total: number } {
  let best = { seed: params.seed, total: 0 };
  let bestDiff = Number.POSITIVE_INFINITY;
  const weights = buildCurveWeights(dates, params.curve);
  for (let index = 0; index < maxCandidates; index += 1) {
    const candidateSeed = index === 0 ? params.seed : `${params.seed}#${index}`;
    const random = mulberry32(hashSeed(`${candidateSeed}:${campaignKey}`));
    let total = 0;
    for (let day = 0; day < dates.length; day += 1) {
      const jitter = random() * 0.3 - 0.15;
      total += exposureForDay(params.targetImpressions, weights[day] ?? 0, jitter);
    }
    const diff = Math.abs(total - expectedTotal);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = { seed: candidateSeed, total };
      if (diff === 0) break;
    }
  }
  return best;
}

export interface MockPreviewInput {
  campaignId: number;
  campaignCode: string;
  campaignName: string;
  targetImpressions: number;
  plannedImpressions: number;
  daily: CampaignDailyStat[];
}

/**
 * 多计划预览：按日期并集聚合（设计定案）。
 * 总曝光 = Σ；日均 = Σ ÷ 并集天数；预计完成率 = Σ实际 ÷ Σ计划目标。
 */
export function aggregatePreview(rows: MockPreviewInput[]): {
  totalImpressions: number;
  totalPlanned: number;
  averageDaily: number;
  peakDaily: number;
  completionRate: number;
  daysData: MockPreviewDay[];
} {
  const byDate = new Map<string, number>();
  let totalImpressions = 0;
  let totalPlanned = 0;
  rows.forEach((row) => {
    totalPlanned += row.plannedImpressions;
    row.daily.forEach((item) => {
      totalImpressions += item.impressions;
      byDate.set(item.date, (byDate.get(item.date) ?? 0) + item.impressions);
    });
  });
  const dates = [...byDate.keys()].sort();
  const daysData: MockPreviewDay[] = [];
  let cumulative = 0;
  dates.forEach((date) => {
    cumulative += byDate.get(date) ?? 0;
    daysData.push({
      date,
      impressions: byDate.get(date) ?? 0,
      completion: totalPlanned > 0 ? (cumulative / totalPlanned) * 100 : 0
    });
  });
  const peakDaily = dates.reduce((peak, date) => Math.max(peak, byDate.get(date) ?? 0), 0);
  return {
    totalImpressions,
    totalPlanned,
    averageDaily: dates.length > 0 ? totalImpressions / dates.length : 0,
    peakDaily,
    completionRate: totalPlanned > 0 ? (totalImpressions / totalPlanned) * 100 : 0,
    daysData
  };
}
