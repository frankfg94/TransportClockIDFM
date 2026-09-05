<script setup lang="ts">
import { computed } from "vue";
import type { CameraState } from "../transport-map/geo/camera";
import { lonLatToWorld, worldToScreen } from "../transport-map/geo/coordinateKernel";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import { resolveGlobalMapMarkerIcon } from "./globalMapMarkerIcons";
import type { GlobalMapMarker } from "./globalMapMarkers";

const props = defineProps<{
  markers: readonly GlobalMapMarker[];
  selectedPlace?: GeocoderPoint;
  camera: CameraState;
  reduceMotion?: boolean;
}>();

const emit = defineEmits<{
  "marker-context-menu": [marker: GlobalMapMarker, event: MouseEvent];
  "place-context-menu": [place: GeocoderPoint, event: MouseEvent];
  wheel: [event: WheelEvent];
}>();

function position(point: Pick<GeocoderPoint, "lon" | "lat">): Record<string, string> {
  const world = lonLatToWorld(point);
  const screen = worldToScreen(world, props.camera);
  return { left: `${screen.x}px`, top: `${screen.y}px` };
}

function markerStyle(marker: GlobalMapMarker): Record<string, string> {
  return {
    ...position(marker),
    "--global-map-marker-color": marker.color ?? "#5146ff",
  };
}

const selectedPlacePosition = computed(() => props.selectedPlace ? position(props.selectedPlace) : undefined);
const visibleMarkers = computed(() => props.markers.filter((marker) => !marker.isHidden));
const compactMarkers = computed(() => props.camera.zoom < 11);
</script>

<template>
  <div
    class="global-map-markers-overlay"
    :class="{
      'global-map-markers-overlay--compact': compactMarkers,
      'global-map-markers-overlay--reduce-motion': reduceMotion,
    }"
    aria-live="polite"
    @wheel="emit('wheel', $event)"
  >
    <button
      v-for="marker in visibleMarkers"
      :key="marker.id"
      class="global-map-marker"
      :class="{ 'global-map-marker--compact': compactMarkers }"
      :style="markerStyle(marker)"
      type="button"
      :aria-label="marker.name"
      :title="marker.address ? `${marker.name} · ${marker.address}` : marker.name"
      @contextmenu.prevent.stop="emit('marker-context-menu', marker, $event)"
    >
      <component :is="resolveGlobalMapMarkerIcon(marker.icon)" :size="18" aria-hidden="true" />
      <span class="global-map-marker__label">{{ marker.name }}</span>
    </button>
    <button
      v-if="selectedPlace && selectedPlacePosition"
      class="global-map-marker global-map-marker--search-place"
      :class="{ 'global-map-marker--compact': compactMarkers }"
      :style="selectedPlacePosition"
      type="button"
      :aria-label="selectedPlace.label ?? 'Place sélectionné'"
      :title="selectedPlace.label"
      @contextmenu.prevent.stop="emit('place-context-menu', selectedPlace, $event)"
    >
      <component :is="resolveGlobalMapMarkerIcon('pin')" :size="18" aria-hidden="true" />
      <span class="global-map-marker__label">{{ selectedPlace.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.global-map-markers-overlay { inset: 0; pointer-events: none; position: absolute; z-index: 4; }
.global-map-marker { align-items: center; background: #fff; border: 2px solid var(--global-map-marker-color, #5146ff); border-radius: 999px; box-shadow: 0 7px 16px rgba(15,23,42,.24); box-sizing: border-box; color: var(--global-map-marker-color, #4034df); display: inline-flex; gap: 6px; left: 0; max-width: 190px; min-height: 36px; padding: 7px 10px; pointer-events: auto; position: absolute; top: 0; transform: translate(-50%, -100%); transform-origin: 50% 100%; transition: background-color 140ms ease, box-shadow 140ms ease, outline-color 140ms ease, transform 140ms ease, gap 180ms ease, padding 180ms ease; white-space: nowrap; will-change: transform; }
button.global-map-marker:hover:not(:disabled), button.global-map-marker:focus-visible { background: color-mix(in srgb, var(--global-map-marker-color, #5146ff) 10%, #fff); outline: 3px solid color-mix(in srgb, var(--global-map-marker-color, #5146ff) 24%, transparent); outline-offset: 2px; transform: translate(-50%, -100%) scale(1.06); }
.global-map-marker__label { max-width: 132px; overflow: hidden; text-overflow: ellipsis; transition: max-width 180ms ease, opacity 140ms ease, transform 180ms ease; }
.global-map-marker--compact { gap: 0; padding-left: 7px; padding-right: 7px; }
.global-map-marker--compact .global-map-marker__label { max-width: 0; opacity: 0; transform: translateX(-4px); }
.global-map-marker--search-place { border-color: #c2410c; color: #c2410c; transform: translate(-50%, -50%); transform-origin: 50% 50%; }
button.global-map-marker--search-place:hover:not(:disabled), button.global-map-marker--search-place:focus-visible { transform: translate(-50%, -50%) scale(1.06); }
.global-map-markers-overlay--reduce-motion .global-map-marker,
.global-map-markers-overlay--reduce-motion .global-map-marker__label { transition-duration: 0ms; }
@media (prefers-reduced-motion: reduce) {
  .global-map-marker,
  .global-map-marker__label { transition-duration: 0ms; }
}
</style>
