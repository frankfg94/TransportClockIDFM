import { MAPPED_PARK_ENTRANCE_TOLERANCE_METERS } from "../../../shared/natureInCityRules";
import { GREEN_SPACE_ACCESS_RULES as rules, GREEN_SPACE_WALKING_FALLBACK_POLICY } from "./greenSpaceRoutingRules";
import { locateAtGreenBoundary } from "../../../shared/greenSpaceBoundary";
import type { GreenMapReference, GreenPoint, GreeneryMapData } from "../../../shared/natureInCity";
import { toServerApiUrl } from "../../services/serverApi";
import { getNearbyWalkingRoute } from "../../services/nearbyWalkingRoutes";
import { haversineMeters, type NearbyWalkingRoute } from "./nearbyWalkingRoutes";

export type GreenSpaceWalk = { access: "inside" | "entrance" | "edge" | "main" | "unavailable"; route?: NearbyWalkingRoute };

export async function routeToMainWoodland(geometry: GreeneryMapData, origin: GreenPoint,
  targets: readonly GreenPoint[], signal: AbortSignal): Promise<{ minutes: number; point?: GreenPoint } | undefined> {
  const boundary = geometry.mainBoundary ?? geometry.boundary;
  if (locateAtGreenBoundary(origin, boundary).inside) return { minutes: 0 };
  const candidates = targets.filter(point => locateAtGreenBoundary(point, boundary).inside)
    .slice(0, rules.mainWoodlandWalkingTargetLimit);
  const results = await Promise.allSettled(candidates.map(async point => {
    const walk = await walkTo(origin, point, "main", signal, boundary);
    return walk.route && { minutes: walk.route.durationSeconds / 60, point };
  }));
  if (signal.aborted) return;
  return results.flatMap(result => result.status === "fulfilled" && result.value ? [result.value] : [])
    .sort((a, b) => a.minutes - b.minutes)[0];
}

async function getFootprintEntrances(center: GreenPoint, name: string, boundary: GreeneryMapData["boundary"], signal: AbortSignal) {
  const params = new URLSearchParams({ scope: "park-entrances", name, lat: String(center.lat), lon: String(center.lon) });
  const response = await fetch(toServerApiUrl(`/api/neighborhood-greenery-map?${params}`), { signal }).catch(() => undefined);
  const result = response?.ok ? await response.json() as Pick<GreeneryMapData, "entrances"> : undefined;
  return result?.entrances?.filter(point => {
    const location = locateAtGreenBoundary(point, boundary);
    return location.inside || location.distanceMeters <= MAPPED_PARK_ENTRANCE_TOLERANCE_METERS;
  });
}

export async function routeToGreenSpace(next: GreeneryMapData, reference: GreenMapReference, from: GreenPoint, label: string | undefined, signal: AbortSignal): Promise<GreenSpaceWalk> {
  const location = locateAtGreenBoundary(from, next.mainBoundary ?? next.boundary);
  if (location.inside) {
    return { access: "inside" };
  }
  const edge = location.nearest;
  if (!edge) return { access: "unavailable" };
  let entrances = next.entrances;
  if (!entrances && reference.scope === "park" && /^(?:way|relation):\d+$/u.test(reference.id) && label) {
    entrances = await getFootprintEntrances(edge, label, next.boundary, signal);
  }
  if (next.mainBoundary) {
    const boundary = next.mainBoundary;
    entrances = entrances?.filter(point => {
      const location = locateAtGreenBoundary(point, boundary);
      return location.inside || location.distanceMeters <= rules.mainWalkingEntranceToleranceMeters;
    });
  }
  const mainAccess = reference.scope === "woodland" ? reference.mainAccess : undefined;
  if (mainAccess) return walkTo(from, mainAccess, "main", signal);
  const unique = (entrances ?? []).filter((point, index, points) =>
    points.findIndex(other => haversineMeters(point, other) <= rules.duplicateWalkingEntranceMeters) === index);
  const tested = await Promise.allSettled(unique.map(entrance => walkTo(from, entrance, "entrance", signal)));
  if (signal.aborted) return { access: "unavailable" };
  const fastest = tested.flatMap(result => result.status === "fulfilled" && result.value.route ? [result.value] : [])
    .sort((a, b) => a.route!.durationSeconds - b.route!.durationSeconds)[0];
  return fastest ?? walkTo(from, edge, "edge", signal);
}

async function walkTo(origin: GreenPoint, destination: GreenPoint, access: "main" | "entrance" | "edge",
  signal: AbortSignal, requiredBoundary?: GreeneryMapData["boundary"]): Promise<GreenSpaceWalk> {
  if (signal.aborted) return { access: "unavailable" };
  const request = { origin, destination };
  const reachesDestination = (path: NearbyWalkingRoute) => isDetailedWalkingPath(path)
    && (!requiredBoundary || locateAtGreenBoundary(path.coordinates.at(-2)!, requiredBoundary).inside)
    && (access !== "entrance" || haversineMeters(path.coordinates.at(-1)!, destination) <= rules.walkingArrivalToleranceMeters);
  let path = await getNearbyWalkingRoute(request, signal);
  if (!signal.aborted && !reachesDestination(path)) {
    path = await getNearbyWalkingRoute({ ...request, routingPolicy: GREEN_SPACE_WALKING_FALLBACK_POLICY }, signal);
  }
  return !signal.aborted && reachesDestination(path) ? { route: path, access } : { access: "unavailable" };
}

function isDetailedWalkingPath(path: NearbyWalkingRoute) {
  return !path.fallback && path.provider !== "straight-line" && path.coordinates.length >= 2;
}
