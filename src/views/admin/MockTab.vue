<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { EChartsOption } from 'echarts';
import type {
  CampaignRow,
  CampaignStatus,
  CurveType,
  MockGenerateResult,
  MockMode,
  MockParamsInput,
  MockPreset,
  MockRatios,
  MockRecord,
  Project
} from '@/types';
import {
  clearMock,
  createPreset,
  deletePreset,
  generateMock,
  listCampaigns,
  listMockRecords,
  listPresets,
  listProjects
} from '@/api/campaign';
import {
  aggregatePreview,
  buildDateRange,
  generateCampaignMock,
  validateMockParams
} from '@/mock/engine';
import type { MockPreviewDay } from '@/mock/engine';
import { CURVE_OPTIONS, DEFAULT_RATIOS, RATIO_DIMENSIONS } from '@/mock/constants';
import { IS_BACKEND_MODE } from '@/config';
import { formatDateRange, formatInt, formatPercent, formatWan, formatDateTime } from '@/utils/format';
import { errorMessage } from '@/utils/error';
import BaseChart from '@/components/BaseChart.vue';
import EmptyState from '@/components/EmptyState.vue';
import StatusTag from '@/components/StatusTag.vue';

const props = withDefaults(defineProps<{ refreshToken?: number }>(), { refreshToken: 0 });

/* ============================ 计划选择 ============================ */

const projects = ref<Project[]>([]);
const campaigns = ref<CampaignRow[]>([]);
const projectId = ref<number>(0);
const selectedIds = ref<number[]>([]);
const campaignsLoading = ref(false);

const selectedCampaigns = computed(() => campaigns.value.filter((item) => selectedIds.value.includes(item.id)));

async function loadCampaigns(): Promise<void> {
  campaignsLoading.value = true;
  try {
    campaigns.value = await listCampaigns(projectId.value || null);
  } catch (error) {
    ElMessage.error(errorMessage(error, '计划列表加载失败'));
  } finally {
    campaignsLoading.value = false;
  }
}

function handleProjectChange(): void {
  selectedIds.value = [];
  preview.value = null;
  previewCampaigns.value = [];
  void loadCampaigns();
}

function handleSelectionChange(rows: CampaignRow[]): void {
  selectedIds.value = rows.map((row) => row.id);
}

/* ============================ 参数配置 ============================ */

const targetMode = ref<'auto' | 'custom'>('auto');
const customTarget = ref(16880000);

const form = reactive({
  curve: 'even' as CurveType,
  ctr: 1.15,
  cpm: 12,
  frequency: 87,
  seed: 'taicang-2026'
});

function cloneRatios(source: MockRatios): MockRatios {
  return {
    region: { ...source.region },
    gender: { ...source.gender },
    age: { ...source.age }
  };
}

const ratios = reactive<MockRatios>(cloneRatios(DEFAULT_RATIOS));

function restoreDefaultRatios(): void {
  const preset = cloneRatios(DEFAULT_RATIOS);
  ratios.region = preset.region;
  ratios.gender = preset.gender;
  ratios.age = preset.age;
  ElMessage.success('已恢复默认人群比例');
}

const dimensionList = [
  { key: 'region' as const, ...RATIO_DIMENSIONS.region },
  { key: 'gender' as const, ...RATIO_DIMENSIONS.gender },
  { key: 'age' as const, ...RATIO_DIMENSIONS.age }
];

const ratioTotals = computed<Record<'region' | 'gender' | 'age', number>>(() => ({
  region: Number(Object.values(ratios.region).reduce((sum, value) => sum + value, 0).toFixed(2)),
  gender: Number(Object.values(ratios.gender).reduce((sum, value) => sum + value, 0).toFixed(2)),
  age: Number(Object.values(ratios.age).reduce((sum, value) => sum + value, 0).toFixed(2))
}));

const autoTarget = computed(() =>
  selectedCampaigns.value.reduce((sum, item) => sum + Number(item.targetImpressions), 0)
);

const baseTarget = computed(() => (targetMode.value === 'auto' ? autoTarget.value : customTarget.value));

function buildParams(target: number): MockParamsInput {
  return {
    targetImpressions: target,
    curve: form.curve,
    ctr: form.ctr,
    cpm: form.cpm,
    frequency: form.frequency,
    seed: form.seed.trim(),
    ratios: cloneRatios(ratios)
  };
}

/** 自定义目标时按各计划原目标占比拆分总目标（最大余数法，保证合计精确） */
const effectiveTargets = computed<{ campaign: CampaignRow; target: number }[]>(() => {
  const selected = selectedCampaigns.value;
  if (selected.length === 0) return [];
  if (targetMode.value === 'auto') {
    return selected.map((campaign) => ({ campaign, target: Number(campaign.targetImpressions) }));
  }
  const total = Math.max(0, Math.round(customTarget.value));
  const weights = selected.map((campaign) => Math.max(1, Number(campaign.targetImpressions)));
  const weightSum = weights.reduce((sum, item) => sum + item, 0);
  const raw = weights.map((weight) => (weightSum > 0 ? (total * weight) / weightSum : 0));
  const bases = raw.map((value) => Math.floor(value));
  let remaining = total - bases.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  let cursor = 0;
  while (remaining > 0 && order.length > 0) {
    bases[order[cursor % order.length].index] += 1;
    remaining -= 1;
    cursor += 1;
  }
  return selected.map((campaign, index) => ({ campaign, target: bases[index] ?? 0 }));
});

/* ============================ 常用方案 ============================ */

const presets = ref<MockPreset[]>([]);
const presetId = ref<number | null>(null);

async function loadPresets(): Promise<void> {
  try {
    presets.value = await listPresets();
  } catch (error) {
    ElMessage.error(errorMessage(error, '常用方案加载失败'));
  }
}

function applyPreset(id: number | null): void {
  if (!id) return;
  const preset = presets.value.find((item) => item.id === id);
  if (!preset) return;
  form.curve = preset.params.curve;
  form.ctr = preset.params.ctr;
  form.cpm = preset.params.cpm;
  form.frequency = preset.params.frequency;
  form.seed = preset.params.seed;
  const cloned = cloneRatios(preset.params.ratios);
  ratios.region = cloned.region;
  ratios.gender = cloned.gender;
  ratios.age = cloned.age;
  targetMode.value = 'custom';
  customTarget.value = preset.params.targetImpressions;
  ElMessage.success(`已应用方案「${preset.name}」`);
}

async function handleSavePreset(): Promise<void> {
  const error = validateParams();
  if (error) {
    ElMessage.error(error);
    return;
  }
  let name = '';
  try {
    const result = await ElMessageBox.prompt('为当前模拟参数起一个便于识别的名称', '保存常用方案', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputPlaceholder: '2-30 个字符，如：双 11 放量方案',
      inputPattern: /^.{2,30}$/,
      inputErrorMessage: '方案名称长度需为 2-30 个字符'
    });
    name = result.value.trim();
  } catch {
    return;
  }
  try {
    await createPreset({ name, params: buildParams(baseTarget.value) });
    ElMessage.success('常用方案已保存');
    await loadPresets();
  } catch (error) {
    ElMessage.error(errorMessage(error, '保存常用方案失败'));
  }
}

async function handleDeletePreset(id: number): Promise<void> {
  try {
    await ElMessageBox.confirm('删除后不可恢复，确认删除该常用方案吗？', '删除常用方案', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    });
  } catch {
    return;
  }
  try {
    await deletePreset(id);
    if (presetId.value === id) presetId.value = null;
    ElMessage.success('常用方案已删除');
    await loadPresets();
  } catch (error) {
    ElMessage.error(errorMessage(error, '删除失败'));
  }
}

/* ============================ 效果预览 ============================ */

interface PreviewCampaignRow {
  campaignId: number;
  campaignCode: string;
  campaignName: string;
  plannedImpressions: number;
  generateTarget: number;
  expectedTotal: number;
  expectedCompletion: number;
}

interface PreviewResult {
  totalImpressions: number;
  totalPlanned: number;
  averageDaily: number;
  peakDaily: number;
  completionRate: number;
  daysData: MockPreviewDay[];
}

const preview = ref<PreviewResult | null>(null);
const previewCampaigns = ref<PreviewCampaignRow[]>([]);
const previewStale = ref(false);
const previewing = ref(false);

function validateParams(): string | null {
  if (targetMode.value === 'custom' && customTarget.value <= 0) {
    return '目标总曝光量需大于 0，请检查后重试';
  }
  if (selectedIds.value.length > 0 && baseTarget.value <= 0) {
    return '目标总曝光量需大于 0，请检查后重试';
  }
  return validateMockParams(buildParams(baseTarget.value));
}

function handlePreview(): void {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请先在「计划选择」中勾选至少一个投放计划');
    return;
  }
  const error = validateParams();
  if (error) {
    ElMessage.error(error);
    return;
  }
  previewing.value = true;
  try {
    const targets = effectiveTargets.value;
    const rows = targets.map(({ campaign, target }) => {
      const dates = buildDateRange(campaign.startDate, campaign.endDate);
      const generated = generateCampaignMock(buildParams(target), dates, campaign.code ?? `campaign-${campaign.id}`);
      return { campaign, target, generated };
    });
    preview.value = aggregatePreview(
      rows.map(({ campaign, target, generated }) => ({
        campaignId: campaign.id,
        campaignCode: campaign.code ?? '—',
        campaignName: campaign.name,
        targetImpressions: target,
        plannedImpressions: Number(campaign.targetImpressions),
        daily: generated.daily
      }))
    );
    previewCampaigns.value = rows.map(({ campaign, target, generated }) => ({
      campaignId: campaign.id,
      campaignCode: campaign.code ?? '—',
      campaignName: campaign.name,
      plannedImpressions: Number(campaign.targetImpressions),
      generateTarget: target,
      expectedTotal: generated.totals.impressions,
      expectedCompletion:
        Number(campaign.targetImpressions) > 0
          ? Number(((generated.totals.impressions / Number(campaign.targetImpressions)) * 100).toFixed(2))
          : 0
    }));
    previewStale.value = false;
  } catch (error) {
    ElMessage.error(errorMessage(error, '预览生成失败'));
  } finally {
    previewing.value = false;
  }
}

const previewOption = computed<EChartsOption>(() => {
  if (!preview.value) return {};
  const data = preview.value.daysData;
  return {
    grid: { left: 68, right: 68, top: 44, bottom: 32 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      valueFormatter: (value) => (typeof value === 'number' ? formatInt(value) : String(value))
    },
    legend: { data: ['日曝光量', '累计完成率'], right: 8, top: 4, itemWidth: 12, itemHeight: 8 },
    xAxis: {
      type: 'category',
      data: data.map((item) => item.date.slice(5)),
      axisLabel: { interval: data.length > 16 ? Math.ceil(data.length / 12) - 1 : 0 },
      axisTick: { show: false }
    },
    yAxis: [
      { type: 'value', name: '曝光量', nameTextStyle: { align: 'right' }, axisLabel: { formatter: (value: number) => formatWan(value) } },
      {
        type: 'value',
        name: '完成率',
        nameTextStyle: { align: 'left' },
        min: 0,
        axisLabel: { formatter: '{value}%' },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '日曝光量',
        type: 'bar',
        barMaxWidth: 18,
        itemStyle: { color: '#17416b' },
        data: data.map((item) => item.impressions)
      },
      {
        name: '累计完成率',
        type: 'line',
        yAxisIndex: 1,
        symbol: 'none',
        lineStyle: { width: 2, color: '#c77c0e' },
        itemStyle: { color: '#c77c0e' },
        data: data.map((item) => Number(item.completion.toFixed(2)))
      }
    ]
  };
});

watch(
  () => [
    JSON.stringify(form),
    JSON.stringify(ratios),
    targetMode.value,
    customTarget.value,
    selectedIds.value.join(',')
  ],
  () => {
    if (preview.value) previewStale.value = true;
  },
  { deep: true }
);

/* ============================ 生成 / 覆盖 / 清空 ============================ */

const generating = ref(false);
const results = ref<MockGenerateResult[]>([]);

function confirmText(verb: string, targets: CampaignRow[]): string {
  const names = targets.map((item) => item.name).slice(0, 3).join('、');
  const suffix = targets.length > 3 ? ` 等 ${targets.length} 个计划` : '';
  return `将对 ${targets.length} 个计划（${names}${suffix}）${verb}模拟数据，操作会记录到操作日志，是否继续？`;
}

async function handleGenerate(mode: MockMode): Promise<void> {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请先在「计划选择」中勾选至少一个投放计划');
    return;
  }
  const error = validateParams();
  if (error) {
    ElMessage.error(error);
    return;
  }
  const targets = selectedCampaigns.value;
  if (mode === 'generate' && targets.some((item) => item.hasMock)) {
    ElMessage.warning('所选计划中已有模拟数据，请使用「覆盖生成」或先清空数据');
    return;
  }
  if (previewStale.value) {
    ElMessage.warning('参数已调整，请先重新预览效果');
    return;
  }
  try {
    await ElMessageBox.confirm(confirmText(mode === 'generate' ? '生成' : '覆盖生成', targets), '确认生成', {
      confirmButtonText: mode === 'generate' ? '确认生成' : '确认覆盖',
      cancelButtonText: '取消',
      type: 'warning'
    });
  } catch {
    return;
  }
  generating.value = true;
  const created: MockGenerateResult[] = [];
  try {
    for (const { campaign, target } of effectiveTargets.value) {
      created.push(await generateMock(campaign.id, buildParams(target), mode));
    }
    results.value = created;
    ElMessage.success(`已完成 ${created.length} 个计划的模拟数据${mode === 'generate' ? '生成' : '覆盖生成'}`);
    await loadCampaigns();
    await loadRecords();
  } catch (error) {
    ElMessage.error(errorMessage(error, '生成模拟数据失败'));
    if (created.length > 0) {
      results.value = created;
      await loadCampaigns();
      await loadRecords();
    }
  } finally {
    generating.value = false;
  }
}

async function handleClear(): Promise<void> {
  const targets = selectedCampaigns.value.filter((item) => item.hasMock);
  if (targets.length === 0) {
    ElMessage.warning('所选计划没有已生成的模拟数据');
    return;
  }
  try {
    await ElMessageBox.confirm(confirmText('清空', targets), '确认清空', {
      confirmButtonText: '确认清空',
      cancelButtonText: '取消',
      type: 'warning'
    });
  } catch {
    return;
  }
  try {
    for (const campaign of targets) {
      await clearMock(campaign.id);
    }
    results.value = [];
    ElMessage.success(`已清空 ${targets.length} 个计划的模拟数据`);
    await loadCampaigns();
    await loadRecords();
  } catch (error) {
    ElMessage.error(errorMessage(error, '清空模拟数据失败'));
  }
}

/* ============================ 调节记录 ============================ */

const records = ref<MockRecord[]>([]);
const recordTotal = ref(0);
const recordQuery = reactive({ campaignId: 0, page: 1, pageSize: 10 });

async function loadRecords(): Promise<void> {
  try {
    const data = await listMockRecords({
      campaignId: recordQuery.campaignId || undefined,
      page: recordQuery.page,
      pageSize: recordQuery.pageSize
    });
    records.value = data.list;
    recordTotal.value = data.total;
  } catch (error) {
    ElMessage.error(errorMessage(error, '调节记录加载失败'));
  }
}

function handleRecordCampaignChange(): void {
  recordQuery.page = 1;
  void loadRecords();
}

function handleRecordSizeChange(): void {
  recordQuery.page = 1;
  void loadRecords();
}

/* ============================ 初始化 ============================ */

watch(
  () => props.refreshToken,
  () => {
    selectedIds.value = [];
    preview.value = null;
    previewCampaigns.value = [];
    results.value = [];
    recordQuery.page = 1;
    void loadCampaigns();
    void loadPresets();
    void loadRecords();
  }
);

onMounted(async () => {
  try {
    projects.value = await listProjects();
  } catch (error) {
    ElMessage.error(errorMessage(error, '项目列表加载失败'));
  }
  await Promise.all([loadCampaigns(), loadPresets(), loadRecords()]);
});
</script>

<template>
  <div class="mock-tab">
    <el-alert
      v-if="IS_BACKEND_MODE"
      class="backend-tip"
      type="info"
      :closable="false"
      show-icon
      title="真实后端模式：模拟参数会按计划保存并逐条生成到后端；后端暂未提供「清空数据」，常用方案存在本浏览器，调节记录由后端操作日志反推。"
    />

    <!-- 计划选择 -->
    <section class="section">
      <div class="section__head">
        <h3 class="card-title">计划选择</h3>
        <div class="section__actions">
          <el-select v-model="projectId" class="project-select" placeholder="全部项目" @change="handleProjectChange">
            <el-option :value="0" label="全部项目" />
            <el-option v-for="item in projects" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
          <span class="selection-hint">已选择 {{ selectedIds.length }} 个计划</span>
        </div>
      </div>
      <el-table
        v-loading="campaignsLoading"
        :data="campaigns"
        row-key="id"
        border
        max-height="320"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="46" reserve-selection />
        <el-table-column label="投放单号" width="150">
          <template #default="{ row }">
            <span class="mono">{{ row.code ?? '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="计划名称" min-width="200" show-overflow-tooltip />
        <el-table-column prop="projectName" label="所属项目" min-width="160" show-overflow-tooltip />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <StatusTag :status="row.status as CampaignStatus" />
          </template>
        </el-table-column>
        <el-table-column label="排期" width="200">
          <template #default="{ row }">{{ formatDateRange(row.startDate, row.endDate) }}</template>
        </el-table-column>
        <el-table-column label="计划目标曝光量" width="140" align="right">
          <template #default="{ row }">
            <span class="num">{{ formatInt(row.targetImpressions) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="已生成" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.hasMock ? 'success' : 'info'" size="small" effect="plain">
              {{ row.hasMock ? '已生成' : '未生成' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="当前完成率" width="110" align="right">
          <template #default="{ row }">
            <span class="num">{{ formatPercent(row.completionRate) }}</span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            description="暂无投放计划"
            :hint="
              IS_BACKEND_MODE
                ? '真实后端当前没有计划，请先在业务端创建投放计划'
                : '可切换项目筛选，或先在业务端创建计划'
            "
          />
        </template>
      </el-table>
    </section>

    <!-- 参数配置 -->
    <section class="section">
      <div class="section__head">
        <h3 class="card-title">参数配置</h3>
        <div class="section__actions">
          <el-select v-model="presetId" class="preset-select" placeholder="选择常用方案" clearable @change="applyPreset">
            <el-option v-for="item in presets" :key="item.id" :label="item.name" :value="item.id">
              <div class="preset-option">
                <span>{{ item.name }}</span>
                <el-button link type="danger" size="small" @click.stop="handleDeletePreset(item.id)">删除</el-button>
              </div>
            </el-option>
          </el-select>
          <el-button @click="handleSavePreset">保存常用方案</el-button>
        </div>
      </div>

      <el-form label-width="110px" label-position="left" class="param-form">
        <div class="param-grid">
          <el-form-item label="目标总曝光量">
            <div class="target-row">
              <el-radio-group v-model="targetMode" size="small">
                <el-radio-button value="auto">按计划目标</el-radio-button>
                <el-radio-button value="custom">自定义</el-radio-button>
              </el-radio-group>
              <el-input-number
                v-if="targetMode === 'custom'"
                v-model="customTarget"
                :min="1"
                :step="100000"
                :precision="0"
                controls-position="right"
                class="target-input"
              />
              <span v-else class="target-auto">
                {{ selectedIds.length > 0 ? `合计 ${formatInt(autoTarget)}` : '勾选计划后自动汇总' }}
              </span>
            </div>
          </el-form-item>
          <el-form-item label="投放曲线">
            <el-select v-model="form.curve" class="param-select">
              <el-option v-for="item in CURVE_OPTIONS" :key="item.value" :label="item.label" :value="item.value">
                <div class="curve-option">
                  <span>{{ item.label }}</span>
                  <span class="curve-hint">{{ item.hint }}</span>
                </div>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item label="点击率">
            <el-input-number v-model="form.ctr" :min="0.01" :max="20" :step="0.05" :precision="2" controls-position="right" class="param-number" />
            <span class="unit">%（0-20）</span>
          </el-form-item>
          <el-form-item label="千人曝光成本">
            <el-input-number v-model="form.cpm" :min="0.01" :step="0.5" :precision="2" controls-position="right" class="param-number" />
            <span class="unit">元</span>
          </el-form-item>
          <el-form-item label="曝光频次">
            <el-input-number v-model="form.frequency" :min="1" :step="1" :precision="0" controls-position="right" class="param-number" />
            <span class="unit">次/人</span>
          </el-form-item>
          <el-form-item label="随机种子">
            <el-input v-model="form.seed" class="param-input" maxlength="40" placeholder="固定种子保证生成结果可复现" />
          </el-form-item>
        </div>
      </el-form>

      <div class="ratio-head">
        <span class="ratio-title">人群比例（各维度合计需等于 100%）</span>
        <el-button link type="primary" @click="restoreDefaultRatios">恢复默认</el-button>
      </div>
      <div class="ratio-grid">
        <div v-for="dim in dimensionList" :key="dim.key" class="ratio-card">
          <div class="ratio-card__title">
            {{ dim.label }}
            <span :class="ratioTotals[dim.key] === 100 ? 'ratio-total' : 'ratio-total is-error'">
              合计 {{ ratioTotals[dim.key] }}%
            </span>
          </div>
          <div v-for="item in dim.items" :key="item" class="ratio-item">
            <span class="ratio-label">{{ item }}</span>
            <el-input-number
              v-model="ratios[dim.key][item]"
              :min="0"
              :max="100"
              :step="1"
              :precision="0"
              size="small"
              controls-position="right"
              class="ratio-input"
            />
            <span class="ratio-unit">%</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 效果预览与生成 -->
    <section class="section">
      <div class="section__head">
        <h3 class="card-title">效果预览与生成</h3>
        <div class="section__actions">
          <el-button type="primary" :loading="previewing" @click="handlePreview">预览效果</el-button>
          <el-button type="success" :loading="generating" @click="handleGenerate('generate')">生成模拟数据</el-button>
          <el-button type="warning" plain :loading="generating" @click="handleGenerate('overwrite')">覆盖生成</el-button>
          <el-button
            type="danger"
            plain
            :disabled="generating || IS_BACKEND_MODE"
            :title="IS_BACKEND_MODE ? '真实后端暂未提供清空模拟数据接口' : ''"
            @click="handleClear"
          >
            清空数据
          </el-button>
        </div>
      </div>

      <el-alert
        v-if="previewStale"
        class="stale-alert"
        type="warning"
        :closable="false"
        show-icon
        title="参数已调整，请重新点击「预览效果」后再生成"
      />

      <template v-if="preview">
        <div class="preview-metrics">
          <div class="preview-metric">
            <span class="preview-metric__label">预计总曝光量</span>
            <span class="preview-metric__value num">{{ formatInt(preview.totalImpressions) }}</span>
          </div>
          <div class="preview-metric">
            <span class="preview-metric__label">计划目标合计</span>
            <span class="preview-metric__value num">{{ formatInt(preview.totalPlanned) }}</span>
          </div>
          <div class="preview-metric">
            <span class="preview-metric__label">预计完成率</span>
            <span class="preview-metric__value num accent">{{ formatPercent(preview.completionRate) }}</span>
          </div>
          <div class="preview-metric">
            <span class="preview-metric__label">日均曝光量</span>
            <span class="preview-metric__value num">{{ formatInt(preview.averageDaily) }}</span>
          </div>
          <div class="preview-metric">
            <span class="preview-metric__label">峰值单日曝光</span>
            <span class="preview-metric__value num">{{ formatInt(preview.peakDaily) }}</span>
          </div>
        </div>

        <BaseChart :option="previewOption" :height="320" />

        <el-table :data="previewCampaigns" size="small" border class="preview-table">
          <el-table-column label="计划编码" width="150">
            <template #default="{ row }">
              <span class="mono">{{ row.campaignCode }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="campaignName" label="计划名称" min-width="180" show-overflow-tooltip />
          <el-table-column label="本次生成目标" width="140" align="right">
            <template #default="{ row }">
              <span class="num">{{ formatInt(row.generateTarget) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="预计生成总量" width="140" align="right">
            <template #default="{ row }">
              <span class="num">{{ formatInt(row.expectedTotal) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="计划目标曝光量" width="140" align="right">
            <template #default="{ row }">
              <span class="num">{{ formatInt(row.plannedImpressions) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="预计完成率" width="120" align="right">
            <template #default="{ row }">
              <span class="num">{{ formatPercent(row.expectedCompletion) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </template>
      <EmptyState
        v-else
        description="尚未生成效果预览"
        hint="勾选计划并配置参数后，点击「预览效果」查看按日曝光与累计完成率曲线"
      />
    </section>

    <!-- 生成结果 -->
    <section v-if="results.length > 0" class="section">
      <div class="section__head">
        <h3 class="card-title">本次生成结果</h3>
      </div>
      <el-table :data="results" size="small" border>
        <el-table-column label="计划编码" width="150">
          <template #default="{ row }">
            <span class="mono">{{ row.campaignCode }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="campaignName" label="计划名称" min-width="180" show-overflow-tooltip />
        <el-table-column label="模式" width="100">
          <template #default="{ row }">
            <el-tag :type="row.mode === 'overwrite' ? 'warning' : 'success'" size="small" effect="plain">
              {{ row.mode === 'overwrite' ? '覆盖生成' : '生成' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="天数" width="80" align="center">
          <template #default="{ row }">{{ row.days }}</template>
        </el-table-column>
        <el-table-column label="累计曝光量" width="140" align="right">
          <template #default="{ row }">
            <span class="num">{{ formatInt(row.totalImpressions) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="完成率" width="110" align="right">
          <template #default="{ row }">
            <span class="num">{{ formatPercent(row.completionRate) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="生成时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.generatedAt) }}</template>
        </el-table-column>
      </el-table>
    </section>

    <!-- 调节记录 -->
    <section class="section">
      <div class="section__head">
        <h3 class="card-title">调节记录</h3>
        <el-select
          v-model="recordQuery.campaignId"
          class="record-select"
          placeholder="全部计划"
          @change="handleRecordCampaignChange"
        >
          <el-option :value="0" label="全部计划" />
          <el-option
            v-for="item in campaigns"
            :key="item.id"
            :label="item.code ?? item.name"
            :value="item.id"
          />
        </el-select>
      </div>
      <el-table :data="records" size="small" border>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.time) }}</template>
        </el-table-column>
        <el-table-column prop="operatorName" label="操作人" width="110" />
        <el-table-column label="计划编码" width="150">
          <template #default="{ row }">
            <span class="mono">{{ row.campaignCode }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="campaignName" label="计划名称" min-width="180" show-overflow-tooltip />
        <el-table-column label="参数摘要" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="record-params">
              曝光 {{ formatInt(row.params.targetImpressions) }} · 点击率 {{ row.params.ctr }}% · 千人成本
              {{ row.params.cpm }} 元 · 频次 {{ row.params.frequency }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="天数" width="80" align="center">
          <template #default="{ row }">{{ row.days }}</template>
        </el-table-column>
        <el-table-column label="累计曝光量" width="130" align="right">
          <template #default="{ row }">
            <span class="num">{{ formatInt(row.totalImpressions) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="完成率" width="100" align="right">
          <template #default="{ row }">
            <span class="num">{{ formatPercent(row.completionRate) }}</span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState description="暂无调节记录" hint="生成或覆盖模拟数据后，记录会显示在这里" />
        </template>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="recordQuery.page"
          v-model:page-size="recordQuery.pageSize"
          :total="recordTotal"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          background
          @current-change="loadRecords"
          @size-change="handleRecordSizeChange"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.mock-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  padding: 16px 20px 20px;
}

.section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.section__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.project-select {
  width: 220px;
}

.preset-select {
  width: 200px;
}

.selection-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.preset-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.param-form {
  margin-bottom: 8px;
}

.param-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 24px;
}

.param-select {
  width: 100%;
}

.param-number {
  width: 160px;
}

.param-input {
  width: 280px;
}

.unit {
  margin-left: 8px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.target-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.target-input {
  width: 180px;
}

.target-auto {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.curve-option {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.curve-hint {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.ratio-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8px 0 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--color-border);
}

.ratio-title {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.ratio-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.ratio-card {
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  padding: 12px 14px;
}

.ratio-card__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
}

.ratio-total {
  font-size: 12px;
  font-weight: 400;
  color: var(--color-success);
}

.ratio-total.is-error {
  color: var(--color-danger);
}

.ratio-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}

.ratio-label {
  width: 56px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.ratio-input {
  width: 110px;
}

.ratio-unit {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.stale-alert {
  margin-bottom: 12px;
}

.preview-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.preview-metric {
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-metric__label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.preview-metric__value {
  font-size: 20px;
  font-weight: 600;
}

.preview-metric__value.accent {
  color: var(--color-warning);
}

.preview-table {
  margin-top: 16px;
}

.pager {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
}

.record-select {
  width: 240px;
}

.record-params {
  font-size: 12px;
  color: var(--color-text-secondary);
}

@media (max-width: 1280px) {
  .ratio-grid {
    grid-template-columns: 1fr;
  }

  .preview-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
