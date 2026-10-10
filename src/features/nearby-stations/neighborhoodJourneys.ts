import type { NearbyJourney, NearbyJourneyPoint } from "./nearbyHeavyTransports";
import type { GlobalMapMode } from "../transport-map/contracts/manifest";

export interface NeighborhoodJourneyDestination extends NearbyJourneyPoint { id: string; destinationRef?: string; arrivalAtPlatform?: boolean }
export interface NeighborhoodJourneysRequest {
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
  diagnostics?: { scannedConnections: number; calculationMs: number; cacheHit: boolean };
}
