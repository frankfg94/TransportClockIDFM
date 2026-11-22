<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { shiftGtfsDate } from "../../../shared/gtfs/timetableCalendar";
import AppModal from "../../components/AppModal.vue";
import LoadingBar from "../../components/LoadingBar.vue";
import MaterialCombobox from "../../components/MaterialCombobox.vue";
import { useI18n } from "../../i18n";
import type { GtfsLineFrequencyResponse } from "../../types/lineFrequency";
import type { GtfsLineTimetableResponse } from "../../types/lineFrequencyTimetable";
import type { LineFrequencyStationCoordinate } from "./lineFrequencyCompass";
import { useLineFrequencyTimetable } from "./useLineFrequencyTimetable";
import LineFrequencyTimetable from "./LineFrequencyTimetable.vue";
import { getGtfsRequestDate } from "../../services/lineFrequency";

const props = defineProps<{
  open: boolean;
  profile?: GtfsLineFrequencyResponse;
  lineColor?: string;
  stationCoordinates?: readonly LineFrequencyStationCoordinate[];
  stationId?: string;
  stationName?: string;
  contextLabel?: string;
  directionDestinations?: readonly string[];
  teleportDisabled?: boolean;
  profileLoading?: boolean;
  profileError?: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t, d } = useI18n();
const { getTimetable } = useLineFrequencyTimetable();
const timetable = ref<GtfsLineTimetableResponse>();
const nextTimetable = ref<GtfsLineTimetableResponse>();
// Monday is zero; formatting uses a known Monday independent of browser timezone.
const selectedWeekday = ref("0");
const weekdays = computed(() => Array.from({ length: 7 }, (_, day) => ({
  id: String(day),
  label: d(new Date(Date.UTC(2024, 0, 1 + day)), { weekday: "long", timeZone: "UTC" }),
})));

function weekdayOf(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6)) - 1;
  const day = Number(date.slice(6, 8));
  return (new Date(Date.UTC(year, month, day)).getUTCDay() + 6) % 7;
}
function dateForWeekday(weekday: number): string {
  const today = getGtfsRequestDate();
  const date = shiftGtfsDate(today, weekday - weekdayOf(today));
  const coverage = props.profile?.coverage;
  if (!coverage) return date;
  if (date < coverage.startDate) {
    return shiftGtfsDate(coverage.startDate, (weekday - weekdayOf(coverage.startDate) + 7) % 7);
  }
  if (date > coverage.endDate) {
    return shiftGtfsDate(coverage.endDate, -((weekdayOf(coverage.endDate) - weekday + 7) % 7));
  }
  return date;
}
const loading = ref(false);
const error = ref(false);
let requestController: AbortController | undefined;
let requestSequence = 0;

async function loadTimetable(): Promise<void> {
  requestController?.abort();
  const lineId = props.profile?.lineId?.trim();
  if (!lineId) {
    timetable.value = undefined;
    loading.value = false;
    error.value = !props.profileLoading;
    return;
  }

  const sequence = ++requestSequence;
  const controller = new AbortController();
  requestController = controller;
  timetable.value = undefined;
  nextTimetable.value = undefined;
  loading.value = true;
  error.value = false;

  try {
    const serviceDate = dateForWeekday(Number(selectedWeekday.value));
    const nextDate = shiftGtfsDate(serviceDate, 1);
    const [current, next] = await Promise.all([
      getTimetable(lineId, { serviceDate, signal: controller.signal }),
      getTimetable(lineId, { serviceDate: nextDate, signal: controller.signal }).catch(() => undefined),
    ]);
    if (controller.signal.aborted || sequence !== requestSequence) return;
    timetable.value = current;
    nextTimetable.value = next;
  } catch {
    if (controller.signal.aborted || sequence !== requestSequence) return;
    error.value = true;
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) selectedWeekday.value = String(weekdayOf(getGtfsRequestDate()));
  },
  { immediate: true },
);
watch(
  [() => props.open, () => props.profile, selectedWeekday],
  ([open]) => {
    if (!open) {
      requestSequence += 1;
      requestController?.abort();
      loading.value = false;
      return;
    }
    void loadTimetable();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  requestSequence += 1;
  requestController?.abort();
});
</script>

<template>
  <AppModal
    :open="open"
    :title="t('globalMap.sidebar.gtfsFrequency.timetableTitle')"
    panel-class="line-frequency-timetable-modal"
    :teleport-disabled="teleportDisabled"
    @close="emit('close')"
  >
    <p v-if="contextLabel">{{ contextLabel }}</p>
    <LineFrequencyTimetable
      :profile="profile"
      :line-color="lineColor"
      :station-coordinates="stationCoordinates"
      :station-id="stationId"
      :station-name="stationName"
      :direction-destinations="directionDestinations"
      :timetable="timetable"
      :next-timetable="nextTimetable"
      :loading="loading || profileLoading"
      :error="error || profileError"
    >
      <template #service-day>
        <div class="line-frequency-timetable-modal__date">
          <span>{{ t("globalMap.sidebar.gtfsFrequency.timetableChooseDate") }}</span>
          <MaterialCombobox
            v-model="selectedWeekday"
            :options="weekdays"
            :aria-label="t('globalMap.sidebar.gtfsFrequency.timetableChooseDate')"
            teleport
            data-testid="frequency-weekday"
          />
        </div>
      </template>
    </LineFrequencyTimetable>
    <template v-if="loading || profileLoading" #footer>
      <LoadingBar
        class="line-frequency-timetable-modal__loading-bar"
        indeterminate
        :style="{ '--loading-bar-color': lineColor || 'var(--idfm-blue)' }"
        :aria-label="t('globalMap.sidebar.gtfsFrequency.timetableLoading')"
      />
    </template>
  </AppModal>
</template>

<style scoped>
:global(.line-frequency-timetable-modal) {
  width: min(820px, calc(100vw - 24px));
  max-width: min(820px, calc(100vw - 24px));
  max-height: min(92dvh, 920px);
  overflow: hidden;
}

:global(.line-frequency-timetable-modal .app-modal__body) {
  min-width: 0;
  overflow-x: hidden;
}

:global(.line-frequency-timetable-modal .modal-panel__footer) {
  padding: 0;
  border-top: 0;
}

.line-frequency-timetable-modal__date {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
}
.line-frequency-timetable-modal__date :deep(.material-combobox) {
  width: 100%;
  min-width: 0;
}
.line-frequency-timetable-modal__date :deep(.material-combobox__value) {
  font-size: 0.8rem;
}
@media (max-width: 520px) {
  :global(.line-frequency-timetable-modal .modal-panel__header h2) {
    font-size: 1.05rem;
  }
  :global(.line-frequency-timetable-modal .app-modal__body) {
    padding: 12px;
  }
}
.line-frequency-timetable-modal__loading-bar {
  width: 100%;
}
</style>
