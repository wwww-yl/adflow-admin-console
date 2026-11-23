<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Download, RefreshLeft, Search } from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import type { LogTargetType, OperationLog, User } from '@/types';
import { listLogs, listUsers } from '@/api/system';
import { ROLE_LABELS } from '@/mock/constants';
import { LOG_TARGET_META, LOG_TARGET_OPTIONS, ROLE_TAG_TYPES } from '@/utils/domain';
import { downloadCsv } from '@/utils/download';
import { formatDateTime } from '@/utils/format';
import { errorMessage } from '@/utils/error';
import EmptyState from '@/components/EmptyState.vue';

const props = withDefaults(defineProps<{ refreshToken?: number }>(), { refreshToken: 0 });

const loading = ref(false);
const exporting = ref(false);
const rows = ref<OperationLog[]>([]);
const total = ref(0);
const operators = ref<User[]>([]);

const filters = reactive({
  keyword: '',
  targetType: '' as LogTargetType | '',
  operatorId: undefined as number | undefined,
  dateRange: null as string[] | null,
  page: 1,
  pageSize: 10
});

function buildQuery(page = filters.page, pageSize = filters.pageSize) {
  return {
    keyword: filters.keyword.trim() || undefined,
    targetType: filters.targetType,
    operatorId: filters.operatorId,
    startTime: filters.dateRange?.[0],
    endTime: filters.dateRange?.[1],
    page,
    pageSize
  };
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await listLogs(buildQuery());
    rows.value = data.list;
    total.value = data.total;
  } catch (error) {
    ElMessage.error(errorMessage(error, '操作日志加载失败'));
  } finally {
    loading.value = false;
  }
}

async function loadOperators(): Promise<void> {
  try {
    const data = await listUsers({ page: 1, pageSize: 100 });
    operators.value = data.list;
  } catch {
    operators.value = [];
  }
}

function handleSearch(): void {
  filters.page = 1;
  void load();
}

function handleReset(): void {
  filters.keyword = '';
  filters.targetType = '';
  filters.operatorId = undefined;
  filters.dateRange = null;
  filters.page = 1;
  void load();
}

function handleSizeChange(): void {
  filters.page = 1;
  void load();
}

function formatDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return '无额外详情';
  return JSON.stringify(detail, null, 2);
}

/* ============================ 导出 ============================ */

async function handleExport(): Promise<void> {
  if (exporting.value) return;
  exporting.value = true;
  try {
    const data = await listLogs(buildQuery(1, 5000));
    if (data.list.length === 0) {
      ElMessage.warning('当前筛选条件下没有可导出的操作日志');
      return;
    }
    const header = ['时间', '操作人', '身份', '操作', '对象类型', '对象名称', '详情'];
    const body = data.list.map((log) => [
      log.time,
      log.operatorName,
      ROLE_LABELS[log.operatorRole],
      log.action,
      LOG_TARGET_META[log.targetType].label,
      log.targetName,
      log.detail ? JSON.stringify(log.detail) : ''
    ]);
    downloadCsv(`操作日志-${dayjs().format('YYYYMMDD-HHmmss')}.csv`, [header, ...body]);
    ElMessage.success(`已导出 ${data.list.length} 条操作日志`);
  } catch (error) {
    ElMessage.error(errorMessage(error, '导出操作日志失败'));
  } finally {
    exporting.value = false;
  }
}

watch(
  () => props.refreshToken,
  () => {
    filters.page = 1;
    void load();
  }
);

onMounted(() => {
  void Promise.all([load(), loadOperators()]);
});
</script>

<template>
  <div class="logs-tab">
    <div class="toolbar">
      <div class="toolbar__filters">
        <el-input
          v-model="filters.keyword"
          class="filter-input"
          placeholder="搜索操作 / 对象 / 操作人"
          clearable
          :prefix-icon="Search"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-select v-model="filters.targetType" class="filter-select" placeholder="全部对象类型" clearable>
          <el-option
            v-for="item in LOG_TARGET_OPTIONS"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-select v-model="filters.operatorId" class="filter-select" placeholder="全部操作人" clearable>
          <el-option v-for="item in operators" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-date-picker
          v-model="filters.dateRange"
          class="filter-date"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          unlink-panels
        />
        <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
        <el-button :icon="RefreshLeft" @click="handleReset">重置</el-button>
      </div>
      <el-button :icon="Download" :loading="exporting" @click="handleExport">导出日志</el-button>
    </div>

    <el-table v-loading="loading" :data="rows" row-key="id" border stripe>
      <el-table-column type="expand" width="40">
        <template #default="{ row }">
          <div class="log-detail">
            <div class="log-detail__title">操作详情</div>
            <pre class="log-detail__json">{{ formatDetail(row.detail) }}</pre>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.time) }}</template>
      </el-table-column>
      <el-table-column label="操作人" width="150">
        <template #default="{ row }">
          <span>{{ row.operatorName }}</span>
          <el-tag :type="ROLE_TAG_TYPES[row.operatorRole as 'admin' | 'user']" size="small" effect="plain" class="role-tag">
            {{ ROLE_LABELS[row.operatorRole as 'admin' | 'user'] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="action" label="操作" min-width="170" />
      <el-table-column label="对象类型" width="120">
        <template #default="{ row }">
          <el-tag :type="LOG_TARGET_META[row.targetType as LogTargetType].type" size="small" effect="light">
            {{ LOG_TARGET_META[row.targetType as LogTargetType].label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="targetName" label="对象名称" min-width="200" show-overflow-tooltip />
      <el-table-column label="对象 ID" width="110">
        <template #default="{ row }">
          <span class="mono">{{ row.targetId ?? '—' }}</span>
        </template>
      </el-table-column>
      <template #empty>
        <EmptyState description="暂无操作日志" hint="调整筛选条件，或完成一次管理操作后再查看" />
      </template>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="filters.page"
        v-model:page-size="filters.pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="load"
        @size-change="handleSizeChange"
      />
    </div>
  </div>
</template>

<style scoped>
.logs-tab {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-input {
  width: 240px;
}

.filter-select {
  width: 150px;
}

.filter-date {
  width: 260px;
}

.role-tag {
  margin-left: 6px;
}

.pager {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
}

.log-detail {
  padding: 8px 16px 12px 48px;
}

.log-detail__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}

.log-detail__json {
  margin: 0;
  padding: 12px 14px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  line-height: 18px;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
