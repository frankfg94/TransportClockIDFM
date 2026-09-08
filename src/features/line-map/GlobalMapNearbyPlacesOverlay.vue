<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "../../i18n";
import { useNearbyPlacePresenter } from "../nearby-stations/useNearbyPlacePresenter";
import { nearbyPlaceWalkingMinutes } from "../nearby-stations/nearbyPlacePresentation";
import type { NearbyPlace } from "../nearby-stations/nearbyPlaces";
import type { CameraState } from "../transport-map/geo/camera";
import { lonLatToWorld, worldToScreen } from "../transport-map/geo/coordinateKernel";
import PlaceTooltip from "../../components/PlaceTooltip.vue";

const props = defineProps<{
  places: readonly NearbyPlace[];
  camera: CameraState;
}>();

const hoveredPlaceId = ref<string>();
const { t } = useI18n();
const { presentPlace } = useNearbyPlacePresenter();

const displayedPlaces = computed(() => props.places
  .filter((place) => Number.isFinite(place.lon) && Number.isFinite(place.lat))
  .slice(0, 120)
  .map((place) => {
    const point = worldToScreen(lonLatToWorld(place), props.camera);
    const presentation = presentPlace(place);
    const minutes = nearbyPlaceWalkingMinutes(place);
    return {
      place,
      point,
      presentation,
      minutes,
      ariaLabel: t("globalMap.sidebar.nearbyPlaceAria", {
        place: presentation.name,
        minutes,
      }),
    };
  }));
</script>

<template>
  <div
    v-if="displayedPlaces.length"
    class="global-map-nearby-places-overlay"
    data-testid="global-map-nearby-places"
    role="group"
    :aria-label="t('globalMap.sidebar.nearbyPlaces')"
  >
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
      <component :is="entry.presentation.icon" :size="16" stroke-width="2.25" aria-hidden="true" />
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
  width: 30px;
  height: 30px;
  padding: 0;
  border: 2px solid #ffffff;
  border-radius: 50%;
  background: #5146ff;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(15, 23, 42, .24);
  cursor: pointer;
  pointer-events: auto;
  transform: translate(-50%, -50%);
}
.global-map-nearby-place:hover,
.global-map-nearby-place:focus-visible {
  background: #4034df;
  outline: 3px solid rgba(81, 70, 255, .24);
  outline-offset: 2px;
}
</style>
