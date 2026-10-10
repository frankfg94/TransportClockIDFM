import type { H3Event } from "h3";
import { gunzipSync } from "fflate";
import type { NearbyJourney, NearbyJourneyPoint, NearbyJourneySection } from "../../../src/features/nearby-stations/nearbyHeavyTransports";
import type { NeighborhoodJourneysRequest, NeighborhoodJourneysResponse } from "../../../src/features/nearby-stations/neighborhoodJourneys";
import { haversineMeters, createStraightLineWalkingRoute } from "../../../src/features/nearby-stations/nearbyWalkingRoutes";
import { matrixWalkingWithOpenRouteService } from "../walking/openRouteService";
import { getGtfsManifest, isGtfsEnabled, readGtfsJson, getGtfsRuntimeCacheEpoch } from "./runtime";
import { isGtfsServiceActive, shiftGtfsDate } from "./timetableCalendar";
import type { GtfsManifest } from "./types";
import { CONNECTION_COLUMNS, type GtfsRoutingIndex, type GtfsRoutingShard } from "./routingTypes";
import { scanConnections, routingSections, type RoutingConnection, type RoutingNode, type RoutingFootpath, type ConnectionScanResult, type TransitArrival } from "./connectionScan";
import { gtfsServiceEpoch, parisCivilEpoch, parisDateTime } from "./routingTime";

export const NEIGHBORHOOD_ROUTING_HORIZON_SECONDS = 4 * 3600;
const WALK_RADIUS_METERS = 1200;
let indexCache: { key: string; promise: Promise<GtfsRoutingIndex | undefined> } | undefined;
const trees = new Map<string, { expires: number; promise: Promise<ConnectionScanResult> }>();

function coordinate(stop: GtfsRoutingIndex["stops"][number]): NearbyJourneyPoint | undefined {
  return Number.isFinite(stop.lon) && Number.isFinite(stop.lat) ? { lon: stop.lon!, lat: stop.lat! } : undefined;
}
function walkingSection(from: NearbyJourneyPoint, to: NearbyJourneyPoint, seconds: number, estimated = false): NearbyJourneySection {
  return { type: "walking", mode: "walking", durationSeconds: seconds, timingSource: estimated ? "estimated" : "schedule", fromPoint: from, toPoint: to };
}
const transferGraphs = new WeakMap<GtfsRoutingIndex, ReturnType<typeof buildFootpaths>>();
function buildFootpaths(index: GtfsRoutingIndex) {
  const offsets = new Uint32Array(index.stops.length + 1);
  for (const [from] of index.transfers) offsets[from + 1]!++;
  for (let i = 1; i < offsets.length; i++) offsets[i]! += offsets[i - 1]!;
  const edges = new Int32Array(index.transfers.length * 2), pathwayEdges = new Uint8Array(index.transfers.length);
  const pathwayIndices = new Set(index.pathwayTransferIndices ?? []), cursor = offsets.slice(), margins = new Map<number, number>();
  const forbidden = new Map<string, number>(), restrictedOrigins = new Set<number>();
  const minimumTransfers = new Map<string, number>();
  for (const [ordinal, [from, to, seconds]] of index.transfers.entries()) {
    const position = cursor[from]!++ * 2; edges[position] = to; edges[position + 1] = seconds;
    pathwayEdges[position / 2] = Number(pathwayIndices.has(ordinal));
    if (!pathwayIndices.has(ordinal)) minimumTransfers.set(`${from}:${to}`, seconds);
    if (from === to) margins.set(from, seconds);
    if (seconds < 0) { forbidden.set(`${from}:${to}`, -1); restrictedOrigins.add(from); }
  }
  const parents = new Map<string, number[]>();
  for (const i of index.boardingStops) {
    const stop = index.stops[i]!;
    if (!stop.parentId) continue;
    const group = parents.get(stop.parentId) ?? []; group.push(i); parents.set(stop.parentId, group);
  }
  const byStop = new Map<number, typeof index.scopedTransfers>();
  for (const rule of index.scopedTransfers) { const list = byStop.get(rule.from) ?? []; list.push(rule); byStop.set(rule.from, list); }
  const scopedTrips = new Set(index.scopedTransfers.flatMap(rule => rule.fromTrip ? [rule.fromTrip] : []));
  const scopedRoutes = new Set(index.scopedTransfers.flatMap(rule => rule.fromRoute ? [rule.fromRoute] : []));
  const paths = { get(from: number): Iterable<RoutingFootpath> {
    return (function* () {
      const a = coordinate(index.stops[from]!); if (!a) return;
      const seen = new Set<number>();
      const path = (to: number, seconds: number, estimated: boolean, minimum = !estimated): RoutingFootpath => ({
        to, seconds, get section() { return {
          ...walkingSection(a, coordinate(index.stops[to]!)!, seconds, estimated),
          fromStopPointId: index.stops[from]!.id, toStopPointId: index.stops[to]!.id,
          fromStopAreaId: index.stops[from]!.parentId, toStopAreaId: index.stops[to]!.parentId,
          ...(minimum ? { transferDurationSource: "gtfs-minimum" as const } : {}),
        }; },
      });
      for (let i = offsets[from]!; i < offsets[from + 1]!; i++) {
        const to = edges[i * 2]!, seconds = edges[i * 2 + 1]!;
        seen.add(to);
        if (to === from || !coordinate(index.stops[to]!)) continue;
        // A route/trip-specific permission can override a generic prohibition.
        // Boarding still checks the matching rule against the actual two trips.
        const permitted = (byStop.get(from) ?? []).filter(rule => rule.to === to && rule.seconds >= 0);
        const duration = seconds >= 0 ? seconds : permitted.length ? Math.min(...permitted.map(rule => rule.seconds)) : -1;
        if (duration >= 0) yield path(to, duration, false, !pathwayEdges[i]);
      }
      for (const rule of byStop.get(from) ?? []) if (rule.to !== from && rule.seconds >= 0 && !seen.has(rule.to) && coordinate(index.stops[rule.to]!)) {
        seen.add(rule.to); yield path(rule.to, rule.seconds, false);
      }
      for (const to of parents.get(index.stops[from]!.parentId ?? "") ?? []) {
        if (to === from || seen.has(to)) continue;
        const b = coordinate(index.stops[to]!);
        if (b) yield path(to, Math.ceil(haversineMeters(a, b) / (80 / 60)) + 120, true);
      }
    })();
  } };
  const context = (from: TransitArrival) => byStop.has(from.stop) || restrictedOrigins.has(from.stop)
    ? `${from.stop}:${scopedRoutes.has(from.routeId ?? "") ? from.routeId : ""}:${scopedTrips.has(from.tripId ?? "") ? from.tripId : ""}` : "transfer";
  const transferRule = (from: TransitArrival, to: RoutingConnection) => {
    let selected: number | undefined, specificity = -1;
    for (const rule of byStop.get(from.stop) ?? []) {
      if (rule.to !== to.from || rule.fromRoute && rule.fromRoute !== from.routeId || rule.toRoute && rule.toRoute !== to.routeId || rule.fromTrip && rule.fromTrip !== from.tripId || rule.toTrip && rule.toTrip !== to.tripId) continue;
      const rank = (rule.fromTrip || rule.toTrip ? 4 : 0) + (rule.fromRoute ? 1 : 0) + (rule.toRoute ? 1 : 0);
      if (rank > specificity || rank === specificity && rule.seconds === -1) { specificity = rank; selected = rule.seconds; }
    }
    return selected ?? minimumTransfers.get(`${from.stop}:${to.from}`) ?? forbidden.get(`${from.stop}:${to.from}`);
  };
  return { paths, margins, transferRule, context };
}

function nearbyStops(index: GtfsRoutingIndex, point: NearbyJourneyPoint, limit: number) {
  const candidates: Array<{ id: number; point: NearbyJourneyPoint; distance: number }> = [];
  for (const id of index.boardingStops) {
    const stop = index.stops[id]!;
    if (stop.lat === undefined || stop.lon === undefined || Math.abs(stop.lat - point.lat) > .012 || Math.abs(stop.lon - point.lon) > .02) continue;
    const position = coordinate(stop)!;
    const distance = haversineMeters(point, position);
    if (distance <= WALK_RADIUS_METERS) candidates.push({ id, point: position, distance });
  }
  return candidates.sort((a, b) => a.distance - b.distance || a.id - b.id).slice(0, limit);
}

async function* dayConnections(event: H3Event | undefined, manifest: GtfsManifest, index: GtfsRoutingIndex, day: string, start: number, end: number, modes: NeighborhoodJourneysRequest["allowedModes"]): AsyncGenerator<RoutingConnection> {
  const anchor = gtfsServiceEpoch(day);
  const active = index.services.map(service => isGtfsServiceActive(service, day));
  if (!active.some(Boolean)) return;
  const hours = Object.keys(index.hours).map(Number).filter(hour => anchor + (hour + 1) * 3600 > start && anchor + hour * 3600 <= end).sort((a, b) => a - b);
  for (const hour of hours) for (const filename of index.hours[String(hour)]!) {
    if (!/^\d+-\d+\.json$/u.test(filename)) throw new Error("Invalid GTFS routing shard path");
    const shard = (await readGtfsJson<GtfsRoutingShard>(event, `${manifest.routing!.path}/${filename}`)).value;
    if (!shard || shard.schemaVersion !== 1 || shard.encoding !== "gzip-base64-u32le" || shard.count > 65_536 || shard.count < 0) throw new Error("GTFS routing shard unavailable");
    const compressed = Uint8Array.from(atob(shard.data), c => c.charCodeAt(0));
    const binary = gunzipSync(compressed);
    if (binary.length !== shard.count * CONNECTION_COLUMNS * 4) throw new Error("Invalid GTFS routing shard length");
    const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    const tripNames = new Map(shard.trips.map(([id, name, headsign]) => [id, { name, headsign }]));
    for (let i = 0; i < shard.count; i++) {
      const value = (column: number) => view.getUint32((i * CONNECTION_COLUMNS + column) * 4, true);
      if (!active[value(5)]) continue;
      const line = index.lines[value(6)];
      if (!line || modes?.length && !modes.includes(line.mode)) continue;
      const departure = anchor + value(2), arrival = anchor + value(3);
      if (departure < start || departure > end) continue;
      const from = value(0), to = value(1), flags = value(7), trip = tripNames.get(value(4));
      if (!index.stops[from] || !index.stops[to] || !trip || arrival < departure) throw new Error("Invalid GTFS connection");
      let section: NearbyJourneySection | undefined;
      yield { from, to, departure, arrival, routeId: line.id, tripId: trip.name, tripKey: `${day}:${value(4)}`, pickup: flags & 3, dropOff: (flags >> 2) & 3, last: Boolean(flags & 16),
        get section() { return section ??= { type: "public_transport", timingSource: "schedule", mode: line.mode.toLowerCase(), lineMode: line.mode, lineId: line.id, lineCode: line.code, lineColor: line.color,
          durationSeconds: arrival - departure,
          vehicleJourneyId: `${day}:${trip.name}`, direction: trip.headsign, mission: trip.headsign, fromStopPointId: index.stops[from]!.id, toStopPointId: index.stops[to]!.id,
          fromStopAreaId: index.stops[from]!.parentId, toStopAreaId: index.stops[to]!.parentId,
          fromName: index.stops[from]!.name, toName: index.stops[to]!.name, fromPoint: coordinate(index.stops[from]!), toPoint: coordinate(index.stops[to]!) }; } };
    }
  }
}

async function* connections(event: H3Event | undefined, manifest: GtfsManifest, index: GtfsRoutingIndex, serviceDate: string, start: number, modes: NeighborhoodJourneysRequest["allowedModes"]) {
  const iterators: AsyncGenerator<RoutingConnection>[] = [];
  const lookback = Math.floor(index.maxTimeSeconds / 86400);
  for (let delta = -lookback; delta <= 1; delta++) {
    const day = shiftGtfsDate(serviceDate, delta);
    if (day < manifest.routing!.startDate || day > manifest.routing!.endDate) continue;
    iterators.push(dayConnections(event, manifest, index, day, start, start + NEIGHBORHOOD_ROUTING_HORIZON_SECONDS, modes));
  }
  const heads = await Promise.all(iterators.map(it => it.next()));
  while (true) {
    let best = -1;
    for (let i = 0; i < heads.length; i++) if (!heads[i]!.done && (best < 0 || heads[i]!.value.departure < heads[best]!.value.departure)) best = i;
    if (best < 0) break;
    yield heads[best]!.value; heads[best] = await iterators[best]!.next();
  }
}

export async function routeNeighborhoodJourneys(event: H3Event | undefined, request: NeighborhoodJourneysRequest): Promise<NeighborhoodJourneysResponse> {
  const epoch = parisCivilEpoch(request.datetime), start = epoch / 1000, serviceDate = request.datetime.slice(0, 8);
  const manifest = await getGtfsManifest(event);
  const base: NeighborhoodJourneysResponse = { source: "gtfs", serviceDate, searchHorizonSeconds: NEIGHBORHOOD_ROUTING_HORIZON_SECONDS, datasetVersion: manifest?.datasetVersion, routingPath: manifest?.routing?.path, destinations: [] };
  const unavailable = (status: "missing" | "out-of-coverage") => ({ ...base, destinations: request.destinations.map(d => ({ id: d.id, status, journeys: [] })) });
  if (!isGtfsEnabled(event) || !manifest?.routing || manifest.routing.schemaVersion !== 1 || !/^routing\/v1\/[a-f0-9]{64}\/[a-zA-Z0-9-]+$/u.test(manifest.routing.path)) return unavailable("missing");
  const versionKey = `${getGtfsRuntimeCacheEpoch()}:${manifest.routing.path}:${manifest.cacheGeneration}`;
  if (indexCache?.key !== versionKey) {
    trees.clear();
    indexCache = { key: versionKey, promise: readGtfsJson<GtfsRoutingIndex>(event, `${manifest.routing.path}/index.json`).then(r => r.value) };
  }
  const index = await indexCache.promise;
  if (!index || index.schemaVersion !== 1 || !index.stops.length || !index.lines.length) { indexCache = undefined; return unavailable("missing"); }
  if (serviceDate < manifest.routing.startDate || serviceDate > shiftGtfsDate(manifest.routing.endDate, Math.floor(index.maxTimeSeconds / 86400))) return unavailable("out-of-coverage");
  const key = JSON.stringify([versionKey, request.origin.lon, request.origin.lat, request.datetime, [...(request.allowedModes ?? [])].sort()]);
  for (const [k, value] of trees) if (value.expires <= Date.now()) trees.delete(k);
  let entry = trees.get(key);
  const cacheHit = Boolean(entry), calculationStart = performance.now();
  if (!entry) {
    const promise = (async () => {
      const nearby = nearbyStops(index, request.origin, 64);
      const routes = event ? await matrixWalkingWithOpenRouteService(event, request.origin, nearby.map(s => ({ ...s.point, id: String(s.id) }))) : nearby.map(s => createStraightLineWalkingRoute(request.origin, s.point, String(s.id)));
      const access = new Map<number, RoutingNode>();
      for (const route of routes) {
        if (route.durationSeconds > 20 * 60) continue;
        const id = Number(route.id), point = coordinate(index.stops[id]!);
        if (!point) continue;
        access.set(id, { arrival: start + route.durationSeconds, walkingSeconds: route.durationSeconds, section: walkingSection(request.origin, point, route.durationSeconds, route.fallback) });
      }
      let graph = transferGraphs.get(index);
      if (!graph) { graph = buildFootpaths(index); transferGraphs.set(index, graph); index.transfers = []; }
      const { paths, margins, transferRule, context } = graph;
      return scanConnections(connections(event, manifest, index, serviceDate, start, request.allowedModes), access, paths, margins, transferRule, context,
        { arrival: start + NEIGHBORHOOD_ROUTING_HORIZON_SECONDS, walkingSeconds: 1200 });
    })();
    entry = { expires: Date.now() + 10 * 60_000, promise };
    trees.set(key, entry);
    while (trees.size > 2) trees.delete(trees.keys().next().value!);
    promise.catch(() => { if (trees.get(key)?.promise === promise) trees.delete(key); });
  }
  const tree = await entry.promise;
  base.diagnostics = { scannedConnections: tree.scannedConnections, calculationMs: Math.round(performance.now() - calculationStart), cacheHit };
  base.destinations = await Promise.all(request.destinations.map(async destination => {
    const officialRef = destination.destinationRef?.replace(/^(stop_area|stop_point):/u, "");
    const officialStops = officialRef ? index.boardingStops.filter(id => index.stops[id]!.id === officialRef || index.stops[id]!.parentId === officialRef) : [];
    const platformArrival = destination.arrivalAtPlatform === true && officialStops.length > 0;
    const candidates = (officialStops.length ? officialStops.map(id => ({ id, point: coordinate(index.stops[id]!)! })).filter(s => Boolean(s.point)) : nearbyStops(index, destination, 32))
      .filter(s => (platformArrival ? tree.platformLabels : tree.labels).has(s.id))
      .sort((a, b) => (platformArrival ? tree.platformLabels : tree.labels).get(a.id)!.arrival - (platformArrival ? tree.platformLabels : tree.labels).get(b.id)!.arrival).slice(0, 16);
    // Matrix is directed: egress walks from each stop towards the destination.
    const egress = platformArrival ? [] : event ? await matrixWalkingWithOpenRouteService(event, destination, candidates.map(c => ({ ...c.point, id: String(c.id) })), { reverse: true }) : candidates.map(c => createStraightLineWalkingRoute(c.point, destination));
    const routes: RoutingNode[] = candidates.flatMap((candidate, i) => {
      if (platformArrival) {
        return [tree.platformLabels.get(candidate.id), ...(tree.nightLabels.get(candidate.id)?.values() ?? [])]
          .filter((node): node is RoutingNode => Boolean(node && node.section.type === "public_transport"));
      }
      const route = egress[i]!;
      if (route.durationSeconds > 20 * 60) return [];
      const alternatives = [tree.labels.get(candidate.id), tree.transitLabels.get(candidate.id), ...(tree.nightLabels.get(candidate.id)?.values() ?? [])].filter((node): node is RoutingNode => Boolean(node));
      return alternatives.map(previous => ({ previous, arrival: previous.arrival + route.durationSeconds,
        section: { ...walkingSection(candidate.point, destination, route.durationSeconds, route.fallback),
          fromStopPointId: index.stops[candidate.id]!.id, fromStopAreaId: index.stops[candidate.id]!.parentId } } satisfies RoutingNode));
    });
    const direct = createStraightLineWalkingRoute(request.origin, destination);
    // A direct walk is only offered for a genuinely nearby target, and is explicitly estimated.
    if (direct.distanceMeters <= WALK_RADIUS_METERS) {
      const route = event ? (await matrixWalkingWithOpenRouteService(event, request.origin, [{ ...destination, id: destination.id }]))[0]! : direct;
      if (route.durationSeconds <= 20 * 60) routes.push({ arrival: start + route.durationSeconds, section: walkingSection(request.origin, destination, route.durationSeconds, route.fallback) });
    }
    const sorted = routes.filter(node => node.arrival <= start + NEIGHBORHOOD_ROUTING_HORIZON_SECONDS).sort((a, b) => a.arrival - b.arrival);
    const signatures = new Set<string>(), journeys: NearbyJourney[] = [];
    for (const node of sorted) {
      const sections = routingSections(node);
      const signature = sections.filter(s => s.type === "public_transport").map(s => s.lineId).join(":");
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      let time = start;
      for (const section of sections) { section.departureDateTime = parisDateTime(time * 1000); time += section.durationSeconds; section.arrivalDateTime = parisDateTime(time * 1000); }
      const partial = Boolean(officialRef && !officialStops.length) || index.hasConditionalService || sections.some(s => s.timingSource === "estimated");
      journeys.push({ id: `gtfs:${manifest.routing!.path}:${destination.id}:${node.arrival}:${signature}`, status: partial ? "partial" : "theoretical", source: "gtfs", datasetVersion: manifest.datasetVersion, durationSeconds: node.arrival - start, departureDateTime: request.datetime, arrivalDateTime: parisDateTime(node.arrival * 1000), transferCount: Math.max(0, sections.filter(s => s.type === "public_transport").length - 1), sections });
      if (journeys.length === 8) break;
    }
    return { id: destination.id, status: !journeys.length ? "outside-search-window" as const : journeys.some(j => j.status === "partial") ? "partial" as const : "ready" as const, journeys };
  }));
  return base;
}
