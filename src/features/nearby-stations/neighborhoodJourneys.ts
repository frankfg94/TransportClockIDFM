import type { NearbyJourney, NearbyJourneyPoint } from "./nearbyHeavyTransports";
import type { GlobalMapMode } from "../transport-map/contracts/manifest";

export interface NeighborhoodJourneyDestination extends NearbyJourneyPoint { id: string; destinationRef?: string; arrivalAtPlatform?: boolean }
export interface NeighborhoodJourneysRequest {
  /** Browser worker scheduling only, ignored by the routing algorithm. */
  purpose?: "transport" | "night-transport" | "places";
  origin: NearbyJourneyPoint;
  datetime: string;
  destinations: NeighborhoodJourneyDestination[];
  allowedModes?: readonly GlobalMapMode[];
}
export type NeighborhoodJourneyStatus = "ready" | "partial" | "missing" | "out-of-coverage" | "outside-search-window";
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
