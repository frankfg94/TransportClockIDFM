import type { NearbyJourneySection } from "../../../src/features/nearby-stations/nearbyHeavyTransports";

export interface TransitArrival { stop: number; arrival: number; routeId?: string; tripId?: string }
export interface RoutingNode { previous?: RoutingNode; section: NearbyJourneySection; arrival: number; transferOrigin?: TransitArrival; walkingSeconds?: number }
export interface RoutingConnection {
  from: number; to: number; departure: number; arrival: number; tripKey: string;
  pickup: number; dropOff: number; section: NearbyJourneySection;
  last?: boolean;
  routeId?: string; tripId?: string;
}
export interface RoutingFootpath { to: number; seconds: number; section: NearbyJourneySection }
export interface ConnectionScanResult { labels: Map<number, RoutingNode>; transitLabels: Map<number, RoutingNode>; platformLabels: Map<number, RoutingNode>; nightLabels: Map<number, Map<string, RoutingNode>>; scannedConnections: number }

/** One earliest-arrival tree answers every destination of the same origin/time/mode query. */
export async function scanConnections(
  connections: AsyncIterable<RoutingConnection>,
  access: Map<number, RoutingNode>,
  footpaths: { get(stop: number): Iterable<RoutingFootpath> | undefined },
  sameStopMargins: ReadonlyMap<number, number> = new Map(),
  transferRule?: (from: TransitArrival, to: RoutingConnection) => number | undefined,
  transferContext: (from: TransitArrival) => string = from => String(from.stop),
  limits: { arrival?: number; walkingSeconds?: number } = {},
): Promise<ConnectionScanResult> {
  const labels = new Map(access), onTrip = new Map<string, RoutingNode>();
  const transitLabels = new Map<number, RoutingNode>(), nightLabels = new Map<number, Map<string, RoutingNode>>();
  const platformLabels = new Map<number, RoutingNode>();
  const boarding = new Map<number, Map<string, RoutingNode>>();
  let scannedConnections = 0;
  const put = (stop: number, node: RoutingNode) => {
    let alternative = false;
    if (node.section.type === "public_transport" && node.arrival < (platformLabels.get(stop)?.arrival ?? Infinity)) {
      platformLabels.set(stop, node); alternative = true;
    }
    if (node.transferOrigin && node.arrival < (transitLabels.get(stop)?.arrival ?? Infinity)) { transitLabels.set(stop, node); alternative = true; }
    const lastTransit = node.section.type === "public_transport" ? node : node.previous;
    if (lastTransit?.section.lineMode === "NOCTILIEN") {
      const lines = nightLabels.get(stop) ?? new Map<string, RoutingNode>(), line = lastTransit.section.lineId!;
      if (node.arrival < (lines.get(line)?.arrival ?? Infinity)) { lines.set(line, node); nightLabels.set(stop, lines); alternative = true; }
    }
    const context = node.transferOrigin ? transferContext(node.transferOrigin) : "access";
    const contexts = boarding.get(stop) ?? new Map<string, RoutingNode>();
    const ready = (candidate: RoutingNode) => candidate.arrival + (candidate.transferOrigin?.stop === stop && candidate.section.type === "public_transport" ? Math.max(0, sameStopMargins.get(stop) ?? 120) : 0);
    if (contexts.has(context) && ready(contexts.get(context)!) <= ready(node)) return alternative;
    contexts.set(context, node); boarding.set(stop, contexts);
    if (node.arrival < (labels.get(stop)?.arrival ?? Infinity)) labels.set(stop, node);
    return true;
  };
  const relax = (stop: number, node: RoutingNode) => {
      // GTFS transfers already describe a complete change between platforms.
      // Chaining them would turn the transfer graph into an unrestricted walking network.
      for (const footpath of footpaths.get(stop) ?? []) {
        if (footpath.seconds < 0) continue;
        const arrival = node.arrival + footpath.seconds;
        const walkingSeconds = (node.walkingSeconds ?? 0) + footpath.seconds;
        if (arrival > (limits.arrival ?? Infinity) || walkingSeconds > (limits.walkingSeconds ?? Infinity)) continue;
        const child = { previous: node, arrival, walkingSeconds, transferOrigin: node.transferOrigin, section: { ...footpath.section, durationSeconds: footpath.seconds } };
        put(footpath.to, child);
      }
  };
  for (const [stop, node] of access) { put(stop, node); relax(stop, node); }
  for await (const connection of connections) {
    scannedConnections++;
    const riding = onTrip.get(connection.tripKey);
    let previous = riding;
    if (!previous && connection.pickup === 0) for (const candidate of boarding.get(connection.from)?.values() ?? []) {
      const origin = candidate.transferOrigin;
      const margin = origin ? (transferRule?.(origin, connection) ?? (origin.stop === connection.from ? sameStopMargins.get(connection.from) ?? 120 : 0)) : 0;
      if (margin < 0 || candidate.arrival > connection.departure || origin && origin.arrival + margin > connection.departure) continue;
      if (!previous || candidate.arrival < previous.arrival) previous = candidate;
    }
    if (!previous || previous.arrival > connection.departure) continue;
    if (!riding && previous.arrival < connection.departure) previous = {
      previous, arrival: connection.departure,
      section: { type: "waiting", durationSeconds: connection.departure - previous.arrival },
    };
    const node: RoutingNode = riding
      ? { previous: riding.previous, arrival: connection.arrival, section: { ...riding.section, durationSeconds: riding.section.durationSeconds + connection.arrival - riding.arrival, arrivalDateTime: connection.section.arrivalDateTime, toStopPointId: connection.section.toStopPointId, toStopAreaId: connection.section.toStopAreaId, toPoint: connection.section.toPoint, toName: connection.section.toName } }
      : { previous, arrival: connection.arrival, section: connection.section };
    node.transferOrigin = { stop: connection.to, arrival: connection.arrival, routeId: connection.routeId, tripId: connection.tripId };
    onTrip.set(connection.tripKey, node);
    if (connection.last) onTrip.delete(connection.tripKey);
    if (connection.dropOff !== 0 || !put(connection.to, node)) continue;
    relax(connection.to, node);
  }
  return { labels, transitLabels, platformLabels, nightLabels, scannedConnections };
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
