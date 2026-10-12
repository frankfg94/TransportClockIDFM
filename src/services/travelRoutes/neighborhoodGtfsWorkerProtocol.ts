import type { NeighborhoodJourneysRequest } from "../../features/nearby-stations/neighborhoodJourneys";

export type NeighborhoodGtfsWorkerAction =
  | { kind: "routes"; request: NeighborhoodJourneysRequest }
  | { kind: "frequency"; lineId: string }
  | { kind: "last-service"; lineId: string; stationId?: string; serviceDate?: string };
export type NeighborhoodGtfsWorkerRequest = { id: number; baseUrl: string } & NeighborhoodGtfsWorkerAction;
export type NeighborhoodGtfsWorkerResponse = { id: number; payload: unknown } | { id: number; error: string };
