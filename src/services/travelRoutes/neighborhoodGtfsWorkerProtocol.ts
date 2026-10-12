import type { NeighborhoodJourneysRequest, NeighborhoodJourneysResponse } from "../../features/nearby-stations/neighborhoodJourneys";

export interface NeighborhoodGtfsWorkerRequest { id: number; baseUrl: string; request: NeighborhoodJourneysRequest }
export type NeighborhoodGtfsWorkerResponse = { id: number; payload: NeighborhoodJourneysResponse } | { id: number; error: string };
