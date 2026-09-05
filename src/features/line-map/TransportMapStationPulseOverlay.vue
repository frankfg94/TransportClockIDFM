<template>
  <div
    v-if="stations.length"
    class="global-transport-plan__station-pulses"
    aria-hidden="true"
  >
    <span
      v-for="station in stations"
      :key="station.id"
      class="global-transport-plan__station-pulse"
      :style="stationStyle(station)"
    >
      <span
        class="global-transport-plan__station-pulse-ring global-transport-plan__station-pulse-ring--delayed"
      />
      <span class="global-transport-plan__station-pulse-ring" />
    </span>
  </div>
</template>

<script setup lang="ts">
import type { GlobalMapLine, GlobalMapStation } from "../transport-map/contracts/manifest";
import type { CameraState } from "../transport-map/geo/camera";
import { worldToScreen } from "../transport-map/geo/coordinateKernel";

const props = withDefaults(
  defineProps<{
    stations: GlobalMapStation[];
    camera: CameraState;
    activeLineId?: string;
    activeLineColor?: string;
    linesById?: ReadonlyMap<string, GlobalMapLine>;
  }>(),
  {
    stations: () => [],
    linesById: () => new Map<string, GlobalMapLine>(),
  },
);

function stationStyle(station: GlobalMapStation): Record<string, string> {
  const screen = worldToScreen({ x: station.worldX, y: station.worldY }, props.camera);
  const focusedLineColor =
    props.activeLineId && station.lineIds.includes(props.activeLineId)
      ? props.activeLineColor
      : undefined;
  const stationLineColor = station.lineIds
    .map((lineId) => props.linesById?.get(lineId)?.color)
    .find((color): color is string => Boolean(color));

  return {
    left: `${screen.x}px`,
    top: `${screen.y}px`,
    "--global-map-station-color": focusedLineColor ?? stationLineColor ?? "#0064ff",
  };
}
</script>

<style scoped>
.global-transport-plan__station-pulses {
  position: absolute;
  z-index: 2;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.global-transport-plan__station-pulse {
  position: absolute;
  width: 24px;
  height: 24px;
  transform: translate(-50%, -50%);
}
.global-transport-plan__station-pulse-ring {
  position: absolute;
  inset: 0;
  border: 2px solid color-mix(in srgb, var(--global-map-station-color, #0064ff), transparent 18%);
  border-radius: 50%;
  background: color-mix(in srgb, var(--global-map-station-color, #0064ff), transparent 78%);
  opacity: 0;
  transform: scale(0.55);
  animation: global-map-station-pulse 2.6s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}
.global-transport-plan__station-pulse-ring--delayed {
  animation-delay: 1.25s;
}
@keyframes global-map-station-pulse {
  0% {
    opacity: 0.52;
    transform: scale(0.55);
  }
  10% {
    opacity: 0.38;
  }
  42% {
    opacity: 0.2;
  }
  100% {
    opacity: 0;
    transform: scale(2.65);
  }
}

@media (prefers-reduced-motion: reduce) {
  .global-transport-plan__station-pulse-ring {
    animation: none;
    opacity: 0.28;
    transform: scale(1.8);
  }
}
</style>
