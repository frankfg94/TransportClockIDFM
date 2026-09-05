import type { H3Event } from "h3";
import type { GtfsLineFrequencyResponse } from "../../../src/types/lineFrequency";
import { attachGtfsMonitoringRefs } from "../topology/attachGtfsMonitoringRefs";
import { getLineTopology } from "../topology/getLineTopology";
import { getNetexRuntimeEnv, createNetexCacheEnvironmentKey } from "../topology/netexCache";
import { FrequencyCache } from "./frequencyCache";
import {
  computeGtfsLineFrequency,
  getGtfsFrequencyServiceDate,
  GTFS_FREQUENCY_CALCULATION_VERSION,
} from "./frequencyComputation";
import {
  getGtfsManifest,
  getGtfsRuntimeCacheEpoch,
  isGtfsEnabled,
  loadGtfsLineArtifact,
} from "./runtime";
import { loadGtfsTimetableForDate } from "./timetableRuntime";

export { computeGtfsLineFrequency, getGtfsFrequencyServiceDate } from "./frequencyComputation";

const cache = new FrequencyCache<GtfsLineFrequencyResponse>();

export function clearGtfsFrequencyCache(): void {
  cache.clear();
}

export async function getGtfsLineFrequency(
  event: H3Event | undefined,
  lineId: string,
  now: Date = new Date(),
): Promise<GtfsLineFrequencyResponse> {
  const serviceDate = getGtfsFrequencyServiceDate(now);
  const manifest = await getGtfsManifest(event);
  if (!isGtfsEnabled(event) || !manifest?.timetable) {
    const timetable = await loadGtfsTimetableForDate(event, lineId, serviceDate);
    return computeGtfsLineFrequency({ lineId, serviceDate, timetable });
  }
  const env = getNetexRuntimeEnv(event);
  const [rawTopology, artifact] = await Promise.all([
    getLineTopology(lineId, env).catch(() => undefined),
    loadGtfsLineArtifact(event, lineId).catch(() => undefined),
  ]);
  // Hash only the artifact fields used by attachGtfsMonitoringRefs, not shapes.
  // The fixed-size fingerprint also bounds cache-key memory for long lines.
  const fingerprintBytes = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([rawTopology, artifact?.patterns, artifact?.entrances]),
    ),
  );
  const topologyFingerprint = Array.from(new Uint8Array(fingerprintBytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  // Availability is checked before cache lookup. The upstream caches refresh
  // manifest/topology; a hit here avoids reopening all active timetable chunks.
  const key = JSON.stringify([
    GTFS_FREQUENCY_CALCULATION_VERSION,
    lineId,
    serviceDate,
    getGtfsRuntimeCacheEpoch(),
    manifest?.sha256,
    manifest?.cacheGeneration,
    manifest?.datasetVersion,
    manifest?.sourceUpdatedAt,
    manifest?.timetable,
    createNetexCacheEnvironmentKey(env),
    topologyFingerprint,
  ]);
  const request = cache.getOrLoad(key, async () => {
    const timetable = await loadGtfsTimetableForDate(event, lineId, serviceDate);
    const topology =
      rawTopology && artifact ? attachGtfsMonitoringRefs(rawTopology, artifact) : rawTopology;
    return computeGtfsLineFrequency({ lineId, serviceDate, timetable, topology });
  });
  const response = await request;
  // Missing chunks/coverage can recover without changing the manifest. Keep
  // negative states retryable; cache a valid empty service day as insufficient.
  if (response.status !== "ready" && response.status !== "insufficient") cache.delete(key, request);
  return response;
}
