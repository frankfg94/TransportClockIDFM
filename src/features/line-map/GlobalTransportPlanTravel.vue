<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "../../i18n";
import GlobalTransportPlan from "./GlobalTransportPlan.vue";
import type { GlobalTransportPlanItinerary } from "./globalTransportPlanItinerary";

const props = defineProps<{ itinerary: GlobalTransportPlanItinerary }>();
const { t, n } = useI18n();
const partialGeometry = computed(() =>
  props.itinerary.steps.some(
    (step) =>
      (step.kind === "transit" || step.kind === "walk") &&
      (!step.section.fromPoint ||
        !step.section.toPoint ||
        (step.section.geometry?.length ?? 0) < 2),
  ),
);
</script>

<template>
  <section class="global-transport-plan-travel" :aria-label="t('lineOptimizer.journeyMap')">
    <header class="global-transport-plan-travel__header">
      <h3>{{ t("lineOptimizer.journeyMap") }}</h3>
      <div>
        <small>{{ t("globalMap.itinerary.from") }}</small
        ><strong>{{ itinerary.origin.label }}</strong>
      </div>
      <div>
        <small>{{ t("globalMap.itinerary.to") }}</small
        ><strong>{{ itinerary.destination.label }}</strong>
      </div>
      <p>
        {{
          t("lineOptimizer.totalDuration", {
            duration: t("lineOptimizer.minutes", {
              value: n(itinerary.route.durationSeconds / 60, { maximumFractionDigits: 1 }),
            }),
          })
        }}
        · {{ t("lineOptimizer.totalWaiting") }} :
        {{
          t("lineOptimizer.minutes", {
            value: n(itinerary.totalWaitSeconds / 60, { maximumFractionDigits: 1 }),
          })
        }}
      </p>
      <p v-if="partialGeometry" class="global-transport-plan-travel__partial">
        {{ t("lineOptimizer.mapGeometryPartial") }}
      </p>
    </header>
    <GlobalTransportPlan experience="next" :itinerary="itinerary" />
  </section>
</template>

<style scoped>
.global-transport-plan-travel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
}
.global-transport-plan-travel__header {
  padding: var(--space-4);
  border-bottom: 1px solid var(--border);
}
.global-transport-plan-travel__header > div {
  display: grid;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
  overflow-wrap: anywhere;
}
.global-transport-plan-travel__header small,
.global-transport-plan-travel__header p {
  color: var(--muted);
}
.global-transport-plan-travel__header h3 {
  margin: 0 0 var(--space-3);
  font-size: 1rem;
}
.global-transport-plan-travel__header .global-transport-plan-travel__partial {
  margin-top: var(--space-2);
}
.global-transport-plan-travel__header p {
  font-size: 0.85rem;
  margin: 0;
}
</style>
