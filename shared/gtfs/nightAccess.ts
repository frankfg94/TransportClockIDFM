import type { GtfsTimetableLoadResult } from "./timetableTypes";
import type { NearbyJourney, NearbyJourneyPoint, NearbyJourneySection } from "../../src/features/nearby-stations/nearbyHeavyTransports";
import { haversineMeters, type NearbyWalkingMatrixDestination, type NearbyWalkingRoute } from "../../src/features/nearby-stations/nearbyWalkingRoutes";
import { gtfsServiceEpoch, parisCivilEpoch, parisDateTime } from "./routingTime";
import { NEIGHBORHOOD_ROUTING_HORIZON_SECONDS } from "./routing";

export const NIGHT_ACCESS_RADIUS_METERS = 2500;
export interface NightAccessRequest {
  origin: NearbyJourneyPoint;
  datetime: string;
  lines: { id: string; code: string }[];
}
export interface NightAccessResult {
  journeys: NearbyJourney[];
  status: "ready" | "partial";
  linesExamined: number;
  walkingStops: number;
}

/** Access to a night bus is a walk to its boarding stop, not a journey TO a
 * nearby stop. Read real active departures (including yesterday's >24:00
 * service), then retain the shortest documented access for each direction.
 * This independent calculation never executes the network connection scan. */
export async function resolveNightAccess(request: NightAccessRequest, runtime: {
  loadLine: (lineId: string, date: string) => Promise<GtfsTimetableLoadResult>;
  matrix: (origin: NearbyJourneyPoint, destinations: NearbyWalkingMatrixDestination[]) => Promise<NearbyWalkingRoute[]>;
  assertCurrent: () => void;
}): Promise<NightAccessResult> {
  const start = parisCivilEpoch(request.datetime) / 1000;
  const date = request.datetime.slice(0, 8);
  const civilDay = (value: string) => Date.UTC(+value.slice(0, 4), +value.slice(4, 6) - 1, +value.slice(6, 8)) / 86400000;
  // The timetable loader subtracts whole calendar days from spillover calls.
  // Restore their own service-day epoch, including daylight-saving changes.
  const tripEpoch = (serviceDate: string) => gtfsServiceEpoch(serviceDate) + (civilDay(date) - civilDay(serviceDate)) * 86400;
  const loaded: { line: NightAccessRequest["lines"][number]; timetable: GtfsTimetableLoadResult }[] = [];
  const stops = new Map<string, NearbyWalkingMatrixDestination>();
  let partial = false;
  for (const line of request.lines) {
    runtime.assertCurrent();
    const timetable = await runtime.loadLine(line.id, date);
    if (timetable.status !== "ready" || !timetable.index) { partial = true; continue; }
    loaded.push({ line, timetable });
    const served = new Set(timetable.trips.flatMap(trip => {
      const epoch = tripEpoch(trip.serviceDate);
      return trip.calls.filter(call => call.pickupType === 0 && call.departure !== null && epoch + call.departure >= start
        && epoch + call.departure <= start + NEIGHBORHOOD_ROUTING_HORIZON_SECONDS).map(call => call.stopId);
    }));
    for (const stop of timetable.index.stops) {
      if (!served.has(stop.id) || !Number.isFinite(stop.lon) || !Number.isFinite(stop.lat)) continue;
      const point = { id: stop.id, lon: stop.lon!, lat: stop.lat! };
      if (haversineMeters(request.origin, point) <= NIGHT_ACCESS_RADIUS_METERS) stops.set(stop.id, point);
    }
  }
  const walks = new Map<string, NearbyWalkingRoute>(), points = [...stops.values()];
  for (let i = 0; i < points.length; i += 64) {
    runtime.assertCurrent();
    for (const walk of await runtime.matrix(request.origin, points.slice(i, i + 64))) if (walk.id) walks.set(walk.id, walk);
  }
  runtime.assertCurrent();
  const best = new Map<string, { walking: number; departure: number; journey: NearbyJourney }>();
  for (const { line, timetable } of loaded) {
    const byId = new Map(timetable.index!.stops.map(stop => [stop.id, stop]));
    for (const trip of timetable.trips) for (let i = 0; i + 1 < trip.calls.length; i++) {
      const from = trip.calls[i]!, to = trip.calls.slice(i + 1).find(call => call.dropOffType === 0 && call.arrival !== null);
      const epoch = tripEpoch(trip.serviceDate);
      const walk = walks.get(from.stopId), departure = from.departure === null ? null : epoch + from.departure;
      const arrivalSeconds = to?.arrival === null || to?.arrival === undefined ? undefined : epoch + to.arrival;
      if (!walk || walk.fallback || walk.provider === "straight-line") { if (walk) partial = true; continue; }
      if (!Number.isFinite(walk.durationSeconds) || walk.durationSeconds < 0 || walk.durationSeconds >= 15 * 60
        || from.pickupType !== 0 || departure === null || departure < start + walk.durationSeconds
        || !to || arrivalSeconds === undefined || arrivalSeconds < departure || arrivalSeconds > start + NEIGHBORHOOD_ROUTING_HORIZON_SECONDS) continue;
      const key = JSON.stringify([line.id, trip.directionId ?? trip.headsign ?? ""]);
      const current = best.get(key);
      if (current && (current.walking < walk.durationSeconds || current.walking === walk.durationSeconds && current.departure <= departure)) continue;
      const boarding = byId.get(from.stopId)!, arrival = byId.get(to.stopId)!;
      const sections: NearbyJourneySection[] = [{ type: "walking", mode: "walking", durationSeconds: walk.durationSeconds,
        distanceMeters: walk.distanceMeters, walkingProvider: walk.provider, walkingDatasetVersion: walk.datasetVersion,
        timingSource: "schedule", geometry: walk.coordinates, fromPoint: request.origin, toPoint: stops.get(from.stopId),
        toStopPointId: from.stopId, toStopAreaId: boarding.parentId, toName: boarding.name }];
      const waiting = departure - start - walk.durationSeconds;
      if (waiting) sections.push({ type: "waiting", durationSeconds: waiting, timingSource: "schedule" });
      sections.push({ type: "public_transport", mode: "public_transport", lineId: line.id.replace(/^line:/u, ""),
        lineCode: line.code, lineMode: "NOCTILIEN", direction: trip.headsign, durationSeconds: arrivalSeconds - departure,
        timingSource: "schedule", fromName: boarding.name, toName: arrival.name,
        fromStopPointId: from.stopId, toStopPointId: to.stopId, fromStopAreaId: boarding.parentId, toStopAreaId: arrival.parentId });
      let time = start;
      for (const section of sections) {
        section.departureDateTime = parisDateTime(time * 1000); time += section.durationSeconds;
        section.arrivalDateTime = parisDateTime(time * 1000);
      }
      best.set(key, { walking: walk.durationSeconds, departure, journey: {
        id: `gtfs-night:${timetable.manifest?.timetable?.path}:${request.datetime}:${line.id}:${trip.id}:${from.stopId}`,
        source: "gtfs", status: "theoretical", datasetVersion: timetable.manifest?.datasetVersion,
        durationSeconds: time - start, departureDateTime: request.datetime, arrivalDateTime: parisDateTime(time * 1000),
        transferCount: 0, sections,
      } });
    }
  }
  return { journeys: [...best.values()].map(value => value.journey), status: partial ? "partial" : "ready",
    linesExamined: request.lines.length, walkingStops: stops.size };
}
