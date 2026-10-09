<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { navitiaRetryAt } from "../../services/navitiaRateLimit";
import { useRoute, useRouter } from "#imports";
import { ArrowLeft, Gauge } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import { createNearbyDataProviders } from "../../services/nearbyDataProviders";
import { getNearbyWalkingRoute } from "../../services/nearbyWalkingRoutes";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import { fetchGpeStations } from "../transport-map/gpeStationsApi";
import AdressBook from "../address-book/AdressBook.vue";
import { toAddressBookPoint, useAddressBook, type AddressBookEntry } from "../address-book/addressBook";
import {
  NEARBY_RADIUS_DEFAULT_METERS,
  NEARBY_SUPPORTED_MODES,
} from "./nearbyStations";
import type { NearbyPlace } from "./nearbyPlaces";
import type { PublicFutureGpeStation } from "./neighborhoodVerdictApi";
import { resolveNearbyPlaceGroupId } from "./nearbyPlacePresentation";
import { readNearbyNeighborhoodScoreSnapshot } from "./nearbyNeighborhoodScoreSnapshot";
import { useNearbyNeighborhoodScore } from "./useNearbyNeighborhoodScore";
import { useServiceQuality } from "./useServiceQuality";
import { useNearbyHeavyTransports } from "./useNearbyHeavyTransports";
import { useNearbyStations } from "./useNearbyStations";
import { useNearbyWalkingRoutes } from "./useNearbyWalkingRoutes";
import { useTravelRoutes } from "./useTravelRoutes";
import NearbyNeighborhoodScoreCard from "./NearbyNeighborhoodScoreCard.vue";
import NearbyRealEstateVerdict from "./NearbyRealEstateVerdict.vue";
import {
  getNearbyNightJourneyDateTime,
  getNearbyWorkdayJourneyDateTime,
} from "./nearbyHeavyTransports";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const addressBook = useAddressBook();

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
  // This page needs the complete station catalog for non-local benchmarks
  // (metro, rail, and future-project access) and keeps that choice explicit.
  stationCatalog: "full",
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
const serviceQuality = useServiceQuality();
const journeyDateTime = getNearbyWorkdayJourneyDateTime();
const nightJourneyDateTime = getNearbyNightJourneyDateTime();
const futureProjects = ref<PublicFutureGpeStation[]>([]);
const futureProjectsReady = ref(false);
const backendFutureProjects = ref<PublicFutureGpeStation[]>([]);
const gpeCatalogProjects = ref<PublicFutureGpeStation[]>([]);
const backendFutureProjectsReady = ref(false);
const gpeCatalogReady = ref(false);

function updateFutureProjectTargets(): void {
  const projectsById = new Map<string, PublicFutureGpeStation>();
  for (const project of gpeCatalogProjects.value) projectsById.set(project.id, project);
  for (const project of backendFutureProjects.value) {
    projectsById.set(project.id, { ...projectsById.get(project.id), ...project });
  }
  futureProjects.value = [...projectsById.values()];
  futureProjectsReady.value = gpeCatalogReady.value || backendFutureProjectsReady.value;
}
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
  signal?: AbortSignal,
) => getNearbyWalkingRoute({
  id: `station:${destination.lat.toFixed(5)}:${destination.lon.toFixed(5)}`,
  origin,
  destination,
}, signal);
const heavy = useNearbyHeavyTransports({
  origin: nearby.selectedPlace,
  network: nearby.transportMapNetwork,
  stations: nearby.visibleStations,
  activeModes: nearby.activeModes,
  radius: nearby.radius,
  futureProjects,
  futureProjectsReady,
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
  walkingRoutesLoading: nearbyWalking.isLoadingPlaces,
  serviceQualityLoading: serviceQuality.isLoading,
  failedCriteria: computed(() => [
    ...(nearby.error?.value || heavy.error.value || serviceQuality.error.value ? ["transport" as const] : []),
    ...(nearbyWalking.error.value ? ["daily-life", "nature-leisure", "health", "education"] as const : []),
  ]),
  walkingRoutes: nearbyWalking.placeRoutes,
  heavyCandidates: heavy.visibleCandidates,
  heavyCandidatesLoading: heavy.isLoading,
  placesProvider: nearbyDataProviders.places,
  travelRoutesProvider: journeyProvider,
  journeyProbe: routeComposer,
  nightJourneyDateTime,
  serviceQuality: serviceQuality.data,
  initialSnapshot: readNearbyNeighborhoodScoreSnapshot(initialOrigin),
});

// Use the complete official GPE catalog for transit routing. The point verdict
// only includes a small pedestrian-search radius, which misses stations that
// are reachable by a short multi-line public-transport journey.
watch(
  () => score.backendVerdict?.value?.futureProjects,
  (next) => {
    backendFutureProjects.value = (next ?? []).filter((project) => project.projectStatus !== "open");
    updateFutureProjectTargets();
  },
  { immediate: true, deep: true, flush: "post" },
);
watch(
  () => score.backendVerdictReady?.value ?? true,
  (ready) => {
    backendFutureProjectsReady.value = ready;
    if (!ready) backendFutureProjects.value = [];
    updateFutureProjectTargets();
  },
  { immediate: true, flush: "post" },
);
watch(
  () => [nearby.selectedPlace.value?.lon, nearby.selectedPlace.value?.lat] as const,
  () => {
    backendFutureProjects.value = [];
    backendFutureProjectsReady.value = false;
    updateFutureProjectTargets();
  },
  { flush: "post" },
);

onMounted(() => {
  void fetchGpeStations()
    .then((stations) => {
      gpeCatalogProjects.value = stations
        .filter((station) => station.projectStatus !== "open")
        .map((station) => ({ ...station }));
    })
    .catch(() => {
      gpeCatalogProjects.value = [];
    })
    .finally(() => {
      gpeCatalogReady.value = true;
      updateFutureProjectTargets();
    });
});

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
const realEstateOrigin = computed(() => {
  const origin = nearby.selectedPlace.value ?? initialOrigin;
  return origin ? { lon: origin.lon, lat: origin.lat } : undefined;
});
const realEstateRadiusMeters = computed(() => nearby.radius.value);
const workplaceLabel = computed(() => {
  const workplace = addressBook.workplaceAddress.value;
  return workplace?.name || workplace?.address || undefined;
});
const nearbyUrl = computed(() => createNearbyUrl(nearby.selectedPlace.value ?? initialOrigin));
const directoryUrl = computed(() => {
  const url = createNearbyUrl(nearby.selectedPlace.value ?? initialOrigin);
  return url === "/nearby-stations" ? url : `${url}&annuary=`;
});
const addressBookOpen = ref(false);
type ScoreRetrySource = "stations" | "places" | "routes" | "verdict" | "timetables" | "walking" | "heavy" | "service-quality";

const scoreLoading = computed(() => Boolean(initialOrigin && (
  nearby.isScanning.value
  || score.isLoading.value
  || heavy.isLoading.value
  || nearbyWalking.isLoadingPlaces.value
  || serviceQuality.isLoading.value
)));
const scoreProgress = computed(() => {
  const datasets = score.criteria.value.flatMap((criterion) => criterion.datasets);
  return {
    completed: datasets.filter((dataset) => dataset.status !== "loading").length,
    total: datasets.length,
  };
});
const scoreProgressLabel = computed(() => t("nearbyStations.neighborhoodScore.loadingProgress", scoreProgress.value));
const failedSource = computed<ScoreRetrySource | undefined>(() => {
  if (nearby.error?.value) return "stations";
  if (heavy.error.value) return "heavy";
  if (score.errorSource?.value === "routes") return "routes";
  if (score.errorSource?.value === "timetables") return "timetables";
  if (score.errorSource?.value === "places") return "places";
  if (score.errorSource?.value === "verdict") return "verdict";
  if (nearbyWalking.error.value) return "walking";
  if (serviceQuality.error.value) return "service-quality";
  return score.error.value ? "routes" : undefined;
});
const retryingSource = ref<ScoreRetrySource>();
const retryClock = ref(Date.now());
let retryTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { retryTimer = setInterval(() => { retryClock.value = Date.now(); }, 1000); });
onBeforeUnmount(() => { clearInterval(retryTimer); });
const retrySeconds = computed(() => Math.max(0, Math.ceil((navitiaRetryAt.value - retryClock.value) / 1000)));
const scoreError = computed(() => {
  if ([heavy.error.value, score.error.value?.message].some((message) => message && /\b429\b/u.test(message))) {
    if (retrySeconds.value >= 3600) return t("nearbyStations.neighborhoodScore.partialErrorRateLimitCountdownHours", {
      hours: Math.floor(retrySeconds.value / 3600), minutes: Math.floor(retrySeconds.value % 3600 / 60),
      seconds: String(retrySeconds.value % 60).padStart(2, "0"),
    });
    if (retrySeconds.value > 0) return t("nearbyStations.neighborhoodScore.partialErrorRateLimitCountdown", {
      minutes: Math.floor(retrySeconds.value / 60), seconds: String(retrySeconds.value % 60).padStart(2, "0"),
    });
    return t("nearbyStations.neighborhoodScore.partialErrorRateLimit");
  }
  if (score.error.value?.name === "TimeoutError" && failedSource.value === score.errorSource.value) {
    return t("nearbyStations.neighborhoodScore.partialErrorTimeout", { seconds: 45 });
  }
  if (nearby.error?.value) {
    return t("nearbyStations.neighborhoodScore.partialErrorStations");
  }
  if (heavy.error.value || score.errorSource?.value === "routes") {
    return heavy.error.value
      ? t("nearbyStations.neighborhoodScore.partialErrorHeavy")
      : t("nearbyStations.neighborhoodScore.partialErrorRoutes");
  }
  if (score.errorSource?.value === "places") {
    return t("nearbyStations.neighborhoodScore.partialErrorPlaces");
  }
  if (score.errorSource?.value === "timetables") {
    return t("nearbyStations.neighborhoodScore.partialErrorTimetables");
  }
  if (score.errorSource?.value === "verdict") {
    return t("nearbyStations.neighborhoodScore.partialErrorVerdict");
  }
  if (nearbyWalking.error.value) {
    return t("nearbyStations.neighborhoodScore.partialErrorWalking");
  }
  if (serviceQuality.error.value) {
    return t("nearbyStations.neighborhoodScore.partialErrorServiceQuality");
  }
  return score.error.value ? t("nearbyStations.neighborhoodScore.partialError") : undefined;
});

async function retryFailedSource(): Promise<void> {
  if (retrySeconds.value > 0) return;
  const source = failedSource.value;
  if (!source || retryingSource.value) return;
  retryingSource.value = source;
  try {
    if (source === "stations") {
      await nearby.scanNearbyStations();
    } else if (source === "places" || source === "routes" || source === "verdict" || source === "timetables") {
      // The score composable keeps successful origin-scoped responses in
      // memory, so this retries failed score work without reloading the page.
      await score.refresh();
    } else if (source === "heavy") {
      await heavy.refresh();
    } else if (source === "service-quality") {
      await serviceQuality.retry();
    } else {
      nearbyWalking.clear();
      const origin = nearby.selectedPlace.value;
      const places = selectWalkingPlaces(score.places.value);
      if (origin && places.length > 0) {
        await nearbyWalking.loadPlaceMetricsForGroup(origin, places, "neighborhood-score");
      }
    }
  } finally {
    if (retryingSource.value === source) retryingSource.value = undefined;
  }
}

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
  <main class="nearby-neighborhood-score-page" :aria-busy="scoreLoading">
    <div
      v-if="scoreLoading"
      class="nearby-neighborhood-score-page__loading-bar"
      role="progressbar"
      :aria-label="t('nearbyStations.neighborhoodScore.loadingBar')"
      :aria-valuemin="0"
      :aria-valuemax="scoreProgress.total"
      :aria-valuenow="scoreProgress.completed"
      :aria-valuetext="scoreProgressLabel"
    ><span :style="{ width: `${scoreProgress.total ? 100 * scoreProgress.completed / scoreProgress.total : 0}%` }" /></div>
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
      :education-places="score.places.value"
      :education-walking-routes="nearbyWalking.placeRoutes.value"
      :origin-label="originLabel"
      :workplace-label="workplaceLabel"
      :loading="scoreLoading"
      :progress-label="scoreProgressLabel"
      :error="scoreError"
      :retrying="Boolean(retryingSource)"
      :retry-disabled="retrySeconds > 0"
      :criteria="score.criteria?.value"
      :directory-url="directoryUrl"
      @change-origin="openAddressSelector"
      @retry-source="retryFailedSource"
    />
    <NearbyRealEstateVerdict
      v-if="initialOrigin"
      :origin="realEstateOrigin"
      :radius-meters="realEstateRadiusMeters"
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
.nearby-neighborhood-score-page__loading-bar { background: rgba(81,70,255,.12); height: 2px; left: 0; overflow: hidden; pointer-events: none; position: fixed; right: 0; top: 0; z-index: 1100; }
.nearby-neighborhood-score-page__loading-bar span { background: #5146ff; height: 100%; left: 0; position: absolute; transition: width 200ms ease; }
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
@media (prefers-reduced-motion: reduce) {
  .nearby-neighborhood-score-page__loading-bar span { transition: none; }
}
</style>
