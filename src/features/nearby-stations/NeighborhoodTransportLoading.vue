<script setup lang="ts">
import Spinner from "../../components/Spinner.vue";
import { useI18n, type TranslationKey } from "../../i18n";

defineProps<{ tasks: readonly { id: string; labelKey: TranslationKey }[] }>();
const { t } = useI18n();
</script>

<template>
  <ul v-if="tasks.length" class="transport-loading" aria-live="polite" :aria-label="t('nearbyStations.neighborhoodScore.transportTasksTitle')">
    <li v-for="task in tasks" :key="task.id" :data-transport-task="task.id">
      <Spinner :size="14" aria-hidden="true" />
      <span>{{ t(task.labelKey) }}</span>
    </li>
  </ul>
</template>

<style scoped>
.transport-loading { display: flex; flex-wrap: wrap; gap: 8px 20px; padding: 12px; margin: 0 0 12px; list-style: none; color: var(--muted); background: var(--surface); border-radius: 12px; }
.transport-loading li { display: flex; align-items: center; gap: 8px; font-size: .85rem; }
</style>
