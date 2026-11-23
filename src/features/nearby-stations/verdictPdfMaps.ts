import type { LineTopology } from "../../../server/services/topology/types";
import { mapFrequencyStops } from "../../../shared/gtfs/frequencyTopology";
import { resolveTransitLonLat } from "../network-ghost/geoProjection";
import { getCoordinatesDistanceMeters } from "../../services/distance";
import { normalizeStationName } from "./neighborhoodStationReferences";
import type { Feature, FeatureCollection, LineString, MultiPolygon, Point, Polygon } from "geojson";
import type { GreenMapReference, GreenPoint } from "../../../shared/natureInCity";
import type { CityCommerceSnapshot } from "./cityCommerceSnapshot";
import type { NeighborhoodFact, NeighborhoodScoreResult } from "./neighborhood/contracts";
import type { IrisPolygonGeometry, IrisNeighborhood } from "../transport-map/iris/irisApi";
import type { TransportMapNetwork, TransportMapViewportResult } from "../transport-map/contracts/network";
import type { GlobalMapBounds, GlobalMapLine, GlobalMapMode, GlobalMapPath, GlobalMapStation } from "../transport-map/contracts/manifest";
import { getGlobalMapPathSubpathRanges, resolveGlobalMapVertex } from "../transport-map/contracts/manifest";
import { lonLatToWorld, worldToLonLat } from "../transport-map/geo/coordinateKernel";
import { createCamera, fitCameraToBounds, type CameraState } from "../transport-map/geo/camera";

import { locateAtGreenBoundary } from "../../../shared/greenSpaceBoundary";

export interface VerdictPdfGreenReference {
  reference: GreenMapReference;
  name: string;
}

export type VerdictPdfHeavyAccess = NonNullable<NeighborhoodFact["transportMapAccess"]>;

export type VerdictPdfMapKind = "commerce" | "greenery" | "noise" | "city-transit" | "neighborhood-transit";

export interface VerdictPdfMapArea {
  code: string;
  name: string;
  geometry: IrisPolygonGeometry;
}

export interface VerdictPdfMapContext {
  city?: string;
  originIcon?: string;
  heavyAccess?: readonly VerdictPdfHeavyAccess[];
  nightAccess?: readonly { code: string; station: string; minutes: number }[];
  origin?: GreenPoint;
  areas: readonly VerdictPdfMapArea[];
  selectedCodes: readonly string[];
  greenReferences: readonly VerdictPdfGreenReference[];
  network?: TransportMapNetwork;
  commerce?: { status: "ready" | "unavailable"; snapshot?: CityCommerceSnapshot };
  transit?: Partial<Record<"city-transit" | "neighborhood-transit", Pick<TransportMapViewportResult, "paths" | "stations">>> & { detailedRailPaths?: readonly GlobalMapPath[] };
}

export interface VerdictPdfTransitProperties {
  color: string;
  mode: string;
  code: string;
  label: string;
  lineId: string;
}

export interface VerdictPdfTransitLegendEntry {
  mode: Exclude<GlobalMapMode, "BIKE">;
  count: number;
  line: GlobalMapLine;
  code: string;
}

export interface VerdictPdfAreaProperties {
  code: string;
  name: string;
  selected: boolean;
}

const PUBLIC_TRANSPORT_MODES = new Set(["BUS", "NOCTILIEN", "METRO", "RER", "TRAIN", "TRANSILIEN", "TRAM", "CABLE"]);
const VERDICT_PDF_TRANSPORT_MODE_ORDER: readonly Exclude<GlobalMapMode, "BIKE">[] = [
  "BUS", "METRO", "RER", "TRAIN", "TRANSILIEN", "TRAM", "CABLE", "NOCTILIEN",
];
const EARTH_CIRCUMFERENCE_METERS = 2 * Math.PI * 6_378_137;

export function collectVerdictGreenReferences(result: NeighborhoodScoreResult): VerdictPdfGreenReference[] {
  const references = new Map<string, VerdictPdfGreenReference>();
  const positiveFacts = [...result.categories.flatMap(category => category.positiveFacts), ...(result.positiveFacts ?? [])];
  for (const fact of positiveFacts) {
    const reference = fact.greenMap;
    if (!reference || (reference.scope !== "park" && reference.scope !== "woodland")) continue;
    const name = String(fact.greenSpaceAccess?.name ?? fact.labelValues?.name ?? fact.labelValues?.park
      ?? (reference.scope === "woodland" ? reference.id : "")).trim();
    const key = `${reference.scope}:${reference.id}`;
    if (!references.get(key)?.name) references.set(key, { reference, name });
  }
  return [...references.values()];
}

/** Use actual boarding patterns through the selected stop and exclude trips that end there. */
export function verdictPdfBusTermini(topology: LineTopology, station: GlobalMapStation): string[] {
  const aliases = [station.id, ...station.rawRefs].map(id => ({ id, name: station.name, lon: station.lon, lat: station.lat }));
  const boardingIds = new Set(mapFrequencyStops(aliases, topology).values());
  const name = normalizeStationName(station.name);
  const namesById = new Map(topology.stations.map(stop => [stop.id, stop.name]));
  for (const stop of topology.stations) {
    if (normalizeStationName(stop.name) !== name) continue;
    const point = resolveTransitLonLat(stop);
    if (point && getCoordinatesDistanceMeters(station.lat, station.lon, point.lat, point.lon) <= 120) {
      boardingIds.add(stop.id);
    }
  }
  const directions = new Map<string, number>();
  for (const pattern of topology.patterns) {
    if (!pattern.stops.slice(0, -1).some(id => boardingIds.has(id))) continue;
    const terminal = namesById.get(pattern.terminalTo) ?? namesById.get(pattern.stops.at(-1) ?? "");
    if (!terminal) continue;
    directions.set(terminal, (directions.get(terminal) ?? 0) + pattern.tripCount);
  }
  return [...directions].sort(([a, tripsA], [b, tripsB]) => tripsB - tripsA || a.localeCompare(b)).map(([terminal]) => terminal);
}

/** Prefer a point inside the footprint, including for narrow or concave parks. */
export function verdictPdfGreenLabelPoint(geometry: Polygon | MultiPolygon): GreenPoint | undefined {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let best: { point: GreenPoint; clearance: number } | undefined;
  for (const coordinates of polygons) {
    const polygon: Polygon = { type: "Polygon", coordinates };
    const bounds = boundsForGeometries([polygon]);
    if (!bounds) continue;
    for (let row = 0; row < 11; row++) {
      for (let column = 0; column < 11; column++) {
        const point = worldToLonLat({
          x: bounds.minX + (column + 0.5) / 11 * (bounds.maxX - bounds.minX),
          y: bounds.minY + (row + 0.5) / 11 * (bounds.maxY - bounds.minY),
        });
        const hit = locateAtGreenBoundary(point, polygon);
        if (hit.inside && hit.distanceMeters > (best?.clearance ?? 0)) best = { point, clearance: hit.distanceMeters };
      }
    }
  }
  if (best) return best.point;
  const first = polygons[0]?.[0]?.[0];
  return first?.[0] !== undefined && first[1] !== undefined ? { lon: first[0], lat: first[1] } : undefined;
}

export interface VerdictPdfMapPoint { x: number; y: number }

export function projectVerdictPdfStation(
  station: VerdictPdfMapPoint,
  origin: VerdictPdfMapPoint,
  width: number,
  height: number,
) {
  const outside = station.x < 0 || station.x > width || station.y < 0 || station.y > height;
  if (!outside) return { anchor: station, outside, angle: 0 };
  const inset = 12;
  const from = {
    x: Math.max(inset, Math.min(width - inset, origin.x)),
    y: Math.max(inset, Math.min(height - inset, origin.y)),
  };
  const dx = station.x - from.x;
  const dy = station.y - from.y;
  const scaleX = dx === 0 ? Infinity : ((dx > 0 ? width - inset : inset) - from.x) / dx;
  const scaleY = dy === 0 ? Infinity : ((dy > 0 ? height - inset : inset) - from.y) / dy;
  const scale = Math.min(scaleX, scaleY);
  return {
    anchor: { x: from.x + dx * scale, y: from.y + dy * scale },
    outside,
    angle: Math.atan2(dy, dx) * 180 / Math.PI,
  };
}

// A platform suffix and spacing around a hyphen do not change the station name.
function verdictStationName(name: string): string {
  return name.normalize("NFC")
    .replace(/\s*(?:[-–—]\s*)?(?:BV\s+)?(?:voie|quai|platform)\s+[a-z0-9]+$/iu, "")
    .replace(/\s*[-–—]\s*/gu, "-")
    .replace(/\s+/gu, " ").trim();
}

export function collectVerdictHeavyAccess(facts: readonly Pick<NeighborhoodFact, "transportMapAccess">[]): VerdictPdfHeavyAccess[] {
  const routes: VerdictPdfHeavyAccess[] = [];
  for (const { transportMapAccess: access } of facts) {
    if (!access?.lines.length || !Number.isFinite(access.minutes)) continue;
    const { station } = access;
    if (!Number.isFinite(station.lat) || !Number.isFinite(station.lon)) continue;
    const name = verdictStationName(station.name);
    if (!name) continue;
    const route = routes.find(entry => normalizeStationName(entry.station.name) === normalizeStationName(name) && entry.minutes === access.minutes
      && entry.via === access.via && Boolean(entry.estimated) === Boolean(access.estimated));
    if (route) {
      route.lines = [...new Map([...route.lines, ...access.lines].map(line => [line.id, line])).values()];
    } else {
      routes.push({ ...access, station: { ...station, name }, lines: [...new Map(access.lines.map(line => [line.id, line])).values()] });
    }
  }
  return routes;
}

export interface VerdictPdfHeavyStation {
  station: VerdictPdfHeavyAccess["station"];
  minMinutes: number;
  maxMinutes: number;
  lines: GlobalMapLine[];
  routes: VerdictPdfHeavyAccess[];
}

/** Compare to the fastest access in the group to keep its entire duration spread under five minutes. */
export function groupVerdictHeavyStations(accesses: readonly VerdictPdfHeavyAccess[]): VerdictPdfHeavyStation[] {
  const groups: VerdictPdfHeavyStation[] = [];
  for (const access of [...accesses].sort((a, b) => a.minutes - b.minutes)) {
    const name = verdictStationName(access.station.name);
    const group = groups.find(entry => normalizeStationName(entry.station.name) === normalizeStationName(name)
      && access.minutes - entry.minMinutes < 5);
    if (group) {
      group.routes.push(access);
      group.maxMinutes = access.minutes;
      group.lines = [...new Map([...group.lines, ...access.lines].map(line => [line.id, line])).values()];
    } else {
      groups.push({
        station: { ...access.station, name },
        minMinutes: access.minutes,
        maxMinutes: access.minutes,
        lines: [...access.lines],
        routes: [access],
      });
    }
  }
  return groups;
}

export function createVerdictPdfMapContext(input: {
  city?: string;
  origin?: GreenPoint;
  areas?: readonly IrisNeighborhood[];
  selectedCodes?: readonly string[];
  greenReferences?: readonly VerdictPdfGreenReference[];
  network?: TransportMapNetwork;
  transit?: VerdictPdfMapContext["transit"];
}): VerdictPdfMapContext {
  return {
    city: input.city,
    origin: input.origin,
    areas: (input.areas ?? []).map(area => ({ code: area.codeIris, name: area.name, geometry: area.geometry })),
    selectedCodes: input.selectedCodes ?? [],
    greenReferences: input.greenReferences ?? [],
    network: input.network,
    transit: input.transit,
  };
}

export function boundsForGeometries(geometries: readonly (Polygon | MultiPolygon)[]): GlobalMapBounds | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const geometry of geometries) {
    visitCoordinates(geometry.coordinates, (lon, lat) => {
      const point = lonLatToWorld({ lon, lat });
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
  }
  return Number.isFinite(minX) && maxX > minX && maxY > minY
    ? { minX, minY, maxX, maxY }
    : undefined;
}

export function boundsAroundPoint(point: GreenPoint, radiusMeters: number): GlobalMapBounds {
  const center = lonLatToWorld(point);
  const delta = radiusMeters / (EARTH_CIRCUMFERENCE_METERS * Math.max(0.05, Math.cos(point.lat * Math.PI / 180)));
  return {
    minX: center.x - delta,
    minY: Math.max(0, center.y - delta),
    maxX: center.x + delta,
    maxY: Math.min(1, center.y + delta),
  };
}

export function createVerdictPdfAreaFeatures(
  areas: readonly VerdictPdfMapArea[],
  selectedCodes: readonly string[],
): FeatureCollection<Polygon | MultiPolygon, VerdictPdfAreaProperties> {
  const selected = new Set(selectedCodes);
  return {
    type: "FeatureCollection",
    features: areas.map(area => ({
      type: "Feature",
      properties: { code: area.code, name: area.name, selected: selected.has(area.code) },
      geometry: area.geometry,
    })),
  };
}

/** Dissolve shared IRIS edges so the commerce map draws the commune perimeter. */
export function createVerdictPdfCommuneBoundary(areas: readonly VerdictPdfMapArea[]): FeatureCollection<LineString> {
  const edges = new Map<string, { from: [number, number]; to: [number, number] }>();
  const pointKey = (point: readonly number[]) => `${point[0]!.toFixed(7)},${point[1]!.toFixed(7)}`;
  for (const area of areas) {
    const polygons = area.geometry.type === "Polygon" ? [area.geometry.coordinates] : area.geometry.coordinates;
    for (const polygon of polygons) for (const ring of polygon) for (let index = 0; index < ring.length; index++) {
      const from = ring[index]!;
      const to = ring[(index + 1) % ring.length]!;
      const a = pointKey(from), b = pointKey(to);
      if (a === b) continue;
      const key = [a, b].sort().join("|");
      if (edges.has(key)) edges.delete(key);
      else edges.set(key, { from: [from[0]!, from[1]!], to: [to[0]!, to[1]!] });
    }
  }
  return { type: "FeatureCollection", features: [...edges.values()].map(({ from, to }) => ({
    type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [from, to] },
  })) };
}

export function createVerdictPdfTransitFeatures(
  network: TransportMapNetwork | undefined,
  viewportPaths: readonly GlobalMapPath[] | undefined,
  bounds?: GlobalMapBounds,
): FeatureCollection<LineString, VerdictPdfTransitProperties> {
  const features: Feature<LineString, VerdictPdfTransitProperties>[] = [];
  if (!network || !viewportPaths) return { type: "FeatureCollection", features };

  for (const path of viewportPaths) {
    const line = network.linesById.get(path.lineId);
    if (!line || !PUBLIC_TRANSPORT_MODES.has(line.mode)
      || path.geometrySource === "netex-schematic-fallback"
      || (bounds && !intersects(bounds, path))) continue;
    for (const range of getGlobalMapPathSubpathRanges(path)) {
      const coordinates = path.vertices.slice(range.start, range.end).flatMap(vertex => {
        try {
          const station = vertex.stationId ? network.stationsById.get(vertex.stationId) : undefined;
          const point = worldToLonLat(resolveGlobalMapVertex(path, vertex, station, line.mode));
          return [[point.lon, point.lat] as [number, number]];
        } catch {
          return [];
        }
      });
      if (coordinates.length < 2) continue;
      if (bounds && !coordinates.slice(1).some((point, index) => {
        const previous = coordinates[index]!;
        const a = lonLatToWorld({ lon: previous[0], lat: previous[1] });
        const b = lonLatToWorld({ lon: point[0], lat: point[1] });
        let start = 0; let end = 1;
        for (const [p, q] of [[a.x - b.x, a.x - bounds.minX], [b.x - a.x, bounds.maxX - a.x],
          [a.y - b.y, a.y - bounds.minY], [b.y - a.y, bounds.maxY - a.y]]) {
          if (p === 0) { if (q! < 0) return false; continue; }
          const ratio = q! / p!;
          if (p! < 0) start = Math.max(start, ratio); else end = Math.min(end, ratio);
          if (start > end) return false;
        }
        return true;
      })) continue;
      features.push({
        type: "Feature",
        properties: { color: normalizeColor(line.color), mode: line.mode, code: transportLineCode(line), label: line.label, lineId: line.id },
        geometry: { type: "LineString", coordinates },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

export function createVerdictPdfTransitLegend(
  network: TransportMapNetwork | undefined,
  viewportPaths: readonly GlobalMapPath[] | undefined,
  bounds?: GlobalMapBounds,
): VerdictPdfTransitLegendEntry[] {
  if (!network || !viewportPaths) return [];

  const lineIdsByMode = new Map<Exclude<GlobalMapMode, "BIKE">, Set<string>>();
  const renderedLineIds = new Set(createVerdictPdfTransitFeatures(network, viewportPaths, bounds)
    .features.map(feature => feature.properties.lineId));

  for (const lineId of renderedLineIds) {
    const line = network.linesById.get(lineId);
    if (!line || line.mode === "BIKE" || !PUBLIC_TRANSPORT_MODES.has(line.mode)) continue;
    const lineIds = lineIdsByMode.get(line.mode) ?? new Set<string>();
    lineIds.add(line.id);
    lineIdsByMode.set(line.mode, lineIds);
  }

  return VERDICT_PDF_TRANSPORT_MODE_ORDER.flatMap(mode => {
    const lineIds = lineIdsByMode.get(mode);
    if (!lineIds?.size) return [];
    const lines = [...lineIds]
      .map(lineId => network.linesById.get(lineId))
      .filter((line): line is GlobalMapLine => Boolean(line))
      .sort((left, right) => transportLineCode(left).localeCompare(transportLineCode(right), undefined, { numeric: true, sensitivity: "base" }));
    const line = lines[0];
    return line ? [{ mode, count: lines.length, line, code: transportLineCode(line) }] : [];
  });
}

export function createVerdictPdfStationFeatures(
  network: TransportMapNetwork | undefined,
  bounds?: GlobalMapBounds,
  viewportStations?: readonly GlobalMapStation[],
): FeatureCollection<Point, VerdictPdfTransitProperties> {
  const features: Feature<Point, VerdictPdfTransitProperties>[] = [];
  if (!network) return { type: "FeatureCollection", features };
  for (const station of viewportStations ?? network.stations) {
    const world = { x: station.worldX, y: station.worldY };
    if (bounds && (world.x < bounds.minX || world.x > bounds.maxX || world.y < bounds.minY || world.y > bounds.maxY)) continue;
    for (const lineId of station.lineIds) {
      const line = network.linesById.get(lineId);
      if (!line || !PUBLIC_TRANSPORT_MODES.has(line.mode)) continue;
      features.push({
        type: "Feature",
        properties: { color: normalizeColor(line.color), mode: line.mode, code: transportLineCode(line), label: line.label, lineId: line.id },
        geometry: { type: "Point", coordinates: [station.lon, station.lat] },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

export function createVerdictPdfTransitViewport(
  bounds: GlobalMapBounds,
  generation: number,
  maxZoom: number,
): CameraState {
  const initial = createCamera({ viewportWidthCssPx: 700, viewportHeightCssPx: 740, generation });
  return fitCameraToBounds(initial, bounds, 30, 0, maxZoom);
}

export function createRadiusGeometry(origin: GreenPoint, radiusMeters: number, steps = 64): Polygon {
  const latitudeScale = 111_320;
  const longitudeScale = latitudeScale * Math.max(0.05, Math.cos(origin.lat * Math.PI / 180));
  const ring: number[][] = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = index / steps * Math.PI * 2;
    ring.push([
      origin.lon + Math.cos(angle) * radiusMeters / longitudeScale,
      origin.lat + Math.sin(angle) * radiusMeters / latitudeScale,
    ]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

function intersects(bounds: GlobalMapBounds, path: GlobalMapPath): boolean {
  return path.maxX >= bounds.minX && path.minX <= bounds.maxX
    && path.maxY >= bounds.minY && path.minY <= bounds.maxY;
}

function normalizeColor(color: string): string {
  return /^#[\da-f]{3,8}$/iu.test(color) ? color : "#5156c9";
}

export function transportLineCode(line: GlobalMapLine): string {
  const code = line.code.trim();
  return code && !/^(?:C\d{5}|IDFM:C\d{5})$/iu.test(code) ? code : line.label.trim() || code;
}

function visitCoordinates(value: unknown, visit: (lon: number, lat: number) => void): void {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    if (Number.isFinite(value[0]) && Number.isFinite(value[1])) visit(value[0], value[1]);
    return;
  }
  for (const child of value) visitCoordinates(child, visit);
}
