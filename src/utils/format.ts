import dayjs from 'dayjs';

/** 数字/字符串金额与数量统一转 number，非法值返回 0 */
export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 17,125,369：表格曝光量不缩写（8.6） */
export function formatInt(value: number | string | null | undefined): string {
  return Math.round(toNumber(value)).toLocaleString('en-US');
}

/** 指标卡：超过 1 万缩写为“万”，保留 1 位小数（8.6） */
export function formatWan(value: number | string | null | undefined): string {
  const n = toNumber(value);
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)} 万`;
  return n.toLocaleString('en-US');
}

/** ¥128,600.00 */
export function formatMoney(value: number | string | null | undefined): string {
  const n = toNumber(value);
  return `¥${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 101.45% */
export function formatPercent(value: number | string | null | undefined, decimals = 2): string {
  const n = toNumber(value);
  return `${n.toFixed(decimals)}%`;
}

export function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD') : '—';
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : '—';
}

/** 手机号脱敏：保留前 3 位与后 4 位（10.3） */
export function maskPhone(phone: string | null | undefined): string {
  const raw = (phone ?? '').trim();
  if (!raw) return '—';
  if (raw.length <= 7) return raw;
  return `${raw.slice(0, 3)}${'*'.repeat(raw.length - 7)}${raw.slice(-4)}`;
}

/** 计划排期：2026-10-01 ~ 2026-12-31 */
export function formatDateRange(start: string, end: string): string {
  return `${formatDate(start)} ~ ${formatDate(end)}`;
}

/** 把百分比数值限制并返回带 % 的字符串，用于完成率 */
export function formatCompletion(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '—';
  return formatPercent(rate, 2);
}
