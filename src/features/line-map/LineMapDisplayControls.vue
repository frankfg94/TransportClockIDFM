<script setup lang="ts">
import { computed } from "vue";
import type {
  GhostNetworkModeKey,
  GhostNetworkModeVisibility,
  GhostNetworkScope,
} from "../network-ghost";
import { useI18n } from "../../i18n";
import {
  GLOBAL_MAP_MODE_ORDER,
  type GlobalMapMode,
} from "../transport-map/contracts/manifest";

type LineMapDisplayControlsVariant = "ghost" | "global";

const props = withDefaults(defineProps<{
  variant?: LineMapDisplayControlsVariant;
  modelValue?: boolean;
  visibility?: GhostNetworkModeVisibility;
  ghostNetworkScope?: GhostNetworkScope;
  availableModes?: GlobalMapMode[];
  selectedModes?: GlobalMapMode[];
  hideLongWaitTransports?: boolean;
  showNearbyPlaces?: boolean;
  showNearbyPlaceNames?: boolean;
  nearbyOptions?: boolean;
}>(), {
  variant: "ghost",
  modelValue: true,
  visibility: () => ({
    bus: true,
    metro: true,
    tram: true,
    noctilien: true,
    rer: true,
    transilien: true,
  }),
  ghostNetworkScope: "all",
  availableModes: () => [],
  selectedModes: () => [],
});

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  "update:visibility": [value: GhostNetworkModeVisibility];
  "update:selectedModes": [value: GlobalMapMode[]];
  "update:hideLongWaitTransports": [value: boolean];
  "update:showNearbyPlaces": [value: boolean];
  "update:showNearbyPlaceNames": [value: boolean];
}>();
const { t } = useI18n();

const modes: GhostNetworkModeKey[] = [
  "bus",
  "metro",
  "tram",
  "noctilien",
  "rer",
  "transilien",
];

const globalModes = computed(() =>
  GLOBAL_MAP_MODE_ORDER.filter((mode) => props.availableModes.includes(mode)),
);
const selectedGlobalModes = computed(() => props.selectedModes);

function updateMainVisibility(event: Event): void {
  emit("update:modelValue", (event.target as HTMLInputElement).checked);
}

function updateModeVisibility(mode: GhostNetworkModeKey, event: Event): void {
  emit("update:visibility", {
    ...props.visibility,
    [mode]: (event.target as HTMLInputElement).checked,
  });
}

function isModeDisabled(mode: GhostNetworkModeKey): boolean {
  return (
    props.ghostNetworkScope === "structural" &&
    (mode === "bus" || mode === "noctilien")
  );
}

function getModeLabel(mode: GhostNetworkModeKey): string {
  if (mode === "metro") return t("traffic.family.metro");
  if (mode === "tram") return t("traffic.family.tram");
  if (mode === "rer") return t("traffic.family.rer");
  if (mode === "transilien") return t("traffic.family.train");

  return mode === "bus" ? "Bus" : "Noctilien";
}

function getGlobalModeLabel(mode: GlobalMapMode): string {
  switch (mode) {
    case "BUS":
      return t("globalMap.modes.bus");
    case "METRO":
      return t("globalMap.modes.metro");
    case "RER":
      return t("globalMap.modes.rer");
    case "TRAIN":
      return t("globalMap.modes.train");
    case "TRANSILIEN":
      return t("globalMap.modes.transilien");
    case "TRAM":
      return t("globalMap.modes.tram");
    case "CABLE":
      return t("globalMap.modes.cable");
    case "NOCTILIEN":
      return t("globalMap.modes.noctilien");
    case "BIKE":
      return t("globalMap.modes.bike");
  }
}

function toggleGlobalMode(mode: GlobalMapMode): void {
  const selected = new Set(selectedGlobalModes.value);
  if (selected.has(mode)) selected.delete(mode);
  else selected.add(mode);

  emit(
    "update:selectedModes",
    globalModes.value.filter((candidate) => selected.has(candidate)),
  );
}

function selectAllWithoutBus(): void {
  emit(
    "update:selectedModes",
    globalModes.value.filter((mode) => mode !== "BUS" && mode !== "NOCTILIEN"),
  );
}
</script>

<template>
  <div
    v-if="variant === 'global'"
    class="line-map-display-panel__content line-map-display-panel__content--global"
    data-global-line-map-display-controls
  >
    <div class="line-map-display-panel__modes line-map-display-panel__modes--global">
      <label v-for="mode in globalModes" :key="mode">
        <input
          type="checkbox"
          :checked="selectedGlobalModes.includes(mode)"
          @change="toggleGlobalMode(mode)"
        />
        <span>{{ getGlobalModeLabel(mode) }}</span>
      </label>
    </div>
    <div
      v-if="nearbyOptions"
      class="line-map-display-panel__nearby-options"
    >
      <label v-if="hideLongWaitTransports !== undefined">
        <input
          data-hide-long-wait-transports
          type="checkbox"
          :checked="hideLongWaitTransports"
          @change="emit('update:hideLongWaitTransports', ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ t("nearbyStations.hideLongWaitTransports") }}</span>
      </label>
      <label v-if="showNearbyPlaces !== undefined">
        <input
          data-show-nearby-places
          type="checkbox"
          :checked="showNearbyPlaces"
          @change="emit('update:showNearbyPlaces', ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ t("nearbyStations.showNearbyPlaces") }}</span>
      </label>
      <label
        v-if="showNearbyPlaceNames !== undefined"
        :class="{ 'line-map-display-panel__nearby-option--disabled': showNearbyPlaces !== true }"
      >
        <input
          data-show-nearby-place-names
          type="checkbox"
          :checked="showNearbyPlaceNames"
          :disabled="showNearbyPlaces !== true"
          @change="emit('update:showNearbyPlaceNames', ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ t("nearbyStations.showNearbyPlaceNames") }}</span>
      </label>
    </div>
  </div>

  <div v-else class="line-map-display-panel__content">
    <label class="line-map-display-panel__main-toggle">
      <input :checked="modelValue" type="checkbox" @change="updateMainVisibility" />
      <span>{{ t("transfers.title") }}</span>
    </label>

    <div class="line-map-display-panel__modes">
      <label v-for="mode in modes" :key="mode">
        <input
          :checked="visibility[mode]"
          :disabled="isModeDisabled(mode)"
          type="checkbox"
          @change="updateModeVisibility(mode, $event)"
        />
        <span>{{ getModeLabel(mode) }}</span>
      </label>
    </div>
  </div>
</template>

<style scoped>
.line-map-display-panel__content { display: grid; gap: 10px; }
.line-map-display-panel__content--global { min-width: 0; }
.line-map-display-panel__modes--global { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 10px; }
.line-map-display-panel__modes--global label { display: flex; align-items: center; min-width: 0; gap: 7px; color: #334155; font-size: .75rem; font-weight: 750; }
.line-map-display-panel__modes--global input { flex: 0 0 auto; accent-color: #18233f; }
.line-map-display-panel__modes--global span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.line-map-display-panel__nearby-options { border-top: 1px solid rgba(100, 116, 139, .14); display: grid; gap: 8px; padding-top: 9px; }
.line-map-display-panel__nearby-options label { align-items: flex-start; color: #334155; display: flex; font-size: .72rem; font-weight: 750; gap: 7px; line-height: 1.25; }
.line-map-display-panel__nearby-options label.line-map-display-panel__nearby-option--disabled { color: #9aa3b2; }
.line-map-display-panel__nearby-options input { accent-color: #5146ff; flex: 0 0 auto; margin: 1px 0 0; }
.line-map-display-panel__global-preset { justify-self: start; padding: 6px 9px; border: 1px solid rgba(100, 116, 139, .24); border-radius: 8px; background: #18233f; color: #fff; font: inherit; font-size: .7rem; font-weight: 800; cursor: pointer; }
.line-map-display-panel__global-preset:hover,
.line-map-display-panel__global-preset:focus-visible { background: #0e1730; outline: 0; }
</style>
