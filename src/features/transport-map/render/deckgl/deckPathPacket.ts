import type { TransportMapWorkerPool } from "../../workers/workerPool";
import type { TransportMapTraceEventId } from "../../performance/transportMapPerformanceTrace";
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
  records: readonly TransportMapPathRenderRecord[];
}

export function createDeckPathBinaryPacket(
  records: readonly TransportMapPathRenderRecord[],
  key: string,
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

  const bytes = positions.byteLength + startIndices.byteLength + colors.byteLength +
    widths.byteLength + dashArrays.byteLength;
  return validateTransportMapBinaryPathPacket({
    key,
    length: records.length,
    pathCount: records.length,
    positions,
    startIndices,
    colors,
    widths,
    dashArrays,
    pathIds,
    lineIds,
    bytes,
  });
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
    [...packet.positions].some((value) => !Number.isFinite(value)) ||
    [...packet.widths].some((value) => !Number.isFinite(value) || value < 0) ||
    [...packet.dashArrays].some((value) => !Number.isFinite(value) || value < 0)
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
    packet.dashArrays.byteLength;
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
      return Promise.resolve(createDeckPathBinaryPacket(records, key));
    }
    // The original scene owns these buffers. Give the worker explicit copies
    // so transfer-list ownership never detaches data still used by Deck.
    const workerRecords = records.map((record) => ({
      ...record,
      positions: new Float64Array(record.positions),
    }));
    const transferList = workerRecords.map((record) => record.positions.buffer);
    return this.workerPool.run(
      "compile-deck-paths",
      { key, records: workerRecords },
      generation,
      "background",
      () => createDeckPathBinaryPacket(records, key),
      transferList,
      parentId,
    ) as Promise<TransportMapBinaryPathPacket>;
  }
}
