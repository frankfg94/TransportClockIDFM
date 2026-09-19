<script setup lang="ts">
import { ref } from "vue";
import { Database, Settings2 } from "lucide-vue-next";
import DatasetManagerModal from "./DatasetManagerModal.vue";
import { useI18n } from "../../i18n";

const open = ref(false);
const { t } = useI18n();
</script>

<template>
  <section class="dataset-manager-launch" data-testid="dataset-manager">
    <div class="dataset-manager-launch__copy">
      <p class="eyebrow">{{ t("health.datasets.eyebrow") }}</p>
      <strong>{{ t("health.datasets.launchTitle") }}</strong>
      <span>{{ t("health.datasets.launchDescription") }}</span>
    </div>
    <button
      class="dataset-manager-launch__button"
      type="button"
      data-testid="dataset-manager-open"
      @click="open = true"
    >
      <Database :size="17" aria-hidden="true" />
      <span>{{ t("health.datasets.button") }}</span>
      <Settings2 :size="15" aria-hidden="true" />
    </button>
  </section>

  <DatasetManagerModal :open="open" @close="open = false" />
</template>

<style scoped>
.dataset-manager-launch {
  align-items: center;
  background: linear-gradient(135deg, #f4f2ff, #eef8ff);
  border: 1px solid rgba(81, 70, 255, 0.16);
  border-radius: 12px;
  display: flex;
  gap: 18px;
  justify-content: space-between;
  margin-bottom: 18px;
  padding: 15px 18px;
}

.dataset-manager-launch__copy {
  display: grid;
  gap: 3px;
}

.dataset-manager-launch__copy .eyebrow {
  margin-bottom: 1px;
}

.dataset-manager-launch__copy strong {
  color: var(--ink);
  font-size: 0.95rem;
}

.dataset-manager-launch__copy span {
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.4;
}

.dataset-manager-launch__button {
  align-items: center;
  background: #5146ff;
  border: 0;
  border-radius: 9px;
  color: #fff;
  display: inline-flex;
  flex: 0 0 auto;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 900;
  gap: 7px;
  min-height: 40px;
  padding: 8px 12px;
}

.dataset-manager-launch__button:hover,
.dataset-manager-launch__button:focus-visible {
  background: #4034df;
  outline: 0;
}

@media (max-width: 680px) {
  .dataset-manager-launch {
    align-items: stretch;
    flex-direction: column;
  }

  .dataset-manager-launch__button {
    justify-content: center;
  }
}
</style>
