import { appendFileSync, createReadStream, promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { readCsv } from "./csv";
import {
  GTFS_TIMETABLE_MAX_FILE_BYTES,
  type GtfsTimetableCall,
  type GtfsTimetableDescriptor,
  type GtfsTimetableLineIndex,
  type GtfsTimetableService,
  type GtfsTimetableStop,
  type GtfsTimetableTrip,
} from "../../server/services/gtfs/timetableTypes";

type TripMetadata = Omit<GtfsTimetableTrip, "calls"> & { lineId: string };
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export function parseGtfsTime(value: string): number | null {
  if (!value) return null;
  const match = /^(\d{1,3}):([0-5]\d):([0-5]\d)$/u.exec(value.trim());
  if (!match) throw new Error(`Invalid GTFS time: ${value}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function date(value: string): string | undefined {
  if (!/^\d{8}$/u.test(value)) return undefined;
  const parsed = new Date(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`,
  );
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10).replace(/-/gu, "") === value
    ? value
    : undefined;
}

export async function loadTimetableServices(
  inputDir: string,
): Promise<Map<string, GtfsTimetableService>> {
  const result = new Map<string, GtfsTimetableService>();
  await readCsv(join(inputDir, "calendar.txt"), (row) => {
    if (!row.service_id) return;
    const startDate = date(row.start_date),
      endDate = date(row.end_date);
    if (!startDate || !endDate || startDate > endDate)
      throw new Error(`Invalid GTFS calendar: ${row.service_id}`);
    result.set(row.service_id, {
      id: row.service_id,
      startDate,
      endDate,
      weekdays: DAYS.reduce((mask, day, index) => mask | (row[day] === "1" ? 1 << index : 0), 0),
      exceptions: {},
    });
  });
  await readCsv(join(inputDir, "calendar_dates.txt"), (row) => {
    if (!row.service_id) return;
    const day = date(row.date);
    if (!day || !["1", "2"].includes(row.exception_type))
      throw new Error(`Invalid GTFS calendar exception: ${row.service_id}`);
    const service = result.get(row.service_id) ?? {
      id: row.service_id,
      weekdays: 0,
      exceptions: {},
    };
    service.exceptions[day] = Number(row.exception_type) as 1 | 2;
    result.set(service.id, service);
  });
  return result;
}

function coverage(services: GtfsTimetableService[]): { startDate: string; endDate: string } {
  const dates = services
    .flatMap((service) => [
      ...(service.weekdays ? [service.startDate, service.endDate] : []),
      ...Object.entries(service.exceptions)
        .filter(([, kind]) => kind === 1)
        .map(([day]) => day),
    ])
    .filter((day): day is string => Boolean(day))
    .sort();
  return { startDate: dates[0] ?? "", endDate: dates.at(-1) ?? "" };
}

/** Partition the large source stream on disk; keep only one line's calls in memory. */
export async function buildTimetableArtifacts(
  inputDir: string,
  destination: string,
  options: { maxFileBytes?: number; progress?: (lines: number, total: number) => void } = {},
): Promise<Omit<GtfsTimetableDescriptor, "path">> {
  const maxBytes = options.maxFileBytes ?? GTFS_TIMETABLE_MAX_FILE_BYTES;
  const services = await loadTimetableServices(inputDir);
  const stops = new Map<string, GtfsTimetableStop>();
  await readCsv(join(inputDir, "stops.txt"), (row) => {
    if (!row.stop_id) return;
    const coordinate = (value: string) =>
      value?.trim() && Number.isFinite(Number(value)) ? Number(value) : undefined;
    stops.set(row.stop_id, {
      id: row.stop_id,
      name: row.stop_name || row.stop_id,
      parentId: row.parent_station || undefined,
      lat: coordinate(row.stop_lat),
      lon: coordinate(row.stop_lon),
    });
  });
  const trips = new Map<string, TripMetadata>();
  const lineTrips = new Map<string, string[]>();
  await readCsv(join(inputDir, "trips.txt"), (row) => {
    if (!row.trip_id || !row.route_id || !row.service_id) return;
    if (!services.has(row.service_id)) throw new Error(`Missing GTFS service: ${row.service_id}`);
    if (trips.has(row.trip_id)) throw new Error(`Duplicate GTFS trip: ${row.trip_id}`);
    trips.set(row.trip_id, {
      id: row.trip_id,
      lineId: row.route_id,
      serviceId: row.service_id,
      directionId: row.direction_id || undefined,
      headsign: row.trip_headsign || undefined,
    });
    const ids = lineTrips.get(row.route_id) ?? [];
    ids.push(row.trip_id);
    lineTrips.set(row.route_id, ids);
  });
  await fs.mkdir(destination, { recursive: true });
  const spool = await fs.mkdtemp(join(destination, ".spool-"));
  const buffers = new Map<string, string[]>();
  let bufferBytes = 0;
  const spoolPaths = new Map(
    [...lineTrips.keys()].map((id) => [
      id,
      join(spool, createHash("sha256").update(id).digest("hex")),
    ]),
  );
  const flush = () => {
    for (const [lineId, rows] of buffers) appendFileSync(spoolPaths.get(lineId)!, rows.join(""));
    buffers.clear();
    bufferBytes = 0;
  };
  let totalBytes = 0,
    fileCount = 0,
    tripCount = 0,
    lineCount = 0;
  const lineCoverages: Array<{ startDate: string; endDate: string }> = [];
  try {
    await readCsv(join(inputDir, "stop_times.txt"), (row) => {
      const trip = trips.get(row.trip_id);
      if (!trip) return;
      if (!stops.has(row.stop_id)) throw new Error(`Missing GTFS stop: ${row.stop_id}`);
      const sequence = Number(row.stop_sequence);
      if (!row.stop_sequence || !Number.isInteger(sequence) || sequence < 0)
        throw new Error(`Invalid GTFS stop sequence: ${trip.id}`);
      const restriction = (value: string) => {
        if (value && !/^[0-3]$/u.test(value))
          throw new Error(`Invalid GTFS boarding restriction: ${trip.id}`);
        return Number(value || 0);
      };
      const entry =
        JSON.stringify([
          trip.id,
          row.stop_id,
          sequence,
          parseGtfsTime(row.arrival_time),
          parseGtfsTime(row.departure_time),
          restriction(row.pickup_type),
          restriction(row.drop_off_type),
        ]) + "\n";
      const rows = buffers.get(trip.lineId) ?? [];
      rows.push(entry);
      buffers.set(trip.lineId, rows);
      bufferBytes += Buffer.byteLength(entry);
      if (bufferBytes >= 8 * 1024 * 1024) flush();
    });
    flush();
    for (const [lineId, tripIds] of lineTrips) {
      const stationDictionary: GtfsTimetableStop[] = [];
      const stationIndices = new Map<string, number>();
      const addStop = (id: string): number => {
        const known = stationIndices.get(id);
        if (known !== undefined) return known;
        const stop = stops.get(id);
        if (!stop) throw new Error(`Missing GTFS parent stop: ${id}`);
        const index = stationDictionary.length;
        stationIndices.set(id, index);
        stationDictionary.push(stop);
        if (stop.parentId) addStop(stop.parentId);
        return index;
      };
      const lineData = new Map<string, GtfsTimetableTrip>();
      const spoolPath = spoolPaths.get(lineId)!;
      if (!(await fs.stat(spoolPath).catch(() => undefined))) continue;
      const rows = createInterface({
        input: createReadStream(spoolPath, { encoding: "utf8" }),
        crlfDelay: Infinity,
      });
      let maxTimeSeconds = 0;
      for await (const row of rows) {
        const [id, stopId, sequence, arrival, departure, pickup, dropOff] = JSON.parse(row) as [
          string,
          string,
          number,
          number | null,
          number | null,
          number,
          number,
        ];
        let trip = lineData.get(id);
        if (!trip) {
          const { lineId: _line, ...metadata } = trips.get(id)!;
          trip = { ...metadata, calls: [] };
          lineData.set(id, trip);
        }
        trip.calls.push([addStop(stopId), sequence, arrival, departure, pickup, dropOff]);
        maxTimeSeconds = Math.max(maxTimeSeconds, arrival ?? 0, departure ?? 0);
      }
      const orderedTrips = tripIds
        .map((id) => lineData.get(id))
        .filter((trip): trip is GtfsTimetableTrip => Boolean(trip))
        .sort((a, b) => a.serviceId.localeCompare(b.serviceId) || a.id.localeCompare(b.id));
      const usedServices = [...new Set(orderedTrips.map((trip) => trip.serviceId))].map((id) =>
        services.get(id)!,
      );
      const range = coverage(usedServices);
      if (!range.startDate) throw new Error(`GTFS line has no calendar coverage: ${lineId}`);
      const lineDirectory = join(destination, encodeURIComponent(lineId.replace(/^line:/iu, "")));
      await fs.mkdir(lineDirectory, { recursive: true });
      const chunks: GtfsTimetableLineIndex["chunks"] = [];
      let chunkRows: string[] = [],
        chunkBytes = Buffer.byteLength('{"schemaVersion":1,"trips":[]}'),
        chunkServices = new Set<string>();
      const writeChunk = async () => {
        if (!chunkRows.length) return;
        const content = '{"schemaVersion":1,"trips":[' + chunkRows.join(",") + "]}";
        const bytes = Buffer.byteLength(content);
        if (bytes > maxBytes) throw new Error(`GTFS timetable chunk exceeds ${maxBytes} bytes`);
        const file = `${String(chunks.length).padStart(4, "0")}.json`;
        await fs.writeFile(join(lineDirectory, file), content);
        chunks.push({ file, serviceIds: [...chunkServices], bytes, tripCount: chunkRows.length });
        totalBytes += bytes;
        fileCount += 1;
        chunkRows = [];
        chunkServices = new Set();
        chunkBytes = Buffer.byteLength('{"schemaVersion":1,"trips":[]}');
      };
      for (const trip of orderedTrips) {
        // A service boundary is also a storage boundary: date-specific reads
        // must never download the other calendars of this line.
        if (chunkServices.size && !chunkServices.has(trip.serviceId)) await writeChunk();
        trip.calls.sort((a, b) => a[1] - b[1]);
        for (let i = 1; i < trip.calls.length; i++)
          if (trip.calls[i][1] === trip.calls[i - 1][1])
            throw new Error(`Duplicate GTFS stop sequence: ${trip.id}`);
        const text = JSON.stringify(trip),
          bytes = Buffer.byteLength(text);
        if (chunkBytes + bytes + (chunkRows.length ? 1 : 0) > maxBytes) await writeChunk();
        chunkBytes += bytes + (chunkRows.length ? 1 : 0);
        chunkRows.push(text);
        chunkServices.add(trip.serviceId);
      }
      await writeChunk();
      const index: GtfsTimetableLineIndex = {
        schemaVersion: 1,
        lineId,
        stops: stationDictionary,
        services: usedServices,
        chunks,
        ...range,
        maxTimeSeconds,
        tripCount: orderedTrips.length,
      };
      const content = JSON.stringify(index),
        bytes = Buffer.byteLength(content);
      if (bytes > maxBytes)
        throw new Error(`GTFS timetable dictionary exceeds ${maxBytes} bytes for ${lineId}`);
      await fs.writeFile(join(lineDirectory, "index.json"), content);
      totalBytes += bytes;
      fileCount += 1;
      tripCount += orderedTrips.length;
      lineCount += 1;
      lineCoverages.push(range);
      options.progress?.(lineCount, lineTrips.size);
    }
  } finally {
    if (resolve(spool).startsWith(resolve(destination) + sep))
      await fs.rm(spool, { recursive: true, force: true });
  }
  const startDate = lineCoverages.map((c) => c.startDate).sort()[0];
  const endDate = lineCoverages
    .map((c) => c.endDate)
    .sort()
    .at(-1);
  if (!lineCount || !tripCount || !startDate || !endDate)
    throw new Error("GTFS timetable is empty; keep the installed version.");
  return {
    schemaVersion: 1,
    startDate,
    endDate,
    lineCount,
    tripCount,
    fileCount,
    bytes: totalBytes,
  };
}
