<template>
  <div
    v-if="markerPosition"
    class="global-map-temporary-marker-overlay"
    data-testid="global-map-temporary-marker-overlay"
  >
    <div
      v-if="radiusStyle"
      class="global-map-temporary-marker__radius"
      data-testid="global-map-temporary-marker-radius"
      :style="radiusStyle"
      aria-hidden="true"
    />
    <div
      class="global-map-temporary-marker"
      :style="markerStyle"
      role="img"
      :aria-label="marker.text"
      :title="marker.text"
    >
      <span class="global-map-temporary-marker__pin" aria-hidden="true">
        <MapPin :size="18" stroke-width="2.4" />
      </span>
      <span v-if="marker.text" class="global-map-temporary-marker__label">{{ marker.text }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { MapPin } from "lucide-vue-next";
import type { CameraState } from "../transport-map/geo/camera";
import {
  lonLatToWorld,
  metersToWorldUnits,
  worldToScreen,
} from "../transport-map/geo/coordinateKernel";
import type { GlobalMapTemporaryMarker } from "./globalMapTemporaryMarker";

const props = defineProps<{
  marker: GlobalMapTemporaryMarker;
  radiusMeters?: number;
  camera: CameraState;
}>();

const markerPosition = computed(() => {
  const world = lonLatToWorld(props.marker);
  return worldToScreen(world, props.camera);
});

const markerStyle = computed<Record<string, string>>(() => ({
  left: `${markerPosition.value.x}px`,
  top: `${markerPosition.value.y}px`,
}));

const radiusStyle = computed<Record<string, string> | undefined>(() => {
  const radiusMeters = props.radiusMeters;
  if (!Number.isFinite(radiusMeters) || (radiusMeters ?? 0) <= 0) return undefined;

  const world = lonLatToWorld(props.marker);
  const radiusWorldUnits = metersToWorldUnits(radiusMeters!, world);
  const edge = worldToScreen({ x: world.x + radiusWorldUnits, y: world.y }, props.camera);
  const radiusPixels = Math.max(1, Math.abs(edge.x - markerPosition.value.x));
  return {
    left: `${markerPosition.value.x - radiusPixels}px`,
    top: `${markerPosition.value.y - radiusPixels}px`,
    width: `${radiusPixels * 2}px`,
    height: `${radiusPixels * 2}px`,
  };
});
</script>

<style scoped>
.global-map-temporary-marker-overlay { inset: 0; overflow: hidden; pointer-events: none; position: absolute; z-index: 5; }
.global-map-temporary-marker__radius { background: rgba(81,70,255,.08); border: 2px dashed rgba(81,70,255,.68); border-radius: 50%; box-sizing: border-box; position: absolute; transform: translateZ(0); }
.global-map-temporary-marker { align-items: center; background: #fff; border: 2px solid #5146ff; border-radius: 999px; box-shadow: 0 7px 16px rgba(15,23,42,.24); color: #4034df; display: inline-flex; gap: 6px; left: 0; max-width: min(260px, calc(100% - 24px)); min-height: 36px; padding: 7px 10px; position: absolute; top: 0; transform: translate(-50%, -100%); white-space: nowrap; }
.global-map-temporary-marker__pin { align-items: center; display: inline-flex; flex: 0 0 auto; }
.global-map-temporary-marker__label { overflow: hidden; text-overflow: ellipsis; }
</style>
