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
  projectMercatorPointToViewport,
  projectTransitCoordinate,
  resolveTransitLonLat,
  type GeographicViewport,
} from "../network-ghost/geoProjection";
import { getCoordinatesDistanceKm } from "../../services/distance";

const VIEWBOX_WIDTH = 1080;
const VIEWBOX_HEIGHT = 620;
const SVG_PADDING_X = 78;
const SVG_PADDING_Y = 68;
const MAP_COORDINATE_PADDING = 0.08;
const TILE_SERVER_SHARDS = ["a", "b", "c"];

interface CanonicalStationLookup {
  byLabel: Map<string, StationSearchOption[]>;
}

interface PositionedLineMap {
  stops: LineMapStopView[];
  viewport?: GeographicViewport;
}

export async function loadDetailedLineMap(
  line: LineSearchOption,
): Promise<LineMapViewModel> {
  const [sequences, stationCatalog] = await Promise.all([
    fetchLineRouteSequences(line),
    searchLineStations(line, "").catch((): StationSearchOption[] => []),
  ]);

  return createDetailedLineMapViewModel(line, sequences, stationCatalog);
}

export function createDetailedLineMapViewModel(
  line: LineSearchOption,
  sequences: LineRouteSequence[],
  stationCatalog: StationSearchOption[] = [],
): LineMapViewModel {
  const mapSequences = sequences.filter(
    (sequence) => !isSupplementalRouteSequence(sequence.label),
  );
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
        existingStop.quays = mergeQuays(
          existingStop.quays,
          enrichQuays(stop.quays),
        );
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

  const positionedMap = applyMapCoordinates(
    Array.from(stopsById.values()),
    branches,
  );
  const stops = positionedMap.stops;

  return {
    lineId: line.id,
    lineLabel: line.label,
    lineColor: line.color ?? "#0064ff",
    textColor: line.textColor ?? "#ffffff",
    stops,
    segments: createLineMapSegments(stops, branches),
    branches,
    tiles: createMapTiles(positionedMap.viewport),
    viewport: positionedMap.viewport,
  };
}

export async function loadStationTransfers(
  station: StationSearchOption,
  currentLineId?: string,
): Promise<TransferLineOption[]> {
  return fetchStationTransfers(station, currentLineId);
}

export async function loadTransferLineDirections(
  lineId: string,
): Promise<TransferLineDirections> {
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

export function createTransferDirectionList(
  values: Array<string | undefined>,
): string[] {
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

function createCanonicalStationLookup(
  stations: StationSearchOption[],
): CanonicalStationLookup {
  const byLabel = new Map<string, StationSearchOption[]>();

  stations.forEach((station) => {
    createStationLookupKeys(station.label).forEach((key) => {
      const existing = byLabel.get(key) ?? [];

      existing.push(station);
      byLabel.set(key, existing);
    });
  });

  return { byLabel };
}

function findCanonicalStationForStop(
  stop: LineRouteStop,
  lookup: CanonicalStationLookup,
): StationSearchOption | undefined {
  const candidates = createStationLookupKeys(stop.label)
    .flatMap((key) => lookup.byLabel.get(key) ?? []);
  const uniqueCandidates = Array.from(
    new Map(candidates.map((station) => [station.id, station])).values(),
  );

  if (uniqueCandidates.length === 0) {
    return undefined;
  }

  if (uniqueCandidates.length === 1) {
    return uniqueCandidates[0];
  }

  const stopLon = stop.lon;
  const stopLat = stop.lat;

  if (typeof stopLon === "number" && typeof stopLat === "number") {
    return uniqueCandidates
      .filter(
        (station) =>
          typeof station.lon === "number" && typeof station.lat === "number",
      )
      .sort(
        (left, right) =>
          getCoordinateDistance(stopLon, stopLat, left) -
          getCoordinateDistance(stopLon, stopLat, right),
      )[0] ?? uniqueCandidates[0];
  }

  return uniqueCandidates[0];
}

function createStationLookupKeys(value: string): string[] {
  const normalized = normalizeStationLookupLabel(value);

  if (!normalized) {
    return [];
  }

  const withoutParenthesis = normalizeStationLookupLabel(
    value.replace(/\s*\([^)]*\)\s*/gu, " "),
  );
  const withoutGarePrefix = normalizeStationLookupLabel(
    value.replace(/^gare\s+(de|d'|du|des)\s+/iu, ""),
  );
  const withoutLeadingArticle = normalizeStationLookupLabel(
    normalized.replace(/^(la|le|les|l)\s+/u, ""),
  );

  return Array.from(
    new Set(
      [
        normalized,
        withoutParenthesis,
        withoutGarePrefix,
        withoutLeadingArticle,
      ].filter(Boolean),
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

function getCoordinateDistance(
  lon: number,
  lat: number,
  station: StationSearchOption,
): number {
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

  if (
    typeof stop.projectedX === "number" &&
    typeof stop.projectedY === "number"
  ) {
    const converted = convertLambert93ToWgs84(
      stop.projectedX,
      stop.projectedY,
    );

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
  const quays = new Map(
    [...(current ?? []), ...(incoming ?? [])].map((quay) => [quay.id, quay]),
  );

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
    (stop) =>
      typeof stop.projectedX === "number" &&
      typeof stop.projectedY === "number",
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
        if (
          typeof stop.projectedX !== "number" ||
          typeof stop.projectedY !== "number"
        ) {
          return stop;
        }

        return {
          ...stop,
          x: normalizeProjectedCoordinate(
            stop.projectedX,
            bounds.minX,
            bounds.maxX,
          ),
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
      const ratio =
        orderedStopIds.length > 1 ? index / (orderedStopIds.length - 1) : 0.5;

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
    segmentValues
      .map((segment) => segment.length)
      .filter((length) => length > 0),
  );

  return segmentValues
    .filter((segment) =>
      segment.authoritative ||
      !isExpressChord(segment, stops, stopById, medianLength),
    )
    .map(({ id, fromStopId, toStopId, distanceKm }) => ({
      id,
      fromStopId,
      toStopId,
      distanceKm,
    }));
}

function getStopDistanceKm(
  fromStop: LineMapStopView,
  toStop: LineMapStopView,
): number | undefined {
  if (
    typeof fromStop.lat !== "number" ||
    typeof fromStop.lon !== "number" ||
    typeof toStop.lat !== "number" ||
    typeof toStop.lon !== "number"
  ) {
    return undefined;
  }

  return getCoordinatesDistanceKm(
    fromStop.lat,
    fromStop.lon,
    toStop.lat,
    toStop.lon,
  );
}

function createMapTiles(viewport?: GeographicViewport): MapTile[] {
  if (!viewport) {
    return [];
  }

  const zoom = chooseTileZoom(viewport);
  const scale = 2 ** zoom;
  const minTileX = Math.floor(viewport.minX * scale);
  const maxTileX = Math.floor(viewport.maxX * scale);
  const minTileY = Math.floor(viewport.minY * scale);
  const maxTileY = Math.floor(viewport.maxY * scale);
  const tiles: MapTile[] = [];

  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      const shard = TILE_SERVER_SHARDS[(tileX + tileY) % TILE_SERVER_SHARDS.length];
      const wrappedTileX = ((tileX % scale) + scale) % scale;
      const left = tileX / scale;
      const top = tileY / scale;
      const tileSizeX = 1 / scale;
      const tileSizeY = 1 / scale;
      const normalizedTopLeft = projectMercatorPointToViewport(
        { x: left, y: top },
        viewport,
      );
      const normalizedBottomRight = projectMercatorPointToViewport(
        {
          x: left + tileSizeX,
          y: top + tileSizeY,
        },
        viewport,
      );
      const normalizedLeft = normalizedTopLeft.x;
      const normalizedTop = normalizedTopLeft.y;
      const normalizedRight = normalizedBottomRight.x;
      const normalizedBottom = normalizedBottomRight.y;
      const x = toSvgX(normalizedLeft);
      const y = toSvgY(normalizedTop);

      tiles.push({
        id: `${zoom}/${tileX}/${tileY}`,
        url: `https://${shard}.basemaps.cartocdn.com/light_all/${zoom}/${wrappedTileX}/${tileY}.png`,
        x,
        y,
        width: toSvgX(normalizedRight) - x + 1,
        height: toSvgY(normalizedBottom) - y + 1,
      });
    }
  }

  return tiles;
}

function chooseTileZoom(bounds: {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}): number {
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

  if (span > 0.055) {
    return 10;
  }

  if (span > 0.026) {
    return 11;
  }

  if (span > 0.012) {
    return 12;
  }

  return 13;
}

function padBounds(bounds: {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}): { minX: number; maxX: number; minY: number; maxY: number } {
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

function getNormalizedDistance(
  left: LineMapStopView,
  right: LineMapStopView,
): number {
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
  const projection = Math.max(
    0,
    Math.min(1, getProjectionRatio(point, fromStop, toStop)),
  );
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

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function createFallbackMapOrder(
  stops: LineMapStopView[],
  branches: LineMapBranchView[],
): string[] {
  const longestBranch = [...branches].sort(
    (left, right) => right.stopIds.length - left.stopIds.length,
  )[0];

  if (longestBranch) {
    return longestBranch.stopIds;
  }

  return stops.map((stop) => stop.id);
}

function normalizeProjectedCoordinate(
  value: number,
  minValue: number,
  maxValue: number,
): number {
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
  return Array.from(new Set(normalizeText(value)
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
    .sort()));
}

function transferDirectionCovers(left: string[], right: string[]): boolean {
  if (left.length <= right.length) {
    return false;
  }

  const rightTokens = new Set(right);

  return right.length > 0 && right.every((token) => rightTokens.has(token)) &&
    right.every((token) => left.includes(token));
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

