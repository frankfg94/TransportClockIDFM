import { getCoordinatesDistanceMeters } from "../../services/distance";
import type {
  BoardDeparturesResult,
  DirectionGroupConfig,
  LineRouteSequence,
  LineRouteStop,
  LineSearchOption,
  StationSearchOption,
  TransitBoardConfig,
} from "../../types/transit";
import {
  createIdfmStopReferenceKeys,
  extractIdfmStopPointCode,
  monitoringRefToNavitiaStopAreaRef,
} from "../../services/idfmStopReferences";
import type { GlobalMapLine, GlobalMapMode, GlobalMapStation } from "../transport-map/contracts/manifest";
import type { NearbyStationEntry } from "./nearbyStations";
import type {
  NearbyHeavyTransportAccess,
  NearbyHeavyTransportCandidate,
} from "./nearbyHeavyTransports";

export const NEARBY_SCHEDULE_DISTANCE_TOLERANCE_METERS = 100;
export const NEARBY_SCHEDULE_MATCH_MAX_DISTANCE_METERS = 300;
export const NEARBY_SCHEDULE_MATCH_AMBIGUITY_MARGIN_METERS = 75;

export type NearbyStationScheduleState = "visible" | "hidden" | "loading" | "unavailable";

export type NearbyStationDirectionOrientation = "north" | "south" | "east" | "west";

export interface NearbyStationTooltipDirection {
  id: string;
  label: string;
  orientation?: NearbyStationDirectionOrientation;
}

export interface NearbyStationScheduleCandidate {
  id: string;
  stationId: string;
  line: GlobalMapLine;
  entry: NearbyStationEntry;
  mapStation: GlobalMapStation;
  distanceMeters: number;
  access?: NearbyHeavyTransportAccess;
  projected?: boolean;
}

export interface NearbyStationScheduleItem extends NearbyStationScheduleCandidate {
  state: NearbyStationScheduleState;
  station?: StationSearchOption;
  lineOption?: LineSearchOption;
  board?: TransitBoardConfig;
  result?: BoardDeparturesResult;
  tooltipDirections?: NearbyStationTooltipDirection[];
  error?: string;
}

/**
 * Keep the last hydrated board mounted while a new snapshot is being fetched.
 * Candidate metadata may change during a scan, but the board/result/state must
 * remain visible until hydration finishes so map badges and cards do not blink.
 */
export function mergeNearbyScheduleRefreshItems(
  candidates: readonly NearbyStationScheduleCandidate[],
  items: readonly NearbyStationScheduleItem[],
): NearbyStationScheduleItem[] {
  const currentCandidateIds = new Set(candidates.map((candidate) => candidate.id));
  const previousById = new Map(items.map((item) => [item.id, item]));

  return [
    ...candidates.map((candidate) => {
      const previous = previousById.get(candidate.id);
      return previous
        ? { ...previous, ...candidate }
        : { ...candidate, state: "loading" as const };
    }),
    ...items.filter((item) => !currentCandidateIds.has(item.id)),
  ];
}

export interface NearbyStationScheduleMetadata {
  station: StationSearchOption;
  line: LineSearchOption;
  board: TransitBoardConfig;
  directionGroups: DirectionGroupConfig[];
  tooltipDirections: NearbyStationTooltipDirection[];
}

/**
 * Topology-enriched nearby boards can use theoretical Navitia schedules even
 * when SIRI has no vehicle currently monitored at the stop. The attached
 * SIRI stop-area ref is the stable bridge to that schedule endpoint.
 */
export function addTopologyScheduleStopAreaRef(
  station: StationSearchOption,
  directionGroups: readonly DirectionGroupConfig[],
): StationSearchOption {
  if (station.scheduleStopAreaRef) return station;

  const scheduleStopAreaRef = directionGroups
    .flatMap((group) => group.match.monitoringRefs ?? [])
    .map(monitoringRefToNavitiaStopAreaRef)
    .find((reference): reference is string => Boolean(reference));

  return scheduleStopAreaRef
    ? { ...station, scheduleStopAreaRef }
    : station;
}

/**
 * A successful board can legitimately contain no future departure when every
 * direction has reached its last service. Keep that board visible so the
 * station and its directions remain useful, but expose the terminal state to
 * compact and full schedule renderers.
 */
export function isNearbyScheduleServiceEnded(
  item: Pick<NearbyStationScheduleItem, "state" | "result">,
): boolean {
  const groups = item.result?.directionGroups ?? [];
  return item.state === "visible" && groups.length > 0 &&
    groups.every((group) => group.serviceEnded && group.departures.length === 0);
}

/** Injectable visibility boundary used by the map page and unit tests. */
export interface ScheduleVisibilityStore {
  isStationHidden(stationId: string): boolean;
  isDirectionHidden(directionId: string): boolean;
  toggleStation(stationId: string): void;
  toggleDirection(directionId: string): void;
  reset(): void;
}

export function selectNearbyScheduleCandidates(
  entries: readonly NearbyStationEntry[],
  activeModes: readonly GlobalMapMode[],
  toleranceMeters = NEARBY_SCHEDULE_DISTANCE_TOLERANCE_METERS,
  supplementalCandidates: readonly NearbyStationScheduleCandidate[] = [],
): NearbyStationScheduleCandidate[] {
  const activeModeSet = new Set(activeModes);
  const byLine = new Map<string, NearbyStationScheduleCandidate[]>();

  for (const entry of entries) {
    if (!entry.insideRadius) continue;

    for (const line of entry.lines) {
      if (!activeModeSet.has(line.mode)) continue;
      if (entry.lineInsideRadius && entry.lineInsideRadius[line.id] === false) continue;
      const mapStation = entry.memberStations.find((station) => station.lineIds.includes(line.id)) ?? entry.station;
      const candidate: NearbyStationScheduleCandidate = {
        id: `${entry.id}:${line.id}`,
        stationId: entry.id,
        line,
        entry,
        mapStation,
        distanceMeters: entry.lineDistanceMeters?.[line.id] ?? entry.distanceMeters,
      };
      const candidates = byLine.get(line.id) ?? [];
      candidates.push(candidate);
      byLine.set(line.id, candidates);
    }
  }

  const localCandidates = [...byLine.values()]
    .flatMap((candidates) => {
      const nearestDistance = Math.min(...candidates.map((candidate) => candidate.distanceMeters));
      return candidates.filter(
        (candidate) => candidate.distanceMeters <= nearestDistance + toleranceMeters,
      );
    })
    .filter((candidate) => !supplementalCandidates.some((supplemental) => supplemental.id === candidate.id));

  // Supplemental heavy stations are route-access candidates, not ordinary
  // nearby stops. They must not be discarded merely because another station
  // on the same line is closer to the origin: Croix de Berny can be reachable
  // through T10 while Robinson is the closest RER B station on foot.
  const supplemental = supplementalCandidates.filter((candidate) => activeModeSet.has(candidate.line.mode));

  return [...localCandidates, ...supplemental]
    .sort((left, right) =>
      left.distanceMeters - right.distanceMeters ||
      left.line.code.localeCompare(right.line.code, "fr", { numeric: true }) ||
      left.entry.station.name.localeCompare(right.entry.station.name, "fr"),
    );
}

export function selectSupplementalScheduleCandidates(
  candidates: readonly NearbyHeavyTransportCandidate[],
  activeModes: readonly GlobalMapMode[],
): NearbyStationScheduleCandidate[] {
  const activeModeSet = new Set(activeModes);
  return candidates.flatMap((candidate) => candidate.lines
    .filter((line) => activeModeSet.has(line.mode))
    .map((line) => ({
      id: `${candidate.id}:${line.id}`,
      stationId: candidate.id,
      line,
      entry: candidate.entry,
      mapStation: candidate.station,
      distanceMeters: candidate.distanceMeters,
      access: candidate.accessByLine[line.id] ?? candidate.access,
      projected: candidate.projected,
    })));
}

export function scheduleDirectionId(itemId: string, directionId: string): string {
  return `${itemId}:${directionId}`;
}

/**
 * Builds SIRI-ready direction groups from the cache-backed NeTEx topology.
 * The pattern quay identifies the correct direction at the current stop, so
 * Nearby boards do not need a Navitia stop_schedules discovery request.
 */
export function createNearbyDirectionGroupsFromTopology(
  candidate: NearbyStationScheduleCandidate,
  sequences: readonly LineRouteSequence[],
): DirectionGroupConfig[] {
  const servingStations = candidate.entry.memberStations.filter((station) =>
    station.lineIds.includes(candidate.line.id),
  );
  const groups = new Map<string, DirectionGroupConfig>();

  for (const sequence of sequences) {
    const stopIndex = findNearbySequenceStopIndex(servingStations, sequence);
    if (stopIndex < 0) continue;

    const stop = sequence.stops[stopIndex]!;
    const terminal = sequence.stops.at(-1);
    const label = nearbySequenceDirectionLabel(sequence, terminal);
    if (!label) continue;

    const id = normalizeStationLabel(label).replace(/\s+/gu, "-")
      || `direction-${groups.size + 1}`;
    const existing = groups.get(id);
    const monitoringRefs = [
      ...(existing?.match.monitoringRefs ?? []),
      stop.station.monitoringRef,
    ].filter((reference, index, references): reference is string =>
      Boolean(reference?.trim()) && references.indexOf(reference) === index,
    );
    const navitiaStopPointRefs = [
      ...(existing?.match.navitiaStopPointRefs ?? []),
      ...(stop.quays ?? []).map((quay) => quay.id),
    ].filter((reference, index, references) =>
      Boolean(extractIdfmStopPointCode(reference)) && references.indexOf(reference) === index,
    );
    const destinationIncludes = [
      ...(existing?.match.destinationIncludes ?? []),
      label,
      terminal?.label,
    ].filter((value, index, values): value is string =>
      Boolean(value?.trim()) && values.indexOf(value) === index,
    );

    groups.set(id, {
      id,
      label,
      match: {
        destinationIncludes,
        ...(monitoringRefs.length > 0
          ? { monitoringRefs }
          : navitiaStopPointRefs.length > 0
            ? { navitiaStopPointRefs }
            : {}),
      },
      isTerminal: stopIndex === sequence.stops.length - 1,
    });
  }

  if (groups.size > 0) return [...groups.values()];

  const navitiaStopPointRefs = servingStations
    .flatMap((station) => [station.id, ...station.rawRefs])
    .filter((reference, index, references) =>
      Boolean(extractIdfmStopPointCode(reference)) && references.indexOf(reference) === index,
    );

  return [{
    id: "all-directions",
    label: candidate.entry.station.name,
    match: navitiaStopPointRefs.length > 0 ? { navitiaStopPointRefs } : {},
  }];
}

/**
 * Creates the compact direction metadata shown when an inline schedule badge
 * is held. The orientation is derived from the current stop toward the route's
 * terminal, so it follows the actual topology instead of a station-specific
 * or line-specific lookup table.
 */
export function createNearbyTooltipDirectionsFromTopology(
  candidate: NearbyStationScheduleCandidate,
  sequences: readonly LineRouteSequence[],
): NearbyStationTooltipDirection[] {
  const servingStations = candidate.entry.memberStations.filter((station) =>
    station.lineIds.includes(candidate.line.id),
  );
  const directions = new Map<string, NearbyStationTooltipDirection>();

  for (const sequence of sequences) {
    const stopIndex = findNearbySequenceStopIndex(servingStations, sequence);
    if (stopIndex < 0) continue;

    const terminal = sequence.stops.at(-1);
    const label = nearbySequenceDirectionLabel(sequence, terminal);
    if (!label) continue;

    const id = normalizeStationLabel(label).replace(/\s+/gu, "-")
      || `direction-${directions.size + 1}`;
    if (directions.has(id)) continue;

    const orientation = terminal
      ? directionOrientation(sequence.stops[stopIndex]!, terminal)
      : undefined;
    directions.set(id, {
      id,
      label,
      ...(orientation ? { orientation } : {}),
    });
  }

  return [...directions.values()];
}

function findNearbySequenceStopIndex(
  servingStations: readonly GlobalMapStation[],
  sequence: LineRouteSequence,
): number {
  const candidateKeys = new Set(
    servingStations
      .flatMap((station) => [station.id, ...station.rawRefs])
      .flatMap(createIdfmStopReferenceKeys),
  );

  return sequence.stops.findIndex((stop) =>
    [
      stop.id,
      stop.station.id,
      stop.station.monitoringRef,
      ...(stop.quays ?? []).map((quay) => quay.id),
    ]
      .flatMap(createIdfmStopReferenceKeys)
      .some((key) => candidateKeys.has(key)),
  );
}

function nearbySequenceDirectionLabel(
  sequence: LineRouteSequence,
  terminal: LineRouteStop | undefined,
): string {
  return sequence.direction?.trim()
    || terminal?.label?.trim()
    || sequence.label.trim();
}

function directionOrientation(
  currentStop: LineRouteStop,
  terminal: LineRouteStop,
): NearbyStationDirectionOrientation | undefined {
  const current = stopCoordinates(currentStop);
  const destination = stopCoordinates(terminal);
  if (!current || !destination) return undefined;

  const latitudeRadians = ((current.lat + destination.lat) / 2) * Math.PI / 180;
  const deltaEast = (destination.lon - current.lon) * Math.cos(latitudeRadians);
  const deltaNorth = destination.lat - current.lat;
  if (Math.hypot(deltaEast, deltaNorth) < 1e-9) return undefined;

  if (Math.abs(deltaEast) > Math.abs(deltaNorth)) return deltaEast > 0 ? "east" : "west";
  return deltaNorth > 0 ? "north" : "south";
}

function stopCoordinates(stop: LineRouteStop): { lon: number; lat: number } | undefined {
  const lon = stop.lon ?? stop.station.lon;
  const lat = stop.lat ?? stop.station.lat;
  return typeof lon === "number" && Number.isFinite(lon) &&
    typeof lat === "number" && Number.isFinite(lat)
    ? { lon, lat }
    : undefined;
}

export function createNearbyScheduleId(
  candidate: Pick<NearbyStationScheduleCandidate, "stationId" | "line">,
): string {
  return `${candidate.stationId}:${candidate.line.id}`;
}

export function matchNearbyStationToIdfmStation(
  candidate: NearbyStationScheduleCandidate,
  stations: readonly StationSearchOption[],
): StationSearchOption | undefined {
  if (stations.length === 0) return undefined;

  const mapLabels = new Set(
    [
      candidate.mapStation.name,
      ...candidate.mapStation.aliases,
      candidate.entry.station.name,
      ...candidate.entry.station.aliases,
      ...candidate.entry.memberStations.flatMap((station) => [station.name, ...station.aliases]),
    ]
      .map(normalizeStationLabel)
      .filter(Boolean),
  );
  const mapCity = normalizeStationLabel(candidate.mapStation.city ?? candidate.entry.station.city);
  const named = stations.filter((station) => mapLabels.has(normalizeStationLabel(station.label)));
  const cityNamed = mapCity
    ? named.filter((station) => normalizeStationLabel(station.city) === mapCity)
    : named;
  const namedCandidates = cityNamed.length > 0 ? cityNamed : named;

  if (namedCandidates.length > 0) {
    return selectBestStationCandidate(candidate, namedCandidates, false);
  }

  return selectBestStationCandidate(candidate, stations, true);
}

export function normalizeStationLabel(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function selectBestStationCandidate(
  mapCandidate: NearbyStationScheduleCandidate,
  stations: readonly StationSearchOption[],
  allowCoordinateFallback: boolean,
): StationSearchOption | undefined {
  const ranked = stations
    .map((station) => ({
      station,
      distanceMeters: stationDistanceMeters(mapCandidate, station),
    }))
    .sort((left, right) => left.distanceMeters - right.distanceMeters);

  if (ranked.length === 0) return undefined;
  if (ranked[0].distanceMeters === Number.POSITIVE_INFINITY) {
    return ranked.length === 1 && !allowCoordinateFallback ? ranked[0].station : undefined;
  }

  if (allowCoordinateFallback && ranked[0].distanceMeters > NEARBY_SCHEDULE_MATCH_MAX_DISTANCE_METERS) {
    return undefined;
  }

  const second = ranked[1];
  if (
    second &&
    second.distanceMeters - ranked[0].distanceMeters < NEARBY_SCHEDULE_MATCH_AMBIGUITY_MARGIN_METERS
  ) {
    return undefined;
  }

  return ranked[0].station;
}

function stationDistanceMeters(
  candidate: NearbyStationScheduleCandidate,
  station: StationSearchOption,
): number {
  if (
    typeof station.lat !== "number" ||
    typeof station.lon !== "number" ||
    !Number.isFinite(station.lat) ||
    !Number.isFinite(station.lon)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  return getCoordinatesDistanceMeters(
    candidate.mapStation.lat,
    candidate.mapStation.lon,
    station.lat,
    station.lon,
  );
}
