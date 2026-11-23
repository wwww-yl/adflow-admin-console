import type {
  CampaignRow,
  MockGenerateResult,
  MockMode,
  MockParamsInput,
  MockPreset,
  MockProfile,
  MockRecord,
  Paged,
  Project
} from '@/types';
import { USE_MOCK } from '@/config';
import { del, get, post, put } from './request';
import * as backend from './backend';

export function listProjects(): Promise<Project[]> {
  if (!USE_MOCK) return backend.listProjects();
  return get<Project[]>('/projects');
}

export function listCampaigns(projectId?: number | null): Promise<CampaignRow[]> {
  if (!USE_MOCK) return backend.listCampaigns(projectId);
  return get<CampaignRow[]>('/campaigns', { projectId: projectId ?? undefined });
}

export function saveMockProfile(campaignId: number, params: MockParamsInput): Promise<MockProfile> {
  if (!USE_MOCK) return backend.saveMockProfile(campaignId, params);
  return put<MockProfile>(`/campaigns/${campaignId}/mock-profile`, { params });
}

export function generateMock(
  campaignId: number,
  params: MockParamsInput,
  mode: MockMode
): Promise<MockGenerateResult> {
  if (!USE_MOCK) return backend.generateMock(campaignId, params, mode);
  return post<MockGenerateResult>(`/campaigns/${campaignId}/mock/generate`, { params, mode });
}

export function clearMock(campaignId: number): Promise<{ campaignId: number }> {
  if (!USE_MOCK) return backend.clearMock(campaignId);
  return post<{ campaignId: number }>(`/campaigns/${campaignId}/mock/clear`);
}

export interface MockPresetPayload {
  name: string;
  params: MockParamsInput;
}

export function listPresets(): Promise<MockPreset[]> {
  if (!USE_MOCK) return backend.listPresets();
  return get<MockPreset[]>('/admin/mock-presets');
}

export function createPreset(payload: MockPresetPayload): Promise<MockPreset> {
  if (!USE_MOCK) return backend.createPreset(payload);
  return post<MockPreset>('/admin/mock-presets', payload);
}

export function deletePreset(id: number): Promise<{ id: number }> {
  if (!USE_MOCK) return backend.deletePreset(id);
  return del<{ id: number }>(`/admin/mock-presets/${id}`);
}

export interface MockRecordQuery {
  campaignId?: number;
  page: number;
  pageSize: number;
}

export function listMockRecords(query: MockRecordQuery): Promise<Paged<MockRecord>> {
  if (!USE_MOCK) return backend.listMockRecords(query);
  return get<Paged<MockRecord>>('/admin/mock-records', { ...query });
}
