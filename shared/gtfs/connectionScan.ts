import type { NearbyJourneySection } from "../../src/features/nearby-stations/nearbyHeavyTransports";
import { createImmediateTramWalkingRoute } from "../../src/features/nearby-stations/nearbyWalkingRoutes";

export interface TransitArrival { stop: number; arrival: number; routeId?: string; tripId?: string }
export interface RoutingNode { previous?: RoutingNode; section: NearbyJourneySection; arrival: number; transferOrigin?: TransitArrival; walkingSeconds?: number; tramFeederLineId?: string; tramBoardingWalkingSeconds?: number }
export interface RoutingConnection {
  from: number; to: number; departure: number; arrival: number; tripKey: string;
  pickup: number; dropOff: number; section: NearbyJourneySection;
  last?: boolean;
  routeId?: string; tripId?: string;
}
export interface RoutingFootpath { to: number; seconds: number; section: NearbyJourneySection; allowsInitialAccess?: boolean }
export type RoutingConnectionBatch = readonly RoutingConnection[];
export interface ConnectionScanResult { labels: Map<number, RoutingNode>; transitLabels: Map<number, RoutingNode>; platformLabels: Map<number, RoutingNode>; tramLabels: Map<number, Map<string, RoutingNode>>; tramPlatformLabels: Map<number, Map<string, RoutingNode>>; nightLabels: Map<number, Map<string, RoutingNode>>; feederLabels: Map<number, Map<string, RoutingNode>>; scannedConnections: number;
  /** Actual stop membership from the services scanned for this date and mode set. */
  stopsByLine: Map<string, Set<number>>;
  accessLabels: Map<number, RoutingNode>;
  excludedFeederAccesses: { lineId?: string; lineCode?: string; stopId?: string; stopName?: string; walkingSeconds: number; reason: string }[] }

interface DirectFeederNode extends RoutingNode { scoreSeconds: number }
function continueTrip(riding: RoutingNode, connection: RoutingConnection): RoutingNode {
  return { previous: riding.previous, arrival: connection.arrival, walkingSeconds: riding.walkingSeconds, tramFeederLineId: riding.tramFeederLineId, tramBoardingWalkingSeconds: riding.tramBoardingWalkingSeconds, section: { ...riding.section, durationSeconds: riding.section.durationSeconds + connection.arrival - riding.arrival, arrivalDateTime: connection.section.arrivalDateTime, toStopPointId: connection.section.toStopPointId, toStopAreaId: connection.section.toStopAreaId, toPoint: connection.section.toPoint, toName: connection.section.toName } };
}

/** One earliest-arrival tree answers every destination of the same origin/time/mode query. */
export async function scanConnections(
  connections: AsyncIterable<RoutingConnection | RoutingConnectionBatch>,
  access: Map<number, RoutingNode>,
  footpaths: { get(stop: number): Iterable<RoutingFootpath> | undefined },
  sameStopMargins: ReadonlyMap<number, number> = new Map(),
  transferRule?: (from: TransitArrival, to: RoutingConnection) => number | undefined,
  transferContext: (from: TransitArrival) => string = from => String(from.stop),
  limits: { arrival?: number; walkingSeconds?: number; feederWalkingSeconds?: number; feederTravelSeconds?: number } = {},
): Promise<ConnectionScanResult> {
  const labels = new Map(access), onTrip = new Map<string, Map<string, RoutingNode>>();
  const transitLabels = new Map<number, RoutingNode>(), nightLabels = new Map<number, Map<string, RoutingNode>>();
  const platformLabels = new Map<number, RoutingNode>();
  const tramLabels = new Map<number, Map<string, RoutingNode>>(), tramPlatformLabels = new Map<number, Map<string, RoutingNode>>();
  // Single-vehicle bus alternatives do not expand the transfer search tree.
  // Keep one first arrival per stop/line, even when another line arrives earlier.
  const feederLabels = new Map<number, Map<string, RoutingNode>>();
  const feederOnTrip = new Map<string, DirectFeederNode>();
  const stopsByLine = new Map<string, Set<number>>();
  const excludedFeederAccesses = new Map<string, ConnectionScanResult["excludedFeederAccesses"][number]>();
  const verifiedAccess = new WeakMap<RoutingNode, boolean>();
  function hasVerifiedWalkingAccess(node: RoutingNode): boolean {
    const cached = verifiedAccess.get(node);
    if (cached !== undefined) return cached;
    let current: RoutingNode | undefined = node;
    while (current) {
      if (current.section.timingSource === "estimated") { verifiedAccess.set(node, false); return false; }
      current = current.previous;
    }
    verifiedAccess.set(node, true);
    return true;
  }
  const boarding = new Map<number, Map<string, RoutingNode>>();
  const immediateAccessCache = new WeakMap<RoutingNode, RoutingNode>();
  const immediateAccess = (node: RoutingNode, mode: NearbyJourneySection["lineMode"]): RoutingNode => {
    if (mode !== "TRAM" && mode !== "CABLE") return node;
    const cached = immediateAccessCache.get(node);
    if (cached) return cached;
    if (node.previous || node.transferOrigin || !node.section.fromPoint || !node.section.toPoint) return node;
    const route = createImmediateTramWalkingRoute(node.section.fromPoint, node.section.toPoint, mode);
    if (!route) return node;
    const estimated: RoutingNode = { ...node, arrival: node.arrival - node.section.durationSeconds + route.durationSeconds, walkingSeconds: route.durationSeconds,
      section: { ...node.section, durationSeconds: route.durationSeconds, distanceMeters: route.distanceMeters, timingSource: "estimated",
        walkingProvider: route.provider, walkingDatasetVersion: undefined, walkingUnavailabilityReason: undefined } };
    immediateAccessCache.set(node, estimated);
    return estimated;
  };
  const compareBoardingWalk = (left: RoutingNode, right: RoutingNode) =>
    (left.tramBoardingWalkingSeconds ?? Infinity) - (right.tramBoardingWalkingSeconds ?? Infinity) || left.arrival - right.arrival;
  let scannedConnections = 0;
  const put = (stop: number, node: RoutingNode) => {
    let alternative = false;
    if (node.tramFeederLineId) {
      for (const target of node.section.type === "public_transport" ? [tramLabels, tramPlatformLabels] : [tramLabels]) {
        const lines = target.get(stop) ?? new Map<string, RoutingNode>();
        if (node.arrival < (lines.get(node.tramFeederLineId)?.arrival ?? Infinity)) {
          lines.set(node.tramFeederLineId, node); target.set(stop, lines); alternative = true;
        }
        const nearestKey = `${node.tramFeederLineId}:nearest`, nearest = lines.get(nearestKey);
        if (!nearest || compareBoardingWalk(node, nearest) < 0) {
          lines.set(nearestKey, node); target.set(stop, lines); alternative = true;
        }
      }
    }
    if (node.section.type === "public_transport" && node.arrival < (platformLabels.get(stop)?.arrival ?? Infinity)) {
      platformLabels.set(stop, node); alternative = true;
    }
    if (node.transferOrigin && node.arrival < (transitLabels.get(stop)?.arrival ?? Infinity)) { transitLabels.set(stop, node); alternative = true; }
    const lastTransit = node.section.type === "public_transport" ? node : node.previous;
    if (lastTransit?.section.lineMode === "NOCTILIEN") {
      const lines = nightLabels.get(stop) ?? new Map<string, RoutingNode>(), line = lastTransit.section.lineId!;
      if (node.arrival < (lines.get(line)?.arrival ?? Infinity)) { lines.set(line, node); nightLabels.set(stop, lines); alternative = true; }
    }
    const context = node.transferOrigin ? `${transferContext(node.transferOrigin)}:${node.tramFeederLineId ?? ""}` : "access";
    const contexts = boarding.get(stop) ?? new Map<string, RoutingNode>();
    const ready = (candidate: RoutingNode) => candidate.arrival + (candidate.transferOrigin?.stop === stop && candidate.section.type === "public_transport" ? Math.max(0, sameStopMargins.get(stop) ?? 120) : 0);
    if (node.tramFeederLineId) {
      const nearestContext = `${context}:nearest`, nearest = contexts.get(nearestContext);
      if (!nearest || compareBoardingWalk(node, nearest) < 0) {
        contexts.set(nearestContext, node); boarding.set(stop, contexts); alternative = true;
      }
    }
    if (contexts.has(context) && ready(contexts.get(context)!) <= ready(node)) return alternative;
    contexts.set(context, node); boarding.set(stop, contexts);
    if (node.arrival < (labels.get(stop)?.arrival ?? Infinity)) labels.set(stop, node);
    return true;
  };
  const relax = (stop: number, node: RoutingNode) => {
      // GTFS transfers already describe a complete change between platforms.
      // Chaining them would turn the transfer graph into an unrestricted walking network.
      for (const footpath of footpaths.get(stop) ?? []) {
        // A transfer minimum describes changing vehicles, not reaching a
        // platform from the street. Only explicit pathways may extend access.
        if (!node.transferOrigin && (footpath.allowsInitialAccess === false || footpath.section.transferDurationSource === "gtfs-minimum")) continue;
        if (footpath.seconds < 0) continue;
        const arrival = node.arrival + footpath.seconds;
        const walkingSeconds = (node.walkingSeconds ?? 0) + footpath.seconds;
        if (arrival > (limits.arrival ?? Infinity) || walkingSeconds > (limits.walkingSeconds ?? Infinity)) continue;
        const child = { previous: node, arrival, walkingSeconds, transferOrigin: node.transferOrigin, tramFeederLineId: node.tramFeederLineId, tramBoardingWalkingSeconds: node.tramBoardingWalkingSeconds, section: { ...footpath.section, durationSeconds: footpath.seconds } };
        put(footpath.to, child);
      }
  };
  for (const [stop, node] of access) { put(stop, node); relax(stop, node); }
  for await (const item of connections) {
    const batch: RoutingConnectionBatch = Array.isArray(item) ? item : [item as RoutingConnection];
    for (const connection of batch) {
      scannedConnections++;
      const servingLine = connection.routeId ?? connection.section.lineId;
      if (servingLine) {
        let stops = stopsByLine.get(servingLine);
        if (!stops) { stops = new Set(); stopsByLine.set(servingLine, stops); }
        stops.add(connection.from); stops.add(connection.to);
      }
      const busLike = connection.section.lineMode === "BUS" || connection.section.lineMode === "NOCTILIEN";
      const tramLike = connection.section.lineMode === "TRAM" || connection.section.lineMode === "CABLE";
      if (busLike || tramLike) {
        const ridingFeeder = feederOnTrip.get(connection.tripKey);
        let feeder: DirectFeederNode | undefined = ridingFeeder
          ? { ...continueTrip(ridingFeeder, connection), scoreSeconds: ridingFeeder.scoreSeconds + connection.arrival - ridingFeeder.arrival }
          : undefined;
        const rawAccess = boarding.get(connection.from)?.get("access");
        const walkingAccess = rawAccess ? immediateAccess(rawAccess, connection.section.lineMode) : undefined;
        const walkingSeconds = walkingAccess?.walkingSeconds ?? walkingAccess?.section.durationSeconds ?? 0;
        if (connection.pickup === 0 && walkingAccess && !walkingAccess.transferOrigin && walkingAccess.arrival <= connection.departure
          && walkingSeconds <= (limits.feederWalkingSeconds ?? Infinity) && busLike && !hasVerifiedWalkingAccess(walkingAccess)) {
          const key = `${connection.section.lineId}:${connection.from}`;
          if (!excludedFeederAccesses.has(key)) excludedFeederAccesses.set(key, { lineId: connection.section.lineId, lineCode: connection.section.lineCode,
            stopId: connection.section.fromStopPointId, stopName: connection.section.fromName, walkingSeconds,
            reason: walkingAccess.section.walkingUnavailabilityReason ?? "unverified-walking" });
        }
        if (connection.pickup === 0 && walkingAccess && !walkingAccess.transferOrigin && walkingAccess.arrival <= connection.departure
          && (!busLike || hasVerifiedWalkingAccess(walkingAccess))
          && walkingSeconds <= (limits.feederWalkingSeconds ?? Infinity)) {
          const scoreSeconds = walkingSeconds + connection.arrival - connection.departure;
          if (!feeder || scoreSeconds < feeder.scoreSeconds) {
            const previous: RoutingNode = walkingAccess.arrival < connection.departure
              ? { previous: walkingAccess, arrival: connection.departure, section: { type: "waiting", durationSeconds: connection.departure - walkingAccess.arrival } }
              : walkingAccess;
            feeder = { previous, arrival: connection.arrival, section: connection.section, scoreSeconds };
          }
        }
        if (feeder) {
          feederOnTrip.set(connection.tripKey, feeder);
          const line = connection.routeId ?? connection.section.lineId;
          if (line && connection.dropOff === 0 && feeder.arrival <= (limits.arrival ?? Infinity)
            && feeder.scoreSeconds <= (limits.feederTravelSeconds ?? Infinity)) {
            const lines = feederLabels.get(connection.to) ?? new Map<string, RoutingNode>();
            const current = lines.get(line) as DirectFeederNode | undefined;
            if (!current || feeder.arrival < current.arrival || feeder.arrival === current.arrival && feeder.scoreSeconds < current.scoreSeconds) {
              lines.set(line, feeder); feederLabels.set(connection.to, lines);
            }
          }
        }
        if (connection.last) feederOnTrip.delete(connection.tripKey);
      }
      const riding = onTrip.get(connection.tripKey) ?? new Map<string, RoutingNode>();
      const predecessors = new Map(riding);
      if (connection.pickup === 0) for (const rawCandidate of boarding.get(connection.from)?.values() ?? []) {
        const candidate = immediateAccess(rawCandidate, connection.section.lineMode);
        const origin = candidate.transferOrigin;
        const margin = origin ? (transferRule?.(origin, connection) ?? (origin.stop === connection.from ? sameStopMargins.get(connection.from) ?? 120 : 0)) : 0;
        if (margin < 0 || candidate.arrival > connection.departure || origin && origin.arrival + margin > connection.departure) continue;
        const feeder = candidate.tramFeederLineId ?? (!origin && tramLike ? connection.section.lineId : undefined) ?? "";
        const boardingCandidate = feeder && !candidate.tramFeederLineId
          ? { ...candidate, tramFeederLineId: feeder, tramBoardingWalkingSeconds: candidate.walkingSeconds ?? 0 } : candidate;
        for (const key of feeder ? [feeder, `${feeder}:nearest`] : [""]) {
          const previous = predecessors.get(key), nearest = key.endsWith(":nearest");
          if (!previous || (nearest ? compareBoardingWalk(boardingCandidate, previous) < 0
            : !riding.has(key) && boardingCandidate.arrival < previous.arrival)) predecessors.set(key, boardingCandidate);
        }
      }
      const nextRiding = new Map<string, RoutingNode>();
      for (const [feeder, predecessor] of predecessors) {
        if (predecessor.arrival > connection.departure) continue;
        let previous = predecessor;
        const continuing = riding.get(feeder) === predecessor;
        if (!continuing && previous.arrival < connection.departure) previous = {
          previous, arrival: connection.departure,
          section: { type: "waiting", durationSeconds: connection.departure - previous.arrival },
        };
        const node: RoutingNode = continuing
          ? continueTrip(predecessor, connection)
          : { previous, arrival: connection.arrival, walkingSeconds: predecessor.walkingSeconds, section: connection.section,
            tramFeederLineId: predecessor.tramFeederLineId, tramBoardingWalkingSeconds: predecessor.tramBoardingWalkingSeconds };
        node.transferOrigin = { stop: connection.to, arrival: connection.arrival, routeId: connection.routeId, tripId: connection.tripId };
        nextRiding.set(feeder, node);
        if (connection.dropOff === 0 && put(connection.to, node)) relax(connection.to, node);
      }
      onTrip.set(connection.tripKey, nextRiding);
      if (connection.last) onTrip.delete(connection.tripKey);
    }
  }
  return { labels, transitLabels, platformLabels, tramLabels, tramPlatformLabels, nightLabels, feederLabels, stopsByLine, accessLabels: access, scannedConnections, excludedFeederAccesses: [...excludedFeederAccesses.values()] };
}

export function routingSections(node: RoutingNode): NearbyJourneySection[] {
  const reversed: NearbyJourneySection[] = [];
  for (let next: RoutingNode | undefined = node; next; next = next.previous) reversed.push(next.section);
  const sections: NearbyJourneySection[] = [];
  for (const section of reversed.reverse()) {
    const last = sections.at(-1);
    // Dwell waits are part of the same vehicle leg, not a transfer.
    if (section.type === "waiting" && last?.vehicleJourneyId) { sections.push(section); continue; }
    const dwell = last?.type === "waiting" ? sections.at(-2) : undefined;
    const preceding = dwell ?? last;
    if (section.vehicleJourneyId && preceding?.vehicleJourneyId === section.vehicleJourneyId) {
      if (dwell) sections.pop();
      preceding.durationSeconds += section.durationSeconds + (dwell ? last!.durationSeconds : 0);
      preceding.arrivalDateTime = section.arrivalDateTime;
      preceding.toStopPointId = section.toStopPointId; preceding.toStopAreaId = section.toStopAreaId;
      preceding.toPoint = section.toPoint; preceding.toName = section.toName;
    } else sections.push({ ...section });
  }
  return sections;
}
