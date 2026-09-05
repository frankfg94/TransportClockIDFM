import { onBeforeUnmount, readonly, ref, shallowReadonly, shallowRef, watch } from "vue";
import { createNearbyDataProviders } from "../../services/nearbyDataProviders";
import { fetchGtfsLineFrequency } from "../../services/lineFrequency";
import type { GtfsLineFrequencyResponse } from "../../types/lineFrequency";
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
  NEIGHBORHOOD_FREQUENCY_LINE_LIMIT,
  buildNeighborhoodScore,
  type NeighborhoodGreenSpaceJourney,
  type NeighborhoodJourneyBenchmark,
  type NeighborhoodScoreResult,
  type NeighborhoodWalkingMetrics,
} from "./neighborhoodScore";
import type { NearbyNeighborhoodScoreSnapshot } from "./nearbyNeighborhoodScoreSnapshot";
import {
  fetchNeighborhoodVerdict,
  type PublicGreenSpaceAccess,
  type PublicNeighborhoodVerdict,
} from "./neighborhoodVerdictApi";

type ReadonlyValue<T> = { readonly value: T };

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
  initialSnapshot?: NearbyNeighborhoodScoreSnapshot;
}

export function useNearbyNeighborhoodScore(options: UseNearbyNeighborhoodScoreOptions) {
  const defaultProviders = createNearbyDataProviders();
  const placesProvider = options.placesProvider ?? defaultProviders.places;
  const travelRoutesProvider = options.travelRoutesProvider ?? defaultProviders.travelRoutes;
  const fetchFrequency = options.fetchFrequency ?? fetchGtfsLineFrequency;
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
  const backendVerdict = shallowRef<PublicNeighborhoodVerdict>();
  const result = ref<NeighborhoodScoreResult>(buildNeighborhoodScore({
    places: [],
    placesLoaded: false,
    stations: [],
    stationsLoaded: false,
  }));
  const isLoading = ref(false);
  const error = ref<Error>();
  const updatedAt = ref(Date.now());

  const placesResults = new Map<string, NearbyPlace[]>();
  const placeRequests = new Map<string, { controller: AbortController; promise: Promise<NearbyPlace[]> }>();
  const journeyResults = new Map<string, NearbyJourney[]>();
  const journeyRequests = new Map<string, Promise<NearbyJourney[]>>();
  const frequencyResults = new Map<string, GtfsLineFrequencyResponse>();
  const frequencyRequests = new Map<string, { controller: AbortController; promise: Promise<GtfsLineFrequencyResponse> }>();
  const verdictResults = new Map<string, PublicNeighborhoodVerdict>();
  const verdictRequests = new Map<string, { controller: AbortController; promise: Promise<PublicNeighborhoodVerdict> }>();
  const pendingTasks = new Set<string>();
  let activeOriginKey = "";
  let requestToken = 0;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  function recompute(): void {
    const currentNetwork = options.network.value;
    const stationsLoading = options.stationsLoading?.value ?? false;
    const currentWalkingRoutes = {
      ...walkingRoutes.value,
      ...(options.walkingRoutes?.value ?? {}),
    };
    const currentHeavyCandidates = options.heavyCandidates?.value ?? heavyCandidates.value;
    const stationsLoaded = Boolean(currentNetwork)
      || (!stationsLoading && activeOriginKey !== "" && options.stations.value.length > 0);
    result.value = buildNeighborhoodScore({
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
      generatedAt: updatedAt.value,
      backendVerdict: backendVerdict.value,
    });
  }

  function scheduleRefresh(): void {
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void refresh();
    }, 0);
  }

  async function refresh(): Promise<void> {
    const origin = options.origin.value;
    const originKey = origin ? neighborhoodOriginKey(origin) : "";
    const token = ++requestToken;
    resetOriginState(originKey);
    greenSpaceJourneys.value = [];
    abortStalePlaceRequests(originKey);
    pendingTasks.clear();
    updateLoadingState();
    recompute();

    if (!origin) return;

    trackTask(
      "backend-verdict",
      loadBackendVerdict(origin, originKey),
      token,
      (next) => {
        backendVerdict.value = next;
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
          );
        }
      },
      true,
    );

    if (!placesLoaded.value) {
      trackTask(
        "places",
        loadPlaces(origin, originKey),
        token,
        (next) => {
          places.value = next;
          placesLoaded.value = true;
          updatedAt.value = Date.now();
        },
        true,
      );
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
        false,
      );
    }
    if (nextBenchmarks.length > 0) journeyBenchmarks.value = nextBenchmarks;

    const noctilienTargets = resolveNoctilienTargets(options.network.value, origin);
    const noctilienResults: NearbyJourney[] = [];
    for (const target of noctilienTargets) {
      const journeyKey = journeyCacheKey(originKey, target.id, target, nightJourneyDateTime, "night");
      trackTask(
        `noctilien:${target.id}`,
        loadJourneyProbe(origin, target, nightJourneyDateTime, journeyKey),
        token,
        (next) => {
          for (const journey of next) {
            if (hasNoctilienTransitSection(journey) && !noctilienResults.some((candidate) => candidate.id === journey.id)) {
              noctilienResults.push(journey);
            }
          }
          noctilienJourneys.value = [...noctilienResults];
          updatedAt.value = Date.now();
        },
        false,
      );
    }
    noctilienJourneys.value = [];

    const lineIds = getRelevantLineIds(options.stations.value, options.heavyCandidates?.value ?? heavyCandidates.value);
    for (const lineId of lineIds) {
      trackTask(
        `frequency:${lineId}`,
        loadFrequency(lineId),
        token,
        (next) => {
          frequencyResults.set(lineId, next);
          frequencyProfiles.value = new Map(frequencyResults);
          updatedAt.value = Date.now();
        },
        false,
      );
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
    backendVerdict.value = undefined;
    error.value = undefined;
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
    const promise = placesProvider.searchNearby({
      origin,
      radiusMeters: NEARBY_DIRECTORY_MAX_RADIUS_METERS,
    }, controller.signal)
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
  ): Promise<NearbyJourney[]> {
    const cached = journeyResults.get(journeyKey);
    if (cached) return Promise.resolve([...cached]);
    const active = journeyRequests.get(journeyKey);
    if (active) return active;
    const request: NearbyJourneyRequest = {
      origin,
      destination,
      count: 4,
      includeDisruptions: true,
      includeGeoJson: false,
      ...(destination.destinationRef ? { destinationRef: destination.destinationRef } : {}),
      ...(datetime?.trim() ? { datetime: datetime.trim() } : {}),
    };
    const promise = (options.journeyProbe
      ? options.journeyProbe.probeJourneys(request)
      : travelRoutesProvider.findJourneys(request))
      .catch(() => []).then((next) => {
      journeyResults.set(journeyKey, [...next]);
      return next;
    }).finally(() => {
      if (journeyRequests.get(journeyKey) === promise) journeyRequests.delete(journeyKey);
    });
    journeyRequests.set(journeyKey, promise);
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
        );
      }))).flat();
      return { greenSpace, journeys };
    }));
  }

  function loadFrequency(lineId: string): Promise<GtfsLineFrequencyResponse> {
    const cached = frequencyResults.get(lineId);
    if (cached) return Promise.resolve(cached);
    const active = frequencyRequests.get(lineId);
    if (active) return active.promise;
    const controller = new AbortController();
    const promise = fetchFrequency(lineId, { signal: controller.signal })
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

  function loadBackendVerdict(origin: Pick<GeocoderPoint, "lon" | "lat">, originKey: string): Promise<PublicNeighborhoodVerdict> {
    const cached = verdictResults.get(originKey);
    if (cached) return Promise.resolve(cached);
    const active = verdictRequests.get(originKey);
    if (active) return active.promise;
    const controller = new AbortController();
    const promise = fetchNeighborhoodVerdict(origin.lat, origin.lon, controller.signal)
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
  ): void {
    pendingTasks.add(taskId);
    updateLoadingState();
    void promise
      .then((value) => {
        if (token !== requestToken) return;
        apply(value);
        recompute();
      })
      .catch((cause: unknown) => {
        if (token !== requestToken) return;
        if (cause instanceof Error && cause.name === "AbortError") return;
        if (reportError) error.value = cause instanceof Error ? cause : new Error("neighborhood-source-unavailable");
        recompute();
      })
      .finally(() => {
        if (token !== requestToken) return;
        pendingTasks.delete(taskId);
        updateLoadingState();
      });
  }

  function updateLoadingState(): void {
    isLoading.value = pendingTasks.size > 0;
  }

  function abortStalePlaceRequests(originKey: string): void {
    for (const [key, request] of placeRequests) {
      if (key === originKey) continue;
      request.controller.abort();
      placeRequests.delete(key);
    }
    for (const [key, request] of verdictRequests) {
      if (key === originKey) continue;
      request.controller.abort();
      verdictRequests.delete(key);
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
      recompute();
      scheduleRefresh();
    },
    { immediate: true },
  );
  watch(
    () => Object.entries(options.walkingRoutes?.value ?? {})
      .map(([id, route]) => `${id}:${route?.durationSeconds ?? ""}:${route?.distanceMeters ?? ""}`)
      .join(","),
    recompute,
  );
  watch(
    () => (options.heavyCandidates?.value ?? heavyCandidates.value)
      .map((candidate) => `${candidate.id}:${candidate.lines.map((line) => line.id).join("|")}:${candidate.access.totalSeconds}`)
      .join(","),
    () => {
      recompute();
      scheduleRefresh();
    },
  );
  watch(
    () => options.heavyCandidatesLoading?.value,
    recompute,
  );

  onBeforeUnmount(() => {
    requestToken += 1;
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    for (const request of placeRequests.values()) request.controller.abort();
    for (const request of frequencyRequests.values()) request.controller.abort();
    for (const request of verdictRequests.values()) request.controller.abort();
  });

  return {
    result: shallowReadonly(result),
    places: readonly(places),
    /** Public GPE metadata is also consumed by the heavy-access resolver. */
    backendVerdict: readonly(backendVerdict),
    isLoading: readonly(isLoading),
    error: readonly(error),
    updatedAt: readonly(updatedAt),
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

const GREEN_SPACE_TRANSIT_MIN_SURFACE_M2 = 100_000;

function resolveGreenSpaceTransitTargets(
  spaces: readonly PublicGreenSpaceAccess[] | undefined,
): PublicGreenSpaceAccess[] {
  return [...(spaces ?? [])]
    .filter((space) => (space.surfaceM2 ?? 0) >= GREEN_SPACE_TRANSIT_MIN_SURFACE_M2)
    .filter((space) => (space.walkingMinutes ?? space.estimatedWalkingMinutes) > 15)
    .sort((left, right) => (right.surfaceM2 ?? 0) - (left.surfaceM2 ?? 0)
      || (left.walkingMinutes ?? left.estimatedWalkingMinutes)
        - (right.walkingMinutes ?? right.estimatedWalkingMinutes)
      || left.name.localeCompare(right.name, "fr-FR"))
    .slice(0, 4);
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

function getRelevantLineIds(
  stations: readonly NearbyStationEntry[],
  candidates: readonly NearbyHeavyTransportCandidate[],
): string[] {
  const heavyModes = new Set<GlobalMapMode>(["METRO", "RER", "TRAIN", "TRANSILIEN", "TRAM", "CABLE"]);
  const ids = new Set<string>();
  for (const line of [
    ...stations.filter((entry) => entry.insideRadius).flatMap((entry) => entry.lines),
    ...candidates.flatMap((candidate) => candidate.lines),
  ]) {
    if (heavyModes.has(line.mode)) ids.add(line.id);
  }
  return [...ids].sort().slice(0, NEIGHBORHOOD_FREQUENCY_LINE_LIMIT);
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
