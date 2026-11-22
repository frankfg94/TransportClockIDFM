import { GREEN_SPACE_ACCESS_RULES as rules } from "./greenSpaceRoutingRules";
import { resolveGlobalTransportItineraryLine } from "../line-map/globalTransportItineraryGeometry";
import { computed, shallowRef, watch } from "vue";
import { locateAtGreenBoundary } from "../../../shared/greenSpaceBoundary";
import type { GreenBoundary, GreenPoint } from "../../../shared/natureInCity";
import type { GlobalMapPath } from "../transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../transport-map/contracts/network";
import type { TravelRouteProbe } from "./useTravelRoutes";
import type { NearbyJourney } from "./nearbyHeavyTransports";
import { analyzeNearbyJourneyTiming, isNearbyJourneyTransitSection, isNearbyJourneyWalkingSection } from "./nearbyJourneyTiming";
import { createPreviewTransitPathResolver, journeyPreviewRow } from "./neighborhood/journeyPreview";

export interface GreenSpaceTransitOptions extends TravelRouteProbe {
  datetime: string;
  version: string;
  spaces?: readonly { id: string; woodlandMap?: { id: string }; transitPoints?: readonly GreenPoint[];
    parkAliases?: readonly string[]; parkSubsites?: readonly string[] }[];
  network?: TransportMapNetwork;
  subsites?: ReadonlyMap<string, readonly string[]>;
  journeys?: ReadonlyMap<string, NearbyJourney | undefined>;
  walkingMinutes?: ReadonlyMap<string, number>;
  gardenWalks?: ReadonlyMap<string, import("./nearbyWalkingRoutes").NearbyWalkingRoute>;
  loadDetailPaths?: (lineId: string) => Promise<GlobalMapPath[]>;
  loadPaths: (layer: "core" | "bus") => Promise<GlobalMapPath[]>;
}

export function useGreenSpaceTransit(
  query: () => GreenSpaceTransitTarget | undefined,
  options: () => GreenSpaceTransitOptions | undefined,
  prepared: () => NearbyJourney | undefined,
) {
  const journey = shallowRef<NearbyJourney>();
  const status = shallowRef<"idle" | "loading" | "ready" | "unavailable" | "error">("idle");
  const paths = shallowRef<GlobalMapPath[]>([]);
  const row = computed(() => {
    if (!journey.value) return undefined;
    const network = options()?.network;
    const resolver = network && paths.value.length ? createPreviewTransitPathResolver(network, paths.value) : undefined;
    return journeyPreviewRow({ id: "green-space", label: "", status: "ready", journeys: [journey.value] }, journey.value, resolver);
  });

  watch([query, () => options()?.datetime, () => options()?.version, () => options()?.network,
    prepared, () => options()?.journeys?.has(query()?.id ?? "")], async ([target], _, onCleanup) => {
    journey.value = undefined;
    paths.value = [];
    status.value = "idle";
    const routing = options();
    if (!target || !routing) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    const { signal } = controller;
    status.value = "loading";
    const best = prepared();
    if (signal.aborted) return;
    journey.value = best;
    status.value = best ? "ready" : routing.journeys?.has(target.id) ? "unavailable" : "loading";
    if (!best) return;
    const leg = best.sections.find(isNearbyJourneyTransitSection);
    const line = leg && resolveGlobalTransportItineraryLine(leg, routing.network?.lines ?? []);
    if (line && routing.loadDetailPaths) {
      const detailed = await routing.loadDetailPaths(line.id).catch(() => []);
      if (signal.aborted) return;
      if (detailed.length) { paths.value = detailed; return; }
    }
    if (!leg?.geometry?.length || best.source === "gtfs") {
      const layer = leg?.lineMode === "BUS" || leg?.lineMode === "NOCTILIEN" ? "bus" : "core";
      const geometry = await routing.loadPaths(layer).catch(() => []);
      if (!signal.aborted) paths.value = geometry;
    }
  }, { immediate: true });

  return { status, row };
}

export interface GreenSpaceTransitTarget {
  id: string;
  scope: "park" | "woodland";
  origin: GreenPoint;
  entrances: GreenPoint[];
  edge: GreenPoint;
  documentedApproach?: GreenPoint;
  boundary?: GreenBoundary;
}

export async function probeGreenSpaceTransit(target: GreenSpaceTransitTarget, routing: Pick<GreenSpaceTransitOptions, "spaces" | "network" | "probeJourneys"> & { datetime?: string }, signal: AbortSignal) {
    const space = routing.spaces?.find(candidate =>
      (target.scope === "woodland" ? candidate.woodlandMap?.id : candidate.id) === target.id);
    const entrances = [...target.entrances].sort((a, b) => distance(a, target.origin) - distance(b, target.origin));
    const polygons = target.boundary?.type === "Polygon" ? [target.boundary.coordinates] : target.boundary?.coordinates ?? [];
    const perimeter = polygons.flatMap(polygon => polygon[0] ?? []);
    const extremes = ([0, 1] as const).flatMap(axis => [-1, 1].flatMap(direction => {
      const point = perimeter.reduce<typeof perimeter[number] | undefined>((best, next) =>
        !best || direction * next[axis]! > direction * best[axis]! ? next : best, undefined);
      return point ? [{ lon: point[0]!, lat: point[1]! }] : [];
    }));
    const boundary = target.boundary;
    const mainPoints = target.scope === "woodland" && boundary
      ? (space?.transitPoints ?? []).filter(point => locateAtGreenBoundary(point, boundary).inside) : [];
    const stationApproaches = boundary ? (routing.network?.stations ?? [])
      .filter(station => distance(station, target.edge) <= rules.stationSearchMeters)
      .map(station => locateAtGreenBoundary(station, boundary))
      .filter(approach => approach.nearest && approach.distanceMeters <= rules.stationBoundaryToleranceMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .map(approach => approach.nearest!) : [];
    const destinations = [...mainPoints, ...entrances.slice(0, rules.transitEntranceLimit), ...(target.documentedApproach ? [target.documentedApproach] : []),
      target.edge, ...stationApproaches.slice(0, rules.transitStationLimit),
      ...extremes, ...(space?.transitPoints ?? [])]
      .filter((point, index, points) => points.findIndex(other => distance(other, point) < rules.duplicateTransitTargetMeters) === index)
      .slice(0, rules.transitTargetLimit);
    const results = await Promise.allSettled(destinations.map(async (point, index) => routing.probeJourneys({
      purpose: "places", origin: target.origin, destination: { ...point, id: `green-space:${target.scope}:${target.id}:${index}` },
      datetime: routing.datetime, maxTransfers: rules.maxTransfers, includeGeoJson: true,
    }, signal)));
    const journeys = results.flatMap((result, index) => result.status === "fulfilled"
      ? result.value.map(journey => ({ journey, destination: destinations[index] })) : [])
      .filter(({ journey }) => (journey.transferCount ?? 0) === 0 && journey.sections.filter(isNearbyJourneyTransitSection).length === 1)
      .map(({ journey, destination }) => {
        const timing = analyzeNearbyJourneyTiming(journey);
        const transitIndex = journey.sections.findIndex(isNearbyJourneyTransitSection);
        const egress = journey.sections.slice(transitIndex + 1);
        const finalWalk = egress.reduce((seconds, section) => seconds + section.durationSeconds, 0);
        const lastWalk = egress.findLast(isNearbyJourneyWalkingSection);
        const path = lastWalk?.geometry;
        // Walk geometry can end with a straight connector to the requested waypoint.
        const arrival = path?.at(-1);
        const routedArrival = lastWalk
          ? arrival && distance(arrival, destination) <= rules.terminalConnectorToleranceMeters ? path?.at(-2) : arrival
          : journey.sections[transitIndex]?.toPoint ?? journey.sections[transitIndex]?.geometry?.at(-1);
        const reachesMainWoodland = mainPoints.includes(destination) && !!boundary && !!routedArrival
          && locateAtGreenBoundary(routedArrival, boundary).inside;
        return { journey, destination, elapsed: timing.elapsedSeconds, finalWalk, reachesMainWoodland };
      });
    // Among near-equivalent trips, prefer getting off closer to the destination.
    const fastest = Math.min(...journeys.map(option => option.elapsed));
    const mainJourney = journeys.filter(option => option.reachesMainWoodland)
      .sort((a, b) => a.elapsed - b.elapsed)[0];
    const selected = mainJourney ?? journeys.filter(option => option.elapsed <= fastest + rules.equivalentTransitSeconds)
      .sort((a, b) => a.finalWalk - b.finalWalk || a.elapsed - b.elapsed)[0];
    return { best: selected?.journey, destination: selected?.destination, fastestTransitSeconds: Number.isFinite(fastest) ? fastest : undefined,
      reachesMainWoodland: selected?.reachesMainWoodland,
      walkingApproaches: destinations.flatMap(destination => {
        const elapsed = Math.min(...journeys.filter(option => option.destination === destination).map(option => option.elapsed));
        return Number.isFinite(elapsed) ? [{ minutes: elapsed / 60, point: destination }] : [];
      }),
      failed: results.some(result => result.status === "rejected") };
}

function distance(a: GreenPoint, b: GreenPoint) {
  const dx = (a.lon - b.lon) * Math.cos(b.lat * Math.PI / 180);
  return Math.hypot(dx, a.lat - b.lat) * 111_195;
}
