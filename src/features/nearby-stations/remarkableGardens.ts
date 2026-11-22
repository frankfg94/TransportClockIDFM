import { GARDEN_ENTRANCE_RULES as rules } from "./greenSpaceRoutingRules";
import { locateAtGreenBoundary, normalizeGreenSpaceName } from "../../../shared/greenSpaceBoundary";
import type { GreenBoundary, GreenPoint } from "../../../shared/natureInCity";
import { createIgnTransportMapGeocoder } from "../../services/geocoding/ign";
import { toServerApiUrl } from "../../services/serverApi";

export const REMARKABLE_GARDENS_SOURCE = "https://www.data.gouv.fr/datasets/liste-des-jardins-remarquables";

export interface RemarkableGarden extends GreenPoint {
  id: string;
  name: string;
  publicAccess: "open" | "closed" | "unknown";
  entranceAddress?: string;
}

let register: Promise<RemarkableGarden[]> | undefined;
export function loadRemarkableGardens() {
  return register ??= fetch("/data/remarkable-gardens.json", { signal: AbortSignal.timeout(8000) }).then(async response => {
    if (!response.ok) throw new Error("remarkable-gardens-unavailable");
    const data = await response.json() as RemarkableGarden[];
    if (!Array.isArray(data)) throw new Error("invalid-remarkable-gardens");
    return data;
  }).catch(() => { register = undefined; return []; });
}

export function matchRemarkableGarden(gardens: readonly RemarkableGarden[], name: string, boundary: GreenBoundary) {
  const key = normalizeGreenSpaceName(name);
  const matches = gardens.filter(garden => {
    const official = normalizeGreenSpaceName(garden.name);
    const position = locateAtGreenBoundary(garden, boundary);
    return key && (official === key || official.startsWith(key + "du") || official.startsWith(key + "de"))
      && (position.inside || position.distanceMeters <= rules.registerMatchMeters);
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export async function remarkableGardenEntrance(garden: RemarkableGarden, boundary: GreenBoundary, signal: AbortSignal) {
  if (garden.publicAccess !== "open" || !garden.entranceAddress) return;
  const [point] = await createIgnTransportMapGeocoder().geocode(garden.entranceAddress, signal).catch(() => []);
  if (point?.type === "address" && locateAtGreenBoundary(point, boundary).distanceMeters <= rules.addressToleranceMeters) {
    return { lon: point.lon, lat: point.lat };
  }
}

export function parkOsmBounds(boundary: GreenBoundary) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  const polygons = boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates;
  for (const polygon of polygons) for (const [lon, lat] of polygon[0] ?? []) {
    if (lon === undefined || lat === undefined) continue;
    west = Math.min(west, lon);
    south = Math.min(south, lat);
    east = Math.max(east, lon);
    north = Math.max(north, lat);
  }
  const bbox = [west - .001, south - .001, east + .001, north + .001];
  if (!bbox.every(Number.isFinite) || bbox[2]! - bbox[0]! > .025 || bbox[3]! - bbox[1]! > .025) return;
  return bbox.map(value => value.toFixed(5)).join(",");
}

export async function mappedGardenEntrances(name: string, boundary: GreenBoundary, signal: AbortSignal): Promise<GreenPoint[]> {
  const bbox = parkOsmBounds(boundary);
  if (!bbox) return [];
  const params = new URLSearchParams({ bbox });
  const response = await fetch(toServerApiUrl(`/api/neighborhood-park-entrances?${params}`), { signal }).catch(() => undefined);
  if (!response?.ok) return [];
  const gates = await response.json() as (GreenPoint & { name?: string; publicGate: boolean })[];
  const site = normalizeGreenSpaceName(name);
  return gates.filter(gate => {
    const distance = locateAtGreenBoundary(gate, boundary).distanceMeters;
    if (gate.name) return site.length >= rules.minimumNamedGateMatchLength && normalizeGreenSpaceName(gate.name).includes(site) && distance <= rules.namedGateToleranceMeters;
    return gate.publicGate && distance <= rules.genericGateToleranceMeters;
  }).map(({ lat, lon }) => ({ lat, lon }));
}
