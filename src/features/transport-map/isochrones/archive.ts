import { strFromU8, unzipSync } from "fflate";
import { normalizeWalkingIsochroneGeometry, type WalkingIsochroneGeometry } from "../../../shared/walkingIsochroneGeometry.js";
import {
  assertGlobalIsochroneIndex,
  GlobalIsochroneError,
  type GlobalIsochroneIndex,
  type GlobalIsochroneRequest,
  type GlobalIsochroneResult,
  type GlobalIsochroneSurface,
} from "./contracts.js";

export const GLOBAL_ISOCHRONE_MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
export const GLOBAL_ISOCHRONE_MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const DEFAULT_GEOMETRY_CACHE_BYTES = 32 * 1024 * 1024;
const zipChecksums = new WeakMap<Uint8Array, Map<string, number>>();
const crcTable = Uint32Array.from({ length: 256 }, (_, byte) => {
  for (let bit = 0; bit < 8; bit += 1) byte = (byte & 1) ? 0xedb88320 ^ (byte >>> 1) : byte >>> 1;
  return byte >>> 0;
});

/** Generator/validation reader. Runtime Nuxt uses IndexedIsochroneArchive with range reads. */
export class GlobalIsochroneArchive {
  readonly index: GlobalIsochroneIndex;
  private readonly cache = new Map<string, { geometry: WalkingIsochroneGeometry; bytes: number }>();
  private cacheBytes = 0;

  constructor(
    private readonly bytes: Uint8Array,
    mapDataVersion?: string,
    private readonly maxCacheBytes = DEFAULT_GEOMETRY_CACHE_BYTES,
  ) {
    if (bytes.byteLength > GLOBAL_ISOCHRONE_MAX_ARCHIVE_BYTES) throw new GlobalIsochroneError("invalid");
    const index = parseJson(readIsochroneZipEntries(bytes, new Set(["index.json"]))["index.json"]);
    assertGlobalIsochroneIndex(index, mapDataVersion);
    this.index = index;
  }

  select(requests: readonly GlobalIsochroneRequest[]): GlobalIsochroneResult {
    const pendingAssets = new Set<string>();
    for (const request of requests) {
      const zone = this.index.scopes[request.key]?.zones[request.minutes];
      if (zone && !this.cache.has(zone.asset)) pendingAssets.add(zone.asset);
    }
    const decoded = pendingAssets.size ? readIsochroneZipEntries(this.bytes, pendingAssets) : {};
    const allStations = new Set<string>();
    const availableStations = new Set<string>();
    const missingScopes: string[] = [];
    const surfaces: GlobalIsochroneSurface[] = [];
    for (const request of requests) {
      const scope = this.index.scopes[request.key];
      if (!scope) {
        missingScopes.push(request.key);
        continue;
      }
      if (scope.mode !== request.mode) throw new GlobalIsochroneError("invalid");
      for (const id of scope.stationIds) allStations.add(id);
      const zone = scope.zones[request.minutes];
      if (!zone) continue;
      let cached = this.cache.get(zone.asset);
      if (cached) {
        this.cache.delete(zone.asset);
        this.cache.set(zone.asset, cached);
      } else {
        const raw = decoded[zone.asset];
        if (!raw || raw.byteLength !== zone.bytes) throw new GlobalIsochroneError("invalid");
        const geometry = normalizeWalkingIsochroneGeometry(parseJson(raw));
        if (!geometry) throw new GlobalIsochroneError("invalid");
        // Account conservatively for JS arrays/numbers, not only JSON bytes.
        cached = { geometry, bytes: raw.byteLength * 4 };
        if (cached.bytes <= this.maxCacheBytes) {
          while (this.cache.size && this.cacheBytes + cached.bytes > this.maxCacheBytes) {
            const key = this.cache.keys().next().value!;
            this.cacheBytes -= this.cache.get(key)!.bytes;
            this.cache.delete(key);
          }
          this.cache.set(zone.asset, cached);
          this.cacheBytes += cached.bytes;
        }
      }
      for (const id of scope.coveredStationIds) availableStations.add(id);
      surfaces.push({ id: zone.asset, mode: request.mode, minutes: request.minutes, geometry: cached.geometry });
    }
    return {
      surfaces,
      coverage: {
        total: allStations.size,
        available: availableStations.size,
        missing: allStations.size - availableStations.size,
        missingScopes,
      },
      generatedAt: this.index.generatedAt,
      attribution: this.index.attribution,
    };
  }

  getCacheBytes(): number { return this.cacheBytes; }
}

export function readIsochroneZipEntries(bytes: Uint8Array, assets: ReadonlySet<string>): Record<string, Uint8Array> {
  try {
    const checksums = getZipChecksums(bytes);
    const entries = unzipSync(bytes, {
      filter: (entry) => {
        if (!assets.has(entry.name)) return false;
        if (entry.originalSize > GLOBAL_ISOCHRONE_MAX_ENTRY_BYTES) throw new GlobalIsochroneError("invalid");
        return true;
      },
    });
    // fflate inflates ZIP entries but does not check CRC. A corrupted coordinate
    // can still be valid JSON/GeoJSON, so validate the selected entries, including the index.
    for (const [name, raw] of Object.entries(entries)) {
      let crc = 0xffffffff;
      for (const byte of raw) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
      if (((crc ^ 0xffffffff) >>> 0) !== checksums.get(name)) throw new GlobalIsochroneError("invalid");
    }
    return entries;
  } catch {
    throw new GlobalIsochroneError("invalid");
  }
}

/** The v1 generator writes ordinary, single-disk ZIPs, never ZIP64/encrypted archives. */
function getZipChecksums(bytes: Uint8Array): Map<string, number> {
  const cached = zipChecksums.get(bytes);
  if (cached) return cached;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.byteLength - 22;
  const minimum = Math.max(0, end - 65535);
  while (end >= minimum && (view.getUint32(end, true) !== 0x06054b50 || end + 22 + view.getUint16(end + 20, true) !== bytes.byteLength)) end -= 1;
  if (end < minimum || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new GlobalIsochroneError("invalid");
  const count = view.getUint16(end + 10, true);
  if (count === 65535 || count !== view.getUint16(end + 8, true)) throw new GlobalIsochroneError("invalid");
  let cursor = view.getUint32(end + 16, true);
  const limit = cursor + view.getUint32(end + 12, true);
  if (limit !== end) throw new GlobalIsochroneError("invalid");
  const checksums = new Map<string, number>();
  for (let i = 0; i < count; i += 1) {
    if (cursor + 46 > limit || view.getUint32(cursor, true) !== 0x02014b50 || (view.getUint16(cursor + 8, true) & 1)) throw new GlobalIsochroneError("invalid");
    const nameLength = view.getUint16(cursor + 28, true);
    const next = cursor + 46 + nameLength + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
    if (next > limit) throw new GlobalIsochroneError("invalid");
    const name = strFromU8(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (checksums.has(name)) throw new GlobalIsochroneError("invalid");
    checksums.set(name, view.getUint32(cursor + 16, true));
    cursor = next;
  }
  if (cursor !== limit) throw new GlobalIsochroneError("invalid");
  zipChecksums.set(bytes, checksums);
  return checksums;
}

function parseJson(bytes?: Uint8Array): unknown {
  if (!bytes) throw new GlobalIsochroneError("invalid");
  try { return JSON.parse(strFromU8(bytes)) as unknown; }
  catch { throw new GlobalIsochroneError("invalid"); }
}
