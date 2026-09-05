import type { H3Event } from "h3";
import {
  getGtfsManifest,
  getGtfsRuntimeCacheEpoch,
  isGtfsEnabled,
  normalizeLineArtifactKey,
  readGtfsJson,
} from "./runtime";
import { isGtfsServiceActive, shiftGtfsDate } from "./timetableCalendar";
import {
  GTFS_TIMETABLE_SCHEMA_VERSION,
  type ActiveGtfsTimetableTrip,
  type GtfsTimetableChunk,
  type GtfsTimetableLineIndex,
  type GtfsTimetableLoadResult,
} from "./timetableTypes";

const MAX_INDEX_CACHE_BYTES = 16 * 1024 * 1024;
const indexCache = new Map<string, { index: GtfsTimetableLineIndex; bytes: number }>();
let cachedBytes = 0;

export function clearGtfsTimetableCaches(): void {
  indexCache.clear();
  cachedBytes = 0;
}

export async function loadGtfsTimetableForDate(
  event: H3Event | undefined,
  lineId: string,
  serviceDate: string,
): Promise<GtfsTimetableLoadResult> {
  const manifest = await getGtfsManifest(event);
  const unavailable = (
    status: GtfsTimetableLoadResult["status"],
    index?: GtfsTimetableLineIndex,
  ): GtfsTimetableLoadResult => ({ status, manifest, index, trips: [] });
  if (!isGtfsEnabled(event)) return unavailable("disabled");
  const descriptor = manifest?.timetable;
  if (!descriptor || descriptor.schemaVersion !== GTFS_TIMETABLE_SCHEMA_VERSION)
    return unavailable("missing");
  if (!/^\d{8}$/u.test(serviceDate) || serviceDate < descriptor.startDate)
    return unavailable("out-of-coverage");
  if (!/^timetables\/v\d+\/[a-f0-9]{64}\/[a-zA-Z0-9-]+$/u.test(descriptor.path))
    return unavailable("missing");
  const root = `${descriptor.path}/${normalizeLineArtifactKey(lineId)}`;
  const cacheKey = `${getGtfsRuntimeCacheEpoch()}:${manifest.cacheGeneration}:${root}`;
  let index = indexCache.get(cacheKey)?.index;
  if (index) {
    const entry = indexCache.get(cacheKey)!;
    indexCache.delete(cacheKey);
    indexCache.set(cacheKey, entry);
  } else {
    index = (await readGtfsJson<GtfsTimetableLineIndex>(event, `${root}/index.json`)).value;
    if (!index) return unavailable("line-missing");
    if (
      index.schemaVersion !== GTFS_TIMETABLE_SCHEMA_VERSION ||
      normalizeLineArtifactKey(index.lineId) !== normalizeLineArtifactKey(lineId) ||
      !Array.isArray(index.stops) ||
      !Array.isArray(index.services) ||
      !Array.isArray(index.chunks) ||
      !Number.isFinite(index.maxTimeSeconds) ||
      index.maxTimeSeconds < 0 ||
      index.maxTimeSeconds > 999 * 3600 + 3599
    )
      return unavailable("missing");
    const bytes = new TextEncoder().encode(JSON.stringify(index)).length;
    while (
      indexCache.size &&
      (indexCache.size >= 32 || cachedBytes + bytes > MAX_INDEX_CACHE_BYTES)
    ) {
      const key = indexCache.keys().next().value!;
      cachedBytes -= indexCache.get(key)!.bytes;
      indexCache.delete(key);
    }
    if (bytes <= MAX_INDEX_CACHE_BYTES) {
      indexCache.set(cacheKey, { index, bytes });
      cachedBytes += bytes;
    }
  }
  const lookbackDays = Math.floor(index.maxTimeSeconds / 86400);
  if (serviceDate < index.startDate || serviceDate > shiftGtfsDate(index.endDate, lookbackDays))
    return unavailable("out-of-coverage", index);
  const offsetsByService = new Map<string, number[]>();
  for (const service of index.services) {
    const offsets: number[] = [];
    for (let day = 0; day <= lookbackDays; day++) {
      if (isGtfsServiceActive(service, shiftGtfsDate(serviceDate, -day))) offsets.push(day);
    }
    if (offsets.length) offsetsByService.set(service.id, offsets);
  }
  const activeTrips: ActiveGtfsTimetableTrip[] = [];
  for (const chunkInfo of index.chunks) {
    if (!chunkInfo.serviceIds.some((id) => offsetsByService.has(id))) continue;
    if (!/^\d+\.json$/u.test(chunkInfo.file)) return unavailable("missing", index);
    const chunk = (await readGtfsJson<GtfsTimetableChunk>(event, `${root}/${chunkInfo.file}`))
      .value;
    if (
      !chunk ||
      chunk.schemaVersion !== GTFS_TIMETABLE_SCHEMA_VERSION ||
      !Array.isArray(chunk.trips)
    )
      return unavailable("missing", index);
    for (const trip of chunk.trips) {
      for (const daysBack of offsetsByService.get(trip.serviceId) ?? []) {
        const shift = daysBack * 86400;
        if (
          !trip.calls.some((call) => {
            const time = call[3] ?? call[2];
            return time !== null && time >= shift && time < shift + 86400;
          })
        )
          continue;
        const calls: ActiveGtfsTimetableTrip["calls"] = [];
        for (const [
          stopIndex,
          sequence,
          arrival,
          departure,
          pickupType,
          dropOffType,
        ] of trip.calls) {
          const stop = index.stops[stopIndex];
          if (!stop) return unavailable("missing", index);
          calls.push({
            stopId: stop.id,
            sequence,
            arrival: arrival === null ? null : arrival - shift,
            departure: departure === null ? null : departure - shift,
            pickupType,
            dropOffType,
          });
        }
        activeTrips.push({
          id: trip.id,
          serviceDate: shiftGtfsDate(serviceDate, -daysBack),
          directionId: trip.directionId,
          headsign: trip.headsign,
          calls,
        });
      }
    }
  }
  return { status: "ready", manifest, index, trips: activeTrips };
}
