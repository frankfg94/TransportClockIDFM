<script setup lang="ts">
import { computed, ref } from "vue";
import { navigateTo, useRoute } from "#imports";
import { Trash2 } from "lucide-vue-next";
import LineOptimizerPage from "../../../src/features/line-optimizer/LineOptimizerPage.vue";
import { useCustomOptimizers, deleteCustomOptimizer } from "../../../src/features/line-optimizer/customOptimizers";
import { velizyOptimizerConfig } from "../../../src/features/line-optimizer/optimizerConfig";
import { useI18n } from "../../../src/i18n";
const route = useRoute();
const { t } = useI18n();
const items = useCustomOptimizers();
const item = computed(() => items.value.find((entry) => entry.id === String(route.params.id)));
const config = computed(() => item.value ? { ...velizyOptimizerConfig, defaultOrigin: item.value.origin, defaultDestination: item.value.destination } : undefined);
const error = ref(false);
async function remove() {
  if (!item.value || !window.confirm(t("lineOptimizer.deleteConfirm", { name: item.value.name }))) return;
  try { deleteCustomOptimizer(item.value.id); await navigateTo("/optimizer/velizy"); } catch { error.value = true; }
}
</script>
<template>
  <div v-if="item && config">
    <div class="delete-bar"><button type="button" :aria-label="t('lineOptimizer.delete')" :title="t('lineOptimizer.delete')" @click="remove"><Trash2 :size="20" aria-hidden="true" /></button></div>
    <p v-if="error" role="alert">{{ t("lineOptimizer.saveError") }}</p>
    <LineOptimizerPage :key="item.id" :config="config" :title="item.name" />
  </div>
  <main v-else class="missing">{{ t("lineOptimizer.customMissing") }}</main>
</template>
<style scoped>
.delete-bar { max-width: 1400px; margin: 1rem auto 0; padding: 0 1rem; display: flex; justify-content: flex-end; }
.delete-bar button { display: inline-flex; padding: .65rem; }
.missing { padding: 2rem; }
</style>
