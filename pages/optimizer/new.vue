<script setup lang="ts">
import { ref } from "vue";
import { navigateTo } from "#imports";
import { useI18n } from "../../src/i18n";
import { createCustomOptimizer } from "../../src/features/line-optimizer/customOptimizers";
import { velizyOptimizerConfig } from "../../src/features/line-optimizer/optimizerConfig";
const { t } = useI18n();
const name = ref("");
const origin = ref(velizyOptimizerConfig.defaultOrigin);
const destination = ref("");
const error = ref(false);
async function create() {
  try { const item = createCustomOptimizer(name.value, origin.value, destination.value); await navigateTo(`/optimizer/custom/${item.id}`); }
  catch { error.value = true; }
}
</script>
<template>
  <main class="optimizer-create">
    <h1>{{ t("lineOptimizer.newTitle") }}</h1>
    <form @submit.prevent="create">
      <label>{{ t("lineOptimizer.name") }}<input v-model.trim="name" required maxlength="100" /></label>
      <label>{{ t("lineOptimizer.origin") }}<input v-model.trim="origin" required /></label>
      <label>{{ t("lineOptimizer.destination") }}<input v-model.trim="destination" required /></label>
      <p v-if="error" role="alert">{{ t("lineOptimizer.saveError") }}</p>
      <button type="submit">{{ t("lineOptimizer.create") }}</button>
    </form>
  </main>
</template>
<style scoped>
.optimizer-create { max-width: 650px; margin: 2rem auto; padding: 1rem; }
form { display: grid; gap: 1rem; padding: 1.5rem; background: var(--surface, #fff); border-radius: 16px; }
label { display: grid; gap: .4rem; font-weight: 700; }
input { width: 100%; padding: .75rem; border: 1px solid #cbd5e1; border-radius: 8px; }
button { justify-self: start; padding: .7rem 1rem; }
</style>
