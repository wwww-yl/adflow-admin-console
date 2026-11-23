<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import { Loading } from '@element-plus/icons-vue';
import EmptyState from './EmptyState.vue';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer
]);

const props = withDefaults(
  defineProps<{
    option: EChartsOption;
    height?: number | string;
    loading?: boolean;
    empty?: boolean;
    emptyText?: string;
  }>(),
  {
    height: 320,
    loading: false,
    empty: false,
    emptyText: '暂无数据'
  }
);

const el = ref<HTMLDivElement | null>(null);
let chart: ReturnType<typeof echarts.init> | null = null;
let observer: ResizeObserver | null = null;

function render(): void {
  if (!chart) return;
  chart.setOption(props.option, { notMerge: true });
}

function handleResize(): void {
  chart?.resize();
}

watch(
  () => props.option,
  () => render(),
  { deep: true }
);

onMounted(() => {
  if (!el.value) return;
  chart = echarts.init(el.value);
  render();
  window.addEventListener('resize', handleResize);
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(handleResize);
    observer.observe(el.value);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  observer?.disconnect();
  observer = null;
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <div
    class="base-chart"
    :style="{ height: typeof props.height === 'number' ? `${props.height}px` : props.height }"
  >
    <div v-show="!props.empty && !props.loading" ref="el" class="base-chart__canvas" />
    <div v-if="props.loading" class="base-chart__state">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载中…</span>
    </div>
    <EmptyState v-else-if="props.empty" :description="props.emptyText" />
  </div>
</template>

<style scoped>
.base-chart {
  position: relative;
  width: 100%;
}

.base-chart__canvas {
  width: 100%;
  height: 100%;
}

.base-chart__state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.base-chart__state .el-icon {
  font-size: 16px;
}
</style>
