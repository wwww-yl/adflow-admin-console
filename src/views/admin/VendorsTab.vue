<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Hide, Plus, RefreshLeft, Search, View } from '@element-plus/icons-vue';
import type { PlatformCode, Vendor } from '@/types';
import {
  createVendor,
  deleteVendor,
  listVendors,
  updateVendor,
  updateVendorStatus
} from '@/api/system';
import type { VendorPayload } from '@/api/system';
import { PLATFORM_OPTIONS } from '@/mock/constants';
import { PLATFORM_LABELS, PLATFORM_TAG_TYPES } from '@/utils/domain';
import { formatDateTime, maskPhone } from '@/utils/format';
import { errorMessage } from '@/utils/error';
import { isPhone, isVendorCode } from '@/utils/validate';
import EmptyState from '@/components/EmptyState.vue';

const props = withDefaults(defineProps<{ refreshToken?: number }>(), { refreshToken: 0 });

const loading = ref(false);
const rows = ref<Vendor[]>([]);
const total = ref(0);
const revealed = ref<Record<number, boolean>>({});

const query = reactive({
  keyword: '',
  platform: '' as PlatformCode | '',
  status: '' as 0 | 1 | '',
  page: 1,
  pageSize: 10
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await listVendors({
      keyword: query.keyword.trim() || undefined,
      platform: query.platform,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize
    });
    rows.value = data.list;
    total.value = data.total;
  } catch (error) {
    ElMessage.error(errorMessage(error, '厂商列表加载失败'));
  } finally {
    loading.value = false;
  }
}

function handleSearch(): void {
  query.page = 1;
  void load();
}

function handleResetQuery(): void {
  query.keyword = '';
  query.platform = '';
  query.status = '';
  query.page = 1;
  void load();
}

function handleSizeChange(): void {
  query.page = 1;
  void load();
}

function togglePhone(id: number): void {
  revealed.value = { ...revealed.value, [id]: !revealed.value[id] };
}

/* ============================ 新增 / 编辑 ============================ */

interface VendorFormModel {
  code: string;
  name: string;
  platform: PlatformCode;
  contact: string;
  phone: string;
  remark: string;
}

const formRef = ref<FormInstance>();
const dialog = reactive({ visible: false, submitting: false, editingId: 0 });
const form = reactive<VendorFormModel>({
  code: '',
  name: '',
  platform: 'douyin',
  contact: '',
  phone: '',
  remark: ''
});

const isEdit = computed(() => dialog.editingId > 0);

const rules: FormRules = {
  code: [
    { required: true, message: '请输入厂商编码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (!isVendorCode(String(value ?? ''))) {
          callback(new Error('编码需为 2-20 位字母、数字、下划线或中划线，且以字母或数字开头'));
          return;
        }
        callback();
      },
      trigger: 'blur'
    }
  ],
  name: [
    { required: true, message: '请输入厂商名称', trigger: 'blur' },
    { min: 2, max: 40, message: '厂商名称长度需为 2-40 个字符', trigger: 'blur' }
  ],
  platform: [{ required: true, message: '请选择所属平台', trigger: 'change' }],
  contact: [
    { required: true, message: '请输入联系人', trigger: 'blur' },
    { min: 2, max: 20, message: '联系人长度需为 2-20 个字符', trigger: 'blur' }
  ],
  phone: [
    { required: true, message: '请输入联系电话', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (!isPhone(String(value ?? ''))) {
          callback(new Error('联系电话格式不正确，请填写手机号或座机号'));
          return;
        }
        callback();
      },
      trigger: 'blur'
    }
  ],
  remark: [{ max: 200, message: '备注不能超过 200 个字符', trigger: 'blur' }]
};

function openCreate(): void {
  dialog.editingId = 0;
  form.code = '';
  form.name = '';
  form.platform = 'douyin';
  form.contact = '';
  form.phone = '';
  form.remark = '';
  dialog.visible = true;
  void nextTick(() => formRef.value?.clearValidate());
}

function openEdit(row: Vendor): void {
  dialog.editingId = row.id;
  form.code = row.code;
  form.name = row.name;
  form.platform = row.platform;
  form.contact = row.contact;
  form.phone = row.phone;
  form.remark = row.remark;
  dialog.visible = true;
  void nextTick(() => formRef.value?.clearValidate());
}

async function handleSubmit(): Promise<void> {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;
  const payload: VendorPayload = {
    code: form.code.trim(),
    name: form.name.trim(),
    platform: form.platform,
    contact: form.contact.trim(),
    phone: form.phone.trim(),
    remark: form.remark.trim()
  };
  dialog.submitting = true;
  try {
    if (isEdit.value) {
      await updateVendor(dialog.editingId, payload);
      ElMessage.success('厂商信息已更新');
    } else {
      await createVendor(payload);
      ElMessage.success('厂商已新增');
    }
    dialog.visible = false;
    await load();
  } catch (error) {
    ElMessage.error(errorMessage(error, '保存失败'));
  } finally {
    dialog.submitting = false;
  }
}

/* ============================ 启停 / 删除 ============================ */

async function handleStatusChange(row: Vendor, value: string | number | boolean): Promise<void> {
  const status: 0 | 1 = Number(value) === 1 ? 1 : 0;
  try {
    await updateVendorStatus(row.id, status);
    ElMessage.success(status === 1 ? `已启用厂商 ${row.name}` : `已停用厂商 ${row.name}`);
    await load();
  } catch (error) {
    ElMessage.error(errorMessage(error, '状态更新失败'));
  }
}

async function handleDelete(row: Vendor): Promise<void> {
  if (row.planCount > 0) {
    ElMessage.warning('该厂商已被投放计划引用，只能停用，不能删除');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `删除后不可恢复，确认删除厂商「${row.name}」吗？`,
      '删除厂商',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    );
  } catch {
    return;
  }
  try {
    await deleteVendor(row.id);
    ElMessage.success('厂商已删除');
    await load();
  } catch (error) {
    ElMessage.error(errorMessage(error, '删除失败'));
  }
}

watch(
  () => props.refreshToken,
  () => {
    query.page = 1;
    void load();
  }
);

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="tab-panel">
    <div class="toolbar">
      <div class="toolbar__filters">
        <el-input
          v-model="query.keyword"
          class="filter-input"
          placeholder="搜索编码 / 名称 / 联系人"
          clearable
          :prefix-icon="Search"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-select v-model="query.platform" class="filter-select" placeholder="全部平台" clearable>
          <el-option
            v-for="item in PLATFORM_OPTIONS"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-select v-model="query.status" class="filter-select" placeholder="全部状态" clearable>
          <el-option label="启用" :value="1" />
          <el-option label="停用" :value="0" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
        <el-button :icon="RefreshLeft" @click="handleResetQuery">重置</el-button>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">新增厂商</el-button>
    </div>

    <el-table v-loading="loading" :data="rows" row-key="id" border stripe>
      <el-table-column label="厂商编码" min-width="140">
        <template #default="{ row }">
          <span class="mono">{{ row.code }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="厂商名称" min-width="200" show-overflow-tooltip />
      <el-table-column label="所属平台" width="120">
        <template #default="{ row }">
          <el-tag :type="PLATFORM_TAG_TYPES[row.platform as PlatformCode]" size="small" effect="light">
            {{ PLATFORM_LABELS[row.platform as PlatformCode] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="contact" label="联系人" width="120" />
      <el-table-column label="联系电话" width="170">
        <template #default="{ row }">
          <span class="mono">{{ revealed[row.id] ? row.phone : maskPhone(row.phone) }}</span>
          <el-button
            class="phone-eye"
            link
            type="primary"
            :icon="revealed[row.id] ? Hide : View"
            @click="togglePhone(row.id)"
          />
        </template>
      </el-table-column>
      <el-table-column label="关联计划" width="110" align="center">
        <template #default="{ row }">
          <span :class="row.planCount > 0 ? 'plan-count is-used' : 'plan-count'">{{ row.planCount }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-switch
            :model-value="row.status"
            :active-value="1"
            :inactive-value="0"
            inline-prompt
            active-text="启用"
            inactive-text="停用"
            @change="(value: string | number | boolean) => handleStatusChange(row, value)"
          />
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="160">
        <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-tooltip
            :disabled="row.planCount === 0"
            content="已被投放计划引用的厂商只能停用，不能删除"
            placement="top"
          >
            <span class="delete-wrap">
              <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
            </span>
          </el-tooltip>
        </template>
      </el-table-column>
      <template #empty>
        <EmptyState description="暂无厂商" hint="新增厂商后，才能在投放计划中选择" />
      </template>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="load"
        @size-change="handleSizeChange"
      />
    </div>

    <el-dialog
      v-model="dialog.visible"
      :title="isEdit ? '编辑厂商' : '新增厂商'"
      width="560px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="94px" label-position="left">
        <el-form-item label="厂商编码" prop="code">
          <el-input v-model="form.code" placeholder="全局唯一，用于对账与导入，如 VD-2026-008" maxlength="20" />
        </el-form-item>
        <el-form-item label="厂商名称" prop="name">
          <el-input v-model="form.name" placeholder="2-40 个字符，如苏州某某数字营销有限公司" maxlength="40" />
        </el-form-item>
        <el-form-item label="所属平台" prop="platform">
          <el-select v-model="form.platform" class="form-select" placeholder="请选择所属平台">
            <el-option
              v-for="item in PLATFORM_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="联系人" prop="contact">
          <el-input v-model="form.contact" placeholder="2-20 个字符" maxlength="20" />
        </el-form-item>
        <el-form-item label="联系电话" prop="phone">
          <el-input v-model="form.phone" placeholder="手机号或座机号，列表默认脱敏展示" maxlength="20" />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            placeholder="选填，200 字以内"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="dialog.submitting" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-input {
  width: 240px;
}

.filter-select {
  width: 140px;
}

.phone-eye {
  margin-left: 2px;
}

.plan-count {
  font-family: 'JetBrains Mono', Consolas, monospace;
  color: var(--color-text-secondary);
}

.plan-count.is-used {
  color: var(--color-warning);
  font-weight: 500;
}

.pager {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
}

.delete-wrap {
  display: inline-block;
}

.form-select {
  width: 100%;
}
</style>
