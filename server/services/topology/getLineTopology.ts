import { buildLineTopologyFromFixture } from "./buildLineTopology";
import { loadRawLineFixture } from "./fixtures";
import type { LineTopology } from "./types";

const topologyCache = new Map<string, Promise<LineTopology>>();

export function getLineTopology(lineId: string): Promise<LineTopology> {
  const cached = topologyCache.get(lineId);

  if (cached) {
    return cached;
  }

  const request = loadRawLineFixture(lineId).then(buildLineTopologyFromFixture);
  topologyCache.set(lineId, request);

  return request;
}
