<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import AppModal from "../../components/AppModal.vue";
import { useI18n } from "../../i18n";
import { fetchGtfsLineTimetable } from "../../services/lineFrequencyTimetable";
import type { GtfsLineFrequencyResponse } from "../../types/lineFrequency";
import type { GtfsLineTimetableResponse } from "../../types/lineFrequencyTimetable";
import type { LineFrequencyStationCoordinate } from "./lineFrequencyCompass";
import LineFrequencyTimetable from "./LineFrequencyTimetable.vue";

const props = defineProps<{
  open: boolean;
  profile?: GtfsLineFrequencyResponse;
  lineColor?: string;
  stationCoordinates?: readonly LineFrequencyStationCoordinate[];
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();
const timetable = ref<GtfsLineTimetableResponse>();
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
    error.value = true;
    return;
  }

  const sequence = ++requestSequence;
  const controller = new AbortController();
  requestController = controller;
  timetable.value = undefined;
  loading.value = true;
  error.value = false;

  try {
    timetable.value = await fetchGtfsLineTimetable(lineId, {
      serviceDate: props.profile?.serviceDate,
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted || sequence !== requestSequence) return;
    error.value = true;
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

watch(
  [() => props.open, () => props.profile?.lineId, () => props.profile?.serviceDate],
  ([open]) => {
    if (open) {
      void loadTimetable();
    } else {
      requestSequence += 1;
      requestController?.abort();
      requestController = undefined;
      loading.value = false;
    }
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
    @close="emit('close')"
  >
    <LineFrequencyTimetable
      :profile="profile"
      :line-color="lineColor"
      :station-coordinates="stationCoordinates"
      :timetable="timetable"
      :loading="loading"
      :error="error"
    />
  </AppModal>
</template>

<style scoped>
:global(.line-frequency-timetable-modal) {
  width: min(760px, calc(100vw - 32px));
  max-width: min(760px, calc(100vw - 32px));
  max-height: min(92dvh, 920px);
  overflow: auto;
}

:global(.line-frequency-timetable-modal .app-modal__body) {
  min-width: 0;
  overflow-x: hidden;
}
</style>
