<script setup lang="ts">
import type {
  GhostNetworkMode,
  GhostNetworkModeVisibility,
  GhostNetworkScope,
} from "../network-ghost";

const props = defineProps<{
  modelValue: boolean;
  visibility: GhostNetworkModeVisibility;
  ghostNetworkScope: GhostNetworkScope;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  "update:visibility": [value: GhostNetworkModeVisibility];
}>();

const modeLabels: Record<GhostNetworkMode, string> = {
  bus: "Bus",
  metro: "Métro",
  tram: "Tramway",
  noctilien: "Noctilien",
  rer: "RER",
};

const modes: GhostNetworkMode[] = ["bus", "metro", "tram", "noctilien", "rer"];

function updateMainVisibility(event: Event): void {
  emit("update:modelValue", (event.target as HTMLInputElement).checked);
}

function updateModeVisibility(mode: GhostNetworkMode, event: Event): void {
  emit("update:visibility", {
    ...props.visibility,
    [mode]: (event.target as HTMLInputElement).checked,
  });
}

function isModeDisabled(mode: GhostNetworkMode): boolean {
  return (
    props.ghostNetworkScope === "structural" &&
    (mode === "bus" || mode === "noctilien")
  );
}
</script>

<template>
  <div class="line-map-display-panel__content">
    <label class="line-map-display-panel__main-toggle">
      <input :checked="modelValue" type="checkbox" @change="updateMainVisibility" />
      <span>Correspondances</span>
    </label>

    <div class="line-map-display-panel__modes">
      <label v-for="mode in modes" :key="mode">
        <input
          :checked="visibility[mode]"
          :disabled="isModeDisabled(mode)"
          type="checkbox"
          @change="updateModeVisibility(mode, $event)"
        />
        <span>{{ modeLabels[mode] }}</span>
      </label>
    </div>
  </div>
</template>
