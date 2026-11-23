import type {
  AgeDict,
  Campaign,
  CampaignDailyStat,
  ChannelDict,
  MetricDict,
  MockPreset,
  MockProfile,
  OperationLog,
  Project,
  User,
  Vendor
} from '@/types';
import { buildSeedDb, SEED_VERSION } from './seed';

export const STORAGE_KEY = 'adflow.admin.mock.db.v1';

/** 厂商实体不持久化 planCount（由投放计划引用数实时计算） */
export type VendorEntity = Omit<Vendor, 'planCount'>;

export interface StoredUser extends User {
  password: string;
}

export interface MockDb {
  version: string;
  users: StoredUser[];
  vendors: VendorEntity[];
  projects: Project[];
  campaigns: Campaign[];
  /** campaignId -> 分日数据（模拟生成结果） */
  dailyStats: Record<number, CampaignDailyStat[]>;
  profiles: Record<number, MockProfile>;
  presets: MockPreset[];
  channels: ChannelDict[];
  ages: AgeDict[];
  metrics: MetricDict[];
  logs: OperationLog[];
  generatedAt: Record<number, string>;
  nextIds: {
    user: number;
    vendor: number;
    preset: number;
    campaign: number;
    log: number;
  };
}

let cached: MockDb | null = null;
/** 无 localStorage 环境（单测）下的内存兜底 */
let memoryFallback: MockDb | null = null;

function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    return null;
  }
  return null;
}

function readFromStorage(): MockDb | null {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MockDb;
    if (parsed.version === SEED_VERSION) return parsed;
  } catch {
    // 损坏的数据直接丢弃，重建种子数据
  }
  return null;
}

export function loadDb(): MockDb {
  const existing = readFromStorage();
  if (existing) return existing;
  const seeded = buildSeedDb();
  persist(seeded);
  return seeded;
}

export function persist(db: MockDb): void {
  const storage = getStorage();
  if (!storage) {
    memoryFallback = db;
    return;
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function getDb(): MockDb {
  if (cached) return cached;
  cached = readFromStorage() ?? memoryFallback ?? loadDb();
  return cached;
}

export function saveDb(db: MockDb): void {
  cached = db;
  persist(db);
}

/** 重置为演示初始数据（管理页“重置演示数据” / 演示前一键恢复） */
export function resetDb(): MockDb {
  const seeded = buildSeedDb();
  saveDb(seeded);
  return seeded;
}
