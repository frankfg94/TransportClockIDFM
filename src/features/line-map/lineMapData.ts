import {
  fetchLineRouteSequences,
  fetchLineRouteSummaries,
  fetchStationTransfers,
  searchLineStations,
} from "../../services/idfm";
import type {
  LineRouteSequence,
  LineRouteStop,
  LineSearchOption,
  StationSearchOption,
  TransferLineOption,
} from "../../types/transit";
import type {
  LineMapBranchView,
  LineMapSegmentView,
  LineMapStopView,
  LineMapViewModel,
  MapTile,
  TransferLineDirections,
} from "./types";

const VIEWBOX_WIDTH = 1080;
const VIEWBOX_HEIGHT = 620;
const SVG_PADDING_X = 78;
const SVG_PADDING_Y = 68;
const MAP_COORDINATE_PADDING = 0.08;
const TILE_SERVER_SHARDS = ["a", "b", "c"];
const LAMBERT93_E = 0.0818191910428158;
const LAMBERT93_N = 0.725607765053267;
const LAMBERT93_C = 11754255.426096;
const LAMBERT93_XS = 700000;
const LAMBERT93_YS = 12655612.049876;
const LAMBERT93_LON0_RAD = (3 * Math.PI) / 180;

interface CanonicalStationLookup {
  byLabel: Map<string, StationSearchOption[]>;
}

interface ProjectedBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface ProjectedViewport {
  bounds: ProjectedBounds;
  project(point: { x: number; y: number }): { x: number; y: number };
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
      stopIds,
    });
  });

  const stops = applyMapCoordinates(Array.from(stopsById.values()), branches);

  return {
    lineId: line.id,
    lineLabel: line.label,
    lineColor: line.color ?? "#0064ff",
    textColor: line.textColor ?? "#ffffff",
    stops,
    segments: createLineMapSegments(stops, branches),
    branches,
    tiles: createMapTiles(stops),
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

  if (typeof stop.lon === "number" && typeof stop.lat === "number") {
    return {
      ...stop,
      station,
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
        lon: converted.lon,
        lat: converted.lat,
        coordinateSource: "lambert93" as const,
      };
    }
  }

  return {
    ...stop,
    station,
  };
}

function applyMapCoordinates(
  stops: LineMapStopView[],
  branches: LineMapBranchView[],
): LineMapStopView[] {
  const stopsWithCoordinates = stops.filter(
    (stop) => typeof stop.lon === "number" && typeof stop.lat === "number",
  );

  if (stopsWithCoordinates.length >= 2) {
    const projectedStops = stopsWithCoordinates.map((stop) => ({
      stop,
      point: projectLonLat(stop.lon as number, stop.lat as number),
    }));
    const viewport = createProjectedViewport({
      minX: Math.min(...projectedStops.map((item) => item.point.x)),
      maxX: Math.max(...projectedStops.map((item) => item.point.x)),
      minY: Math.min(...projectedStops.map((item) => item.point.y)),
      maxY: Math.max(...projectedStops.map((item) => item.point.y)),
    });

    return stops.map((stop) => {
      if (typeof stop.lon !== "number" || typeof stop.lat !== "number") {
        return stop;
      }

      const point = projectLonLat(stop.lon, stop.lat);
      const normalizedPoint = viewport.project(point);

      return {
        ...stop,
        x: normalizedPoint.x,
        y: normalizedPoint.y,
      };
    });
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

    return stops.map((stop) => {
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
    });
  }

  const orderedStopIds = createFallbackMapOrder(stops, branches);

  return stops.map((stop) => {
    const index = orderedStopIds.indexOf(stop.id);
    const ratio =
      orderedStopIds.length > 1 ? index / (orderedStopIds.length - 1) : 0.5;

    return {
      ...stop,
      coordinateSource: stop.coordinateSource ?? "fallback",
      x: normalizeMapRatio(index >= 0 ? ratio : 0.5),
      y: 0.5,
    };
  });
}

function createLineMapSegments(
  stops: LineMapStopView[],
  branches: LineMapBranchView[],
): LineMapSegmentView[] {
  const stopById = new Map(stops.map((stop) => [stop.id, stop]));
  const segments = new Map<string, LineMapSegmentView & { length: number }>();

  branches.forEach((branch) => {
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
          length: getNormalizedDistance(fromStop, toStop),
        });
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
      !isExpressChord(segment, stops, stopById, medianLength),
    )
    .map(({ id, fromStopId, toStopId }) => ({ id, fromStopId, toStopId }));
}

function createMapTiles(stops: LineMapStopView[]): MapTile[] {
  const stopsWithCoordinates = stops.filter(
    (stop) => typeof stop.lon === "number" && typeof stop.lat === "number",
  );

  if (stopsWithCoordinates.length < 2) {
    return [];
  }

  const projectedStops = stopsWithCoordinates.map((stop) =>
    projectLonLat(stop.lon as number, stop.lat as number),
  );
  const viewport = createProjectedViewport({
    minX: Math.min(...projectedStops.map((point) => point.x)),
    maxX: Math.max(...projectedStops.map((point) => point.x)),
    minY: Math.min(...projectedStops.map((point) => point.y)),
    maxY: Math.max(...projectedStops.map((point) => point.y)),
  });
  const bounds = viewport.bounds;
  const zoom = chooseTileZoom(bounds);
  const scale = 2 ** zoom;
  const minTileX = Math.floor(bounds.minX * scale);
  const maxTileX = Math.floor(bounds.maxX * scale);
  const minTileY = Math.floor(bounds.minY * scale);
  const maxTileY = Math.floor(bounds.maxY * scale);
  const tiles: MapTile[] = [];

  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      const shard = TILE_SERVER_SHARDS[(tileX + tileY) % TILE_SERVER_SHARDS.length];
      const wrappedTileX = ((tileX % scale) + scale) % scale;
      const left = tileX / scale;
      const top = tileY / scale;
      const tileSizeX = 1 / scale;
      const tileSizeY = 1 / scale;
      const normalizedTopLeft = viewport.project({ x: left, y: top });
      const normalizedBottomRight = viewport.project({
        x: left + tileSizeX,
        y: top + tileSizeY,
      });
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

function createProjectedViewport(bounds: ProjectedBounds): ProjectedViewport {
  const paddedBounds = padBounds(bounds);
  const innerWidth = VIEWBOX_WIDTH - SVG_PADDING_X * 2;
  const innerHeight = VIEWBOX_HEIGHT - SVG_PADDING_Y * 2;
  const spanX = Math.max(paddedBounds.maxX - paddedBounds.minX, 0.000001);
  const spanY = Math.max(paddedBounds.maxY - paddedBounds.minY, 0.000001);
  const centerX = (paddedBounds.minX + paddedBounds.maxX) / 2;
  const centerY = (paddedBounds.minY + paddedBounds.maxY) / 2;
  const availableX = innerWidth * (1 - MAP_COORDINATE_PADDING * 2);
  const availableY = innerHeight * (1 - MAP_COORDINATE_PADDING * 2);
  const scale = Math.min(availableX / spanX, availableY / spanY);
  const visibleWidth = innerWidth / scale;
  const visibleHeight = innerHeight / scale;

  return {
    bounds: {
      minX: centerX - visibleWidth / 2,
      maxX: centerX + visibleWidth / 2,
      minY: centerY - visibleHeight / 2,
      maxY: centerY + visibleHeight / 2,
    },
    project(point) {
      return {
        x: 0.5 + ((point.x - centerX) * scale) / innerWidth,
        y: 0.5 + ((point.y - centerY) * scale) / innerHeight,
      };
    },
  };
}

function projectLonLat(lon: number, lat: number): { x: number; y: number } {
  const boundedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const latRadians = (boundedLat * Math.PI) / 180;

  return {
    x: (lon + 180) / 360,
    y:
      (1 -
        Math.log(Math.tan(latRadians) + 1 / Math.cos(latRadians)) / Math.PI) /
      2,
  };
}

function convertLambert93ToWgs84(
  x: number,
  y: number,
): { lon: number; lat: number } | undefined {
  if (!isLikelyLambert93Coordinate(x, y)) {
    return undefined;
  }

  const radius = Math.hypot(x - LAMBERT93_XS, y - LAMBERT93_YS);
  const gamma = Math.atan2(x - LAMBERT93_XS, LAMBERT93_YS - y);
  const latIso = -(1 / LAMBERT93_N) * Math.log(radius / LAMBERT93_C);
  const lonRad = LAMBERT93_LON0_RAD + gamma / LAMBERT93_N;
  let latRad = 2 * Math.atan(Math.exp(latIso)) - Math.PI / 2;

  for (let index = 0; index < 6; index += 1) {
    const eSinLat = LAMBERT93_E * Math.sin(latRad);
    latRad =
      2 *
        Math.atan(
          Math.pow((1 + eSinLat) / (1 - eSinLat), LAMBERT93_E / 2) *
            Math.exp(latIso),
        ) -
      Math.PI / 2;
  }

  const lon = (lonRad * 180) / Math.PI;
  const lat = (latRad * 180) / Math.PI;

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return undefined;
  }

  return { lon, lat };
}

function isLikelyLambert93Coordinate(x: number, y: number): boolean {
  return x >= 100000 && x <= 1300000 && y >= 6000000 && y <= 7200000;
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

