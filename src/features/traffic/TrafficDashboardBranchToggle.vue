<script setup lang="ts">
import { useI18n } from "../../i18n";

const model = defineModel<boolean>({ required: true });
const { t } = useI18n();
</script>

<template>
  <label class="traffic-dashboard-branch-toggle">
    <input v-model="model" type="checkbox" role="switch" />
    <span class="traffic-dashboard-branch-toggle__track" aria-hidden="true"></span>
    <span>{{ t("traffic.dashboardBranches") }}</span>
  </label>
</template>

<style scoped>
.traffic-dashboard-branch-toggle {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-block: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
}

.traffic-dashboard-branch-toggle input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.traffic-dashboard-branch-toggle__track {
  display: flex;
  align-items: center;
  flex: 0 0 2rem;
  height: 1.125rem;
  padding-inline: 0.1875rem;
  border-radius: 999px;
  background: #64748b;
}

.traffic-dashboard-branch-toggle__track::before {
  content: "";
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  background: white;
}

.traffic-dashboard-branch-toggle input:checked + .traffic-dashboard-branch-toggle__track {
  justify-content: end;
  background: var(--idfm-blue, #0064ff);
}

.traffic-dashboard-branch-toggle input:focus-visible + .traffic-dashboard-branch-toggle__track {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
</style>
