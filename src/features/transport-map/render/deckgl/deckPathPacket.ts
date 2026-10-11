import type { TransportMapWorkerPool } from "../../workers/workerPool";
import type { TransportMapTraceEventId } from "../../performance/transportMapPerformanceTrace";
import { lonLatToWorld } from "../../geo/coordinateKernel";
import { MAPLIBRE_VECTOR_WORLD_TILE_SIZE } from "../../next/nextMapCamera";
import type {
  TransportMapBinaryPathPacket,
  TransportMapPathRenderRecord,
} from "../transportMapRenderModel";
import {
  resolveDeckPathColor,
  resolveDeckPathDashArray,
} from "./deckPathAttributes";

export interface DeckPathCompilePayload {
  key: string;
  positions: Float64Array;
  startIndices: Uint32Array;
  colors: Uint8Array;
  widths: Float32Array;
  dashArrays: Float32Array;
  pathIds: string[];
  lineIds: string[];
  projectToCommon?: boolean;
}

/** One owned transfer buffer, regardless of the number of bus subpaths. */
export function packDeckPathCompilePayload(
  records: readonly TransportMapPathRenderRecord[],
  key: string,
  projectToCommon = false,
): DeckPathCompilePayload {
  const coordinateCount = records.reduce((length, record) => length + record.positions.length, 0);
  // Transfer numeric styles with coordinates. Structured-cloning thousands
  // of record objects/colors was synchronous even though compilation ran in
  // a worker. All views share one owned buffer; source data is never detached.
  const buffer = new ArrayBuffer(coordinateCount * 8 + (records.length + 1) * 4 + records.length * 16);
  const positions = new Float64Array(buffer, 0, coordinateCount);
  let offset = positions.byteLength;
  const startIndices = new Uint32Array(buffer, offset, records.length + 1);
  offset += startIndices.byteLength;
  const colors = new Uint8Array(buffer, offset, records.length * 4);
  offset += colors.byteLength;
  const widths = new Float32Array(buffer, offset, records.length);
  offset += widths.byteLength;
  const dashArrays = new Float32Array(buffer, offset, records.length * 2);
  const pathIds: string[] = [];
  const lineIds: string[] = [];
  let vertexCursor = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const count = record.positions.length / 2;
    if (!Number.isInteger(count) || count < 2) {
      throw new Error(`Deck path record must contain at least two XY vertices: ${record.id}`);
    }
    positions.set(record.positions, vertexCursor * 2);
    startIndices[index] = vertexCursor;
    colors.set(resolveDeckPathColor(record), index * 4);
    widths[index] = record.widthCssPx;
    dashArrays.set(resolveDeckPathDashArray(record), index * 2);
    pathIds.push(record.pathId);
    lineIds.push(record.lineId);
    vertexCursor += count;
  }
  startIndices[records.length] = vertexCursor;
  return { key, positions, startIndices, colors, widths, dashArrays, pathIds, lineIds, projectToCommon };
}

export function compileDeckPathPayload(payload: DeckPathCompilePayload): TransportMapBinaryPathPacket {
  const vertexCount = payload.positions.length / 2;
  const colors = new Uint8Array(vertexCount * 4);
  const widths = new Float32Array(vertexCount);
  const dashArrays = new Float32Array(vertexCount * 2);
  for (let pathIndex = 0; pathIndex < payload.pathIds.length; pathIndex += 1) {
    const start = payload.startIndices[pathIndex]!;
    const end = payload.startIndices[pathIndex + 1]!;
    for (let vertexIndex = start; vertexIndex < end; vertexIndex += 1) {
      const colorOffset = vertexIndex * 4;
      const pathColorOffset = pathIndex * 4;
      colors[colorOffset] = payload.colors[pathColorOffset]!;
      colors[colorOffset + 1] = payload.colors[pathColorOffset + 1]!;
      colors[colorOffset + 2] = payload.colors[pathColorOffset + 2]!;
      colors[colorOffset + 3] = payload.colors[pathColorOffset + 3]!;
      widths[vertexIndex] = payload.widths[pathIndex]!;
      dashArrays[vertexIndex * 2] = payload.dashArrays[pathIndex * 2]!;
      dashArrays[vertexIndex * 2 + 1] = payload.dashArrays[pathIndex * 2 + 1]!;
    }
  }
  const positions = payload.positions.slice();
  const startIndices = payload.startIndices.slice();
  const commonPositions = payload.projectToCommon ? projectDeckPathPositions(positions) : undefined;
  const bytes = positions.byteLength + startIndices.byteLength + colors.byteLength + widths.byteLength + dashArrays.byteLength + (commonPositions?.byteLength ?? 0);
  return validateTransportMapBinaryPathPacket({
    key: payload.key, length: payload.pathIds.length, pathCount: payload.pathIds.length,
    positions, commonPositions, startIndices, colors, widths, dashArrays,
    pathIds: payload.pathIds, lineIds: payload.lineIds, bytes,
  });
}

export function createDeckPathBinaryPacket(
  records: readonly TransportMapPathRenderRecord[],
  key: string,
  projectToCommon = false,
): TransportMapBinaryPathPacket {
  const recordVertexCounts = records.map((record) => {
    const count = record.positions.length / 2;
    if (!Number.isInteger(count) || count < 2) {
      throw new Error(`Deck path record must contain at least two XY vertices: ${record.id}`);
    }
    return count;
  });
  const vertexCount = recordVertexCounts.reduce((total, count) => total + count, 0);
  const positions = new Float64Array(vertexCount * 2);
  const startIndices = new Uint32Array(records.length + 1);
  // PathLayer binary attributes are vertex attributes. Repeating a path's
  // style for each vertex is required; one value per path is not consumed by
  // Deck's binary accessor and produces misaligned colours/widths/dashes.
  const colors = new Uint8Array(vertexCount * 4);
  const widths = new Float32Array(vertexCount);
  const dashArrays = new Float32Array(vertexCount * 2);
  const pathIds: string[] = [];
  const lineIds: string[] = [];
  let vertexCursor = 0;

  records.forEach((record, index) => {
    const count = recordVertexCounts[index]!;
    positions.set(record.positions, vertexCursor * 2);
    startIndices[index] = vertexCursor;
    const color = resolveDeckPathColor(record);
    const dashArray = resolveDeckPathDashArray(record);
    for (let vertexIndex = 0; vertexIndex < count; vertexIndex += 1) {
      const attributeVertexIndex = vertexCursor + vertexIndex;
      colors.set(color, attributeVertexIndex * 4);
      widths[attributeVertexIndex] = record.widthCssPx;
      dashArrays.set(dashArray, attributeVertexIndex * 2);
    }
    vertexCursor += count;
    pathIds.push(record.pathId);
    lineIds.push(record.lineId);
  });
  startIndices[records.length] = vertexCursor;

  const commonPositions = projectToCommon ? projectDeckPathPositions(positions) : undefined;
  const bytes = positions.byteLength + startIndices.byteLength + colors.byteLength +
    widths.byteLength + dashArrays.byteLength + (commonPositions?.byteLength ?? 0);
  return validateTransportMapBinaryPathPacket({
    key,
    length: records.length,
    pathCount: records.length,
    positions,
    commonPositions,
    startIndices,
    colors,
    widths,
    dashArrays,
    pathIds,
    lineIds,
    bytes,
  });
}

/** Same Float64 projection used by the flat Deck layer's object-data adapter. */
export function projectDeckPathPositions(positions: Float64Array): Float64Array {
  const common = new Float64Array(positions.length);
  for (let index = 0; index < positions.length; index += 2) {
    const world = lonLatToWorld({ lon: positions[index]!, lat: positions[index + 1]! });
    common[index] = world.x * MAPLIBRE_VECTOR_WORLD_TILE_SIZE;
    common[index + 1] = (1 - world.y) * MAPLIBRE_VECTOR_WORLD_TILE_SIZE;
  }
  return common;
}

/** Validate the exact binary shape consumed by Deck's PathLayer. */
export function validateTransportMapBinaryPathPacket(
  packet: TransportMapBinaryPathPacket,
): TransportMapBinaryPathPacket {
  const pathCount = packet.pathCount;
  if (
    typeof packet.key !== "string" ||
    !Number.isInteger(packet.length) ||
    !Number.isInteger(pathCount) ||
    packet.length !== pathCount ||
    pathCount < 0 ||
    !(packet.positions instanceof Float64Array) ||
    (packet.commonPositions !== undefined && (!(packet.commonPositions instanceof Float64Array) || packet.commonPositions.length !== packet.positions.length)) ||
    !(packet.startIndices instanceof Uint32Array) ||
    !(packet.colors instanceof Uint8Array) ||
    !(packet.widths instanceof Float32Array) ||
    !(packet.dashArrays instanceof Float32Array) ||
    !Array.isArray(packet.pathIds) ||
    !Array.isArray(packet.lineIds) ||
    packet.positions.length % 2 !== 0 ||
    packet.pathIds.length !== pathCount ||
    packet.lineIds.length !== pathCount
  ) {
    throw new Error(`Invalid Deck binary path packet shape: ${packet.key}`);
  }

  const vertexCount = packet.positions.length / 2;
  if (
    packet.colors.length !== vertexCount * 4 ||
    packet.widths.length !== vertexCount ||
    packet.dashArrays.length !== vertexCount * 2 ||
    packet.pathIds.some((id) => typeof id !== "string") ||
    packet.lineIds.some((id) => typeof id !== "string") ||
    packet.positions.some((value) => !Number.isFinite(value)) ||
    packet.commonPositions?.some((value) => !Number.isFinite(value)) ||
    packet.widths.some((value) => !Number.isFinite(value) || value < 0) ||
    packet.dashArrays.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throw new Error(`Invalid Deck binary path packet attributes: ${packet.key}`);
  }
  if (
    packet.startIndices.length !== pathCount + 1 ||
    packet.startIndices[0] !== 0 ||
    packet.startIndices[pathCount] !== vertexCount
  ) {
    throw new Error(`Invalid Deck binary path packet indices: ${packet.key}`);
  }
  for (let index = 0; index < pathCount; index += 1) {
    const start = packet.startIndices[index]!;
    const end = packet.startIndices[index + 1]!;
    if (end <= start || end > vertexCount || end - start < 2) {
      throw new Error(`Invalid Deck binary path packet indices: ${packet.key}`);
    }
  }

  const expectedBytes =
    packet.positions.byteLength +
    packet.startIndices.byteLength +
    packet.colors.byteLength +
    packet.widths.byteLength +
    packet.dashArrays.byteLength + (packet.commonPositions?.byteLength ?? 0);
  if (packet.bytes !== expectedBytes) {
    throw new Error(`Invalid Deck binary path packet byte count: ${packet.key}`);
  }
  return packet;
}

/** Stable key: camera-only changes do not alter this geometry identity. */
export function deckPathPacketKey(
  records: readonly TransportMapPathRenderRecord[],
  role: "base" | "traffic" | "highlight",
  stableIdentity?: string,
): string {
  // Production callers pass the short generation owned by the prepared
  // render model. Keep a bounded fallback for standalone callers/tests; the
  // old per-record style/geometry serialization made cache keys grow with
  // the entire network.
  const identity = stableIdentity ?? fallbackRecordsIdentity(records);
  return `${role}:${identity}`;
}

const recordIdentityTokens = new WeakMap<object, number>();
let nextRecordIdentity = 1;

function recordIdentityToken(record: TransportMapPathRenderRecord): number {
  const existing = recordIdentityTokens.get(record);
  if (existing !== undefined) return existing;
  const token = nextRecordIdentity++;
  recordIdentityTokens.set(record, token);
  return token;
}

function fallbackRecordsIdentity(records: readonly TransportMapPathRenderRecord[]): string {
  if (records.length === 0) return "empty";
  const first = records[0]!;
  const last = records[records.length - 1]!;
  const vertexCount = records.reduce((sum, record) => sum + record.positions.length / 2, 0);
  return `${recordIdentityToken(first)}-${recordIdentityToken(last)}-${records.length}-${vertexCount}`;
}

export interface DeckPathPacketCompiler {
  /** Identifies whether compile() is expected to occupy the main thread. */
  readonly executionContext?: "worker" | "main-thread";
  compile(
    records: readonly TransportMapPathRenderRecord[],
    key: string,
    generation: number,
    parentId?: TransportMapTraceEventId,
  ): Promise<TransportMapBinaryPathPacket>;
}

/** Uses the existing bounded Worker pool when available, with a deterministic fallback. */
export class WorkerBackedDeckPathPacketCompiler implements DeckPathPacketCompiler {
  readonly executionContext: "worker" | "main-thread";

  constructor(private readonly workerPool?: TransportMapWorkerPool) {
    this.executionContext = workerPool && workerPool.workerCount > 0
      ? "worker"
      : "main-thread";
  }

  compile(
    records: readonly TransportMapPathRenderRecord[],
    key: string,
    generation: number,
    parentId?: TransportMapTraceEventId,
  ): Promise<TransportMapBinaryPathPacket> {
    if (!this.workerPool || this.workerPool.workerCount === 0) {
      return Promise.resolve(createDeckPathBinaryPacket(records, key, true));
    }
    // The original scene owns these buffers. Give the worker explicit copies
    // so transfer-list ownership never detaches data still used by Deck.
    const payload = packDeckPathCompilePayload(records, key, true);
    const transferList = [payload.positions.buffer];
    return this.workerPool.run(
      "compile-deck-paths",
      payload,
      generation,
      "background",
      () => createDeckPathBinaryPacket(records, key, true),
      transferList,
      parentId,
    ) as Promise<TransportMapBinaryPathPacket>;
  }
}
