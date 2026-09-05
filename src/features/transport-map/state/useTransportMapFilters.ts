import { computed, ref, type Ref } from "vue";
import { GLOBAL_MAP_MODE_ORDER, type GlobalMapMode } from "../contracts/manifest";

export { GLOBAL_MAP_MODE_ORDER } from "../contracts/manifest";

export function useTransportMapFilters(availableModes: Ref<GlobalMapMode[]>) {
  const selectedModes = ref<GlobalMapMode[]>([]);
  const visibleModes = computed(() => selectedModes.value);
  const visibleModeMask = computed(() => {
    return GLOBAL_MAP_MODE_ORDER.reduce(
      (mask, mode, index) => mask | (selectedModes.value.includes(mode) ? 1 << index : 0),
      0,
    );
  });
  function setAll(): void {
    // Bus, Noctilien and the potentially large PRIM bike network are
    // intentionally opt-in: they must not be pulled into the initial global
    // scene by the default all-modes state.
    selectedModes.value = availableModes.value.filter(
      (mode) => mode !== "BUS" && mode !== "NOCTILIEN" && mode !== "BIKE",
    );
  }
  function setAllIncludingBus(): void {
    // Bus can be exposed by an explicit station/search context, but Noctilien
    // and the large bike layer remain opt-in everywhere so they never appear
    // as a side effect of selecting a station.
    selectedModes.value = availableModes.value.filter(
      (mode) => mode !== "NOCTILIEN" && mode !== "BIKE",
    );
  }
  function setAllVisible(): void {
    // The explicit "show all" preset is allowed to include every mode exposed
    // by the loaded manifest, including the opt-in surface modes.
    selectedModes.value = [...availableModes.value];
  }
  function toggle(mode: GlobalMapMode): void {
    selectedModes.value = selectedModes.value.includes(mode)
      ? selectedModes.value.filter((candidate) => candidate !== mode)
      : [...selectedModes.value, mode];
  }
  return {
    selectedModes,
    visibleModes,
    visibleModeMask,
    setAll,
    setAllIncludingBus,
    setAllVisible,
    toggle,
  };
}
