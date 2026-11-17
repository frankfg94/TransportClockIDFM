<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "#imports";
import { ArrowLeft, Download, Gauge } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import { createNearbyDataProviders } from "../../services/nearbyDataProviders";
import { toServerApiUrl } from "../../services/serverApi";
import { createGtfsNeighborhoodTravelRoutesProvider } from "../../services/travelRoutes/gtfsNeighborhoodTravelRoutesProvider";
import { fetchNeighborhoodGtfsFrequency, fetchNeighborhoodGtfsLastService } from "../../services/travelRoutes/browserNeighborhoodTimetable";
import { refreshBrowserNeighborhoodGtfsManifest } from "../../services/travelRoutes/browserNeighborhoodGtfs";
import { useVerdictGtfsCalendar } from "../../services/travelRoutes/verdictGtfsCalendar";
import { createNeighborhoodWalkingRoutesProvider } from "../../services/neighborhoodWalkingRoutesProvider";
import { isNeighborhoodGtfsColdStart } from "../../services/travelRoutes/neighborhoodGtfsDebug";
import { beginVerdictDebugTask, isVerdictDebugEnabled, verdictDebugTimeline } from "../../services/verdictDebugTimeline";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import { fetchGpeStations } from "../transport-map/gpeStationsApi";
import { createFutureGpeProjectFilter } from "./futureGpeProjects";
import AdressBook from "../address-book/AdressBook.vue";
import VerdictPersonalJourneys from "./VerdictPersonalJourneys.vue";
import { useVerdictPersonalJourneys } from "./useVerdictPersonalJourneys";
import type { NeighborhoodCriterionState } from "./neighborhood/criterionRegistry";
import { toAddressBookPoint, useAddressBook, type AddressBookEntry } from "../address-book/addressBook";
import {
  NEARBY_RADIUS_DEFAULT_METERS,
  NEARBY_SUPPORTED_MODES,
} from "./nearbyStations";
import type { NearbyPlace } from "./nearbyPlaces";
import type { NeighborhoodFact } from "./neighborhood/contracts";
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
import { transportSectionValues } from "./neighborhood/factPresentation";
import {
  downloadNeighborhoodScorePdf,
  type NearbyRealEstatePdfState,
  type NearbyTrafficPdfState,
  type NeighborhoodScorePdfSection,
} from "./neighborhoodScorePdf";
import { buildVerdictTransportIntegrity, compareVerdictTransportSnapshots } from "./verdictTransportDebug";
import NearbyRealEstateVerdict from "./NearbyRealEstateVerdict.vue";
import NeighborhoodTrafficAnnex from "./NeighborhoodTrafficAnnex.vue";
import { neighborhoodTransportLoadingTasks } from "./neighborhood/transportLoadingTasks";
import {
  getNearbyParisJourneyDateTimeAtTime,
} from "./nearbyHeavyTransports";
import {
  DEFAULT_NEIGHBORHOOD_DAY_DEPARTURE_TIME,
  DEFAULT_NEIGHBORHOOD_NIGHT_DEPARTURE_TIME,
} from "./neighborhood/departureTimes";

const route = useRoute();
const NeighborhoodComparison = defineAsyncComponent(() => import("./neighborhood-comparison/NeighborhoodComparison.vue"));
const router = useRouter();
const { d, n, t } = useI18n();
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
    code: queryString(route.query.code),
    lon,
    lat,
    provider: "global-map",
    type: label ? "address" : "unknown",
  };
}

const initialOrigin = queryOrigin();
const comparisonOpen = ref(queryString(route.query.compare) === "1");
if (isVerdictDebugEnabled()) verdictDebugTimeline.clear();
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
const nearbyWalking = useNearbyWalkingRoutes({ routingPolicy: "ors-only" });
const serviceQuality = useServiceQuality();
const dayDepartureTime = ref(DEFAULT_NEIGHBORHOOD_DAY_DEPARTURE_TIME);
const nightDepartureTime = ref(DEFAULT_NEIGHBORHOOD_NIGHT_DEPARTURE_TIME);
const referenceNow = ref(new Date());
watch([dayDepartureTime, nightDepartureTime], () => { referenceNow.value = new Date(); }, { flush: "sync" });
const requestedDay = computed(() => getNearbyParisJourneyDateTimeAtTime(dayDepartureTime.value, "workday", referenceNow.value));
const requestedNight = computed(() => getNearbyParisJourneyDateTimeAtTime(nightDepartureTime.value, "any-day", referenceNow.value));
const calendar = useVerdictGtfsCalendar(requestedDay, requestedNight);
const { day: journeyDateTime, night: nightJourneyDateTime } = calendar;
const transportBootstrapping = computed(() => nearby.isScanning.value || !calendar.ready.value);
let gtfsRoutes = createGtfsNeighborhoodTravelRoutesProvider();
watch(calendar.version, () => { gtfsRoutes = createGtfsNeighborhoodTravelRoutesProvider(); }, { flush: "sync" });
const nearbyDataProviders = createNearbyDataProviders({ travelRoutes: { findJourneys: (request, signal) => gtfsRoutes.findJourneys(request, signal) } });
const gtfsReference = computed(() => calendar.historical.value ? {
  day: journeyDateTime.value.slice(0, 8), night: nightJourneyDateTime.value.slice(0, 8), timetable: calendar.timetable.value,
} : undefined);
const gtfsWarning = computed(() => {
  const dates = gtfsReference.value;
  if (!dates) return undefined;
  const format = (day: string) => d(new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8), 12)),
    { dateStyle: "medium", timeZone: "Europe/Paris" });
  return t("nearbyStations.neighborhoodScore.historicalGtfs", { day: format(dates.day), night: format(dates.night), timetable: format(dates.timetable) });
});
function restoreDayDepartureTime(): void {
  if (!dayDepartureTime.value) dayDepartureTime.value = DEFAULT_NEIGHBORHOOD_DAY_DEPARTURE_TIME;
}
function restoreNightDepartureTime(): void {
  if (!nightDepartureTime.value) nightDepartureTime.value = DEFAULT_NEIGHBORHOOD_NIGHT_DEPARTURE_TIME;
}
const futureProjects = ref<PublicFutureGpeStation[]>([]);
const futureProjectsReady = ref(false);
const backendFutureProjects = ref<PublicFutureGpeStation[]>([]);
const gpeCatalogProjects = ref<PublicFutureGpeStation[]>([]);
const backendFutureProjectsReady = ref(false);
const gpeCatalogReady = ref(false);

const isFutureGpeProject = computed(() => createFutureGpeProjectFilter(nearby.transportMapNetwork.value));

function updateFutureProjectTargets(): void {
  const projectsById = new Map<string, PublicFutureGpeStation>();
  for (const project of gpeCatalogProjects.value) projectsById.set(project.id, project);
  for (const project of backendFutureProjects.value) {
    projectsById.set(project.id, { ...projectsById.get(project.id), ...project });
  }
  futureProjects.value = [...projectsById.values()].filter(isFutureGpeProject.value);
  futureProjectsReady.value = gpeCatalogReady.value || backendFutureProjectsReady.value;
}
watch(isFutureGpeProject, updateFutureProjectTargets);
const routeComposer = useTravelRoutes({
  origin: nearby.selectedPlace,
  travelRoutesProvider: nearbyDataProviders.travelRoutes,
});
const journeyProvider = {
  findJourneys: routeComposer.probeJourneys,
};
const walkingRouteProvider = createNeighborhoodWalkingRoutesProvider();
const heavy = useNearbyHeavyTransports({
  origin: nearby.selectedPlace,
  network: nearby.transportMapNetwork,
  stations: nearby.visibleStations,
  stationsLoading: transportBootstrapping,
  activeModes: nearby.activeModes,
  radius: nearby.radius,
  futureProjects,
  futureProjectsReady,
}, {
  journeyProvider,
  journeyDateTime,
  gtfsVersion: calendar.version,
  walkingRouteProvider,
  includeLocalCandidates: true,
  batchQueries: true,
  retainAllCandidates: true,
  includeContextAccess: true,
  includeTramTargets: true,
});
const personalJourneys = useVerdictPersonalJourneys({
  origin: nearby.selectedPlace, datetime: journeyDateTime, provider: nearbyDataProviders.travelRoutes,
  gtfsVersion: calendar.version, calendarReady: calendar.ready,
});
const score = useNearbyNeighborhoodScore({
  personalJourneys: personalJourneys.rows,
  fetchFrequency: fetchNeighborhoodGtfsFrequency,
  fetchLastService: fetchNeighborhoodGtfsLastService,
  journeySource: "gtfs",
  documentaryFirst: true,
  walkingPolicy: "ors-only",
  origin: nearby.selectedPlace,
  stations: nearby.stations,
  network: nearby.transportMapNetwork,
  journeyDateTime,
  stationsLoading: transportBootstrapping,
  gtfsVersion: calendar.version,
  calendarReady: calendar.ready,
  timetableDate: calendar.timetable,
  walkingRoutesLoading: nearbyWalking.isLoadingPlaces,
  serviceQualityLoading: serviceQuality.isLoading,
  failedCriteria: computed(() => [
    ...(nearby.error?.value || heavy.error.value || serviceQuality.error.value ? ["transport" as const] : []),
    ...(nearbyWalking.error.value ? ["daily-life", "nature-leisure", "health", "education"] as const : []),
  ]),
  walkingRoutes: nearbyWalking.placeRoutes,
  heavyCandidates: heavy.visibleCandidates,
  heavyCandidatesLoading: heavy.isLoading,
  heavyCandidatesError: heavy.error,
  placesProvider: nearbyDataProviders.places,
  travelRoutesProvider: journeyProvider,
  journeyProbe: routeComposer,
  nightJourneyDateTime,
  journeyDepartureTime: dayDepartureTime,
  nightDepartureTime,
  serviceQuality: serviceQuality.data,
  initialSnapshot: isNeighborhoodGtfsColdStart() ? undefined : readNearbyNeighborhoodScoreSnapshot(initialOrigin),
});
const transportLoadingTasks = computed(() => neighborhoodTransportLoadingTasks({
  pendingTaskIds: score.transportPending?.value ?? [],
  stations: nearby.isScanning.value,
  heavyAccess: heavy.isLoading.value,
  futureProjects: !futureProjectsReady.value,
  serviceQuality: serviceQuality.isLoading.value,
}));
const historicalDatasets = computed(() => {
  const ids = new Set<string>();
  if (journeyDateTime.value !== requestedDay.value) {
    for (const id of ["heavy-access", "gtfs-journeys", "home-work-journey", "personal-journeys"]) ids.add(id);
  }
  if (nightJourneyDateTime.value !== requestedNight.value) ids.add("gtfs-journeys");
  if (calendar.timetable.value !== calendar.requestedTimetable.value) ids.add("gtfs-frequency");
  return ids;
});
const criteriaWithPersonalJourneys = computed<NeighborhoodCriterionState[]>(() => (score.criteria?.value ?? []).map(criterion => criterion.id !== "transport" ? criterion : {
  ...criterion,
  status: personalJourneys.loading.value ? "loading" : personalJourneys.hasError.value || (gtfsReference.value && criterion.status === "ready") ? "degraded" : criterion.status,
  datasets: [...criterion.datasets, ...personalJourneys.datasets.value].map(dataset =>
    dataset.status === "ready" && historicalDatasets.value.has(dataset.id)
      ? { ...dataset, status: "stale" as const } : dataset),
}));
// The dedicated rows retain edit/delete controls even for unavailable journeys.
const cardResult = computed(() => ({ ...score.result.value, categories: score.result.value.categories?.map(category => category.id !== "transport" ? category : {
  ...category,
  positiveFacts: category.positiveFacts.filter(fact => !fact.family.startsWith("personal-journey:")),
  negativeFacts: category.negativeFacts.filter(fact => !fact.family.startsWith("personal-journey:")),
  neutralFacts: category.neutralFacts.filter(fact => !fact.family.startsWith("personal-journey:")),
}) }));

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
  const finish = beginVerdictDebugTask("gpe", "catalogue");
  void fetchGpeStations()
    .then((stations) => {
      gpeCatalogProjects.value = stations
        .filter((station) => station.projectStatus !== "open")
        .map((station) => ({ ...station }));
      finish("ready", { stations: stations.length, futureStations: gpeCatalogProjects.value.length });
    })
    .catch(() => {
      gpeCatalogProjects.value = [];
      finish("error");
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
type ScoreRetrySource = "stations" | "places" | "routes" | "verdict" | "timetables" | "walking" | "heavy" | "service-quality" | "coverage";
const realEstateExportLoading = ref(Boolean(initialOrigin));
const realEstatePdfSection = ref<NeighborhoodScorePdfSection>();
const realEstateMarket = ref<NearbyRealEstatePdfState["market"]>();
const trafficExportLoading = ref(false);
const trafficPdfSection = ref<NeighborhoodScorePdfSection>();

function updateRealEstateExportState(state: NearbyRealEstatePdfState): void {
  realEstateExportLoading.value = state.loading;
  realEstatePdfSection.value = state.section;
  realEstateMarket.value = state.market;
}

function updateTrafficExportState(state: NearbyTrafficPdfState): void {
  trafficExportLoading.value = state.loading;
  trafficPdfSection.value = state.section;
}

const scoreLoading = computed(() => Boolean(initialOrigin && (
  !calendar.ready.value
  || nearby.isScanning.value
  || score.isLoading.value
  || heavy.isLoading.value
  || nearbyWalking.isLoadingPlaces.value
  || serviceQuality.isLoading.value
  || personalJourneys.loading.value
)));
const exportReady = computed(() => Boolean(initialOrigin
  && !personalJourneys.loading.value
  && !scoreLoading.value
  && futureProjectsReady.value
  && !realEstateExportLoading.value
  && !trafficExportLoading.value
  && score.transportPending.value.length === 0
  && score.criteria.value.every(criterion => criterion.status !== "loading"
    && criterion.datasets.every(dataset => dataset.status !== "loading"))));
const exportingPdf = ref(false);
const pdfExportStatus = ref<"saved" | "cancelled" | "downloaded" | "error">();
const pdfExportMessage = computed(() => {
  const keys = {
    saved: "nearbyStations.neighborhoodScore.exportPdfSaved",
    cancelled: "nearbyStations.neighborhoodScore.exportPdfCancelled",
    downloaded: "nearbyStations.neighborhoodScore.exportPdfDownloaded",
    error: "nearbyStations.neighborhoodScore.exportPdfError",
  } as const;
  return pdfExportStatus.value ? t(keys[pdfExportStatus.value]) : "";
});
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
  if (score.gtfsCoverageMissing.value) return "coverage";
  if (heavy.error.value) return "heavy";
  const transportSource = score.transportErrorSource?.value;
  if (transportSource === "routes" || transportSource === "timetables") return transportSource;
  if (score.errorSource?.value === "routes") return "routes";
  if (score.errorSource?.value === "timetables") return "timetables";
  if (score.errorSource?.value === "places") return "places";
  if (score.errorSource?.value === "verdict") return "verdict";
  if (nearbyWalking.error.value) return "walking";
  if (serviceQuality.error.value) return "service-quality";
  return score.error.value ? "routes" : undefined;
});
const retryingSource = ref<ScoreRetrySource>();
const trafficLineRefs = computed(() => [...new Set([
  ...nearby.stations.value.flatMap(entry => entry.lines.map(line => line.id)),
  ...heavy.visibleCandidates.value.flatMap(candidate => candidate.lines.map(line => line.id)),
])]);
const scoreError = computed(() => {
  const source = failedSource.value;
  if (score.error.value?.name === "TimeoutError" && failedSource.value === score.errorSource.value) {
    return t("nearbyStations.neighborhoodScore.partialErrorTimeout", { seconds: source === "timetables" ? 300 : 45 });
  }
  if (source === "stations") {
    return t("nearbyStations.neighborhoodScore.partialErrorStations");
  }
  if (source === "coverage") {
    return t("nearbyStations.neighborhoodScore.partialErrorGtfsCoverage");
  }
  if (source === "heavy" || source === "routes") {
    return source === "heavy"
      ? t("nearbyStations.neighborhoodScore.partialErrorHeavy")
      : t("nearbyStations.neighborhoodScore.partialErrorGtfsRoutes");
  }
  if (source === "places") {
    return t("nearbyStations.neighborhoodScore.partialErrorPlaces");
  }
  if (source === "timetables") {
    return t("nearbyStations.neighborhoodScore.partialErrorTimetables");
  }
  if (source === "verdict") {
    return t("nearbyStations.neighborhoodScore.partialErrorVerdict");
  }
  if (source === "walking") {
    if (nearbyWalking.error.value?.message === "walking-routes-quota-exceeded") {
      return t("nearbyStations.neighborhoodScore.partialErrorWalkingQuota");
    }
    return t("nearbyStations.neighborhoodScore.partialErrorWalking");
  }
  if (source === "service-quality") {
    return t("nearbyStations.neighborhoodScore.partialErrorServiceQuality");
  }
  return score.error.value ? t("nearbyStations.neighborhoodScore.partialError") : undefined;
});

const scoreBandKeys = {
  excellent: "nearbyStations.neighborhoodScore.bands.excellent",
  good: "nearbyStations.neighborhoodScore.bands.good",
  medium: "nearbyStations.neighborhoodScore.bands.medium",
  weak: "nearbyStations.neighborhoodScore.bands.weak",
  "very-weak": "nearbyStations.neighborhoodScore.bands.veryWeak",
} as const;

async function exportScorePdf(): Promise<void> {
  if (!exportReady.value || exportingPdf.value) return;
  exportingPdf.value = true;
  pdfExportStatus.value = undefined;
  try {
    const result = score.result.value;
    const factLabel = (fact: NeighborhoodFact): string =>
      fact.label ?? (fact.labelKey
        ? t(fact.labelKey, transportSectionValues(fact, fact.labelValues, t))
        : "");
    const categorySections: NeighborhoodScorePdfSection[] = result.categories.map(category => {
      const items = [
        ...category.positiveFacts.map(fact => `${t("nearbyStations.neighborhoodScore.positives")} : ${factLabel(fact)}`),
        ...category.negativeFacts.map(fact => `${t("nearbyStations.neighborhoodScore.negatives")} : ${factLabel(fact)}`),
        ...category.neutralFacts.map(fact => `${t("nearbyStations.neighborhoodScore.neutralFacts")} : ${factLabel(fact)}`),
      ].filter(item => !item.endsWith(" : "));
      if (category.id === "transport" && gtfsWarning.value) items.unshift(gtfsWarning.value);
      if (!items.length) {
        items.push(t(category.available
          ? "nearbyStations.neighborhoodScore.noDocumentedSignal"
          : "nearbyStations.neighborhoodScore.categoryUnavailable"));
      }
      return {
        title: t(category.labelKey),
        value: category.available && typeof category.displayScore === "number"
          ? `${n(category.displayScore, { maximumFractionDigits: 1 })} / 10`
          : t("nearbyStations.neighborhoodScore.categoryUnavailable"),
        items,
      };
    });
    const bandLabel = result.band
      ? t(scoreBandKeys[result.band])
      : t("nearbyStations.neighborhoodScore.pdfScoreUnavailable");
    const scoreValue = typeof result.displayScore === "number"
      ? `${n(result.displayScore, { maximumFractionDigits: 1 })} / 10`
      : t("nearbyStations.neighborhoodScore.pdfScoreUnavailable");
    const sections = [
      ...categorySections,
      ...(trafficPdfSection.value ? [trafficPdfSection.value] : []),
      ...(realEstatePdfSection.value ? [realEstatePdfSection.value] : []),
    ];
    const fileAddress = (originLabel.value ?? "")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64);

    const outcome = await downloadNeighborhoodScorePdf({
      title: t("nearbyStations.neighborhoodScore.pageTitle"),
      location: originLabel.value,
      scoreLabel: t("nearbyStations.neighborhoodScore.pdfScoreLabel"),
      scoreValue,
      bandLabel,
      coverageLine: t("nearbyStations.neighborhoodScore.coverage", {
        available: result.availableCategoryCount,
        total: result.totalCategoryCount,
      }),
      updatedLine: t("nearbyStations.neighborhoodScore.updatedAt", {
        time: d(result.generatedAt, { dateStyle: "short", timeStyle: "short" }),
      }),
      sections,
      pageLabel: (current, total) => t("nearbyStations.neighborhoodScore.pdfPage", { current, total }),
    }, `score-quartier${fileAddress ? `-${fileAddress}` : ""}.pdf`);
    pdfExportStatus.value = outcome.status;
  } catch {
    pdfExportStatus.value = "error";
  } finally {
    exportingPdf.value = false;
  }
}

// No diagnostic serialization or extra requests on the normal verdict page.
// This exposes only public page inputs/results, never server configuration.
const debugVerdict = computed(() => queryString(route.query.debugVerdict) === "1");
const debugTiming = computed(() => queryString(route.query.debugTiming) === "1");
function observeDebugLoading(system: string, loading: () => boolean): void {
  let finish: ReturnType<typeof beginVerdictDebugTask> | undefined;
  watch(loading, active => {
    if (!debugVerdict.value) return;
    if (active && !finish) finish = beginVerdictDebugTask(system, "load");
    if (!active && finish) { finish("ready"); finish = undefined; }
  }, { immediate: true, flush: "sync" });
  onUnmounted(() => finish?.("cancelled"));
}
observeDebugLoading("station-catalogue", () => nearby.isScanning.value);
observeDebugLoading("service-quality", () => serviceQuality.isLoading.value);
observeDebugLoading("place-walking", () => nearbyWalking.isLoadingPlaces.value);
const debugPerformance = ref<{ coldStart: boolean; transportSettledMs?: number; pageSettledMs?: number;
  firstTransportSettledMs?: number; firstPageSettledMs?: number;
  transitions: { ms: number; transportPending: string[]; heavy: boolean; stations: boolean; serviceQuality: boolean; futureProjects: boolean }[] }>({ coldStart: isNeighborhoodGtfsColdStart(), transitions: [] });
let debugSettleTimer: ReturnType<typeof setTimeout> | undefined;
let debugMounted = false;
function updateDebugPerformance(): void {
  if (!debugMounted || !debugVerdict.value) return;
  if (debugSettleTimer) clearTimeout(debugSettleTimer);
  const state = { ms: Math.round(performance.now()), transportPending: [...score.transportPending.value],
    heavy: heavy.isLoading.value, stations: nearby.isScanning.value, serviceQuality: serviceQuality.isLoading.value,
    futureProjects: !futureProjectsReady.value };
  debugPerformance.value.transitions.push(state);
  if (state.transportPending.length || state.heavy || state.stations || state.serviceQuality || state.futureProjects) {
    debugPerformance.value.transportSettledMs = undefined;
  } else {
    // Let dependent heavy-target/frequency watchers enqueue their follow-up.
    debugSettleTimer = setTimeout(() => {
      debugPerformance.value.transportSettledMs = state.ms;
      debugPerformance.value.firstTransportSettledMs ??= state.ms;
    }, 250);
  }
  debugPerformance.value.pageSettledMs = scoreLoading.value ? undefined : state.ms;
  if (!scoreLoading.value) debugPerformance.value.firstPageSettledMs ??= state.ms;
}
watch(() => [score.transportPending.value.join(","), heavy.isLoading.value, nearby.isScanning.value,
  serviceQuality.isLoading.value, futureProjectsReady.value, scoreLoading.value], updateDebugPerformance, { flush: "post" });
onMounted(() => { debugMounted = true; updateDebugPerformance(); });
onUnmounted(() => { if (debugSettleTimer) clearTimeout(debugSettleTimer); });
const debugReference = ref("");
const debugSnapshot = computed(() => debugVerdict.value ? {
  performance: debugPerformance.value,
  revision: typeof __APP_SOURCE_REVISION__ === "undefined" ? "" : __APP_SOURCE_REVISION__,
  apiBase: toServerApiUrl("/"),
  origin: nearby.selectedPlace.value,
  journeyDateTime: journeyDateTime.value,
  nightJourneyDateTime: nightJourneyDateTime.value,
  gtfsReference: gtfsReference.value,
  loading: { page: scoreLoading.value, score: score.isLoading.value, stations: nearby.isScanning.value,
    heavy: heavy.isLoading.value, walking: nearbyWalking.isLoadingPlaces.value, serviceQuality: serviceQuality.isLoading.value },
  progress: scoreProgress.value,
  error: { source: failedSource.value, label: scoreError.value, heavy: heavy.error.value,
    score: score.error.value?.message, walking: nearbyWalking.error.value?.message, serviceQuality: serviceQuality.error.value?.message },
  result: score.result.value,
  criteria: criteriaWithPersonalJourneys.value,
  diagnostics: score.diagnostics.value,
  stations: nearby.stations.value,
  heavyCandidates: heavy.visibleCandidates.value,
  futureProjects: futureProjects.value,
  walkingRoutes: nearbyWalking.placeRoutes.value,
  serviceQuality: serviceQuality.data.value,
} : {});
const debugIntegrity = computed(() => debugVerdict.value ? buildVerdictTransportIntegrity(debugSnapshot.value, verdictDebugTimeline.tasks.value) : undefined);
const debugParsedReference = computed(() => {
  try { return debugReference.value.trim() ? JSON.parse(debugReference.value) : undefined; } catch { return undefined; }
});
const debugComparison = computed(() => {
  if (!debugVerdict.value || !debugReference.value.trim()) return { status: "not-compared" as const };
  const reference = debugParsedReference.value;
  if (!reference?.result?.categories?.some((category: { id: string }) => category.id === "transport")) return { status: "invalid" as const };
  if (debugIntegrity.value?.status === "loading") return { status: "loading" as const };
  return compareVerdictTransportSnapshots(debugSnapshot.value, reference);
});
const debugPayload = computed(() => debugVerdict.value ? JSON.stringify(debugTiming.value && scoreLoading.value ? {
  performance: debugPerformance.value, loading: true, transportIntegrity: debugIntegrity.value, transportComparison: debugComparison.value,
} : { ...debugSnapshot.value, transportIntegrity: debugIntegrity.value, transportComparison: debugComparison.value }, null, 2) : "");
const debugTimelinePayload = computed(() => debugVerdict.value ? JSON.stringify({
  clock: "milliseconds since navigation (performance.now)",
  performance: debugPerformance.value,
  systems: [...new Set(verdictDebugTimeline.tasks.value.map(task => task.system))].map(system => {
    const tasks = verdictDebugTimeline.tasks.value.filter(task => task.system === system);
    const startMs = Math.min(...tasks.map(task => task.startMs));
    const endMs = tasks.some(task => task.status === "running") ? undefined : Math.max(...tasks.map(task => task.endMs ?? task.startMs));
    return { system, startMs, endMs, durationMs: endMs === undefined ? undefined : endMs - startMs,
      running: tasks.filter(task => task.status === "running").length, completed: tasks.filter(task => task.status === "ready").length,
      failed: tasks.filter(task => task.status === "error").length, cancelled: tasks.filter(task => task.status === "cancelled").length };
  }),
  tasks: verdictDebugTimeline.tasks.value,
}, null, 2) : "");

async function retryFailedSource(source = failedSource.value): Promise<void> {
  if (!source || retryingSource.value) return;
  retryingSource.value = source;
  try {
    if (source === "stations") {
      await nearby.scanNearbyStations();
    } else if (source === "places" || source === "verdict") {
      // The score composable keeps successful origin-scoped responses in
      // memory, so this retries failed score work without reloading the page.
      await score.refresh();
    } else if (source === "heavy" || source === "routes" || source === "timetables" || source === "service-quality" || source === "coverage") {
      referenceNow.value = new Date();
      refreshBrowserNeighborhoodGtfsManifest();
      const changed = await calendar.reload(true);
      await nextTick();
      const retries: Promise<void>[] = [];
      if (!changed) {
        retries.push(score.retryFailedTransport());
        if (heavy.error.value) retries.push(heavy.retryFailed());
      } else {
        // The version watcher already started the new probes. Heavy access
        // can discover additional timetable targets after it finishes.
        retries.push((async () => {
          await heavy.whenSettled();
          await nextTick();
          await score.waitForTransport();
        })());
      }
      if (serviceQuality.error.value && !serviceQuality.isLoading.value) retries.push(serviceQuality.retry());
      await Promise.all(retries);
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
    ...(origin.code ? { code: origin.code } : {}),
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
    <section v-if="debugVerdict" class="nearby-neighborhood-score-page__debug-checks" data-testid="verdict-debug-checks">
      <p data-testid="verdict-debug-integrity" :data-status="debugIntegrity?.status">
        {{ t("nearbyStations.neighborhoodScore.debugIntegrityTitle") }} :
        {{ t(debugIntegrity?.status === 'loading' ? "nearbyStations.neighborhoodScore.debugIntegrityLoading" : debugIntegrity?.status === 'degraded' ? "nearbyStations.neighborhoodScore.debugIntegrityDegraded" : "nearbyStations.neighborhoodScore.debugIntegrityComplete") }}
      </p>
      <label for="verdict-debug-reference">{{ t("nearbyStations.neighborhoodScore.debugReferenceLabel") }}</label>
      <textarea id="verdict-debug-reference" v-model="debugReference" data-testid="verdict-debug-reference" rows="3" :placeholder="t('nearbyStations.neighborhoodScore.debugReferencePlaceholder')" />
      <p data-testid="verdict-debug-comparison" :data-status="debugComparison.status">
        {{ t("nearbyStations.neighborhoodScore.debugComparisonTitle") }} :
        {{ t(debugComparison.status === 'equal' ? "nearbyStations.neighborhoodScore.debugComparisonEqual" : debugComparison.status === 'different' ? "nearbyStations.neighborhoodScore.debugComparisonDifferent" : debugComparison.status === 'invalid' ? "nearbyStations.neighborhoodScore.debugComparisonInvalid" : debugComparison.status === 'loading' ? "nearbyStations.neighborhoodScore.debugIntegrityLoading" : "nearbyStations.neighborhoodScore.debugComparisonMissing") }}
      </p>
    </section>
    <details v-if="debugVerdict">
      <summary>{{ t("nearbyStations.neighborhoodScore.debugDataTitle") }}</summary>
      <pre data-testid="verdict-debug" class="nearby-neighborhood-score-page__debug">{{ debugPayload }}</pre>
    </details>
    <details v-if="debugVerdict">
      <summary>{{ t("nearbyStations.neighborhoodScore.debugTimelineTitle") }}</summary>
      <pre data-testid="verdict-debug-timeline" class="nearby-neighborhood-score-page__debug">{{ debugTimelinePayload }}</pre>
    </details>
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
          {{ t("nearbyStations.neighborhoodScore.gtfsJourneyReference", { dayTime: dayDepartureTime, nightTime: nightDepartureTime }) }}
        </p>
        <fieldset class="nearby-neighborhood-score-page__departure-times">
          <legend>{{ t("nearbyStations.neighborhoodScore.departureTimesTitle") }}</legend>
          <label>
            <span>{{ t("nearbyStations.neighborhoodScore.dayDepartureTime") }}</span>
            <input v-model="dayDepartureTime" type="time" step="60" @change="restoreDayDepartureTime" />
          </label>
          <label>
            <span>{{ t("nearbyStations.neighborhoodScore.nightDepartureTime") }}</span>
            <input v-model="nightDepartureTime" type="time" step="60" @change="restoreNightDepartureTime" />
          </label>
        </fieldset>
      </div>
      <div class="nearby-neighborhood-score-page__hero-actions">
        <button
          v-if="initialOrigin"
          class="nearby-neighborhood-score-page__export-button"
          type="button"
          data-testid="verdict-export-pdf"
          :disabled="!exportReady || exportingPdf"
          :aria-busy="exportingPdf"
          :title="exportingPdf ? t('nearbyStations.neighborhoodScore.exportPdfSaving') : exportReady ? t('nearbyStations.neighborhoodScore.exportPdfReady') : t('nearbyStations.neighborhoodScore.exportPdfWaiting')"
          @click="exportScorePdf"
        >
          <Download :size="16" aria-hidden="true" />
          {{ t(exportingPdf ? "nearbyStations.neighborhoodScore.exportPdfSaving" : "nearbyStations.neighborhoodScore.exportPdf") }}
        </button>
        <p v-if="pdfExportMessage" data-testid="verdict-pdf-export-status" :role="pdfExportStatus === 'error' ? 'alert' : 'status'">{{ pdfExportMessage }}</p>
        <Gauge class="nearby-neighborhood-score-page__icon" :size="42" aria-hidden="true" />
      </div>
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
      v-if="initialOrigin"
      :result="cardResult"
      :education-places="score.places.value"
      :education-walking-routes="nearbyWalking.placeRoutes.value"
      :origin-label="originLabel"
      :workplace-label="workplaceLabel"
      :loading="scoreLoading"
      :progress-label="scoreProgressLabel"
      :error="scoreError"
      :retrying="Boolean(retryingSource)"
      :retry-disabled="false"
      :criteria="criteriaWithPersonalJourneys"
      :real-estate-market="realEstateMarket"
      :transport-loading-tasks="transportLoadingTasks"
      :directory-url="directoryUrl"
      @change-origin="openAddressSelector"
      @retry-source="retryFailedSource"
    >
      <template #personal-journeys>
        <div v-if="gtfsWarning" class="nearby-neighborhood-score-page__gtfs-warning" role="status" data-testid="verdict-gtfs-reference">
          <p>{{ gtfsWarning }}</p>
          <button type="button" class="button-secondary" :disabled="Boolean(retryingSource)" @click="retryFailedSource('coverage')">{{ t('nearbyStations.neighborhoodScore.checkGtfsUpdate') }}</button>
        </div>
        <VerdictPersonalJourneys :journeys="personalJourneys" />
      </template>
    </NearbyNeighborhoodScoreCard>
    <template v-if="initialOrigin">
      <button type="button" class="nearby-neighborhood-score-page__export-button" :aria-expanded="comparisonOpen" aria-controls="neighborhood-comparison-panel" data-testid="verdict-open-comparison" @click="comparisonOpen = !comparisonOpen">
        {{ t(comparisonOpen ? 'nearbyStations.comparison.close' : 'nearbyStations.comparison.open') }}
      </button>
      <div v-if="comparisonOpen" id="neighborhood-comparison-panel">
        <NeighborhoodComparison :origin="nearby.selectedPlace.value" :network="nearby.transportMapNetwork.value" :transport-ready="!nearby.isScanning.value && Boolean(nearby.transportMapNetwork.value)" :transport-error="Boolean(nearby.error?.value)" />
      </div>
    </template>
    <NeighborhoodTrafficAnnex
      v-if="realEstateOrigin"
      :line-refs="trafficLineRefs"
      :origin-key="`${realEstateOrigin.lon}:${realEstateOrigin.lat}`"
      @export-state="updateTrafficExportState"
    />
    <NearbyRealEstateVerdict
      v-if="initialOrigin"
      :origin="realEstateOrigin"
      :radius-meters="realEstateRadiusMeters"
      @export-state="updateRealEstateExportState"
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
.nearby-neighborhood-score-page__gtfs-warning { background: var(--surface-soft); border-inline-start: 3px solid var(--warning, #a66312); padding: 8px 12px; margin-block: 12px; }
.nearby-neighborhood-score-page__gtfs-warning p { margin: 0 0 6px; }
.nearby-neighborhood-score-page { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); margin: 0 auto; max-width: 920px; min-width: 0; padding: 28px 22px 118px; }
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
.nearby-neighborhood-score-page__departure-times { border: 0; display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 12px 0 0; padding: 0; }
.nearby-neighborhood-score-page__departure-times legend { color: var(--muted); flex: 1 0 100%; font-size: .68rem; font-weight: 800; margin-bottom: 5px; padding: 0; }
.nearby-neighborhood-score-page__departure-times label { align-items: center; color: var(--ink); display: inline-flex; font-size: .75rem; font-weight: 750; gap: 8px; }
.nearby-neighborhood-score-page__departure-times input { background: #fff; border: 1px solid rgba(81,70,255,.24); border-radius: 8px; color: var(--ink); font: inherit; min-height: 34px; padding: 4px 8px; }
.nearby-neighborhood-score-page__departure-times input:focus-visible { border-color: #5146ff; outline: 2px solid rgba(81,70,255,.2); outline-offset: 1px; }
.nearby-neighborhood-score-page__icon { color: #5146ff; margin-right: 10px; opacity: .8; }
.nearby-neighborhood-score-page__hero-actions { align-items: center; display: flex; flex-direction: column; gap: 18px; }
.nearby-neighborhood-score-page__export-button { align-items: center; background: #5146ff; border: 1px solid #5146ff; border-radius: 10px; color: #fff; cursor: pointer; display: inline-flex; font: inherit; font-size: .78rem; font-weight: 800; gap: 8px; justify-content: center; min-height: 40px; padding: 8px 12px; white-space: nowrap; }
.nearby-neighborhood-score-page__export-button:hover:not(:disabled), .nearby-neighborhood-score-page__export-button:focus-visible { background: #4034df; border-color: #4034df; }
.nearby-neighborhood-score-page__export-button:focus-visible { outline: 2px solid rgba(81,70,255,.3); outline-offset: 2px; }
.nearby-neighborhood-score-page__export-button:disabled { cursor: not-allowed; opacity: .52; }
.nearby-neighborhood-score-page__empty { align-items: center; background: linear-gradient(135deg, #f7f7ff, #eef4fa); border: 1px dashed rgba(81,70,255,.3); border-radius: 14px; color: var(--muted); display: flex; flex-direction: column; gap: 8px; justify-content: center; min-height: 280px; padding: 28px; text-align: center; }
.nearby-neighborhood-score-page__empty > svg { color: #5146ff; }
.nearby-neighborhood-score-page__empty strong { color: var(--ink); }
.nearby-neighborhood-score-page__empty-link { background: #5146ff; border-radius: 9px; color: #fff; font-size: .78rem; font-weight: 850; margin-top: 5px; padding: 9px 12px; text-decoration: none; }
.nearby-neighborhood-score-page__empty-link:hover, .nearby-neighborhood-score-page__empty-link:focus-visible { background: #4034df; color: #fff; }
.nearby-neighborhood-score-page__debug { background: var(--surface); color: var(--ink); font-size: .75rem; max-height: 24rem; overflow: auto; padding: 12px; white-space: pre-wrap; }
.nearby-neighborhood-score-page__debug-checks { padding: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; }
.nearby-neighborhood-score-page__debug-checks textarea { width: 100%; color: var(--ink); background: var(--surface); }
.nearby-neighborhood-score-page__debug-checks [data-status="degraded"], .nearby-neighborhood-score-page__debug-checks [data-status="different"], .nearby-neighborhood-score-page__debug-checks [data-status="invalid"] { color: var(--danger); font-weight: 700; }
@media (max-width: 680px) {
  .nearby-neighborhood-score-page { padding: 18px 12px 108px; }
  .nearby-neighborhood-score-page__hero { align-items: stretch; flex-direction: column; padding: 19px; }
  .nearby-neighborhood-score-page__hero-actions { align-items: flex-start; gap: 0; margin-top: 14px; }
  .nearby-neighborhood-score-page__icon { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .nearby-neighborhood-score-page__loading-bar span { transition: none; }
}
</style>
