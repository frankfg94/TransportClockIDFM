import type { NearbyJourney, NearbyJourneyPoint, NearbyJourneyRequest } from "./nearbyHeavyTransports";
import type { GlobalMapMode } from "../transport-map/contracts/manifest";

export interface NeighborhoodJourneyDestination extends NearbyJourneyPoint { id: string; destinationRef?: string; arrivalAtPlatform?: boolean; destinationLineId?: string }
export interface NeighborhoodJourneysRequest {
  /** Browser worker scheduling only, ignored by the routing algorithm. */
  purpose?: NearbyJourneyRequest["purpose"];
  origin: NearbyJourneyPoint;
  datetime: string;
  destinations: NeighborhoodJourneyDestination[];
  allowedModes?: readonly GlobalMapMode[];
}
export type NeighborhoodJourneyStatus = "ready" | "partial" | "missing" | "out-of-coverage" | "outside-search-window";

export class NeighborhoodGtfsCoverageError extends Error {
  constructor(readonly serviceDate: string) {
    super(`GTFS neighborhood routing out-of-coverage (${serviceDate})`);
    this.name = "NeighborhoodGtfsCoverageError";
  }
}
export function assertNeighborhoodTimetableAvailable(status: string, serviceDate: string): void {
  if (status === "out-of-coverage") throw new NeighborhoodGtfsCoverageError(serviceDate);
  if (status === "missing") throw new Error("GTFS timetable unavailable");
}
export interface NeighborhoodJourneysResponse {
  source: "gtfs";
  datasetVersion?: string;
  routingPath?: string;
  serviceDate: string;
  searchHorizonSeconds: number;
  destinations: Array<{ id: string; status: NeighborhoodJourneyStatus; journeys: NearbyJourney[] }>;
  diagnostics?: { scannedConnections: number; calculationMs: number; cacheHit: boolean;
    excludedFeederAccesses?: { lineId?: string; lineCode?: string; stopId?: string; stopName?: string; walkingSeconds: number; reason: string }[] };
}
