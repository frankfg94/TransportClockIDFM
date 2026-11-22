import { GREEN_SPACE_ACCESS_RULES as rules } from "./greenSpaceRoutingRules";
import type { NearbyPlace } from "./nearbyPlaces";
import type { GreenMapReference, GreenPoint, GreeneryMapData, GreenParkSubsite } from "../../../shared/natureInCity";
import { locateAtGreenBoundary } from "../../../shared/greenSpaceBoundary";
import { toServerApiUrl } from "../../services/serverApi";
import { loadGreenSpaceFootprint } from "../../services/places/greenSpaceFootprints";

const geometryCache = new Map<string, { expiresAt: number; request: Promise<GreeneryMapData | undefined> }>();
const GEOMETRY_CACHE_TTL = 10 * 60_000;
const GEOMETRY_CACHE_SIZE = 32;

function loadMapGeometry(url: string) {
  const cached = geometryCache.get(url);
  geometryCache.delete(url);
  if (cached && cached.expiresAt > Date.now()) {
    geometryCache.set(url, cached);
    return cached.request;
  }
  const request = fetch(url, { signal: AbortSignal.timeout(20_000) }).then(async response =>
    response.ok ? await response.json() as GreeneryMapData : undefined);
  geometryCache.set(url, { request, expiresAt: Date.now() + GEOMETRY_CACHE_TTL });
  if (geometryCache.size > GEOMETRY_CACHE_SIZE) geometryCache.delete(geometryCache.keys().next().value!);
  function discard() {
    if (geometryCache.get(url)?.request === request) geometryCache.delete(url);
  }
  void request.then(result => { if (!result) discard(); }, discard);
  return request;
}

export async function getGreenSpaceMapData(reference: GreenMapReference, from: GreenPoint | undefined, signal: AbortSignal): Promise<GreeneryMapData | undefined> {
  signal.throwIfAborted();
  if (reference.scope === "park" && /^(?:way|relation):\d+$/u.test(reference.id)) {
    const footprint = await loadGreenSpaceFootprint(reference.id).catch(() => undefined);
    signal.throwIfAborted();
    if (footprint) return footprint;
  }
  const separator = reference.scope === "park" ? reference.id.indexOf("#") : -1;
  const subsite = reference.scope === "park" && separator !== -1 ? reference.id.slice(separator + 1) : undefined;
  const parent = subsite && reference.scope === "park" ? { ...reference, id: reference.id.slice(0, separator) } : reference;
  const params = new URLSearchParams(Object.entries(parent).filter(([key]) => key !== "mainAccess").map(([key, value]) => [key, String(value)]));
  if (from && reference.scope === "park") {
    params.set("lat", String(from.lat));
    params.set("lon", String(from.lon));
  }
  params.sort();
  const geometry = await loadMapGeometry(toServerApiUrl(`/api/neighborhood-greenery-map?${params}`));
  signal.throwIfAborted();
  if (!geometry || !subsite) return geometry;
  const site = geometry.subsites?.find(item => encodeURIComponent(item.name) === subsite);
  return site ? greenParkSubsiteMap(geometry, site) : undefined;
}

export function greenSpaceTransitTarget(reference: Extract<GreenMapReference, { scope: "park" | "woodland" }>,
  origin: GreenPoint, geometry: GreeneryMapData) {
  const boundary = geometry.mainBoundary ?? geometry.boundary;
  const { inside, nearest } = locateAtGreenBoundary(origin, boundary);
  if (inside || !nearest) return;
  const entrances = (geometry.entrances ?? []).filter(point => {
    if (!geometry.mainBoundary) return true;
    const location = locateAtGreenBoundary(point, boundary);
    return location.inside || location.distanceMeters <= rules.mainTransitEntranceToleranceMeters;
  });
  return { id: reference.id, scope: reference.scope, origin: { lon: origin.lon, lat: origin.lat },
    edge: nearest, boundary, entrances };
}


export function culturalPlacesWithinGreenSpace(places: readonly NearbyPlace[], boundary: GreeneryMapData["boundary"]) {
  return places.filter(place => place.kind === "museum" && place.name.trim()
    && locateAtGreenBoundary(place, boundary).inside);
}

export function greenParkSubsiteId(parentId: string, name: string) {
  return `${parentId}#${encodeURIComponent(name)}`;
}

export function greenParkSubsiteMap(parent: GreeneryMapData, site: GreenParkSubsite): GreeneryMapData {
  return { boundary: site.boundary, surfaceM2: site.surfaceM2, entrances: parent.entrances?.filter(point => {
    const access = locateAtGreenBoundary(point, site.boundary);
    return access.inside || access.distanceMeters <= rules.mainTransitEntranceToleranceMeters;
  }) };
}
