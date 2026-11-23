import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { AgeDict, ChannelDict, MetricDict } from '@/types';
import { listAges, listChannels, listMetrics } from '@/api/system';

/**
 * 字典数据全局缓存（技术方案 7.3，落地到 localStorage 的版本号机制从简）
 * 管理页“字典配置”页签改动后，其他页签读取到的是最新内存数据。
 */
export const useDictStore = defineStore('dict', () => {
  const channels = ref<ChannelDict[]>([]);
  const ages = ref<AgeDict[]>([]);
  const metrics = ref<MetricDict[]>([]);
  const loaded = ref(false);
  const loading = ref(false);

  async function loadAll(force = false): Promise<void> {
    if (loaded.value && !force) return;
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
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  function replaceChannel(channel: ChannelDict): void {
    channels.value = channels.value.map((item) => (item.code === channel.code ? channel : item));
  }

  function replaceAge(age: AgeDict): void {
    ages.value = ages.value.map((item) => (item.value === age.value ? age : item));
    ages.value = [...ages.value].sort((a, b) => a.sort - b.sort);
  }

  function replaceMetric(metric: MetricDict): void {
    metrics.value = metrics.value.map((item) => (item.key === metric.key ? metric : item));
  }

  return {
    channels,
    ages,
    metrics,
    loaded,
    loading,
    loadAll,
    replaceChannel,
    replaceAge,
    replaceMetric
  };
});
