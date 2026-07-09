<script setup lang="ts">
import type { PatternTrafficTimelineSeverity } from "./trafficTimeline";

defineProps<{
  active: boolean;
  dateLabel: string;
  durationLabel?: string;
  severity: PatternTrafficTimelineSeverity;
  stationCountLabel: string;
}>();
</script>

<template>
  <span
    class="pattern-traffic-timeline-dot-meta"
    :class="[
      `pattern-traffic-timeline-dot-meta--${severity}`,
      { 'pattern-traffic-timeline-dot-meta--active': active },
    ]"
  >
    <strong>{{ dateLabel }}</strong>
    <span>{{ stationCountLabel }}</span>
    <small v-if="durationLabel">{{ durationLabel }}</small>
  </span>
</template>

<style scoped>
.pattern-traffic-timeline-dot-meta {
  align-items: center;
  color: #25213f;
  display: grid;
  gap: 3px;
  justify-items: center;
  line-height: 1.12;
  min-width: 88px;
  text-align: center;
  transition:
    color 160ms ease,
    transform 160ms ease;
}

.pattern-traffic-timeline-dot-meta strong {
  font-size: 0.72rem;
  font-weight: 950;
}

.pattern-traffic-timeline-dot-meta span {
  font-size: 0.68rem;
  font-weight: 850;
}

.pattern-traffic-timeline-dot-meta small {
  color: #64748b;
  font-size: 0.62rem;
  font-weight: 800;
}

.pattern-traffic-timeline-dot-meta--active {
  color: #b00067;
  transform: translateY(-2px);
}

.pattern-traffic-timeline-dot-meta--medium:not(
    .pattern-traffic-timeline-dot-meta--active
  ) {
  color: #7c3aed;
}

.pattern-traffic-timeline-dot-meta--high:not(
    .pattern-traffic-timeline-dot-meta--active
  ) {
  color: #be123c;
}
</style>
