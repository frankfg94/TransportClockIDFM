<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "#imports";
import LineOptimizerPage from "../../../../src/features/line-optimizer/LineOptimizerPage.vue";
import { resolveLineOptimizerConfig } from "../../../../src/features/line-optimizer/optimizerConfig";
import { useI18n } from "../../../../src/i18n";

const route = useRoute();
const { t } = useI18n();
const config = computed(() =>
  resolveLineOptimizerConfig(String(route.params.transportType), String(route.params.lineId)),
);
</script>

<template>
  <LineOptimizerPage
    v-if="config"
    :key="`${config.transportType}:${config.lineCode}`"
    :config="config"
  />
  <main v-else class="optimizer-unsupported">
    <h1>{{ t("lineOptimizer.unsupported") }}</h1>
  </main>
</template>

<style scoped>
.optimizer-unsupported {
  padding: var(--space-6);
  color: var(--ink);
}
</style>
