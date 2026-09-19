<script setup lang="ts">
import { computed } from "vue";
import type { CameraState } from "../transport-map/geo/camera";
import {
  lonLatToWorld,
  worldToScreen,
} from "../transport-map/geo/coordinateKernel";
import type { GlobalMapDistanceMeasurementOverlayItem } from "./globalMapDistanceMeasurement";

interface MeasurementProjection {
  item: GlobalMapDistanceMeasurementOverlayItem;
  start: { x: number; y: number };
  end: { x: number; y: number };
  radius: number;
  midpoint: { x: number; y: number };
  label: { x: number; y: number };
}

const props = defineProps<{
  measurements: readonly GlobalMapDistanceMeasurementOverlayItem[];
  camera: CameraState;
}>();

const emit = defineEmits<{
  "context-menu": [measurementId: number, event: MouseEvent];
}>();

const contextMenuHitAreasEnabled = computed(() =>
  !props.measurements.some((measurement) => measurement.active),
);

const projections = computed<MeasurementProjection[]>(() => props.measurements.flatMap((item) => {
  const start = worldToScreen(lonLatToWorld(item.start), props.camera);
  const end = worldToScreen(lonLatToWorld(item.end), props.camera);
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return [];

  const radius = Math.hypot(end.x - start.x, end.y - start.y);
  const midpoint = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };

  return [{
    item,
    start,
    end,
    radius,
    midpoint,
    label: item.shape === "circle" ? end : midpoint,
  }];
}));

function onMeasurementContextMenu(measurementId: number, event: MouseEvent): void {
  emit("context-menu", measurementId, event);
}
</script>

<template>
  <svg
    v-if="projections.length"
    class="global-map-distance-measurement"
    data-testid="global-map-distance-measurement"
    :data-active="projections.some((projection) => projection.item.active) ? 'true' : 'false'"
    :data-shape="projections.length === 1 ? projections[0]?.item.shape : 'multiple'"
    :viewBox="`0 0 ${camera.viewportWidthCssPx} ${camera.viewportHeightCssPx}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <g
      v-for="projection in projections"
      :key="projection.item.id"
      class="global-map-distance-measurement__item"
      :data-measurement-id="projection.item.id"
      :data-shape="projection.item.shape"
      :data-active="projection.item.active ? 'true' : 'false'"
    >
      <template v-if="projection.item.shape === 'circle'">
        <circle
          class="global-map-distance-measurement__circle-underlay"
          :cx="projection.start.x"
          :cy="projection.start.y"
          :r="projection.radius"
        />
        <circle
          class="global-map-distance-measurement__circle"
          :class="{ 'global-map-distance-measurement__circle--active': projection.item.active }"
          :cx="projection.start.x"
          :cy="projection.start.y"
          :r="projection.radius"
        />
        <circle
          class="global-map-distance-measurement__hit-area"
          :class="{ 'global-map-distance-measurement__hit-area--enabled': contextMenuHitAreasEnabled }"
          :cx="projection.start.x"
          :cy="projection.start.y"
          :r="Math.max(projection.radius, 1)"
          @contextmenu.stop.prevent="onMeasurementContextMenu(projection.item.id, $event)"
        />
      </template>
      <template v-else>
        <line
          class="global-map-distance-measurement__underlay"
          :x1="projection.start.x"
          :y1="projection.start.y"
          :x2="projection.end.x"
          :y2="projection.end.y"
        />
        <line
          class="global-map-distance-measurement__line"
          :class="{ 'global-map-distance-measurement__line--active': projection.item.active }"
          :x1="projection.start.x"
          :y1="projection.start.y"
          :x2="projection.end.x"
          :y2="projection.end.y"
        />
        <line
          class="global-map-distance-measurement__hit-area"
          :class="{ 'global-map-distance-measurement__hit-area--enabled': contextMenuHitAreasEnabled }"
          :x1="projection.start.x"
          :y1="projection.start.y"
          :x2="projection.end.x"
          :y2="projection.end.y"
          @contextmenu.stop.prevent="onMeasurementContextMenu(projection.item.id, $event)"
        />
      </template>
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
      <g
        v-if="projection.item.distanceLabel"
        class="global-map-distance-measurement__label-group"
        :transform="`translate(${projection.label.x} ${projection.label.y})`"
      >
        <rect class="global-map-distance-measurement__label-bg" x="-42" y="-17" width="84" height="30" rx="15" />
        <text class="global-map-distance-measurement__label" x="0" y="4" text-anchor="middle">{{ projection.item.distanceLabel }}</text>
      </g>
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
  z-index: 6;
}
.global-map-distance-measurement__item {
  pointer-events: none;
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
.global-map-distance-measurement__circle-underlay {
  fill: none;
  stroke: rgba(255, 255, 255, .95);
  stroke-width: 10;
}
.global-map-distance-measurement__circle {
  fill: rgba(81, 70, 255, .08);
  stroke: #5146ff;
  stroke-width: 5;
}
.global-map-distance-measurement__circle--active {
  stroke-dasharray: 2 6;
}
.global-map-distance-measurement__hit-area {
  fill: none;
  pointer-events: none;
  stroke: transparent;
  stroke-linecap: round;
  stroke-width: 18;
}
.global-map-distance-measurement__hit-area--enabled {
  pointer-events: stroke;
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
