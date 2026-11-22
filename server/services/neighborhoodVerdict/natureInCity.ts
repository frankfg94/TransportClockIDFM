import { REGIONAL_GREEN_SPACE_RULES as inventory, WOODLAND_FRAGMENTATION_RULES as fragmentation } from "./greenSpaceInventoryRules";
import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping";
import { CANOPY_RADIUS_METERS, classifyParkWalks, MAPPED_PARK_ENTRANCE_TOLERANCE_METERS, MAX_UNCOVERED_AREA_M2 } from "../../../shared/natureInCityRules";
import { NATURE_IN_CITY_ID, type CanopyMeasure, type GreenMapReference, type GreeneryMapData } from "../../../shared/natureInCity";
import { locateAtGreenBoundary, normalizeGreenSpaceName } from "../../../shared/greenSpaceBoundary";
import { createR2SignedHeaders, type NetexRuntimeEnv } from "../topology/netexCache";
import { fromLambert93, toLambert93 } from "./lambert93";
import type { PublicGreenSpaceAccess } from "../../../src/features/nearby-stations/neighborhoodVerdictApi";
import type { NearbyWalkingRoute } from "../../../src/features/nearby-stations/nearbyWalkingRoutes";
import { greenSpaceIdentity } from "../../../shared/greenSpaceIdentity";
import { majorRoadMask, readMajorRoads, type MajorRoad } from "./greenSpaceRoads";

type Point = [number, number];
type Origin = { lon: number; lat: number };
type Geometry = { type: "MultiPolygon"; coordinates: MultiPolygon };
type Area = { areaM2: number; canopyM2: number; period: string };
type Commune = Area & { iris: Record<string, Area> };
type CanopyTile = { coverage: MultiPolygon; canopy: MultiPolygon };
type Park = { id: string; name: string; geometry: Geometry; entries?: Point[]; complete?: boolean };
type ParkTile = { coverage: MultiPolygon; parks: Park[] };
type ParkWalkingMatrix = (origin: Point, destinations: readonly Point[],
  endBoundaries?: readonly (GreeneryMapData["boundary"] | undefined)[]) => Promise<readonly (number | undefined)[]>;

export function verifiedGreenSpaceWalkingTime(route: NearbyWalkingRoute, endBoundary?: GreeneryMapData["boundary"]) {
  if (route.fallback || route.provider === "straight-line") return undefined;
  // The last coordinate is the requested point, added by the router. Verify
  // the actual end of the pedestrian network path independently.
  const end = route.coordinates.at(-2);
  if (endBoundary && (!end || !locateAtGreenBoundary(end, endBoundary).inside)) return undefined;
  return route.durationSeconds;
}
export type NatureDatasetStatus = { checkedAt: string; result: "updated" | "unchanged" | "error" };

export interface NatureManifest {
  schemaVersion: 1;
  version: string;
  period: string;
  generatedAt: string;
  sources: { department: string; date: string; url: string }[];
  communes: Record<string, Commune>;
  tileSize: number;
  parkTileSize: number;
  tiles: string[];
  parks: string[];
  verifiedCommunes: number;
}

const cached = new Map<string, { value: Promise<unknown>; expires: number }>();
export function natureDatasetSource(env: NetexRuntimeEnv) {
  const verdictRemote = env.IDFM_NEIGHBORHOOD_VERDICT_CACHE_REMOTE?.trim();
  const root = env.IDFM_NATURE_IN_CITY_REMOTE?.trim() || env.IDFM_NATURE_IN_CITY_LOCAL?.trim() ||
    (verdictRemote?.startsWith("r2://") ? new URL("../ign-nature-en-ville/", verdictRemote).href : undefined) ||
    "../idfm-node-backend/.data/ign-nature-en-ville";
  return root.replace(/[\\/]+$/u, "");
}

async function readFile<T>(env: NetexRuntimeEnv, key: string, seconds: number): Promise<T> {
  const root = natureDatasetSource(env);
  const identity = root + "/" + key;
  const existing = cached.get(identity);
  if (existing && existing.expires > Date.now()) return existing.value as Promise<T>;
  const value = (async () => {
    if (!/^(?:r2|https?):\/\//u.test(root)) {
      const { readFile } = await import("node:fs/promises");
      return JSON.parse(await readFile(identity, "utf8")) as T;
    }
    let url = new URL(identity);
    if (url.username || url.password || url.search || url.hash) throw new Error("Invalid nature dataset URL");
    let headers: Headers | undefined;
    if (url.protocol === "r2:") {
      const endpoint = env.R2_ENDPOINT?.replace(/\/+$/u, "") || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
      url = new URL(`${endpoint}/${url.host}${url.pathname.replace(/\/+/gu, "/")}`);
      headers = await createR2SignedHeaders(url, env);
    }
    const response = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Nature dataset HTTP ${response.status}`);
    return await response.json() as T;
  })();
  if (cached.size >= 32) cached.delete(cached.keys().next().value!);
  cached.set(identity, { value, expires: Date.now() + seconds * 1000 });
  value.catch(() => { if (cached.get(identity)?.value === value) cached.delete(identity); });
  return value;
}

export async function readNatureManifest(env: NetexRuntimeEnv, version?: string): Promise<NatureManifest> {
  version ??= (await readFile<{ version: string }>(env, "current.json", 30)).version;
  if (!/^[a-f0-9]{24}$/u.test(version)) throw new Error("Invalid nature dataset version");
  const manifest = await readFile<NatureManifest>(env, `versions/${version}/manifest.json`, 600);
  if (manifest.schemaVersion !== 1 || manifest.version !== version || !Number.isInteger(manifest.tileSize) || manifest.tileSize < 1000) {
    throw new Error("Invalid nature dataset manifest");
  }
  return manifest;
}

export const readNatureStatus = (env: NetexRuntimeEnv) => readFile<NatureDatasetStatus>(env, "status.json", 30);
const activeFile = <T>(env: NetexRuntimeEnv, manifest: NatureManifest, key: string) =>
  readFile<T>(env, `versions/${manifest.version}/${key}`, 600);

export function disk([x, y]: Point, radius: number): Polygon {
  const ring = Array.from({ length: 180 }, (_, step): Point => {
    const angle = step * Math.PI / 90;
    return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
  });
  ring.push(ring[0]!);
  return [ring];
}

export function planarArea(polygons: MultiPolygon): number {
  return polygons.reduce((area, polygon) => area + polygon.reduce((net, ring, index) => {
    const [x, y] = ring[0]!;
    const twiceArea = ring.slice(1).reduce((sum, [bx, by], step) => {
      const [ax, ay] = ring[step]!;
      return sum + (ax - x) * (by - y) - (bx - x) * (ay - y);
    }, 0);
    return net + Math.abs(twiceArea) / 2 * (index === 0 ? 1 : -1);
  }, 0), 0);
}

export function greenBoundaryArea(boundary: GreeneryMapData["boundary"]): number {
  const polygons = boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates;
  return planarArea(polygons.map(polygon => polygon.map(ring => ring.map(([lon, lat]) => toLambert93([lon!, lat!])))));
}

function nearbyTiles([x, y]: Point, radius: number, size: number): string[] {
  const keys = [];
  for (let i = Math.floor((x - radius) / size); i <= Math.floor((x + radius) / size); i++) {
    for (let j = Math.floor((y - radius) / size); j <= Math.floor((y + radius) / size); j++) keys.push(`${i}-${j}`);
  }
  return keys;
}

function toMapGeometry(polygons: MultiPolygon): Geometry {
  return { type: "MultiPolygon", coordinates: polygons.map(polygon => polygon.map(ring => ring.map(fromLambert93))) };
}

export function clipCanopy(perimeter: Polygon, tiles: readonly CanopyTile[]) {
  // The compiler partitions Lambert-93 space into disjoint tiles.
  const coverage = tiles.flatMap(tile => polygonClipping.intersection(perimeter, tile.coverage));
  const canopy = tiles.flatMap(tile => polygonClipping.intersection(perimeter, tile.canopy));
  const areaM2 = planarArea([perimeter]);
  if (areaM2 - planarArea(coverage) > MAX_UNCOVERED_AREA_M2) return undefined;
  return { areaM2, canopyM2: Math.min(areaM2, planarArea(canopy)), canopy };
}

const measuredAddresses = new Map<string, ReturnType<typeof clipAddress>>();

function addressGeometry(env: NetexRuntimeEnv, manifest: NatureManifest, origin: Origin) {
  const key = `${natureDatasetSource(env)}:${manifest.version}:${origin.lat}:${origin.lon}`;
  const cached = measuredAddresses.get(key);
  if (cached) return cached;
  const measurement = clipAddress(env, manifest, origin);
  if (measuredAddresses.size >= 12) measuredAddresses.delete(measuredAddresses.keys().next().value!);
  measuredAddresses.set(key, measurement);
  measurement.catch(() => { if (measuredAddresses.get(key) === measurement) measuredAddresses.delete(key); });
  return measurement;
}

async function clipAddress(env: NetexRuntimeEnv, manifest: NatureManifest, origin: Origin) {
  if (origin.lat < 47.9 || origin.lat > 49.4 || origin.lon < 1.3 || origin.lon > 3.7) return undefined;
  const center = toLambert93([origin.lon, origin.lat]);
  const keys = nearbyTiles(center, CANOPY_RADIUS_METERS, manifest.tileSize).filter(key => manifest.tiles.includes(key));
  const tiles = await Promise.all(keys.map(key => activeFile<CanopyTile>(env, manifest, `tiles/${key}.json`)));
  const boundary = disk(center, CANOPY_RADIUS_METERS);
  const clipped = clipCanopy(boundary, tiles);
  return clipped && { ...clipped, boundary };
}

function measure(area: Area, map: GreenMapReference): CanopyMeasure {
  const { areaM2, canopyM2, period } = area;
  return { source: NATURE_IN_CITY_ID, percentage: 100 * canopyM2 / areaM2, areaM2, canopyM2, period, map };
}

export function natureCommuneCode(code: string): string {
  return /^751(?:0[1-9]|1\d|20)$/u.test(code) ? "75056" : code;
}

export async function readPublicParkAreas(env: NetexRuntimeEnv, manifest: NatureManifest, code: string) {
  return activeFile<Record<string, number>>(env, manifest, `parks-iris/${natureCommuneCode(code)}.json`);
}

export async function readCanopy(env: NetexRuntimeEnv, manifest: NatureManifest, origin: Origin, code: string) {
  const local = await addressGeometry(env, manifest, origin).catch(() => undefined);
  const communeCode = natureCommuneCode(code);
  const commune = Object.hasOwn(manifest.communes, communeCode) ? manifest.communes[communeCode] : undefined;
  return {
    address: local && measure({ ...local, period: manifest.period }, { scope: "address", ...origin, version: manifest.version }),
    commune: commune && measure(commune, { scope: "commune", code: communeCode, version: manifest.version }),
  };
}

export async function readCanopyMap(env: NetexRuntimeEnv, reference: Exclude<GreenMapReference, { scope: "park" }>): Promise<GreeneryMapData | undefined> {
  const manifest = await readNatureManifest(env, reference.version);
  if (reference.scope === "woodland") {
    const { parks } = await readRegionalParks(env, manifest, reference, inventory.inventorySearchMeters);
    const matches = parks.filter(park => park.name === reference.id);
    const coordinates = matches.flatMap(park => park.geometry.coordinates);
    if (!coordinates.length) return undefined;
    const boundary = { type: "MultiPolygon", coordinates } as const;
    const projected = coordinates.map(polygon => polygon.map(ring => ring.map(toLambert93)));
    const roads = await readMajorRoads(toLambert93([reference.lon, reference.lat]));
    const { main, fragmented } = woodlandComponents(projected, roads);
    return {
      boundary,
      ...(fragmented && main ? { mainBoundary: toMapGeometry(main) } : {}),
      entrances: matches.flatMap(park => (park.entries ?? []).map(([lon, lat]) => ({ lon, lat }))),
      surfaceM2: greenBoundaryArea(boundary),
    };
  }
  if (reference.scope === "commune") {
    if (!Object.hasOwn(manifest.communes, reference.code)) return undefined;
    return activeFile<{ boundary: Geometry; canopy: Geometry }>(env, manifest, `maps/${reference.code}.json`);
  }
  const local = await addressGeometry(env, manifest, reference);
  return local && { boundary: toMapGeometry([local.boundary]), canopy: toMapGeometry(local.canopy) };
}

export async function readRegionalParkMap(env: NetexRuntimeEnv, id: string, origin: Origin, version: string) {
  const manifest = await readNatureManifest(env, version);
  const { parks } = await readRegionalParks(env, manifest, origin, inventory.inventorySearchMeters);
  const park = groupRegionalParks(parks).find(candidate => candidate.ids.includes(id));
  if (!park) return undefined;
  const projected = park.geometry.coordinates.map(polygon => polygon.map(ring => ring.map(toLambert93)));
  const roads = await readMajorRoads(toLambert93([origin.lon, origin.lat]));
  const { main, fragmented } = woodlandComponents(projected, roads);
  return { boundary: park.geometry, surfaceM2: greenBoundaryArea(park.geometry),
    ...(fragmented && main ? { mainBoundary: toMapGeometry(main) } : {}),
    subsites: park.subsites.map(site => ({ ...site, surfaceM2: greenBoundaryArea(site.boundary) })),
    entrances: (park.entries ?? []).map(([lon, lat]) => ({ lon, lat })) };
}

function inRegionalRange(origin: Origin) {
  return origin.lat >= 47.9 && origin.lat <= 49.4 && origin.lon >= 1.3 && origin.lon <= 3.7;
}

async function readRegionalParks(env: NetexRuntimeEnv, manifest: NatureManifest, origin: Origin, radius: number) {
  if (!inRegionalRange(origin)) return { tiles: [], parks: [] };
  const keys = nearbyTiles(toLambert93([origin.lon, origin.lat]), radius, manifest.parkTileSize).filter(key => manifest.parks.includes(key));
  const tiles = await Promise.all(keys.map(key => activeFile<ParkTile>(env, manifest, `parks/${key}.json`)));
  return { tiles, parks: [...new Map(tiles.flatMap(tile => tile.parks).map(park => [park.id, park])).values()] };
}

export { classifyParkWalks } from "../../../shared/natureInCityRules";

export async function readMappedParkEntrances(env: NetexRuntimeEnv, name: string, reference: Origin, boundary?: GreeneryMapData["boundary"]) {
  const normalizedName = normalizeGreenSpaceName(name);
  if (!normalizedName) return [];
  const manifest = await readNatureManifest(env);
  const perimeter = boundary && locateAtGreenBoundary(reference, boundary);
  const center = perimeter?.inside ? reference : perimeter?.nearest ?? reference;
  const { parks } = await readRegionalParks(env, manifest, center, inventory.inventorySearchMeters);
  return parks.filter(park => normalizeGreenSpaceName(park.name) === normalizedName)
    .flatMap(park => (park.entries ?? []).map(([lon, lat]) => ({ lon, lat })))
    .filter(point => {
      if (!boundary) return true;
      const location = locateAtGreenBoundary(point, boundary);
      return location.inside || location.distanceMeters <= MAPPED_PARK_ENTRANCE_TOLERANCE_METERS;
    });
}

/** Choose approaches on the mapped edge of each woodland parcel. These are
 * routing targets, separate from the certified entrances used by the park malus. */
export function nearestWoodlandEdge(center: Point, geometry: MultiPolygon) {
  let point: Point | undefined;
  let distance = Infinity;
  for (const polygon of geometry) {
    const exterior = polygon[0] ?? [];
    for (let index = 1; index < exterior.length; index++) {
      const [ax, ay] = exterior[index - 1]!;
      const [bx, by] = exterior[index]!;
      const dx = bx - ax;
      const dy = by - ay;
      const length = dx * dx + dy * dy;
      const ratio = length ? Math.max(0, Math.min(1, ((center[0] - ax) * dx + (center[1] - ay) * dy) / length)) : 0;
      const candidate: Point = [ax + ratio * dx, ay + ratio * dy];
      const nextDistance = Math.hypot(candidate[0] - center[0], candidate[1] - center[1]);
      if (nextDistance < distance) { distance = nextDistance; point = candidate; }
    }
  }
  return point ? { point, distance } : undefined;
}

export function woodlandComponents(geometry: MultiPolygon, roads?: readonly MajorRoad[]) {
  const union = geometry.length ? polygonClipping.union(geometry) : [];
  if (!union.length) return { main: undefined, fragmented: false };
  if (!roads) return { main: union.length === 1 ? union : undefined, fragmented: false };
  const [west, south, east, north] = geometryBounds(union);
  const margin = fragmentation.envelopeMarginMeters;
  const limits = [west - margin, south - margin, east + margin, north + margin] as const;
  const mask = majorRoadMask(roads, limits);
  if (!mask.length) return { main: union, fragmented: false };
  const [x0, y0, x1, y1] = limits;
  const envelope: Polygon = [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
  const sectors = polygonClipping.difference(envelope, mask)
    .map(sector => polygonClipping.intersection(sector, union))
    .filter(sector => planarArea(sector) >= fragmentation.minimumSectorAreaM2)
    .sort((a, b) => planarArea(b) - planarArea(a));
  return sectors.length > 1 ? { main: sectors[0], fragmented: true } : { main: union, fragmented: false };
}

function geometryBounds(geometry: MultiPolygon): [number, number, number, number] {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const polygon of geometry) for (const [x, y] of polygon[0] ?? []) {
    west = Math.min(west, x); south = Math.min(south, y);
    east = Math.max(east, x); north = Math.max(north, y);
  }
  return [west, south, east, north];
}

function isPublicRegionalPark(park: Park): boolean {
  return !/\bprive(?:e|s|es)?\b/iu.test(park.name.normalize("NFD").replace(/\p{M}/gu, ""));
}

function isWoodland(name: string): boolean {
  return /^(?:forêt|foret|bois)\s+\S/iu.test(name);
}

export function groupRegionalParks(parks: readonly Park[]) {
  const groups = new Map<string, Array<{ members: Park[]; bounds: [number, number, number, number] }>>();
  for (const park of parks) {
    if (!isPublicRegionalPark(park) || isWoodland(park.name)) continue;
    const key = greenSpaceIdentity(park.name);
    const bounds = geometryBounds(park.geometry.coordinates);
    const matching = groups.get(key) ?? [];
    const adjacent = matching.filter(({ bounds: [west, south, east, north] }) =>
      bounds[0] <= east + inventory.parkGroupLongitudeGap && bounds[2] >= west - inventory.parkGroupLongitudeGap && bounds[1] <= north + inventory.parkGroupLatitudeGap && bounds[3] >= south - inventory.parkGroupLatitudeGap);
    const members = [park, ...adjacent.flatMap(group => group.members)];
    groups.set(key, [...matching.filter(group => !adjacent.includes(group)),
      { members, bounds: geometryBounds(members.flatMap(member => member.geometry.coordinates)) }]);
  }
  return [...groups.values()].flat().map(({ members }) => {
    const representative = [...members].sort((a, b) =>
      Number(/^domaine\b/iu.test(b.name)) - Number(/^domaine\b/iu.test(a.name))
      || a.name.length - b.name.length || a.id.localeCompare(b.id))[0]!;
    const labelledParcels = new Map<string, MultiPolygon>();
    for (const park of members) {
      const subsite = park.name.split(/\s[–—/-]\s|\s*\/\s*/u)[1]?.trim();
      if (subsite) labelledParcels.set(subsite, [...(labelledParcels.get(subsite) ?? []), ...park.geometry.coordinates]);
    }
    return {
      ...representative, ids: members.map(park => park.id), entries: members.flatMap(park => park.entries ?? []),
      subsites: [...labelledParcels].map(([name, coordinates]) => ({
        name, boundary: { type: "MultiPolygon", coordinates: polygonClipping.union(coordinates) } as const,
      })),
      geometry: { type: "MultiPolygon", coordinates: members.length === 1 ? representative.geometry.coordinates
        : polygonClipping.union(members.flatMap(park => park.geometry.coordinates)) } as Geometry,
    };
  });
}

function woodlandApproaches(center: Point, geometry: MultiPolygon) {
  const edge = nearestWoodlandEdge(center, geometry);
  if (!edge) return [];
  const boundary = toMapGeometry(geometry);
  const vertices = geometry.flatMap(polygon => {
    const exterior = polygon[0] ?? [];
    return exterior.slice(1).flatMap(([bx, by], i) => {
    const [ax, ay] = exterior[i]!;
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 50);
    return Array.from({ length: steps }, (_, step) => {
      const point: Point = [ax + (bx - ax) * step / steps, ay + (by - ay) * step / steps];
      return { point, distance: Math.hypot(point[0] - center[0], point[1] - center[1]) };
    });
    });
  })
    .sort((a, b) => a.distance - b.distance);
  const selected = [edge];
  for (const vertex of vertices) {
    if (selected.every(({ point }) => Math.hypot(point[0] - vertex.point[0], point[1] - vertex.point[1]) >= inventory.woodlandEntrySampleSpacingMeters)) selected.push(vertex);
    if (selected.length >= inventory.mainWoodlandTargetLimit) break;
  }
  // Move into the component so snapping on the opposite side of a road
  // does not turn a waypoint on the boundary into access to the forest.
  return selected.flatMap(({ point: [x, y] }) => {
    for (let compass = 0; compass < 16; compass++) {
      const angle = compass * Math.PI / 8;
      const probe: Point = [x + Math.cos(angle) * fragmentation.interiorProbeMeters, y + Math.sin(angle) * fragmentation.interiorProbeMeters];
      const [lon, lat] = fromLambert93(probe);
      const location = locateAtGreenBoundary({ lon, lat }, boundary);
      if (location.inside && location.distanceMeters >= fragmentation.minimumInteriorDepthMeters) return [probe];
    }
    return [];
  });
}

export async function readNearbyRegionalGreenSpaces(env: NetexRuntimeEnv, manifest: NatureManifest, origin: Origin, router?: ParkWalkingMatrix): Promise<PublicGreenSpaceAccess[]> {
  const { parks } = await readRegionalParks(env, manifest, origin, inventory.inventorySearchMeters);
  const center = toLambert93([origin.lon, origin.lat]);
  const roads = readMajorRoads(center);
  const groups = new Map<string, { geometry: MultiPolygon; edges: { point: Point; distance: number }[] }>();
  const regional: Array<PublicGreenSpaceAccess & { entries: Point[]; geometry: MultiPolygon }> = [];
  const sites: Array<Park & { ids?: string[]; subsites?: GreeneryMapData["subsites"] }> =
    [...parks.filter(park => isWoodland(park.name)), ...groupRegionalParks(parks)];
  for (const park of sites) {
    if (!isPublicRegionalPark(park)) continue;
    const woodland = isWoodland(park.name);
    const geometry = park.geometry.coordinates.map(polygon => polygon.map(ring => ring.map(toLambert93)));
    const edge = nearestWoodlandEdge(center, geometry);
    if (!edge || edge.distance > inventory.inventorySearchMeters) continue;
    if (!woodland) {
      const surfaceM2 = planarArea(geometry);
      if (edge.distance > inventory.maxParkDistanceMeters || surfaceM2 < inventory.minParkAreaM2) continue;
      const [lon, lat] = fromLambert93(edge.point);
      regional.push({ id: park.id, name: park.name, lat, lon, surfaceM2,
        distanceMeters: Math.round(edge.distance), estimatedWalkingMinutes: Math.ceil(edge.distance / 80),
        parkMap: { scope: "park", id: park.id, ...origin, version: manifest.version },
        ...(park.ids && park.ids.length > 1 ? { parkAliases: park.ids.filter(id => id !== park.id) } : {}),
        ...(park.subsites?.length ? { parkSubsites: park.subsites.map(site => site.name) } : {}),
        geometry,
        entries: [...(park.entries ?? [])].sort((a, b) => Math.hypot(a[0] - origin.lon, a[1] - origin.lat)
          - Math.hypot(b[0] - origin.lon, b[1] - origin.lat)).slice(0, 2) });
      continue;
    }
    const group = groups.get(park.name) ?? { geometry: [], edges: [] };
    group.geometry.push(...geometry);
    group.edges.push(edge);
    groups.set(park.name, group);
  }
  const majorRoads = await roads;
  const closest = [...groups].filter(([, group]) => planarArea(group.geometry) >= inventory.minWoodlandAreaM2)
    .map(([name, group]) => {
      const points: typeof group.edges = [];
      for (const edge of group.edges.sort((a, b) => a.distance - b.distance)) {
        if (points.every(({ point }) => Math.hypot(point[0] - edge.point[0], point[1] - edge.point[1]) > 220)) points.push(edge);
      }
      return { name, geometry: group.geometry, points: points.slice(0, 6) };
    }).sort((a, b) => a.points[0]!.distance - b.points[0]!.distance).slice(0, 3)
    .map(group => {
      const { main } = woodlandComponents(group.geometry, majorRoads);
      return { ...group, mainSurfaceM2: main ? planarArea(main) : undefined, mainBoundary: main ? toMapGeometry(main) : undefined,
        mainTargets: main ? woodlandApproaches(center, main).map(fromLambert93) : [] };
    });
  const localParks = regional.sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 24).map(({ geometry, ...park }) => {
    const { main, fragmented } = woodlandComponents(geometry, majorRoads);
    if (!fragmented || !main) return park;
    const boundary = toMapGeometry(main);
    return { ...park, mainSurfaceM2: planarArea(main), entries: park.entries.filter(([lon, lat]) => {
      const location = locateAtGreenBoundary({ lon, lat }, boundary);
      return location.inside || location.distanceMeters <= inventory.mainParkEntranceToleranceMeters;
    }) };
  });
  const parksToRoute = new Set(localParks.filter(park => park.entries.length > 0).slice(0, 8).map(park => park.id));
  const targets = closest.flatMap(group => [
    ...group.points.slice(0, 3).map(edge => ({ point: fromLambert93(edge.point), boundary: undefined })),
    ...group.mainTargets.map(point => ({ point, boundary: group.mainBoundary })),
  ]).concat(localParks.flatMap(park => parksToRoute.has(park.id) ? park.entries.map(point => ({ point, boundary: undefined })) : []));
  const durations = router && targets.length
    ? await router([origin.lon, origin.lat], targets.map(target => target.point), targets.map(target => target.boundary)).catch(() => [])
    : [];
  let index = 0;
  const best = (destinations: readonly Point[]) => destinations.map(point => ({ point, seconds: durations[index++] }))
    .filter(({ seconds }) => seconds !== undefined && Number.isFinite(seconds) && seconds >= 0)
    .sort((a, b) => a.seconds! - b.seconds!)[0];
  const woods = closest.map(({ name, geometry, points, mainTargets, mainSurfaceM2 }): PublicGreenSpaceAccess => {
    const edge = best(points.slice(0, 3).map(candidate => fromLambert93(candidate.point)));
    const main = best(mainTargets);
    const [lon, lat] = main?.point ?? edge?.point ?? fromLambert93(points[0]!.point);
    return {
      id: `woodland:${name}`, name, lon, lat, surfaceM2: planarArea(geometry), mainSurfaceM2,
      distanceMeters: Math.round(points[0]!.distance), estimatedWalkingMinutes: Math.ceil(points[0]!.distance / 80),
      ...(edge || main ? { walkingMinutes: Math.ceil(Math.min(edge?.seconds ?? Infinity, main?.seconds ?? Infinity) / 60) } : {}),
      ...(main ? { mainWalkingMinutes: Math.ceil(main.seconds! / 60) } : {}),
      transitPoints: mainTargets.map(([lon, lat]) => ({ lon, lat })),
      woodlandMap: { scope: "woodland", id: name, ...origin, version: manifest.version,
        ...(main ? { mainAccess: { lon, lat } } : {}) },
    };
  });
  return [...woods, ...localParks.map(({ entries, ...park }) => {
    const access = parksToRoute.has(park.id) ? best(entries) : undefined;
    if (!access) return park;
    return { ...park, lon: access.point[0], lat: access.point[1], walkingMinutes: Math.ceil(access.seconds! / 60),
      transitPoints: entries.map(([lon, lat]) => ({ lon, lat })) };
  })];
}

export async function readParkWalk(env: NetexRuntimeEnv, manifest: NatureManifest, origin: Origin, router: ParkWalkingMatrix) {
  if (!inRegionalRange(origin)) return "unknown";
  const from: Point = [origin.lon, origin.lat];
  const center = toLambert93(from);
  const boundary = disk(center, inventory.parkWalkSearchMeters);
  const { tiles, parks } = await readRegionalParks(env, manifest, origin, inventory.parkWalkSearchMeters);
  let complete = planarArea([boundary]) - planarArea(tiles.flatMap(tile => polygonClipping.intersection(boundary, tile.coverage))) <= MAX_UNCOVERED_AREA_M2;
  const entries = new Map<string, Point>();
  for (const park of parks) {
    const projected = park.geometry.coordinates.map(polygon => polygon.map(ring => ring.map(toLambert93)));
    if (!polygonClipping.intersection(boundary, projected).length) continue;
    if (!park.complete) complete = false;
    for (const entry of park.entries ?? []) {
      const [x, y] = toLambert93(entry);
      if (Math.hypot(x - center[0], y - center[1]) <= inventory.parkWalkSearchMeters) entries.set(entry.join(","), entry);
    }
  }
  const closest = [...entries.values()].sort((a, b) => Math.hypot(a[0] - from[0], a[1] - from[1]) - Math.hypot(b[0] - from[0], b[1] - from[1]));
  // Bounds protect the interactive Verdict. Any truncated work is indeterminate.
  const budget = inventory.parkAccessVerificationBudget;
  const requested = closest.slice(0, budget);
  const durations = requested.length ? await router(from, requested) : [];
  return classifyParkWalks(durations, complete && closest.length <= budget && durations.length === requested.length);
}
