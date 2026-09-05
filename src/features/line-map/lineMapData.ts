import {
  fetchLineFrequencyProfile,
  fetchLineRouteSequences,
  fetchLineRouteSummaries,
  fetchStationTransfers,
  searchLineStations,
} from "../../services/idfm";
import type {
  LineFrequencyProfile,
  LineRouteSequence,
  LineRouteStop,
  LineSearchOption,
  StationSearchOption,
  TransitQuay,
  TransferLineOption,
} from "../../types/transit";
import type {
  LineMapBranchView,
  LineMapDirectionOption,
  LineMapQuayView,
  LineMapSegmentView,
  LineMapStopView,
  LineMapViewModel,
  MapTile,
  TransferLineDirections,
} from "./types";
import {
  convertLambert93ToWgs84,
  createGeographicViewport,
  projectLonLat,
  projectMercatorPointToViewport,
  projectTransitCoordinate,
  resolveTransitLonLat,
  type GeographicViewport,
} from "../network-ghost/geoProjection";
import { getCoordinatesDistanceKm } from "../../services/distance";
import { fetchResolvedLineGeometry } from "../../services/lineGeometry";
import { createLinePresentation } from "../../services/linePresentation";
import {
  loadTransferBundleForTarget,
  type TransferBundleTargetLoadOptions,
} from "../service-pattern/transferBundles";
import { filterCurrentLineTransfers } from "../service-pattern/transferVisibility";
import { applyResolvedLineGeometry, createLineGeometryRequest } from "./lineGeometryViewModel";

const VIEWBOX_WIDTH = 1080;
const VIEWBOX_HEIGHT = 620;
const SVG_PADDING_X = 78;
const SVG_PADDING_Y = 68;
const MAP_COORDINATE_PADDING = 0.08;
const TILE_SERVER_SHARDS = ["a", "b", "c"];
const CANONICAL_STATION_NAME_MAX_DISTANCE_KM = 0.3;
const CANONICAL_STATION_NAME_AMBIGUITY_MARGIN_KM = 0.075;
const CANONICAL_STATION_POSITION_MAX_DISTANCE_KM = 0.16;
const CANONICAL_STATION_POSITION_AMBIGUITY_MARGIN_KM = 0.15;

interface CanonicalStationLookup {
  byLabel: Map<string, StationSearchOption[]>;
  stations: StationSearchOption[];
}

interface PositionedLineMap {
  stops: LineMapStopView[];
  viewport?: GeographicViewport;
}

export type StationTransfersLoadOptions = TransferBundleTargetLoadOptions;

export async function loadDetailedLineMap(
  line: LineSearchOption,
  useGtfs = true,
  selectedDirectionId?: string,
): Promise<LineMapViewModel> {
  const useBusDirection = line.family === "BUS";
  const [sequences, stationCatalog] = await Promise.all([
    fetchLineRouteSequences(line, useBusDirection),
    searchLineStations(line, "").catch((): StationSearchOption[] => []),
  ]);
  const directionSelection = useBusDirection
    ? selectBusMapDirection(sequences, selectedDirectionId)
    : undefined;
  const selectedSequences = directionSelection
    ? [directionSelection.sequence]
    : sequences;

  const map = createDetailedLineMapViewModel(line, selectedSequences, stationCatalog);
  if (directionSelection) {
    map.directionOptions = directionSelection.options;
    map.selectedDirectionId = directionSelection.selectedDirectionId;
  }
  const request = createLineGeometryRequest(map, useGtfs);

  if (!request) return map;

  try {
    const resolution = await fetchResolvedLineGeometry(request);
    console.info(`[line-map] geometry loaded line=${line.id} source=${resolution.source}`);
    return applyResolvedLineGeometry(map, resolution);
  } catch (error) {
    console.warn(
      `[line-map] geometry fallback line=${line.id} source=direct`,
      error instanceof Error ? error.message : error,
    );
    return map;
  }
}

export interface BusMapDirectionSelection {
  sequence: LineRouteSequence;
  /** The passenger-facing, main directions. */
  options: LineMapDirectionOption[];
  /** Optional short-turn, school or branch variants of the selected main direction. */
  variants: LineMapDirectionOption[];
  selectedDirectionId: string;
  selectedMainDirectionId: string;
}

/**
 * The global map uses the same direction model for every line family.  The
 * historical Bus name is kept as a compatibility alias because the detailed
 * and global bus tests import it directly.
 */
export type GlobalMapDirectionSelection = BusMapDirectionSelection;

export const GLOBAL_MERGED_DIRECTION_ID = "global:merged";

export function defaultGlobalDirectionMerge(mode: string): boolean {
  return mode !== "BUS" && mode !== "NOCTILIEN";
}

/**
 * Rail, metro and tram lines expose their route patterns through the same
 * topology endpoint as buses. The individual direction options keep the
 * existing passenger-facing grouping; the global map adds a separate
 * synthetic "merged" direction when callers need every branch at once.
 */
export function selectGlobalMapDirection(
  sequences: LineRouteSequence[],
  selectedDirectionId?: string,
): GlobalMapDirectionSelection | undefined {
  return selectFusedGlobalMapDirection(sequences, selectedDirectionId);
}

export function selectBusMapDirection(
  sequences: LineRouteSequence[],
  selectedDirectionId?: string,
): BusMapDirectionSelection | undefined {
  const directions = new Map<
    string,
    { sequence: LineRouteSequence; option: LineMapDirectionOption }
  >();

  [...sequences]
    .sort((left, right) => right.stops.length - left.stops.length)
    .forEach((sequence) => {
      const terminal = sequence.stops.at(-1);
      if (!terminal || directions.has(terminal.id)) return;

      directions.set(terminal.id, {
        sequence,
        option: {
          id: terminal.id,
          label: sequence.direction ?? terminal.label,
          stopCount: sequence.stops.length,
        },
      });
    });

  let candidates = [...directions.values()];
  const onlyCandidate = candidates[0];
  const firstStop = onlyCandidate?.sequence.stops[0];
  const lastStop = onlyCandidate?.sequence.stops.at(-1);
  const uniqueStopCount = onlyCandidate
    ? new Set(onlyCandidate.sequence.stops.map((stop) => stop.id)).size
    : 0;

  // A closed topology loop has one terminal id by definition, so a
  // terminal-id map would otherwise discard the reverse traversal entirely.
  // Materialize that reverse generically; the compiler still receives the
  // original topology and no line-specific exception is needed.
  if (
    onlyCandidate &&
    firstStop &&
    lastStop &&
    firstStop.id === lastStop.id &&
    uniqueStopCount >= 3
  ) {
    const reverseId = `${onlyCandidate.option.id}:reverse`;
    directions.set(reverseId, {
      sequence: {
        ...onlyCandidate.sequence,
        id: `${onlyCandidate.sequence.id}:reverse`,
        stops: [...onlyCandidate.sequence.stops].reverse(),
      },
      option: {
        id: reverseId,
        label: onlyCandidate.option.label,
        stopCount: onlyCandidate.sequence.stops.length,
      },
    });
    candidates = [...directions.values()];
  }

  const selected =
    candidates.find(({ option }) => option.id === selectedDirectionId) ??
    candidates[0];
  if (!selected) return undefined;

  const hasDifferentDirections = candidates.length > 1;

  return {
    sequence: selected.sequence,
    options: hasDifferentDirections
      ? candidates.map(({ option }) => option)
      : [],
    variants: [],
    selectedDirectionId: selected.option.id,
    selectedMainDirectionId: selected.option.id,
  };
}

/**
 * Selects a bus service pattern for the global map without turning every
 * short-turn or school run into a passenger-facing direction. NeTEx exposes
 * the service direction independently of a pattern's actual terminal; that
 * semantic field is therefore the grouping key. A terminal is only used as a
 * generic fallback when the source does not provide a direction.
 */
export function selectGlobalBusMapDirection(
  sequences: LineRouteSequence[],
  selectedDirectionId?: string,
): BusMapDirectionSelection | undefined {
  return selectGlobalMapDirection(sequences, selectedDirectionId);
}

function selectFusedGlobalMapDirection(
  sequences: LineRouteSequence[],
  selectedDirectionId?: string,
): GlobalMapDirectionSelection | undefined {
  type Variant = {
    sequence: LineRouteSequence;
    terminalId: string;
    option: LineMapDirectionOption;
  };
  type DirectionGroup = {
    label: string;
    variants: Variant[];
  };

  const groups = new Map<string, DirectionGroup>();

  for (const sequence of sequences) {
    const terminal = sequence.stops.at(-1);
    if (!terminal) continue;

    const directionLabel = sequence.direction?.trim();
    const groupKey = directionLabel
      ? `direction:${normalizeBusDirectionLabel(directionLabel)}`
      : `terminal:${terminal.id}`;
    const group = groups.get(groupKey) ?? {
      label: directionLabel || terminal.label,
      variants: [],
    };

    // Two services can share a terminus while one inserts a school or
    // diversion stop in the middle. Retain both: grouping only by terminal
    // silently turns that detour into the passenger-facing route.
    if (!group.variants.some((variant) => variant.option.id === sequence.id)) {
      group.variants.push({
        sequence,
        terminalId: terminal.id,
        option: {
          id: sequence.id,
          label: terminal.label,
          stopCount: sequence.stops.length,
        },
      });
    }
    groups.set(groupKey, group);
  }

  // A short-turn can have a different destination label even though it is
  // only a prefix/suffix of a passenger-facing direction. Treat that pattern
  // as an optional variant of the containing direction. This keeps a short
  // run such as "vers Porte de Clichy" from becoming a third main direction
  // while preserving the exact pattern for callers that request it.
  const groupEntries = [...groups.entries()];
  const findContainingDirectionGroup = (
    sourceKey: string,
    candidate: LineRouteSequence,
  ): DirectionGroup | undefined => {
    let best: { group: DirectionGroup; length: number } | undefined;

    for (const [groupKey, group] of groupEntries) {
      if (groupKey === sourceKey) continue;

      for (const parent of group.variants) {
        const parentLength = parent.sequence.stops.length;
        if (
          parentLength <= candidate.stops.length ||
          !containsOrderedStopWindow(parent.sequence, candidate)
        ) {
          continue;
        }

        if (!best || parentLength > best.length) {
          best = { group, length: parentLength };
        }
      }
    }

    return best?.group;
  };

  for (const [sourceKey, sourceGroup] of groupEntries) {
    for (const variant of [...sourceGroup.variants]) {
      const parentGroup = findContainingDirectionGroup(sourceKey, variant.sequence);
      if (!parentGroup) continue;

      sourceGroup.variants = sourceGroup.variants.filter(
        (sourceVariant) => sourceVariant.option.id !== variant.option.id,
      );
      if (!parentGroup.variants.some(
        (parentVariant) => parentVariant.option.id === variant.option.id,
      )) {
        parentGroup.variants.push(variant);
      }
    }

    if (sourceGroup.variants.length === 0) {
      groups.delete(sourceKey);
    }
  }

  const candidates = [...groups.values()]
    .map((group) => {
      const variants = [...group.variants].sort(compareGlobalBusDirectionVariants);
      const primary = variants[0];
      return primary ? { group, primary, variants } : undefined;
    })
    .filter((candidate): candidate is {
      group: DirectionGroup;
      primary: Variant;
      variants: Variant[];
    } => Boolean(candidate))
    .sort((left, right) => right.primary.sequence.stops.length - left.primary.sequence.stops.length);

  if (candidates.length === 0) return undefined;

  const selectedCandidate = candidates.find(({ primary, variants }) =>
    primary.option.id === selectedDirectionId
    || variants.some((variant) =>
      variant.option.id === selectedDirectionId || variant.terminalId === selectedDirectionId,
    ),
  ) ?? candidates[0];
  const selectedVariant = selectedCandidate.variants.find((variant) =>
    variant.option.id === selectedDirectionId || variant.terminalId === selectedDirectionId,
  ) ?? selectedCandidate.primary;

  return {
    sequence: selectedVariant.sequence,
    options: candidates.map(({ group, primary }) => ({
      ...primary.option,
      label: group.label,
    })),
    variants: selectedCandidate.variants.map(({ option }) => option),
    selectedDirectionId: selectedVariant.option.id,
    selectedMainDirectionId: selectedCandidate.primary.option.id,
  };
}

function compareGlobalBusDirectionVariants(
  left: { sequence: LineRouteSequence; terminalId: string; option: LineMapDirectionOption },
  right: { sequence: LineRouteSequence; terminalId: string; option: LineMapDirectionOption },
): number {
  // For identical termini, the shorter ordered subsequence is the regular
  // traversal when the longer pattern only inserts intermediate stops. A
  // genuine short-turn has another terminus and remains an optional variant.
  if (left.terminalId === right.terminalId) {
    const leftContainsRight =
      left.sequence.stops.length > right.sequence.stops.length &&
      containsOrderedStopSubsequence(left.sequence, right.sequence);
    const rightContainsLeft =
      right.sequence.stops.length > left.sequence.stops.length &&
      containsOrderedStopSubsequence(right.sequence, left.sequence);
    if (leftContainsRight) return 1;
    if (rightContainsLeft) return -1;
  }

  return right.sequence.stops.length - left.sequence.stops.length
    || left.option.id.localeCompare(right.option.id, "fr-FR");
}

function normalizeBusDirectionLabel(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase();
}

function containsOrderedStopWindow(
  parent: LineRouteSequence,
  candidate: LineRouteSequence,
): boolean {
  const parentStops = parent.stops.map(routeStopIdentity);
  const candidateStops = candidate.stops.map(routeStopIdentity);
  if (candidateStops.length > parentStops.length) return false;

  return parentStops.some((_stop, start) =>
    candidateStops.every((stop, offset) => parentStops[start + offset] === stop),
  );
}

function containsOrderedStopSubsequence(
  parent: LineRouteSequence,
  candidate: LineRouteSequence,
): boolean {
  const parentStops = parent.stops.map(routeStopIdentity);
  const candidateStops = candidate.stops.map(routeStopIdentity);
  if (candidateStops.length > parentStops.length) return false;

  let candidateIndex = 0;
  for (const parentStop of parentStops) {
    if (parentStop === candidateStops[candidateIndex]) candidateIndex += 1;
    if (candidateIndex === candidateStops.length) return true;
  }
  return candidateStops.length === 0;
}

function routeStopIdentity(stop: LineRouteSequence["stops"][number]): string {
  return (stop.station?.id || stop.id)
    .trim()
    .toLowerCase()
    .replace(/^(?:station|stop[-_]?point|stop[-_]?area|quay):/u, "");
}

export function createDetailedLineMapViewModel(
  line: LineSearchOption,
  sequences: LineRouteSequence[],
  stationCatalog: StationSearchOption[] = [],
): LineMapViewModel {
  const mapSequences = sequences.filter((sequence) => !isSupplementalRouteSequence(sequence.label));
  const stopsById = new Map<string, LineMapStopView>();
  const canonicalStations = createCanonicalStationLookup(stationCatalog);
  const branches: LineMapBranchView[] = [];

  (mapSequences.length > 0 ? mapSequences : sequences).forEach((sequence) => {
    const stopIds = sequence.stops.map((stop) => stop.id);

    sequence.stops.forEach((stop) => {
      const existingStop = stopsById.get(stop.id);

      if (existingStop) {
        addUniqueValue(existingStop.routeIds, sequence.id);
        addUniqueValue(existingStop.routeLabels, sequence.label);
        existingStop.quays = mergeQuays(existingStop.quays, enrichQuays(stop.quays));
        return;
      }

      const mapStop = enrichStopCoordinates(
        stop,
        findCanonicalStationForStop(stop, canonicalStations),
      );

      stopsById.set(stop.id, {
        ...mapStop,
        x: 0.5,
        y: 0.5,
        routeIds: [sequence.id],
        routeLabels: [sequence.label],
      });
    });

    branches.push({
      id: sequence.id,
      label: sequence.label,
      direction: sequence.direction,
      topologySource: sequence.topologySource,
      stopIds,
    });
  });

  const positionedMap = applyMapCoordinates(Array.from(stopsById.values()), branches);
  const stops = positionedMap.stops;
  const segments = createLineMapSegments(stops, branches);
  const presentation = createLinePresentation({
    code: line.label,
    color: line.color,
    family: line.family,
    id: line.id,
    longName: line.displayName ?? line.label,
    ref: line.ref,
    shortName: line.label,
    textColor: line.textColor,
  });

  return {
    lineId: line.id,
    lineLabel: line.label,
    lineColor: presentation.color,
    textColor: presentation.textColor,
    stops,
    segments,
    branches,
    tiles: createMapTiles(positionedMap.viewport),
    viewport: positionedMap.viewport,
    geometrySource: "direct",
    geometryAttempts: [{ source: "direct", status: "success" }],
    entrances: [],
  };
}

export async function loadStationTransfers(
  station: StationSearchOption,
  currentLine?: LineSearchOption,
  options: StationTransfersLoadOptions = {},
): Promise<TransferLineOption[]> {
  const currentLineId = currentLine?.navitiaId ?? currentLine?.id;
  const removeCurrentLine = (transfers: TransferLineOption[]) =>
    filterCurrentLineTransfers(
      transfers,
      currentLine
        ? {
            family: currentLine.family,
            ids: [currentLine.id, currentLine.navitiaId, currentLine.ref],
            labels: [currentLine.label, currentLine.displayName],
          }
        : undefined,
    );

  if (currentLineId && currentLine) {
    const bundledTransfers = await loadTransferBundleForTarget({
      ...options,
      lineId: currentLineId,
      lineLabel: currentLine.label,
      target: {
        stopAreaRef: station.scheduleStopAreaRef ?? station.id,
        label: station.label,
        city: station.city,
      },
      transportType: options.transportType ?? currentLine.family,
    }).catch(() => undefined);

    if (bundledTransfers !== undefined) {
      return removeCurrentLine(bundledTransfers);
    }
  }

  return removeCurrentLine(await fetchStationTransfers(station, currentLineId));
}

export async function loadTransferLineDirections(lineId: string): Promise<TransferLineDirections> {
  const routes = await fetchLineRouteSummaries(lineId);
  const directions = createTransferDirectionList(
    routes.flatMap((route) => [route.direction, route.label]),
  );

  return {
    lineId,
    directions: directions.slice(0, 6),
  };
}

export function loadTransferLineFrequency(
  lineId: string,
  station: StationSearchOption,
): Promise<LineFrequencyProfile> {
  return fetchLineFrequencyProfile(lineId, station);
}

export function createTransferDirectionList(values: Array<string | undefined>): string[] {
  const candidates = values
    .filter((value): value is string => Boolean(value?.trim()))
    .map(cleanTransferDirectionDisplay)
    .filter(Boolean);
  const canonicalDirections = candidates.map((direction) => ({
    direction,
    key: createTransferDirectionKey(direction),
    tokens: createTransferDirectionTokens(direction),
  }));
  const removedIndexes = new Set<number>();

  canonicalDirections.forEach((left, leftIndex) => {
    canonicalDirections.forEach((right, rightIndex) => {
      if (leftIndex === rightIndex || removedIndexes.has(leftIndex)) {
        return;
      }

      if (!transferDirectionCovers(left.tokens, right.tokens)) {
        return;
      }

      if (scoreDirectionDisplay(right.direction) >= scoreDirectionDisplay(left.direction)) {
        removedIndexes.add(leftIndex);
      }
    });
  });

  const directionsByKey = new Map<string, string>();

  canonicalDirections
    .filter((_, index) => !removedIndexes.has(index))
    .forEach((direction) => {
      const key = direction.key;
      const existing = directionsByKey.get(key);

      if (
        !existing ||
        scoreDirectionDisplay(direction.direction) > scoreDirectionDisplay(existing)
      ) {
        directionsByKey.set(key, direction.direction);
      }
    });

  return Array.from(directionsByKey.values());
}

export function isBusTransfer(transfer: TransferLineOption): boolean {
  return normalizeText(transfer.mode).includes("bus");
}

export function isStructuralTransfer(transfer: TransferLineOption): boolean {
  return !isBusTransfer(transfer);
}

function createCanonicalStationLookup(stations: StationSearchOption[]): CanonicalStationLookup {
  const byLabel = new Map<string, StationSearchOption[]>();

  stations.forEach((station) => {
    createStationLookupKeys(station.label).forEach((key) => {
      const existing = byLabel.get(key) ?? [];

      existing.push(station);
      byLabel.set(key, existing);
    });
  });

  return { byLabel, stations };
}

function findCanonicalStationForStop(
  stop: LineRouteStop,
  lookup: CanonicalStationLookup,
): StationSearchOption | undefined {
  const candidates = createStationLookupKeys(stop.label).flatMap(
    (key) => lookup.byLabel.get(key) ?? [],
  );
  const uniqueCandidates = Array.from(
    new Map(candidates.map((station) => [station.id, station])).values(),
  );

  if (uniqueCandidates.length > 0) {
    return selectCanonicalStationCandidate(stop, uniqueCandidates);
  }

  const compatibleCandidates = lookup.stations.filter((station) =>
    haveCompatibleOfficialStationLabels(stop.label, station.label),
  );
  const compatibleMatch = selectProximateCanonicalStation(
    stop,
    compatibleCandidates,
    CANONICAL_STATION_NAME_MAX_DISTANCE_KM,
    CANONICAL_STATION_NAME_AMBIGUITY_MARGIN_KM,
  );

  if (compatibleMatch) {
    return compatibleMatch;
  }

  const labelCandidates = lookup.stations.filter((station) =>
    haveSharedOfficialStationLabelToken(stop.label, station.label),
  );
  const labelMatch = selectProximateCanonicalStation(
    stop,
    labelCandidates,
    CANONICAL_STATION_NAME_MAX_DISTANCE_KM,
    CANONICAL_STATION_NAME_AMBIGUITY_MARGIN_KM,
  );

  if (labelMatch) {
    return labelMatch;
  }

  // Some official stop areas use a completely different hub name from their
  // individual NeTEx quay. Keep this fallback restricted to the current line,
  // a short radius and a clearly isolated nearest candidate.
  return selectProximateCanonicalStation(
    stop,
    lookup.stations,
    CANONICAL_STATION_POSITION_MAX_DISTANCE_KM,
    CANONICAL_STATION_POSITION_AMBIGUITY_MARGIN_KM,
  );
}

function selectCanonicalStationCandidate(
  stop: LineRouteStop,
  candidates: StationSearchOption[],
): StationSearchOption | undefined {
  if (candidates.length === 1) {
    return candidates[0];
  }

  const stopCoordinate = resolveTransitLonLat(stop);

  if (stopCoordinate) {
    return (
      candidates
        .filter((station) => typeof station.lon === "number" && typeof station.lat === "number")
        .sort(
          (left, right) =>
            getCoordinateDistance(stopCoordinate.lon, stopCoordinate.lat, left) -
            getCoordinateDistance(stopCoordinate.lon, stopCoordinate.lat, right),
        )[0] ?? candidates[0]
    );
  }

  return candidates[0];
}

function haveCompatibleOfficialStationLabels(left: string, right: string): boolean {
  const leftTokens = createOfficialStationIdentityTokens(left);
  const rightTokens = createOfficialStationIdentityTokens(right);

  if (leftTokens.size < 2 || rightTokens.size < 2) {
    return false;
  }

  const sharedTokenCount = Array.from(leftTokens).filter((token) =>
    rightTokens.has(token),
  ).length;

  return sharedTokenCount >= 2;
}

function haveSharedOfficialStationLabelToken(left: string, right: string): boolean {
  const leftTokens = createOfficialStationIdentityTokens(left);
  const rightTokens = createOfficialStationIdentityTokens(right);

  return Array.from(leftTokens).some((token) => rightTokens.has(token));
}

function selectProximateCanonicalStation(
  stop: LineRouteStop,
  candidates: StationSearchOption[],
  maximumDistanceKm: number,
  ambiguityMarginKm: number,
): StationSearchOption | undefined {
  const stopCoordinate = resolveTransitLonLat(stop);

  if (!stopCoordinate) {
    return undefined;
  }

  const rankedCandidates = candidates
    .flatMap((station) =>
      typeof station.lon === "number" && typeof station.lat === "number"
        ? [
            {
              station,
              distanceKm: getCoordinatesDistanceKm(
                stopCoordinate.lat,
                stopCoordinate.lon,
                station.lat,
                station.lon,
              ),
            },
          ]
        : [],
    )
    .sort((left, right) => left.distanceKm - right.distanceKm);
  const nearest = rankedCandidates[0];
  const secondNearest = rankedCandidates[1];

  if (!nearest || nearest.distanceKm > maximumDistanceKm) {
    return undefined;
  }

  if (
    secondNearest &&
    secondNearest.distanceKm - nearest.distanceKm < ambiguityMarginKm
  ) {
    return undefined;
  }

  return nearest.station;
}

function createOfficialStationIdentityTokens(value: string): Set<string> {
  return new Set(
    normalizeStationLookupLabel(value)
      .split(/\s+/u)
      .filter((token) => token.length >= 3)
      .filter(
        (token) =>
          !["bus", "gare", "metro", "rer", "station", "tram"].includes(token),
      ),
  );
}

function createStationLookupKeys(value: string): string[] {
  const normalized = normalizeStationLookupLabel(value);

  if (!normalized) {
    return [];
  }

  const withoutParenthesis = normalizeStationLookupLabel(value.replace(/\s*\([^)]*\)\s*/gu, " "));
  const withoutGarePrefix = normalizeStationLookupLabel(
    value.replace(/^gare\s+(de|d'|du|des)\s+/iu, ""),
  );
  const withoutLeadingArticle = normalizeStationLookupLabel(
    normalized.replace(/^(la|le|les|l)\s+/u, ""),
  );

  return Array.from(
    new Set(
      [normalized, withoutParenthesis, withoutGarePrefix, withoutLeadingArticle].filter(Boolean),
    ),
  );
}

function normalizeStationLookupLabel(value: string): string {
  return normalizeText(value)
    .replace(/[’']/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\b(gare|metro|rer|tram|station)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCoordinateDistance(lon: number, lat: number, station: StationSearchOption): number {
  return Math.hypot(lon - (station.lon ?? lon), lat - (station.lat ?? lat));
}

function enrichStopCoordinates(
  stop: LineRouteSequence["stops"][number],
  canonicalStation?: StationSearchOption,
) {
  const station = canonicalStation ?? stop.station;
  const quays = enrichQuays(stop.quays);

  if (typeof stop.lon === "number" && typeof stop.lat === "number") {
    return {
      ...stop,
      station,
      quays,
      coordinateSource: "wgs84" as const,
    };
  }

  if (typeof stop.projectedX === "number" && typeof stop.projectedY === "number") {
    const converted = convertLambert93ToWgs84(stop.projectedX, stop.projectedY);

    if (converted) {
      return {
        ...stop,
        station,
        quays,
        lon: converted.lon,
        lat: converted.lat,
        coordinateSource: "lambert93" as const,
      };
    }
  }

  return {
    ...stop,
    station,
    quays,
  };
}

function enrichQuays(quays?: TransitQuay[]): LineMapQuayView[] | undefined {
  return quays?.map((quay) => {
    const lonLat = resolveTransitLonLat(quay);

    return {
      ...quay,
      ...(lonLat ? lonLat : {}),
    };
  });
}

function mergeQuays(
  current?: LineMapQuayView[],
  incoming?: LineMapQuayView[],
): LineMapQuayView[] | undefined {
  const quays = new Map([...(current ?? []), ...(incoming ?? [])].map((quay) => [quay.id, quay]));

  return quays.size > 0 ? Array.from(quays.values()) : undefined;
}

function applyMapCoordinates(
  stops: LineMapStopView[],
  branches: LineMapBranchView[],
): PositionedLineMap {
  const stopsWithCoordinates = stops.filter(
    (stop) => typeof stop.lon === "number" && typeof stop.lat === "number",
  );

  if (stopsWithCoordinates.length >= 2) {
    const viewport = createGeographicViewport(stopsWithCoordinates, {
      viewBoxWidth: VIEWBOX_WIDTH,
      viewBoxHeight: VIEWBOX_HEIGHT,
      paddingX: SVG_PADDING_X,
      paddingY: SVG_PADDING_Y,
      coordinatePadding: MAP_COORDINATE_PADDING,
    });

    if (viewport) {
      return {
        viewport,
        stops: stops.map((stop) => {
          const normalizedPoint = projectTransitCoordinate(stop, viewport);

          if (!normalizedPoint) {
            return stop;
          }

          return {
            ...stop,
            x: normalizedPoint.x,
            y: normalizedPoint.y,
          };
        }),
      };
    }
  }

  const stopsWithProjectedCoordinates = stops.filter(
    (stop) => typeof stop.projectedX === "number" && typeof stop.projectedY === "number",
  );

  if (stopsWithProjectedCoordinates.length >= 2) {
    const minX = Math.min(
      ...stopsWithProjectedCoordinates.map((stop) => stop.projectedX as number),
    );
    const maxX = Math.max(
      ...stopsWithProjectedCoordinates.map((stop) => stop.projectedX as number),
    );
    const minY = Math.min(
      ...stopsWithProjectedCoordinates.map((stop) => stop.projectedY as number),
    );
    const maxY = Math.max(
      ...stopsWithProjectedCoordinates.map((stop) => stop.projectedY as number),
    );
    const bounds = padBounds({ minX, maxX, minY, maxY });

    return {
      stops: stops.map((stop) => {
        if (typeof stop.projectedX !== "number" || typeof stop.projectedY !== "number") {
          return stop;
        }

        return {
          ...stop,
          x: normalizeProjectedCoordinate(stop.projectedX, bounds.minX, bounds.maxX),
          y: normalizeProjectedCoordinate(
            bounds.maxY - (stop.projectedY - bounds.minY),
            bounds.minY,
            bounds.maxY,
          ),
        };
      }),
    };
  }

  const orderedStopIds = createFallbackMapOrder(stops, branches);

  return {
    stops: stops.map((stop) => {
      const index = orderedStopIds.indexOf(stop.id);
      const ratio = orderedStopIds.length > 1 ? index / (orderedStopIds.length - 1) : 0.5;

      return {
        ...stop,
        coordinateSource: stop.coordinateSource ?? "fallback",
        x: normalizeMapRatio(index >= 0 ? ratio : 0.5),
        y: 0.5,
      };
    }),
  };
}

function createLineMapSegments(
  stops: LineMapStopView[],
  branches: LineMapBranchView[],
): LineMapSegmentView[] {
  const stopById = new Map(stops.map((stop) => [stop.id, stop]));
  const segments = new Map<
    string,
    LineMapSegmentView & { authoritative: boolean; length: number }
  >();

  branches.forEach((branch) => {
    const isAuthoritative = branch.topologySource === "server";

    branch.stopIds.slice(0, -1).forEach((fromStopId, index) => {
      const toStopId = branch.stopIds[index + 1];
      const fromStop = stopById.get(fromStopId);
      const toStop = stopById.get(toStopId);

      if (!fromStop || !toStop || fromStopId === toStopId) {
        return;
      }

      const key = createSegmentKey(fromStopId, toStopId);

      if (!segments.has(key)) {
        segments.set(key, {
          id: key,
          fromStopId,
          toStopId,
          authoritative: isAuthoritative,
          distanceKm: getStopDistanceKm(fromStop, toStop),
          length: getNormalizedDistance(fromStop, toStop),
          polyline: [
            { x: fromStop.x, y: fromStop.y },
            { x: toStop.x, y: toStop.y },
          ],
        });
        return;
      }

      if (isAuthoritative) {
        const existing = segments.get(key);

        if (existing) {
          existing.authoritative = true;
        }
      }
    });
  });

  const segmentValues = Array.from(segments.values());
  const medianLength = getMedian(
    segmentValues.map((segment) => segment.length).filter((length) => length > 0),
  );

  return segmentValues
    .filter(
      (segment) => segment.authoritative || !isExpressChord(segment, stops, stopById, medianLength),
    )
    .map(({ id, fromStopId, toStopId, distanceKm, polyline }) => ({
      id,
      fromStopId,
      toStopId,
      distanceKm,
      polyline,
    }));
}

function getStopDistanceKm(fromStop: LineMapStopView, toStop: LineMapStopView): number | undefined {
  if (
    typeof fromStop.lat !== "number" ||
    typeof fromStop.lon !== "number" ||
    typeof toStop.lat !== "number" ||
    typeof toStop.lon !== "number"
  ) {
    return undefined;
  }

  return getCoordinatesDistanceKm(fromStop.lat, fromStop.lon, toStop.lat, toStop.lon);
}

export interface NormalizedMapTileWindow {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const FULL_MAP_TILE_WINDOW: NormalizedMapTileWindow = {
  minX: 0,
  maxX: 1,
  minY: 0,
  maxY: 1,
};
const MINIMUM_MAX_MAP_ZOOM = 20;
const ABSOLUTE_MAX_MAP_ZOOM = 192;
const STREET_LEVEL_MERCATOR_SPAN = 0.00002;
const MAP_TILE_SIZE = 256;
const MAXIMUM_XYZ_ZOOM = 20;
const DEFAULT_MAP_TILE_BUDGET = 64;

export interface CreateMapTilesOptions {
  mapScale?: number;
  pixelRatio?: number;
  visibleWindow?: NormalizedMapTileWindow;
  maxTiles?: number;
}

export interface GeographicMapFocusCoordinate {
  lon: number;
  lat: number;
}

export interface GeographicMapFocusOptions {
  center: GeographicMapFocusCoordinate;
  coordinates?: GeographicMapFocusCoordinate[];
  radiusMeters: number;
  maximumCoordinateDistanceMeters?: number;
  canvasWidth: number;
  canvasHeight: number;
  maximumZoom: number;
  paddingPixels?: number;
}

export interface GeographicMapFocusPlan {
  centerX: number;
  centerY: number;
  zoom: number;
  includedCoordinateCount: number;
  rejectedCoordinateCount: number;
}

export function getMaximumMapZoom(viewport?: GeographicViewport): number {
  if (!viewport) return MINIMUM_MAX_MAP_ZOOM;

  const span = Math.max(viewport.maxX - viewport.minX, viewport.maxY - viewport.minY);
  return Math.min(
    ABSOLUTE_MAX_MAP_ZOOM,
    Math.max(MINIMUM_MAX_MAP_ZOOM, Math.ceil(span / STREET_LEVEL_MERCATOR_SPAN)),
  );
}

export function createMapTiles(
  viewport?: GeographicViewport,
  options: CreateMapTilesOptions = {},
): MapTile[] {
  if (!viewport) {
    return [];
  }

  const mapScale = Math.max(0.01, options.mapScale ?? 1);
  const pixelRatio = Math.max(1, options.pixelRatio ?? 1);
  const visibleWindow = options.visibleWindow ?? FULL_MAP_TILE_WINDOW;
  const maxTiles = Math.max(1, Math.floor(options.maxTiles ?? DEFAULT_MAP_TILE_BUDGET));
  let zoom = chooseTileZoom(viewport, mapScale);
  let ranges = createTileRanges(viewport, visibleWindow, zoom);

  while (ranges.tileCount > maxTiles && zoom > 0) {
    zoom -= 1;
    ranges = createTileRanges(viewport, visibleWindow, zoom);
  }

  const scale = 2 ** zoom;
  const tiles: MapTile[] = [];

  for (let tileX = ranges.minTileX; tileX <= ranges.maxTileX; tileX += 1) {
    for (let tileY = ranges.minTileY; tileY <= ranges.maxTileY; tileY += 1) {
      const shard = TILE_SERVER_SHARDS[(tileX + tileY + scale) % TILE_SERVER_SHARDS.length];
      const wrappedTileX = ((tileX % scale) + scale) % scale;
      const left = tileX / scale;
      const top = tileY / scale;
      const tileSize = 1 / scale;
      const overlap = 1 / mapScale;
      const normalizedTopLeft = projectMercatorPointToViewport({ x: left, y: top }, viewport);
      const normalizedBottomRight = projectMercatorPointToViewport(
        { x: left + tileSize, y: top + tileSize },
        viewport,
      );
      const x = toSvgX(normalizedTopLeft.x);
      const y = toSvgY(normalizedTopLeft.y);

      tiles.push({
        id: `${zoom}/${tileX}/${tileY}`,
        url: `https://${shard}.basemaps.cartocdn.com/light_all/${zoom}/${wrappedTileX}/${tileY}${
          pixelRatio >= 1.5 ? "@2x" : ""
        }.png`,
        priority:
          tileX >= ranges.coreMinTileX &&
          tileX <= ranges.coreMaxTileX &&
          tileY >= ranges.coreMinTileY &&
          tileY <= ranges.coreMaxTileY
            ? "visible"
            : "overscan",
        x,
        y,
        width: toSvgX(normalizedBottomRight.x) - x + overlap,
        height: toSvgY(normalizedBottomRight.y) - y + overlap,
      });
    }
  }

  return tiles.sort((left, right) =>
    left.priority === right.priority
      ? left.id.localeCompare(right.id)
      : left.priority === "visible"
        ? -1
        : 1,
  );
}

function chooseTileZoom(viewport: GeographicViewport, mapScale: number): number {
  const spanX = Math.max(viewport.maxX - viewport.minX, Number.EPSILON);
  const spanY = Math.max(viewport.maxY - viewport.minY, Number.EPSILON);
  const innerWidth = VIEWBOX_WIDTH - SVG_PADDING_X * 2;
  const innerHeight = VIEWBOX_HEIGHT - SVG_PADDING_Y * 2;
  const requiredScale = Math.max(
    (innerWidth * mapScale) / (MAP_TILE_SIZE * spanX),
    (innerHeight * mapScale) / (MAP_TILE_SIZE * spanY),
  );

  return Math.max(0, Math.min(MAXIMUM_XYZ_ZOOM, Math.ceil(Math.log2(requiredScale))));
}

function createTileRanges(
  viewport: GeographicViewport,
  visibleWindow: NormalizedMapTileWindow,
  zoom: number,
): {
  coreMinTileX: number;
  coreMaxTileX: number;
  coreMinTileY: number;
  coreMaxTileY: number;
  minTileX: number;
  maxTileX: number;
  minTileY: number;
  maxTileY: number;
  tileCount: number;
} {
  const scale = 2 ** zoom;
  const spanX = viewport.maxX - viewport.minX;
  const spanY = viewport.maxY - viewport.minY;
  const minWorldX = viewport.minX + clampUnit(visibleWindow.minX) * spanX;
  const maxWorldX = viewport.minX + clampUnit(visibleWindow.maxX) * spanX;
  const minWorldY = viewport.minY + clampUnit(visibleWindow.minY) * spanY;
  const maxWorldY = viewport.minY + clampUnit(visibleWindow.maxY) * spanY;
  const epsilon = Number.EPSILON * scale;
  const coreMinTileX = Math.floor(Math.min(minWorldX, maxWorldX) * scale);
  const coreMaxTileX = Math.floor(Math.max(minWorldX, maxWorldX) * scale - epsilon);
  const coreMinTileY = Math.max(0, Math.floor(Math.min(minWorldY, maxWorldY) * scale));
  const coreMaxTileY = Math.min(
    scale - 1,
    Math.floor(Math.max(minWorldY, maxWorldY) * scale - epsilon),
  );
  const minTileX = coreMinTileX - 1;
  const maxTileX = coreMaxTileX + 1;
  const minTileY = Math.max(0, coreMinTileY - 1);
  const maxTileY = Math.min(scale - 1, coreMaxTileY + 1);

  return {
    coreMinTileX,
    coreMaxTileX,
    coreMinTileY,
    coreMaxTileY,
    minTileX,
    maxTileX,
    minTileY,
    maxTileY,
    tileCount: (maxTileX - minTileX + 1) * (maxTileY - minTileY + 1),
  };
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function createGeographicMapFocusPlan(
  viewport: GeographicViewport,
  options: GeographicMapFocusOptions,
): GeographicMapFocusPlan | undefined {
  const center = normalizeFocusCoordinate(options.center);
  if (!center) return undefined;

  const maximumDistance = options.maximumCoordinateDistanceMeters;
  const coordinates = (options.coordinates ?? []).flatMap((coordinate) => {
    const normalized = normalizeFocusCoordinate(coordinate);
    if (!normalized) return [];

    const distanceMeters =
      getCoordinatesDistanceKm(center.lat, center.lon, normalized.lat, normalized.lon) * 1_000;
    return maximumDistance === undefined || distanceMeters <= maximumDistance ? [normalized] : [];
  });
  const rejectedCoordinateCount = (options.coordinates?.length ?? 0) - coordinates.length;
  const radiusMeters = Math.max(1, options.radiusMeters);
  const latitudeDelta = radiusMeters / 111_320;
  const longitudeDelta =
    radiusMeters / (111_320 * Math.max(0.05, Math.cos((center.lat * Math.PI) / 180)));
  const projectedPoints = [
    center,
    ...coordinates,
    { lon: center.lon - longitudeDelta, lat: center.lat },
    { lon: center.lon + longitudeDelta, lat: center.lat },
    { lon: center.lon, lat: center.lat - latitudeDelta },
    { lon: center.lon, lat: center.lat + latitudeDelta },
  ].map(({ lon, lat }) => projectMercatorPointToViewport(projectLonLat(lon, lat), viewport));
  const xValues = projectedPoints.map((point) => toSvgX(point.x));
  const yValues = projectedPoints.map((point) => toSvgY(point.y));
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const padding = Math.max(0, options.paddingPixels ?? 32);
  const availableWidth = Math.max(1, options.canvasWidth - padding * 2);
  const availableHeight = Math.max(1, options.canvasHeight - padding * 2);
  const zoom = Math.min(
    Math.max(1, options.maximumZoom),
    availableWidth / Math.max(1, maxX - minX),
    availableHeight / Math.max(1, maxY - minY),
  );

  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    zoom,
    includedCoordinateCount: coordinates.length,
    rejectedCoordinateCount,
  };
}

function normalizeFocusCoordinate(
  coordinate: GeographicMapFocusCoordinate,
): GeographicMapFocusCoordinate | undefined {
  return Number.isFinite(coordinate.lon) &&
    coordinate.lon >= -180 &&
    coordinate.lon <= 180 &&
    Number.isFinite(coordinate.lat) &&
    coordinate.lat >= -85.05112878 &&
    coordinate.lat <= 85.05112878
    ? coordinate
    : undefined;
}
function padBounds(bounds: { minX: number; maxX: number; minY: number; maxY: number }): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const width = Math.max(bounds.maxX - bounds.minX, 0.000001);
  const height = Math.max(bounds.maxY - bounds.minY, 0.000001);

  return {
    minX: Math.max(0, bounds.minX - width * 0.12),
    maxX: Math.min(1, bounds.maxX + width * 0.12),
    minY: Math.max(0, bounds.minY - height * 0.16),
    maxY: Math.min(1, bounds.maxY + height * 0.16),
  };
}

function isExpressChord(
  segment: LineMapSegmentView & { length: number },
  stops: LineMapStopView[],
  stopById: Map<string, LineMapStopView>,
  medianLength: number,
): boolean {
  if (!medianLength || segment.length < medianLength * 1.7) {
    return false;
  }

  const fromStop = stopById.get(segment.fromStopId);
  const toStop = stopById.get(segment.toStopId);

  if (!fromStop || !toStop) {
    return false;
  }

  return stops.some((stop) => {
    if (stop.id === fromStop.id || stop.id === toStop.id) {
      return false;
    }

    return isStopBetweenSegment(stop, fromStop, toStop, segment.length);
  });
}

function isStopBetweenSegment(
  stop: LineMapStopView,
  fromStop: LineMapStopView,
  toStop: LineMapStopView,
  segmentLength: number,
): boolean {
  const projection = getProjectionRatio(stop, fromStop, toStop);

  if (projection <= 0.08 || projection >= 0.92) {
    return false;
  }

  const distanceToSegment = getDistanceToSegment(stop, fromStop, toStop);
  const tolerance = Math.max(0.018, Math.min(0.055, segmentLength * 0.18));

  return distanceToSegment <= tolerance;
}

function createSegmentKey(leftStopId: string, rightStopId: string): string {
  return leftStopId < rightStopId
    ? `${leftStopId}--${rightStopId}`
    : `${rightStopId}--${leftStopId}`;
}

function getNormalizedDistance(left: LineMapStopView, right: LineMapStopView): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function getProjectionRatio(
  point: LineMapStopView,
  fromStop: LineMapStopView,
  toStop: LineMapStopView,
): number {
  const dx = toStop.x - fromStop.x;
  const dy = toStop.y - fromStop.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= 0) {
    return 0;
  }

  return ((point.x - fromStop.x) * dx + (point.y - fromStop.y) * dy) / lengthSquared;
}

function getDistanceToSegment(
  point: LineMapStopView,
  fromStop: LineMapStopView,
  toStop: LineMapStopView,
): number {
  const projection = Math.max(0, Math.min(1, getProjectionRatio(point, fromStop, toStop)));
  const projectedX = fromStop.x + (toStop.x - fromStop.x) * projection;
  const projectedY = fromStop.y + (toStop.y - fromStop.y) * projection;

  return Math.hypot(point.x - projectedX, point.y - projectedY);
}

function getMedian(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function createFallbackMapOrder(stops: LineMapStopView[], branches: LineMapBranchView[]): string[] {
  const longestBranch = [...branches].sort(
    (left, right) => right.stopIds.length - left.stopIds.length,
  )[0];

  if (longestBranch) {
    return longestBranch.stopIds;
  }

  return stops.map((stop) => stop.id);
}

function normalizeProjectedCoordinate(value: number, minValue: number, maxValue: number): number {
  const span = maxValue - minValue;

  if (span <= 0.000001) {
    return 0.5;
  }

  return normalizeMapRatio((value - minValue) / span);
}

function normalizeMapRatio(ratio: number): number {
  return MAP_COORDINATE_PADDING + ratio * (1 - MAP_COORDINATE_PADDING * 2);
}

function toSvgX(value: number): number {
  return SVG_PADDING_X + value * (VIEWBOX_WIDTH - SVG_PADDING_X * 2);
}

function toSvgY(value: number): number {
  return SVG_PADDING_Y + value * (VIEWBOX_HEIGHT - SVG_PADDING_Y * 2);
}

function isSupplementalRouteSequence(label: string): boolean {
  const normalizedLabel = normalizeText(label);

  return (
    normalizedLabel.includes("additional service") ||
    normalizedLabel.includes("service supplementaire")
  );
}

function addUniqueValue(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function cleanNavitiaDirection(value: string): string {
  return value.replace(/\s+\([^)]*\)$/u, "");
}

function cleanTransferDirectionDisplay(value: string): string {
  return cleanNavitiaDirection(value)
    .replace(/\s+\([^)]*\)$/gu, "")
    .replace(/\s*[-–—]\s*/gu, " - ")
    .replace(
      /(?:\s+-\s+|\s+)(?:m[ée]tro|rer|tram(?:way)?|bus|train|transilien|ter|tgv|noctilien)$/iu,
      "",
    )
    .replace(/\s+/gu, " ")
    .trim();
}

function createTransferDirectionKey(value: string): string {
  return createTransferDirectionTokens(value).join(" ");
}

function createTransferDirectionTokens(value: string): string[] {
  return Array.from(
    new Set(
      normalizeText(value)
        .replace(
          /\b(?:metro|rer|tram(?:way)?|bus|train|transilien|ter|tgv|noctilien|gare|station|terminus)\b/gu,
          " ",
        )
        .replace(/\bportes\b/gu, "porte")
        .replace(/\b([a-z]{4,})s\b/gu, "$1")
        .replace(/[^a-z0-9]+/gu, " ")
        .replace(/\s+/gu, " ")
        .trim()
        .split(" ")
        .filter(Boolean)
        .sort(),
    ),
  );
}

function transferDirectionCovers(left: string[], right: string[]): boolean {
  if (left.length <= right.length) {
    return false;
  }

  const rightTokens = new Set(right);

  return (
    right.length > 0 &&
    right.every((token) => rightTokens.has(token)) &&
    right.every((token) => left.includes(token))
  );
}

function scoreDirectionDisplay(value: string): number {
  const normalized = normalizeText(value);
  let score = 1000 - value.length;

  if (/\b(metro|rer|tram|tramway|bus|train|ter|tgv)\b/u.test(normalized)) {
    score -= 120;
  }

  return score;
}

function normalizeText(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
