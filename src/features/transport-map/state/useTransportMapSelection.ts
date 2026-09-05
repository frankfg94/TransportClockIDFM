import { computed, ref } from "vue";

export function useTransportMapSelection(maxStations = 12) {
  const activeLineId = ref<string>();
  const activeStationId = ref<string>();
  const selectedStationIds = ref<string[]>([]);
  const hasSelection = computed(() => Boolean(activeLineId.value || activeStationId.value || selectedStationIds.value.length));

  function selectLine(lineId: string | undefined): void {
    activeLineId.value = lineId;
  }
  function selectStation(stationId: string, mode: "replace" | "toggle" | "append" = "replace"): void {
    activeStationId.value = stationId;
    if (mode === "replace") selectedStationIds.value = [stationId];
    else if (mode === "toggle") {
      selectedStationIds.value = selectedStationIds.value.includes(stationId)
        ? selectedStationIds.value.filter((id) => id !== stationId)
        : [...selectedStationIds.value, stationId].slice(-maxStations);
    } else if (!selectedStationIds.value.includes(stationId)) {
      selectedStationIds.value = [...selectedStationIds.value, stationId].slice(-maxStations);
    }
  }
  function clear(): void {
    activeLineId.value = undefined;
    activeStationId.value = undefined;
    selectedStationIds.value = [];
  }
  return { activeLineId, activeStationId, selectedStationIds, hasSelection, selectLine, selectStation, clear };
}

