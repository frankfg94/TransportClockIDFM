import type { GtfsPublicStatus } from "../../server/services/gtfs/types";
import { toServerApiUrl } from "./serverApi";

export async function fetchGtfsStatus(): Promise<GtfsPublicStatus> {
  const response = await fetch(toServerApiUrl("/api/gtfs/status"));
  if (!response.ok) throw new Error(`GTFS status HTTP ${response.status}`);
  return (await response.json()) as GtfsPublicStatus;
}
