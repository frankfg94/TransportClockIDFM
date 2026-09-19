<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useI18n } from "../../i18n";
import { useNearbyPlacePresenter } from "../nearby-stations/useNearbyPlacePresenter";
import { isNearbyPlaceVisibleForGlobalLine, nearbyPlaceWalkingMinutes } from "../nearby-stations/nearbyPlacePresentation";
import type { NearbyPlace } from "../nearby-stations/nearbyPlaces";
import type { CameraState } from "../transport-map/geo/camera";
import { lonLatToWorld, worldToScreen } from "../transport-map/geo/coordinateKernel";
import PlaceTooltip from "../../components/PlaceTooltip.vue";

const props = defineProps<{
  places: readonly NearbyPlace[];
  camera: CameraState;
  gpu?: boolean;
  pickPlace?: (x: number, y: number) => NearbyPlace | undefined;
}>();

const hoveredPlaceId = ref<string>();
const { t } = useI18n();
const { presentPlace } = useNearbyPlacePresenter();

const eligiblePlaces = computed(() => props.places
  .filter(isNearbyPlaceVisibleForGlobalLine)
  .filter((place) => Number.isFinite(place.lon) && Number.isFinite(place.lat)));
const preparedPlaces = computed(() => props.gpu ? [] : eligiblePlaces.value
  .map((place) => {
    const presentation = presentPlace(place);
    const minutes = nearbyPlaceWalkingMinutes(place);
    return {
      place,
      world: lonLatToWorld(place),
      presentation,
      minutes,
      ariaLabel: t("globalMap.sidebar.nearbyPlaceAria", {
        place: presentation.name,
        minutes,
      }),
    };
  }));
const displayedPlaces = computed(() => preparedPlaces.value.map(entry => ({
  ...entry, point: worldToScreen(entry.world, props.camera),
})));

const hoveredPlace = shallowRef<NearbyPlace>();
const keyboardIndex = ref(0);
const keyboardFocused = ref(false);
const gpuPlace = computed(() => keyboardFocused.value
  ? eligiblePlaces.value[keyboardIndex.value]
  : hoveredPlace.value ?? eligiblePlaces.value[0]);
const gpuPresentation = computed(() => gpuPlace.value ? presentPlace(gpuPlace.value) : undefined);
const gpuPoint = computed(() => gpuPlace.value ? worldToScreen(lonLatToWorld(gpuPlace.value), props.camera) : undefined);
let pickFrame: number | undefined;
let pointer: { x: number; y: number } | undefined;

function clearHover(): void {
  if (pickFrame !== undefined) cancelAnimationFrame(pickFrame);
  pickFrame = undefined;
  pointer = undefined;
  hoveredPlace.value = undefined;
}
function onPointerMove(event: PointerEvent): void {
  if (!props.gpu) return;
  // The interaction canvas is above MapLibre. Forward its hover explicitly;
  // never run a GPU readback while dragging or hovering sidebar controls.
  if (event.buttons || !(event.target instanceof HTMLCanvasElement)) {
    clearHover();
    return;
  }
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  if (pickFrame !== undefined) return;
  pickFrame = requestAnimationFrame(() => {
    pickFrame = undefined;
    if (pointer) hoveredPlace.value = props.pickPlace?.(pointer.x, pointer.y);
  });
}
function onKeyboard(event: KeyboardEvent): void {
  const count = eligiblePlaces.value.length;
  if (!count) return;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") keyboardIndex.value = (keyboardIndex.value + 1) % count;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") keyboardIndex.value = (keyboardIndex.value + count - 1) % count;
  else if (event.key === "Home") keyboardIndex.value = 0;
  else if (event.key === "End") keyboardIndex.value = count - 1;
  else return;
  event.preventDefault();
  event.stopPropagation();
}
watch(() => props.camera, clearHover);
watch(eligiblePlaces, () => { clearHover(); keyboardIndex.value = 0; });
onBeforeUnmount(clearHover);
defineExpose({ onPointerMove, clearHover });
</script>

<template>
  <div
    v-if="eligiblePlaces.length"
    class="global-map-nearby-places-overlay"
    data-testid="global-map-nearby-places"
    role="group"
    :aria-label="t('globalMap.sidebar.nearbyPlaces')"
  >
    <!-- One keyboard target/tooltip; every visible marker is drawn by Deck. -->
    <button
      v-if="gpu && gpuPlace && gpuPresentation && gpuPoint"
      class="global-map-nearby-place global-map-nearby-place--gpu"
      :class="{ 'global-map-nearby-place--inactive': !keyboardFocused && !hoveredPlace }"
      :style="{ left: `${gpuPoint.x}px`, top: `${gpuPoint.y}px` }"
      type="button"
      :aria-label="t('globalMap.sidebar.nearbyPlaceAria', { place: gpuPresentation.name, minutes: nearbyPlaceWalkingMinutes(gpuPlace) })"
      @focus="keyboardFocused = true"
      @blur="keyboardFocused = false"
      @keydown="onKeyboard"
    >
      <PlaceTooltip
        v-if="keyboardFocused || hoveredPlace"
        :place="gpuPlace"
        :type-label="gpuPresentation.typeLabel"
        :walking-minutes="nearbyPlaceWalkingMinutes(gpuPlace)"
      />
    </button>
    <button
      v-for="entry in displayedPlaces"
      :key="entry.place.id"
      class="global-map-nearby-place"
      :style="{ left: `${entry.point.x}px`, top: `${entry.point.y}px` }"
      type="button"
      :aria-label="entry.ariaLabel"
      @focus="hoveredPlaceId = entry.place.id"
      @blur="hoveredPlaceId = undefined"
      @mouseenter="hoveredPlaceId = entry.place.id"
      @mouseleave="hoveredPlaceId = undefined"
    >
      <span class="global-map-nearby-place__icon" aria-hidden="true">
        <component :is="entry.presentation.icon" :size="12" stroke-width="2" />
      </span>
      <PlaceTooltip
        v-if="hoveredPlaceId === entry.place.id"
        :place="entry.place"
        :type-label="entry.presentation.typeLabel"
        :walking-minutes="entry.minutes"
      />
    </button>
  </div>
</template>

<style scoped>
.global-map-nearby-places-overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  overflow: hidden;
  pointer-events: none;
}
.global-map-nearby-place {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #4b5563;
  cursor: pointer;
  pointer-events: auto;
  transform: translate(-50%, -50%);
  transition: transform 140ms ease;
}
.global-map-nearby-place__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  aspect-ratio: 1;
  box-sizing: border-box;
  border: 1px solid rgba(100, 116, 139, .2);
  border-radius: 50%;
  background: #e7e9ee;
  box-shadow: 0 3px 8px rgba(15, 23, 42, .16);
  color: inherit;
}
.global-map-nearby-place:hover,
.global-map-nearby-place:focus-visible {
  outline: 2px solid rgba(100, 116, 139, .28);
  outline-offset: 2px;
  transform: translate(-50%, -50%) scale(1.04);
}
.global-map-nearby-place:hover .global-map-nearby-place__icon,
.global-map-nearby-place:focus-visible .global-map-nearby-place__icon {
  background: #dde1e7;
}
.global-map-nearby-place--gpu { pointer-events: none; }
.global-map-nearby-place--inactive { opacity: 0; }
</style>
