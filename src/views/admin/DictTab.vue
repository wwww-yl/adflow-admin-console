<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { AgeDict, ChannelDict, MetricDict } from '@/types';
import { listAges, listChannels, listMetrics, updateAge, updateChannel, updateMetric } from '@/api/system';
import { BID_MODE_OPTIONS } from '@/utils/domain';
import { IS_BACKEND_MODE } from '@/config';
import { formatDateTime } from '@/utils/format';
import { errorMessage } from '@/utils/error';

const props = withDefaults(defineProps<{ refreshToken?: number }>(), { refreshToken: 0 });

const loading = ref(false);
const savingKey = ref('');
const channels = ref<ChannelDict[]>([]);
const ages = ref<AgeDict[]>([]);
const metrics = ref<MetricDict[]>([]);

async function loadAll(): Promise<void> {
  loading.value = true;
  try {
    const [channelList, ageList, metricList] = await Promise.all([
      listChannels(),
      listAges(),
      listMetrics()
    ]);
    channels.value = channelList;
    ages.value = ageList;
    metrics.value = metricList;
  } catch (error) {
    ElMessage.error(errorMessage(error, '字典配置加载失败'));
  } finally {
    loading.value = false;
  }
}

/* ============================ 渠道字典 ============================ */

async function patchChannel(
  row: ChannelDict,
  patch: Partial<ChannelDict>,
  successText: string
): Promise<void> {
  if (IS_BACKEND_MODE) {
    ElMessage.warning('真实后端暂未提供字典接口，字典为前端内置口径，无法保存');
    await loadAll();
    return;
  }
  savingKey.value = `channel:${row.code}`;
  try {
    const updated = await updateChannel(row.code, patch);
    channels.value = channels.value.map((item) => (item.code === updated.code ? updated : item));
    ElMessage.success(successText);
  } catch (error) {
    ElMessage.error(errorMessage(error, '渠道配置保存失败'));
    await loadAll();
  } finally {
    savingKey.value = '';
  }
}

function saveChannelName(row: ChannelDict): void {
  const name = row.name.trim();
  if (!name) {
    ElMessage.warning('渠道名称不能为空');
    void loadAll();
    return;
  }
  void patchChannel(row, { name }, '渠道名称已保存');
}

function handleChannelEnabled(row: ChannelDict): void {
  void patchChannel(row, { enabled: row.enabled }, row.enabled ? '渠道已开通' : '渠道已停用');
}

function handleChannelBidMode(row: ChannelDict): void {
  void patchChannel(row, { bidMode: row.bidMode }, '默认出价方式已更新');
}

/* ============================ 年龄段字典 ============================ */

async function patchAge(row: AgeDict, patch: Partial<AgeDict>, successText: string): Promise<void> {
  if (IS_BACKEND_MODE) {
    ElMessage.warning('真实后端暂未提供字典接口，字典为前端内置口径，无法保存');
    await loadAll();
    return;
  }
  savingKey.value = `age:${row.value}`;
  try {
    const updated = await updateAge(row.value, patch);
    ages.value = ages.value
      .map((item) => (item.value === updated.value ? updated : item))
      .sort((a, b) => a.sort - b.sort);
    ElMessage.success(successText);
  } catch (error) {
    ElMessage.error(errorMessage(error, '年龄段配置保存失败'));
    await loadAll();
  } finally {
    savingKey.value = '';
  }
}

function handleAgeEnabled(row: AgeDict): void {
  void patchAge(row, { enabled: row.enabled }, row.enabled ? '年龄段已启用' : '年龄段已停用');
}

function handleAgeSort(row: AgeDict): void {
  void patchAge(row, { sort: row.sort }, '年龄段排序已更新');
}

/* ============================ 指标口径 ============================ */

function saveMetric(row: MetricDict): void {
  if (IS_BACKEND_MODE) {
    ElMessage.warning('真实后端暂未提供字典接口，字典为前端内置口径，无法保存');
    void loadAll();
    return;
  }
  const name = row.name.trim();
  const formula = row.formula.trim();
  if (!name) {
    ElMessage.warning('指标名称不能为空');
    void loadAll();
    return;
  }
  if (!formula) {
    ElMessage.warning('计算公式不能为空');
    void loadAll();
    return;
  }
  savingKey.value = `metric:${row.key}`;
  void (async () => {
    try {
      const updated = await updateMetric(row.key, {
        name,
        formula,
        decimals: row.decimals,
        visible: row.visible
      });
      metrics.value = metrics.value.map((item) => (item.key === updated.key ? updated : item));
      ElMessage.success(`指标「${updated.name}」已保存`);
    } catch (error) {
      ElMessage.error(errorMessage(error, '指标口径保存失败'));
      await loadAll();
    } finally {
      savingKey.value = '';
    }
  })();
}

function handleMetricVisible(row: MetricDict): void {
  savingKey.value = `metric:${row.key}`;
  void (async () => {
    try {
      const updated = await updateMetric(row.key, { visible: row.visible });
      metrics.value = metrics.value.map((item) => (item.key === updated.key ? updated : item));
      ElMessage.success(updated.visible ? '该指标将在看板展示' : '该指标已从看板隐藏');
    } catch (error) {
      ElMessage.error(errorMessage(error, '看板展示配置保存失败'));
      await loadAll();
    } finally {
      savingKey.value = '';
    }
  })();
}

watch(
  () => props.refreshToken,
  () => {
    void loadAll();
  }
);

onMounted(() => {
  void loadAll();
});
</script>

<template>
  <div v-loading="loading" class="dict-tab">
    <el-alert
      class="dict-alert"
      type="info"
      :closable="false"
      show-icon
      :title="
        IS_BACKEND_MODE
          ? '真实后端暂未提供字典接口：以下为前端内置口径，仅作展示，修改不会保存。'
          : '字典项由系统统一预置，管理端仅维护是否启用、默认出价方式与指标口径，不支持新增或删除，避免口径漂移。'
      "
    />

    <!-- 渠道字典 -->
    <section class="section">
      <div class="section__head">
        <h3 class="card-title">渠道字典</h3>
        <span class="section__hint">停用后业务端不可再选择该渠道；修改名称、出价方式会即时生效</span>
      </div>
      <el-table :data="channels" border size="small">
        <el-table-column label="图标" width="70" align="center">
          <template #default="{ row }">
            <span class="channel-icon" :style="{ backgroundColor: row.color }">{{ row.icon }}</span>
          </template>
        </el-table-column>
        <el-table-column label="渠道编码" width="130">
          <template #default="{ row }">
            <span class="mono">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column label="渠道名称" min-width="160">
          <template #default="{ row }">
            <el-input
              v-model="row.name"
              size="small"
              maxlength="12"
              :disabled="savingKey === `channel:${row.code}`"
              @change="saveChannelName(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="是否开通" width="110" align="center">
          <template #default="{ row }">
            <el-switch
              v-model="row.enabled"
              :loading="savingKey === `channel:${row.code}`"
              @change="handleChannelEnabled(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="默认出价方式" width="180">
          <template #default="{ row }">
            <el-select
              v-model="row.bidMode"
              size="small"
              :disabled="savingKey === `channel:${row.code}`"
              @change="handleChannelBidMode(row)"
            >
              <el-option
                v-for="item in BID_MODE_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
        </el-table-column>
      </el-table>
    </section>

    <!-- 年龄段字典 -->
    <section class="section">
      <div class="section__head">
        <h3 class="card-title">年龄段字典</h3>
        <span class="section__hint">停用后不再出现在人群定向的年龄段选项中，排序值越小越靠前</span>
      </div>
      <el-table :data="ages" border size="small">
        <el-table-column prop="value" label="年龄段" width="140" />
        <el-table-column label="是否启用" width="110" align="center">
          <template #default="{ row }">
            <el-switch
              v-model="row.enabled"
              :loading="savingKey === `age:${row.value}`"
              @change="handleAgeEnabled(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="排序" width="140">
          <template #default="{ row }">
            <el-input-number
              v-model="row.sort"
              :min="1"
              :max="99"
              :precision="0"
              size="small"
              controls-position="right"
              :disabled="savingKey === `age:${row.value}`"
              @change="handleAgeSort(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="说明" min-width="220">
          <template #default>
            <span class="dict-note">作用于投放向导「人群定向」的年龄段多选</span>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <!-- 指标口径 -->
    <section class="section">
      <div class="section__head">
        <h3 class="card-title">指标口径</h3>
        <span class="section__hint">统一指标名称、计算公式与小数位；关闭「看板展示」后该指标不再出现在看板</span>
      </div>
      <el-table :data="metrics" border size="small">
        <el-table-column label="指标名称" width="170">
          <template #default="{ row }">
            <el-input v-model="row.name" size="small" maxlength="12" @change="saveMetric(row)" />
          </template>
        </el-table-column>
        <el-table-column label="指标 Key" width="150">
          <template #default="{ row }">
            <span class="mono">{{ row.key }}</span>
          </template>
        </el-table-column>
        <el-table-column label="计算公式" min-width="240">
          <template #default="{ row }">
            <el-input v-model="row.formula" size="small" maxlength="60" @change="saveMetric(row)" />
          </template>
        </el-table-column>
        <el-table-column label="小数位" width="110">
          <template #default="{ row }">
            <el-input-number
              v-model="row.decimals"
              :min="0"
              :max="4"
              :precision="0"
              size="small"
              controls-position="right"
              @change="saveMetric(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="看板展示" width="110" align="center">
          <template #default="{ row }">
            <el-switch
              v-model="row.visible"
              :loading="savingKey === `metric:${row.key}`"
              @change="handleMetricVisible(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<style scoped>
.dict-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dict-alert {
  margin-bottom: 4px;
}

.section {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  padding: 16px 20px 20px;
}

.section__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.section__hint {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.channel-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 2px;
  color: #ffffff;
  font-size: 12px;
  line-height: 1;
}

.dict-note {
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
