import type { NeighborhoodJourneysRequest, NeighborhoodJourneysResponse } from "../../features/nearby-stations/neighborhoodJourneys";
import type { NightAccessRequest } from "../../../shared/gtfs/nightAccess";

export type NeighborhoodGtfsWorkerAction =
  | { kind: "routes"; request: NeighborhoodJourneysRequest }
  | { kind: "night-access"; request: NightAccessRequest }
  | { kind: "frequency"; lineId: string; serviceDate?: string }
  | { kind: "last-service"; lineId: string; stationId?: string; serviceDate?: string };
export type NeighborhoodGtfsWorkerRequest =
  | ({ id: number; baseUrl: string; coldStart?: boolean; measureSharedWalks?: boolean; debug?: boolean } & NeighborhoodGtfsWorkerAction)
  | { id: number; kind: "cancel" }
  | { kind: "refresh-manifest" };
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
  purpose?: NeighborhoodJourneysRequest["purpose"];
  destinations?: number;
  enqueuedEpochMs?: number;
  startedEpochMs?: number;
  endedEpochMs?: number;
  steps?: { task: string; startEpochMs: number; endEpochMs: number; durationMs: number; status: "ready" | "error"; details?: Record<string, unknown> }[];
  cacheHit?: boolean;
  scannedConnections?: number;
  excludedFeederAccesses?: NonNullable<NeighborhoodJourneysResponse["diagnostics"]>["excludedFeederAccesses"];
}
export type NeighborhoodGtfsWorkerResponse = ({ id: number; payload: unknown } | { id: number; error: string; uncoveredServiceDate?: string } | { id: number; cancelled: true }) & { diagnostics?: NeighborhoodGtfsWorkerDiagnostics };
