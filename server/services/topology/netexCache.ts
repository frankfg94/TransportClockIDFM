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
  kind: "remote" | "directory";
  root: string;
  warning?: string;
}

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
): Promise<LineTopology> {
  const source = await resolveNetexCacheSource();
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
): Promise<NetexLineCache> {
  const source = await resolveNetexCacheSource();
  const index = await loadNetexIndex(source);
  const code = resolveLineCode(lineId, index);

  return loadNetexLineByCode(source, code, index);
}

export async function getNetexCacheStatus(): Promise<NetexCacheStatus> {
  try {
    const source = await resolveNetexCacheSource();
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
      source: getConfiguredCacheSourceHint(),
      message:
        error instanceof Error
          ? error.message
          : "NeTEx cache could not be loaded.",
    };
  }
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

async function resolveNetexCacheSource(): Promise<NetexCacheSource> {
  const configured = getConfiguredCacheRoot();

  const cacheKey = configured || "__auto__";
  const cached = cacheSourcePromise.get(cacheKey);

  if (cached) {
    return cached;
  }

  const request = findNetexCacheSource(configured);
  cacheSourcePromise.set(cacheKey, request);

  return request;
}

async function findNetexCacheSource(
  configured?: string,
): Promise<NetexCacheSource> {
  if (configured && isHttpUrl(configured)) {
    return {
      kind: "remote",
      root: trimTrailingSlashes(configured),
    };
  }

  warnLocalOnlyCache(configured);

  const candidates = configured
    ? [configured]
    : await getDefaultLocalCacheCandidates();

  for (const candidate of candidates) {
    const stat = await statLocalCacheIndex(candidate);

    if (stat?.isFile()) {
      return {
        kind: "directory",
        root: candidate,
        warning:
          "IDFM_NETEX_CACHE_DIR is using a local filesystem path. This works locally, but production should use an HTTP/R2 cache URL.",
      };
    }
  }

  throw new Error(
    `NeTEx cache not found. Set IDFM_NETEX_CACHE_DIR to an R2/HTTP base URL or a folder containing index.json.`,
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

  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  return JSON.parse(
    await fs.readFile(path.join(source.root, safePath), "utf8"),
  ) as T;
}

function getConfiguredCacheRoot(): string | undefined {
  return [
    process.env.NUXT_IDFM_NETEX_CACHE_DIR,
    process.env.IDFM_NETEX_CACHE_DIR,
    process.env.NETEX_CACHE_DIR,
  ]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));
}

function getConfiguredCacheSourceHint(): NetexCacheStatus["source"] {
  const configured = getConfiguredCacheRoot();

  if (!configured) {
    return {
      kind: "auto",
      location: "public/data/netex or ../idfm-node-backend/public/data/netex",
    };
  }

  return {
    kind: isHttpUrl(configured) ? "remote" : "directory",
    location: configured,
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
    `[netex-cache] IDFM_NETEX_CACHE_DIR is not an R2/HTTP URL; using ${localTarget}. ` +
      "This will only work locally or if the NeTEx cache files are packaged with the Nuxt server.",
  );
  warnedLocalOnlyCache = true;
}

function createSourceId(source: NetexCacheSource): string {
  return `${source.kind}:${source.root}`;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//iu.test(value);
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
