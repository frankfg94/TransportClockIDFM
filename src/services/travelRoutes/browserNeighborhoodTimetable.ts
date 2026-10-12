import type { GtfsLineFrequencyResponse } from "../../types/lineFrequency";
import type { GtfsLastService } from "../../../shared/gtfs/lastService";
import { fetchGtfsLineFrequency } from "../lineFrequency";
import { useLineFrequencyTimetable } from "../../features/line-map/useLineFrequencyTimetable";
import { canUseBrowserNeighborhoodGtfs, requestBrowserNeighborhoodGtfs } from "./browserNeighborhoodGtfs";

export async function fetchNeighborhoodGtfsFrequency(lineId: string, options: { signal?: AbortSignal } = {}): Promise<GtfsLineFrequencyResponse> {
  if (!canUseBrowserNeighborhoodGtfs()) return fetchGtfsLineFrequency(lineId, options);
  const profile = await requestBrowserNeighborhoodGtfs<GtfsLineFrequencyResponse>({ kind: "frequency", lineId }, options.signal ?? new AbortController().signal);
  if (profile.source !== "gtfs" || profile.lineId !== lineId) throw new Error("Unsupported browser GTFS frequency contract");
  return profile;
}
export async function fetchNeighborhoodGtfsLastService(lineId: string, stationId?: string, options: { signal?: AbortSignal; serviceDate?: string } = {}): Promise<GtfsLastService | undefined> {
  if (!canUseBrowserNeighborhoodGtfs()) return useLineFrequencyTimetable().getLastService(lineId, stationId, options);
  return requestBrowserNeighborhoodGtfs<GtfsLastService | undefined>({ kind: "last-service", lineId, stationId, serviceDate: options.serviceDate }, options.signal ?? new AbortController().signal);
}
