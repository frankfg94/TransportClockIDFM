import type { GtfsRoutingIndex, GtfsRoutingPathway } from "./routingTypes";
import type { ConnectionScanResult, RoutingNode, TransitArrival } from "./connectionScan";
import type { NearbyJourneyPoint, NearbyJourneySection } from "../../src/features/nearby-stations/nearbyHeavyTransports";
import { haversineMeters } from "../../src/features/nearby-stations/nearbyWalkingRoutes";
import { createFinalAccessStreetRouter, type FinalAccessMatrix } from "./finalAccessStreets";
import { routingSections } from "./connectionScan";
import { supportsNearbyHeavyFeederSequence } from "../../src/features/nearby-stations/nearbyHeavyTransportRules";
import { isNearbyJourneyTransitSection } from "../../src/features/nearby-stations/nearbyJourneyTiming";

type Edge = { from: number; to: number; path: GtfsRoutingPathway };
type Path = { seconds: number; edges: Edge[] };
type StreetEnd = { stop: number; path: Path };
type Point = NearbyJourneyPoint & { id: string; name: string };

/** FINAL ACCESS ONLY (destinationLineId).
 * Agent/maintainer warning: this is not a replacement for connectionScan's
 * transfer graph or boarding rules. No train is boarded after these paths.
 * transfers.txt selects eligible stop pairs; its minimum is NOT walking time.
 */
export function createFinalLineAccessResolver(index: GtfsRoutingIndex) {
  if (index.pedestrianGraphVersion !== 1) return undefined;
  const incoming = new Map<number, Set<number>>();
  for (const [from, to] of index.transfers) {
    const list = incoming.get(to) ?? new Set<number>(); list.add(from); incoming.set(to, list);
  }
  for (const rule of index.scopedTransfers) {
    const list = incoming.get(rule.to) ?? new Set<number>(); list.add(rule.from); incoming.set(rule.to, list);
  }
  const adjacency = new Map<number, Edge[]>(), hasPaths = new Set<string>();
  const group = (stop: number) => {
    let current = index.stops[stop]!;
    const seen = new Set<string>();
    while (current.parentId && !seen.has(current.parentId)) {
      seen.add(current.parentId);
      const parent = byId.get(current.parentId);
      if (parent === undefined) return current.parentId;
      current = index.stops[parent]!;
    }
    return current.id;
  };
  const byId = new Map(index.stops.map((s, i) => [s.id, i]));
  const entrances = new Map<string, number[]>();
  index.stops.forEach((s, i) => {
    if (s.locationType === 2) { const key = group(i), list = entrances.get(key) ?? []; list.push(i); entrances.set(key, list); }
  });
  const add = (from: number, to: number, path: GtfsRoutingPathway) => {
    const list = adjacency.get(from) ?? []; list.push({ from, to, path }); adjacency.set(from, list);
  };
  for (const path of index.pathways ?? []) {
    hasPaths.add(group(path.from)); hasPaths.add(group(path.to));
    if (!Number.isFinite(path.seconds) || path.seconds! < 0) continue;
    add(path.from, path.to, path);
    if (path.bidirectional && path.mode !== 7) add(path.to, path.from, path);
  }
  const pathCache = new Map<number, Map<number, Path>>();
  const pathsFrom = (from: number): Map<number, Path> => {
    const cached = pathCache.get(from); if (cached) return cached;
    const paths = new Map<number, Path>(), queue = [{ to: from, seconds: 0, edges: [] as Edge[] }];
    while (queue.length) {
      queue.sort((a, b) => b.seconds - a.seconds);
      const path = queue.pop()!;
      if (paths.has(path.to) || path.seconds > 1200) continue;
      paths.set(path.to, { seconds: path.seconds, edges: path.edges });
      for (const edge of adjacency.get(path.to) ?? []) if (!paths.has(edge.to)) {
        queue.push({ to: edge.to, seconds: path.seconds + edge.path.seconds!, edges: [...path.edges, edge] });
      }
    }
    pathCache.set(from, paths);
    return paths;
  };
  const point = (stop: number): Point | undefined => {
    const s = index.stops[stop]!;
    return Number.isFinite(s.lat) && Number.isFinite(s.lon) ? { lat: s.lat!, lon: s.lon!, id: s.id, name: s.name } : undefined;
  };
  const streetAccessible = (stop: number) => index.stops[stop]!.stopAccess === 1
    || index.stops[stop]!.stopAccess !== 0 && !hasPaths.has(group(stop)) && !entrances.has(group(stop));
  const ends = (stop: number, outward: boolean): StreetEnd[] => {
    if (streetAccessible(stop)) return [{ stop, path: { seconds: 0, edges: [] } }];
    return (entrances.get(group(stop)) ?? []).flatMap(entrance => {
      const path = outward ? pathsFrom(stop).get(entrance) : pathsFrom(entrance).get(stop);
      return path ? [{ stop: entrance, path }] : [];
    });
  };
  const sectionForEdge = (edge: Edge): NearbyJourneySection => ({
    type: "walking", mode: "walking", durationSeconds: edge.path.seconds!, timingSource: "schedule",
    walkingProvider: "gtfs-pathways", distanceMeters: edge.path.lengthMeters,
    fromStopPointId: index.stops[edge.from]!.id, toStopPointId: index.stops[edge.to]!.id,
    fromStopAreaId: index.stops[edge.from]!.parentId, toStopAreaId: index.stops[edge.to]!.parentId,
    fromName: index.stops[edge.from]!.name, toName: index.stops[edge.to]!.name,
    fromPoint: point(edge.from), toPoint: point(edge.to),
  });
  const streets = createFinalAccessStreetRouter();
  const transitByArrival = new WeakMap<RoutingNode, NearbyJourneySection[]>();

  return async function resolve(input: {
    tree: ConnectionScanResult; stationStops: readonly number[]; lineId: string;
    origin: NearbyJourneyPoint; start: number; end: number; matrix: FinalAccessMatrix; assertCurrent: () => void;
    nearbyAccessFeeders?: { lineIds: readonly string[]; lineCodes: readonly string[] };
    transferRule: (from: TransitArrival, to: { from: number; routeId: string }) => number | undefined;
  }): Promise<RoutingNode[]> {
    const { tree, lineId } = input, result: RoutingNode[] = [];
    const feederIds = new Set(input.nearbyAccessFeeders?.lineIds), feederCodes = new Set(input.nearbyAccessFeeders?.lineCodes);
    const acceptsArrival = (node: RoutingNode) => {
      if (!input.nearbyAccessFeeders) return true;
      let transit = transitByArrival.get(node);
      if (!transit) {
        transit = routingSections(node).filter(isNearbyJourneyTransitSection);
        transitByArrival.set(node, transit);
      }
      return supportsNearbyHeavyFeederSequence(transit, feederIds, feederCodes);
    };
    const targets = input.stationStops.filter(stop => tree.stopsByLine.get(lineId)?.has(stop));
    const containsTarget = (node: RoutingNode) => {
      for (let n: RoutingNode | undefined = node; n; n = n.previous) if (n.section.lineId === lineId) return true;
      return false;
    };
    const append = (node: RoutingNode, sections: NearbyJourneySection[], status: "documented" | "estimated" | "incomplete", entranceIds: string[], pathwayIds: string[]) => {
      for (const section of sections) {
        const syntheticOrigin = !node.previous && node.section.durationSeconds === 0 && !node.section.lineId && !node.section.toPoint;
        node = { previous: syntheticOrigin ? undefined : node, arrival: node.arrival + section.durationSeconds,
          walkingSeconds: (node.walkingSeconds ?? 0) + section.durationSeconds, section: { ...section, finalLineAccess: { status, entranceIds, pathwayIds } } };
      }
      if (node.arrival <= input.end && (node.walkingSeconds ?? 0) <= 1200) result.push(node);
    };
    const sourcesFor = (target: number) => new Set([target, ...(incoming.get(target) ?? []),
      ...input.stationStops.filter(stop => group(stop) === group(target))]);
    await Promise.all(targets.map(async target => {
      input.assertCurrent();
      const targetPoint = point(target); if (!targetPoint) return;
      const targetEnds = ends(target, false);
      const sources = [...sourcesFor(target)].flatMap(source => {
        const nodes = new Set([tree.platformLabels.get(source), ...(tree.tramPlatformLabels.get(source)?.values() ?? []),
          ...(tree.feederLabels.get(source)?.values() ?? []), ...(tree.nightLabels.get(source)?.values() ?? [])]);
        return [...nodes].filter((node): node is RoutingNode => Boolean(node && node.section.type === "public_transport" && !containsTarget(node) && acceptsArrival(node)))
          .map(node => ({ source, node }));
      });
      // Direct walking is an address-to-entrance path, never an old scan label
      // that may have snapped a street route directly onto an internal point.
      if (haversineMeters(input.origin, targetPoint) <= 1200) sources.push({ source: -1,
        node: { arrival: input.start, walkingSeconds: 0, section: { type: "walking", mode: "walking", durationSeconds: 0 } } });
      // Independent arrivals/exits must overlap their street-network waits.
      // Serial evaluation can exceed the verdict deadline at a large station;
      // the shared provider still batches, caches and rate-limits actual I/O.
      await Promise.all(sources.map(async ({ source, node }) => {
        const origin = source < 0 ? undefined : node.transferOrigin ?? { stop: source, arrival: node.arrival, routeId: node.section.lineId };
        const minimum = origin ? input.transferRule(origin, { from: target, routeId: lineId }) : undefined;
        if (minimum !== undefined && minimum < 0) return;
        const direct = source < 0 ? undefined : pathsFrom(source).get(target);
        if (direct?.seconds === 0) { result.push(node); return; }
        const sourceEnds: StreetEnd[] = source < 0 ? [{ stop: -1, path: { seconds: 0, edges: [] } }] : ends(source, true);
        const candidates: { sections: NearbyJourneySection[]; seconds: number; estimated: boolean; incomplete?: boolean; entrances: string[]; paths: string[] }[] = [];
        if (direct) candidates.push({ seconds: direct.seconds, sections: direct.edges.map(sectionForEdge), estimated: false,
          entrances: [...new Set(direct.edges.flatMap(edge => [edge.from, edge.to].filter(id => index.stops[id]!.locationType === 2).map(id => index.stops[id]!.id)))],
          paths: direct.edges.map(edge => edge.path.id) });
        await Promise.all(sourceEnds.map(async fromEnd => {
          const from: Point | undefined = fromEnd.stop < 0 ? { ...input.origin, id: "address", name: "" } : point(fromEnd.stop);
          if (!from) return;
          const destinations = targetEnds.map(end => point(end.stop)).filter((p): p is Point => Boolean(p))
            .sort((a, b) => haversineMeters(from, a) - haversineMeters(from, b));
          const routes = await streets(from, destinations, input.matrix);
          input.assertCurrent();
          for (const toEnd of targetEnds) {
            const to = point(toEnd.stop), route = to && routes.get(to.id);
            if (!to || !route) continue;
            const edges = [...fromEnd.path.edges, ...toEnd.path.edges];
            const section: NearbyJourneySection = { type: "walking", mode: "walking", durationSeconds: route.durationSeconds,
              timingSource: route.fallback ? "estimated" : "schedule", walkingProvider: route.provider, walkingDatasetVersion: route.datasetVersion,
              walkingUnavailabilityReason: route.unavailabilityReason, geometry: route.coordinates, distanceMeters: route.distanceMeters,
              fromPoint: from, toPoint: to, fromName: from.name || undefined, toName: to.name,
              fromStopPointId: fromEnd.stop < 0 ? undefined : from.id, toStopPointId: to.id,
              fromStopAreaId: fromEnd.stop < 0 ? undefined : index.stops[fromEnd.stop]!.parentId,
              toStopAreaId: index.stops[toEnd.stop]!.parentId };
            const seconds = fromEnd.path.seconds + route.durationSeconds + toEnd.path.seconds;
            if ((node.walkingSeconds ?? 0) + seconds > 1200 || node.arrival + seconds > input.end) continue;
            const unknownStreetAccess = (end: StreetEnd) => end.stop >= 0 && !end.path.edges.length
              && index.stops[end.stop]!.stopAccess !== 1 && index.stops[end.stop]!.locationType !== 2;
            candidates.push({ seconds, estimated: Boolean(route.fallback), incomplete: unknownStreetAccess(fromEnd) || unknownStreetAccess(toEnd),
              sections: [...fromEnd.path.edges.map(sectionForEdge), section, ...toEnd.path.edges.map(sectionForEdge)],
              entrances: [fromEnd.stop, toEnd.stop].filter(id => id >= 0 && index.stops[id]!.locationType === 2).map(id => index.stops[id]!.id),
              paths: edges.map(edge => edge.path.id) });
          }
        }));
        candidates.sort((a, b) => Number(Boolean(a.incomplete)) - Number(Boolean(b.incomplete)) || Number(a.estimated) - Number(b.estimated) || a.seconds - b.seconds);
        const winner = candidates[0];
        if (winner) append(node, winner.sections, winner.incomplete ? "incomplete" : winner.estimated ? "estimated" : "documented", winner.entrances, winner.paths);
        else if (source >= 0 && minimum !== undefined && minimum >= 0) {
          // Retain an honest legacy reference if the interior graph is missing.
          append(node, [{ type: "walking", mode: "walking", durationSeconds: minimum, transferDurationSource: "gtfs-minimum",
            timingSource: "estimated", fromStopPointId: index.stops[source]!.id, toStopPointId: targetPoint.id,
            fromName: index.stops[source]!.name, toName: targetPoint.name, fromPoint: point(source), toPoint: targetPoint }], "incomplete", [], []);
        }
      }));
    }));
    return result;
  };
}
