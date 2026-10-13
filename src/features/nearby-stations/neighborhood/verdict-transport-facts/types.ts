import type { NeighborhoodFact } from "../contracts";

export interface TransportFactCollection {
  positiveFacts: NeighborhoodFact[];
  negativeFacts: NeighborhoodFact[];
  neutralFacts: NeighborhoodFact[];
}

export function createTransportFactCollection(): TransportFactCollection {
  return { positiveFacts: [], negativeFacts: [], neutralFacts: [] };
}
