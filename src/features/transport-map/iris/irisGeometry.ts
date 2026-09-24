import type { GlobalMapBounds, GlobalMapLine, GlobalMapMode, GlobalMapStation } from "../contracts/manifest";
import { lonLatToWorld, type WorldPoint } from "../geo/coordinateKernel";
import type { IrisDataset, IrisNeighborhood, IrisPolygonGeometry } from "./irisApi";

export interface IrisTransportLine {
  id: string;
  mode: GlobalMapMode;
}

export interface IrisTransportStation {
  lon: number;
  lat: number;
  lineIds: readonly string[];
  lines: readonly IrisTransportLine[];
}

export interface IrisNeighborhoodSelection {
  neighborhoods: IrisNeighborhood[];
  exact: boolean;
  communeName?: string;
}

export type IrisNeighborhoodSelectionScope = "city" | "commune";

export interface PreparedIrisNeighborhood {
  neighborhood: IrisNeighborhood;
  path: string;
  centroidWorld: WorldPoint;
  bounds: GlobalMapBounds;
}

export interface IrisNeighborhoodGroup {
  id: string;
  name: string;
  communeCode: string;
  communeName: string;
  departmentCode: string;
  centroid: [number, number];
  neighborhoods: readonly IrisNeighborhood[];
}

export interface PreparedIrisNeighborhoodGroup {
  group: IrisNeighborhoodGroup;
  neighborhoods: PreparedIrisNeighborhood[];
  boundaryPath: string;
  centroidWorld: WorldPoint;
  bounds: GlobalMapBounds;
}

export interface IrisTransportCounts {
  stationCount: number;
  lineCount: number;
  modes: Partial<Record<GlobalMapMode, number>>;
  /** Unique line ids serving the scope, in insertion order. */
  lineIds: string[];
}

export interface IrisAirNoiseGridCell {
  column: number;
  row: number;
  value: string;
}

export interface IrisAirNoiseGrid {
  bbox: readonly [number, number, number, number];
  cellSizeDegrees: number;
  columns: number;
  rows: number;
  cells: readonly IrisAirNoiseGridCell[];
}

export interface IrisNeighborhoodAirNoise {
  airScore: number;
  noiseScore: number;
  dominantClass: string;
  cellCount: number;
}

const GRID_CELL_DEGREES = 0.02;

export function selectIrisNeighborhoodsForPoint(
  dataset: IrisDataset,
  point: { lon: number; lat: number },
  options: { scope?: IrisNeighborhoodSelectionScope } = {},
): IrisNeighborhoodSelection {
  const selectionScope = options.scope ?? "city";
  const selectionKey = (neighborhood: IrisNeighborhood): string => selectionScope === "commune"
    ? neighborhood.communeCode
    : irisCityKey(neighborhood);
  const containing = dataset.neighborhoods.find((neighborhood) => pointInGeometry(point, neighborhood.geometry));
  if (containing) {
    const scopeKey = selectionKey(containing);
    return {
      neighborhoods: dataset.neighborhoods.filter((neighborhood) => selectionKey(neighborhood) === scopeKey),
      exact: true,
      communeName: containing.communeName,
    };
  }
  const nearest = dataset.neighborhoods.reduce<IrisNeighborhood | undefined>((best, neighborhood) => {
    if (!best) return neighborhood;
    return distanceSquared(point, neighborhood.centroid) < distanceSquared(point, best.centroid) ? neighborhood : best;
  }, undefined);
  return nearest
    ? {
        neighborhoods: dataset.neighborhoods.filter((neighborhood) => selectionKey(neighborhood) === selectionKey(nearest)),
        exact: false,
        communeName: nearest.communeName,
      }
    : { neighborhoods: [], exact: false };
}

export function prepareIrisNeighborhoods(neighborhoods: readonly IrisNeighborhood[]): PreparedIrisNeighborhood[] {
  return neighborhoods.map((neighborhood) => {
    const path = geometryToWorldPath(neighborhood.geometry);
    const centroidWorld = lonLatToWorld({ lon: neighborhood.centroid[0], lat: neighborhood.centroid[1] });
    return {
      neighborhood,
      path,
      centroidWorld,
      bounds: geometryWorldBounds(neighborhood.geometry),
    };
  });
}

/**
 * Collapse numbered IRIS names into their shared human-readable prefix.
 * The commune is part of the key so an identically named area in another
 * arrondissement is never merged into this one.
 */
export function groupIrisNeighborhoods(neighborhoods: readonly IrisNeighborhood[]): IrisNeighborhoodGroup[] {
  const groups = new Map<string, IrisNeighborhood[]>();
  for (const neighborhood of neighborhoods) {
    const prefix = irisNeighborhoodPrefix(neighborhood.name);
    const key = `${neighborhood.communeCode}\u0000${prefix}`;
    const members = groups.get(key);
    if (members) members.push(neighborhood);
    else groups.set(key, [neighborhood]);
  }

  return [...groups.values()].map((members) => {
    const first = members[0]!;
    const prefix = irisNeighborhoodPrefix(first.name);
    return {
      id: `${first.communeCode}:${prefix}`,
      name: members.length > 1 ? prefix : first.name,
      communeCode: first.communeCode,
      communeName: first.communeName,
      departmentCode: first.departmentCode,
      centroid: [
        members.reduce((sum, member) => sum + member.centroid[0], 0) / members.length,
        members.reduce((sum, member) => sum + member.centroid[1], 0) / members.length,
      ],
      neighborhoods: members,
    };
  });
}

export function prepareIrisNeighborhoodGroups(neighborhoods: readonly IrisNeighborhood[]): PreparedIrisNeighborhoodGroup[] {
  return groupIrisNeighborhoods(neighborhoods).map((group) => ({
    group,
    neighborhoods: prepareIrisNeighborhoods(group.neighborhoods),
    boundaryPath: neighborhoodBoundaryPath(group.neighborhoods),
    centroidWorld: lonLatToWorld({ lon: group.centroid[0], lat: group.centroid[1] }),
    bounds: boundsForIrisNeighborhoods(group.neighborhoods)!,
  }));
}

export function irisNeighborhoodPrefix(name: string): string {
  const normalized = name.trim();
  return normalized.replace(/\s+\d+$/u, "").trim() || normalized;
}

export function boundsForIrisNeighborhoods(neighborhoods: readonly IrisNeighborhood[]): GlobalMapBounds | undefined {
  return prepareIrisNeighborhoods(neighborhoods).reduce<GlobalMapBounds | undefined>((current, neighborhood) => {
    if (!current) return neighborhood.bounds;
    return {
      minX: Math.min(current.minX, neighborhood.bounds.minX),
      minY: Math.min(current.minY, neighborhood.bounds.minY),
      maxX: Math.max(current.maxX, neighborhood.bounds.maxX),
      maxY: Math.max(current.maxY, neighborhood.bounds.maxY),
    };
  }, undefined);
}

/** Return world-coordinate bounds for an arbitrary IRIS-derived polygon. */
export function boundsForIrisGeometry(geometry: IrisPolygonGeometry): GlobalMapBounds {
  return geometryWorldBounds(geometry);
}

export function boundsForIrisDataset(dataset: IrisDataset): GlobalMapBounds {
  const northWest = lonLatToWorld({ lon: dataset.bbox[0], lat: dataset.bbox[3] });
  const southEast = lonLatToWorld({ lon: dataset.bbox[2], lat: dataset.bbox[1] });
  return {
    minX: Math.min(northWest.x, southEast.x),
    minY: Math.min(northWest.y, southEast.y),
    maxX: Math.max(northWest.x, southEast.x),
    maxY: Math.max(northWest.y, southEast.y),
  };
}

export function countIrisTransport(
  neighborhoods: readonly IrisNeighborhood[],
  stations: readonly IrisTransportStation[],
): ReadonlyMap<string, IrisTransportCounts> {
  const results = new Map<string, IrisTransportCounts>();
  const prepared = prepareIrisNeighborhoods(neighborhoods);
  const grid = new Map<string, number[]>();
  prepared.forEach((neighborhood, index) => {
    for (const key of geometryGridKeys(neighborhood.neighborhood.geometry)) {
      const entries = grid.get(key);
      if (entries) entries.push(index);
      else grid.set(key, [index]);
    }
    results.set(neighborhood.neighborhood.id, { stationCount: 0, lineCount: 0, modes: {}, lineIds: [] });
  });

  const lineIdsByNeighborhood = new Map<string, Set<string>>();
  const modeLineIdsByNeighborhood = new Map<string, Map<GlobalMapMode, Set<string>>>();
  stations.forEach((station) => {
    if (!Number.isFinite(station.lon) || !Number.isFinite(station.lat)) return;
    const candidates = grid.get(gridKey(station.lon, station.lat)) ?? [];
    const uniqueCandidates = new Set(candidates);
    uniqueCandidates.forEach((index) => {
      const neighborhood = prepared[index];
      if (!neighborhood || !pointInGeometry({ lon: station.lon, lat: station.lat }, neighborhood.neighborhood.geometry)) return;
      const id = neighborhood.neighborhood.id;
      const current = results.get(id)!;
      current.stationCount += 1;
      const lineIds = lineIdsByNeighborhood.get(id) ?? new Set<string>();
      for (const line of station.lines) {
        if (station.lineIds.includes(line.id)) {
          lineIds.add(line.id);
          const modeLineIds = modeLineIdsByNeighborhood.get(id) ?? new Map<GlobalMapMode, Set<string>>();
          const modeIds = modeLineIds.get(line.mode) ?? new Set<string>();
          modeIds.add(line.id);
          modeLineIds.set(line.mode, modeIds);
          modeLineIdsByNeighborhood.set(id, modeLineIds);
        }
      }
      lineIdsByNeighborhood.set(id, lineIds);
    });
  });
  results.forEach((counts, id) => {
    const uniqueLineIds = lineIdsByNeighborhood.get(id) ?? new Set<string>();
    counts.lineCount = uniqueLineIds.size;
    counts.lineIds = [...uniqueLineIds];
    // A line can serve several physical stations in the same IRIS. Counting
    // unique line ids answers “how many lines”, not “how many stops”.
    const modeLineIds = modeLineIdsByNeighborhood.get(id) ?? new Map<GlobalMapMode, Set<string>>();
    counts.modes = Object.fromEntries([...modeLineIds.entries()].map(([mode, lineIds]) => [mode, lineIds.size])) as Partial<Record<GlobalMapMode, number>>;
  });
  return results;
}

/**
 * Aggregate transport lines across a complete IRIS scope such as a commune.
 *
 * A line can serve several neighborhoods in the same scope, so its id is
 * collected once before the mode totals are computed.
 */
export function countIrisTransportInNeighborhoods(
  neighborhoods: readonly IrisNeighborhood[],
  stations: readonly IrisTransportStation[],
): IrisTransportCounts {
  if (neighborhoods.length === 0) return { stationCount: 0, lineCount: 0, modes: {}, lineIds: [] };

  const scopedStations = filterIrisTransportStationsInNeighborhoods(neighborhoods, stations);
  const uniqueLineModes = new Map<string, GlobalMapMode>();
  let stationCount = 0;
  for (const station of scopedStations) {
    stationCount += 1;
    for (const line of station.lines) {
      if (station.lineIds.includes(line.id) && !uniqueLineModes.has(line.id)) {
        uniqueLineModes.set(line.id, line.mode);
      }
    }
  }

  const modes = new Map<GlobalMapMode, number>();
  for (const mode of uniqueLineModes.values()) modes.set(mode, (modes.get(mode) ?? 0) + 1);
  return {
    stationCount,
    lineCount: uniqueLineModes.size,
    modes: Object.fromEntries(modes.entries()) as Partial<Record<GlobalMapMode, number>>,
    lineIds: [...uniqueLineModes.keys()],
  };
}

/**
 * Keep the physical stations whose coordinates lie in at least one selected
 * IRIS polygon. Callers that need station details must use this same scope
 * before collecting co-served lines; filtering by a line id alone would match
 * every station along that line across the network.
 */
export function filterIrisTransportStationsInNeighborhoods(
  neighborhoods: readonly IrisNeighborhood[],
  stations: readonly IrisTransportStation[],
): IrisTransportStation[] {
  if (neighborhoods.length === 0) return [];

  const spatialIndex = new Map<string, number[]>();
  neighborhoods.forEach((neighborhood, index) => {
    for (const key of geometryGridKeys(neighborhood.geometry)) {
      const entries = spatialIndex.get(key);
      if (entries) entries.push(index);
      else spatialIndex.set(key, [index]);
    }
  });

  return stations.filter((station) => {
    if (!Number.isFinite(station.lon) || !Number.isFinite(station.lat)) return false;
    const point = { lon: station.lon, lat: station.lat };
    return (spatialIndex.get(gridKey(station.lon, station.lat)) ?? []).some((index) => {
      const neighborhood = neighborhoods[index];
      return Boolean(neighborhood && pointInGeometry(point, neighborhood.geometry));
    });
  });
}

/**
 * Aggregate the official air/noise grid by IRIS polygon.
 *
 * A regular SIG cell belongs to the neighborhood containing its center. This
 * keeps the result deterministic and avoids pretending to know a fractional
 * overlap when the source only provides one class per cell. Neighborhoods
 * without a matched cell stay absent from the returned map so callers can
 * expose incomplete coverage instead of silently falling back.
 */
export function scoreIrisNeighborhoodsFromGrid(
  neighborhoods: readonly IrisNeighborhood[],
  grid: IrisAirNoiseGrid,
): ReadonlyMap<string, IrisNeighborhoodAirNoise> {
  if (!isUsableAirNoiseGrid(grid) || neighborhoods.length === 0) return new Map();

  const prepared = neighborhoods.map((neighborhood) => ({
    neighborhood,
    classes: new Map<string, number>(),
  }));
  const spatialIndex = new Map<string, number[]>();
  prepared.forEach((entry, index) => {
    for (const key of geometryGridKeys(entry.neighborhood.geometry)) {
      const entries = spatialIndex.get(key);
      if (entries) entries.push(index);
      else spatialIndex.set(key, [index]);
    }
  });

  const [minLon, minLat] = grid.bbox;
  for (const cell of grid.cells) {
    if (!isUsableAirNoiseGridCell(cell, grid)) continue;
    const center = {
      lon: minLon + (cell.column + 0.5) * grid.cellSizeDegrees,
      lat: minLat + (cell.row + 0.5) * grid.cellSizeDegrees,
    };
    const candidates = spatialIndex.get(gridKey(center.lon, center.lat)) ?? [];
    for (const index of new Set(candidates)) {
      const entry = prepared[index];
      if (!entry || !pointInGeometry(center, entry.neighborhood.geometry)) continue;
      entry.classes.set(cell.value, (entry.classes.get(cell.value) ?? 0) + 1);
      break;
    }
  }

  const results = new Map<string, IrisNeighborhoodAirNoise>();
  for (const entry of prepared) {
    const cellCount = [...entry.classes.values()].reduce((sum, count) => sum + count, 0);
    if (cellCount === 0) continue;
    const weightedScore = (component: 0 | 1): number => roundAirNoiseScore(
      [...entry.classes.entries()].reduce(
        (sum, [className, count]) => sum + airNoiseClassScore(className, component) * count,
        0,
      ) / cellCount,
    );
    const dominantClass = [...entry.classes.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
    if (!dominantClass) continue;
    results.set(entry.neighborhood.id, {
      airScore: weightedScore(1),
      noiseScore: weightedScore(0),
      dominantClass,
      cellCount,
    });
  }
  return results;
}

export type IrisAirNoiseLevel = 1 | 2 | 3;

/** Convert the same 0/5/10 score scale used by the verdict service to a grid level. */
export function irisAirNoiseLevelFromScore(score: number): IrisAirNoiseLevel {
  if (score >= 7.5) return 1;
  if (score <= 2.5) return 3;
  return 2;
}

export function transportStationsFromNetwork(
  stations: readonly GlobalMapStation[],
  linesById: ReadonlyMap<string, GlobalMapLine>,
): IrisTransportStation[] {
  return stations.map((station) => ({
    lon: station.lon,
    lat: station.lat,
    lineIds: station.lineIds,
    lines: station.lineIds.map((lineId) => linesById.get(lineId)).filter((line): line is GlobalMapLine => Boolean(line)),
  }));
}

function geometryToWorldPath(geometry: IrisPolygonGeometry): string {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flatMap((polygon) => polygon.map((ring) => {
    const points = ring.map(([lon, lat]) => lonLatToWorld({ lon, lat }));
    return `${points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(9)} ${point.y.toFixed(9)}`).join(" ")} Z`;
  })).join(" ");
}

export interface IrisBoundarySegment {
  from: [number, number];
  to: [number, number];
}

export function boundarySegmentsForIrisNeighborhoods(
  neighborhoods: readonly IrisNeighborhood[],
): IrisBoundarySegment[] {
  const edges = new Map<string, { from: [number, number]; to: [number, number] }>();
  for (const neighborhood of neighborhoods) {
    const polygons = neighborhood.geometry.type === "Polygon" ? [neighborhood.geometry.coordinates] : neighborhood.geometry.coordinates;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (let index = 0; index < ring.length; index += 1) {
          const from = ring[index]!;
          const to = ring[(index + 1) % ring.length]!;
          const fromKey = boundaryPointKey(from);
          const toKey = boundaryPointKey(to);
          if (fromKey === toKey) continue;
          const key = [fromKey, toKey].sort().join("|");
          if (edges.has(key)) edges.delete(key);
          else edges.set(key, { from: [from[0]!, from[1]!], to: [to[0]!, to[1]!] });
        }
      }
    }
  }

  return [...edges.values()];
}

/**
 * Returns only the outer edges of a collection of IRIS polygons.
 * Shared edges are removed so a commune can be drawn as one readable zone
 * instead of a stack of visible neighbourhood borders.
 */
export function neighborhoodBoundaryPath(neighborhoods: readonly IrisNeighborhood[]): string {
  return boundarySegmentsForIrisNeighborhoods(neighborhoods).map(({ from, to }) => {
    const start = lonLatToWorld({ lon: from[0], lat: from[1] });
    const end = lonLatToWorld({ lon: to[0], lat: to[1] });
    return `M ${start.x.toFixed(9)} ${start.y.toFixed(9)} L ${end.x.toFixed(9)} ${end.y.toFixed(9)}`;
  }).join(" ");
}

function boundaryPointKey(point: readonly number[]): string {
  return `${point[0]!.toFixed(7)},${point[1]!.toFixed(7)}`;
}

function geometryWorldBounds(geometry: IrisPolygonGeometry): GlobalMapBounds {
  const coordinates = geometry.type === "Polygon" ? geometry.coordinates.flat(1) : geometry.coordinates.flat(2);
  const points = coordinates.map(([lon, lat]) => lonLatToWorld({ lon, lat }));
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function pointInGeometry(point: { lon: number; lat: number }, geometry: IrisPolygonGeometry): boolean {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(([outer, ...holes]) => Boolean(outer && pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole))));
}

export function pointInIrisGeometry(point: { lon: number; lat: number }, geometry: IrisPolygonGeometry): boolean {
  return pointInGeometry(point, geometry);
}

function pointInRing(point: { lon: number; lat: number }, ring: readonly number[][]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index]!;
    const prior = ring[previous]!;
    const intersects = ((current[1]! > point.lat) !== (prior[1]! > point.lat)) &&
      point.lon < ((prior[0]! - current[0]!) * (point.lat - current[1]!)) / (prior[1]! - current[1]!) + current[0]!;
    if (intersects) inside = !inside;
  }
  return inside;
}

function geometryGridKeys(geometry: IrisPolygonGeometry): string[] {
  const bounds = geometry.type === "Polygon" ? geometry.coordinates.flat(1) : geometry.coordinates.flat(2);
  const longitudes = bounds.map((coordinate) => coordinate[0]!);
  const latitudes = bounds.map((coordinate) => coordinate[1]!);
  const minLon = Math.floor(Math.min(...longitudes) / GRID_CELL_DEGREES);
  const maxLon = Math.floor(Math.max(...longitudes) / GRID_CELL_DEGREES);
  const minLat = Math.floor(Math.min(...latitudes) / GRID_CELL_DEGREES);
  const maxLat = Math.floor(Math.max(...latitudes) / GRID_CELL_DEGREES);
  const keys: string[] = [];
  for (let lon = minLon; lon <= maxLon; lon += 1) {
    for (let lat = minLat; lat <= maxLat; lat += 1) keys.push(`${lon}:${lat}`);
  }
  return keys;
}

function gridKey(lon: number, lat: number): string {
  return `${Math.floor(lon / GRID_CELL_DEGREES)}:${Math.floor(lat / GRID_CELL_DEGREES)}`;
}

function isUsableAirNoiseGrid(grid: IrisAirNoiseGrid): boolean {
  return Number.isFinite(grid.cellSizeDegrees)
    && grid.cellSizeDegrees > 0
    && Number.isInteger(grid.columns)
    && grid.columns > 0
    && Number.isInteger(grid.rows)
    && grid.rows > 0
    && grid.bbox.length === 4
    && grid.bbox[0] < grid.bbox[2]
    && grid.bbox[1] < grid.bbox[3];
}

function isUsableAirNoiseGridCell(cell: IrisAirNoiseGridCell, grid: IrisAirNoiseGrid): boolean {
  return Number.isInteger(cell.column)
    && cell.column >= 0
    && cell.column < grid.columns
    && Number.isInteger(cell.row)
    && cell.row >= 0
    && cell.row < grid.rows
    && /^[123][123]$/u.test(cell.value);
}

/** Same component mapping as server/services/neighborhoodVerdict/score.ts. */
function airNoiseClassScore(className: string, component: 0 | 1): number {
  return 10 - 5 * (Number(className[component]) - 1);
}

function roundAirNoiseScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function distanceSquared(point: { lon: number; lat: number }, centroid: readonly [number, number]): number {
  return (point.lon - centroid[0]) ** 2 + (point.lat - centroid[1]) ** 2;
}

/**
 * INSEE represents the twenty Paris arrondissements as separate commune-like
 * codes. The city view should still cover Paris as one city, while ordinary
 * communes continue to match by their stable commune code.
 */
export function irisCityName(neighborhood: IrisNeighborhood): string {
  const arrondissementCity = neighborhood.communeName.match(/^(.*?)\s+\d+(?:er|e)\s+Arrondissement$/iu)?.[1]?.trim();
  return arrondissementCity || neighborhood.communeName;
}

export function irisCityKey(neighborhood: IrisNeighborhood): string {
  const arrondissementCity = neighborhood.communeName.match(/^(.*?)\s+\d+(?:er|e)\s+Arrondissement$/iu)?.[1]?.trim();
  return arrondissementCity || neighborhood.communeCode;
}
