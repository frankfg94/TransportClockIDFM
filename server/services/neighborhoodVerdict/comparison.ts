import polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon } from "polygon-clipping";
import { findPointIrisNeighborhoods } from "./irisPointLookup";
import type { CompiledNeighborhoodVerdictData, VerdictPolygonGeometry } from "./contracts";
import type { ComparisonGreen, ComparisonNeighborhood, NeighborhoodComparisonGeography } from "../../../src/features/nearby-stations/neighborhood-comparison/types";
import { geometryBounds, pointOnBoundary, type GeometryBounds } from "../../../src/features/nearby-stations/neighborhood-comparison/geometry";

const RADIUS = 6_371_008.8;
const cityCache = new WeakMap<CompiledNeighborhoodVerdictData, Map<string, ComparisonNeighborhood[]>>();
const greenCache = new WeakMap<CompiledNeighborhoodVerdictData, Map<string, Record<string, ComparisonGreen>>>();
const neighborhoodBounds = new WeakMap<CompiledNeighborhoodVerdictData, GeometryBounds[]>();

function polygons(geometry: VerdictPolygonGeometry): MultiPolygon {
  return (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates) as MultiPolygon;
}

/** Spherical area, subtracting holes, in square metres (WGS84 coordinates). */
export function polygonAreaM2(geometry: VerdictPolygonGeometry | MultiPolygon): number {
  const parts = Array.isArray(geometry) ? geometry : polygons(geometry);
  const ringArea = (ring: Polygon[number]): number => {
    let sum = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
      sum += (b[0] - a[0]) * Math.PI / 180 * (2 + Math.sin(a[1] * Math.PI / 180) + Math.sin(b[1] * Math.PI / 180));
    }
    return Math.abs(sum * RADIUS * RADIUS / 2);
  };
  return parts.reduce((sum, part) => sum + Math.max(0, (part[0] ? ringArea(part[0]) : 0) - part.slice(1).reduce((n, ring) => n + ringArea(ring), 0)), 0);
}

function overlaps(a: GeometryBounds, b: GeometryBounds): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}
function communeKey(code: string): string {
  return /^751(?:0[1-9]|1\d|20)$/u.test(code) ? "75056" : code;
}

export class ComparisonLocationError extends Error {
  constructor(readonly reason: "outside" | "ambiguous" | "context") { super(reason); }
}

export function buildComparisonGeography(data: CompiledNeighborhoodVerdictData, point: { lon: number; lat: number }, communeCode?: string): NeighborhoodComparisonGeography {
  const matched = new Map(findPointIrisNeighborhoods(data.iris, point).map(item => [item.codeIris, item]));
  // Boundary checks are scoped by a bounding box before inspecting segments.
  let allBounds = neighborhoodBounds.get(data);
  if (!allBounds) { allBounds = data.iris.neighborhoods.map(item => geometryBounds(item.geometry)); neighborhoodBounds.set(data, allBounds); }
  for (const [index, item] of data.iris.neighborhoods.entries()) {
    const b = allBounds[index]!;
    if (point.lon < b[0] - 1e-9 || point.lon > b[2] + 1e-9 || point.lat < b[1] - 1e-9 || point.lat > b[3] + 1e-9) continue;
    if (pointOnBoundary(item.geometry, point)) matched.set(item.codeIris, item);
  }
  const candidates = [...matched.values()];
  if (!candidates.length) throw new ComparisonLocationError("outside");
  const codes = new Set(candidates.map(item => communeKey(item.communeCode)));
  // A hint is authoritative only if its municipality contains the point.
  const hintedCity = communeCode ? communeKey(communeCode) : undefined;
  if (hintedCity && !codes.has(hintedCity)) throw new ComparisonLocationError("context");
  if (communeCode && communeCode !== hintedCity && !candidates.some(item => item.communeCode === communeCode)) throw new ComparisonLocationError("context");
  const resolvedCode = hintedCity ?? (codes.size === 1 ? [...codes][0] : undefined);
  if (!resolvedCode) throw new ComparisonLocationError("ambiguous");
  let within = candidates.filter(item => communeKey(item.communeCode) === resolvedCode);
  // An arrondissement hint can disambiguate a shared internal boundary.
  if (communeCode && communeCode !== resolvedCode && within.some(item => item.communeCode === communeCode)) within = within.filter(item => item.communeCode === communeCode);
  const neighborhoods = cityNeighborhoods(data, resolvedCode);
  const source = data.sources.find(item => item.id === "insee-iris");
  if (!source) throw new Error("Missing IRIS source");
  const greenId = within[0]!.departmentCode === "92" ? "hds-green-spaces" : within[0]!.departmentCode === "75" ? "paris-green-spaces" : undefined;
  return {
    generatedAt: data.generatedAt,
    commune: { code: resolvedCode, name: resolvedCode === "75056" ? "Paris" : within[0]!.communeName },
    selectedCode: within.length === 1 ? within[0]!.codeIris : undefined,
    matchingCodes: within.map(item => item.codeIris),
    neighborhoods,
    irisSource: source,
    greenSource: data.sources.find(item => item.id === greenId),
  };
}

function cityNeighborhoods(data: CompiledNeighborhoodVerdictData, code: string): ComparisonNeighborhood[] {
  let cache = cityCache.get(data);
  if (!cache) { cache = new Map(); cityCache.set(data, cache); }
  const existing = cache.get(code);
  if (existing) return existing;
  const items = data.iris.neighborhoods.filter(item => communeKey(item.communeCode) === code);
  const department = items[0]?.departmentCode;
  const sourceId = department === "92" ? "hds-green-spaces" : department === "75" ? "paris-green-spaces" : undefined;
  const sourceAvailable = sourceId && data.sources.some(source => source.id === sourceId);
  const result = items.map((item): ComparisonNeighborhood => {
    const areaM2 = polygonAreaM2(item.geometry);
    return { ...item, areaM2, green: { status: sourceAvailable && areaM2 > 0 ? "pending" : "unavailable" } };
  });
  cache.set(code, result);
  if (cache.size > 24) cache.delete(cache.keys().next().value!);
  return result;
}

/** Expensive polygon clipping is requested only when the nature theme opens. */
export function buildComparisonGreen(data: CompiledNeighborhoodVerdictData, code: string): Record<string, ComparisonGreen> {
  let cache = greenCache.get(data);
  if (!cache) { cache = new Map(); greenCache.set(data, cache); }
  const existing = cache.get(code);
  if (existing) return existing;
  const items = cityNeighborhoods(data, code);
  if (!items.length) throw new ComparisonLocationError("outside");
  const department = items[0]?.departmentCode;
  const sourceId = department === "92" ? "hds-green-spaces" : department === "75" ? "paris-green-spaces" : undefined;
  const greens = sourceId ? data.greenSpaces.filter(space => (space.sourceId ?? "hds-green-spaces") === sourceId).map(space => ({ space, bounds: geometryBounds(space.geometry) })) : [];
  const result: Record<string, ComparisonGreen> = {};
  for (const item of items) {
    if (item.green.status === "unavailable") { result[item.codeIris] = item.green; continue; }
    let failed = false;
    const pieces: MultiPolygon[] = [];
    const box = geometryBounds(item.geometry);
    for (const candidate of greens) {
      if (!overlaps(box, candidate.bounds)) continue;
      try {
        const clipped = polygonClipping.intersection(polygons(item.geometry), polygons(candidate.space.geometry));
        if (clipped.length) pieces.push(clipped);
      } catch { failed = true; }
    }
    try {
      // Union the clipped pieces so overlapping source polygons are counted once.
      const merged = pieces.length ? polygonClipping.union(pieces[0]!, ...pieces.slice(1)) : [];
      result[item.codeIris] = { status: "partial", areaM2: Math.min(item.areaM2, polygonAreaM2(merged)), sites: pieces.length, ...(failed ? { error: true } : {}) };
    } catch {
      result[item.codeIris] = { status: "unavailable", error: true };
    }
  }
  cache.set(code, result);
  if (cache.size > 24) cache.delete(cache.keys().next().value!);
  return result;
}
