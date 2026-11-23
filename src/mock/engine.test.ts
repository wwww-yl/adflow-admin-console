import { describe, expect, it } from 'vitest';
import type { CampaignDailyStat, MockParamsInput } from '@/types';
import { DEFAULT_RATIOS } from './constants';
import {
  aggregatePreview,
  buildCurveWeights,
  buildDateRange,
  calibrateTotal,
  deriveDailyMetrics,
  generateCampaignMock,
  splitByRatio,
  validateMockParams,
  type MockPreviewInput
} from './engine';

function cloneRatios(): MockParamsInput['ratios'] {
  return JSON.parse(JSON.stringify(DEFAULT_RATIOS)) as MockParamsInput['ratios'];
}

function params(overrides: Partial<MockParamsInput> = {}): MockParamsInput {
  return {
    targetImpressions: 1_000_000,
    curve: 'even',
    ctr: 1.15,
    cpm: 12,
    frequency: 65,
    seed: 'unit-test-seed',
    ratios: cloneRatios(),
    ...overrides
  };
}

const dates = buildDateRange('2026-10-01', '2026-10-07');

function stat(date: string, impressions: number): CampaignDailyStat {
  return { date, impressions, reach: 0, clicks: 0, cost: 0 };
}

describe('buildDateRange', () => {
  it('生成排期内的闭区间日期列表', () => {
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe('2026-10-01');
    expect(dates[6]).toBe('2026-10-07');
  });
});

describe('buildCurveWeights', () => {
  const curves = ['even', 'asc', 'desc', 'weekend'] as const;

  it.each(curves)('%s 曲线权重合计归一化为 1', (curve) => {
    const weights = buildCurveWeights(dates, curve);
    expect(weights).toHaveLength(dates.length);
    const sum = weights.reduce((acc, weight) => acc + weight, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('前低后高与前高后低方向正确', () => {
    const asc = buildCurveWeights(dates, 'asc');
    const desc = buildCurveWeights(dates, 'desc');
    expect(asc[asc.length - 1]).toBeGreaterThan(asc[0]);
    expect(desc[0]).toBeGreaterThan(desc[desc.length - 1]);
  });

  it('周末加权：周末权重高于工作日均值', () => {
    const week = buildDateRange('2026-10-05', '2026-10-11'); // 周一至周日
    const weights = buildCurveWeights(week, 'weekend');
    const weekdayAverage =
      [weights[0], weights[1], weights[2], weights[3], weights[4]].reduce((acc, weight) => acc + weight, 0) / 5;
    expect(weights[5]).toBeGreaterThan(weekdayAverage);
    expect(weights[6]).toBeGreaterThan(weekdayAverage);
  });
});

describe('generateCampaignMock', () => {
  it('相同参数与计划编码生成结果完全可复现', () => {
    const first = generateCampaignMock(params(), dates, 'DC20261001-0001');
    const second = generateCampaignMock(params(), dates, 'DC20261001-0001');
    expect(first.daily).toEqual(second.daily);
    expect(first.dimensions).toEqual(second.dimensions);
    expect(first.totals).toEqual(second.totals);
  });

  it('不同随机种子生成不同结果', () => {
    const first = generateCampaignMock(params(), dates, 'DC-1');
    const second = generateCampaignMock(params({ seed: 'another-seed' }), dates, 'DC-1');
    expect(first.totals.impressions).not.toBe(second.totals.impressions);
  });

  it('每日与汇总指标满足口径约束', () => {
    const result = generateCampaignMock(params(), dates, 'DC-1');
    expect(result.daily).toHaveLength(7);
    const sum = result.daily.reduce((acc, day) => acc + day.impressions, 0);
    expect(result.totals.impressions).toBe(sum);
    result.daily.forEach((day) => {
      expect(day.reach).toBeLessThanOrEqual(day.impressions);
      expect(day.clicks).toBeLessThanOrEqual(day.reach);
      expect(day.clicks).toBeGreaterThanOrEqual(0);
      expect(day.cost).toBeGreaterThanOrEqual(0);
    });
  });

  it('每日曝光量在目标日均值的 ±15% 波动范围内', () => {
    const result = generateCampaignMock(params(), dates, 'DC-1');
    const average = params().targetImpressions / dates.length;
    result.daily.forEach((day) => {
      expect(day.impressions).toBeGreaterThanOrEqual(Math.floor(average * 0.84));
      expect(day.impressions).toBeLessThanOrEqual(Math.ceil(average * 1.16));
    });
  });

  it('人群三个维度合计严格等于当日曝光量', () => {
    const result = generateCampaignMock(params(), dates, 'DC-1');
    result.dimensions.forEach((item, index) => {
      const day = result.daily[index];
      const groups = [item.split.region, item.split.gender, item.split.age];
      groups.forEach((split) => {
        const sum = Object.values(split).reduce((acc, value) => acc + value, 0);
        expect(sum).toBe(day.impressions);
      });
    });
  });
});

describe('splitByRatio', () => {
  it('最大余数法保证合计严格等于总量', () => {
    const split = splitByRatio(1001, { 江苏: 46, 浙江: 18, 上海: 14, 安徽: 9, 山东: 7, 其他: 6 });
    const sum = Object.values(split).reduce((acc, value) => acc + value, 0);
    expect(sum).toBe(1001);
    Object.values(split).forEach((value) => {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('deriveDailyMetrics', () => {
  it('按频次折算曝光人数、按点击率折算点击人数、按千人成本折算消耗', () => {
    expect(deriveDailyMetrics(1000, { frequency: 10, ctr: 2, cpm: 10 })).toEqual({
      reach: 100,
      clicks: 2,
      cost: 10
    });
  });

  it('曝光人数不超过曝光量，点击人数不超过曝光人数', () => {
    const derived = deriveDailyMetrics(100, { frequency: 1, ctr: 20, cpm: 8 });
    expect(derived.reach).toBeLessThanOrEqual(100);
    expect(derived.clicks).toBeLessThanOrEqual(derived.reach);
  });
});

describe('validateMockParams', () => {
  it('默认参数通过校验', () => {
    expect(validateMockParams(params())).toBeNull();
  });

  it('点击率超出 (0, 20] 区间时拒绝', () => {
    expect(validateMockParams(params({ ctr: 0 }))).toBe('模拟参数超出合理范围，请检查后重试');
    expect(validateMockParams(params({ ctr: 20.01 }))).toBe('模拟参数超出合理范围，请检查后重试');
  });

  it('目标总曝光量需大于 0', () => {
    expect(validateMockParams(params({ targetImpressions: 0 }))).toBe('目标总曝光量需大于 0，请检查后重试');
  });

  it('人群比例合计不等于 100% 时给出差额提示', () => {
    const invalid = params();
    invalid.ratios.region['其他'] = 0;
    expect(validateMockParams(invalid)).toContain('地域分布比例合计需等于 100%');
  });

  it('人群比例出现负数时拒绝', () => {
    const invalid = params();
    invalid.ratios.gender['未知'] = -3;
    expect(validateMockParams(invalid)).toContain('不能为负数');
  });
});

describe('calibrateTotal', () => {
  it('校准后总曝光量精确命中期望值并重算指标', () => {
    const generated = generateCampaignMock(params(), dates, 'DC-1');
    const calibrated = calibrateTotal(generated.daily, 1_234_567, params());
    const total = calibrated.reduce((acc, day) => acc + day.impressions, 0);
    expect(total).toBe(1_234_567);
    calibrated.forEach((day) => {
      expect(day.reach).toBeLessThanOrEqual(day.impressions);
      expect(day.clicks).toBeLessThanOrEqual(day.reach);
    });
  });

  it('空明细安全返回', () => {
    expect(calibrateTotal([], 100, params())).toEqual([]);
  });
});

describe('aggregatePreview', () => {
  const rowA: MockPreviewInput = {
    campaignId: 1,
    campaignCode: 'DC-A',
    campaignName: '计划 A',
    targetImpressions: 300,
    plannedImpressions: 300,
    daily: [stat('2026-10-01', 100), stat('2026-10-02', 200)]
  };
  const rowB: MockPreviewInput = {
    campaignId: 2,
    campaignCode: 'DC-B',
    campaignName: '计划 B',
    targetImpressions: 100,
    plannedImpressions: 100,
    daily: [stat('2026-10-02', 50), stat('2026-10-03', 150)]
  };

  it('多计划按日期并集聚合', () => {
    const preview = aggregatePreview([rowA, rowB]);
    expect(preview.daysData.map((day) => day.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(preview.daysData.map((day) => day.impressions)).toEqual([100, 250, 150]);
    expect(preview.totalImpressions).toBe(500);
    expect(preview.totalPlanned).toBe(400);
    expect(preview.peakDaily).toBe(250);
    expect(preview.averageDaily).toBeCloseTo(500 / 3, 5);
    expect(preview.completionRate).toBeCloseTo(125, 5);
  });

  it('累计完成率单调递增且末值等于总完成率', () => {
    const preview = aggregatePreview([rowA, rowB]);
    for (let index = 1; index < preview.daysData.length; index += 1) {
      expect(preview.daysData[index].completion).toBeGreaterThanOrEqual(
        preview.daysData[index - 1].completion
      );
    }
    expect(preview.daysData[preview.daysData.length - 1].completion).toBeCloseTo(
      preview.completionRate,
      5
    );
  });
});
