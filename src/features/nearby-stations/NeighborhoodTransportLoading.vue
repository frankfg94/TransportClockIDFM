<script setup lang="ts">
import Spinner from "../../components/Spinner.vue";
import { useI18n } from "../../i18n";
import type { NeighborhoodTransportLoadingTask } from "./neighborhood/transportLoadingTasks";

defineProps<{ tasks: readonly NeighborhoodTransportLoadingTask[] }>();
const { n, t } = useI18n();
</script>

<template>
  <ul v-if="tasks.length" class="transport-loading" aria-live="polite" :aria-label="t('nearbyStations.neighborhoodScore.transportTasksTitle')">
    <li v-for="task in tasks" :key="task.id" :data-transport-task="task.id">
      <Spinner :size="14" aria-hidden="true" />
      <span>
        {{ t(task.labelKey) }}
        <span v-if="task.counts" class="transport-loading__counts">
          <template v-if="task.counts.targets">
            {{ t('nearbyStations.neighborhoodScore.transportTasks.heavyAccessTargets', { completed: n(task.counts.targets.completed), total: n(task.counts.targets.total) }) }} ·
          </template>
          {{ t('nearbyStations.neighborhoodScore.transportTasks.heavyAccessCounts', { accesses: n(task.counts.accesses), lines: n(task.counts.lines) }) }}
        </span>
      </span>
    </li>
  </ul>
</template>

<style scoped>
.transport-loading { display: flex; flex-wrap: wrap; gap: 8px 20px; padding: 12px; margin: 0 0 12px; list-style: none; color: var(--muted); background: var(--surface); border-radius: 12px; }
.transport-loading li { display: flex; align-items: center; gap: 8px; font-size: .85rem; }
.transport-loading__counts { display: block; color: var(--ink); font-variant-numeric: tabular-nums; }
</style>
