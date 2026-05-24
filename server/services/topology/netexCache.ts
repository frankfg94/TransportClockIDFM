import type {
  LineTopology,
  RawPattern,
  RawStation,
  TopologyBranchLayout,
  TopologyBranch,
  TopologySegment,
  TopologyStation,
} from "./types";

interface NetexCacheIndex {
  generatedAt: string;
  lines: NetexCacheIndexLine[];
}

interface NetexCacheIndexLine {
  code: string;
  id: string | null;
  name: string;
  primLineId: string;
  transportMode?: string | null;
  aliases?: string[];
  file: string;
}

interface NetexCacheSource {
  kind: "remote" | "directory" | "r2";
  root: string;
  bucket?: string;
  env?: NetexRuntimeEnv;
  prefix?: string;
  warning?: string;
}

interface NetexCacheConfig {
  kind: "remote" | "local" | "auto";
  value?: string;
}

export type NetexRuntimeEnv = Record<string, string | undefined>;

type CloudflareEventLike = {
  context?: {
    cloudflare?: {
      env?: NetexRuntimeEnv;
    };
  };
};

export interface NetexCacheStatus {
  available: boolean;
  source?: {
    kind: NetexCacheSource["kind"] | "auto";
    location: string;
  };
  generatedAt?: string;
  lineCount?: number;
  warning?: string;
  message?: string;
}

export interface NetexLineCache {
  generatedAt: string;
  line: {
    id: string | null;
    code: string | null;
    name: string;
    primLineId?: string | null;
    transportMode?: string | null;
    aliases?: string[];
  };
  stations?: NetexRawStation[];
  patterns?: NetexPattern[];
  schematic: {
    schemaVersion: 1;
    line: {
      id: string | null;
      code: string | null;
      name: string;
      primLineId?: string | null;
      transportMode?: string | null;
      aliases?: string[];
    };
    nodes: NetexSchematicNode[];
    segments: NetexSchematicSegment[];
    branchGroups: NetexBranchGroup[];
    parallelGroups: NetexParallelGroup[];
    loops: NetexLoop[];
  };
}

export interface NetexRawStation {
  id: string;
  name: string;
  x?: number;
  y?: number;
  srsName?: string;
  rawRefs?: string[];
}

export interface NetexPattern {
  id: string;
  destination?: string | null;
  direction?: string | null;
  stopIds?: string[];
  stops?: Array<{ id: string; name: string }>;
  serviceCount?: number;
}

export interface NetexSchematicNode {
  id: string;
  name: string;
  x?: number;
  y?: number;
  srsName?: string;
  degree: number;
  isTerminal: boolean;
  isJunction: boolean;
}

export interface NetexSchematicSegment {
  id: string;
  from: string;
  to: string;
  stationIds: string[];
  stations?: Array<{ id: string; name: string }>;
}

export interface NetexBranchGroup {
  id: string;
  junctionStationId: string;
  junction?: { id: string; name: string };
  layout?: {
    kind: "same-direction-fork" | "split-fork";
    trunkStationId?: string;
    axisDegrees?: number;
    branches: Array<{
      branchId: string;
      terminalStationId: string;
      direction: "forward" | "reverse";
      side: "upper" | "lower" | "center";
      angleDegrees?: number;
    }>;
  };
  branches: Array<{
    id: string;
    terminalStationId: string;
    stationIds: string[];
  }>;
}

export interface NetexParallelGroup {
  id: string;
  from: string;
  to: string;
  alternatives: Array<{
    segmentId: string;
    stationIds: string[];
  }>;
}

export interface NetexLoop {
  id: string;
  kind: "cycle" | "parallel";
  anchorStationIds: string[];
  segmentIds: string[];
  stationIds: string[];
}

const cacheSourcePromise = new Map<string, Promise<NetexCacheSource>>();
const indexCache = new Map<string, Promise<NetexCacheIndex>>();
const lineCache = new Map<string, Promise<LineTopology>>();
let warnedLocalOnlyCache = false;
const announcedCacheSources = new Set<string>();

const KNOWN_LINE_CODES: Record<string, string> = {
  "metro-4": "C01374",
  "m4": "C01374",
  "rer-a": "C01742",
  "rer-b": "C01743",
  "rer-d": "C01728",
  "tram-t10": "C02528",
  "t10": "C02528",
  "transilien-j": "C01739",
  "train-j": "C01739",
};

const KNOWN_LINE_ALIASES_BY_CODE: Record<string, string[]> = {
  C01374: ["metro-4", "m4"],
  C01728: ["rer-d"],
  C01739: ["transilien-j", "train-j"],
  C01742: ["rer-a"],
  C01743: ["rer-b"],
  C02528: ["tram-t10", "t10"],
};

const MODE_BY_CODE: Record<string, string> = {
  C01374: "metro",
  C01728: "rer",
  C01739: "train",
  C01742: "rer",
  C01743: "rer",
  C02528: "tram",
};

export async function getLineTopologyFromNetexCache(
  lineId: string,
  runtimeEnv?: NetexRuntimeEnv,
): Promise<LineTopology> {
  const source = await resolveNetexCacheSource(runtimeEnv);
  const sourceId = createSourceId(source);
  const index = await loadNetexIndex(source);
  const code = resolveLineCode(lineId, index);
  const cacheKey = `${sourceId}:${code}`;
  const cached = lineCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const request = loadNetexLineByCode(source, code, index).then(
    adaptNetexLineToTopology,
  );

  lineCache.set(cacheKey, request);

  return request;
}

export async function loadNetexLineCache(
  lineId: string,
  runtimeEnv?: NetexRuntimeEnv,
): Promise<NetexLineCache> {
  const source = await resolveNetexCacheSource(runtimeEnv);
  const index = await loadNetexIndex(source);
  const code = resolveLineCode(lineId, index);

  return loadNetexLineByCode(source, code, index);
}

export async function getNetexCacheStatus(
  runtimeEnv?: NetexRuntimeEnv,
): Promise<NetexCacheStatus> {
  try {
    const source = await resolveNetexCacheSource(runtimeEnv);
    const index = await loadNetexIndex(source);

    return {
      available: true,
      source: {
        kind: source.kind,
        location: source.root,
      },
      generatedAt: index.generatedAt,
      lineCount: index.lines.length,
      warning: source.warning,
    };
  } catch (error) {
    return {
      available: false,
      source: getConfiguredCacheSourceHint(runtimeEnv),
      message:
        error instanceof Error
          ? error.message
          : "NeTEx cache could not be loaded.",
    };
  }
}

export function getNetexRuntimeEnv(event?: unknown): NetexRuntimeEnv {
  const nodeEnv = (globalThis as { process?: { env?: NetexRuntimeEnv } }).process
    ?.env;
  const cfEnv = (event as CloudflareEventLike | undefined)?.context?.cloudflare
    ?.env;

  return {
    ...(nodeEnv ?? {}),
    ...(cfEnv ?? {}),
  };
}

export function createNetexCacheEnvironmentKey(
  runtimeEnv?: NetexRuntimeEnv,
): string {
  const config = getConfiguredCacheConfig(runtimeEnv);

  return `${config.kind}:${config.value ?? "__auto__"}`;
}

export function resolveKnownLineAlias(
  transportType: string,
  lineId: string,
): string {
  const normalizedType = normalizeSlug(transportType);
  const normalizedLine = normalizeSlug(lineId);
  const directCode = extractLineCode(lineId);

  if (directCode) {
    return `line:IDFM:${directCode}`;
  }

  const candidates = [
    `${normalizedType}-${normalizedLine}`,
    normalizedLine,
  ];
  const code = candidates
    .map((candidate) => KNOWN_LINE_CODES[candidate])
    .find(Boolean);

  if (code) {
    return `line:IDFM:${code}`;
  }

  return normalizedType ? `${normalizedType}-${normalizedLine}` : normalizedLine;
}

async function resolveNetexCacheSource(
  runtimeEnv?: NetexRuntimeEnv,
): Promise<NetexCacheSource> {
  const config = getConfiguredCacheConfig(runtimeEnv);
  const cacheKey = createNetexCacheEnvironmentKey(runtimeEnv);
  const cached = cacheSourcePromise.get(cacheKey);

  if (cached) {
    return cached;
  }

  const request = findNetexCacheSource(config, getRuntimeEnv(runtimeEnv)).then(
    (source) => {
      announceNetexCacheSource(source, config);

      return source;
    },
  );
  cacheSourcePromise.set(cacheKey, request);

  return request;
}

async function findNetexCacheSource(
  config: NetexCacheConfig,
  runtimeEnv?: NetexRuntimeEnv,
): Promise<NetexCacheSource> {
  if (config.kind === "remote") {
    const remote = config.value ?? "";

    if (isR2Url(remote)) {
      const r2Source = parseR2CacheSource(remote, runtimeEnv);

      validateR2Config(runtimeEnv);

      return r2Source;
    }

    if (isHttpUrl(remote)) {
      return {
        kind: "remote",
        root: trimTrailingSlashes(remote),
      };
    }

    throw new Error(
      `Invalid IDFM_NETEX_CACHE_REMOTE value "${remote}". Expected an r2:// or HTTP(S) cache URL.`,
    );
  }

  warnLocalOnlyCache(config.kind === "local" ? config.value : undefined);

  const candidates =
    config.kind === "local" && config.value
      ? [config.value]
      : await getDefaultLocalCacheCandidates();

  for (const candidate of candidates) {
    const stat = await statLocalCacheIndex(candidate);

    if (stat?.isFile()) {
      return {
        kind: "directory",
        root: candidate,
        warning:
          "IDFM_NETEX_CACHE_LOCAL is using a local filesystem path. This works locally, but production should use IDFM_NETEX_CACHE_REMOTE.",
      };
    }
  }

  throw new Error(
    `NeTEx cache not found. Set IDFM_NETEX_CACHE_REMOTE to an r2:// or HTTP(S) cache URL, or IDFM_NETEX_CACHE_LOCAL to a folder containing index.json.`,
  );
}

async function loadNetexIndex(source: NetexCacheSource): Promise<NetexCacheIndex> {
  const cacheKey = createSourceId(source);
  const cached = indexCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const request = readCacheJson<NetexCacheIndex>(source, "index.json");
  indexCache.set(cacheKey, request);

  return request;
}

async function loadNetexLineByCode(
  source: NetexCacheSource,
  code: string,
  index: NetexCacheIndex,
): Promise<NetexLineCache> {
  const entry = index.lines.find((line) => line.code === code);

  if (!entry) {
    throw new Error(`Line ${code} is not present in NeTEx cache index.`);
  }

  return readCacheJson<NetexLineCache>(source, entry.file);
}

async function readCacheJson<T>(
  source: NetexCacheSource,
  relativePath: string,
): Promise<T> {
  const safePath = normalizeCachePath(relativePath);

  if (source.kind === "remote") {
    const response = await fetch(`${source.root}/${safePath}`);

    if (!response.ok) {
      throw new Error(
        `NeTEx cache request failed for ${safePath}: ${response.status} ${response.statusText}`,
      );
    }

    return response.json() as Promise<T>;
  }

  if (source.kind === "r2") {
    const response = await fetchSignedR2Object(source, safePath);

    if (!response.ok) {
      throw new Error(
        `NeTEx R2 cache request failed for ${safePath}: ${response.status} ${response.statusText}`,
      );
    }

    return response.json() as Promise<T>;
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  return JSON.parse(
    await fs.readFile(path.join(source.root, safePath), "utf8"),
  ) as T;
}

function getConfiguredCacheConfig(runtimeEnv?: NetexRuntimeEnv): NetexCacheConfig {
  const env = getRuntimeEnv(runtimeEnv);
  const remote = env.IDFM_NETEX_CACHE_REMOTE?.trim();
  const local = env.IDFM_NETEX_CACHE_LOCAL?.trim();

  if (remote) {
    return {
      kind: "remote",
      value: remote,
    };
  }

  if (local) {
    return {
      kind: "local",
      value: local,
    };
  }

  return {
    kind: "auto",
  };
}

function getConfiguredCacheSourceHint(
  runtimeEnv?: NetexRuntimeEnv,
): NetexCacheStatus["source"] {
  const config = getConfiguredCacheConfig(runtimeEnv);

  if (config.kind === "auto") {
    return {
      kind: "auto",
      location: "public/data/netex or ../idfm-node-backend/public/data/netex",
    };
  }

  const kind =
    config.kind === "local"
      ? "directory"
      : isR2Url(config.value ?? "")
        ? "r2"
        : isHttpUrl(config.value ?? "")
          ? "remote"
          : "directory";

  return {
    kind,
    location: config.value ?? "",
  };
}

function warnLocalOnlyCache(configured?: string): void {
  if (warnedLocalOnlyCache) {
    return;
  }

  const localTarget = configured
    ? `local path "${configured}"`
    : "automatic local cache search";

  console.warn(
    `[netex-cache] IDFM_NETEX_CACHE_REMOTE is not configured; using ${localTarget}. ` +
      "This will only work locally or if the NeTEx cache files are packaged with the Nuxt server.",
  );
  warnedLocalOnlyCache = true;
}

function announceNetexCacheSource(
  source: NetexCacheSource,
  config: NetexCacheConfig,
): void {
  const sourceKey = createSourceId(source);

  if (announcedCacheSources.has(sourceKey)) {
    return;
  }

  if (source.kind === "r2") {
    console.info(
      `[netex-cache] Using remote R2 cache bucket=${source.bucket} prefix=${source.prefix || "(root)"}`,
    );
  } else if (source.kind === "remote") {
    console.info(`[netex-cache] Using remote HTTP cache ${source.root}`);
  } else if (config.kind === "auto") {
    console.info(`[netex-cache] Using auto-discovered local cache ${source.root}`);
  } else {
    console.info(`[netex-cache] Using local cache ${source.root}`);
  }

  announcedCacheSources.add(sourceKey);
}

function createSourceId(source: NetexCacheSource): string {
  return `${source.kind}:${source.root}`;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//iu.test(value);
}

function isR2Url(value: string): boolean {
  return /^r2:\/\//iu.test(value);
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/u, "");
}

function normalizeCachePath(value: string): string {
  const normalized = value.replace(/\\/gu, "/").replace(/^\/+/u, "");

  if (
    !normalized ||
    normalized.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new Error(`Invalid NeTEx cache path: ${value}`);
  }

  return normalized;
}

function parseR2CacheSource(
  value: string,
  runtimeEnv?: NetexRuntimeEnv,
): NetexCacheSource {
  const url = new URL(value);
  const bucket = url.hostname;
  const prefix = normalizeR2Prefix(url.pathname);

  if (!bucket) {
    throw new Error(
      `Invalid R2 cache URL "${value}". Expected r2://bucket/path/to/netex-cache.`,
    );
  }

  return {
    kind: "r2",
    root: `r2://${bucket}${prefix ? `/${prefix}` : ""}`,
    bucket,
    env: getRuntimeEnv(runtimeEnv),
    prefix,
  };
}

function normalizeR2Prefix(value: string): string {
  return value.replace(/^\/+|\/+$/gu, "");
}

function validateR2Config(runtimeEnv?: NetexRuntimeEnv): void {
  const env = getRuntimeEnv(runtimeEnv);
  const missing = [
    ["R2_ACCOUNT_ID", env.R2_ACCOUNT_ID],
    ["R2_ACCESS_KEY_ID", env.R2_ACCESS_KEY_ID],
    ["R2_SECRET_ACCESS_KEY", env.R2_SECRET_ACCESS_KEY],
  ]
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `R2 NeTEx cache is configured but missing ${missing.join(", ")}.`,
    );
  }
}

async function fetchSignedR2Object(
  source: NetexCacheSource,
  relativePath: string,
): Promise<Response> {
  if (!source.bucket) {
    throw new Error("R2 cache source is missing its bucket name.");
  }

  const objectKey = [source.prefix, relativePath].filter(Boolean).join("/");
  const endpoint =
    source.env?.R2_ENDPOINT?.replace(/\/+$/u, "") ||
    `https://${requiredEnv("R2_ACCOUNT_ID", source.env)}.r2.cloudflarestorage.com`;
  const requestUrl = new URL(
    `${endpoint}/${encodePathSegment(source.bucket)}/${encodeObjectKey(objectKey)}`,
  );
  const headers = await createR2SignedHeaders(requestUrl, source.env);
  const response = await fetch(requestUrl, {
    headers,
    method: "GET",
  });

  if (!response.ok) {
    console.warn(
      `[netex-cache] R2 GET failed bucket=${source.bucket} key=${objectKey} status=${response.status} ${response.statusText}`,
    );
  }

  return response;
}

async function createR2SignedHeaders(
  url: URL,
  runtimeEnv?: NetexRuntimeEnv,
): Promise<Headers> {
  const env = getRuntimeEnv(runtimeEnv);
  const now = new Date();
  const amzDate = formatAmzDate(now);
  const dateScope = amzDate.slice(0, 8);
  const host = url.host;
  const payloadHash = "UNSIGNED-PAYLOAD";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const canonicalRequest = [
    "GET",
    url.pathname,
    url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateScope}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = await signR2Request(
    requiredEnv("R2_SECRET_ACCESS_KEY", env),
    dateScope,
    stringToSign,
  );
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${requiredEnv("R2_ACCESS_KEY_ID", env)}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return new Headers({
    Authorization: authorization,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  });
}

async function signR2Request(
  secretAccessKey: string,
  dateScope: string,
  stringToSign: string,
): Promise<string> {
  const dateKey = await hmac(`AWS4${secretAccessKey}`, dateScope);
  const regionKey = await hmac(dateKey, "auto");
  const serviceKey = await hmac(regionKey, "s3");
  const signingKey = await hmac(serviceKey, "aws4_request");
  const signature = await hmac(signingKey, stringToSign);

  return toHex(signature);
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);

  return toHex(digest);
}

async function hmac(
  key: string | ArrayBuffer,
  value: string,
): Promise<ArrayBuffer> {
  const rawKey =
    typeof key === "string" ? new TextEncoder().encode(key) : new Uint8Array(key);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    rawKey,
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );

  return globalThis.crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(value),
  );
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/gu, "");
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function encodeObjectKey(value: string): string {
  return value
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function requiredEnv(name: string, runtimeEnv?: NetexRuntimeEnv): string {
  const value = getRuntimeEnv(runtimeEnv)[name]?.trim();

  if (!value) {
    throw new Error(`Missing required R2 environment variable ${name}.`);
  }

  return value;
}

function getRuntimeEnv(runtimeEnv?: NetexRuntimeEnv): NetexRuntimeEnv {
  if (runtimeEnv) {
    return runtimeEnv;
  }

  return (
    (globalThis as { process?: { env?: NetexRuntimeEnv } }).process?.env ?? {}
  );
}

async function getDefaultLocalCacheCandidates(): Promise<string[]> {
  const path = await import("node:path");

  return [
    path.resolve(process.cwd(), "public/data/netex"),
    path.resolve(process.cwd(), "../idfm-node-backend/public/data/netex"),
  ];
}

async function statLocalCacheIndex(candidate: string) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  return fs.stat(path.join(candidate, "index.json")).catch(() => null);
}

function resolveLineCode(lineId: string, index: NetexCacheIndex): string {
  const decoded = decodeURIComponent(lineId).trim();
  const directCode = extractLineCode(decoded);

  if (directCode) {
    return directCode;
  }

  const normalized = normalizeSlug(decoded);
  const knownCode = KNOWN_LINE_CODES[normalized];

  if (knownCode) {
    return knownCode;
  }

  const aliasMatch = index.lines.find((line) =>
    (line.aliases ?? []).some((alias) => normalizeSlug(alias) === normalized),
  );

  if (aliasMatch) {
    return aliasMatch.code;
  }

  const exact = index.lines.find(
    (line) =>
      line.primLineId === decoded ||
      line.id === decoded ||
      normalizeSlug(line.name) === normalized,
  );

  if (exact) {
    const sameNameMatches = index.lines.filter(
      (line) => normalizeSlug(line.name) === normalizeSlug(exact.name),
    );

    if (sameNameMatches.length === 1) {
      return exact.code;
    }
  }

  throw new Error(`No stable NeTEx cache line mapping found for ${lineId}.`);
}

function extractLineCode(value: string): string | undefined {
  return value.match(/C\d{5}/iu)?.[0].toUpperCase();
}

function adaptNetexLineToTopology(cache: NetexLineCache): LineTopology {
  const nodes = cache.schematic.nodes;
  const stationById = new Map(nodes.map((node) => [node.id, node]));
  const rawToSchematicId = buildRawToSchematicMap(cache, stationById);
  const stations: TopologyStation[] = nodes
    .map((node) => ({
      id: node.id,
      name: decodeMojibake(node.name),
      degree: node.degree,
      aliases: [node.name].filter((alias) => alias !== decodeMojibake(node.name)),
      projectedX: node.x,
      projectedY: node.y,
      srsName: node.srsName,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));
  const segments = buildTopologySegmentsFromSchematic(cache);
  const patterns = buildTopologyPatternsFromNetex(cache, rawToSchematicId, stationById);
  const branches = buildTopologyBranchesFromSchematic(cache);
  const branchPoints = nodes
    .filter((node) => node.isJunction || node.degree >= 3)
    .map((node) => node.id)
    .sort();
  const terminals = nodes
    .filter((node) => node.isTerminal || node.degree === 1)
    .map((node) => node.id)
    .sort();
  const code = cache.line.code ?? cache.schematic.line.code ?? "";
  const shortName = decodeMojibake(cache.line.name || cache.schematic.line.name || code);
  const mode =
    normalizeCacheTransportMode(cache.line.transportMode ?? cache.schematic.line.transportMode) ??
    MODE_BY_CODE[code] ??
    "train";

  return {
    line: {
      id: cache.line.primLineId ?? cache.schematic.line.primLineId ?? `line:IDFM:${code}`,
      aliases: [
        cache.line.id,
        cache.schematic.line.id,
        cache.line.primLineId,
        cache.schematic.line.primLineId,
        code,
        shortName,
        ...(cache.line.aliases ?? []),
        ...(cache.schematic.line.aliases ?? []),
        ...(KNOWN_LINE_ALIASES_BY_CODE[code] ?? []),
      ].filter((value): value is string => Boolean(value)),
      name: createLineName(mode, shortName),
      shortName,
      mode,
    },
    stations,
    segments,
    patterns,
    branches,
    branchPoints,
    terminals,
  };
}

function buildRawToSchematicMap(
  cache: NetexLineCache,
  stationById: Map<string, NetexSchematicNode>,
): Map<string, string> {
  const byName = new Map<string, NetexSchematicNode[]>();
  const rawToSchematicId = new Map<string, string>();

  for (const node of stationById.values()) {
    const key = normalizeStationName(node.name);
    byName.set(key, [...(byName.get(key) ?? []), node]);
    rawToSchematicId.set(node.id, node.id);
  }

  for (const station of cache.stations ?? []) {
    if (stationById.has(station.id)) {
      rawToSchematicId.set(station.id, station.id);
      continue;
    }

    const candidates = byName.get(normalizeStationName(station.name)) ?? [];
    const match = chooseNearestNode(station, candidates);

    if (match) {
      rawToSchematicId.set(station.id, match.id);
    }

    for (const rawRef of station.rawRefs ?? []) {
      rawToSchematicId.set(rawRef, match?.id ?? station.id);
    }
  }

  return rawToSchematicId;
}

function chooseNearestNode(
  station: NetexRawStation,
  candidates: NetexSchematicNode[],
): NetexSchematicNode | undefined {
  if (candidates.length <= 1) {
    return candidates[0];
  }

  if (!isFiniteNumber(station.x) || !isFiniteNumber(station.y)) {
    return candidates[0];
  }

  return [...candidates].sort((left, right) => {
    const leftDistance = distanceSquared(station, left);
    const rightDistance = distanceSquared(station, right);

    return leftDistance - rightDistance;
  })[0];
}

function buildTopologySegmentsFromSchematic(cache: NetexLineCache): TopologySegment[] {
  const segmentsById = new Map<string, TopologySegment>();

  for (const segment of cache.schematic.segments) {
    const stationIds = dedupeConsecutive(segment.stationIds);

    stationIds.slice(0, -1).forEach((from, index) => {
      const to = stationIds[index + 1];
      const id = segmentId(from, to);
      const existing = segmentsById.get(id);

      if (existing) {
        addUnique(existing.patterns, segment.id);
        return;
      }

      segmentsById.set(id, {
        id,
        from,
        to,
        patterns: [segment.id],
      });
    });
  }

  return [...segmentsById.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function buildTopologyBranchesFromSchematic(cache: NetexLineCache): TopologyBranch[] {
  return cache.schematic.branchGroups
    .flatMap((group) =>
      group.branches.map((branch) => {
        const layout = createTopologyBranchLayout(group, branch.id);

        return {
          id: branch.id,
          from: group.junctionStationId,
          to: branch.terminalStationId,
          stops: dedupeConsecutive(branch.stationIds),
          ...(layout ? { layout } : {}),
        };
      }),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

function createTopologyBranchLayout(
  group: NetexBranchGroup,
  branchId: string,
): TopologyBranchLayout | undefined {
  const branchLayout = group.layout?.branches.find(
    (candidate) => candidate.branchId === branchId,
  );

  if (!group.layout || !branchLayout) {
    return undefined;
  }

  return {
    kind: group.layout.kind,
    junctionStationId: group.junctionStationId,
    terminalStationId: branchLayout.terminalStationId,
    trunkStationId: group.layout.trunkStationId,
    direction: branchLayout.direction,
    side: branchLayout.side,
    axisDegrees: group.layout.axisDegrees,
    angleDegrees: branchLayout.angleDegrees,
  };
}

function buildTopologyPatternsFromNetex(
  cache: NetexLineCache,
  rawToSchematicId: Map<string, string>,
  stationById: Map<string, NetexSchematicNode>,
): RawPattern[] {
  const patternsBySequence = new Map<string, RawPattern>();

  for (const pattern of cache.patterns ?? []) {
    const rawStopIds =
      pattern.stopIds ??
      pattern.stops?.map((stop) => stop.id) ??
      [];
    const stops = dedupeConsecutive(
      rawStopIds
        .map((stopId) => rawToSchematicId.get(stopId) ?? stopId)
        .filter((stopId) => stationById.has(stopId)),
    );

    if (stops.length < 2) {
      continue;
    }

    const sequenceKey = stops.join(">");
    const existing = patternsBySequence.get(sequenceKey);

    if (existing) {
      existing.tripCount += pattern.serviceCount ?? 1;
      continue;
    }

    const first = stationById.get(stops[0]);
    const last = stationById.get(stops[stops.length - 1]);
    const terminalTo =
      decodeMojibake(pattern.destination ?? pattern.direction ?? last?.name ?? "");

    patternsBySequence.set(sequenceKey, {
      id: pattern.id,
      terminalFrom: decodeMojibake(first?.name ?? ""),
      terminalTo: terminalTo || decodeMojibake(last?.name ?? ""),
      stops,
      tripCount: pattern.serviceCount ?? 1,
    });
  }

  if (patternsBySequence.size > 0) {
    return [...patternsBySequence.values()].sort(
      (left, right) => right.tripCount - left.tripCount || left.id.localeCompare(right.id),
    );
  }

  return cache.schematic.segments.map((segment) => {
    const stops = dedupeConsecutive(segment.stationIds);
    const first = stationById.get(stops[0]);
    const last = stationById.get(stops[stops.length - 1]);

    return {
      id: segment.id,
      terminalFrom: decodeMojibake(first?.name ?? ""),
      terminalTo: decodeMojibake(last?.name ?? ""),
      stops,
      tripCount: 1,
    };
  });
}

function createLineName(mode: string, shortName: string): string {
  if (mode === "metro") {
    return `Metro ${shortName}`;
  }

  if (mode === "rer") {
    return `RER ${shortName}`;
  }

  if (mode === "tram") {
    return shortName.startsWith("T") ? `Tram ${shortName}` : `Tram ${shortName}`;
  }

  if (mode === "train") {
    return `Transilien ${shortName}`;
  }

  return shortName;
}

function normalizeCacheTransportMode(value?: string | null): string | null {
  const normalized = normalizeSlug(value ?? "");
  if (!normalized) {
    return null;
  }

  if (normalized === "rail") {
    return "train";
  }

  if (normalized === "metro" || normalized === "rer" || normalized === "tram" || normalized === "train" || normalized === "bus") {
    return normalized;
  }

  return null;
}

function segmentId(left: string, right: string): string {
  return [left, right].sort().join("__");
}

function dedupeConsecutive<T>(values: T[]): T[] {
  return values.filter((value, index) => index === 0 || value !== values[index - 1]);
}

function normalizeSlug(value: string): string {
  return decodeURIComponent(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeStationName(value: string): string {
  return decodeMojibake(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/giu, "")
    .toLowerCase();
}

function decodeMojibake(value: string | null | undefined): string {
  const text = value ?? "";

  if (!/[ÃÂ]/u.test(text)) {
    return text;
  }

  try {
    const bytes = Uint8Array.from([...text].map((char) => char.charCodeAt(0) & 0xff));

    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return text;
  }
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function distanceSquared(
  station: Pick<NetexRawStation, "x" | "y">,
  node: Pick<NetexSchematicNode, "x" | "y">,
): number {
  if (!isFiniteNumber(station.x) || !isFiniteNumber(station.y)) {
    return Number.MAX_SAFE_INTEGER;
  }

  if (!isFiniteNumber(node.x) || !isFiniteNumber(node.y)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return (station.x - node.x) ** 2 + (station.y - node.y) ** 2;
}
