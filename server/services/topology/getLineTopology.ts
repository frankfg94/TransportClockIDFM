import {
  createNetexCacheEnvironmentKey,
  getLineTopologyFromNetexCache,
  type NetexRuntimeEnv,
} from "./netexCache";
import type { LineTopology } from "./types";

const topologyCache = new Map<string, Promise<LineTopology>>();

export function getLineTopology(
  lineId: string,
  runtimeEnv?: NetexRuntimeEnv,
): Promise<LineTopology> {
  const cacheKey = `${createNetexCacheEnvironmentKey(runtimeEnv)}:${lineId}`;
  const cached = topologyCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const request = getLineTopologyFromNetexCache(lineId, runtimeEnv);
  topologyCache.set(cacheKey, request);

  return request;
}
