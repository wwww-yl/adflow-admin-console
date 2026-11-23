<script setup lang="ts">
import { computed } from 'vue';
import type { CampaignStatus } from '@/types';
import { CAMPAIGN_STATUS_META } from '@/utils/domain';

const props = defineProps<{ status: CampaignStatus }>();

const meta = computed(() => CAMPAIGN_STATUS_META[props.status]);
</script>

<template>
  <el-tag :type="meta.type" effect="light" size="small" disable-transitions>{{ meta.label }}</el-tag>
</template>
