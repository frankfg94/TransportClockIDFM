import type { GtfsLineTimetableResponse, GtfsLineTimetableStop } from "../../src/types/lineFrequencyTimetable";
import { canonicalGtfsTimetableStationId } from "../../src/features/line-map/lineFrequencyTimetableIntervals";

export interface GtfsLastService { seconds: number; stopName?: string }
export function findGtfsLastService(timetable: Pick<GtfsLineTimetableResponse, "status" | "stops" | "trips">, stationId?: string): GtfsLastService | undefined {
  if (timetable.status !== "ready") return undefined;
  const matchingStops = stationId ? timetable.stops.filter(stop => stopMatchesStation(stop, stationId)) : timetable.stops;
  const stopIds = new Set(matchingStops.map(stop => stop.id));
  if (stopIds.size === 0 && stationId) return undefined;
  let latest: GtfsLastService | undefined;
  for (const trip of timetable.trips) for (const call of trip.calls) {
    if (!stopIds.has(call.stopId)) continue;
    const seconds = call.departure ?? call.arrival;
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) continue;
    if (!latest || seconds > latest.seconds) latest = { seconds, stopName: timetable.stops.find(stop => stop.id === call.stopId)?.name };
  }
  return latest;
}
function stopMatchesStation(stop: GtfsLineTimetableStop, stationId: string): boolean {
  const wanted = canonicalGtfsTimetableStationId(stationId);
  return [stop.id, stop.parentId, stop.topologyId].filter((value): value is string => Boolean(value))
    .some(value => canonicalGtfsTimetableStationId(value) === wanted);
}
