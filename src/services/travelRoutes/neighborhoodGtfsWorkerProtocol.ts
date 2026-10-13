import type { NeighborhoodJourneysRequest } from "../../features/nearby-stations/neighborhoodJourneys";

export type NeighborhoodGtfsWorkerAction =
  | { kind: "routes"; request: NeighborhoodJourneysRequest }
  | { kind: "frequency"; lineId: string }
  | { kind: "last-service"; lineId: string; stationId?: string; serviceDate?: string };
export type NeighborhoodGtfsWorkerRequest = ({ id: number; baseUrl: string } & NeighborhoodGtfsWorkerAction) | { id: number; kind: "cancel" };
export interface NeighborhoodGtfsWorkerDiagnostics {
  kind: NeighborhoodGtfsWorkerAction["kind"];
  queueMs: number;
  taskMs: number;
  assetReads: number;
  matrixCalls: number;
  matrixCacheHits: number;
  walkingPairsReused: number;
  walkingPairsRequested: number;
  cacheHit?: boolean;
  scannedConnections?: number;
}
export type NeighborhoodGtfsWorkerResponse = ({ id: number; payload: unknown } | { id: number; error: string }) & { diagnostics?: NeighborhoodGtfsWorkerDiagnostics };
