import fs from "node:fs/promises";
import path from "node:path";
import type { NetexRuntimeEnv } from "../topology/netexCache";
import {
  getNetexRuntimeEnv,
} from "../topology/netexCache";
import type {
  AnnualRidershipCurrentPointer,
  AnnualRidershipLineDocument,
  AnnualRidershipLineIndex,
  AnnualRidershipLineResponse,
  AnnualRidershipManifest,
  MonthlyRidershipAvailability,
  MonthlyRidershipLineDocument,
  MonthlyRidershipIndex,
  AnnualRidershipStationDocument,
  AnnualRidershipStationIndex,
  AnnualRidershipStationResponse,
  AnnualRidershipStatusResponse,
} from "../../../src/types/ridership";
import {
  canonicalStations,
  decorateLineWithRankings,
  rankNetworkStation,
  rankStations,
} from "./ridershipRanking";

type RidershipCacheSource = {
  kind: "remote" | "directory" | "r2";
  root: string;
  bucket?: string;
  env?: NetexRuntimeEnv;
  prefix?: string;
  warning?: string;
};

type RidershipCacheConfig = {
  kind: "remote" | "local" | "auto";
  value?: string;
};

type RidershipSnapshot = {
  source: RidershipCacheSource;
  current: AnnualRidershipCurrentPointer;
  manifest: AnnualRidershipManifest;
  lineIndex: AnnualRidershipLineIndex;
  stationIndex?: AnnualRidershipStationIndex;
  monthlyIndex?: MonthlyRidershipIndex;
};

const DEFAULT_MEMORY_CACHE_TTL_MS = 300_000;
const sourcePromises = new Map<string, Promise<RidershipCacheSource>>();
const snapshotPromises = new Map<string, TimedPromiseCacheEntry<RidershipSnapshot>>();
const linePromises = new Map<string, TimedPromiseCacheEntry<AnnualRidershipLineResponse>>();
const monthlyLinePromises = new Map<string, TimedPromiseCacheEntry<MonthlyRidershipLineDocument>>();
const allLinePromises = new Map<string, TimedPromiseCacheEntry<AnnualRidershipLineDocument[]>>();

type TimedPromiseCacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

export async function getRidershipStatus(
  runtimeEnv?: NetexRuntimeEnv,
): Promise<AnnualRidershipStatusResponse> {
  try {
    const snapshot = await loadRidershipSnapshot(runtimeEnv);
    return {
      available: true,
      version: snapshot.current.version,
      generatedAt: snapshot.manifest.generatedAt,
      requestedYear: snapshot.manifest.requestedYear,
      actualYears: snapshot.manifest.actualYears,
      counts: snapshot.manifest.counts,
      source: {
        kind: snapshot.source.kind,
        location: snapshot.source.root,
      },
      warning: snapshot.source.warning,
    };
  } catch (error) {
    return {
      available: false,
      source: getConfiguredRidershipSourceHint(runtimeEnv),
      message: error instanceof Error ? error.message : "Ridership cache could not be loaded.",
    };
  }
}

export async function getRidershipLine(
  lineId: string,
  runtimeEnv?: NetexRuntimeEnv,
): Promise<AnnualRidershipLineResponse> {
  const normalizedLineId = decodeRidershipLineId(lineId);
  const snapshot = await loadRidershipSnapshot(runtimeEnv);
  const sourceId = createSourceId(snapshot.source);
  const cacheKey = `${sourceId}:${snapshot.current.version}:${normalizedLineId}`;
  const cached = getTimedCacheEntry(linePromises, cacheKey);
  if (cached) return cached;

  const request = (async () => {
    const line = await loadRidershipLineDocument(snapshot, normalizedLineId);
    const lines = await loadAllRidershipLines(snapshot, line, getMemoryCacheTtlMs(runtimeEnv));
    const rankedLine = decorateLineWithRankings(line, lines);
    const monthlyAvailability = monthlyAvailabilityForLine(snapshot.monthlyIndex, normalizedLineId);
    return {
      ...rankedLine,
      sources: snapshot.lineIndex.sources,
      ...(monthlyAvailability ? { monthlyAvailability } : {}),
    };
  })();
  setTimedCacheEntry(linePromises, cacheKey, request, getMemoryCacheTtlMs(runtimeEnv));
  return request;
}

export async function getRidershipMonthlyLine(
  lineId: string,
  runtimeEnv?: NetexRuntimeEnv,
): Promise<MonthlyRidershipLineDocument> {
  const normalizedLineId = decodeRidershipLineId(lineId);
  const snapshot = await loadRidershipSnapshot(runtimeEnv);
  if (!snapshot.monthlyIndex) throw new Error("Monthly ridership data is not available.");
  const sourceId = createSourceId(snapshot.source);
  const cacheKey = `${sourceId}:${snapshot.current.version}:${normalizedLineId}`;
  const cached = getTimedCacheEntry(monthlyLinePromises, cacheKey);
  if (cached) return cached;

  const request = (async () => {
    const entry = snapshot.monthlyIndex?.lines.find((candidate) =>
      candidate.id === normalizedLineId || candidate.code === normalizedLineId || candidate.label === normalizedLineId,
    );
    if (!entry) throw new Error(`Monthly ridership data is unavailable for line ${normalizedLineId}.`);
    const document = await readCacheJson<MonthlyRidershipLineDocument>(
      snapshot.source,
      `versions/${snapshot.current.version}/${entry.file}`,
    );
    if (document.schemaVersion !== 1 || document.id !== entry.id) {
      throw new Error(`Monthly ridership document is invalid for line ${normalizedLineId}.`);
    }
    return document;
  })();
  setTimedCacheEntry(monthlyLinePromises, cacheKey, request, getMemoryCacheTtlMs(runtimeEnv));
  return request;
}

export async function getRidershipStation(
  stationId: string,
  lineId?: string,
  runtimeEnv?: NetexRuntimeEnv,
): Promise<AnnualRidershipStationResponse> {
  const snapshot = await loadRidershipSnapshot(runtimeEnv);
  const normalizedStationId = decodeRidershipStationId(stationId);
  const normalizedLineId = lineId ? decodeRidershipLineId(lineId) : undefined;
  const contextLine = normalizedLineId
    ? await loadRidershipLineDocument(snapshot, normalizedLineId)
    : undefined;
  const lines = await loadAllRidershipLines(
    snapshot,
    contextLine,
    getMemoryCacheTtlMs(runtimeEnv),
  );
  const rankedContextLine = contextLine
    ? decorateLineWithRankings(contextLine, lines)
    : undefined;
  const contextStation = rankedContextLine?.stations.find((station) => station.id === normalizedStationId);
  const indexedStation = await loadRidershipStationFromIndex(snapshot, normalizedStationId);
  const globalStation = canonicalStations(lines).find((station) => station.id === normalizedStationId);
  const station = contextStation ?? globalStation ?? indexedStation;
  if (!station) throw new Error(`Ridership data is unavailable for station ${normalizedStationId}.`);

  const networkRanking = rankNetworkStation(normalizedStationId, lines) ??
    rankStations(normalizedStationId, getIndexedStationDocuments(snapshot));
  const rankings = contextStation?.rankings ?? (networkRanking ? { network: networkRanking } : {});

  return {
    ...station,
    sources: snapshot.lineIndex.sources,
    rankings,
    ...(contextLine
      ? {
        context: {
          lineId: contextLine.id,
          mode: contextLine.mode,
        },
      }
      : {}),
  };
}

export function clearRidershipMemoryCache(): void {
  sourcePromises.clear();
  snapshotPromises.clear();
  linePromises.clear();
  monthlyLinePromises.clear();
  allLinePromises.clear();
}

async function loadRidershipSnapshot(runtimeEnv?: NetexRuntimeEnv): Promise<RidershipSnapshot> {
  const source = await resolveRidershipCacheSource(runtimeEnv);
  const sourceId = createSourceId(source);
  const cached = getTimedCacheEntry(snapshotPromises, sourceId);
  if (cached) return cached;

  const request = (async (): Promise<RidershipSnapshot> => {
    const current = await readCacheJson<AnnualRidershipCurrentPointer>(source, "current.json");
    const manifest = await readCacheJson<AnnualRidershipManifest>(source, current.manifest);
    const lineIndex = await readCacheJson<AnnualRidershipLineIndex>(
      source,
      `versions/${current.version}/${manifest.files.lines}`,
    );
    if (manifest.version !== current.version) {
      throw new Error("Ridership current.json points to a different manifest version.");
    }
    if (lineIndex.schemaVersion !== 2 || !Array.isArray(lineIndex.lines) || !Array.isArray(lineIndex.sources)) {
      throw new Error("Ridership lines/index.json has an invalid compact schema.");
    }
    const stationIndex = await loadRidershipStationIndex(source, current, manifest);
    const monthlyIndex = await loadMonthlyRidershipIndex(source, current, manifest);
    return {
      source,
      current,
      manifest,
      lineIndex,
      ...(stationIndex ? { stationIndex } : {}),
      ...(monthlyIndex ? { monthlyIndex } : {}),
    };
  })();
  setTimedCacheEntry(snapshotPromises, sourceId, request, getMemoryCacheTtlMs(runtimeEnv));
  return request;
}

async function loadMonthlyRidershipIndex(
  source: RidershipCacheSource,
  current: AnnualRidershipCurrentPointer,
  manifest: AnnualRidershipManifest,
): Promise<MonthlyRidershipIndex | undefined> {
  if (!manifest.files.monthly) return undefined;
  try {
    const index = await readCacheJson<MonthlyRidershipIndex>(
      source,
      `versions/${current.version}/${manifest.files.monthly}`,
    );
    if (index.schemaVersion !== 1 || !Array.isArray(index.lines) || !Array.isArray(index.sources)) return undefined;
    return index;
  } catch {
    // A line-only annual cache remains fully usable when a newer monthly
    // artifact was not published.
    return undefined;
  }
}

function monthlyAvailabilityForLine(
  index: MonthlyRidershipIndex | undefined,
  lineId: string,
): MonthlyRidershipAvailability | undefined {
  const entry = index?.lines.find((candidate) =>
    candidate.id === lineId || candidate.code === lineId || candidate.label === lineId,
  );
  if (!entry) return undefined;
  return {
    hasMonthlyHistory: entry.hasMonthlyHistory,
    historyYears: entry.historyYears,
    retainedStationCount: entry.retainedStationCount,
    excludedStationCount: entry.excludedStationCount,
    stationDetail: entry.stationDetail,
  };
}

async function loadRidershipStationIndex(
  source: RidershipCacheSource,
  current: AnnualRidershipCurrentPointer,
  manifest: AnnualRidershipManifest,
): Promise<AnnualRidershipStationIndex | undefined> {
  if (!manifest.files.stations) return undefined;
  try {
    const stationIndex = await readCacheJson<AnnualRidershipStationIndex>(
      source,
      `versions/${current.version}/${manifest.files.stations}`,
    );
    if (stationIndex.schemaVersion !== 2 || !Array.isArray(stationIndex.stations)) return undefined;
    return stationIndex;
  } catch {
    // The station index was added after the line-only cache. Keep old or
    // partially published caches usable through their embedded line stations.
    return undefined;
  }
}

async function loadRidershipLineDocument(
  snapshot: RidershipSnapshot,
  lineId: string,
): Promise<AnnualRidershipLineDocument> {
  let line: AnnualRidershipLineDocument;
  const directPath = `versions/${snapshot.current.version}/lines/${encodeURIComponent(lineId)}.json`;
  try {
    line = await readCacheJson<AnnualRidershipLineDocument>(snapshot.source, directPath);
  } catch (directError) {
    const entry = snapshot.lineIndex.lines.find((candidate) =>
      candidate.id === lineId || candidate.code === lineId || candidate.label === lineId,
    );
    if (!entry) {
      throw directError instanceof Error
        ? directError
        : new Error(`Ridership data is unavailable for line ${lineId}.`);
    }
    line = await readCacheJson<AnnualRidershipLineDocument>(
      snapshot.source,
      `versions/${snapshot.current.version}/${entry.file}`,
    );
  }

  return line;
}

async function loadRidershipStationFromIndex(
  snapshot: RidershipSnapshot,
  stationId: string,
): Promise<AnnualRidershipStationDocument | undefined> {
  const entry = snapshot.stationIndex?.stations.find((candidate) => candidate.id === stationId);
  if (!entry) return undefined;

  if (entry.file) {
    try {
      return await readCacheJson<AnnualRidershipStationDocument>(
        snapshot.source,
        `versions/${snapshot.current.version}/${entry.file}`,
      );
    } catch {
      // Fall through to the compact index entry when the individual document
      // is missing but the index still contains a usable primary value.
    }
  }

  return {
    id: entry.id,
    name: entry.name,
    ...(entry.city ? { city: entry.city } : {}),
    lineIds: entry.lineIds ?? [],
    measures: [],
    primary: entry.primary,
  };
}

function getIndexedStationDocuments(snapshot: RidershipSnapshot): AnnualRidershipStationDocument[] {
  return (snapshot.stationIndex?.stations ?? []).map((entry) => ({
    id: entry.id,
    name: entry.name,
    ...(entry.city ? { city: entry.city } : {}),
    lineIds: entry.lineIds ?? [],
    measures: [],
    primary: entry.primary,
  }));
}

async function loadAllRidershipLines(
  snapshot: RidershipSnapshot,
  knownLine: AnnualRidershipLineDocument | undefined,
  ttlMs: number,
): Promise<AnnualRidershipLineDocument[]> {
  const cacheKey = `${createSourceId(snapshot.source)}:${snapshot.current.version}`;
  const cached = getTimedCacheEntry(allLinePromises, cacheKey);
  if (cached) return cached;

  const request = Promise.all(snapshot.lineIndex.lines.map(async (entry) => {
    if (knownLine?.id === entry.id) return knownLine;
    try {
      return await readCacheJson<AnnualRidershipLineDocument>(
        snapshot.source,
        `versions/${snapshot.current.version}/${entry.file}`,
      );
    } catch {
      return undefined;
    }
  })).then((lines) => lines.filter((line): line is AnnualRidershipLineDocument => Boolean(line)));

  setTimedCacheEntry(allLinePromises, cacheKey, request, ttlMs);
  return request;
}

async function resolveRidershipCacheSource(
  runtimeEnv?: NetexRuntimeEnv,
): Promise<RidershipCacheSource> {
  const config = getConfiguredRidershipCacheConfig(runtimeEnv);
  const cacheKey = `${config.kind}:${config.value ?? "__auto__"}`;
  const cached = sourcePromises.get(cacheKey);
  if (cached) return cached;

  const request = findRidershipCacheSource(config, getRuntimeEnv(runtimeEnv));
  sourcePromises.set(cacheKey, request);
  request.catch(() => {
    if (sourcePromises.get(cacheKey) === request) sourcePromises.delete(cacheKey);
  });
  return request;
}

async function findRidershipCacheSource(
  config: RidershipCacheConfig,
  runtimeEnv?: NetexRuntimeEnv,
): Promise<RidershipCacheSource> {
  if (config.kind === "remote") {
    const remote = config.value ?? "";
    if (isR2Url(remote)) {
      const source = parseR2CacheSource(remote, runtimeEnv);
      validateR2Config(runtimeEnv);
      return source;
    }
    if (isHttpUrl(remote)) return { kind: "remote", root: trimTrailingSlashes(remote) };
    throw new Error(
      `Invalid IDFM_RIDERSHIP_CACHE_REMOTE value "${remote}". Expected r2:// or HTTP(S).`,
    );
  }

  const candidates = config.kind === "local" && config.value
    ? [config.value]
    : [
      path.resolve(process.cwd(), "public/data/ridership"),
      path.resolve(process.cwd(), "../idfm-node-backend/public/data/ridership"),
    ];
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(path.join(candidate, "current.json"));
      if (stat.isFile()) {
        return {
          kind: "directory",
          root: candidate,
          warning: "Using a local ridership cache. Production should use the private R2 cache.",
        };
      }
    } catch {
      // Continue with the next local candidate.
    }
  }

  if (config.kind === "auto" && config.value) {
    const fallback = config.value;
    if (isR2Url(fallback)) {
      const source = parseR2CacheSource(fallback, runtimeEnv);
      validateR2Config(runtimeEnv);
      return source;
    }
    if (isHttpUrl(fallback)) {
      return { kind: "remote", root: trimTrailingSlashes(fallback) };
    }
  }

  throw new Error(
    "Ridership cache not found locally or in its configured remote fallback. Set IDFM_RIDERSHIP_CACHE_REMOTE or IDFM_RIDERSHIP_CACHE_LOCAL.",
  );
}

function getConfiguredRidershipCacheConfig(runtimeEnv?: NetexRuntimeEnv): RidershipCacheConfig {
  const env = getRuntimeEnv(runtimeEnv);
  const remote = env.IDFM_RIDERSHIP_CACHE_REMOTE?.trim();
  const local = env.IDFM_RIDERSHIP_CACHE_LOCAL?.trim();
  if (remote) return { kind: "remote", value: remote };
  if (local) return { kind: "local", value: local };

  const netexRemote = env.IDFM_NETEX_CACHE_REMOTE?.trim();
  if (netexRemote && isR2Url(netexRemote)) {
    const netex = new URL(netexRemote);
    // NeTEx and ridership share the bucket, but local ridership artifacts are
    // useful during development and must win before the R2 fallback.
    return { kind: "auto", value: `r2://${netex.hostname}/ridership` };
  }
  return { kind: "auto" };
}

function getConfiguredRidershipSourceHint(
  runtimeEnv?: NetexRuntimeEnv,
): AnnualRidershipStatusResponse["source"] {
  const config = getConfiguredRidershipCacheConfig(runtimeEnv);
  if (config.kind === "auto") {
    if (config.value) {
      return {
        kind: isR2Url(config.value) ? "r2" : "remote",
        location: config.value,
      };
    }
    return { kind: "auto", location: "public/data/ridership or ../idfm-node-backend/public/data/ridership" };
  }
  return {
    kind: config.kind === "local" ? "directory" : isR2Url(config.value ?? "") ? "r2" : "remote",
    location: config.value ?? "",
  };
}

function getRuntimeEnv(runtimeEnv?: NetexRuntimeEnv): NetexRuntimeEnv {
  return getNetexRuntimeEnv(runtimeEnv);
}

function getMemoryCacheTtlMs(runtimeEnv?: NetexRuntimeEnv): number {
  const env = getRuntimeEnv(runtimeEnv);
  const configured = env.IDFM_RIDERSHIP_CACHE_MEMORY_TTL_MS ?? env.IDFM_NETEX_CACHE_MEMORY_TTL_MS;
  const parsed = configured ? Number(configured) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MEMORY_CACHE_TTL_MS;
}

function getTimedCacheEntry<T>(
  cache: Map<string, TimedPromiseCacheEntry<T>>,
  key: string,
): Promise<T> | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() <= entry.expiresAt) return entry.promise;
  cache.delete(key);
  return undefined;
}

function setTimedCacheEntry<T>(
  cache: Map<string, TimedPromiseCacheEntry<T>>,
  key: string,
  promise: Promise<T>,
  ttlMs: number,
): void {
  const entry = { expiresAt: Date.now() + ttlMs, promise };
  cache.set(key, entry);
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
}

async function readCacheJson<T>(source: RidershipCacheSource, relativePath: string): Promise<T> {
  const safePath = normalizeCachePath(relativePath);
  if (source.kind === "directory") {
    return JSON.parse(await fs.readFile(path.join(source.root, safePath), "utf8")) as T;
  }
  if (source.kind === "remote") {
    const response = await fetch(`${source.root}/${safePath}`);
    if (!response.ok) {
      throw new Error(`Ridership cache request failed for ${safePath}: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }
  const response = await fetchSignedR2Object(source, safePath);
  if (!response.ok) {
    throw new Error(`Ridership R2 request failed for ${safePath}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

function normalizeCachePath(value: string): string {
  const normalized = value.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "..")) {
    throw new Error(`Invalid ridership cache path: ${value}`);
  }
  return normalized;
}

function decodeRidershipLineId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeRidershipStationId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseR2CacheSource(value: string, runtimeEnv?: NetexRuntimeEnv): RidershipCacheSource {
  const url = new URL(value);
  const bucket = url.hostname;
  const prefix = url.pathname.replace(/^\/+|\/+$/gu, "");
  if (!bucket) throw new Error(`Invalid R2 ridership cache URL: ${value}`);
  return {
    kind: "r2",
    root: `r2://${bucket}${prefix ? `/${prefix}` : ""}`,
    bucket,
    prefix,
    env: getRuntimeEnv(runtimeEnv),
  };
}

function validateR2Config(runtimeEnv?: NetexRuntimeEnv): void {
  const env = getRuntimeEnv(runtimeEnv);
  const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]
    .filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`R2 ridership cache is missing ${missing.join(", ")}.`);
}

async function fetchSignedR2Object(source: RidershipCacheSource, relativePath: string): Promise<Response> {
  if (!source.bucket) throw new Error("R2 ridership source has no bucket.");
  const objectKey = [source.prefix, relativePath].filter(Boolean).join("/");
  const endpoint = source.env?.R2_ENDPOINT?.replace(/\/+$/u, "") ||
    `https://${requiredEnv("R2_ACCOUNT_ID", source.env)}.r2.cloudflarestorage.com`;
  const requestUrl = new URL(`${endpoint}/${encodeURIComponent(source.bucket)}/${encodeObjectKey(objectKey)}`);
  const headers = await createR2SignedHeaders(requestUrl, source.env);
  return fetch(requestUrl, { method: "GET", headers });
}

async function createR2SignedHeaders(url: URL, runtimeEnv?: NetexRuntimeEnv): Promise<Headers> {
  const env = getRuntimeEnv(runtimeEnv);
  const now = new Date();
  const amzDate = formatAmzDate(now);
  const dateScope = amzDate.slice(0, 8);
  const payloadHash = "UNSIGNED-PAYLOAD";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = `host:${url.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const canonicalRequest = ["GET", url.pathname, url.searchParams.toString(), canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateScope}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hex(canonicalRequest)].join("\n");
  const signature = await signR2Request(requiredEnv("R2_SECRET_ACCESS_KEY", env), dateScope, stringToSign);
  return new Headers({
    Authorization: `AWS4-HMAC-SHA256 Credential=${requiredEnv("R2_ACCESS_KEY_ID", env)}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  });
}

async function signR2Request(secret: string, dateScope: string, stringToSign: string): Promise<string> {
  const dateKey = await hmac(`AWS4${secret}`, dateScope);
  const regionKey = await hmac(dateKey, "auto");
  const serviceKey = await hmac(regionKey, "s3");
  const signingKey = await hmac(serviceKey, "aws4_request");
  return toHex(await hmac(signingKey, stringToSign));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}

async function hmac(key: string | ArrayBuffer, value: string): Promise<ArrayBuffer> {
  const rawKey = typeof key === "string" ? new TextEncoder().encode(key) : new Uint8Array(key);
  const cryptoKey = await globalThis.crypto.subtle.importKey("raw", rawKey, { hash: "SHA-256", name: "HMAC" }, false, ["sign"]);
  return globalThis.crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
}

function requiredEnv(name: string, env?: NetexRuntimeEnv): string {
  const value = getRuntimeEnv(env)[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/gu, "");
}

function encodeObjectKey(value: string): string {
  return value.split("/").map((part) => {
    try {
      // Generated filenames already contain percent-encoded line IDs. Decode
      // once before signing so R2 receives `%3A`, not `%253A`.
      return encodeURIComponent(decodeURIComponent(part));
    } catch {
      return encodeURIComponent(part);
    }
  }).join("/");
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/u, "");
}

function createSourceId(source: RidershipCacheSource): string {
  return `${source.kind}:${source.root}`;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//iu.test(value);
}

function isR2Url(value: string): boolean {
  return /^r2:\/\//iu.test(value);
}
