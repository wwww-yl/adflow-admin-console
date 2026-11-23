/** 表单校验规则（技术方案 5.2 / 4.8.2） */

export const ACCOUNT_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{3,19}$/;
export const VENDOR_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,19}$/;
export const PHONE_PATTERN = /^(1[3-9]\d{9}|0\d{2,3}-?\d{7,8})$/;

export function isAccount(value: string): boolean {
  return ACCOUNT_PATTERN.test(value);
}

export function isVendorCode(value: string): boolean {
  return VENDOR_CODE_PATTERN.test(value);
}

export function isPhone(value: string): boolean {
  return PHONE_PATTERN.test(value);
}

/** 人群比例合计必须 = 100% */
export function isRatioTotalValid(values: number[], tolerance = 0.001): boolean {
  const total = values.reduce((sum, item) => sum + item, 0);
  return Math.abs(total - 100) < tolerance;
}
