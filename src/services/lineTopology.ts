import type { LineTopology } from "../../server/services/topology/types";
import { toServerApiUrl } from "./serverApi";

/** Complete physical topology; no station projection or timetable filtering. */
export async function fetchLineTopology(lineId: string, signal?: AbortSignal): Promise<LineTopology | undefined> {
  const response = await fetch(toServerApiUrl(`/api/lines/${encodeURIComponent(lineId)}/topology`), { signal });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Line topology unavailable (${response.status})`);
  const topology = await response.json() as LineTopology;
  if (!Array.isArray(topology.stations) || !Array.isArray(topology.segments) || !Array.isArray(topology.patterns)) {
    throw new Error("Invalid line topology");
  }
  return topology;
}
