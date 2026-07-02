import {
  createNetexCacheEnvironmentKey,
  getLineTopologyFromNetexCache,
  getNetexMemoryCacheTtlMs,
  type NetexRuntimeEnv,
} from "./netexCache";
import type { LineTopology } from "./types";

type TimedTopologyCacheEntry = {
  expiresAt: number;
  promise: Promise<LineTopology>;
};

const topologyCache = new Map<string, TimedTopologyCacheEntry>();

export function getLineTopology(
  lineId: string,
  runtimeEnv?: NetexRuntimeEnv,
): Promise<LineTopology> {
  const cacheKey = `${createNetexCacheEnvironmentKey(runtimeEnv)}:${lineId}`;
  const cached = topologyCache.get(cacheKey);

  if (cached && Date.now() <= cached.expiresAt) {
    return cached.promise;
  }

  if (cached) {
    topologyCache.delete(cacheKey);
  }

  const request = getLineTopologyFromNetexCache(lineId, runtimeEnv);
  topologyCache.set(cacheKey, {
    expiresAt: Date.now() + getNetexMemoryCacheTtlMs(runtimeEnv),
    promise: request,
  });
  request.catch(() => {
    if (topologyCache.get(cacheKey)?.promise === request) {
      topologyCache.delete(cacheKey);
    }
  });

  return request;
}
