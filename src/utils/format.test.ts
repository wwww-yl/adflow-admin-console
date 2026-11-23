import { describe, expect, it } from 'vitest';
import {
  formatCompletion,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatInt,
  formatMoney,
  formatPercent,
  formatWan,
  maskPhone,
  toNumber
} from './format';

describe('toNumber', () => {
  it('兼容数字、数字字符串与空值', () => {
    expect(toNumber(12.5)).toBe(12.5);
    expect(toNumber('128600')).toBe(128600);
    expect(toNumber('')).toBe(0);
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber('not-a-number')).toBe(0);
  });
});

describe('formatInt', () => {
  it('曝光量千分位、不缩写（技术方案 8.6）', () => {
    expect(formatInt(17_125_369)).toBe('17,125,369');
    expect(formatInt('968800')).toBe('968,800');
    expect(formatInt(null)).toBe('0');
  });
});

describe('formatWan', () => {
  it('超过一万缩写为万并保留一位小数，否则保持千分位', () => {
    expect(formatWan(17_125_369)).toBe('1712.5 万');
    expect(formatWan(10000)).toBe('1.0 万');
    expect(formatWan(9800)).toBe('9,800');
  });
});

describe('formatMoney', () => {
  it('金额千分位两位小数并加 ¥', () => {
    expect(formatMoney(128600)).toBe('¥128,600.00');
    expect(formatMoney('0')).toBe('¥0.00');
  });
});

describe('formatPercent', () => {
  it('百分比默认两位小数', () => {
    expect(formatPercent(101.45)).toBe('101.45%');
    expect(formatPercent(1.15)).toBe('1.15%');
    expect(formatPercent(0.5, 1)).toBe('0.5%');
  });
});

describe('formatCompletion', () => {
  it('完成率为空时显示占位符', () => {
    expect(formatCompletion(null)).toBe('—');
    expect(formatCompletion(101.456)).toBe('101.46%');
  });
});

describe('formatDate / formatDateTime', () => {
  it('按 8.5 的日期与时间格式输出', () => {
    expect(formatDate('2026-11-23')).toBe('2026-11-23');
    expect(formatDate('')).toBe('—');
    expect(formatDateTime('2026-11-23 10:30:00')).toBe('2026-11-23 10:30');
    expect(formatDateTime(undefined)).toBe('—');
  });

  it('排期区间格式为 开始 ~ 结束', () => {
    expect(formatDateRange('2026-10-01', '2026-12-31')).toBe('2026-10-01 ~ 2026-12-31');
  });
});

describe('maskPhone', () => {
  it('手机号保留前三后四（技术方案 10.3）', () => {
    expect(maskPhone('13912345678')).toBe('139****5678');
    expect(maskPhone(null)).toBe('—');
    expect(maskPhone('')).toBe('—');
    expect(maskPhone('1234567')).toBe('1234567');
  });
});
