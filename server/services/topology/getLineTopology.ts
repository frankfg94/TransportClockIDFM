import { getLineTopologyFromNetexCache } from "./netexCache";
import type { LineTopology } from "./types";

const topologyCache = new Map<string, Promise<LineTopology>>();

export function getLineTopology(lineId: string): Promise<LineTopology> {
  const cached = topologyCache.get(lineId);

  if (cached) {
    return cached;
  }

  const request = getLineTopologyFromNetexCache(lineId);
  topologyCache.set(lineId, request);

  return request;
}
