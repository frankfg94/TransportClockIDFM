import {
  GLOBAL_MAP_MIN_READER_VERSION,
  GLOBAL_MAP_SCHEMA_VERSION,
  isValidGlobalMapPathSubpathStarts,
  type GlobalMapBootstrap,
  type GlobalMapCatalog,
  type GlobalMapChunkDescriptor,
  type GlobalMapChunkPayload,
  type GlobalMapLine,
  type GlobalMapLinePaletteDocument,
  type GlobalMapManifest,
  type GlobalMapPath,
  type GlobalMapRegionalSource,
  type GlobalMapRegionalPayload,
  type GlobalMapRegionalPathRowV2,
  type GlobalMapStation,
} from "../contracts/manifest";
import type { TransportMapNetwork } from "../contracts/network";
import { createLinePresentation } from "../../../services/linePresentation";
import type { TransportMapPerformanceTrace } from "../performance/transportMapPerformanceTrace";
import type { TransportMapTraceEventId } from "../performance/transportMapPerformanceTrace";

export interface TransportMapAssetLoaderOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  trace?: TransportMapPerformanceTrace;
}

export class GlobalMapAssetLoader {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly trace?: TransportMapPerformanceTrace;

  constructor(options: TransportMapAssetLoaderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "/data/global-map/v1").replace(/\/$/u, "");
    this.fetcher = options.fetcher ?? (typeof window === "undefined" ? fetch : window.fetch.bind(window));
    this.trace = options.trace;
  }

  async loadManifest(signal?: AbortSignal): Promise<GlobalMapManifest> {
    const manifest = await this.getJson<GlobalMapManifest>("manifest.json", signal);
    assertManifestCompatible(manifest);
    return manifest;
  }

  async loadBootstrap(
    manifest: GlobalMapManifest,
    signal?: AbortSignal,
  ): Promise<TransportMapNetwork> {
    const [payload, palette] = await Promise.all([
      this.loadBootstrapPayload(manifest, signal),
      this.loadLinePalette(manifest, signal),
    ]);
    return decodeBootstrap(payload, manifest, undefined, palette);
  }

  async loadBootstrapPayload(
    manifest: GlobalMapManifest,
    signal?: AbortSignal,
  ): Promise<GlobalMapBootstrap> {
    const payload = await this.getJson<GlobalMapBootstrap>(manifest.files.bootstrap.asset, signal);
    if (payload.schemaVersion !== GLOBAL_MAP_SCHEMA_VERSION || payload.dataVersion !== manifest.dataVersion) {
      throw new Error("Global map bootstrap version mismatch");
    }
    if (payload.encoding !== "rows-v1") throw new Error(`Unsupported bootstrap encoding ${payload.encoding}`);
    return payload;
  }

  async loadCatalog(
    manifest: GlobalMapManifest,
    signal?: AbortSignal,
  ): Promise<GlobalMapCatalog> {
    return parseCatalogPayload(await this.loadCatalogText(manifest, signal), manifest);
  }

  async loadCatalogText(
    manifest: GlobalMapManifest,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await this.fetcher(this.resolveAsset(manifest.files.catalog.asset), { signal });
    if (!response.ok) throw new Error(`Global map asset ${manifest.files.catalog.asset} returned ${response.status}`);
    return response.text();
  }

  async loadRegionalPayload(
    manifest: GlobalMapManifest,
    signal?: AbortSignal,
  ): Promise<GlobalMapRegionalPayload | undefined> {
    const regional = manifest.files.regional;
    if (!regional) return undefined;
    return assertRegionalPayload(await this.getJson<GlobalMapRegionalPayload>(regional.asset, signal), manifest);
  }

  async loadRegionalBusPayload(
    manifest: GlobalMapManifest,
    signal?: AbortSignal,
  ): Promise<GlobalMapRegionalPayload | undefined> {
    const regionalBus = manifest.files.regionalBus;
    if (!regionalBus) return undefined;
    return assertRegionalPayload(await this.getJson<GlobalMapRegionalPayload>(regionalBus.asset, signal), manifest);
  }

  async loadRegionalBikePayload(
    manifest: GlobalMapManifest,
    signal?: AbortSignal,
  ): Promise<GlobalMapRegionalPayload | undefined> {
    const regionalBike = manifest.files.regionalBike;
    if (!regionalBike) return undefined;
    return assertRegionalPayload(await this.getJson<GlobalMapRegionalPayload>(regionalBike.asset, signal), manifest);
  }

  async loadLinePalette(
    manifest: GlobalMapManifest,
    signal?: AbortSignal,
  ): Promise<GlobalMapLinePaletteDocument | undefined> {
    const descriptor = manifest.files.linePalette;
    if (!descriptor) return undefined;
    const palette = await this.getJson<GlobalMapLinePaletteDocument>(descriptor.asset, signal);
    if (
      !manifest.palette ||
      palette.version !== manifest.palette.version ||
      palette.source !== manifest.palette.source ||
      palette.checksum !== manifest.palette.checksum ||
      palette.entries.length !== manifest.palette.entryCount
    ) {
      throw new Error("Global map line palette metadata mismatch");
    }
    return palette;
  }

  async loadChunk(
    manifest: GlobalMapManifest,
    descriptor: GlobalMapChunkDescriptor,
    signal?: AbortSignal,
    parentId?: TransportMapTraceEventId,
  ): Promise<GlobalMapChunkPayload> {
    const raw = await this.loadChunkText(manifest, descriptor, signal, parentId);
    const trace = this.trace?.isRunning ? this.trace : undefined;
    const decodeEventId = trace?.begin("chunk_decode", {
      chunkId: descriptor.id,
      inputBytes: raw.length,
      expectedBytes: descriptor.bytes,
    }, parentId);
    try {
      const payload = parseChunkPayload(
        raw,
        manifest,
        descriptor,
        (durationMs) => trace?.recordDuration("chunk_json_parse", durationMs, {
          chunkId: descriptor.id,
          inputBytes: raw.length,
        }, decodeEventId),
      );
      trace?.end(decodeEventId, {
        chunkId: descriptor.id,
        outputPathCount: payload.paths.length,
        outputStationCount: 0,
      });
      return payload;
    } catch (error) {
      trace?.end(decodeEventId, { chunkId: descriptor.id, failed: true });
      throw error;
    }
  }

  async loadChunkText(
    manifest: GlobalMapManifest,
    descriptor: GlobalMapChunkDescriptor,
    signal?: AbortSignal,
    parentId?: TransportMapTraceEventId,
  ): Promise<string> {
    const trace = this.trace?.isRunning ? this.trace : undefined;
    const fetchEventId = trace?.begin("chunk_fetch", {
      chunkId: descriptor.id,
      asset: descriptor.asset,
      expectedBytes: descriptor.bytes,
    }, parentId);
    try {
      const response = await this.fetcher(this.resolveAsset(descriptor.asset), { signal });
      if (!response.ok) throw new Error(`Global map asset ${descriptor.asset} returned ${response.status}`);
      void manifest;
      const bodyStartedAt = nowMs();
      const raw = await response.text();
      trace?.recordDuration("chunk_response_body", nowMs() - bodyStartedAt, {
        chunkId: descriptor.id,
        fetchedBytes: raw.length,
        status: response.status,
      }, fetchEventId);
      trace?.end(fetchEventId, {
        chunkId: descriptor.id,
        fetchedBytes: raw.length,
        status: response.status,
      });
      return raw;
    } catch (error) {
      trace?.end(fetchEventId, { chunkId: descriptor.id, failed: true });
      throw error;
    }
  }

  resolveAsset(asset: string): string {
    return `${this.baseUrl}/${asset.replace(/^\//u, "")}`;
  }

  private async getJson<T>(asset: string, signal?: AbortSignal): Promise<T> {
    const response = await this.fetcher(this.resolveAsset(asset), { signal });
    if (!response.ok) throw new Error(`Global map asset ${asset} returned ${response.status}`);
    return (await response.json()) as T;
  }
}

export function assertManifestCompatible(manifest: GlobalMapManifest): void {
  if (manifest.schemaVersion !== GLOBAL_MAP_SCHEMA_VERSION) {
    throw new Error(`Unsupported global map schema ${manifest.schemaVersion}`);
  }
  if (manifest.minReaderVersion > GLOBAL_MAP_MIN_READER_VERSION) {
    throw new Error(`Global map requires reader ${manifest.minReaderVersion}`);
  }
  if (manifest.projection.transformVersion !== "lambert93-ntf-v1") {
    throw new Error(`Unsupported global map transform ${manifest.projection.transformVersion}`);
  }
  if (manifest.palette) {
    if (
      manifest.palette.entryCount < 0 ||
      manifest.palette.missingCount < 0 ||
      !Array.isArray(manifest.palette.missingSample)
    ) {
      throw new Error("Invalid global map palette metadata");
    }
    if (manifest.palette.complete && !manifest.files.linePalette) {
      throw new Error("Complete global map palette is missing its asset");
    }
  }
}

export function parseCatalogPayload(
  raw: string,
  manifest: GlobalMapManifest,
): GlobalMapCatalog {
  return assertCatalogPayload(JSON.parse(raw) as GlobalMapCatalog, manifest);
}

export function assertCatalogPayload(
  payload: GlobalMapCatalog,
  manifest: GlobalMapManifest,
): GlobalMapCatalog {
  if (
    payload.schemaVersion !== GLOBAL_MAP_SCHEMA_VERSION ||
    payload.dataVersion !== manifest.dataVersion ||
    payload.encoding !== "rows-v1"
  ) {
    throw new Error("Global map catalog version mismatch");
  }
  return payload;
}

export function assertRegionalPayload(
  payload: GlobalMapRegionalPayload,
  manifest: GlobalMapManifest,
): GlobalMapRegionalPayload {
  const encoding = (payload as { encoding?: unknown }).encoding;
  if (
    payload.schemaVersion !== GLOBAL_MAP_SCHEMA_VERSION ||
    payload.dataVersion !== manifest.dataVersion ||
    !Array.isArray(payload.paths)
  ) {
    throw new Error("Global map regional geometry version mismatch");
  }
  if (encoding !== "rows-v1" && encoding !== "rows-v2") {
    throw new Error(`Unsupported global map regional encoding: ${String(encoding)}`);
  }
  for (const row of payload.paths) {
    const [pathIndex, geometrySource, stationIds, vertices, renderStationAnchors] = row;
    if (
      !Number.isInteger(pathIndex) ||
      ![0, 1, 2, 3, 4, 5].includes(geometrySource) ||
      !Array.isArray(stationIds) ||
      stationIds.some((stationId) => typeof stationId !== "string" || stationId.length === 0) ||
      !Array.isArray(vertices) ||
      vertices.length < 2 ||
      vertices.some((vertex) => !Number.isFinite(vertex[0]) || !Number.isFinite(vertex[1]) || (vertex[2] !== undefined && (!Number.isInteger(vertex[2]) || vertex[2] < 0 || vertex[2] >= stationIds.length)))
      || (renderStationAnchors !== undefined && renderStationAnchors !== null && (!Array.isArray(renderStationAnchors) || renderStationAnchors.some((anchor) => !Number.isInteger(anchor[0]) || anchor[0] < 0 || anchor[0] >= stationIds.length || !Number.isFinite(anchor[1]) || !Number.isFinite(anchor[2]))))
    ) {
      throw new Error(`Invalid regional geometry ${pathIndex}`);
    }
    if (payload.encoding === "rows-v2") {
      const metadata = (row as GlobalMapRegionalPathRowV2)[5];
      const quality = metadata?.quality;
      if (
        !metadata ||
        typeof metadata.sourceVersion !== "string" ||
        metadata.sourceVersion.length === 0 ||
        !Array.isArray(metadata.subpathStarts) ||
        !isValidGlobalMapPathSubpathStarts(metadata.subpathStarts, vertices.length) ||
        !Array.isArray(quality) ||
        quality.length !== 4 ||
        typeof quality[0] !== "boolean" ||
        typeof quality[1] !== "boolean" ||
        !Number.isFinite(quality[2]) ||
        !Number.isFinite(quality[3])
      ) {
        throw new Error(`Invalid regional path metadata ${pathIndex}`);
      }
    }
  }
  return payload;
}

export function decodeRegionalPaths(
  payload: GlobalMapRegionalPayload,
  bootstrap: GlobalMapBootstrap,
): GlobalMapPath[] {
  // Bike paths are intentionally omitted from bootstrap.paths to keep the
  // first frame small. Line rows still carry the global path index, so derive
  // the path-to-line relation from those rows instead of indexing the sparse
  // bootstrap path array directly.
  const lineIndexByPathIndex = new Map<number, number>();
  for (const [lineIndex, line] of bootstrap.lines.entries()) {
    for (const pathIndex of line[7]) lineIndexByPathIndex.set(pathIndex, lineIndex);
  }
  return payload.paths.map((row) => {
    const [pathIndex, geometrySource, stationIds, vertices, renderStationAnchors] = row;
    const metadata = payload.encoding === "rows-v2"
      ? (row as GlobalMapRegionalPathRowV2)[5]
      : undefined;
    const lineIndex = lineIndexByPathIndex.get(pathIndex) ?? -1;
    const line = bootstrap.lines[lineIndex];
    const decodedVertices = vertices.map(([x, y, stationIndex]) => ({
      x,
      y,
      ...(stationIndex === undefined ? {} : { stationId: stationIds[stationIndex] }),
    }));
    const source = regionalGeometrySource(geometrySource);
    const decodedRenderStationAnchors = (renderStationAnchors ?? []).map(([stationIndex, x, y]) => ({
      stationId: stationIds[stationIndex]!,
      x,
      y,
    }));
    const quality = metadata
      ? {
          complete: metadata.quality[0],
          fallback: metadata.quality[1],
          gapMeters: metadata.quality[2],
          stationDistanceMaxMeters: metadata.quality[3],
        }
      : {
          complete: source !== "netex-schematic-fallback",
          fallback: source === "netex-schematic-fallback",
          gapMeters: 0,
          stationDistanceMaxMeters: 0,
        };
    return {
      id: `path:regional:${pathIndex}`,
      lineId: line?.[0] ?? `line-index:${lineIndex}`,
      geometrySource: source,
      sourceVersion: metadata?.sourceVersion ?? (source === "gtfs" ? "gtfs-regional-lod1-v7-provider-road-anchors" : source === "netex-schematic-fallback" ? "netex-schematic-v1" : "regional-lod1-v1"),
      quality,
      stationIds,
      vertices: decodedVertices,
      ...(metadata ? { subpathStarts: metadata.subpathStarts } : {}),
      ...(decodedRenderStationAnchors.length > 0 ? { renderStationAnchors: decodedRenderStationAnchors } : {}),
      minX: Math.min(...decodedVertices.map((vertex) => vertex.x)),
      minY: Math.min(...decodedVertices.map((vertex) => vertex.y)),
      maxX: Math.max(...decodedVertices.map((vertex) => vertex.x)),
      maxY: Math.max(...decodedVertices.map((vertex) => vertex.y)),
      chunkIds: [],
    } satisfies GlobalMapPath;
  });
}

function regionalGeometrySource(source: GlobalMapRegionalSource): GlobalMapPath["geometrySource"] {
  switch (source) {
    case 1: return "gtfs";
    case 2: return "official-open-data";
    case 3: return "netex-schematic-fallback";
    case 4: return "mixed";
    case 5: return "bike-source";
    case 0: return "netex";
  }
}

export function parseChunkPayload(
  raw: string,
  manifest: GlobalMapManifest,
  descriptor: GlobalMapChunkDescriptor,
  onJsonParsed?: (durationMs: number) => void,
): GlobalMapChunkPayload {
  const startedAt = nowMs();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } finally {
    onJsonParsed?.(nowMs() - startedAt);
  }
  return assertChunkPayload(parsed as GlobalMapChunkPayload, manifest, descriptor);
}

export function assertChunkPayload(
  payload: GlobalMapChunkPayload,
  manifest: GlobalMapManifest,
  descriptor: GlobalMapChunkDescriptor,
): GlobalMapChunkPayload {
  if (
    payload.schemaVersion !== GLOBAL_MAP_SCHEMA_VERSION ||
    payload.dataVersion !== manifest.dataVersion ||
    payload.chunk.id !== descriptor.id
  ) {
    throw new Error(`Global map chunk version mismatch: ${descriptor.id}`);
  }
  for (const path of payload.paths) {
    if (
      !Array.isArray(path.vertices) ||
      path.vertices.length < 2 ||
      !isValidGlobalMapPathSubpathStarts(path.subpathStarts, path.vertices.length) ||
      Object.entries(path.lodSubpathStarts ?? {}).some(([lod, starts]) =>
        !Array.isArray(path.lodVertices?.[lod]) ||
        !isValidGlobalMapPathSubpathStarts(starts, path.lodVertices[lod]!.length),
      )
    ) {
      throw new Error(`Invalid chunk path subpaths ${path.id}`);
    }
  }
  return payload;
}

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export function decodeBootstrap(
  payload: GlobalMapBootstrap,
  manifest: GlobalMapManifest,
  catalog?: GlobalMapCatalog,
  palette?: GlobalMapLinePaletteDocument,
): TransportMapNetwork {
  const stations = (catalog?.stations ?? payload.stations).map((row, index) => decodeStationRow(row, index, payload.lines));
  const stationsByIndex = new Map(stations.map((station) => [station.index, station]));
  const stationIdsByLineId = indexStationIdsByLine(stations);
  const paletteByKey = createPaletteIndex(palette);
  const lines = payload.lines.map((row, index) => decodeLineRow(
    row,
    stationsByIndex,
    stationIdsByLineId,
    index,
    paletteByKey,
  ));
  const paths = payload.paths.map((row) => {
    const [pathIndex, lineIndex, startX, startY, endX, endY] = row;
    const line = lines[lineIndex];
    const stationIds = line?.stationIds ?? [];
    return {
      id: `path:regional:${pathIndex}`,
      lineId: line?.id ?? `line-index:${lineIndex}`,
      geometrySource: "netex-schematic-fallback" as const,
      sourceVersion: "netex-schematic-v1",
      quality: { complete: false, fallback: true, gapMeters: 0, stationDistanceMaxMeters: 0 },
      stationIds: stationIds.length > 1 ? [stationIds[0]!, stationIds.at(-1)!] : [],
      vertices: [{ x: startX }, { x: endX }].map((vertex, vertexIndex) => ({
        x: vertex.x,
        y: vertexIndex === 0 ? startY : endY,
      })),
      minX: Math.min(startX, endX),
      minY: Math.min(startY, endY),
      maxX: Math.max(startX, endX),
      maxY: Math.max(startY, endY),
      chunkIds: [],
    } satisfies GlobalMapPath;
  });
  const pathsById = new Map(paths.map((path) => [path.id, path]));
  const linesById = new Map(lines.map((line) => [line.id, line]));
  const stationsById = new Map(stations.map((station) => [station.id, station]));
  const entrances = (catalog?.entrances ?? []).map(([id, stationIndex, name, lon, lat, worldX, worldY, code]) => ({
    id,
    stationIndex,
    stationId: stationsByIndex.get(stationIndex)?.id ?? "",
    name,
    ...(code ? { code } : {}),
    lon,
    lat,
    worldX,
    worldY,
  })).filter((entrance) => Boolean(entrance.stationId));
  return {
    lines,
    stations,
    regionalPaths: paths,
    pathsById,
    linesById,
    stationsById,
    entrances,
    bounds: manifest.bounds,
  };
}

function decodeLineRow(
  row: GlobalMapBootstrap["lines"][number],
  stationsByIndex: Map<number, GlobalMapStation>,
  stationIdsByLineId: Map<string, string[]>,
  index: number,
  paletteByKey: Map<string, GlobalMapLinePaletteDocument["entries"][number]>,
): GlobalMapLine {
  const [id, code, label, mode, color, textColor, stationIndices, pathIndices, pictogram] = row;
  const paletteEntry = paletteByKey.get(normalizePaletteKey(id)) ?? paletteByKey.get(normalizePaletteKey(code));
  // The packed colors are compiled from GTFS routes.txt and are authoritative
  // for the global map. The optional line palette may enrich labels/icons but
  // must not replace the GTFS color values.
  const presentation = createLinePresentation({
    id,
    code,
    longName: label,
    shortName: label,
    ref: id,
    mode,
    color,
    textColor,
    officialPalette: { color, textColor },
  });
  const decodedStationIds = stationIndices
    .map((stationIndex) => stationsByIndex.get(stationIndex)?.id)
    .filter((value): value is string => Boolean(value));
  const catalogStationIds = stationIdsByLineId.get(id) ?? [];
  return {
    id,
    index,
    code: paletteEntry?.code ?? code,
    label: paletteEntry?.label ?? label,
    mode: paletteEntry?.mode ?? mode,
    color: presentation.color,
    textColor: presentation.textColor,
    pictogram: paletteEntry?.pictogram ?? pictogram ?? null,
    aliases: [code, label],
    stationIds: decodedStationIds.length > 0 ? decodedStationIds : catalogStationIds,
    geometryIds: pathIndices.map((index) => `path:regional:${index}`),
  };
}

function createPaletteIndex(
  palette?: GlobalMapLinePaletteDocument,
): Map<string, GlobalMapLinePaletteDocument["entries"][number]> {
  return new Map(
    (palette?.entries ?? []).flatMap((entry) => [
      [normalizePaletteKey(entry.id), entry] as const,
      [normalizePaletteKey(entry.code), entry] as const,
    ]),
  );
}

function normalizePaletteKey(value: string): string {
  return value.trim().replace(/^line:/iu, "").toLocaleLowerCase("en-US");
}

function indexStationIdsByLine(stations: GlobalMapStation[]): Map<string, string[]> {
  const stationIdsByLineId = new Map<string, string[]>();
  for (const station of stations) {
    for (const lineId of station.lineIds) {
      const stationIds = stationIdsByLineId.get(lineId);
      if (stationIds) stationIds.push(station.id);
      else stationIdsByLineId.set(lineId, [station.id]);
    }
  }
  return stationIdsByLineId;
}

function decodeStationRow(
  row: GlobalMapBootstrap["stations"][number],
  index: number,
  lines: GlobalMapBootstrap["lines"],
): GlobalMapStation {
  const [id, name, city, sourceX, sourceY, lon, lat, worldX, worldY, ownerChunkId, isHub, lineIndices, rawRefs] = row;
  return {
    id,
    index,
    name,
    normalizedName: normalizeName(name),
    city: city ?? undefined,
    aliases: [name],
    rawRefs: rawRefs?.length ? [...new Set(rawRefs)] : [id],
    lineIds: lineIndices
      .map((lineIndex) => lines[lineIndex]?.[0])
      .filter((value): value is string => Boolean(value)),
    ownerChunkId,
    isHub,
    sourceCrs: "EPSG:2154",
    sourceX,
    sourceY,
    lon,
    lat,
    worldX,
    worldY,
    coordinateSource: "netex",
    coordinateAccuracyM: 1,
    transformVersion: "lambert93-ntf-v1",
  };
}

function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLocaleLowerCase("fr");
}
