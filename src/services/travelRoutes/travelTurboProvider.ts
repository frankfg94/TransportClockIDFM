import { fetchGtfsLineTimetable } from "../lineFrequencyTimetable";
import { fetchTravelStopMonitoring } from "../idfm";
import { extractIdfmStopPointCode, idfmLineToSiriRef, navitiaStopPointToMonitoringRef } from "../idfmStopReferences";
import type { GtfsLineTimetableResponse, GtfsLineTimetableTrip } from "../../types/lineFrequencyTimetable";
import { isTurboTransit, optimizeTurbo, parisDateTime, turboTime, type TravelTurboProvider, type TurboCourse, type TurboObservation } from "../../features/nearby-stations/travelTurbo";

const stopKey = (id: string) => {
  const area = id.match(/(?:monomodalStopPlace:|StopArea:SP:)([^:]+)/iu)?.[1];
  if (area) return `area:${area}`;
  const quay = extractIdfmStopPointCode(id) ?? id.match(/^IDFM:([^:]+)$/u)?.[1];
  return quay ? `quay:${quay}` : undefined;
};
// Compare complete official journey tokens, never fuzzy substrings or mission names.
const journeyKey = (id?: string) => id?.match(/VehicleJourney::([^:]+):/u)?.[1]
  ?? id?.replace(/^vehicle_journey:/u, "").replace(/^IDFM:(?:[^:]+:)+/u, "");
const lineKey = (id: string) => idfmLineToSiriRef(id);
const fresh = (o: TurboObservation, now: number) => o.observedAt !== undefined && now - o.observedAt <= 120_000 && o.observedAt <= now + 30_000;

export function matchTurboObservation(observations: TurboObservation[], course: TurboCourse, trip: Pick<GtfsLineTimetableTrip, "id" | "headsign">, lineId: string, stopId: string, side: "departure" | "arrival", now: number, fallbackUnique = true): TurboObservation | undefined {
  const key = stopKey(stopId);
  if (!key) return undefined;
  const relevant = observations.filter((o) => lineKey(o.lineId) === lineKey(lineId) && stopKey(o.stopId) === key && fresh(o, now));
  const direct = relevant.filter((o) => {
    const aimed = side === "departure" ? o.aimedDeparture : o.aimedArrival;
    const base = side === "departure" ? course.baseDeparture : course.baseArrival;
    return o.journeyId && journeyKey(o.journeyId) === journeyKey(trip.id) &&
      (aimed === undefined || parisDateTime(aimed).slice(0, 8) === parisDateTime(base).slice(0, 8));
  });
  if (direct.length) return direct.length === 1 ? direct[0] : undefined;
  if (!fallbackUnique) return undefined;
  const aimed = side === "departure" ? course.baseDeparture : course.baseArrival;
  const fallback = relevant.filter((o) => o.mission && trip.headsign && o.mission === trip.headsign &&
    (side === "departure" ? o.aimedDeparture : o.aimedArrival) === aimed);
  return fallback.length === 1 ? fallback[0] : undefined;
}

export function applyTurboRealtime(course: TurboCourse, departure?: TurboObservation, arrival?: TurboObservation): TurboCourse | undefined {
  if (departure?.cancelled || arrival?.cancelled) return undefined;
  const predictedDeparture = departure?.departure;
  const predictedArrival = arrival?.arrival;
  const delay = predictedDeparture === undefined ? 0 : predictedDeparture - course.baseDeparture;
  const updated = {
    ...course,
    departure: predictedDeparture ?? course.baseDeparture,
    arrival: predictedArrival ?? course.baseArrival + delay,
    source: predictedDeparture !== undefined && predictedArrival !== undefined ? "realtime" as const
      : predictedDeparture !== undefined || predictedArrival !== undefined ? "estimated" as const : "schedule" as const,
    observedAt: departure?.observedAt !== undefined || arrival?.observedAt !== undefined
      ? new Date(Math.min(departure?.observedAt ?? Infinity, arrival?.observedAt ?? Infinity)).toISOString() : undefined,
  };
  return updated.arrival >= updated.departure ? updated : undefined;
}

/** GTFS time is elapsed time from service-day noon minus 12h, including DST days. */
export function gtfsTurboTime(civilDate: string, serviceDate: string, secondsFromCivilDay: number): number {
  const civilUtc = Date.UTC(+civilDate.slice(0, 4), +civilDate.slice(4, 6) - 1, +civilDate.slice(6, 8));
  const serviceUtc = Date.UTC(+serviceDate.slice(0, 4), +serviceDate.slice(4, 6) - 1, +serviceDate.slice(6, 8));
  const secondsFromServiceDay = secondsFromCivilDay + (civilUtc - serviceUtc) / 1000;
  return turboTime(`${serviceDate}T120000`)! - 12 * 3600_000 + secondsFromServiceDay * 1000;
}

export function createTravelTurboProvider(dependencies: {
  timetable?: typeof fetchGtfsLineTimetable;
  monitoring?: typeof fetchTravelStopMonitoring;
  now?: () => number;
} = {}): TravelTurboProvider {
  const timetable = dependencies.timetable ?? fetchGtfsLineTimetable;
  const monitoring = dependencies.monitoring ?? fetchTravelStopMonitoring;
  const now = dependencies.now ?? Date.now;
  // Resolved static responses only: one analysis cannot abort another's cached promise.
  const schedules = new Map<string, { at: number; value: GtfsLineTimetableResponse }>();
  return {
    async analyze({ route, start, signal }) {
      const legs = route.sections.filter(isTurboTransit);
      const unavailable = () => optimizeTurbo(route, [], start, false);
      if (!legs.length || legs.some((s) => !s.lineId || !s.fromStopPointId || !s.toStopPointId || !stopKey(s.fromStopPointId) || !stopKey(s.toStopPointId))) return unavailable();
      const horizon = start + 6 * 3600_000;
      const dates = [...new Set([parisDateTime(start).slice(0, 8), parisDateTime(horizon).slice(0, 8)])];
      const observed = new Map<string, Promise<TurboObservation[]>>();
      const pendingSchedules = new Map<string, Promise<GtfsLineTimetableResponse>>();
      let complete = true;
      const readMonitoring = (lineId: string, stopId: string) => {
        const area = stopId.match(/monomodalStopPlace:([^:]+)/iu)?.[1];
        const ref = area ? `STIF:StopArea:SP:${area}:` : navitiaStopPointToMonitoringRef(stopId);
        if (!ref) { complete = false; return Promise.resolve([]); }
        const key = `${lineId}:${ref}`;
        if (!observed.has(key)) observed.set(key, monitoring(idfmLineToSiriRef(lineId), ref, signal).catch(() => {
          signal.throwIfAborted(); complete = false; return [];
        }));
        return observed.get(key)!;
      };
      const readSchedule = (lineId: string, serviceDate: string) => {
        const key = `${lineId}:${serviceDate}`;
        if (!pendingSchedules.has(key)) pendingSchedules.set(key, (async () => {
          const cached = schedules.get(key);
          if (cached && now() - cached.at < 300_000) return cached.value;
          const value = await timetable(lineId, { serviceDate, signal });
          signal.throwIfAborted();
          if (schedules.size >= 12) schedules.delete(schedules.keys().next().value!);
          schedules.set(key, { value, at: now() });
          return value;
        })());
        return pendingSchedules.get(key)!;
      };
      const batches = await Promise.all(legs.map(async (leg): Promise<TurboCourse[]> => {
        const lineId = leg.lineId!;
        const [tables, departures, arrivals] = await Promise.all([
          Promise.all(dates.map((date) => readSchedule(lineId, date))),
          readMonitoring(lineId, leg.fromStopPointId!), readMonitoring(lineId, leg.toStopPointId!),
        ]);
        signal.throwIfAborted();
        const courses = new Map<string, TurboCourse>();
        // A single observation can still match several scheduled missions. Reject
        // that fallback in both directions, even when SIRI returned only one row.
        const fallbackCourses = new Map<string, Set<string>>();
        const fallbackKey = (side: string, time: number, mission?: string) => `${side}:${time}:${mission ?? ""}`;
        for (const table of tables) for (const trip of table.trips) {
          for (const call of trip.calls) for (const side of ["departure", "arrival"] as const) {
            const stop = side === "departure" ? leg.fromStopPointId! : leg.toStopPointId!;
            const value = call[side];
            if (value === null || stopKey(call.stopId) !== stopKey(stop)) continue;
            const key = fallbackKey(side, gtfsTurboTime(table.serviceDate, trip.serviceDate, value), trip.headsign);
            const ids = fallbackCourses.get(key) ?? new Set<string>();
            ids.add(`${trip.serviceDate}:${trip.id}`);
            fallbackCourses.set(key, ids);
          }
        }
        for (const table of tables) {
          if (table.status !== "ready") { complete = false; continue; }
          const from = table.stops.filter((s) => stopKey(s.id) === stopKey(leg.fromStopPointId!));
          const to = table.stops.filter((s) => stopKey(s.id) === stopKey(leg.toStopPointId!));
          if (from.length !== 1 || to.length !== 1) { complete = false; continue; }
          for (const trip of table.trips) {
            const calls = trip.calls;
            const starts = calls.flatMap((c, i) => c.stopId === from[0]!.id && c.departure !== null && c.pickupType === 0 ? [i] : []);
            for (const startIndex of starts) {
              const endIndex = calls.findIndex((c, i) => i > startIndex && c.stopId === to[0]!.id && c.arrival !== null && c.dropOffType === 0);
              if (endIndex < 0) continue;
              const departure = gtfsTurboTime(table.serviceDate, trip.serviceDate, calls[startIndex]!.departure!);
              const arrival = gtfsTurboTime(table.serviceDate, trip.serviceDate, calls[endIndex]!.arrival!);
              // Include delayed services which were scheduled before the window.
              if (departure < start - 2 * 3600_000 || departure > horizon || arrival > horizon) continue;
              const course: TurboCourse = { id: `${trip.serviceDate}:${trip.id}:${calls[startIndex]!.sequence}:${calls[endIndex]!.sequence}`, vehicleJourneyId: trip.id,
                departure, arrival, baseDeparture: departure, baseArrival: arrival, source: "schedule",
                direction: table.stops.find((s) => s.id === calls.at(-1)?.stopId)?.name, mission: trip.headsign,
                fromStopPointId: leg.fromStopPointId, toStopPointId: leg.toStopPointId,
                stopNames: calls.slice(startIndex, endIndex + 1).map((c) => table.stops.find((s) => s.id === c.stopId)?.name ?? "").filter(Boolean),
              };
              const departureObservation = matchTurboObservation(departures, course, trip, lineId, leg.fromStopPointId!, "departure", now(), fallbackCourses.get(fallbackKey("departure", departure, trip.headsign))?.size === 1);
              const arrivalObservation = matchTurboObservation(arrivals, course, trip, lineId, leg.toStopPointId!, "arrival", now(), fallbackCourses.get(fallbackKey("arrival", arrival, trip.headsign))?.size === 1);
              const updated = applyTurboRealtime(course, departureObservation, arrivalObservation);
              if (!updated) continue;
              if (updated.departure < start) continue;
              // All relevant courses must be covered before claiming an optimum.
              if (updated.source !== "realtime") complete = false;
              courses.set(updated.id, updated);
            }
          }
        }
        // Navitia may use a newer schedule generation than the installed GTFS.
        // Include its selected dated course as evidence, never silently drop the baseline.
        const baseDeparture = turboTime(leg.baseDepartureDateTime ?? leg.departureDateTime);
        const baseArrival = turboTime(leg.baseArrivalDateTime ?? leg.arrivalDateTime);
        const baselineId = leg.vehicleJourneyId;
        if (baseDeparture !== undefined && baseArrival !== undefined && baselineId && ![...courses.values()].some((c) =>
          (journeyKey(c.vehicleJourneyId) === journeyKey(baselineId) && parisDateTime(c.baseDeparture).slice(0, 8) === parisDateTime(baseDeparture).slice(0, 8)) || (c.baseDeparture === baseDeparture && c.baseArrival === baseArrival))) {
          complete = false;
          const baseline: TurboCourse = { id: `baseline:${baseDeparture}:${baselineId}`, vehicleJourneyId: baselineId,
            departure: baseDeparture, arrival: baseArrival, baseDeparture, baseArrival, source: "schedule", stopNames: leg.stopNames, direction: leg.direction, mission: leg.mission,
            fromStopPointId: leg.fromStopPointId, toStopPointId: leg.toStopPointId };
          const trip = { id: baselineId, headsign: leg.mission };
          const updated = applyTurboRealtime(baseline,
            matchTurboObservation(departures, baseline, trip, lineId, leg.fromStopPointId!, "departure", now(), !fallbackCourses.has(fallbackKey("departure", baseDeparture, trip.headsign))),
            matchTurboObservation(arrivals, baseline, trip, lineId, leg.toStopPointId!, "arrival", now(), !fallbackCourses.has(fallbackKey("arrival", baseArrival, trip.headsign))));
          if (updated) courses.set(updated.id, updated);
        }
        // Unknown schedule coverage cannot be filled by inventing another mission.
        if (!courses.size) complete = false;
        return [...courses.values()].sort((a, b) => a.departure - b.departure);
      }));
      signal.throwIfAborted();
      const result = optimizeTurbo(route, batches, start, complete);
      if (result.status === "ready" && result.proposals.some((p) => (turboTime(p.arrivalDateTime) ?? horizon) + 1800_000 >= horizon)) {
        result.status = "partial"; result.currentOptimal = {};
      }
      result.analyzedAt = new Date(now()).toISOString();
      return result;
    },
  };
}
