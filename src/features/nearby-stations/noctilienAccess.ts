import type { TransportMapNetwork } from "../transport-map/contracts/network";
import type { NearbyJourneyPoint } from "./nearbyHeavyTransports";
import { haversineMeters } from "./nearbyWalkingRoutes";
import { NIGHT_ACCESS_RADIUS_METERS, type NightAccessRequest, type NightAccessResult } from "../../../shared/gtfs/nightAccess";
import { canUseBrowserNeighborhoodGtfs, requestBrowserNeighborhoodGtfs } from "../../services/travelRoutes/browserNeighborhoodGtfs";
import { toServerApiUrl } from "../../services/serverApi";

/** Independent night access loader; the worker shares immutable GTFS/street caches. */
export async function loadNoctilienAccess(network: TransportMapNetwork | undefined, origin: NearbyJourneyPoint,
  datetime: string, signal: AbortSignal): Promise<NightAccessResult> {
  const ids = new Set(network?.stations.filter(station => haversineMeters(origin, station) <= NIGHT_ACCESS_RADIUS_METERS)
    .flatMap(station => station.lineIds.filter(id => network.linesById.get(id)?.mode === "NOCTILIEN")));
  const lines = [...ids].map(id => network!.linesById.get(id)!).map(line => ({ id: line.sourceLineId ?? line.id, code: line.label || line.code }));
  if (!lines.length) return { journeys: [], status: "ready", linesExamined: 0, walkingStops: 0 };
  const request: NightAccessRequest = { origin, datetime, lines };
  const result: NightAccessResult = await (async () => {
    if (canUseBrowserNeighborhoodGtfs()) return requestBrowserNeighborhoodGtfs<NightAccessResult>({ kind: "night-access", request }, signal);
    const response = await fetch(toServerApiUrl("/api/neighborhood-night-access"), { method: "POST", signal,
      headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
    if (!response.ok) throw new Error(`GTFS night access unavailable (${response.status})`);
    return response.json();
  })();
  if (result.status === "partial" && !result.journeys.length) throw new Error("GTFS night walking access unavailable");
  return result;
}
