import { placeDistanceMeters, type OverpassElement } from "../../../src/services/places/compiledPlaces";
import {
  MAJOR_SHOPPING_CENTRE_DETECTION_RULES,
  type NearbyMajorShoppingCentre,
} from "../../../src/features/nearby-stations/neighborhood/shoppingCentres";
import type { NearbySupermarketFootprint } from "../../../src/features/nearby-stations/neighborhood/supermarkets";
import { requestOverpassElements } from "./overpass";

const SEARCH_RADIUS_METERS = 5_000;
const SUPERMARKET_GEOMETRY_RADIUS_METERS = 2_000;
const CACHE_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 80;
const centreCache = new Map<string, { expiresAt: number; request: Promise<NearbyMajorShoppingCentre[]> }>();
const supermarketCache = new Map<string, { expiresAt: number; request: Promise<NearbySupermarketFootprint[]> }>();

export function loadNearbyShoppingCentres(lat: number, lon: number): Promise<NearbyMajorShoppingCentre[]> {
  return loadCached(centreCache, lat, lon, () => fetchNearbyShoppingCentres(lat, lon));
}

export function loadNearbySupermarketFootprints(lat: number, lon: number): Promise<NearbySupermarketFootprint[]> {
  return loadCached(supermarketCache, lat, lon, () => fetchNearbySupermarketFootprints(lat, lon));
}

function loadCached<T>(
  cache: Map<string, { expiresAt: number; request: Promise<T> }>,
  lat: number,
  lon: number,
  load: () => Promise<T>,
): Promise<T> {
  const cacheKey = `${lat.toFixed(4)}:${lon.toFixed(4)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.request;
  const request = load().catch((error) => {
    cache.delete(cacheKey);
    throw error;
  });
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, request });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
  return request;
}

export function buildNearbyShoppingCentresQuery(lat: number, lon: number): string {
  const around = `(around:${SEARCH_RADIUS_METERS},${lat},${lon})`;
  return `[out:json][timeout:25];
    nwr${around}["shop"~"^(mall|shopping_centre)$"]["name"]->.centres;
    .centres out geom tags qt;`;
}

export function buildNearbySupermarketFootprintsQuery(lat: number, lon: number): string {
  const around = `(around:${SUPERMARKET_GEOMETRY_RADIUS_METERS},${lat},${lon})`;
  return `[out:json][timeout:20];
    (
      way${around}["shop"~"^(supermarket|hypermarket)$"];
      relation${around}["shop"~"^(supermarket|hypermarket)$"];
    );
    out geom tags qt;`;
}

async function fetchNearbyShoppingCentres(lat: number, lon: number): Promise<NearbyMajorShoppingCentre[]> {
  const elements = await requestOverpassElements(buildNearbyShoppingCentresQuery(lat, lon), 25_000);
  const centreElements = elements.filter(isCentreElement);
  const candidates = centreElements.flatMap((element): NearbyMajorShoppingCentre[] => {
    const point = elementPoint(element);
    const name = element.tags?.name?.trim();
    if (!point || !name) return [];

    const distanceMeters = Math.round(placeDistanceMeters({ lat, lon }, point));
    if (distanceMeters > SEARCH_RADIUS_METERS) return [];
    const areaM2 = elementAreaSquareMeters(element);
    const isMall = element.tags?.shop === "mall" || element.tags?.shop === "shopping_centre";
    if (!isMall) return [];

    return [{
      id: `${element.type ?? "element"}:${element.id}`,
      name,
      ...point,
      distanceMeters,
      ...(areaM2 === undefined ? {} : { areaM2: Math.round(areaM2) }),
    }];
  });

  const unique = new Map<string, NearbyMajorShoppingCentre>();
  for (const centre of candidates.sort((left, right) => (right.areaM2 ?? 0) - (left.areaM2 ?? 0)
    || left.distanceMeters - right.distanceMeters)) {
    const key = normalizeName(centre.name);
    const duplicate = [...unique.values()].find((existing) => normalizeName(existing.name) === key
      && placeDistanceMeters(existing, centre) <= 300);
    if (duplicate) {
      if ((centre.areaM2 ?? 0) > (duplicate.areaM2 ?? 0)) unique.set(duplicate.id, centre);
      continue;
    }
    unique.set(centre.id, centre);
  }
  return [...unique.values()]
    .sort((left, right) => left.distanceMeters - right.distanceMeters || left.name.localeCompare(right.name, "fr-FR"))
    .slice(0, 10);
}

async function fetchNearbySupermarketFootprints(lat: number, lon: number): Promise<NearbySupermarketFootprint[]> {
  const elements = await requestOverpassElements(buildNearbySupermarketFootprintsQuery(lat, lon), 20_000);
  return uniqueElements(elements.filter(isSupermarketFootprintElement))
    .flatMap((element): NearbySupermarketFootprint[] => {
      const surfaceM2 = elementAreaSquareMeters(element);
      if (element.id === undefined || surfaceM2 === undefined || !Number.isFinite(surfaceM2) || surfaceM2 <= 0) return [];
      return [{ placeId: `${element.type ?? "element"}:${element.id}`, surfaceM2: Math.round(surfaceM2) }];
    });
}

function isCentreElement(element: OverpassElement): boolean {
  const tags = element.tags ?? {};
  return Boolean(tags.name)
    && (tags.shop === "mall" || tags.shop === "shopping_centre");
}

function isSupermarketFootprintElement(element: OverpassElement): boolean {
  const tags = element.tags ?? {};
  return (element.type === "way" || element.type === "relation")
    && (tags.shop === "supermarket" || tags.shop === "hypermarket");
}

function uniqueElements(elements: readonly OverpassElement[]): OverpassElement[] {
  const unique = new Map<string, OverpassElement>();
  for (const element of elements) {
    if (element.id === undefined) continue;
    unique.set(`${element.type ?? "element"}:${element.id}`, element);
  }
  return [...unique.values()];
}

function elementPoint(element: OverpassElement): { lat: number; lon: number } | undefined {
  const lat = element.center?.lat ?? element.lat ?? averageCoordinate(element, "lat");
  const lon = element.center?.lon ?? element.lon ?? averageCoordinate(element, "lon");
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat: lat!, lon: lon! } : undefined;
}

function averageCoordinate(element: OverpassElement, axis: "lat" | "lon"): number | undefined {
  const points = element.geometry?.length
    ? element.geometry
    : element.members?.flatMap((member) => member.geometry ?? []) ?? [];
  if (points.length === 0) return undefined;
  return points.reduce((sum, point) => sum + point[axis], 0) / points.length;
}

function elementAreaSquareMeters(element: OverpassElement): number | undefined {
  if (element.geometry?.length) {
    const area = ringArea(element.geometry);
    if (area > 0) return area;
  }
  if (!element.members?.length) return undefined;

  const outerSegments = element.members
    .filter((member) => (member.role ?? "outer") === "outer" && member.geometry?.length)
    .map((member) => member.geometry!);
  const innerSegments = element.members
    .filter((member) => member.role === "inner" && member.geometry?.length)
    .map((member) => member.geometry!);
  const outerArea = stitchRings(outerSegments).reduce((sum, ring) => sum + ringArea(ring), 0);
  const innerArea = stitchRings(innerSegments).reduce((sum, ring) => sum + ringArea(ring), 0);
  const area = Math.max(0, outerArea - innerArea);
  return area > 0 ? area : undefined;
}

function stitchRings(segments: Array<Array<{ lat: number; lon: number }>>): Array<Array<{ lat: number; lon: number }>> {
  const remaining = segments.map((segment) => [...segment]);
  const rings: Array<Array<{ lat: number; lon: number }>> = [];
  while (remaining.length > 0) {
    const ring = remaining.shift()!;
    let matched = true;
    while (matched && !sameCoordinate(ring[0]!, ring.at(-1)!)) {
      matched = false;
      const endpoint = ring.at(-1)!;
      const index = remaining.findIndex((segment) => sameCoordinate(segment[0]!, endpoint)
        || sameCoordinate(segment.at(-1)!, endpoint));
      if (index < 0) break;
      let segment = remaining.splice(index, 1)[0]!;
      if (sameCoordinate(segment.at(-1)!, endpoint)) segment = segment.reverse();
      ring.push(...segment.slice(1));
      matched = true;
    }
    if (ring.length >= 4 && sameCoordinate(ring[0]!, ring.at(-1)!)) rings.push(ring);
  }
  return rings;
}

function ringArea(points: readonly { lat: number; lon: number }[]): number {
  if (points.length < 4 || !sameCoordinate(points[0]!, points.at(-1)!)) return 0;
  const radius = 6_371_008.8;
  let sum = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]!;
    const next = points[index + 1]!;
    const longitudeDelta = (next.lon - current.lon) * Math.PI / 180;
    sum += longitudeDelta * (2 + Math.sin(current.lat * Math.PI / 180) + Math.sin(next.lat * Math.PI / 180));
  }
  return Math.abs(sum * radius * radius / 2);
}

function sameCoordinate(left: { lat: number; lon: number }, right: { lat: number; lon: number }): boolean {
  return Math.abs(left.lat - right.lat) < 1e-7 && Math.abs(left.lon - right.lon) < 1e-7;
}

function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr-FR")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ").trim();
}
