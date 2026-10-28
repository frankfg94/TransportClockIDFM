<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "../../i18n";
import type { NearbyPlace } from "../nearby-stations/nearbyPlaces";
import { isNearbyPlaceVisibleForGlobalLine, nearbyPlaceWalkingMinutes } from "../nearby-stations/nearbyPlacePresentation";
import { useNearbyPlacePresenter } from "../nearby-stations/useNearbyPlacePresenter";

const props = defineProps<{ places: readonly NearbyPlace[] }>();
const { t } = useI18n();
const { presentPlace } = useNearbyPlacePresenter();
const list = ref<HTMLUListElement>();
const scrollTop = ref(0);
const rowHeight = 40;
const viewportHeight = 280;
const overscan = 3;
const places = computed(() => props.places.filter(isNearbyPlaceVisibleForGlobalLine));
const start = computed(() => Math.max(0, Math.min(
  Math.floor(scrollTop.value / rowHeight) - overscan,
  Math.max(0, places.value.length - Math.ceil(viewportHeight / rowHeight)),
)));
const end = computed(() => Math.min(places.value.length, start.value + Math.ceil(viewportHeight / rowHeight) + overscan * 2));
// Only visible rows need translations, walking labels and Vue/Lucide nodes.
const entries = computed(() => places.value.slice(start.value, end.value).map(place => ({
  place, presentation: presentPlace(place), minutes: nearbyPlaceWalkingMinutes(place),
})));
watch(() => props.places, () => {
  scrollTop.value = 0;
  if (list.value) list.value.scrollTop = 0;
});
</script>

<template>
  <ul
    ref="list"
    class="global-map-picker-sidebar__nearby-list"
    :style="{ height: `${Math.min(viewportHeight, places.length * rowHeight)}px` }"
    tabindex="0"
    :aria-label="t('globalMap.sidebar.nearbyPlaces')"
    @scroll="scrollTop = ($event.target as HTMLElement).scrollTop"
  >
    <li v-if="start" aria-hidden="true" class="nearby-list-spacer" :style="{ height: `${start * rowHeight}px` }" />
    <li v-for="(entry, index) in entries" :key="entry.place.id" :aria-posinset="start + index + 1" :aria-setsize="places.length" class="nearby-list-row">
      <span class="nearby-list-icon" aria-hidden="true"><component :is="entry.presentation.icon" :size="12" stroke-width="2" /></span>
      <span class="nearby-list-label">
        <strong>{{ entry.presentation.name }}</strong>
        <small>{{ entry.presentation.typeLabel }} · {{ t('nearbyStations.walkingTime', { minutes: entry.minutes }) }}</small>
      </span>
    </li>
    <li v-if="end < places.length" aria-hidden="true" class="nearby-list-spacer" :style="{ height: `${(places.length - end) * rowHeight}px` }" />
  </ul>
</template>

<style scoped>
.global-map-picker-sidebar__nearby-list { margin: 0; padding: 0; list-style: none; overflow-y: auto; overscroll-behavior: contain; }
.global-map-picker-sidebar__nearby-list:focus-visible { outline: 2px solid var(--idfm-blue); outline-offset: 2px; }
.nearby-list-row { display: grid; grid-template-columns: 26px minmax(0, 1fr); align-items: center; gap: 7px; height: 40px; box-sizing: border-box; color: var(--muted); }
.nearby-list-icon { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: 1px solid var(--border); border-radius: 50%; background: var(--surface-muted); }
.nearby-list-label { display: grid; min-width: 0; }
strong, small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
strong { color: var(--ink); font-size: .72rem; }
small { color: var(--muted); font-size: .62rem; }
.nearby-list-spacer { pointer-events: none; }
</style>
