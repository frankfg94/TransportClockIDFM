import type { NeighborhoodJourneysRequest } from "../../features/nearby-stations/neighborhoodJourneys";

export type NeighborhoodGtfsWorkerAction =
  | { kind: "routes"; request: NeighborhoodJourneysRequest }
  | { kind: "frequency"; lineId: string }
  | { kind: "last-service"; lineId: string; stationId?: string; serviceDate?: string };
export type NeighborhoodGtfsWorkerRequest = ({ id: number; baseUrl: string; coldStart?: boolean; debug?: boolean } & NeighborhoodGtfsWorkerAction) | { id: number; kind: "cancel" };
export interface NeighborhoodGtfsWorkerDiagnostics {
  kind: NeighborhoodGtfsWorkerAction["kind"];
  queueMs: number;
  taskMs: number;
  assetReads: number;
  matrixCalls: number;
  matrixCacheHits: number;
  walkingPairsReused: number;
  walkingPairsRequested: number;
  walkingPairsExamined?: number;
  purpose?: "transport" | "night-transport" | "places";
  destinations?: number;
  enqueuedEpochMs?: number;
  startedEpochMs?: number;
  endedEpochMs?: number;
  steps?: { task: string; startEpochMs: number; endEpochMs: number; durationMs: number; status: "ready" | "error"; details?: Record<string, unknown> }[];
  cacheHit?: boolean;
  scannedConnections?: number;
}
export type NeighborhoodGtfsWorkerResponse = ({ id: number; payload: unknown } | { id: number; error: string } | { id: number; cancelled: true }) & { diagnostics?: NeighborhoodGtfsWorkerDiagnostics };
