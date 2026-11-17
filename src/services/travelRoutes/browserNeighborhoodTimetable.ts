import type { GtfsLineFrequencyResponse } from "../../types/lineFrequency";
import { findGtfsLastService, type GtfsLastService } from "../../../shared/gtfs/lastService";
import { fetchGtfsLineFrequency } from "../lineFrequency";
import { fetchGtfsLineTimetable } from "../lineFrequencyTimetable";
import { assertNeighborhoodTimetableAvailable } from "../../features/nearby-stations/neighborhoodJourneys";
import { canUseBrowserNeighborhoodGtfs, requestBrowserNeighborhoodGtfs } from "./browserNeighborhoodGtfs";

export async function fetchNeighborhoodGtfsFrequency(lineId: string, options: { signal?: AbortSignal; serviceDate?: string } = {}): Promise<GtfsLineFrequencyResponse> {
  if (!canUseBrowserNeighborhoodGtfs()) return fetchGtfsLineFrequency(lineId, options);
  const profile = await requestBrowserNeighborhoodGtfs<GtfsLineFrequencyResponse>({ kind: "frequency", lineId, serviceDate: options.serviceDate }, options.signal ?? new AbortController().signal);
  if (profile.source !== "gtfs" || profile.lineId !== lineId) throw new Error("Unsupported browser GTFS frequency contract");
  return profile;
}
export async function fetchNeighborhoodGtfsLastService(lineId: string, stationId?: string, options: { signal?: AbortSignal; serviceDate?: string } = {}): Promise<GtfsLastService | undefined> {
  if (!canUseBrowserNeighborhoodGtfs()) {
    const timetable = await fetchGtfsLineTimetable(lineId, options);
    assertNeighborhoodTimetableAvailable(timetable.status, timetable.serviceDate);
    return findGtfsLastService(timetable, stationId);
  }
  return requestBrowserNeighborhoodGtfs<GtfsLastService | undefined>({ kind: "last-service", lineId, stationId, serviceDate: options.serviceDate }, options.signal ?? new AbortController().signal);
}
