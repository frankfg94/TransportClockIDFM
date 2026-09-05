import { computed, onBeforeUnmount, onMounted, readonly, ref, watch } from "vue";
import { createNearbyDataProviders } from "../../services/nearbyDataProviders";
import { getCoordinatesDistanceMeters } from "../../services/distance";
import { lonLatToWorld } from "../transport-map/geo/coordinateKernel";
import type { GlobalMapLine, GlobalMapMode, GlobalMapStation } from "../transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../transport-map/contracts/network";
import { groupGlobalMapStations } from "../transport-map/search/globalMapSearch";
import {
  buildStationCorrespondenceContext,
  queryStationCorrespondenceStations,
  STATION_CORRESPONDENCE_RADIUS_METERS,
} from "../transport-map/spatial/stationCorrespondences";
import type { NearbyStationEntry } from "./nearbyStations";
import {
  getNearbyHeavyAccessTravelSeconds,
  listNearbyHeavyJourneyAlternatives,
  limitNearbyHeavyProjectedStations,
  NEARBY_HEAVY_SEARCH_MAX_METERS,
  NEARBY_HEAVY_TRANSPORT_MODES,
  selectNearbyHeavyTargetCandidates,
  type JourneyProvider,
  type NearbyHeavyTransportAccess,
  type NearbyHeavyTransportCandidate,
  type NearbyWalkingRouteProvider,
} from "./nearbyHeavyTransports";
import type { NearbyHeavyTargetCandidate } from "./nearbyHeavyTransportRules";
import type { PublicFutureGpeStation } from "./neighborhoodVerdictApi";

// A heavy line can be reachable through a nearby feeder even when its
// closest station is a different branch/terminus. Keep enough candidates to
// retain cases such as T10 -> RER B at Robinson and Croix de Berny.
const HEAVY_STATION_CANDIDATES_PER_LINE = 6;
const HEAVY_RESOLUTION_CONCURRENCY = 6;
const HEAVY_REFRESH_INTERVAL_MS = 5 * 60_000;

export interface NearbyHeavyTransportSource {
  origin: { value?: { lon: number; lat: number } };
  network?: { value?: TransportMapNetwork };
  stations: { value: NearbyStationEntry[] };
  activeModes: { value: GlobalMapMode[] };
  radius: { value: number };
  /** Future heavy stations supplied by the verdict data source. */
  futureProjects?: { value: readonly PublicFutureGpeStation[] };
}

export interface NearbyHeavyTransportResolverInput {
  origin: { lon: number; lat: number };
  network: TransportMapNetwork;
  localEntries: readonly NearbyStationEntry[];
  activeModes: readonly GlobalMapMode[];
  radiusMeters: number;
  journeyProvider: JourneyProvider;
  /** Optional Navitia departure datetime, e.g. 20260902T090000. */
  journeyDateTime?: string;
  /** Optional real pedestrian router used to override a bus for a short walk. */
  walkingRouteProvider?: NearbyWalkingRouteProvider;
  /** Include routed access for in-radius stations as well as projected stations. */
  includeLocalCandidates?: boolean;
  /** Future GPE stations to resolve with the same heavy-station rules. */
  futureProjects?: readonly PublicFutureGpeStation[];
}

export interface HeavyTransportResolver {
  resolve(input: NearbyHeavyTransportResolverInput): Promise<NearbyHeavyTransportCandidate[]>;
}

export interface UseNearbyHeavyTransportsOptions {
  journeyProvider?: JourneyProvider;
  resolver?: HeavyTransportResolver;
  /** Optional Navitia departure datetime used for every route probe. */
  journeyDateTime?: string;
  /** Optional real pedestrian router used for station access. */
  walkingRouteProvider?: NearbyWalkingRouteProvider;
  /** Include routed access for in-radius stations in the returned candidates. */
  includeLocalCandidates?: boolean;
  /** Future GPE stations to resolve with the same heavy-station rules. */
  futureProjects?: readonly PublicFutureGpeStation[];
}

const defaultJourneyProvider: JourneyProvider = createNearbyDataProviders().travelRoutes;

export const defaultNearbyHeavyTransportResolver: HeavyTransportResolver = {
  async resolve(input) {
    const activeHeavyModes = new Set(
      input.activeModes.filter((mode) => NEARBY_HEAVY_TRANSPORT_MODES.includes(mode)),
    );
    if (activeHeavyModes.size === 0) return [];

    const existingIds = new Set(input.localEntries.map((entry) => entry.id));
    const activeFeederModes = input.activeModes.filter((mode) => !NEARBY_HEAVY_TRANSPORT_MODES.includes(mode));
    const localLines = input.localEntries.flatMap((entry) => entry.lines)
      .filter((line) => activeFeederModes.includes(line.mode));
    const lineCandidates = new Map<string, NearbyHeavyTargetCandidate[]>();
    const projectedFeederLinesCache = new Map<string, GlobalMapLine[]>();

    function projectedFeederLines(station: GlobalMapStation, distanceMeters: number): GlobalMapLine[] {
      if (distanceMeters <= input.radiusMeters) return [];
      const cached = projectedFeederLinesCache.get(station.id);
      if (cached) return cached;

      const nearbyStations = queryStationCorrespondenceStations(
        input.network,
        station,
        STATION_CORRESPONDENCE_RADIUS_METERS,
      );
      const correspondence = buildStationCorrespondenceContext(
        [station],
        nearbyStations,
        input.network.linesById,
        { allowedModes: activeFeederModes },
      );
      projectedFeederLinesCache.set(station.id, correspondence.lines);
      return correspondence.lines;
    }

    for (const station of input.network.stations) {
      const distanceMeters = getCoordinatesDistanceMeters(
        input.origin.lat,
        input.origin.lon,
        station.lat,
        station.lon,
      );
      if (distanceMeters > NEARBY_HEAVY_SEARCH_MAX_METERS) continue;

      for (const lineId of station.lineIds) {
        const line = input.network.linesById.get(lineId);
        if (!line || !activeHeavyModes.has(line.mode)) continue;
        const candidates = lineCandidates.get(line.id) ?? [];
        candidates.push({ station, line, distanceMeters });
        lineCandidates.set(line.id, candidates);
      }
    }

    const futureTargets = (input.futureProjects ?? [])
      .map((project) => createFutureHeavyTargetCandidate(project, input.origin))
      .filter((candidate): candidate is NearbyHeavyTargetCandidate => Boolean(candidate));
    const targets = selectNearbyHeavyTargetCandidates(
      [...lineCandidates.values()].flat().concat(futureTargets),
      HEAVY_STATION_CANDIDATES_PER_LINE,
    );

    const resolved = await mapWithConcurrency(
      targets,
      HEAVY_RESOLUTION_CONCURRENCY,
      async ({ station, line, distanceMeters, futureProject }) => {
        const correspondenceLines = projectedFeederLines(station, distanceMeters);
        const feederLines = mergeNearbyHeavyFeederLines(
          localLines,
          correspondenceLines,
        );
        const localLineIds = new Set(
          feederLines.flatMap((feederLine) => [
            feederLine.id,
            feederLine.sourceLineId,
          ].filter((value): value is string => Boolean(value))),
        );
        const localLineCodes = new Set(
          feederLines.flatMap((feederLine) => [
            feederLine.code,
            feederLine.label,
            feederLine.sourceLineId,
            ...feederLine.aliases,
          ].filter((value): value is string => Boolean(value))),
        );
        const scheduledDateTime = input.journeyDateTime?.trim();
        const journeys = await input.journeyProvider.findJourneys({
          origin: input.origin,
          destination: station,
          ...(scheduledDateTime ? { datetime: scheduledDateTime } : {}),
        }).catch(() => []);
        const currentAlternatives = listNearbyHeavyJourneyAlternatives(journeys, {
          stationDistanceMeters: distanceMeters,
          localLineIds,
          localLineCodes,
        }).map((access) => normalizeNearbyHeavyAccessLine(access, feederLines));

        // The live departure window is not enough to describe every valid
        // feeder: a daytime tram may be absent from a current-time response
        // while a bus remains available. When the caller supplies a commute
        // time, that scheduled response is authoritative; otherwise probe a
        // representative daytime window and retain both sets of feeders.
        const daytimeJourneys = scheduledDateTime
          ? []
          : await input.journeyProvider.findJourneys({
            origin: input.origin,
            destination: station,
            datetime: representativeJourneyDateTime(),
          }).catch(() => []);
        const daytimeAlternatives = listNearbyHeavyJourneyAlternatives(daytimeJourneys, {
          stationDistanceMeters: distanceMeters,
          localLineIds,
          localLineCodes,
        }).map((access) => normalizeNearbyHeavyAccessLine(access, feederLines));
        const currentAccess = currentAlternatives[0];
        const routedWalkingAccess = input.walkingRouteProvider
          ? await resolveDirectWalkingAccess(input.walkingRouteProvider, input.origin, station)
          : undefined;
        const accessAlternatives = currentAccess && isNoctilienAccess(currentAccess, feederLines)
          ? daytimeAlternatives.length > 0
            ? mergeNearbyHeavyAccessAlternatives(
              currentAlternatives.filter((candidate) => !isNoctilienAccess(candidate, feederLines)),
              daytimeAlternatives,
              routedWalkingAccess ? [routedWalkingAccess] : [],
            )
            : mergeNearbyHeavyAccessAlternatives(
              currentAlternatives,
              routedWalkingAccess ? [routedWalkingAccess] : [],
            )
          : mergeNearbyHeavyAccessAlternatives(
            currentAlternatives,
            daytimeAlternatives,
            routedWalkingAccess ? [routedWalkingAccess] : [],
          );
        const access = accessAlternatives[0];
        if (!access) return undefined;

        const entry = createHeavyEntry(station, line, input.network, distanceMeters);
        if (!input.includeLocalCandidates && existingIds.has(entry.id)) return undefined;
        return { entry, station, line, distanceMeters, access, accessAlternatives, correspondenceLines, futureProject };
      },
    );

    const byStation = new Map<string, {
      entry: NearbyStationEntry;
      station: GlobalMapStation;
      lines: GlobalMapLine[];
      accesses: Record<string, NearbyHeavyTransportAccess>;
      accessAlternatives: Record<string, NearbyHeavyTransportAccess[]>;
      correspondenceLines: GlobalMapLine[];
      futureProjectsByLine: Record<string, PublicFutureGpeStation>;
      distanceMeters: number;
    }>();
    for (const result of resolved) {
      if (!result) continue;
      const existing = byStation.get(result.entry.id);
      if (existing) {
        existing.lines.push(result.line);
        existing.accesses[result.line.id] = result.access;
        existing.accessAlternatives[result.line.id] = result.accessAlternatives;
        if (result.futureProject) existing.futureProjectsByLine[result.line.id] = result.futureProject;
        existing.correspondenceLines = mergeNearbyHeavyFeederLines(
          existing.correspondenceLines,
          result.correspondenceLines,
        );
        existing.distanceMeters = Math.min(existing.distanceMeters, result.distanceMeters);
      } else {
        byStation.set(result.entry.id, {
          entry: { ...result.entry, lines: [result.line] },
          station: result.station,
          lines: [result.line],
          accesses: { [result.line.id]: result.access },
          accessAlternatives: { [result.line.id]: result.accessAlternatives },
          correspondenceLines: result.correspondenceLines,
          futureProjectsByLine: result.futureProject ? { [result.line.id]: result.futureProject } : {},
          distanceMeters: result.distanceMeters,
        });
      }
    }

    const resolvedCandidates = [...byStation.values()]
      .map((value) => {
        const access = Object.values(value.accesses).sort((left, right) =>
          getNearbyHeavyAccessTravelSeconds(left) - getNearbyHeavyAccessTravelSeconds(right)
            || left.totalSeconds - right.totalSeconds,
        )[0];
        const accessAlternativesByLine = value.accessAlternatives;
        const accessAlternatives = mergeNearbyHeavyAccessAlternatives(
          ...Object.values(accessAlternativesByLine),
        );
        return {
          id: value.entry.id,
          entry: value.entry,
          station: value.station,
          lines: value.lines,
          distanceMeters: value.distanceMeters,
          access,
          accessByLine: value.accesses,
          accessAlternatives,
          accessAlternativesByLine,
          correspondenceLines: value.correspondenceLines,
          futureProjectsByLine: Object.keys(value.futureProjectsByLine).length > 0
            ? value.futureProjectsByLine
            : undefined,
          projected: value.distanceMeters > input.radiusMeters,
        } satisfies NearbyHeavyTransportCandidate;
      })
      .sort((left, right) => left.distanceMeters - right.distanceMeters || left.station.name.localeCompare(right.station.name, "fr"));

    return limitNearbyHeavyProjectedStations(resolvedCandidates, input.origin);
  },
};

export function useNearbyHeavyTransports(
  source: NearbyHeavyTransportSource,
  options: UseNearbyHeavyTransportsOptions = {},
) {
  const candidates = ref<NearbyHeavyTransportCandidate[]>([]);
  const isLoading = ref(false);
  const error = ref<string>();
  const hiddenStationIds = ref<Set<string>>(new Set());
  const requestToken = ref(0);
  let refreshTimer: number | undefined;
  let refreshInterval: number | undefined;

  const resolver = options.resolver ?? defaultNearbyHeavyTransportResolver;
  const journeyProvider = options.journeyProvider ?? defaultJourneyProvider;
  const visibleCandidates = computed(() => candidates.value.filter((candidate) => !hiddenStationIds.value.has(candidate.id)));

  async function refresh(): Promise<void> {
    const origin = source.origin.value;
    const network = source.network?.value;
    if (!origin || !network) {
      candidates.value = [];
      return;
    }

    const token = requestToken.value + 1;
    requestToken.value = token;
    isLoading.value = true;
    error.value = undefined;
    try {
      const next = await resolver.resolve({
        origin,
        network,
        localEntries: source.stations.value,
        activeModes: source.activeModes.value,
        radiusMeters: source.radius.value,
        journeyProvider,
        journeyDateTime: options.journeyDateTime,
        walkingRouteProvider: options.walkingRouteProvider,
        includeLocalCandidates: options.includeLocalCandidates,
        futureProjects: source.futureProjects?.value ?? [],
      });
      if (token === requestToken.value) candidates.value = next;
    } catch (cause) {
      if (token === requestToken.value) {
        candidates.value = [];
        error.value = cause instanceof Error ? cause.message : "heavy-transport-unavailable";
      }
    } finally {
      if (token === requestToken.value) isLoading.value = false;
    }
  }

  function refreshSoon(): void {
    if (typeof window === "undefined") return;
    if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshTimer = undefined;
      void refresh();
    }, 100);
  }

  function hideStation(stationId: string): void {
    hiddenStationIds.value = new Set(hiddenStationIds.value).add(stationId);
  }

  function toggleStation(stationId: string): void {
    const next = new Set(hiddenStationIds.value);
    if (next.has(stationId)) next.delete(stationId);
    else next.add(stationId);
    hiddenStationIds.value = next;
  }

  function resetVisibility(): void {
    hiddenStationIds.value = new Set();
  }

  watch(
    () => [
      source.origin.value?.lon,
      source.origin.value?.lat,
      source.network?.value,
      source.activeModes.value.join(","),
      source.stations.value.map((entry) => entry.id).join(","),
      source.futureProjects?.value.map((project) => `${project.id}:${project.line}:${project.lon}:${project.lat}`).join(",") ?? "",
    ],
    refreshSoon,
    { immediate: true },
  );

  onMounted(() => {
    refreshInterval = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void refresh();
    }, HEAVY_REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  });

  onBeforeUnmount(() => {
    requestToken.value += 1;
    if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    if (refreshInterval !== undefined) window.clearInterval(refreshInterval);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });

  function handleVisibilityChange(): void {
    if (document.visibilityState !== "hidden") void refresh();
  }

  return {
    candidates: computed(() => candidates.value),
    visibleCandidates,
    hiddenStationIds: computed(() => hiddenStationIds.value),
    isLoading: readonly(isLoading),
    error: readonly(error),
    refresh,
    hideStation,
    toggleStation,
    resetVisibility,
  };
}

/**
 * Keep GPE targets compatible with the global-map heavy resolver without
 * pretending that a future line already has active map geometry. The
 * station is only a coordinate target; its access is still obtained from the
 * same Navitia and walking probes as every projected heavy station.
 */
function createFutureHeavyTargetCandidate(
  project: PublicFutureGpeStation,
  origin: { lon: number; lat: number },
): NearbyHeavyTargetCandidate | undefined {
  const lineCode = project.line.trim();
  if (!lineCode || !Number.isFinite(project.lon) || !Number.isFinite(project.lat)) return undefined;
  const lineKey = normalizeSyntheticKey(lineCode);
  const projectKey = normalizeSyntheticKey(project.id);
  if (!lineKey || !projectKey) return undefined;
  const lineId = `line:gpe:${lineKey}`;
  const stationId = `station:gpe:${projectKey}`;
  const world = lonLatToWorld({ lon: project.lon, lat: project.lat });
  const line: GlobalMapLine = {
    id: lineId,
    index: -1,
    code: lineCode,
    label: lineCode,
    mode: "METRO",
    color: "#00a88f",
    textColor: "#ffffff",
    aliases: [],
    stationIds: [stationId],
    geometryIds: [],
    sourceLineId: project.id,
    sourceMode: "METRO",
  };
  const station: GlobalMapStation = {
    id: stationId,
    index: -1,
    name: project.name,
    normalizedName: project.name.trim().toLocaleLowerCase("fr-FR"),
    aliases: [],
    rawRefs: [project.id],
    lineIds: [lineId],
    ownerChunkId: "gpe-future",
    isHub: true,
    sourceCrs: "EPSG:2154",
    sourceX: 0,
    sourceY: 0,
    lon: project.lon,
    lat: project.lat,
    worldX: world.x,
    worldY: world.y,
    coordinateSource: "official-open-data",
    transformVersion: "lambert93-ntf-v1",
  };
  return {
    station,
    line,
    distanceMeters: getCoordinatesDistanceMeters(origin.lat, origin.lon, station.lat, station.lon),
    futureProject: project,
  };
}

function normalizeSyntheticKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLocaleLowerCase("fr-FR");
}

function representativeJourneyDateTime(): string {
  const date = new Date();
  const midday = new Date(date);
  midday.setHours(12, 0, 0, 0);
  if (midday.getTime() <= date.getTime()) midday.setDate(midday.getDate() + 1);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${midday.getFullYear()}${pad(midday.getMonth() + 1)}${pad(midday.getDate())}T${pad(midday.getHours())}${pad(midday.getMinutes())}${pad(midday.getSeconds())}`;
}

function isNoctilienAccess(
  access: NearbyHeavyTransportAccess,
  localLines: readonly GlobalMapLine[],
): boolean {
  if (access.kind !== "connection") return false;
  const feederCode = access.feederLineCode?.trim().toLocaleUpperCase("fr-FR");
  if (feederCode?.startsWith("N") && /\d/u.test(feederCode.slice(1))) return true;
  return localLines.some((line) => {
    if (line.mode !== "NOCTILIEN") return false;
    if (access.feederLineId && line.id === access.feederLineId) return true;
    return Boolean(
      access.feederLineCode &&
      [line.code, line.label, ...line.aliases].some((value) =>
        value.trim().toLocaleLowerCase("fr-FR") === access.feederLineCode!.trim().toLocaleLowerCase("fr-FR")),
    );
  });
}

function mergeNearbyHeavyFeederLines(
  ...groups: readonly (readonly GlobalMapLine[])[]
): GlobalMapLine[] {
  const linesByKey = new Map<string, GlobalMapLine>();

  for (const group of groups) {
    for (const line of group) {
      const key = (line.code || line.sourceLineId || line.id).trim().toLocaleLowerCase("fr-FR");
      if (!linesByKey.has(key)) linesByKey.set(key, line);
    }
  }

  return [...linesByKey.values()];
}

function normalizeNearbyHeavyAccessLine(
  access: NearbyHeavyTransportAccess,
  feederLines: readonly GlobalMapLine[],
): NearbyHeavyTransportAccess {
  if (access.kind !== "connection") return access;
  const reference = access.feederLineCode?.trim() || access.feederLineId?.trim();
  if (!reference) return access;

  const line = feederLines.find((candidate) => [
    candidate.id,
    candidate.code,
    candidate.label,
    candidate.sourceLineId ?? "",
    ...candidate.aliases,
  ].some((candidateReference) =>
    lineReferenceVariants(candidateReference).some((variant) =>
      lineReferenceVariants(reference).includes(variant),
    ),
  ));
  if (!line) return access;

  return {
    ...access,
    feederLineId: line.id,
    feederLineCode: line.code || line.label,
    feederMode: line.mode,
  };
}

function lineReferenceVariants(value: string): string[] {
  const normalized = value.trim().toLocaleLowerCase("fr-FR");
  const variants = new Set([normalized]);
  const parenthetical = /\((?:ex(?:\.|\s+)?|anciennement\s+)?([^)]*)\)/giu;
  for (const match of normalized.matchAll(parenthetical)) {
    const alias = match[1]?.trim();
    if (alias) variants.add(alias);
  }
  return [...variants];
}

function mergeNearbyHeavyAccessAlternatives(
  ...groups: readonly (readonly NearbyHeavyTransportAccess[])[]
): NearbyHeavyTransportAccess[] {
  const alternatives = new Map<string, NearbyHeavyTransportAccess>();

  for (const group of groups) {
    for (const access of group) {
      const key = access.kind === "direct"
        ? "direct"
        : `connection:${(access.feederLineCode ?? access.feederLineId ?? access.feederMode ?? "unknown").trim().toLocaleLowerCase("fr-FR")}`;
      const existing = alternatives.get(key);
      if (!existing || compareNearbyHeavyAccess(access, existing) < 0) {
        alternatives.set(key, access);
      }
    }
  }

  return [...alternatives.values()].sort(compareNearbyHeavyAccess);
}

function compareNearbyHeavyAccess(
  left: NearbyHeavyTransportAccess,
  right: NearbyHeavyTransportAccess,
): number {
  const leftShortWalk = left.kind === "direct" && left.walkingSeconds < 10 * 60;
  const rightShortWalk = right.kind === "direct" && right.walkingSeconds < 10 * 60;
  const leftBusConnection = left.kind === "connection" && (left.feederMode === "BUS" || left.feederMode === "NOCTILIEN");
  const rightBusConnection = right.kind === "connection" && (right.feederMode === "BUS" || right.feederMode === "NOCTILIEN");
  if (leftShortWalk !== rightShortWalk && (leftShortWalk || rightShortWalk)) {
    if (leftShortWalk && rightBusConnection) return -1;
    if (rightShortWalk && leftBusConnection) return 1;
  }
  return getNearbyHeavyAccessTravelSeconds(left) - getNearbyHeavyAccessTravelSeconds(right) ||
    left.totalSeconds - right.totalSeconds ||
    left.walkingSeconds - right.walkingSeconds ||
    (left.feederRideSeconds ?? Number.POSITIVE_INFINITY) - (right.feederRideSeconds ?? Number.POSITIVE_INFINITY) ||
    (left.feederLineCode ?? left.feederLineId ?? "").localeCompare(right.feederLineCode ?? right.feederLineId ?? "", "fr");
}

async function resolveDirectWalkingAccess(
  provider: NearbyWalkingRouteProvider,
  origin: { lon: number; lat: number },
  station: Pick<GlobalMapStation, "lon" | "lat">,
): Promise<NearbyHeavyTransportAccess | undefined> {
  const route = await provider(origin, station).catch(() => undefined);
  if (!route || route.provider === "straight-line" || route.fallback === true) return undefined;
  if (!Number.isFinite(route.durationSeconds) || route.durationSeconds < 0) return undefined;
  const durationSeconds = Math.round(route.durationSeconds);
  if (durationSeconds > 30 * 60) return undefined;
  return {
    kind: "direct",
    walkingSeconds: durationSeconds,
    totalWalkingSeconds: durationSeconds,
    totalSeconds: durationSeconds,
    movementSeconds: durationSeconds,
    initialWaitSeconds: 0,
    scoreSeconds: durationSeconds,
    travelSeconds: durationSeconds,
  };
}

function createHeavyEntry(
  station: GlobalMapStation,
  line: GlobalMapLine,
  network: TransportMapNetwork,
  distanceMeters: number,
): NearbyStationEntry {
  const group = groupGlobalMapStations([station], network.lines)[0];
  if (!group) throw new Error("heavy-station-group-missing");
  return {
    id: group.id,
    station: group,
    memberStations: [station],
    lines: [line],
    distanceMeters,
    lineDistanceMeters: { [line.id]: distanceMeters },
    lineInsideRadius: { [line.id]: true },
    // Supplemental entries are eligible for their own schedules even when
    // their real station is outside the adjustable local radius.
    insideRadius: true,
  };
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index]);
    }
  }));
  return results;
}
