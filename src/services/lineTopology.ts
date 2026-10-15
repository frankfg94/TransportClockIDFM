import type { LineTopology } from "../../server/services/topology/types";
import { toServerApiUrl } from "./serverApi";

/** Complete physical topology; no station projection or timetable filtering. */
export async function fetchLineTopology(lineId: string, signal?: AbortSignal): Promise<LineTopology | undefined> {
  const response = await fetch(toServerApiUrl(`/api/lines/${encodeURIComponent(lineId)}/topology`), { signal });
  if (!response.ok) return undefined;
  const topology = await response.json() as LineTopology;
  return Array.isArray(topology.stations) && Array.isArray(topology.segments) && Array.isArray(topology.patterns)
    ? topology : undefined;
}
