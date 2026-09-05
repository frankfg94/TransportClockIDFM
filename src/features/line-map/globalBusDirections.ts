import type {
  LineRouteSequence,
  LineSearchOption,
} from "../../types/transit";
import type {
  GlobalMapLine,
  GlobalMapPath,
  GlobalMapStation,
} from "../transport-map/contracts/manifest";
import type { TransitQuay } from "../../types/transit";
import { getCoordinatesDistanceKm } from "../../services/distance";
import {
  selectGlobalMapDirection,
  selectGlobalBusMapDirection,
  type BusMapDirectionSelection,
} from "./lineMapData";

const BUS_DIRECTION_COORDINATE_MAX_DISTANCE_KM = 0.3;
const BUS_DIRECTION_COORDINATE_AMBIGUITY_MARGIN_KM = 0.05;

/**
 * The global-map pack stores station references on line/path rows while the
 * live topology may expose the same reference with a different transport
 * prefix (station, stop-point, or quay). Keeping this normalization local
 * lets the V1 direction algorithm select V2 geometry without a line-specific
 * lookup table.
 */
function normalizeStationReference(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^(?:station|stop[-_]?point|stop[-_]?area|quay):/u, "")
    .replace(/[^a-z0-9]+/gu, "");
}

/**
 * The global-map path contract preserves station order. Keep that order when
 * matching a live NeTEx pattern: a bus can use different streets from A to B
 * and B to A, even when both legs share the same commercial stations.
 */
function directedEdgeKey(from: string, to: string): string {
  return `${from}::${to}`;
}

function normalizeStationLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[’']/gu, "'")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

interface GlobalBusStationResolver {
  byReference: Map<string, string>;
  byLabel: Map<string, string[]>;
  stationsById: Map<string, GlobalMapStation>;
  stations: GlobalMapStation[];
}

function createGlobalBusStationResolver(
  line: GlobalMapLine,
  stations: readonly GlobalMapStation[],
): GlobalBusStationResolver {
  const lineStationIds = new Set(line.stationIds);
  const lineStations = stations.filter((station) => lineStationIds.has(station.id));
  const byReference = new Map<string, string>();
  const byLabel = new Map<string, string[]>();
  const stationsById = new Map(lineStations.map((station) => [station.id, station]));

  for (const station of lineStations) {
    for (const reference of [station.id, ...station.rawRefs]) {
      const normalized = normalizeStationReference(reference);
      if (normalized) byReference.set(normalized, station.id);
    }
    for (const label of [
      station.name,
      station.normalizedName,
      ...station.aliases,
    ]) {
      const normalized = normalizeStationLabel(label);
      if (!normalized) continue;
      const candidates = byLabel.get(normalized) ?? [];
      if (!candidates.includes(station.id)) candidates.push(station.id);
      byLabel.set(normalized, candidates);
    }
  }

  return { byReference, byLabel, stationsById, stations: lineStations };
}

function nearestGlobalBusStationId(
  stop: LineRouteSequence["stops"][number],
  candidates: readonly GlobalMapStation[],
): string | undefined {
  if (typeof stop.lon !== "number" || typeof stop.lat !== "number") {
    return undefined;
  }

  const nearest = candidates
    .map((station) => ({
      stationId: station.id,
      distanceKm: getCoordinatesDistanceKm(
        stop.lat!,
        stop.lon!,
        station.lat,
        station.lon,
      ),
    }))
    .sort((left, right) => left.distanceKm - right.distanceKm);
  const first = nearest[0];
  const second = nearest[1];
  if (
    !first ||
    first.distanceKm > BUS_DIRECTION_COORDINATE_MAX_DISTANCE_KM ||
    (second &&
      second.distanceKm - first.distanceKm <
        BUS_DIRECTION_COORDINATE_AMBIGUITY_MARGIN_KM)
  ) {
    return undefined;
  }

  return first.stationId;
}

function resolveGlobalBusStopId(
  stop: LineRouteSequence["stops"][number],
  resolver: GlobalBusStationResolver,
): string | undefined {
  const directId = [stop.id, stop.station.id]
    .map((reference) => resolver.byReference.get(
      normalizeStationReference(reference),
    ))
    .find((candidate): candidate is string => Boolean(candidate));
  if (directId) return directId;

  const candidates = resolver.byLabel.get(normalizeStationLabel(stop.label)) ?? [];
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.length > 1) {
    return nearestGlobalBusStationId(
      stop,
      candidates
        .map((stationId) => resolver.stationsById.get(stationId))
        .filter((station): station is GlobalMapStation => Boolean(station)),
    );
  }

  return nearestGlobalBusStationId(stop, resolver.stations);
}

export function createGlobalBusLineSearchOption(
  line: GlobalMapLine,
): LineSearchOption {
  return {
    family: "BUS",
    id: line.id,
    label: line.label || line.code,
    ref: line.sourceLineId ?? line.id,
    navitiaId: line.id,
    color: line.color,
    textColor: line.textColor,
    iconUrl: line.pictogram ?? undefined,
  };
}

export function resolveGlobalBusDirection(
  sequences: LineRouteSequence[],
  selectedDirectionId?: string,
): BusMapDirectionSelection | undefined {
  return selectGlobalBusMapDirection(sequences, selectedDirectionId);
}

/**
 * Mode-agnostic direction resolver used by the global map.  The helpers in
 * this module keep their legacy Bus name for the existing geometry tests, but
 * their station/path matching is valid for rail, metro, tram and cable lines
 * as well.
 */
export function resolveGlobalDirection(
  sequences: LineRouteSequence[],
  selectedDirectionId?: string,
): BusMapDirectionSelection | undefined {
  return selectGlobalMapDirection(sequences, selectedDirectionId);
}

/**
 * Returns the global-pack station ids in the same order as the selected
 * topology sequence. Unknown live references are ignored; callers can then
 * fall back to the complete static line instead of rendering an incomplete
 * line because an API payload changed shape.
 */
export function getGlobalBusDirectionStationIds(
  line: GlobalMapLine,
  selection: BusMapDirectionSelection,
  stations: readonly GlobalMapStation[] = [],
): string[] {
  const orderedStationIds = getGlobalBusDirectionOrderedStopIds(line, selection, stations);
  return [...new Set(orderedStationIds)];
}

/**
 * Keeps every occurrence from the live topology. Unlike the station-label
 * list used by the sidebar, geometry assembly must retain a repeated quay so
 * a loop or an out-and-back branch is never collapsed into a chord.
 */
export function getGlobalBusDirectionOrderedStopIds(
  line: GlobalMapLine,
  selection: BusMapDirectionSelection,
  stations: readonly GlobalMapStation[] = [],
): string[] {
  return getGlobalBusDirectionStopIds(line, selection, stations);
}

export interface GlobalBusDirectionQuay {
  stationId: string;
  quay: TransitQuay;
}

export interface GlobalBusDirectionPathFilterOptions {
  /**
   * The V1 global pack stores schematic segments in a deterministic
   * orientation, which is not necessarily the service direction. Allowing a
   * path to match its reverse keeps that storage detail from widening the
   * selection back to the complete line. Distinct street variants still need
   * to share a concrete station edge to match.
   */
  allowReversedPathStorage?: boolean;
}

/**
 * Keeps the raw quay attached to the selected direction's stop. The server
 * topology adapter narrows each stop to the quay used by its NeTEx pattern;
 * older or incomplete payloads may still expose all quays, which are kept as
 * a safe visual fallback.
 */
export function getGlobalBusDirectionQuays(
  line: GlobalMapLine,
  selection: BusMapDirectionSelection,
  stations: readonly GlobalMapStation[] = [],
): GlobalBusDirectionQuay[] {
  const resolver = createGlobalBusStationResolver(line, stations);
  for (const stationId of line.stationIds) {
    resolver.byReference.set(normalizeStationReference(stationId), stationId);
  }
  const seen = new Set<string>();
  const result: GlobalBusDirectionQuay[] = [];

  for (const stop of selection.sequence.stops) {
    const stationId = resolveGlobalBusStopId(stop, resolver);
    if (!stationId) continue;

    for (const quay of stop.quays ?? []) {
      const key = `${stationId}::${quay.id}`;
      if (!quay.id || seen.has(key)) continue;
      seen.add(key);
      result.push({ stationId, quay });
    }
  }

  return result;
}

function getGlobalBusDirectionStopIds(
  line: GlobalMapLine,
  selection: BusMapDirectionSelection,
  stations: readonly GlobalMapStation[],
): string[] {
  const resolver = createGlobalBusStationResolver(line, stations);
  for (const stationId of line.stationIds) {
    resolver.byReference.set(normalizeStationReference(stationId), stationId);
  }
  const stationIds: string[] = [];

  for (const stop of selection.sequence.stops) {
    const stationId = resolveGlobalBusStopId(stop, resolver);
    if (stationId) stationIds.push(stationId);
  }

  return stationIds;
}

export function getGlobalBusDirectionEdgeKeys(
  line: GlobalMapLine,
  selection: BusMapDirectionSelection,
  stations: readonly GlobalMapStation[] = [],
): Set<string> {
  const stationIds = getGlobalBusDirectionStopIds(line, selection, stations);
  const edgeKeys = new Set<string>();

  for (let index = 1; index < stationIds.length; index += 1) {
    const previous = stationIds[index - 1];
    const current = stationIds[index];
    if (previous && current && previous !== current) {
      edgeKeys.add(directedEdgeKey(previous, current));
    }
  }

  return edgeKeys;
}

export function pathMatchesGlobalBusDirection(
  path: GlobalMapPath,
  edgeKeys: ReadonlySet<string>,
  stationIds: ReadonlySet<string> = new Set(),
  options: GlobalBusDirectionPathFilterOptions = {},
): boolean {
  for (let index = 1; index < path.stationIds.length; index += 1) {
    const previous = path.stationIds[index - 1];
    const current = path.stationIds[index];
    if (!previous || !current || previous === current) continue;
    if (
      edgeKeys.has(directedEdgeKey(previous, current)) ||
      (
        options.allowReversedPathStorage === true &&
        edgeKeys.has(directedEdgeKey(current, previous))
      )
    ) {
      return true;
    }
  }

  // A few low-detail/generated segments expose only one station anchor. They
  // cannot be matched by an edge, but keeping an anchored segment is safer
  // than cutting the selected direction at that station.
  return path.stationIds.length < 2 &&
    path.stationIds.some((stationId) => stationIds.has(stationId));
}

/**
 * Keeps every clipped geometry fragment whose parent segment already
 * contributes an anchored fragment to the selected direction. A spatial tile
 * can contain a perfectly valid continuation with a different or no station
 * anchor; filtering that piece by station ids alone creates visible gaps
 * between two retained stations.
 */
export function filterPathsForGlobalBusDirection(
  paths: readonly GlobalMapPath[],
  edgeKeys: ReadonlySet<string>,
  stationIds: ReadonlySet<string> = new Set(),
  options: GlobalBusDirectionPathFilterOptions = {},
): GlobalMapPath[] {
  const pathsByBaseId = new Map<string, GlobalMapPath[]>();
  for (const path of paths) {
    const baseId = globalMapPathBaseId(path);
    const basePaths = pathsByBaseId.get(baseId) ?? [];
    basePaths.push(path);
    pathsByBaseId.set(baseId, basePaths);
  }

  const matchedBaseIds = new Set<string>();
  for (const [baseId, basePaths] of pathsByBaseId) {
    // Keep every clipped tile for a base once one of its anchored paths proves
    // that the base contains a selected edge. This preserves continuity for
    // unanchored tile fragments without allowing a shared terminal anchor to
    // select every branch of a line.
    if (basePaths.some((path) => pathHasAnyMatchingAnchoredEdge(path, edgeKeys, options))) {
      matchedBaseIds.add(baseId);
      continue;
    }

    // Low-detail packs may contain only single-station anchors. In that case
    // a base is safe only when every anchor it exposes belongs to the chosen
    // direction; a common origin alone must not select an unrelated branch.
    const anchoredStationIds = new Set(basePaths.flatMap((path) => path.stationIds));
    if (
      anchoredStationIds.size > 0 &&
      (
        basePaths.every((path) => !pathHasAnchoredEdges(path)) ||
        options.allowReversedPathStorage === true
      ) &&
      [...anchoredStationIds].every((stationId) => stationIds.has(stationId))
    ) {
      matchedBaseIds.add(baseId);
    }
  }

  return paths.filter((path) => matchedBaseIds.has(globalMapPathBaseId(path)));
}

function pathHasAnchoredEdges(path: GlobalMapPath): boolean {
  for (let index = 1; index < path.stationIds.length; index += 1) {
    const previous = path.stationIds[index - 1];
    const current = path.stationIds[index];
    if (previous && current && previous !== current) return true;
  }
  return false;
}

function pathHasAnyMatchingAnchoredEdge(
  path: GlobalMapPath,
  edgeKeys: ReadonlySet<string>,
  options: GlobalBusDirectionPathFilterOptions,
): boolean {
  if (!pathHasAnchoredEdges(path)) return false;

  for (let index = 1; index < path.stationIds.length; index += 1) {
    const previous = path.stationIds[index - 1];
    const current = path.stationIds[index];
    if (!previous || !current || previous === current) continue;
    if (
      edgeKeys.has(directedEdgeKey(previous, current)) ||
      (
        options.allowReversedPathStorage === true &&
        edgeKeys.has(directedEdgeKey(current, previous))
      )
    ) return true;
  }

  return false;
}

function globalMapPathBaseId(path: GlobalMapPath): string {
  const chunkSeparator = path.id.indexOf("#");
  return chunkSeparator >= 0 ? path.id.slice(0, chunkSeparator) : path.id;
}
