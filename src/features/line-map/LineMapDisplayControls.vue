<script setup lang="ts">
import type {
  GhostNetworkModeKey,
  GhostNetworkModeVisibility,
  GhostNetworkScope,
} from "../network-ghost";
import { useI18n } from "../../i18n";

const props = defineProps<{
  modelValue: boolean;
  visibility: GhostNetworkModeVisibility;
  ghostNetworkScope: GhostNetworkScope;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  "update:visibility": [value: GhostNetworkModeVisibility];
}>();
const { t } = useI18n();

const modes: GhostNetworkModeKey[] = [
  "bus",
  "metro",
  "tram",
  "noctilien",
  "rer",
];

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

  return mode === "bus" ? "Bus" : "Noctilien";
}
</script>

<template>
  <div class="line-map-display-panel__content">
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
