import type { GtfsLineTimetableResponse } from "../types/lineFrequencyTimetable";
import { toServerApiUrl } from "./serverApi";

export async function fetchGtfsLineTimetable(
  lineId: string,
  options: { serviceDate?: string; signal?: AbortSignal } = {},
): Promise<GtfsLineTimetableResponse> {
  options.signal?.throwIfAborted();
  const query = options.serviceDate
    ? `?serviceDate=${encodeURIComponent(options.serviceDate)}`
    : "";
  const response = await fetch(
    toServerApiUrl(`/api/lines/${encodeURIComponent(lineId)}/timetable${query}`),
    {
      signal: options.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) throw new Error(`GTFS timetable request failed: ${response.status}`);
  const value = (await response.json()) as GtfsLineTimetableResponse;
  options.signal?.throwIfAborted();
  return value;
}
