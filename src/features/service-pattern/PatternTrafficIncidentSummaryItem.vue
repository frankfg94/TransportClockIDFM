<script setup lang="ts">
import { trafficIncidentIcons } from "./trafficIncidentIcons";
import type { PatternTrafficSummaryIncidentType } from "./trafficCalendarSummary";

withDefaults(
  defineProps<{
    title: string;
    incidentType: PatternTrafficSummaryIncidentType;
    critical?: boolean;
    details?: string[];
  }>(),
  { critical: false, details: () => [] },
);
</script>

<template>
  <li
    class="pattern-traffic-friendly-summary__item"
    :class="[
      `pattern-traffic-friendly-summary__item--${incidentType}`,
      { 'pattern-traffic-friendly-summary__item--critical': critical },
    ]"
  >
    <span class="pattern-traffic-friendly-summary__incident-icon" role="img">
      <component
        :is="trafficIncidentIcons[incidentType]"
        :size="40"
        :stroke-width="2.4"
        aria-hidden="true"
      />
    </span>
    <div class="pattern-traffic-friendly-summary__copy">
      <strong>{{ title }}</strong>
      <span
        v-if="details.length"
        class="pattern-traffic-friendly-summary__times"
      >
        <span v-for="(detail, index) in details" :key="index">
          {{ detail }}
        </span>
      </span>
    </div>
  </li>
</template>

<style scoped>
.pattern-traffic-friendly-summary__item {
  align-items: center;
  display: flex;
  gap: 25px;
}

.pattern-traffic-friendly-summary__incident-icon {
  align-items: center;
  color: #f59e0b;
  display: inline-flex;
  height: 50px;
  justify-content: center;
  width: 50px;
}

.pattern-traffic-friendly-summary__item--crowding
  .pattern-traffic-friendly-summary__incident-icon {
  color: #d946ef;
}

.pattern-traffic-friendly-summary__item--information
  .pattern-traffic-friendly-summary__incident-icon {
  color: #6366f1;
}

.pattern-traffic-friendly-summary__item--weather
  .pattern-traffic-friendly-summary__incident-icon {
  color: #0284c7;
}

.pattern-traffic-friendly-summary__item--safety
  .pattern-traffic-friendly-summary__incident-icon {
  color: #e11d48;
}

.pattern-traffic-friendly-summary__item--critical
  .pattern-traffic-friendly-summary__incident-icon {
  color: #dc2626;
}

.pattern-traffic-friendly-summary__copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.pattern-traffic-friendly-summary__copy strong {
  color: #3f3b58;
  font-size: 1.84rem;
  font-weight: 800;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.pattern-traffic-friendly-summary__times {
  color: #77738d;
  display: flex;
  flex-wrap: wrap;
  font-size: 0.76rem;
  font-weight: 650;
  gap: 3px 8px;
  line-height: 1.3;
}

.pattern-traffic-friendly-summary__times > span:not(:last-child)::after {
  content: " ?";
}
</style>
