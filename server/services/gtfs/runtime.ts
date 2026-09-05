import { getRequestURL, type H3Event } from "h3";
import type {
  GtfsLineArtifact,
  GtfsLineLookupIndex,
  GtfsManifest,
  GtfsPublicStatus,
} from "./types";
import { normalizeGtfsLineLabel } from "./labels";
import {
  compileGtfsLineArtifact,
  type CompiledGtfsLineArtifact,
} from "../lineGeometry/gtfsIndexedGeometry";

const STALE_AFTER_MS = 20 * 24 * 60 * 60_000;
const MANIFEST_CACHE_MS = 60_000;
const COMMITTED_GTFS_ASSET_BASE = "/_gtfs-data";

interface R2ObjectLike {
  json?<T>(): Promise<T>;
  text(): Promise<string>;
}

interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>;
}

interface AssetFetcherLike {
  fetch(request: Request): Promise<Response>;
}

type CloudflareEnv = {
  ASSETS?: AssetFetcherLike;
  GTFS_DATA_BUCKET?: R2BucketLike;
  [key: string]: unknown;
};
type RuntimeGlobal = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

let manifestCache:
  { expiresAt: number; manifest?: GtfsManifest; storage: GtfsPublicStatus["storage"] } | undefined;
const artifactCache = new Map<string, Promise<GtfsLineArtifact | undefined>>();
const lineLookupCache = new Map<string, Promise<GtfsLineLookupIndex | undefined>>();
const compiledArtifactCache = new Map<
  string,
  Promise<CompiledGtfsLineArtifact | undefined>
>();
let runtimeCacheEpoch = 0;

export function getGtfsRuntimeCacheEpoch(): number { return runtimeCacheEpoch; }

export function isGtfsEnabled(event?: H3Event): boolean {
  return !["0", "false", "no", "off"].includes(
    getGtfsRuntimeValue(event, "GTFS_ENABLED").toLowerCase(),
  );
}

function getGtfsRuntimeValue(event: H3Event | undefined, key: string): string {
  const cloudflareValue = getCloudflareEnv(event)?.[key];
  const nodeValue = (globalThis as RuntimeGlobal).process?.env?.[key];
  return (
    (typeof cloudflareValue === "string" ? cloudflareValue : undefined) ??
    nodeValue ??
    ""
  ).trim();
}

export async function getGtfsManifest(
  event?: H3Event,
  options: { fresh?: boolean } = {},
): Promise<GtfsManifest | undefined> {
  if (!options.fresh && manifestCache && manifestCache.expiresAt > Date.now()) {
    return manifestCache.manifest;
  }

  const loaded = await readGtfsJson<GtfsManifest>(event, "current.json");
  manifestCache = {
    expiresAt: Date.now() + MANIFEST_CACHE_MS,
    manifest: loaded.value,
    storage: loaded.storage,
  };
  return loaded.value;
}

export async function getGtfsPublicStatus(event?: H3Event): Promise<GtfsPublicStatus> {
  const manifest = await getGtfsManifest(event);
  const sourceDate = manifest?.sourceUpdatedAt ?? manifest?.installedAt;
  const ageMs = sourceDate ? Math.max(0, Date.now() - Date.parse(sourceDate)) : undefined;

  return {
    enabled: isGtfsEnabled(event),
    available: Boolean(manifest),
    ...(manifest
      ? {
          datasetVersion: manifest.datasetVersion,
          sha256: manifest.sha256.slice(0, 12),
          sourceUpdatedAt: manifest.sourceUpdatedAt,
          installedAt: manifest.installedAt,
          ageDays: ageMs === undefined ? undefined : Math.floor(ageMs / (24 * 60 * 60_000)),
          lineCount: manifest.lineCount,
          cacheGeneration: manifest.cacheGeneration,
        }
      : {}),
    stale: ageMs !== undefined && ageMs > STALE_AFTER_MS,
    storage: manifestCache?.storage ?? detectStorage(event),
  };
}

export async function loadGtfsLineArtifact(
  event: H3Event | undefined,
  lineId: string,
): Promise<GtfsLineArtifact | undefined> {
  const manifest = await getGtfsManifest(event);
  if (!manifest) return undefined;

  const key = normalizeLineArtifactKey(lineId);
  const cacheKey = `${manifest.sha256}:${key}`;
  const cached = artifactCache.get(cacheKey);
  if (cached) return cached;

  const request = readGtfsJson<GtfsLineArtifact>(
    event,
    `versions/${manifest.sha256}/lines/${key}.json`,
  ).then(({ value }) => value);
  artifactCache.set(cacheKey, request);
  request.catch(() => artifactCache.delete(cacheKey));
  return request;
}

export async function loadCompiledGtfsLineArtifact(
  event: H3Event | undefined,
  lineId: string,
): Promise<CompiledGtfsLineArtifact | undefined> {
  const manifest = await getGtfsManifest(event);
  if (!manifest) return undefined;

  const key = normalizeLineArtifactKey(lineId);
  const cacheKey = `${manifest.sha256}:${manifest.cacheGeneration}:${key}`;
  const cached = compiledArtifactCache.get(cacheKey);
  if (cached) return cached;

  const request = loadGtfsLineArtifact(event, lineId).then((artifact) =>
    artifact ? compileGtfsLineArtifact(artifact) : undefined,
  );
  compiledArtifactCache.set(cacheKey, request);
  request.catch(() => compiledArtifactCache.delete(cacheKey));
  return request;
}

export async function loadGtfsLineArtifactsByLabel(
  event: H3Event | undefined,
  label: string,
): Promise<GtfsLineArtifact[]> {
  const manifest = await getGtfsManifest(event);
  const normalizedLabel = normalizeGtfsLineLabel(label);
  if (!manifest || !normalizedLabel) return [];

  const cacheKey = manifest.sha256;
  let lookupRequest = lineLookupCache.get(cacheKey);
  if (!lookupRequest) {
    lookupRequest = readGtfsJson<GtfsLineLookupIndex>(
      event,
      `versions/${manifest.sha256}/line-index.json`,
    ).then(({ value }) => {
      if (!value) lineLookupCache.delete(cacheKey);
      return value;
    });
    lineLookupCache.set(cacheKey, lookupRequest);
    lookupRequest.catch(() => lineLookupCache.delete(cacheKey));
  }

  const lookup = await lookupRequest;
  const lineIds = lookup?.lineIdsByLabel[normalizedLabel] ?? [];
  const artifacts = await Promise.all(
    lineIds.map((lineId) => loadGtfsLineArtifact(event, lineId)),
  );
  return artifacts.filter(
    (artifact): artifact is GtfsLineArtifact => artifact !== undefined,
  );
}

export function clearGtfsRuntimeCaches(): void {
  runtimeCacheEpoch += 1;
  manifestCache = undefined;
  artifactCache.clear();
  lineLookupCache.clear();
  compiledArtifactCache.clear();
}

export function normalizeLineArtifactKey(value: string): string {
  return encodeURIComponent(value.trim().replace(/^line:/iu, ""));
}

export async function readGtfsJson<T>(
  event: H3Event | undefined,
  key: string,
): Promise<{ value?: T; storage: GtfsPublicStatus["storage"] }> {
  const bucket = getCloudflareEnv(event)?.GTFS_DATA_BUCKET;
  if (bucket) {
    const object = await bucket.get(`gtfs/${key}`);
    const value = object
      ? object.json
        ? await object.json<T>()
        : (JSON.parse(await object.text()) as T)
      : undefined;
    return { value, storage: "r2" };
  }

  try {
    const value = await useStorage("gtfs").getItem<T>(key);
    if (value !== null && value !== undefined) {
      return { value, storage: "local" };
    }
  } catch {
    // Production has no writable filesystem storage; try the committed assets.
  }

  if (event) {
    try {
      const request = new Request(
        new URL(createCommittedGtfsAssetPath(key), getRequestURL(event).origin),
        { headers: { Accept: "application/json" } },
      );
      const response = getCloudflareEnv(event)?.ASSETS
        ? await getCloudflareEnv(event)!.ASSETS!.fetch(request)
        : await fetch(request);
      if (response.ok) {
        return { value: (await response.json()) as T, storage: "local" };
      }
    } catch {
      // Missing committed assets keep the provider unavailable so fallbacks can run.
    }
  }

  return { storage: "unconfigured" };
}

function getCloudflareEnv(event?: H3Event): CloudflareEnv | undefined {
  return (event?.context as { cloudflare?: { env?: CloudflareEnv } } | undefined)?.cloudflare?.env;
}

function detectStorage(event?: H3Event): GtfsPublicStatus["storage"] {
  if (getCloudflareEnv(event)?.GTFS_DATA_BUCKET) return "r2";

  return "local";
}

export function createCommittedGtfsAssetPath(key: string): string {
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${COMMITTED_GTFS_ASSET_BASE}/${encodedKey}`;
}
