import type { H3Event } from "h3";
import {
  getTrafficLineStatus,
  normalizeIdfmGlobalTrafficPayload,
  normalizeNavitiaLineReportPayload,
  normalizeTrafficLineRef,
} from "../../../src/features/traffic/trafficNormalization";
import type {
  TrafficCacheMetadata,
  TrafficLineReport,
  TrafficResponse,
} from "../../../src/features/traffic/types";
import {
  getServerIdfmApiKey,
  getServerIdfmDatasetKey,
} from "./resolveStopArea";
import {
  DEFAULT_TRAFFIC_LOCALE,
  getTrafficAcceptLanguage,
  isTrafficLocale,
  type TrafficLocale,
} from "../../../src/features/traffic/trafficLocale";

export const TRAFFIC_GLOBAL_REFRESH_INTERVAL_MS = 150_000;
export const TRAFFIC_DETAIL_REFRESH_AFTER_MS = 60_000;
export const TRAFFIC_TIMEOUT_MS = 4_000;
export const TRAFFIC_PERSISTENCE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const IDFM_MARKETPLACE_BASE =
  "https://prim.iledefrance-mobilites.fr/marketplace";
export const IDFM_TRAFFIC_GLOBAL_URL =
  `${IDFM_MARKETPLACE_BASE}/disruptions_bulk/disruptions/v2`;

type TrafficSource = "prim-disruptions-bulk" | "mixed-cache";

interface CloudflareKvLike {
  get<T>(key: string, type: "json"): Promise<T | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
}

interface TrafficCacheRecord {
  configured: true;
  locale: TrafficLocale;
  generatedAt: string;
  refreshedAt: string;
  expiresAt: number;
  lastRefreshAttemptAt?: number;
  retryAt?: number;
  lastError?: string;
  source: TrafficSource;
  lines: TrafficLineReport[];
}

interface TrafficMemoryEntry {
  record: TrafficCacheRecord;
  storage: "memory" | "persistent";
}

interface TrafficSnapshotOptions {
  force?: boolean;
  locale?: TrafficLocale;
}

interface TrafficSnapshotResult {
  response: TrafficResponse;
  record?: TrafficCacheRecord;
  cacheKey?: string;
}

interface TrafficGlobalError extends Error {
  status?: number;
}

interface TrafficCredentials {
  lineApiKey: string;
  globalApiKey: string;
  globalAuth: "apikey" | "authorization-apikey";
}

const globalSnapshotMemory = new Map<string, TrafficMemoryEntry>();
const globalRequests = new Map<string, Promise<TrafficSnapshotResult>>();
const lineReportCache = new Map<
  string,
  {
    expiresAt: number;
    promise: Promise<TrafficLineReport>;
  }
>();

/**
 * Return one process-safe snapshot for every consumer. The persistent layer
 * is deliberately read before an upstream request so a new Cloudflare
 * isolate can continue serving the last known data.
 */
export async function getTrafficSnapshot(
  event: H3Event,
  options: TrafficSnapshotOptions = {},
): Promise<TrafficSnapshotResult> {
  const credentials = getTrafficCredentials(event);
  if (!credentials.globalApiKey) {
    return {
      response: createUnconfiguredResponse(),
    };
  }

  const locale = options.locale ?? DEFAULT_TRAFFIC_LOCALE;
  const cacheKey = createTrafficCacheKey(credentials.globalApiKey, locale);
  const loaded = await loadSnapshot(event, cacheKey);
  const now = Date.now();
  const force = options.force === true;

  if (loaded && loaded.record.expiresAt > now && !force) {
    return createSnapshotResult(loaded.record, cacheKey, "hit", loaded.storage);
  }

  const existingRequest = globalRequests.get(cacheKey);
  if (existingRequest) return existingRequest;

  const lastAttemptAt = loaded?.record.lastRefreshAttemptAt ?? 0;
  const refreshTooRecent =
    lastAttemptAt > 0 &&
    now - lastAttemptAt < TRAFFIC_GLOBAL_REFRESH_INTERVAL_MS;

  if (refreshTooRecent) {
    return createSnapshotResult(
      loaded?.record,
      cacheKey,
      force || loaded?.record.lastError ? "rate-limited" : "stale",
      loaded?.storage,
    );
  }

  const request = refreshGlobalSnapshot(
    event,
    credentials.globalApiKey,
    credentials.globalAuth,
    locale,
    cacheKey,
    loaded,
  );
  globalRequests.set(cacheKey, request);

  try {
    return await request;
  } finally {
    if (globalRequests.get(cacheKey) === request) {
      globalRequests.delete(cacheKey);
    }
  }
}

export function refreshTrafficSnapshot(
  event: H3Event,
  locale: TrafficLocale = DEFAULT_TRAFFIC_LOCALE,
): Promise<TrafficSnapshotResult> {
  return getTrafficSnapshot(event, { force: true, locale });
}

export async function getTrafficCacheStatus(
  event: H3Event,
  locale: TrafficLocale = DEFAULT_TRAFFIC_LOCALE,
): Promise<{ configured: boolean; generatedAt: string; source: TrafficResponse["source"]; cache: TrafficCacheMetadata }> {
  const credentials = getTrafficCredentials(event);
  if (!credentials.globalApiKey) {
    const response = createUnconfiguredResponse();
    return {
      configured: false,
      generatedAt: response.generatedAt,
      source: response.source,
      cache: response.cache!,
    };
  }

  const cacheKey = createTrafficCacheKey(credentials.globalApiKey, locale);
  const loaded = await loadSnapshot(event, cacheKey);
  const refreshing = globalRequests.has(cacheKey);
  const cache = createCacheMetadata(
    loaded?.record,
    refreshing,
    loaded?.storage,
  );

  return {
    configured: true,
    generatedAt: loaded?.record.generatedAt ?? new Date().toISOString(),
    source: loaded?.record.source ?? "prim-disruptions-bulk",
    cache,
  };
}

/**
 * Explicit detail refresh used only for the currently selected line. A
 * successful report is merged into the global snapshot without changing the
 * global freshness timestamp, so one detailed lookup cannot make all other
 * lines look freshly polled.
 */
export async function refreshTrafficLineDetail(
  event: H3Event,
  lineRef: string,
  locale: TrafficLocale = DEFAULT_TRAFFIC_LOCALE,
): Promise<TrafficLineReport> {
  const normalizedLineRef = normalizeTrafficLineRef(lineRef);
  const credentials = getTrafficCredentials(event);
  if (!credentials.lineApiKey) {
    return {
      disruptions: [],
      error: "IDFM_API_KEY or NUXT_IDFM_API_KEY is missing on the server.",
      lineRef: normalizedLineRef,
      status: "error",
    };
  }

  const report = await fetchTrafficLineReport(
    event,
    normalizedLineRef,
    credentials.lineApiKey,
    locale,
  );
  if (report.status !== "error") {
    await mergeTrafficLineReport(
      event,
      credentials.globalApiKey,
      locale,
      report,
    );
  }
  return report;
}

/**
 * Compatibility entry point for server consumers that need a single report.
 * New request handlers should use `refreshTrafficLineDetail` so successful
 * details are also merged into the shared snapshot.
 */
export function fetchIdfmTrafficLineReport(
  lineRef: string,
  apiKey: string,
  locale: TrafficLocale = DEFAULT_TRAFFIC_LOCALE,
): Promise<TrafficLineReport> {
  return fetchTrafficLineReport(
    undefined,
    normalizeTrafficLineRef(lineRef),
    apiKey,
    locale,
  );
}

export async function fetchTrafficLineReport(
  event: H3Event | undefined,
  lineRef: string,
  apiKey: string,
  locale: TrafficLocale = DEFAULT_TRAFFIC_LOCALE,
): Promise<TrafficLineReport> {
  const normalizedLineRef = normalizeTrafficLineRef(lineRef);
  const cacheKey = `${createTrafficCacheKey(apiKey, locale)}:${normalizedLineRef}`;
  const now = Date.now();
  const cached = lineReportCache.get(cacheKey);

  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = fetchLineReport(normalizedLineRef, apiKey, locale);
  lineReportCache.set(cacheKey, {
    expiresAt: now + TRAFFIC_DETAIL_REFRESH_AFTER_MS,
    promise,
  });
  promise.catch(() => lineReportCache.delete(cacheKey));

  // Keep the event parameter in the signature for callers that need the
  // shared-cache path; the actual upstream request is independent of it.
  void event;
  return promise;
}

export function resetTrafficCacheForTests(): void {
  globalSnapshotMemory.clear();
  globalRequests.clear();
  lineReportCache.clear();
}

async function refreshGlobalSnapshot(
  event: H3Event,
  apiKey: string,
  auth: TrafficCredentials["globalAuth"],
  locale: TrafficLocale,
  cacheKey: string,
  loaded: TrafficMemoryEntry | undefined,
): Promise<TrafficSnapshotResult> {
  const now = Date.now();
  const previous = loaded?.record;
  const attempted: TrafficCacheRecord = previous
    ? {
        ...previous,
        lastRefreshAttemptAt: now,
      }
    : {
        configured: true,
        locale,
        generatedAt: new Date(now).toISOString(),
        refreshedAt: new Date(now).toISOString(),
        expiresAt: 0,
        lastRefreshAttemptAt: now,
        source: "prim-disruptions-bulk",
        lines: [],
      };

  globalSnapshotMemory.set(cacheKey, {
    record: attempted,
    storage: loaded?.storage ?? "memory",
  });

  try {
    const payload = await fetchGlobalTrafficPayload(event, apiKey, auth, locale);
    const lines = normalizeIdfmGlobalTrafficPayload(payload);
    const refreshedAt = new Date(Date.now()).toISOString();
    const record: TrafficCacheRecord = {
      configured: true,
      locale,
      generatedAt: refreshedAt,
      refreshedAt,
      expiresAt: Date.now() + TRAFFIC_GLOBAL_REFRESH_INTERVAL_MS,
      lastRefreshAttemptAt: now,
      source: "prim-disruptions-bulk",
      lines,
    };
    const storage = await persistSnapshot(event, cacheKey, record);
    globalSnapshotMemory.set(cacheKey, { record, storage });
    console.info(
      `[traffic] global cache-miss refreshed locale=${locale} ` +
        `lines=${lines.length} source=prim-disruptions-bulk`,
    );
    return createSnapshotResult(record, cacheKey, "miss", storage);
  } catch (error) {
    const trafficError = toTrafficGlobalError(error);
    const staleRecord: TrafficCacheRecord = {
      ...attempted,
      lastRefreshAttemptAt: now,
      retryAt: now + TRAFFIC_GLOBAL_REFRESH_INTERVAL_MS,
      lastError: trafficError.message,
    };
    const storage = await persistSnapshot(event, cacheKey, staleRecord);
    globalSnapshotMemory.set(cacheKey, { record: staleRecord, storage });
    console.warn(
      `[traffic] global stale status=${trafficError.status ?? "error"} ` +
        `hasSnapshot=${staleRecord.lines.length > 0}`,
    );
    return createSnapshotResult(
      staleRecord,
      cacheKey,
      trafficError.status === 429 ? "rate-limited" : "error",
      storage,
    );
  }
}

async function fetchGlobalTrafficPayload(
  event: H3Event,
  apiKey: string,
  auth: TrafficCredentials["globalAuth"],
  locale: TrafficLocale,
): Promise<unknown> {
  const url = getTrafficGlobalUrl(event);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRAFFIC_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "accept-language": getTrafficAcceptLanguage(locale),
    };
    if (auth === "authorization-apikey") {
      // PRIM dataset tokens are documented as `Authorization: apikey <token>`.
      headers.Authorization = `apikey ${apiKey}`;
    } else {
      headers.apikey = apiKey;
    }

    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = new Error(`${response.status} ${response.statusText}`) as TrafficGlobalError;
      error.status = response.status;
      throw error;
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchLineReport(
  lineRef: string,
  apiKey: string,
  locale: TrafficLocale,
): Promise<TrafficLineReport> {
  try {
    const searchParams = new URLSearchParams({
      count: "100",
      disable_geojson: "true",
    });
    const url =
      `${IDFM_MARKETPLACE_BASE}/v2/navitia/line_reports/lines/` +
      `${encodeURIComponent(lineRef)}/line_reports?${searchParams}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRAFFIC_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          accept: "application/json",
          "accept-language": getTrafficAcceptLanguage(locale),
          apikey: apiKey,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const error = new Error(`${response.status} ${response.statusText}`) as TrafficGlobalError;
      error.status = response.status;
      throw error;
    }

    const disruptions = normalizeNavitiaLineReportPayload(
      await response.json(),
      lineRef,
    );

    return {
      disruptions,
      lineRef,
      status: getTrafficLineStatus(disruptions),
    };
  } catch (error) {
    return {
      disruptions: [],
      error:
        error instanceof Error
          ? error.message
          : "Unable to load traffic information.",
      lineRef,
      status: "error",
    };
  }
}

async function mergeTrafficLineReport(
  event: H3Event,
  apiKey: string,
  locale: TrafficLocale,
  report: TrafficLineReport,
): Promise<void> {
  const cacheKey = createTrafficCacheKey(apiKey, locale);
  const loaded = await loadSnapshot(event, cacheKey);
  const previous = loaded?.record;
  if (!previous) return;

  const normalizedLineRef = normalizeTrafficLineRef(report.lineRef);
  const lines = previous.lines.filter(
    (line) => normalizeTrafficLineRef(line.lineRef) !== normalizedLineRef,
  );
  lines.push({ ...report, lineRef: normalizedLineRef });
  const record: TrafficCacheRecord = {
    ...previous,
    source: "mixed-cache",
    lines,
    lastError: undefined,
    retryAt: undefined,
  };
  const storage = await persistSnapshot(event, cacheKey, record);
  globalSnapshotMemory.set(cacheKey, { record, storage });
}

async function loadSnapshot(
  event: H3Event,
  cacheKey: string,
): Promise<TrafficMemoryEntry | undefined> {
  const memory = globalSnapshotMemory.get(cacheKey);
  if (memory) return memory;

  const cloudflareKv = getTrafficCloudflareKv(event);
  if (cloudflareKv) {
    try {
      const stored = await cloudflareKv.get<TrafficCacheRecord>(
        `traffic:global:${cacheKey}`,
        "json",
      );
      if (isTrafficCacheRecord(stored)) {
        const entry = { record: stored, storage: "persistent" as const };
        globalSnapshotMemory.set(cacheKey, entry);
        return entry;
      }
    } catch {
      // Fall through to Nitro storage if the binding is unavailable.
    }
  }

  try {
    const stored = await useStorage("traffic").getItem<TrafficCacheRecord>(cacheKey);
    if (isTrafficCacheRecord(stored)) {
      const entry = { record: stored, storage: "persistent" as const };
      globalSnapshotMemory.set(cacheKey, entry);
      return entry;
    }
  } catch {
    // A persistent driver is optional in local tests and local development.
  }

  return undefined;
}

async function persistSnapshot(
  event: H3Event,
  cacheKey: string,
  record: TrafficCacheRecord,
): Promise<"memory" | "persistent"> {
  const cloudflareKv = getTrafficCloudflareKv(event);
  if (cloudflareKv) {
    try {
      await cloudflareKv.put(
        `traffic:global:${cacheKey}`,
        JSON.stringify(record),
        { expirationTtl: TRAFFIC_PERSISTENCE_TTL_SECONDS },
      );
      return "persistent";
    } catch {
      // Fall through to the configured Nitro storage driver.
    }
  }

  try {
    await useStorage("traffic").setItem(cacheKey, record);
    return "persistent";
  } catch {
    return "memory";
  }
}

function createSnapshotResult(
  record: TrafficCacheRecord | undefined,
  cacheKey: string,
  state: TrafficCacheMetadata["state"],
  storage: "memory" | "persistent" | undefined,
): TrafficSnapshotResult {
  const generatedAt = record?.generatedAt ?? new Date().toISOString();
  const response: TrafficResponse = {
    configured: true,
    generatedAt,
    lines: record?.lines ?? [],
    source: record?.source ?? "prim-disruptions-bulk",
    cache: createCacheMetadata(record, false, storage, state),
  };
  return { response, record, cacheKey };
}

function createUnconfiguredResponse(): TrafficResponse {
  return {
    configured: false,
    generatedAt: new Date().toISOString(),
    lines: [],
    source: "prim-disruptions-bulk",
    cache: {
      state: "error",
      refreshIntervalMs: TRAFFIC_GLOBAL_REFRESH_INTERVAL_MS,
      detailRefreshAfterMs: TRAFFIC_DETAIL_REFRESH_AFTER_MS,
      refreshing: false,
      lastError:
        "IDFM_DATASET_KEY/NUXT_IDFM_DATASET_KEY or IDFM_API_KEY/NUXT_IDFM_API_KEY is missing on the server.",
    },
  };
}

function createCacheMetadata(
  record: TrafficCacheRecord | undefined,
  refreshing: boolean,
  storage: "memory" | "persistent" | undefined,
  explicitState?: TrafficCacheMetadata["state"],
): TrafficCacheMetadata {
  const now = Date.now();
  const ageMs = record ? Math.max(0, now - Date.parse(record.refreshedAt)) : undefined;
  const state = explicitState ?? getCacheState(record, refreshing, now);
  const nextRefreshAt = record
    ? Math.max(record.expiresAt, record.retryAt ?? 0)
    : undefined;

  return {
    state,
    refreshedAt: record?.refreshedAt,
    nextRefreshAt: nextRefreshAt ? new Date(nextRefreshAt).toISOString() : undefined,
    refreshIntervalMs: TRAFFIC_GLOBAL_REFRESH_INTERVAL_MS,
    detailRefreshAfterMs: TRAFFIC_DETAIL_REFRESH_AFTER_MS,
    ageMs,
    refreshing,
    lastError: record?.lastError,
    retryAt: record?.retryAt ? new Date(record.retryAt).toISOString() : undefined,
    storage,
  };
}

function getCacheState(
  record: TrafficCacheRecord | undefined,
  refreshing: boolean,
  now: number,
): TrafficCacheMetadata["state"] {
  if (refreshing) return "refreshing";
  if (!record) return "miss";
  if (record.lastError && record.retryAt && record.retryAt > now) return "rate-limited";
  if (record.expiresAt > now) return "hit";
  if (record.lastError) return "error";
  return "stale";
}

function isTrafficCacheRecord(
  value: TrafficCacheRecord | null | undefined,
): value is TrafficCacheRecord {
  return Boolean(
    value &&
      value.configured === true &&
      isTrafficLocale(value.locale) &&
      typeof value.generatedAt === "string" &&
      typeof value.refreshedAt === "string" &&
      typeof value.expiresAt === "number" &&
      Array.isArray(value.lines),
  );
}

function getTrafficCredentials(event: H3Event): TrafficCredentials {
  const lineApiKey = getServerIdfmApiKey(event);
  const datasetApiKey = getServerIdfmDatasetKey(event);
  const globalApiKey = lineApiKey || datasetApiKey;

  return {
    lineApiKey,
    // The regular PRIM API key is accepted by the working bulk endpoint and
    // must remain preferred when both credentials are present. Keep the
    // dataset credential as a deployment fallback only.
    globalApiKey,
    globalAuth: lineApiKey ? "apikey" : "authorization-apikey",
  };
}

function getTrafficGlobalUrl(event: H3Event): string {
  const env = getTrafficRuntimeEnv(event);
  return (
    env.NUXT_IDFM_TRAFFIC_GLOBAL_URL?.trim() ||
    env.IDFM_TRAFFIC_GLOBAL_URL?.trim() ||
    IDFM_TRAFFIC_GLOBAL_URL
  );
}

function getTrafficRuntimeEnv(
  event: H3Event,
): Record<string, string | undefined> {
  const cloudflareEnv = (event.context as {
    cloudflare?: { env?: Record<string, string | undefined> };
  }).cloudflare?.env;
  const nodeEnv = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;

  return { ...(nodeEnv ?? {}), ...(cloudflareEnv ?? {}) };
}

function getTrafficCloudflareKv(event: H3Event): CloudflareKvLike | undefined {
  return (
    event.context as {
      cloudflare?: { env?: { TRAFFIC_CACHE_KV?: CloudflareKvLike } };
    }
  ).cloudflare?.env?.TRAFFIC_CACHE_KV;
}

function createTrafficCacheKey(apiKey: string, locale: TrafficLocale): string {
  // The API key never appears in a storage key or log line.
  let hash = 2_166_136_261;
  for (const character of apiKey) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return `v1-${(hash >>> 0).toString(16)}-${locale}`;
}

function toTrafficGlobalError(error: unknown): TrafficGlobalError {
  if (error && typeof error === "object" && "status" in error) {
    const candidate = error as TrafficGlobalError;
    if (candidate instanceof Error) return candidate;
  }

  return error instanceof Error
    ? error
    : new Error("Unable to load global traffic information.");
}
