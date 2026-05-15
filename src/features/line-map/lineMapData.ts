import {
  fetchLineRouteSequences,
  fetchLineRouteSummaries,
  fetchStationTransfers,
} from "../../services/idfm";
import type {
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
const MAP_COORDINATE_PADDING = 0.08;
const TILE_SERVER_SHARDS = ["a", "b", "c"];

export async function loadDetailedLineMap(
  line: LineSearchOption,
): Promise<LineMapViewModel> {
  const sequences = await fetchLineRouteSequences(line);
  const stopsById = new Map<string, LineMapStopView>();
  const branches: LineMapBranchView[] = [];

  sequences.forEach((sequence) => {
    const stopIds = sequence.stops.map((stop) => stop.id);

    sequence.stops.forEach((stop) => {
      const existingStop = stopsById.get(stop.id);

      if (existingStop) {
        addUniqueValue(existingStop.routeIds, sequence.id);
        addUniqueValue(existingStop.routeLabels, sequence.label);
        return;
      }

      stopsById.set(stop.id, {
        ...stop,
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
  const directions = routes
    .flatMap((route) => [route.direction, route.label])
    .filter((value): value is string => Boolean(value))
    .map(cleanNavitiaDirection)
    .map((value) => value.replace(/\s+\([^)]*\)$/u, ""))
    .filter(Boolean);

  return {
    lineId,
    directions: Array.from(new Set(directions)).slice(0, 6),
  };
}

export function isBusTransfer(transfer: TransferLineOption): boolean {
  return normalizeText(transfer.mode).includes("bus");
}

export function isStructuralTransfer(transfer: TransferLineOption): boolean {
  return !isBusTransfer(transfer);
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
    const minX = Math.min(...projectedStops.map((item) => item.point.x));
    const maxX = Math.max(...projectedStops.map((item) => item.point.x));
    const minY = Math.min(...projectedStops.map((item) => item.point.y));
    const maxY = Math.max(...projectedStops.map((item) => item.point.y));
    const bounds = padBounds({ minX, maxX, minY, maxY });

    return stops.map((stop) => {
      if (typeof stop.lon !== "number" || typeof stop.lat !== "number") {
        return stop;
      }

      const point = projectLonLat(stop.lon, stop.lat);

      return {
        ...stop,
        x: normalizeProjectedCoordinate(point.x, bounds.minX, bounds.maxX),
        y: normalizeProjectedCoordinate(point.y, bounds.minY, bounds.maxY),
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
  const bounds = padBounds({
    minX: Math.min(...projectedStops.map((point) => point.x)),
    maxX: Math.max(...projectedStops.map((point) => point.x)),
    minY: Math.min(...projectedStops.map((point) => point.y)),
    maxY: Math.max(...projectedStops.map((point) => point.y)),
  });
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

      tiles.push({
        id: `${zoom}/${tileX}/${tileY}`,
        url: `https://${shard}.basemaps.cartocdn.com/light_all/${zoom}/${wrappedTileX}/${tileY}.png`,
        x: ((left - bounds.minX) / (bounds.maxX - bounds.minX)) * VIEWBOX_WIDTH,
        y: ((top - bounds.minY) / (bounds.maxY - bounds.minY)) * VIEWBOX_HEIGHT,
        width: (tileSizeX / (bounds.maxX - bounds.minX)) * VIEWBOX_WIDTH + 1,
        height: (tileSizeY / (bounds.maxY - bounds.minY)) * VIEWBOX_HEIGHT + 1,
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
  if (!medianLength || segment.length < medianLength * 2.35) {
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
  const tolerance = Math.max(0.018, Math.min(0.055, segmentLength * 0.12));

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

function addUniqueValue(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function cleanNavitiaDirection(value: string): string {
  return value.replace(/\s+\([^)]*\)$/u, "");
}

function normalizeText(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
