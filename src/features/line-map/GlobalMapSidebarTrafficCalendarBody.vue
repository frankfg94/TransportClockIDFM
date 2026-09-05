<script setup lang="ts">
import AppModal from "../../components/AppModal.vue";
import LoadingClock from "../../components/LoadingClock.vue";
import { useI18n } from "../../i18n";
import PatternTrafficCalendar from "../service-pattern/PatternTrafficCalendar.vue";
import type { PatternTrafficCalendarDay } from "../service-pattern/trafficCalendar";
import type { PatternTrafficSummaryEntry } from "../service-pattern/trafficCalendarSummary";
import type { GlobalMapSidebarTrafficCalendarState } from "./globalMapSidebarBodyTypes";

defineProps<GlobalMapSidebarTrafficCalendarState>();

const emit = defineEmits<{
  "close-expanded": [];
  previous: [];
  next: [];
  "reset-today": [];
  select: [day: PatternTrafficCalendarDay];
  expand: [];
  "focus-disruption": [entry: PatternTrafficSummaryEntry];
}>();

const { t } = useI18n();
</script>

<template>
  <section
    class="global-map-sidebar-traffic-calendar"
    data-global-map-sidebar-traffic-calendar
  >
    <PatternTrafficCalendar
      v-if="!expanded"
      :calendar="calendar"
      :selected-date-key="selectedDateKey"
      :selected-day="selectedDay"
      :selected-disruptions="selectedDisruptions"
      :has-previous="hasPrevious"
      :has-next="hasNext"
      user-friendly-summary
      small-title
      mode="panel"
      focusable-summaries
      :show-identity="false"
      @previous="emit('previous')"
      @next="emit('next')"
      @reset-today="emit('reset-today')"
      @select="emit('select', $event)"
      @expand="emit('expand')"
      @focus-disruption="emit('focus-disruption', $event)"
    />
  </section>

  <AppModal
    :open="open && expanded"
    :title="t('pattern.trafficCalendarTitle')"
    panel-class="global-map-sidebar-traffic-calendar-modal"
    @close="emit('close-expanded')"
  >
    <PatternTrafficCalendar
      :calendar="calendar"
      :selected-date-key="selectedDateKey"
      :selected-day="selectedDay"
      :selected-disruptions="selectedDisruptions"
      :has-previous="hasPrevious"
      :has-next="hasNext"
      user-friendly-summary
      mode="modal"
      focusable-summaries
      small-title
      :show-identity="false"
      @previous="emit('previous')"
      @next="emit('next')"
      @reset-today="emit('reset-today')"
      @select="emit('select', $event)"
      @focus-disruption="emit('focus-disruption', $event)"
    />
  </AppModal>

  <Teleport to="body">
    <Transition name="loading-clock-overlay">
      <LoadingClock
        v-if="loadingDateKey"
        overlay
        :direction="loadingDirection"
      />
    </Transition>
  </Teleport>
</template>

<style scoped>
.global-map-sidebar-traffic-calendar {
  min-width: 0;
}

.global-map-sidebar-traffic-calendar :deep(.pattern-traffic-calendar) {
  padding: 0;
  background: transparent;
}

:global(.global-map-sidebar-traffic-calendar-modal) {
  width: min(1180px, calc(100vw - 32px));
  max-width: min(1180px, calc(100vw - 32px));
  max-height: min(92dvh, 920px);
  overflow: auto;
}
</style>
