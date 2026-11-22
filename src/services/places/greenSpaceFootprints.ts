import type { CompiledPlaceRecord } from "./compiledPlaces";
import polygonClipping from "polygon-clipping";

export const GREEN_SPACE_FOOTPRINTS_ASSET = "green-spaces.json";
const MINIMUM_AREA_M2 = 30_000;
const NEARBY_DISTANCE_METERS = 600;

type GreenSpaceFootprint = {
  id: string;
  name: string;
  areaM2: number;
  openingHours?: string;
  rings: NonNullable<CompiledPlaceRecord["footprintRings"]>;
};

export interface NearbyGreenSpaceFootprint {
  id: string;
  name: string;
  distanceMeters: number;
}

export function compileGreenSpaceFootprints(places: readonly CompiledPlaceRecord[]) {
  const spaces = places.flatMap((place): GreenSpaceFootprint[] =>
    (place.kind === "park" || place.kind === "garden")
      && place.name.trim() && place.areaM2 !== undefined && place.areaM2 >= MINIMUM_AREA_M2
      && place.footprintRings?.length
      ? [{ id: place.id, name: place.name, areaM2: place.areaM2, rings: place.footprintRings,
        ...(place.tags?.opening_hours ? { openingHours: place.tags.opening_hours } : {}) }]
      : []);
  return { schemaVersion: 1, spaces };
}

let inventory: Promise<GreenSpaceFootprint[]> | undefined;

function loadInventory(): Promise<GreenSpaceFootprint[]> {
  inventory ??= fetch(`/data/place-footprints/${GREEN_SPACE_FOOTPRINTS_ASSET}`, { signal: AbortSignal.timeout(12_000) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Green-space footprints HTTP ${response.status}`);
      const payload = await response.json() as ReturnType<typeof compileGreenSpaceFootprints>;
      if (payload.schemaVersion !== 1 || !Array.isArray(payload.spaces)) throw new Error("Invalid green-space footprints");
      return payload.spaces;
    })
    .catch((error) => { inventory = undefined; throw error; });
  return inventory;
}

export async function loadNearbyGreenSpaceFootprints(origin: { lat: number; lon: number }): Promise<NearbyGreenSpaceFootprint[]> {
  return findNearbyGreenSpaceFootprints(origin, await loadInventory());
}

export async function loadGreenSpaceFootprintGeometry(id: string): Promise<GeoJSON.MultiPolygon | undefined> {
  return (await loadGreenSpaceFootprint(id))?.boundary;
}

export async function loadGreenSpaceFootprint(id: string) {
  const item = (await loadInventory()).find(entry => entry.id === id);
  if (!item) return undefined;
  const [first, ...remaining] = item.rings.map(ring => [ring.map(([x, y]): [number, number] => [x, y])]);
  if (!first) return undefined;
  return {
    boundary: { type: "MultiPolygon" as const, coordinates: polygonClipping.xor(first, ...remaining) },
    surfaceM2: item.areaM2,
    openingHours: item.openingHours,
  };
}

export function findNearbyGreenSpaceFootprints(
  origin: { lat: number; lon: number },
  spaces: readonly GreenSpaceFootprint[],
): NearbyGreenSpaceFootprint[] {
  return spaces
    .map(({ id, name, areaM2, rings }) => ({ id, name, areaM2, distanceMeters: distanceToFootprint(origin, rings) }))
    .filter((space) => space.distanceMeters <= NEARBY_DISTANCE_METERS)
    .sort((left, right) => right.areaM2 - left.areaM2 || left.distanceMeters - right.distanceMeters || left.id.localeCompare(right.id))
    .slice(0, 2)
    .map(({ id, name, distanceMeters }) => ({ id, name, distanceMeters: Math.round(distanceMeters) }));
}

function distanceToFootprint(origin: { lat: number; lon: number }, rings: GreenSpaceFootprint["rings"]): number {
  const metersPerDegree = Math.PI * 6_371_000 / 180;
  const longitudeScale = metersPerDegree * Math.cos(origin.lat * Math.PI / 180);
  let distanceSquared = Infinity;
  let inside = false;
  // The footprint pack stores closed outer and inner rings. Use the same
  // even-odd rule as the map, including holes and disjoint polygons.
  for (const ring of rings) {
    for (let index = 1; index < ring.length; index += 1) {
      const [fromLon, fromLat] = ring[index - 1]!;
      const [toLon, toLat] = ring[index]!;
      const x = (fromLon - origin.lon) * longitudeScale;
      const y = (fromLat - origin.lat) * metersPerDegree;
      const dx = (toLon - fromLon) * longitudeScale;
      const dy = (toLat - fromLat) * metersPerDegree;
      if ((y > 0) !== (y + dy > 0) && x - y * dx / dy > 0) inside = !inside;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared ? Math.max(0, Math.min(1, -(x * dx + y * dy) / lengthSquared)) : 0;
      distanceSquared = Math.min(distanceSquared, (x + t * dx) ** 2 + (y + t * dy) ** 2);
    }
  }
  return inside ? 0 : Math.sqrt(distanceSquared);
}
