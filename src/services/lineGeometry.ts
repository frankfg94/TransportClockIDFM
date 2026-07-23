import type {
  LineGeometryRequest,
  LineGeometryResolution,
} from "../features/line-map/lineGeometry";
import {
  parseServerTimingDuration,
  recordLineMapRuntimeMetrics,
} from "../features/line-map/lineMapPerformance";
import { toServerApiUrl } from "./serverApi";

export async function fetchResolvedLineGeometry(
  request: LineGeometryRequest,
  options: { signal?: AbortSignal } = {},
): Promise<LineGeometryResolution> {
  const startedAt = now();
  const response = await fetch(toServerApiUrl("/api/line-geometry/resolve"), {
    method: "POST",
    cache: "no-store",
    signal: options.signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Line geometry HTTP ${response.status}`);
  }

  recordLineMapRuntimeMetrics({
    lineGeometryRoundTripMs: now() - startedAt,
    lineGeometryServerMs: parseServerTimingDuration(
      response.headers.get("Server-Timing"),
      "line-geometry",
    ),
  });
  return (await response.json()) as LineGeometryResolution;
}

export interface GtfsLinePreloadResult {
  enabled: boolean;
  datasetVersion?: string;
  availableLineIds: string[];
  missingLineIds: string[];
}

export async function preloadGtfsLineArtifacts(lineIds: string[]): Promise<GtfsLinePreloadResult> {
  const uniqueLineIds = [...new Set(lineIds)];
  if (uniqueLineIds.length === 0) {
    return {
      enabled: true,
      availableLineIds: [],
      missingLineIds: [],
    };
  }

  const batches = Array.from(
    { length: Math.ceil(uniqueLineIds.length / 24) },
    (_, index) => uniqueLineIds.slice(index * 24, index * 24 + 24),
  );
  const results: GtfsLinePreloadResult[] = [];
  let nextBatch = 0;
  const workers = Array.from(
    { length: Math.min(2, batches.length) },
    async () => {
      while (nextBatch < batches.length) {
        const batch = batches[nextBatch];
        nextBatch += 1;
        results.push(await preloadGtfsLineArtifactBatch(batch));
      }
    },
  );
  await Promise.all(workers);

  const available = new Set(results.flatMap((result) => result.availableLineIds));
  return {
    enabled: results.every((result) => result.enabled),
    datasetVersion: results.find((result) => result.datasetVersion)?.datasetVersion,
    availableLineIds: uniqueLineIds.filter((lineId) => available.has(lineId)),
    missingLineIds: uniqueLineIds.filter((lineId) => !available.has(lineId)),
  };
}

async function preloadGtfsLineArtifactBatch(
  lineIds: string[],
): Promise<GtfsLinePreloadResult> {
  const response = await fetch(toServerApiUrl("/api/gtfs/preload"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lineIds }),
  });

  if (!response.ok) {
    throw new Error(`GTFS preload HTTP ${response.status}`);
  }

  return (await response.json()) as GtfsLinePreloadResult;
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}
