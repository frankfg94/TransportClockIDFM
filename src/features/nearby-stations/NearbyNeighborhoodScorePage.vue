<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "#imports";
import { ArrowLeft, Gauge } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import { createNearbyDataProviders } from "../../services/nearbyDataProviders";
import { getNearbyWalkingRoute } from "../../services/nearbyWalkingRoutes";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import AdressBook from "../address-book/AdressBook.vue";
import { toAddressBookPoint, type AddressBookEntry } from "../address-book/addressBook";
import {
  NEARBY_RADIUS_DEFAULT_METERS,
  NEARBY_SUPPORTED_MODES,
} from "./nearbyStations";
import type { NearbyPlace } from "./nearbyPlaces";
import type { PublicFutureGpeStation } from "./neighborhoodVerdictApi";
import { resolveNearbyPlaceGroupId } from "./nearbyPlacePresentation";
import { readNearbyNeighborhoodScoreSnapshot } from "./nearbyNeighborhoodScoreSnapshot";
import { useNearbyNeighborhoodScore } from "./useNearbyNeighborhoodScore";
import { useNearbyHeavyTransports } from "./useNearbyHeavyTransports";
import { useNearbyStations } from "./useNearbyStations";
import { useNearbyWalkingRoutes } from "./useNearbyWalkingRoutes";
import { useTravelRoutes } from "./useTravelRoutes";
import NearbyNeighborhoodScoreCard from "./NearbyNeighborhoodScoreCard.vue";
import {
  getNearbyNightJourneyDateTime,
  getNearbyWorkdayJourneyDateTime,
} from "./nearbyHeavyTransports";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

function queryString(value: unknown): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

function queryOrigin(): GeocoderPoint | undefined {
  const lat = Number(queryString(route.query.lat));
  const lon = Number(queryString(route.query.lon));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return undefined;
  }
  const label = queryString(route.query.address);
  return {
    label: label ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    city: queryString(route.query.city),
    lon,
    lat,
    provider: "global-map",
    type: label ? "address" : "unknown",
  };
}

const initialOrigin = queryOrigin();
const nearby = useNearbyStations(initialOrigin ? {
  initialDraft: {
    query: initialOrigin.label ?? "",
    selectedPlace: initialOrigin,
    radius: NEARBY_RADIUS_DEFAULT_METERS,
    activeModes: [...NEARBY_SUPPORTED_MODES],
    selections: [],
  },
} : undefined);
const nearbyDataProviders = createNearbyDataProviders();
const nearbyWalking = useNearbyWalkingRoutes();
const journeyDateTime = getNearbyWorkdayJourneyDateTime();
const nightJourneyDateTime = getNearbyNightJourneyDateTime();
const futureProjects = ref<PublicFutureGpeStation[]>([]);
const routeComposer = useTravelRoutes({
  origin: nearby.selectedPlace,
  travelRoutesProvider: nearbyDataProviders.travelRoutes,
});
const journeyProvider = {
  findJourneys: routeComposer.probeJourneys,
};
const walkingRouteProvider = async (
  origin: { lon: number; lat: number },
  destination: { lon: number; lat: number },
) => getNearbyWalkingRoute({
  id: `station:${destination.lat.toFixed(5)}:${destination.lon.toFixed(5)}`,
  origin,
  destination,
});
const heavy = useNearbyHeavyTransports({
  origin: nearby.selectedPlace,
  network: nearby.transportMapNetwork,
  stations: nearby.visibleStations,
  activeModes: nearby.activeModes,
  radius: nearby.radius,
  futureProjects,
}, {
  journeyProvider,
  journeyDateTime,
  walkingRouteProvider,
  includeLocalCandidates: true,
});
const score = useNearbyNeighborhoodScore({
  origin: nearby.selectedPlace,
  stations: nearby.stations,
  network: nearby.transportMapNetwork,
  journeyDateTime,
  stationsLoading: nearby.isScanning,
  walkingRoutes: nearbyWalking.placeRoutes,
  heavyCandidates: heavy.visibleCandidates,
  heavyCandidatesLoading: heavy.isLoading,
  placesProvider: nearbyDataProviders.places,
  travelRoutesProvider: journeyProvider,
  journeyProbe: routeComposer,
  nightJourneyDateTime,
  initialSnapshot: readNearbyNeighborhoodScoreSnapshot(initialOrigin),
});

// The verdict supplies the official GPE coordinates asynchronously. Feed
// them back into the same heavy resolver used for stations outside the map;
// do not reuse the backend's walking estimate as a transport duration.
watch(
  () => score.backendVerdict?.value?.futureProjects,
  (next) => {
    if (next) futureProjects.value = [...next];
  },
  { immediate: true, deep: true, flush: "post" },
);
watch(
  () => [nearby.selectedPlace.value?.lon, nearby.selectedPlace.value?.lat] as const,
  () => { futureProjects.value = []; },
  { flush: "post" },
);

watch(
  () => [
    nearby.selectedPlace.value?.lon,
    nearby.selectedPlace.value?.lat,
    score.places.value.map((place) => place.id).join(","),
  ] as const,
  () => {
    const origin = nearby.selectedPlace.value;
    const places = selectWalkingPlaces(score.places.value);
    if (origin && places.length > 0) {
      void nearbyWalking.loadPlaceMetricsForGroup(origin, places, "neighborhood-score");
    }
  },
  { immediate: true, flush: "post" },
);

const originLabel = computed(() => formatOriginLabel(nearby.selectedPlace.value ?? initialOrigin));
const nearbyUrl = computed(() => createNearbyUrl(nearby.selectedPlace.value ?? initialOrigin));
const directoryUrl = computed(() => {
  const url = createNearbyUrl(nearby.selectedPlace.value ?? initialOrigin);
  return url === "/nearby-stations" ? url : `${url}&annuary=`;
});
const addressBookOpen = ref(false);
const scoreError = computed(() => score.error.value || heavy.error.value
  ? t("nearbyStations.neighborhoodScore.partialError")
  : undefined);

function openAddressSelector(): void {
  addressBookOpen.value = true;
}

function closeAddressSelector(): void {
  addressBookOpen.value = false;
}

function selectAddress(entry: AddressBookEntry): void {
  const nextOrigin = toAddressBookPoint(entry);
  addressBookOpen.value = false;
  void nearby.selectPlace(nextOrigin);
  void router.replace({ query: originQuery(nextOrigin) });
}

function originQuery(origin: GeocoderPoint): Record<string, string> {
  return {
    lat: String(origin.lat),
    lon: String(origin.lon),
    ...(origin.label ? { address: origin.label } : {}),
    ...(origin.city ? { city: origin.city } : {}),
  };
}

function formatOriginLabel(origin: GeocoderPoint | undefined): string {
  if (!origin) return "";
  const label = origin.label?.trim() ?? "";
  const address = origin.address?.trim() ?? "";
  if (origin.provider === "address-book" && address && label && address !== label) {
    return `${label} · ${address}`;
  }
  return label || address;
}

function createNearbyUrl(origin: GeocoderPoint | undefined): string {
  if (!origin) return "/nearby-stations";
  const params = new URLSearchParams({ lat: String(origin.lat), lon: String(origin.lon) });
  if (origin.label) params.set("address", origin.label);
  if (origin.city) params.set("city", origin.city);
  return `/nearby-stations?${params.toString()}`;
}

function selectWalkingPlaces(places: readonly NearbyPlace[]): NearbyPlace[] {
  // Route every nearby category that can affect the verdict, not only the
  // original shop/culture shortlist. This is what gives sports grounds,
  // tennis clubs, parks and health facilities a real walking duration.
  const preferredGroups = new Set([
    "food-shopping",
    "restaurants-cafes",
    "beauty-health",
    "education",
    "green-spaces",
    "toys-leisure",
    "culture-leisure",
    "attractions",
  ]);
  const preferred = places.filter((place) => preferredGroups.has(resolveNearbyPlaceGroupId(place)));
  const seen = new Set<string>();
  return [...preferred, ...places].filter((place) => {
    if (seen.has(place.id)) return false;
    seen.add(place.id);
    return true;
  });
}
</script>

<template>
  <main class="nearby-neighborhood-score-page">
    <header class="nearby-neighborhood-score-page__hero">
      <div>
        <NuxtLink class="nearby-neighborhood-score-page__back" :to="nearbyUrl">
          <ArrowLeft :size="16" aria-hidden="true" />
          {{ t("nearbyStations.neighborhoodScore.backToNearby") }}
        </NuxtLink>
        <p class="nearby-neighborhood-score-page__eyebrow">
          {{ t("nearbyStations.neighborhoodScore.pageEyebrow") }}
        </p>
        <h1>{{ t("nearbyStations.neighborhoodScore.pageTitle") }}</h1>
        <p>{{ t("nearbyStations.neighborhoodScore.pageSubtitle") }}</p>
        <p v-if="originLabel" class="nearby-neighborhood-score-page__origin">{{ originLabel }}</p>
        <p class="nearby-neighborhood-score-page__journey-reference">
          {{ t("nearbyStations.neighborhoodScore.journeyReference") }}
        </p>
      </div>
      <Gauge class="nearby-neighborhood-score-page__icon" :size="42" aria-hidden="true" />
    </header>

    <section v-if="!initialOrigin" class="nearby-neighborhood-score-page__empty" role="status">
      <Gauge :size="30" aria-hidden="true" />
      <strong>{{ t("nearbyStations.neighborhoodScore.missingOriginTitle") }}</strong>
      <span>{{ t("nearbyStations.neighborhoodScore.missingOriginBody") }}</span>
      <NuxtLink class="nearby-neighborhood-score-page__empty-link" to="/nearby-stations">
        {{ t("nearbyStations.neighborhoodScore.backToNearby") }}
      </NuxtLink>
    </section>

    <NearbyNeighborhoodScoreCard
      v-else
      :result="score.result.value"
      :origin-label="originLabel"
      :loading="score.isLoading.value || heavy.isLoading.value"
      :error="scoreError"
      :directory-url="directoryUrl"
      @change-origin="openAddressSelector"
    />
  </main>
  <AdressBook
    :open="addressBookOpen"
    selection-mode
    @close="closeAddressSelector"
    @select="selectAddress"
  />
</template>

<style scoped>
.nearby-neighborhood-score-page { display: grid; gap: 16px; margin: 0 auto; max-width: 920px; padding: 28px 22px 118px; }
.nearby-neighborhood-score-page__hero { align-items: center; background: linear-gradient(135deg, #f4f2ff, #edf7ff); border: 1px solid rgba(81,70,255,.14); border-radius: 20px; display: flex; justify-content: space-between; overflow: hidden; padding: 24px 26px; }
.nearby-neighborhood-score-page__back { align-items: center; color: #5146ff; display: inline-flex; font-size: .76rem; font-weight: 850; gap: 6px; margin-bottom: 18px; text-decoration: none; }
.nearby-neighborhood-score-page__back:hover, .nearby-neighborhood-score-page__back:focus-visible { color: #4034df; text-decoration: underline; }
.nearby-neighborhood-score-page__eyebrow { color: #5146ff; font-size: .7rem; font-weight: 900; letter-spacing: .1em; margin: 0 0 5px; text-transform: uppercase; }
.nearby-neighborhood-score-page h1 { color: var(--ink); font-size: clamp(1.55rem, 3vw, 2.2rem); margin: 0; }
.nearby-neighborhood-score-page__hero p:not(.nearby-neighborhood-score-page__eyebrow):not(.nearby-neighborhood-score-page__origin) { color: var(--muted); margin: 7px 0 0; max-width: 680px; }
.nearby-neighborhood-score-page__origin { color: var(--ink); font-size: .82rem; font-weight: 800; margin: 9px 0 0; }
.nearby-neighborhood-score-page__journey-reference { color: #5146ff; font-size: .72rem; font-weight: 750; margin: 7px 0 0; }
.nearby-neighborhood-score-page__icon { color: #5146ff; margin-right: 10px; opacity: .8; }
.nearby-neighborhood-score-page__empty { align-items: center; background: linear-gradient(135deg, #f7f7ff, #eef4fa); border: 1px dashed rgba(81,70,255,.3); border-radius: 14px; color: var(--muted); display: flex; flex-direction: column; gap: 8px; justify-content: center; min-height: 280px; padding: 28px; text-align: center; }
.nearby-neighborhood-score-page__empty > svg { color: #5146ff; }
.nearby-neighborhood-score-page__empty strong { color: var(--ink); }
.nearby-neighborhood-score-page__empty-link { background: #5146ff; border-radius: 9px; color: #fff; font-size: .78rem; font-weight: 850; margin-top: 5px; padding: 9px 12px; text-decoration: none; }
.nearby-neighborhood-score-page__empty-link:hover, .nearby-neighborhood-score-page__empty-link:focus-visible { background: #4034df; color: #fff; }
@media (max-width: 680px) {
  .nearby-neighborhood-score-page { padding: 18px 12px 108px; }
  .nearby-neighborhood-score-page__hero { padding: 19px; }
  .nearby-neighborhood-score-page__icon { display: none; }
}
</style>
