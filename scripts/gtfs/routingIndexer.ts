import { promises as fs, appendFileSync, createReadStream } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { gzipSync } from "fflate";
import { readCsv } from "./csv";
import type { GtfsTimetableDescriptor, GtfsTimetableLineIndex, GtfsTimetableChunk } from "../../server/services/gtfs/timetableTypes";
import { CONNECTION_COLUMNS, type GtfsRoutingDescriptor, type GtfsRoutingIndex, type GtfsRoutingShard } from "../../server/services/gtfs/routingTypes";

/** Derive a network-wide index from the immutable timetable, never the truncated geometry patterns. */
export async function buildRoutingArtifacts(timetableDir: string, destination: string, timetable: GtfsTimetableDescriptor, sourceDir?: string): Promise<Omit<GtfsRoutingDescriptor, "path">> {
  await fs.mkdir(destination, { recursive: true });
  const spool = await fs.mkdtemp(join(destination, ".connections-"));
  const index: GtfsRoutingIndex = { schemaVersion: 1, stops: [], services: [], lines: [], transfers: [], scopedTransfers: [], boardingStops: [], hasConditionalService: false, hours: {}, maxTimeSeconds: 0 };
  const boardingStops = new Set<number>();
  const stops = new Map<string, number>(), services = new Map<string, number>();
  const trips: GtfsRoutingShard["trips"] = [];
  const buffers = new Map<number, string[]>();
  let buffered = 0, connectionCount = 0, bytes = 0, fileCount = 0;
  const flush = () => {
    for (const [hour, rows] of buffers) appendFileSync(join(spool, `${hour}.jsonl`), rows.join(""));
    buffers.clear(); buffered = 0;
  };
  const routeMetadata = new Map<string, Record<string, string>>();
  if (sourceDir) await readCsv(join(sourceDir, "routes.txt"), row => { routeMetadata.set(row.route_id, row); });
  try {
    for (const directory of await fs.readdir(timetableDir)) {
      const lineIndexPath = join(timetableDir, directory, "index.json");
      if (!(await fs.stat(lineIndexPath).catch(() => undefined))?.isFile()) continue;
      const line = JSON.parse(await fs.readFile(lineIndexPath, "utf8")) as GtfsTimetableLineIndex;
      const raw = routeMetadata.get(line.lineId) ?? {};
      const code = raw.route_short_name || line.lineId;
      const routeType = Number(raw.route_type);
      const mode = /^N\d+$/u.test(code) ? "NOCTILIEN" : routeType === 0 ? "TRAM" : routeType === 1 ? "METRO" : routeType === 2 ? (/^[A-E]$/u.test(code) ? "RER" : "TRAIN") : routeType === 6 || routeType === 7 ? "CABLE" : "BUS";
      const lineNumber = index.lines.length;
      index.lines.push({ id: line.lineId, code, mode, ...(raw.route_color ? { color: `#${raw.route_color}` } : {}) });
      const stopNumbers = line.stops.map(stop => {
        if (!stops.has(stop.id)) { stops.set(stop.id, index.stops.length); index.stops.push(stop); }
        return stops.get(stop.id)!;
      });
      for (const service of line.services) if (!services.has(service.id)) {
        services.set(service.id, index.services.length); index.services.push(service);
      }
      index.maxTimeSeconds = Math.max(index.maxTimeSeconds, line.maxTimeSeconds);
      for (const chunk of line.chunks) {
        const data = JSON.parse(await fs.readFile(join(timetableDir, directory, chunk.file), "utf8")) as GtfsTimetableChunk;
        for (const trip of data.trips) {
          const tripNumber = trips.length;
          trips.push([tripNumber, trip.id, trip.headsign]);
          for (let i = 0; i + 1 < trip.calls.length; i++) {
            const from = trip.calls[i]!, to = trip.calls[i + 1]!;
            const departure = from[3] ?? from[2], arrival = to[2] ?? to[3];
            if (departure === null || arrival === null || arrival < departure) continue;
            const row = [stopNumbers[from[0]], stopNumbers[to[0]], departure, arrival, tripNumber, services.get(trip.serviceId), lineNumber, from[4] | (to[5] << 2) | (i + 2 === trip.calls.length ? 16 : 0)];
            boardingStops.add(stopNumbers[from[0]]!); boardingStops.add(stopNumbers[to[0]]!);
            if (from[4] > 1 || to[5] > 1) index.hasConditionalService = true;
            const hour = Math.floor(departure / 3600);
            const rows = buffers.get(hour) ?? [];
            const text = JSON.stringify(row) + "\n";
            rows.push(text); buffers.set(hour, rows); buffered += text.length; connectionCount++;
            if (buffered >= 4 * 1024 * 1024) flush();
          }
        }
      }
    }
    flush();
    if (sourceDir) {
      const children = new Map<string, number[]>();
      index.stops.forEach((s, i) => { const ids = children.get(s.parentId ?? s.id) ?? []; ids.push(i); children.set(s.parentId ?? s.id, ids); });
      const expand = (id: string) => children.get(id) ?? (stops.has(id) ? [stops.get(id)!] : []);
      if (await fs.stat(join(sourceDir, "transfers.txt")).catch(() => undefined)) {
        await readCsv(join(sourceDir, "transfers.txt"), row => {
          const type = Number(row.transfer_type || 0);
          // In-seat transfers require vehicle/block semantics. Exclude them and disclose incomplete coverage.
          if (type > 3) { index.hasConditionalService = true; return; }
          const seconds = type === 3 ? -1 : Number(row.min_transfer_time || 120);
          if (!Number.isFinite(seconds) || seconds < -1) throw new Error("Invalid GTFS transfer duration");
          for (const a of expand(row.from_stop_id)) for (const b of expand(row.to_stop_id)) {
            if (row.from_route_id || row.to_route_id || row.from_trip_id || row.to_trip_id) index.scopedTransfers.push({
              from: a, to: b, seconds, fromRoute: row.from_route_id || undefined, toRoute: row.to_route_id || undefined,
              fromTrip: row.from_trip_id || undefined, toTrip: row.to_trip_id || undefined,
            });
            else index.transfers.push([a, b, seconds]);
          }
        });
      }
      if (await fs.stat(join(sourceDir, "pathways.txt")).catch(() => undefined)) {
        await readCsv(join(sourceDir, "pathways.txt"), row => {
          const seconds = Number(row.traversal_time);
          if (!row.traversal_time || !Number.isFinite(seconds) || seconds < 0) return;
          for (const a of expand(row.from_stop_id)) for (const b of expand(row.to_stop_id)) if (a !== b) {
            (index.pathwayTransferIndices ??= []).push(index.transfers.length);
            index.transfers.push([a, b, seconds]);
            if (row.is_bidirectional === "1") {
              index.pathwayTransferIndices.push(index.transfers.length);
              index.transfers.push([b, a, seconds]);
            }
          }
        });
      }
    }
    for (const file of await fs.readdir(spool)) {
      const hour = file.replace(/\.jsonl$/u, "");
      const rows: number[][] = [];
      for await (const row of createInterface({ input: createReadStream(join(spool, file)), crlfDelay: Infinity })) rows.push(JSON.parse(row));
      rows.sort((a, b) => a[2]! - b[2]! || a[3]! - b[3]! || a[4]! - b[4]!);
      const files: string[] = [];
      for (let offset = 0; offset < rows.length; offset += 65_536) {
        const batch = rows.slice(offset, offset + 65_536);
        const binary = new Uint8Array(batch.length * CONNECTION_COLUMNS * 4);
        const view = new DataView(binary.buffer);
        batch.forEach((row, i) => row.forEach((value, j) => view.setUint32((i * CONNECTION_COLUMNS + j) * 4, value, true)));
        const shard: GtfsRoutingShard = { schemaVersion: 1, encoding: "gzip-base64-u32le", count: batch.length, data: Buffer.from(gzipSync(binary)).toString("base64"), trips: [...new Set(batch.map(row => row[4]!))].map(id => trips[id]!) };
        const filename = `${hour}-${files.length}.json`, text = JSON.stringify(shard);
        await fs.writeFile(join(destination, filename), text); files.push(filename); bytes += Buffer.byteLength(text); fileCount++;
      }
      index.hours[hour] = files;
    }
    index.boardingStops = [...boardingStops];
    const text = JSON.stringify(index);
    await fs.writeFile(join(destination, "index.json"), text); bytes += Buffer.byteLength(text); fileCount++;
    if (!connectionCount) throw new Error("GTFS routing index has no connections");
    return { schemaVersion: 1, startDate: timetable.startDate, endDate: timetable.endDate, connectionCount, fileCount, bytes };
  } finally { await fs.rm(spool, { recursive: true, force: true }); }
}
