import { inflateSync, strFromU8 } from "fflate";
import { normalizeWalkingIsochroneGeometry, type WalkingIsochroneGeometry } from "../../../src/shared/walkingIsochroneGeometry";
import {
  assertGlobalIsochroneIndex, GlobalIsochroneError,
  type GlobalIsochroneIndex, type GlobalIsochroneRequest, type GlobalIsochroneResult,
} from "../../../src/features/transport-map/isochrones/contracts";
import type { IsochroneRangeSource } from "./rangeSource";

const MAX_ENTRY = 32 * 1024 * 1024;
const MAX_DIRECTORY = 8 * 1024 * 1024;
const MAX_RESPONSE = 64 * 1024 * 1024;
const MAX_GEOMETRY_CACHE = 24 * 1024 * 1024;
interface Entry { offset: number; compressed: number; original: number; crc: number; method: number; name: string }
const crcTable = Uint32Array.from({ length: 256 }, (_, byte) => {
  for (let bit = 0; bit < 8; bit++) byte = (byte & 1) ? 0xedb88320 ^ (byte >>> 1) : byte >>> 1;
  return byte >>> 0;
});

/** One index per immutable archive identity. No full ZIP buffer, including on R2. */
export class IndexedIsochroneArchive {
  private cache = new Map<string, { geometry: WalkingIsochroneGeometry; cost: number }>();
  private cacheBytes = 0;
  private constructor(readonly index: GlobalIsochroneIndex, private entries: Map<string, Entry>, private directoryOffset: number) {}

  static async open(source: IsochroneRangeSource): Promise<IndexedIsochroneArchive> {
    try {
      if (source.size < 22 || source.size >= 0xffffffff) throw new Error();
      // Our versioned writer emits standard single-disk ZIP without comments or ZIP64.
      const footer = view(await source.read(source.size - 22, 22));
      if (footer.getUint32(0, true) !== 0x06054b50 || footer.getUint16(4, true) || footer.getUint16(6, true) || footer.getUint16(20, true)) throw new Error();
      const count = footer.getUint16(10, true);
      const size = footer.getUint32(12, true);
      const start = footer.getUint32(16, true);
      if (!count || count === 65535 || count !== footer.getUint16(8, true) || size > MAX_DIRECTORY || start + size !== source.size - 22) throw new Error();
      const raw = await source.read(start, size);
      const directory = view(raw);
      const entries = new Map<string, Entry>();
      let cursor = 0;
      for (let i = 0; i < count; i++) {
        if (cursor + 46 > size || directory.getUint32(cursor, true) !== 0x02014b50 || (directory.getUint16(cursor + 8, true) & 1)) throw new Error();
        const nameLength = directory.getUint16(cursor + 28, true);
        const next = cursor + 46 + nameLength + directory.getUint16(cursor + 30, true) + directory.getUint16(cursor + 32, true);
        if (next > size || directory.getUint16(cursor + 34, true)) throw new Error();
        const name = strFromU8(raw.subarray(cursor + 46, cursor + 46 + nameLength));
        const entry: Entry = { name, method: directory.getUint16(cursor + 10, true), crc: directory.getUint32(cursor + 16, true), compressed: directory.getUint32(cursor + 20, true), original: directory.getUint32(cursor + 24, true), offset: directory.getUint32(cursor + 42, true) };
        if (entries.has(name) || ![0, 8].includes(entry.method) || entry.original > MAX_ENTRY || entry.compressed > MAX_ENTRY || !entry.compressed || entry.offset + 30 + entry.compressed > start) throw new Error();
        entries.set(name, entry);
        cursor = next;
      }
      if (cursor !== size) throw new Error();
      const indexEntry = entries.get("index.json");
      if (!indexEntry) throw new Error();
      const index = JSON.parse(strFromU8(await readEntry(source, indexEntry, start)));
      assertGlobalIsochroneIndex(index);
      for (const scope of Object.values(index.scopes)) for (const zone of Object.values(scope.zones)) {
        if (entries.get(zone.asset)?.original !== zone.bytes) throw new Error();
      }
      return new IndexedIsochroneArchive(index, entries, start);
    } catch (error) {
      if (error instanceof GlobalIsochroneError) throw error;
      throw new GlobalIsochroneError("invalid");
    }
  }

  async select(source: IsochroneRangeSource, requests: readonly GlobalIsochroneRequest[], mapVersion: string): Promise<GlobalIsochroneResult> {
    if (this.index.mapDataVersion !== mapVersion) throw new GlobalIsochroneError("incompatible");
    const total = new Set<string>(), available = new Set<string>();
    const result: GlobalIsochroneResult = { surfaces: [], coverage: { total: 0, available: 0, missing: 0, missingScopes: [] }, generatedAt: this.index.generatedAt, attribution: this.index.attribution };
    let responseBytes = 0;
    for (const request of requests) {
      const scope = this.index.scopes[request.key];
      if (!scope) { result.coverage.missingScopes.push(request.key); continue; }
      if (scope.mode !== request.mode) throw new GlobalIsochroneError("invalid");
      for (const id of scope.stationIds) total.add(id);
      const zone = scope.zones[request.minutes];
      if (!zone) continue;
      responseBytes += zone.bytes;
      if (responseBytes > MAX_RESPONSE) throw new GlobalIsochroneError("invalid");
      let cached = this.cache.get(zone.asset);
      if (cached) { this.cache.delete(zone.asset); this.cache.set(zone.asset, cached); }
      else {
        const raw = await readEntry(source, this.entries.get(zone.asset)!, this.directoryOffset);
        let geometry: WalkingIsochroneGeometry | undefined;
        try { geometry = normalizeWalkingIsochroneGeometry(JSON.parse(strFromU8(raw))); }
        catch { throw new GlobalIsochroneError("invalid"); }
        if (!geometry) throw new GlobalIsochroneError("invalid");
        cached = { geometry, cost: raw.length * 4 };
        if (cached.cost <= MAX_GEOMETRY_CACHE) {
          while (this.cache.size && this.cacheBytes + cached.cost > MAX_GEOMETRY_CACHE) {
            const key = this.cache.keys().next().value!;
            this.cacheBytes -= this.cache.get(key)!.cost; this.cache.delete(key);
          }
          this.cache.set(zone.asset, cached); this.cacheBytes += cached.cost;
        }
      }
      for (const id of scope.coveredStationIds) available.add(id);
      result.surfaces.push({ id: zone.asset, mode: request.mode, minutes: request.minutes, geometry: cached.geometry });
    }
    result.coverage.total = total.size;
    result.coverage.available = available.size;
    result.coverage.missing = total.size - available.size;
    return result;
  }
}

async function readEntry(source: IsochroneRangeSource, entry: Entry, limit: number): Promise<Uint8Array> {
  try {
    const local = view(await source.read(entry.offset, 30));
    if (local.getUint32(0, true) !== 0x04034b50 || (local.getUint16(6, true) & 1) || local.getUint16(8, true) !== entry.method) throw new Error();
    const nameSize = local.getUint16(26, true), extraSize = local.getUint16(28, true);
    const start = entry.offset + 30 + nameSize + extraSize;
    if (start + entry.compressed > limit) throw new Error();
    const name = strFromU8(await source.read(entry.offset + 30, nameSize));
    if (name !== entry.name) throw new Error();
    const compressed = await source.read(start, entry.compressed);
    // A fixed output buffer bounds decompression even for forged ZIP size metadata.
    const raw = entry.method === 8 ? inflateSync(compressed, { out: new Uint8Array(entry.original) }) : compressed;
    if (raw.length !== entry.original) throw new Error();
    let crc = 0xffffffff;
    for (const byte of raw) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
    if (((crc ^ 0xffffffff) >>> 0) !== entry.crc) throw new Error();
    return raw;
  } catch (error) {
    if (error instanceof GlobalIsochroneError) throw error;
    throw new GlobalIsochroneError("invalid");
  }
}
function view(bytes: Uint8Array): DataView { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
