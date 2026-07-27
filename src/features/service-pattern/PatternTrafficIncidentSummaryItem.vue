<script setup lang="ts">
import { trafficIncidentIcons } from "./trafficIncidentIcons";
import type { PatternTrafficSummaryIncidentType } from "./trafficCalendarSummary";

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    incidentType: PatternTrafficSummaryIncidentType;
    critical?: boolean;
    smallTitle?: boolean;
    details?: string[];
    interactive?: boolean;
    actionLabel?: string;
  }>(),
  {
    critical: false,
    smallTitle: false,
    details: () => [],
    interactive: false,
    actionLabel: undefined,
  },
);

const emit = defineEmits<{ activate: [] }>();
</script>

<template>
  <li
    class="pattern-traffic-friendly-summary__item"
    :class="[
      `pattern-traffic-friendly-summary__item--${incidentType}`,
      { 'pattern-traffic-friendly-summary__item--critical': critical },
    ]"
    :role="interactive ? 'button' : undefined"
    :tabindex="interactive ? 0 : undefined"
    :aria-label="interactive ? actionLabel : undefined"
    @click="interactive && emit('activate')"
    @keydown.enter.prevent="interactive && emit('activate')"
    @keydown.space.prevent="interactive && emit('activate')"
  >
    <span class="pattern-traffic-friendly-summary__incident-icon" role="img">
      <component
        :is="trafficIncidentIcons[incidentType]"
        :size="60"
        :stroke-width="2.4"
        aria-hidden="true"
      />
    </span>
    <div
      class="pattern-traffic-friendly-summary__copy"
      :class="{ 'small-title': props.smallTitle }"
    >
      <strong class="pattern-summary-title" :title="title">{{ title }}</strong>
      <span
        v-if="subtitle"
        class="pattern-traffic-friendly-summary__description"
        :title="subtitle"
      >
        {{ subtitle }}
      </span>
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
  gap: 18px;
  min-width: 0;
}

.pattern-traffic-friendly-summary__item[role="button"] {
  border-radius: 12px;
  cursor: pointer;
  margin: -7px;
  padding: 7px;
  transition:
    background-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.pattern-traffic-friendly-summary__item[role="button"]:hover {
  background: rgba(124, 58, 237, 0.055);
  transform: translateX(-2px);
}

.pattern-traffic-friendly-summary__item[role="button"]:focus-visible {
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.24);
  outline: none;
}

.pattern-traffic-friendly-summary__incident-icon {
  align-items: center;
  color: #f59e0b;
  display: inline-flex;
  flex: 0 0 50px;
  height: 50px;
  justify-content: center;
  margin-top: 1px;
  width: 50px;
}

.pattern-summary-title {
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

.pattern-traffic-friendly-summary__item--concert
  .pattern-traffic-friendly-summary__incident-icon,
.pattern-traffic-friendly-summary__item--police
  .pattern-traffic-friendly-summary__incident-icon {
  color: #2563eb;
}

.pattern-traffic-friendly-summary__item--sport
  .pattern-traffic-friendly-summary__incident-icon {
  color: #7c3aed;
}

.pattern-traffic-friendly-summary__item--celebration
  .pattern-traffic-friendly-summary__incident-icon,
.pattern-traffic-friendly-summary__item--medical
  .pattern-traffic-friendly-summary__incident-icon {
  color: #db2777;
}

.pattern-traffic-friendly-summary__item--animal
  .pattern-traffic-friendly-summary__incident-icon,
.pattern-traffic-friendly-summary__item--fallen-tree
  .pattern-traffic-friendly-summary__incident-icon {
  color: #15803d;
}

.pattern-traffic-friendly-summary__item--safety
  .pattern-traffic-friendly-summary__incident-icon,
.pattern-traffic-friendly-summary__item--suspicious-package
  .pattern-traffic-friendly-summary__incident-icon {
  color: #e11d48;
}

.pattern-traffic-friendly-summary__item--critical
  .pattern-traffic-friendly-summary__incident-icon {
  color: #dc2626;
}

.pattern-traffic-friendly-summary__copy {
  display: grid;
  flex: 1 1 auto;
  gap: 3px;
  min-width: 0;
  overflow: hidden;

}

.pattern-traffic-friendly-summary__copy strong,
.pattern-traffic-friendly-summary__description {
  display: -webkit-box;
  max-width: 100%;
  overflow: hidden;
  overflow-wrap: anywhere;
  text-wrap: pretty;
  -webkit-box-orient: vertical;
}

.pattern-traffic-friendly-summary__copy strong {
  -webkit-line-clamp: 2;
  color: #3f3b58;
  font-size: 1.84rem;
  font-weight: 800;
  line-height: 1.3;
}

.pattern-traffic-friendly-summary__description {
  -webkit-line-clamp: 2;
  color: #69657e;
  font-size: 0.73rem;
  font-weight: 600;
  line-height: 1.35;
}

.pattern-traffic-friendly-summary__times {
  align-items: center;
  color: #77738d;
  display: flex;
  flex-wrap: wrap;
  font-size: 0.76rem;
  font-weight: 650;
  gap: 3px 0;
  line-height: 1.3;
  min-width: 0;
}

.pattern-traffic-friendly-summary__times > span {
  display: inline-flex;
  white-space: nowrap;
}

.pattern-traffic-friendly-summary__times > span + span::before {
  color: #aaa6b8;
  content: "\2022";
  margin: 0 7px;
}
</style>
