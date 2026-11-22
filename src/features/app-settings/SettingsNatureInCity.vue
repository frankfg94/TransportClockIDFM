<script setup lang="ts">
import { onMounted, onBeforeUnmount, shallowRef } from "vue";
import { useI18n } from "../../i18n";
import { toServerApiUrl } from "../../services/serverApi";
import type { DatasetInfo } from "../health/types";

const { d, n, t } = useI18n();
const dataset = shallowRef<DatasetInfo>();
const loading = shallowRef(true);
const controller = new AbortController();

onMounted(async () => {
  try {
    const response = await fetch(toServerApiUrl("/api/datasets/nature-in-city"), { signal: controller.signal });
    if (response.ok) dataset.value = await response.json();
  } catch {
    // The panel reports the unavailable state for offline clients.
  } finally {
    loading.value = false;
  }
});
onBeforeUnmount(() => controller.abort());
</script>

<template>
  <article class="settings-data-overview" data-testid="settings-ign-nature-en-ville" aria-labelledby="nature-in-city-title">
    <h3 id="nature-in-city-title">{{ t('settings.natureInCity.title') }}</h3>
    <p v-if="loading" role="status">{{ t('settings.natureInCity.loading') }}</p>
    <template v-else>
      <p v-if="dataset?.referencePeriod">{{ t('settings.natureInCity.period', { period: dataset.referencePeriod }) }}</p>
      <p v-else>{{ t('settings.natureInCity.missing') }}</p>
      <p v-if="dataset?.coveredCommunes !== undefined">{{ t('settings.natureInCity.coverage', { count: n(dataset.coveredCommunes) }) }}</p>
      <p v-if="dataset?.lastCheck">{{ t('settings.natureInCity.lastCheck', { date: d(new Date(dataset.lastCheck.checkedAt), { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' }) }) }}</p>
      <p role="status">{{ t(`settings.natureInCity.${dataset?.lastCheck?.result ?? 'unknown'}`) }}</p>
    </template>
  </article>
</template>
