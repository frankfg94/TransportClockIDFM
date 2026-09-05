<script setup lang="ts">
import { computed } from "vue";
import type { CameraState } from "../transport-map/geo/camera";
import {
  lonLatToWorld,
  worldToScreen,
} from "../transport-map/geo/coordinateKernel";
import type { LonLatPoint } from "../transport-map/geo/coordinateKernel";

const props = defineProps<{
  start?: LonLatPoint;
  end?: LonLatPoint;
  camera: CameraState;
  distanceLabel?: string;
  active?: boolean;
}>();

const projection = computed(() => {
  if (!props.start || !props.end) return undefined;
  const start = worldToScreen(lonLatToWorld(props.start), props.camera);
  const end = worldToScreen(lonLatToWorld(props.end), props.camera);
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return undefined;

  return {
    start,
    end,
    midpoint: {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    },
  };
});
</script>

<template>
  <svg
    v-if="projection"
    class="global-map-distance-measurement"
    data-testid="global-map-distance-measurement"
    :data-active="active ? 'true' : 'false'"
    :viewBox="`0 0 ${camera.viewportWidthCssPx} ${camera.viewportHeightCssPx}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <line
      class="global-map-distance-measurement__underlay"
      :x1="projection.start.x"
      :y1="projection.start.y"
      :x2="projection.end.x"
      :y2="projection.end.y"
    />
    <line
      class="global-map-distance-measurement__line"
      :class="{ 'global-map-distance-measurement__line--active': active }"
      :x1="projection.start.x"
      :y1="projection.start.y"
      :x2="projection.end.x"
      :y2="projection.end.y"
    />
    <circle
      class="global-map-distance-measurement__point"
      :cx="projection.start.x"
      :cy="projection.start.y"
      r="7"
    />
    <circle
      class="global-map-distance-measurement__point"
      :cx="projection.end.x"
      :cy="projection.end.y"
      r="7"
    />
    <g v-if="distanceLabel" :transform="`translate(${projection.midpoint.x} ${projection.midpoint.y})`">
      <rect class="global-map-distance-measurement__label-bg" x="-42" y="-17" width="84" height="30" rx="15" />
      <text class="global-map-distance-measurement__label" x="0" y="4" text-anchor="middle">{{ distanceLabel }}</text>
    </g>
  </svg>
</template>

<style scoped>
.global-map-distance-measurement {
  inset: 0;
  overflow: visible;
  pointer-events: none;
  position: absolute;
  width: 100%;
  height: 100%;
  z-index: 3;
}
.global-map-distance-measurement__underlay {
  fill: none;
  stroke: rgba(255, 255, 255, .95);
  stroke-linecap: round;
  stroke-width: 10;
}
.global-map-distance-measurement__line {
  fill: none;
  stroke: #5146ff;
  stroke-linecap: round;
  stroke-width: 5;
}
.global-map-distance-measurement__line--active {
  stroke-dasharray: 2 6;
}
.global-map-distance-measurement__point {
  fill: #5146ff;
  stroke: #fff;
  stroke-width: 3;
}
.global-map-distance-measurement__label-bg {
  fill: #fff;
  filter: drop-shadow(0 3px 8px rgba(15, 23, 42, .2));
}
.global-map-distance-measurement__label {
  fill: #18233f;
  font-size: 12px;
  font-weight: 800;
}
</style>

