import { computed, onBeforeUnmount, readonly, ref, shallowReadonly, shallowRef, watch } from "vue";
import { createNearbyDataProviders } from "../../services/nearbyDataProviders";
import { fetchGtfsLineFrequency } from "../../services/lineFrequency";
import type { GtfsLineFrequencyResponse } from "../../types/lineFrequency";
import { useLineFrequencyTimetable } from "../line-map/useLineFrequencyTimetable";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import type { GlobalMapMode, GlobalMapStation } from "../transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../transport-map/contracts/network";
import type {
  NearbyHeavyTransportCandidate,
  NearbyJourney,
  NearbyJourneyRequest,
  TravelRoutesProvider,
} from "./nearbyHeavyTransports";
import { isNearbyJourneyTransitSection } from "./nearbyJourneyTiming";
import type { TravelRouteProbe } from "./useTravelRoutes";
import type { NearbyPlace, PlacesProvider } from "./nearbyPlaces";
import {
  NEARBY_DIRECTORY_MAX_RADIUS_METERS,
} from "./nearbyPlacePresentation";
import {
  getNearbyNightJourneyDateTime,
  NEARBY_HEAVY_TRANSPORT_MODES,
} from "./nearbyHeavyTransports";
import type { NearbyStationEntry } from "./nearbyStations";
import {
  aggregateNeighborhoodScore,
  buildNeighborhoodCategories,
  buildNeighborhoodScore,
  NEIGHBORHOOD_CATEGORY_IDS,
  type NeighborhoodCategoryId,
  type NeighborhoodCategoryResult,
  type NeighborhoodGreenSpaceJourney,
  type NeighborhoodJourneyBenchmark,
  type NeighborhoodScoreInput,
  type NeighborhoodScoreResult,
  type NeighborhoodWalkingMetrics,
} from "./neighborhood";
import {
  NEIGHBORHOOD_CRITERION_REGISTRY,
  type NeighborhoodCriterionState,
  type NeighborhoodCriterionStatus,
  type NeighborhoodDatasetStatus,
} from "./neighborhood/criterionRegistry";
import type { NearbyNeighborhoodScoreSnapshot } from "./nearbyNeighborhoodScoreSnapshot";
import {
  fetchNeighborhoodVerdict,
  type PublicGreenSpaceAccess,
  type PublicNeighborhoodVerdict,
} from "./neighborhoodVerdictApi";
import type { PublicServiceQuality } from "./serviceQualityApi";

type ReadonlyValue<T> = { readonly value: T };

export type NeighborhoodScoreErrorSource = "verdict" | "places" | "routes";

export interface UseNearbyNeighborhoodScoreOptions {
  origin: ReadonlyValue<GeocoderPoint | undefined>;
  stations: ReadonlyValue<NearbyStationEntry[]>;
  network: ReadonlyValue<TransportMapNetwork | undefined>;
  /** Optional Navitia departure datetime used for the Châtelet benchmark. */
  journeyDateTime?: string;
  /** The same probe exposed by useTravelRoutes, shared by every benchmark. */
  journeyProbe?: TravelRouteProbe;
  /** Optional Navitia departure datetime used for the real 03:00 Noctilien probe. */
  nightJourneyDateTime?: string;
  stationsLoading?: ReadonlyValue<boolean>;
  walkingRoutes?: ReadonlyValue<Record<string, NeighborhoodWalkingMetrics | undefined>>;
  heavyCandidates?: ReadonlyValue<NearbyHeavyTransportCandidate[]>;
  heavyCandidatesLoading?: ReadonlyValue<boolean>;
  placesProvider?: PlacesProvider;
  travelRoutesProvider?: TravelRoutesProvider;
  fetchFrequency?: typeof fetchGtfsLineFrequency;
  serviceQuality?: ReadonlyValue<PublicServiceQuality | undefined>;
  initialSnapshot?: NearbyNeighborhoodScoreSnapshot;
}

export function useNearbyNeighborhoodScore(options: UseNearbyNeighborhoodScoreOptions) {
  const defaultProviders = createNearbyDataProviders();
  const placesProvider = options.placesProvider ?? defaultProviders.places;
  const travelRoutesProvider = options.travelRoutesProvider ?? defaultProviders.travelRoutes;
  const fetchFrequency = options.fetchFrequency ?? fetchGtfsLineFrequency;
  const frequencyTimetable = useLineFrequencyTimetable({ fetchFrequency });
  const nightJourneyDateTime = options.nightJourneyDateTime ?? getNearbyNightJourneyDateTime();
  const places = ref<NearbyPlace[]>([]);
  const placesLoaded = ref(false);
  const walkingRoutes = ref<Record<string, NeighborhoodWalkingMetrics | undefined>>({});
  const heavyCandidates = ref<NearbyHeavyTransportCandidate[]>([]);
  const chateletJourneys = ref<NearbyJourney[]>([]);
  const journeyBenchmarks = ref<NeighborhoodJourneyBenchmark[]>([]);
  const greenSpaceJourneys = ref<NeighborhoodGreenSpaceJourney[]>([]);
  const noctilienJourneys = ref<NearbyJourney[]>([]);
  const frequencyProfiles = shallowRef(new Map<string, GtfsLineFrequencyResponse | undefined>());
  const lastServiceByLine = shallowRef(new Map<string, Awaited<ReturnType<typeof frequencyTimetable.getLastService>>>());
  const hospitalJourneys = ref<Record<string, NearbyJourney[] | undefined>>({});
  const backendVerdict = shallowRef<PublicNeighborhoodVerdict>();
  const backendVerdictReady = ref(false);
  const result = ref<NeighborhoodScoreResult>(buildNeighborhoodScore({
    places: [],
    placesLoaded: false,
    stations: [],
    stationsLoaded: false,
  }));
  const isLoading = ref(false);
  const error = ref<Error>();
  const errorSource = ref<NeighborhoodScoreErrorSource>();
  const updatedAt = ref(Date.now());

  const placesResults = new Map<string, NearbyPlace[]>();
  const placeRequests = new Map<string, { controller: AbortController; promise: Promise<NearbyPlace[]> }>();
  const journeyResults = new Map<string, NearbyJourney[]>();
  const journeyRequests = new Map<string, { controller: AbortController; promise: Promise<NearbyJourney[]> }>();
  const frequencyResults = new Map<string, GtfsLineFrequencyResponse>();
  const frequencyRequests = new Map<string, { controller: AbortController; promise: Promise<GtfsLineFrequencyResponse> }>();
  const lastServiceResults = new Map<string, Awaited<ReturnType<typeof frequencyTimetable.getLastService>>>();
  const lastServiceRequests = new Map<string, { controller: AbortController; promise: Promise<Awaited<ReturnType<typeof frequencyTimetable.getLastService>>> }>();
  const verdictResults = new Map<string, PublicNeighborhoodVerdict>();
  const verdictRequests = new Map<string, { controller: AbortController; promise: Promise<PublicNeighborhoodVerdict> }>();
  const pendingTasks = new Set<string>();
  let activeOriginKey = "";
  let requestToken = 0;
  let refreshQueued = false;
  let recomputeFrame: number | undefined;
  let disposed = false;
  const localCategories = new Map<NeighborhoodCategoryId, NeighborhoodCategoryResult>();
  const dirtyCriteria = new Set<NeighborhoodCategoryId>(NEIGHBORHOOD_CATEGORY_IDS);
  const activeCriteriaTasks = new Map<string, readonly NeighborhoodCategoryId[]>();
  const criterionErrors = new Set<NeighborhoodCategoryId>();
  const criterionRevision = ref(0);
  const requestScheduler = createNeighborhoodRequestScheduler(6);
  const PLACES_CRITERIA: readonly NeighborhoodCategoryId[] = ["daily-life", "nature-leisure", "health", "education"];
  const ROUTE_CRITERIA: readonly NeighborhoodCategoryId[] = ["nature-leisure", "health", "transport"];

  function currentScoreInput(): NeighborhoodScoreInput {
    const currentNetwork = options.network.value;
    const stationsLoading = options.stationsLoading?.value ?? false;
    const currentWalkingRoutes = {
      ...walkingRoutes.value,
      ...(options.walkingRoutes?.value ?? {}),
    };
    const currentHeavyCandidates = options.heavyCandidates?.value ?? heavyCandidates.value;
    const stationsLoaded = Boolean(currentNetwork)
      || (!stationsLoading && activeOriginKey !== "" && options.stations.value.length > 0);
    return {
      places: places.value,
      placesLoaded: placesLoaded.value,
      walkingRoutes: currentWalkingRoutes,
      stations: options.stations.value,
      stationsLoaded,
      heavyCandidates: currentHeavyCandidates,
      heavyCandidatesLoading: options.heavyCandidatesLoading?.value,
      chateletJourneys: chateletJourneys.value,
      journeyBenchmarks: journeyBenchmarks.value,
      greenSpaceJourneys: greenSpaceJourneys.value,
      noctilienJourneys: noctilienJourneys.value,
      frequencyProfiles: frequencyProfiles.value,
      lastServiceByLine: lastServiceByLine.value,
      hospitalJourneys: hospitalJourneys.value,
      serviceQuality: options.serviceQuality?.value,
      generatedAt: updatedAt.value,
      backendVerdict: backendVerdict.value,
    };
  }

  function recompute(): void {
    const input = currentScoreInput();
    const categories = buildNeighborhoodCategories(input, localCategories, dirtyCriteria);
    localCategories.clear();
    for (const category of categories) localCategories.set(category.id, category);
    dirtyCriteria.clear();
    result.value = aggregateNeighborhoodScore(categories, input);
  }

  function markCriteriaDirty(ids: readonly NeighborhoodCategoryId[]): void {
    for (const id of ids) dirtyCriteria.add(id);
  }

  function scheduleRecompute(): void {
    if (disposed || recomputeFrame !== undefined) return;
    if (typeof window === "undefined") {
      queueMicrotask(() => {
        if (!disposed) recompute();
      });
      return;
    }
    recomputeFrame = window.requestAnimationFrame(() => {
      recomputeFrame = undefined;
      if (!disposed) recompute();
    });
  }

  function scheduleRefresh(): void {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      if (!disposed) void refresh();
    });
  }

  async function refresh(): Promise<void> {
    if (disposed) return;
    const origin = options.origin.value;
    const originKey = origin ? neighborhoodOriginKey(origin) : "";
    const token = ++requestToken;
    error.value = undefined;
    errorSource.value = undefined;
    resetOriginState(originKey);
    greenSpaceJourneys.value = [];
    hospitalJourneys.value = {};
    // A refresh replaces the current origin-scoped work. Abort in-flight
    // requests before creating the next batch; completed cache entries remain
    // available and are deliberately not reset for a refresh at the same
    // origin.
    abortActiveRequests();
    pendingTasks.clear();
    activeCriteriaTasks.clear();
    updateLoadingState();
    recompute();

    if (!origin) return;

    trackTask(
      "backend-verdict",
      loadBackendVerdict(origin, originKey),
      token,
      (next) => {
        backendVerdict.value = next;
        backendVerdictReady.value = true;
        updatedAt.value = Math.max(updatedAt.value, Date.parse(next.generatedAt) || Date.now());
        const greenSpaceTargets = resolveGreenSpaceTransitTargets(next.nearbyGreenSpaces);
        if (greenSpaceTargets.length > 0) {
          trackTask(
            "green-space-routes",
            loadGreenSpaceJourneys(origin, greenSpaceTargets, originKey),
            token,
            (journeys) => {
              greenSpaceJourneys.value = journeys;
              updatedAt.value = Date.now();
            },
            false,
            undefined,
            ["nature-leisure"],
          );
        }
      },
      true,
      "verdict",
      NEIGHBORHOOD_CATEGORY_IDS,
    );

    if (!placesLoaded.value) {
      trackTask(
        "places",
        loadPlaces(origin, originKey),
        token,
        (next) => {
          places.value = next;
          placesLoaded.value = true;
          trackHospitalJourneys(origin, next, originKey, token);
          updatedAt.value = Date.now();
        },
        true,
        "places",
        PLACES_CRITERIA,
      );
    } else {
      trackHospitalJourneys(origin, places.value, originKey, token);
    }

    const benchmarkDestinations = resolveJourneyBenchmarks(options.network.value);
    const nextBenchmarks: NeighborhoodJourneyBenchmark[] = [];
    for (const benchmark of benchmarkDestinations) {
      const journeyKey = journeyCacheKey(originKey, benchmark.id, benchmark, options.journeyDateTime);
      const taskId = `journey:${benchmark.id}`;
      nextBenchmarks.push({ id: benchmark.id, label: benchmark.label, journeys: [] });
      trackTask(
        taskId,
        loadJourneyProbe(origin, benchmark, options.journeyDateTime, journeyKey),
        token,
        (next) => {
          const current = nextBenchmarks.find((candidate) => candidate.id === benchmark.id);
          if (current) current.journeys = next;
          journeyBenchmarks.value = [...nextBenchmarks];
          if (benchmark.id === "chatelet") chateletJourneys.value = next;
          updatedAt.value = Date.now();
        },
        true,
        "routes",
        ["transport"],
      );
    }
    if (nextBenchmarks.length > 0) journeyBenchmarks.value = nextBenchmarks;

    const noctilienTargets = resolveNoctilienTargets(options.network.value, origin);
    const noctilienResults: NearbyJourney[] = [];
    for (const target of noctilienTargets) {
      const journeyKey = journeyCacheKey(originKey, target.id, target, nightJourneyDateTime, "night");
      trackTask(
        `noctilien:${target.id}`,
        loadJourneyProbe(origin, target, nightJourneyDateTime, journeyKey, 1),
        token,
        (next) => {
          for (const journey of next) {
            if (hasNoctilienTransitSection(journey)
              && !noctilienResults.some((candidate) => nearbyJourneyDeduplicationKey(candidate) === nearbyJourneyDeduplicationKey(journey))) {
              noctilienResults.push(journey);
            }
          }
          noctilienJourneys.value = [...noctilienResults];
          updatedAt.value = Date.now();
        },
        true,
        "routes",
        ["transport"],
      );
    }
    noctilienJourneys.value = [];

    loadTransportLineDetails(token);
  }

  /**
   * Frequency and last-service are the only score inputs that depend on the
   * heavy resolver output. Keep that dependency incremental: when projected
   * heavy stations arrive, reuse every already-resolved benchmark/place and
   * start only the newly relevant line probes.
   */
  function loadTransportLineDetails(token = requestToken): void {
    if (disposed || token !== requestToken) return;
    const lineTargets = getRelevantLineTargets(
      options.stations.value,
      options.heavyCandidates?.value ?? heavyCandidates.value,
    );
    for (const { lineId, stationId } of lineTargets) {
      const frequencyTaskId = `frequency:${lineId}`;
      if (!frequencyResults.has(lineId) && !pendingTasks.has(frequencyTaskId)) {
        trackTask(
          frequencyTaskId,
          loadFrequency(lineId, stationId),
          token,
          (next) => {
            frequencyResults.set(lineId, next);
            frequencyProfiles.value = new Map(frequencyResults);
            updatedAt.value = Date.now();
          },
          false,
          undefined,
          ["transport"],
        );
      }
      const lastServiceTaskId = `last-service:${lineId}`;
      if (!lastServiceResults.has(lineId) && !pendingTasks.has(lastServiceTaskId)) {
        trackTask(
          lastServiceTaskId,
          loadLastService(lineId, stationId),
          token,
          (next) => {
            lastServiceByLine.value = new Map(lastServiceResults.set(lineId, next));
            updatedAt.value = Date.now();
          },
          false,
          undefined,
          ["transport"],
        );
      }
    }
  }

  function resetOriginState(originKey: string): void {
    if (originKey === activeOriginKey) return;
    activeOriginKey = originKey;
    places.value = [];
    placesLoaded.value = false;
    walkingRoutes.value = {};
    heavyCandidates.value = [];
    chateletJourneys.value = [];
    journeyBenchmarks.value = [];
    greenSpaceJourneys.value = [];
    noctilienJourneys.value = [];
    frequencyProfiles.value = new Map();
    lastServiceByLine.value = new Map();
    hospitalJourneys.value = {};
    frequencyResults.clear();
    lastServiceResults.clear();
    backendVerdict.value = undefined;
    backendVerdictReady.value = false;
    localCategories.clear();
    criterionErrors.clear();
    markCriteriaDirty(NEIGHBORHOOD_CATEGORY_IDS);
    error.value = undefined;
    errorSource.value = undefined;
    if (!originKey) return;

    const snapshot = snapshotForOrigin(options.initialSnapshot, originKey);
    if (!snapshot) return;
    places.value = [...snapshot.places];
    placesLoaded.value = snapshot.placesLoaded;
    walkingRoutes.value = { ...snapshot.walkingRoutes };
    heavyCandidates.value = [...snapshot.heavyCandidates];
    if (snapshot.placesLoaded) placesResults.set(originKey, [...snapshot.places]);
  }

  function loadPlaces(origin: Pick<GeocoderPoint, "lon" | "lat">, originKey: string): Promise<NearbyPlace[]> {
    const cached = placesResults.get(originKey);
    if (cached) return Promise.resolve([...cached]);
    const active = placeRequests.get(originKey);
    if (active) return active.promise;

    const controller = new AbortController();
    const promise = requestScheduler.schedule(
      () => placesProvider.searchNearby({
        origin,
        radiusMeters: NEARBY_DIRECTORY_MAX_RADIUS_METERS,
      }, controller.signal),
      controller.signal,
      0,
    )
      .then((next) => {
        placesResults.set(originKey, [...next]);
        return next;
      })
      .finally(() => {
        if (placeRequests.get(originKey)?.promise === promise) placeRequests.delete(originKey);
      });
    placeRequests.set(originKey, { controller, promise });
    return promise;
  }

  function loadJourneyProbe(
    origin: Pick<GeocoderPoint, "lon" | "lat">,
    destination: Pick<GlobalMapStation, "id" | "lon" | "lat"> & { destinationRef?: string },
    datetime: string | undefined,
    journeyKey: string,
    priority = 0,
  ): Promise<NearbyJourney[]> {
    const cached = journeyResults.get(journeyKey);
    if (cached) return Promise.resolve([...cached]);
    const active = journeyRequests.get(journeyKey);
    if (active) return active.promise;
    const request: NearbyJourneyRequest = {
      origin,
      destination,
      count: 4,
      includeDisruptions: true,
      includeGeoJson: false,
      ...(destination.destinationRef ? { destinationRef: destination.destinationRef } : {}),
      ...(datetime?.trim() ? { datetime: datetime.trim() } : {}),
    };
    const controller = new AbortController();
    const promise = requestScheduler.schedule(
      () => options.journeyProbe
        ? options.journeyProbe.probeJourneys(request, controller.signal)
        : travelRoutesProvider.findJourneys(request, controller.signal),
      controller.signal,
      priority,
    )
      .then((next) => {
        // Cache only an actual provider response. A 429, timeout or aborted
        // request must remain retryable; caching its former [] result makes
        // every route-dependent signal disappear for the rest of the page.
        journeyResults.set(journeyKey, [...next]);
        return next;
      }).finally(() => {
        if (journeyRequests.get(journeyKey)?.promise === promise) journeyRequests.delete(journeyKey);
      });
    journeyRequests.set(journeyKey, { controller, promise });
    return promise;
  }

  function loadGreenSpaceJourneys(
    origin: Pick<GeocoderPoint, "lon" | "lat">,
    targets: readonly PublicGreenSpaceAccess[],
    originKey: string,
  ): Promise<NeighborhoodGreenSpaceJourney[]> {
    return Promise.all(targets.map(async (greenSpace): Promise<NeighborhoodGreenSpaceJourney> => {
      const points = [
        { lon: greenSpace.lon, lat: greenSpace.lat },
        ...(greenSpace.transitPoints ?? []),
      ].filter((point, index, all) => all.findIndex((candidate) =>
        candidate.lon === point.lon && candidate.lat === point.lat) === index)
        .slice(0, 6);
      const journeys = (await Promise.all(points.map((point, index) => {
        const destination = {
          id: `green-space:${greenSpace.id}:${index}`,
          lon: point.lon,
          lat: point.lat,
        };
        const journeyKey = journeyCacheKey(
          originKey,
          `green-space:${greenSpace.id}:${index}`,
          destination,
          options.journeyDateTime,
          "green-space",
        );
        return loadJourneyProbe(
          origin,
          destination,
          options.journeyDateTime,
          journeyKey,
          2,
        ).catch(() => []);
      }))).flat();
      return { greenSpace, journeys };
    }));
  }

  function trackHospitalJourneys(
    origin: Pick<GeocoderPoint, "lon" | "lat">,
    sourcePlaces: readonly NearbyPlace[],
    originKey: string,
    token: number,
  ): void {
    const targets = sourcePlaces.filter((place) => normalizeScoreText(place.kind) === "hospital");
    if (targets.length === 0) return;
    const promise = Promise.all(targets.map(async (place) => {
      const destination = { id: place.id, lon: place.lon, lat: place.lat };
      const journeyKey = journeyCacheKey(originKey, place.id, destination, options.journeyDateTime, "hospital");
      return [place.id, await loadJourneyProbe(origin, destination, options.journeyDateTime, journeyKey, 3)] as const;
    })).then((entries) => Object.fromEntries(entries));
    trackTask(
      "hospital-routes",
      promise,
      token,
      (next) => {
        hospitalJourneys.value = next;
        updatedAt.value = Date.now();
      },
      false,
      undefined,
      ["health"],
    );
  }

  function loadFrequency(lineId: string, stationId?: string): Promise<GtfsLineFrequencyResponse> {
    const cached = frequencyResults.get(lineId);
    if (cached) return Promise.resolve(cached);
    const active = frequencyRequests.get(lineId);
    if (active) return active.promise;
    const controller = new AbortController();
    const promise = requestScheduler.schedule(
      () => frequencyTimetable.getFrequencies(lineId, stationId, { signal: controller.signal }),
      controller.signal,
      2,
    )
      .then((next) => {
        frequencyResults.set(lineId, next);
        return next;
      })
      .finally(() => {
        if (frequencyRequests.get(lineId)?.promise === promise) frequencyRequests.delete(lineId);
      });
    frequencyRequests.set(lineId, { controller, promise });
    return promise;
  }

  function loadLastService(
    lineId: string,
    stationId?: string,
    priority = 3,
  ): Promise<Awaited<ReturnType<typeof frequencyTimetable.getLastService>>> {
    if (lastServiceResults.has(lineId)) return Promise.resolve(lastServiceResults.get(lineId));
    const active = lastServiceRequests.get(lineId);
    if (active) return active.promise;
    const controller = new AbortController();
    const promise = requestScheduler.schedule(
      () => frequencyTimetable.getLastService(lineId, stationId, { signal: controller.signal }),
      controller.signal,
      priority,
    )
      .then((next) => {
        lastServiceResults.set(lineId, next);
        return next;
      })
      .finally(() => {
        if (lastServiceRequests.get(lineId)?.promise === promise) lastServiceRequests.delete(lineId);
      });
    lastServiceRequests.set(lineId, { controller, promise });
    return promise;
  }

  function loadBackendVerdict(origin: Pick<GeocoderPoint, "lon" | "lat">, originKey: string): Promise<PublicNeighborhoodVerdict> {
    const cached = verdictResults.get(originKey);
    if (cached) return Promise.resolve(cached);
    const active = verdictRequests.get(originKey);
    if (active) return active.promise;
    const controller = new AbortController();
    const promise = requestScheduler.schedule(
      () => fetchNeighborhoodVerdict(origin.lat, origin.lon, controller.signal),
      controller.signal,
      0,
    )
      .then((next) => { verdictResults.set(originKey, next); return next; })
      .finally(() => { if (verdictRequests.get(originKey)?.promise === promise) verdictRequests.delete(originKey); });
    verdictRequests.set(originKey, { controller, promise });
    return promise;
  }

  function trackTask<T>(
    taskId: string,
    promise: Promise<T>,
    token: number,
    apply: (value: T) => void,
    reportError: boolean,
    source?: NeighborhoodScoreErrorSource,
    dirtyCategories: readonly NeighborhoodCategoryId[] = NEIGHBORHOOD_CATEGORY_IDS,
  ): void {
    pendingTasks.add(taskId);
    activeCriteriaTasks.set(taskId, dirtyCategories);
    updateLoadingState();
    void promise
      .then((value) => {
        if (token !== requestToken) return;
        apply(value);
        for (const id of dirtyCategories) criterionErrors.delete(id);
        markCriteriaDirty(dirtyCategories);
        scheduleRecompute();
      })
      .catch((cause: unknown) => {
        if (token !== requestToken) return;
        if (cause instanceof Error && cause.name === "AbortError") return;
        if (taskId === "backend-verdict") backendVerdictReady.value = true;
        for (const id of dirtyCategories) criterionErrors.add(id);
        if (reportError) {
          error.value = cause instanceof Error ? cause : new Error("neighborhood-source-unavailable");
          errorSource.value = source;
        }
        markCriteriaDirty(dirtyCategories);
        scheduleRecompute();
      })
      .finally(() => {
        if (token !== requestToken) return;
        pendingTasks.delete(taskId);
        activeCriteriaTasks.delete(taskId);
        updateLoadingState();
      });
  }

  function updateLoadingState(): void {
    isLoading.value = pendingTasks.size > 0;
    criterionRevision.value += 1;
  }

  function currentDatasetStatus(
    datasetId: string,
    maxAgeMs: number | undefined,
    categoryId: NeighborhoodCategoryId,
    loading: boolean,
    failed: boolean,
  ): NeighborhoodDatasetStatus {
    if (loading) return "loading";
    if (failed) return "error";
    if (datasetId === "transport-bootstrap") return options.network.value ? "ready" : "missing";
    if (datasetId === "osm-places") return placesLoaded.value ? "ready" : "missing";
    if (datasetId === "neighborhood-green-spaces") {
      return backendVerdict.value?.nearbyGreenSpaces !== undefined ? "ready" : "missing";
    }
    if (datasetId === "neighborhood-verdict") {
      return freshnessStatus(backendVerdict.value?.generatedAt, maxAgeMs);
    }
    if (datasetId === "service-quality") {
      return freshnessStatus(options.serviceQuality?.value?.generatedAt, maxAgeMs);
    }
    if (datasetId === "gtfs-frequency") return frequencyResults.size > 0 ? "ready" : "missing";
    if (datasetId === "walking-routes") {
      const routeCount = Object.keys({ ...walkingRoutes.value, ...(options.walkingRoutes?.value ?? {}) }).length;
      return routeCount > 0 ? "ready" : "missing";
    }
    if (datasetId === "navitia-journeys") {
      const hasJourneys = categoryId === "transport"
        ? chateletJourneys.value.length > 0 || journeyBenchmarks.value.some((benchmark) => benchmark.journeys.length > 0) || noctilienJourneys.value.length > 0
        : categoryId === "nature-leisure"
          ? greenSpaceJourneys.value.length > 0
          : categoryId === "health"
            ? Object.values(hospitalJourneys.value).some((journeys) => (journeys?.length ?? 0) > 0)
            : false;
      return hasJourneys ? "ready" : "missing";
    }
    return "missing";
  }

  function abortActiveRequests(): void {
    for (const [key, request] of placeRequests) {
      request.controller.abort();
      placeRequests.delete(key);
    }
    for (const [key, request] of verdictRequests) {
      request.controller.abort();
      verdictRequests.delete(key);
    }
    for (const [key, request] of journeyRequests) {
      request.controller.abort();
      journeyRequests.delete(key);
    }
    for (const [key, request] of frequencyRequests) {
      request.controller.abort();
      frequencyRequests.delete(key);
    }
    for (const [key, request] of lastServiceRequests) {
      request.controller.abort();
      lastServiceRequests.delete(key);
    }
  }

  watch(
    () => [
      options.origin.value?.lon,
      options.origin.value?.lat,
      options.network.value,
      options.stations.value.map((entry) => entry.id).join(","),
    ] as const,
    () => {
      markCriteriaDirty(["transport"]);
      recompute();
      scheduleRefresh();
    },
    { immediate: true },
  );
  watch(
    () => Object.entries(options.walkingRoutes?.value ?? {})
      .map(([id, route]) => `${id}:${route?.durationSeconds ?? ""}:${route?.distanceMeters ?? ""}`)
      .join(","),
    () => {
      markCriteriaDirty(ROUTE_CRITERIA);
      scheduleRecompute();
    },
  );
  watch(
    () => (options.heavyCandidates?.value ?? heavyCandidates.value)
      .map((candidate) => `${candidate.id}:${candidate.lines.map((line) => line.id).join("|")}:${candidate.access.totalSeconds}`)
    .join(","),
    () => {
      markCriteriaDirty(["transport"]);
      scheduleRecompute();
      loadTransportLineDetails();
    },
  );
  watch(
    () => options.heavyCandidatesLoading?.value,
    () => {
      markCriteriaDirty(["transport"]);
      scheduleRecompute();
    },
  );
  watch(
    () => options.stationsLoading?.value,
    () => {
      markCriteriaDirty(["transport"]);
      scheduleRecompute();
    },
  );
  watch(
    () => options.serviceQuality?.value,
    () => {
      markCriteriaDirty(["transport"]);
      scheduleRecompute();
    },
  );

  onBeforeUnmount(() => {
    disposed = true;
    requestToken += 1;
    refreshQueued = false;
    if (recomputeFrame !== undefined && typeof window !== "undefined") window.cancelAnimationFrame(recomputeFrame);
    for (const request of placeRequests.values()) request.controller.abort();
    for (const request of frequencyRequests.values()) request.controller.abort();
    for (const request of lastServiceRequests.values()) request.controller.abort();
    for (const request of verdictRequests.values()) request.controller.abort();
    for (const request of journeyRequests.values()) request.controller.abort();
  });

  const criteria = computed<NeighborhoodCriterionState[]>(() => {
    // Keep the task map non-reactive; this revision is incremented once for
    // each batched task-state update and is the only dependency needed here.
    criterionRevision.value;
    return NEIGHBORHOOD_CRITERION_REGISTRY.map((definition) => {
      const category = result.value.categories.find((candidate) => candidate.id === definition.id);
      const loading = (definition.id === "transport" && options.heavyCandidatesLoading?.value === true)
        || [...activeCriteriaTasks.values()].some((ids) => ids.includes(definition.id));
      const failed = criterionErrors.has(definition.id);
      const datasets = definition.datasets.map((dataset) => ({
        ...dataset,
        status: currentDatasetStatus(dataset.id, dataset.maxAgeMs, definition.id, loading, failed),
      } satisfies typeof dataset & { status: NeighborhoodDatasetStatus }));
      const staleDataset = datasets.some((dataset) => dataset.status === "stale");
      const status: NeighborhoodCriterionStatus = loading
        ? "loading"
        : failed
          ? category?.available ? "degraded" : "error"
        : staleDataset
          ? category?.available ? "degraded" : "unavailable"
        : category?.available
          ? "ready"
          : category?.neutralFacts.length || category?.positiveFacts.length || category?.negativeFacts.length
            ? "degraded"
            : "unavailable";
      return {
        id: definition.id,
        status,
        score: category?.score,
        confidence: status === "ready" ? 1 : status === "degraded" ? 0.5 : 0,
        reasons: [
          ...(category?.positiveFacts ?? []),
          ...(category?.negativeFacts ?? []),
          ...(category?.neutralFacts ?? []),
        ],
        datasets,
      };
    });
  });
  const loadingCriteria = computed(() => criteria.value.filter((criterion) => criterion.status === "loading").map((criterion) => criterion.id));
  const completedCriteria = computed(() => criteria.value.filter((criterion) => criterion.status !== "loading").map((criterion) => criterion.id));
  const degradedCriteria = computed(() => criteria.value.filter((criterion) => criterion.status === "degraded" || criterion.status === "error").map((criterion) => criterion.id));

  return {
    result: shallowReadonly(result),
    places: readonly(places),
    /** Public GPE metadata is also consumed by the heavy-access resolver. */
    backendVerdict: readonly(backendVerdict),
    backendVerdictReady: readonly(backendVerdictReady),
    isLoading: readonly(isLoading),
    error: readonly(error),
    errorSource: readonly(errorSource),
    updatedAt: readonly(updatedAt),
    criteria,
    loadingCriteria,
    completedCriteria,
    degradedCriteria,
    globalScore: computed(() => result.value.score),
    confidence: computed(() => result.value.coverageRatio),
    isComplete: computed(() => !isLoading.value),
    refresh,
  };
}

function resolveChateletDestination(network: TransportMapNetwork | undefined): GlobalMapStation | undefined {
  if (!network) return undefined;
  return [...network.stations]
    .filter((station) => isHeavyTransportStation(network, station))
    .filter((station) => {
      const name = normalizeScoreText(station.name);
      return name.includes("chatelet") || name.includes("les halles");
    })
    .sort((left, right) => {
      const leftName = normalizeScoreText(left.name);
      const rightName = normalizeScoreText(right.name);
      // Prefer the canonical Châtelet–Les Halles stop area to an individual
      // quay. A quay can be several hundred metres away and makes the
      // benchmark depend on the selected platform rather than on the actual
      // central destination.
      const leftCanonical = leftName.includes("chatelet") && leftName.includes("les halles") ? 0 : leftName === "chatelet" ? 1 : leftName.includes("chatelet") ? 2 : 3;
      const rightCanonical = rightName.includes("chatelet") && rightName.includes("les halles") ? 0 : rightName === "chatelet" ? 1 : rightName.includes("chatelet") ? 2 : 3;
      const leftPhysical = left.id.includes("monomodalStopPlace") ? 0 : 1;
      const rightPhysical = right.id.includes("monomodalStopPlace") ? 0 : 1;
      return leftCanonical - rightCanonical
        || leftPhysical - rightPhysical
        || Number(right.isHub) - Number(left.isHub)
        || right.lineIds.length - left.lineIds.length
        || left.id.localeCompare(right.id);
    })[0];
}

interface JourneyBenchmarkDestination extends Pick<GlobalMapStation, "id" | "lon" | "lat"> {
  label: string;
  destinationRef?: string;
}

const MAJOR_STATION_BENCHMARKS: readonly { id: string; label: string; names: readonly string[] }[] = [
  { id: "montparnasse", label: "Gare Montparnasse", names: ["gare montparnasse", "montparnasse bienvenue", "montparnasse"] },
  { id: "saint-lazare", label: "Gare Saint-Lazare", names: ["gare saint lazare", "saint lazare"] },
  { id: "gare-de-lyon", label: "Gare de Lyon", names: ["gare de lyon", "lyon"] },
  { id: "gare-du-nord", label: "Gare du Nord", names: ["gare du nord", "du nord"] },
];

function resolveJourneyBenchmarks(network: TransportMapNetwork | undefined): JourneyBenchmarkDestination[] {
  if (!network) return [];
  const destinations: JourneyBenchmarkDestination[] = [];
  const chatelet = resolveChateletDestination(network);
  if (chatelet) destinations.push({
    ...chatelet,
    id: "chatelet",
    label: "Châtelet",
    destinationRef: resolveNavitiaStopAreaReference(chatelet),
  });

  for (const benchmark of MAJOR_STATION_BENCHMARKS) {
    const destination = [...network.stations]
      .filter((station) => isHeavyTransportStation(network, station))
      .filter((station) => {
        const name = normalizeScoreText(station.name);
        return benchmark.names.some((candidate) => name === candidate || name.includes(candidate));
      })
      .sort((left, right) => Number(right.isHub) - Number(left.isHub)
        || right.lineIds.length - left.lineIds.length
        || left.id.localeCompare(right.id))[0];
    if (destination) destinations.push({
      ...destination,
      id: benchmark.id,
      label: benchmark.label,
      destinationRef: resolveNavitiaStopAreaReference(destination),
    });
  }
  return destinations;
}

function resolveNavitiaStopAreaReference(
  station: Pick<GlobalMapStation, "rawRefs">,
): string | undefined {
  const rawReference = station.rawRefs
    .map((reference) => reference.trim())
    .find((reference) => reference.startsWith("stop_area:"))
    ?? station.rawRefs
      .map((reference) => reference.trim())
      .find((reference) => /^\d+$/u.test(reference));
  if (!rawReference) return undefined;
  return rawReference.startsWith("stop_area:")
    ? rawReference
    : `stop_area:IDFM:${rawReference}`;
}

const NOCTILIEN_PROBE_MAX_METERS = 2_500;
const NOCTILIEN_PROBE_LIMIT = 16;

function resolveNoctilienTargets(
  network: TransportMapNetwork | undefined,
  origin: Pick<GeocoderPoint, "lon" | "lat">,
): Array<Pick<GlobalMapStation, "id" | "lon" | "lat">> {
  if (!network) return [];
  return network.stations
    .filter((station) => station.lineIds.some((lineId) => network.linesById.get(lineId)?.mode === "NOCTILIEN"))
    .map((station) => ({
      station,
      distance: getDistanceMeters(origin, station),
    }))
    .filter((candidate) => candidate.distance <= NOCTILIEN_PROBE_MAX_METERS)
    .sort((left, right) => left.distance - right.distance || left.station.name.localeCompare(right.station.name, "fr"))
    .slice(0, NOCTILIEN_PROBE_LIMIT)
    .map(({ station }) => station);
}

const GREEN_SPACE_TRANSIT_MIN_SURFACE_M2 = 30_000;

function resolveGreenSpaceTransitTargets(
  spaces: readonly PublicGreenSpaceAccess[] | undefined,
): PublicGreenSpaceAccess[] {
  return [...(spaces ?? [])]
    .filter((space) => (space.surfaceM2 ?? 0) >= GREEN_SPACE_TRANSIT_MIN_SURFACE_M2)
    // A real walking route under 15 min is handled directly by the score;
    // unknown walking access remains eligible for a transit probe.
    .filter((space) => space.walkingMinutes === undefined || space.walkingMinutes > 15)
    .sort((left, right) => (right.surfaceM2 ?? 0) - (left.surfaceM2 ?? 0)
      || (left.walkingMinutes ?? left.estimatedWalkingMinutes)
        - (right.walkingMinutes ?? right.estimatedWalkingMinutes)
      || left.name.localeCompare(right.name, "fr-FR"))
    .slice(0, 8);
}

function getDistanceMeters(
  origin: Pick<GeocoderPoint, "lon" | "lat">,
  destination: Pick<GlobalMapStation, "lon" | "lat">,
): number {
  const latMeters = (destination.lat - origin.lat) * 111_320;
  const lonMeters = (destination.lon - origin.lon) * 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return Math.sqrt(latMeters ** 2 + lonMeters ** 2);
}

function isHeavyTransportStation(
  network: TransportMapNetwork,
  station: GlobalMapStation,
): boolean {
  return station.lineIds.some((lineId) => {
    const mode = network.linesById.get(lineId)?.mode;
    return Boolean(mode && NEARBY_HEAVY_TRANSPORT_MODES.includes(mode));
  });
}

function journeyCacheKey(
  originKey: string,
  destinationId: string,
  destination: Pick<GlobalMapStation, "id" | "lon" | "lat"> & { destinationRef?: string },
  datetime: string | undefined,
  kind = "day",
): string {
  return `nearby-route-v4:${kind}:${originKey}:${destinationId}:${destination.id}:${destination.destinationRef ?? ""}:${destination.lat.toFixed(5)}:${destination.lon.toFixed(5)}:${datetime?.trim() || "live"}`;
}

function hasNoctilienTransitSection(journey: NearbyJourney): boolean {
  return journey.sections.some((section) => {
    if (!isNearbyJourneyTransitSection(section)) return false;
    if (section.lineMode === "NOCTILIEN") return true;
    const references = [section.lineCode, ...(section.lineAliases ?? [])]
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => normalizeScoreText(value).replace(/[^a-z0-9]+/gu, ""));
    return references.some((reference) => /^n\d+$/u.test(reference));
  });
}

function nearbyJourneyDeduplicationKey(journey: NearbyJourney): string {
  const id = journey.id?.trim();
  if (id) return `id:${id}`;

  // Navitia does not always expose journey.id for scheduled journeys. Do not
  // collapse every such response into the first line that happened to return:
  // the route identity is reconstructed from its stable visible sections.
  return JSON.stringify({
    durationSeconds: journey.durationSeconds,
    departureDateTime: journey.departureDateTime,
    arrivalDateTime: journey.arrivalDateTime,
    transferCount: journey.transferCount,
    sections: journey.sections.map((section) => ({
      type: section.type,
      mode: section.mode,
      durationSeconds: section.durationSeconds,
      departureDateTime: section.departureDateTime,
      arrivalDateTime: section.arrivalDateTime,
      lineId: section.lineId,
      lineCode: section.lineCode,
      lineAliases: section.lineAliases,
      lineMode: section.lineMode,
      fromStopPointId: section.fromStopPointId,
      toStopPointId: section.toStopPointId,
      fromName: section.fromName,
      toName: section.toName,
    })),
  });
}

interface NearbyFrequencyTarget {
  lineId: string;
  stationId?: string;
}

const NEIGHBORHOOD_FREQUENCY_WALKING_LIMIT_METERS = 10 * 80;

function getRelevantLineTargets(
  stations: readonly NearbyStationEntry[],
  candidates: readonly NearbyHeavyTransportCandidate[],
): NearbyFrequencyTarget[] {
  const heavyModes = new Set<GlobalMapMode>(["METRO", "RER", "TRAIN", "TRANSILIEN", "TRAM", "CABLE"]);
  const targets = new Map<string, NearbyFrequencyTarget>();
  const add = (lineId: string, stationId: string | undefined): void => {
    if (!targets.has(lineId)) targets.set(lineId, { lineId, stationId });
  };
  for (const entry of stations) {
    for (const line of entry.lines) {
      const lineDistance = entry.lineDistanceMeters?.[line.id] ?? entry.distanceMeters;
      if (!heavyModes.has(line.mode)
        || entry.lineInsideRadius?.[line.id] === false
        || lineDistance > NEIGHBORHOOD_FREQUENCY_WALKING_LIMIT_METERS) continue;
      const station = entry.memberStations.find((candidate) => candidate.lineIds.includes(line.id));
      add(line.id, station?.id);
    }
  }
  for (const candidate of candidates) {
    for (const line of candidate.lines) {
      if (heavyModes.has(line.mode)) add(line.id, candidate.station.id);
    }
  }
  return [...targets.values()].sort((left, right) => left.lineId.localeCompare(right.lineId));
}

function snapshotForOrigin(
  snapshot: NearbyNeighborhoodScoreSnapshot | undefined,
  originKey: string,
): NearbyNeighborhoodScoreSnapshot | undefined {
  if (!snapshot || Date.now() - snapshot.savedAt > 10 * 60_000) return undefined;
  return neighborhoodOriginKey(snapshot.origin) === originKey ? snapshot : undefined;
}

function neighborhoodOriginKey(origin: Pick<GeocoderPoint, "lon" | "lat">): string {
  return `${origin.lat.toFixed(5)}:${origin.lon.toFixed(5)}`;
}

function normalizeScoreText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr-FR");
}

function freshnessStatus(generatedAt: string | undefined, maxAgeMs: number | undefined): NeighborhoodDatasetStatus {
  if (!generatedAt) return "missing";
  const timestamp = Date.parse(generatedAt);
  if (!Number.isFinite(timestamp)) return "missing";
  return maxAgeMs !== undefined && Date.now() - timestamp > maxAgeMs ? "stale" : "ready";
}

interface NeighborhoodScheduledRequest {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  priority: number;
  sequence: number;
  started: boolean;
  cleanup: () => void;
}

function createNeighborhoodRequestScheduler(maxConcurrency: number) {
  let active = 0;
  let sequence = 0;
  const queue: NeighborhoodScheduledRequest[] = [];

  const pump = (): void => {
    while (active < maxConcurrency && queue.length > 0) {
      queue.sort((left, right) => left.priority - right.priority || left.sequence - right.sequence);
      const request = queue.shift()!;
      if (request.signal?.aborted) {
        request.cleanup();
        request.reject(request.signal.reason ?? createNeighborhoodAbortError());
        continue;
      }
      request.started = true;
      active += 1;
      void Promise.resolve()
        .then(request.run)
        .then(request.resolve, request.reject)
        .finally(() => {
          active -= 1;
          request.cleanup();
          pump();
        });
    }
  };

  function schedule<T>(
    run: () => Promise<T>,
    signal?: AbortSignal,
    priority = 0,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request = {} as NeighborhoodScheduledRequest;
      const onAbort = (): void => {
        if (request.started) return;
        const index = queue.indexOf(request);
        if (index >= 0) queue.splice(index, 1);
        request.cleanup();
        reject(signal?.reason ?? createNeighborhoodAbortError());
      };
      request.run = run as () => Promise<unknown>;
      request.resolve = (value) => resolve(value as T);
      request.reject = reject;
      request.signal = signal;
      request.priority = priority;
      request.sequence = sequence++;
      request.started = false;
      request.cleanup = () => signal?.removeEventListener("abort", onAbort);
      signal?.addEventListener("abort", onAbort, { once: true });
      queue.push(request);
      pump();
    });
  }

  return { schedule };
}

function createNeighborhoodAbortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError");
}
