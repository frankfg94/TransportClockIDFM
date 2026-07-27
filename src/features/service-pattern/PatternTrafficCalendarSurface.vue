<script setup lang="ts">
import AppModal from "../../components/AppModal.vue";
import AppRightPanel from "../../components/AppRightPanel.vue";
import LoadingClock, { type LoadingClockDirection } from "../../components/LoadingClock.vue";
import { useI18n } from "../../i18n";
import type { TrafficDisruption } from "../traffic";
import PatternTrafficCalendar from "./PatternTrafficCalendar.vue";
import type { PatternTrafficCalendarDay, PatternTrafficCalendarMonth } from "./trafficCalendar";
import type { PatternTrafficSummaryEntry } from "./trafficCalendarSummary";

withDefaults(
  defineProps<{
    open: boolean;
    expanded?: boolean;
    calendar: PatternTrafficCalendarMonth;
    selectedDateKey: string;
    selectedDay?: PatternTrafficCalendarDay;
    selectedDisruptions?: TrafficDisruption[];
    hasPrevious?: boolean;
    hasNext?: boolean;
    loadingDateKey?: string;
    loadingDirection?: LoadingClockDirection;
    idPrefix?: string;
    userFriendlySummary?: boolean;
  }>(),
  {
    expanded: false,
    selectedDay: undefined,
    selectedDisruptions: () => [],
    hasPrevious: false,
    hasNext: false,
    loadingDateKey: undefined,
    loadingDirection: "idle",
    idPrefix: "traffic-calendar",
    userFriendlySummary: true,
  },
);

const emit = defineEmits<{
  close: [];
  closeExpanded: [];
  previous: [];
  next: [];
  resetToday: [];
  select: [day: PatternTrafficCalendarDay];
  expand: [];
  focusDisruption: [entry: PatternTrafficSummaryEntry];
}>();

const { t } = useI18n();
</script>

<template>
  <AppRightPanel
    :open="open && !expanded"
    :title="t('pattern.trafficCalendarTitle')"
    size="large"
    :busy="Boolean(loadingDateKey)"
    @close="emit('close')"
  >
    <PatternTrafficCalendar
      :calendar="calendar"
      :selected-date-key="selectedDateKey"
      :selected-day="selectedDay"
      :selected-disruptions="selectedDisruptions"
      :has-previous="hasPrevious"
      :has-next="hasNext"
      :id-prefix="idPrefix"
      :user-friendly-summary="userFriendlySummary"
      mode="panel"
      focusable-summaries
      :show-identity="false"
      @previous="emit('previous')"
      @next="emit('next')"
      @reset-today="emit('resetToday')"
      @select="emit('select', $event)"
      @expand="emit('expand')"
      @focus-disruption="emit('focusDisruption', $event)"
    />
  </AppRightPanel>

  <AppModal
    :open="open && expanded"
    :title="t('pattern.trafficCalendarTitle')"
    panel-class="pattern-traffic-calendar-modal"
    @close="emit('closeExpanded')"
  >
    <PatternTrafficCalendar
      :calendar="calendar"
      :selected-date-key="selectedDateKey"
      :selected-day="selectedDay"
      :selected-disruptions="selectedDisruptions"
      :has-previous="hasPrevious"
      :has-next="hasNext"
      :id-prefix="`${idPrefix}-modal`"
      :user-friendly-summary="userFriendlySummary"
      mode="modal"
      focusable-summaries
      :show-identity="false"
      @previous="emit('previous')"
      @next="emit('next')"
      @reset-today="emit('resetToday')"
      @select="emit('select', $event)"
      @focus-disruption="emit('focusDisruption', $event)"
    />
  </AppModal>

  <Teleport to="body">
    <Transition name="loading-clock-overlay">
      <LoadingClock v-if="loadingDateKey" overlay :direction="loadingDirection" />
    </Transition>
  </Teleport>
</template>

<style>
.pattern-traffic-calendar-modal {
  max-height: min(92dvh, 920px);
  max-width: min(1180px, calc(100vw - 32px));
  overflow: auto;
  width: min(1180px, calc(100vw - 32px));
}
</style>
