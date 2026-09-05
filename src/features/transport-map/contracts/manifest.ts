export const GLOBAL_MAP_SCHEMA_VERSION = 1 as const;
export const GLOBAL_MAP_MIN_READER_VERSION = 1 as const;
export const GLOBAL_MAP_TRANSFORM_VERSION = "lambert93-ntf-v1" as const;

export type GlobalMapMode =
  | "BUS"
  | "METRO"
  | "RER"
  | "TRAIN"
  | "TRANSILIEN"
  | "TRAM"
  | "CABLE"
  | "NOCTILIEN"
  | "BIKE";

export const GLOBAL_MAP_MODE_ORDER: GlobalMapMode[] = [
  "BUS",
  "METRO",
  "RER",
  "TRAIN",
  "TRANSILIEN",
  "TRAM",
  "CABLE",
  "NOCTILIEN",
  "BIKE",
];

export interface GlobalMapLinePaletteEntry {
  id: string;
  code: string;
  label: string;
  mode: GlobalMapMode;
  color: string;
  textColor: string;
  pictogram?: string | null;
}

export interface GlobalMapLinePaletteDocument {
  version: string;
  source: string;
  checksum?: string;
  entries: GlobalMapLinePaletteEntry[];
}

export interface GlobalMapPaletteManifest {
  version: string;
  source: string;
  checksum: string;
  entryCount: number;
  missingCount: number;
  missingSample: string[];
  complete: boolean;
}

export interface GlobalMapBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GlobalMapLodDefinition {
  level: number;
  minZoom: number;
  maxZoom: number;
  maxErrorMeters: number;
}

export interface GlobalMapStation {
  id: string;
  index: number;
  name: string;
  normalizedName: string;
  city?: string;
  aliases: string[];
  rawRefs: string[];
  lineIds: string[];
  ownerChunkId: string;
  isHub: boolean;
  sourceCrs: "EPSG:2154";
  sourceX: number;
  sourceY: number;
  lon: number;
  lat: number;
  worldX: number;
  worldY: number;
  coordinateSource: "netex" | "gtfs" | "official-open-data" | "bike-source" | "netex-schematic-fallback";
  coordinateAccuracyM?: number;
  transformVersion: typeof GLOBAL_MAP_TRANSFORM_VERSION;
}

export interface GlobalMapLine {
  id: string;
  index: number;
  code: string;
  label: string;
  mode: GlobalMapMode;
  color: string;
  textColor: string;
  pictogram?: string | null;
  aliases: string[];
  stationIds: string[];
  geometryIds: string[];
  sourceLineId?: string | null;
  sourceMode?: string | null;
}

export interface GlobalMapEntrance {
  id: string;
  stationIndex: number;
  stationId: string;
  name: string;
  /** GTFS stop_code when the precompiler supplied one. */
  code?: string | null;
  lon: number;
  lat: number;
  worldX: number;
  worldY: number;
}

export interface GlobalMapVertex {
  stationId?: string;
  x: number;
  y: number;
}

/**
 * Provider trace anchor used only when rendering a line. Canonical station
 * coordinates remain in GlobalMapStation and in the stationId vertices.
 */
export interface GlobalMapStationAnchor {
  stationId: string;
  x: number;
  y: number;
}

export interface GlobalMapPathQuality {
  complete: boolean;
  fallback: boolean;
  gapMeters: number;
  stationDistanceMaxMeters: number;
}

export interface GlobalMapPath {
  id: string;
  lineId: string;
  geometrySource: "netex" | "gtfs" | "mixed" | "official-open-data" | "bike-source" | "netex-schematic-fallback";
  sourceVersion: string;
  quality: GlobalMapPathQuality;
  stationIds: string[];
  vertices: GlobalMapVertex[];
  /**
   * Inclusive starts of independent clipped fragments in `vertices`.
   *
   * A chunk can contain two disjoint pieces of one source polyline. Keeping
   * those starts explicit prevents the renderer from inventing a segment
   * between the end of one piece and the beginning of the next one.
   */
  subpathStarts?: number[];
  renderStationAnchors?: GlobalMapStationAnchor[];
  lodVertices?: Record<string, GlobalMapVertex[]>;
  lodSubpathStarts?: Record<string, number[]>;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  chunkIds: string[];
}

export interface GlobalMapChunkDescriptor {
  id: string;
  level: number;
  bounds: GlobalMapBounds;
  asset: string;
  /** Modes represented by this chunk; used to skip bus-only chunks while Bus is off. */
  modes?: GlobalMapMode[];
  bytes?: number;
  checksum?: string;
}

export interface GlobalMapChunkMembership extends GlobalMapChunkDescriptor {
  pathIds: string[];
  stationIds: string[];
  lineIds: string[];
}

export interface GlobalMapSpatialIndexHeader {
  schemaVersion: number;
  kind: "stations" | "entrances" | "paths";
  count: number;
  bounds: GlobalMapBounds;
  asset: string;
}

export interface GlobalMapManifest {
  schemaVersion: typeof GLOBAL_MAP_SCHEMA_VERSION;
  minReaderVersion: typeof GLOBAL_MAP_MIN_READER_VERSION;
  dataVersion: string;
  generatedAt: string;
  sourceVersions: Record<string, string>;
  projection: {
    name: "WebMercatorNormalized";
    sourceCrs: "EPSG:2154";
    transformVersion: typeof GLOBAL_MAP_TRANSFORM_VERSION;
  };
  bounds: GlobalMapBounds;
  lod: GlobalMapLodDefinition[];
  modes: GlobalMapMode[];
  files: {
    bootstrap: { asset: string; bytes: number; checksum: string };
    catalog: { asset: string; bytes: number; checksum: string };
    /** Optional for backwards-compatible fixtures; required by the V2 pack. */
    regional?: { asset: string; bytes: number; checksum: string };
    /** Optional for backwards-compatible fixtures; loaded only when Bus is visible. */
    regionalBus?: { asset: string; bytes: number; checksum: string };
    /** Optional for packs containing the lazily loaded PRIM cycling network. */
    regionalBike?: { asset: string; bytes: number; checksum: string };
    /** Official per-line presentation palette, when the pack was compiled with one. */
    linePalette?: { asset: string; bytes: number; checksum: string };
    chunks: GlobalMapChunkDescriptor[];
    stationIndex: GlobalMapSpatialIndexHeader;
    pathIndex: GlobalMapSpatialIndexHeader;
  };
  /** Explicit provenance/completeness state; old packs may omit it. */
  palette?: GlobalMapPaletteManifest;
  counts: {
    lines: number;
    stations: number;
    paths: number;
    vertices: number;
    chunks: number;
    entrances: number;
    bikes: number;
  };
  warnings: Array<{ code: string; count: number; sample?: string[] }>;
  compilation: {
    deterministic: true;
    hashAlgorithm: "sha256";
    quantizationMeters: number;
    staticExternalRequests: 0;
  };
}

export interface GlobalMapBootstrap {
  schemaVersion: typeof GLOBAL_MAP_SCHEMA_VERSION;
  dataVersion: string;
  encoding: "rows-v1";
  lines: Array<[
    id: string,
    code: string,
    label: string,
    mode: GlobalMapMode,
    color: string,
    textColor: string,
    stationIndices: number[],
    pathIndices: number[],
    pictogram?: string | null,
  ]>;
  stations: Array<[
    id: string,
    name: string,
    city: string | null,
    sourceX: number,
    sourceY: number,
    lon: number,
    lat: number,
    worldX: number,
    worldY: number,
    ownerChunkId: string,
    isHub: boolean,
    lineIndices: number[],
    rawRefs?: string[],
  ]>;
  paths: Array<[pathIndex: number, lineIndex: number, startX: number, startY: number, endX: number, endY: number]>;
}

export interface GlobalMapCatalog {
  schemaVersion: typeof GLOBAL_MAP_SCHEMA_VERSION;
  dataVersion: string;
  encoding: "rows-v1";
  stations: GlobalMapBootstrap["stations"];
  entrances: Array<[
    id: string,
    stationIndex: number,
    name: string,
    lon: number,
    lat: number,
    worldX: number,
    worldY: number,
    code?: string | null,
  ]>;
}

export type GlobalMapRegionalSource = 0 | 1 | 2 | 3 | 4 | 5;

export type GlobalMapRegionalVertexRow = [x: number, y: number, stationIndex?: number];

export type GlobalMapRegionalStationAnchorRow = [stationIndex: number, x: number, y: number];

/** Compact quality tuple carried by the rows-v2 regional assets. */
export type GlobalMapRegionalQualityRow = [
  complete: boolean,
  fallback: boolean,
  gapMeters: number,
  stationDistanceMaxMeters: number,
];

/** Metadata that belongs to the simplified vertices stored in one regional row. */
export interface GlobalMapRegionalPathMetadata {
  /** Starts for the exact vertex array in this row, normally the regional LOD. */
  subpathStarts: number[];
  quality: GlobalMapRegionalQualityRow;
  sourceVersion: string;
}

export type GlobalMapRegionalPathRowV1 = [
  pathIndex: number,
  geometrySource: GlobalMapRegionalSource,
  stationIds: string[],
  vertices: GlobalMapRegionalVertexRow[],
  renderStationAnchors?: GlobalMapRegionalStationAnchorRow[],
];

/**
 * rows-v2 keeps the regional simplification honest: subpath boundaries,
 * quality and source provenance describe the same simplified vertex array.
 * `null` is an intentional placeholder so optional station anchors cannot be
 * confused with the metadata field.
 */
export type GlobalMapRegionalPathRowV2 = [
  pathIndex: number,
  geometrySource: GlobalMapRegionalSource,
  stationIds: string[],
  vertices: GlobalMapRegionalVertexRow[],
  renderStationAnchors: GlobalMapRegionalStationAnchorRow[] | null,
  metadata: GlobalMapRegionalPathMetadata,
];

export interface GlobalMapRegionalPayloadV1 {
  schemaVersion: typeof GLOBAL_MAP_SCHEMA_VERSION;
  dataVersion: string;
  encoding: "rows-v1";
  paths: GlobalMapRegionalPathRowV1[];
}

export interface GlobalMapRegionalPayloadV2 {
  schemaVersion: typeof GLOBAL_MAP_SCHEMA_VERSION;
  dataVersion: string;
  encoding: "rows-v2";
  paths: GlobalMapRegionalPathRowV2[];
}

export type GlobalMapRegionalPathRow = GlobalMapRegionalPathRowV2;
export type GlobalMapRegionalPayload = GlobalMapRegionalPayloadV1 | GlobalMapRegionalPayloadV2;

export interface GlobalMapChunkPayload {
  schemaVersion: typeof GLOBAL_MAP_SCHEMA_VERSION;
  dataVersion: string;
  chunk: GlobalMapChunkMembership;
  paths: GlobalMapPath[];
}

export interface GlobalMapPathSubpathRange {
  start: number;
  end: number;
}

/**
 * Returns the independent vertex ranges that may be stroked or hit-tested.
 * Legacy packs omit `subpathStarts`, which intentionally means one complete
 * polyline and remains fully backwards compatible.
 */
export function getGlobalMapPathSubpathRanges(
  path: Pick<GlobalMapPath, "vertices" | "subpathStarts">,
): GlobalMapPathSubpathRange[] {
  if (path.vertices.length < 2) return [];

  const declaredStarts = path.subpathStarts?.length ? path.subpathStarts : [0];
  const starts = declaredStarts[0] === 0 ? declaredStarts : [0, ...declaredStarts];
  const ranges: GlobalMapPathSubpathRange[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const nextStart = starts[index + 1] ?? path.vertices.length;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(nextStart) ||
      start < 0 ||
      nextStart > path.vertices.length ||
      nextStart <= start
    ) continue;
    if (nextStart - start >= 2) ranges.push({ start, end: nextStart });
  }
  return ranges;
}

export function isValidGlobalMapPathSubpathStarts(
  starts: number[] | undefined,
  vertexCount: number,
): boolean {
  if (starts === undefined) return true;
  if (starts.length === 0 || starts[0] !== 0) return false;
  return starts.every((start, index) =>
    Number.isInteger(start) &&
    start >= 0 &&
    start < vertexCount &&
    (index === 0 || start > starts[index - 1]!),
  );
}

export function resolveGlobalMapVertex(
  path: GlobalMapPath,
  vertex: GlobalMapVertex,
  station?: Pick<GlobalMapStation, "worldX" | "worldY">,
  mode?: GlobalMapMode,
): GlobalMapVertex {
  const providerAnchor = vertex.stationId && path.renderStationAnchors
    ? path.renderStationAnchors.find((anchor) => anchor.stationId === vertex.stationId)
    : undefined;

  // Road-based modes deliberately keep the provider endpoint beside the
  // canonical station coordinate. The map stroke must follow that road
  // anchor; the station marker itself remains on the canonical coordinate.
  if ((mode === "BUS" || mode === "NOCTILIEN") && providerAnchor) {
    return providerAnchor;
  }

  // A provider road anchor can be several metres away from the canonical
  // station marker. When the marker is available, the rendered stroke must
  // terminate on that same world point; otherwise the station looks orphaned
  // at detailed zoom even though the source path carries its station id.
  if (
    vertex.stationId &&
    station &&
    Number.isFinite(station.worldX) &&
    Number.isFinite(station.worldY)
  ) {
    return { x: station.worldX, y: station.worldY };
  }
  return providerAnchor ?? vertex;
}
