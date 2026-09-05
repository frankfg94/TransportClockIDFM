/** Read-only local audit. Usage: tsx scripts/gtfs/verifyFrequency.ts LINE_ID [EXTRACTED_GTFS_DIR] */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { readCsv } from "./csv";
import { parseGtfsTime } from "./timetableIndexer";
import { mapFrequencyStops } from "../../server/services/gtfs/frequencyTopology";
import type { LineTopology } from "../../server/services/topology/types";
import type { GtfsManifest } from "../../server/services/gtfs/types";
import type {
  GtfsTimetableChunk,
  GtfsTimetableLineIndex,
  GtfsTimetableTrip,
} from "../../server/services/gtfs/timetableTypes";
import type { GtfsLineFrequencyResponse } from "../../src/types/lineFrequency";

const lineId = process.argv[2];
if (!lineId)
  throw new Error("Pass a line id, optionally followed by the extracted GTFS source directory.");
const root = resolve(process.env.GTFS_OUTPUT_DIR || ".data/gtfs");
const manifest: GtfsManifest = JSON.parse(await fs.readFile(join(root, "current.json"), "utf8"));
assert(manifest.timetable, "No local timetable installed");
const directory = join(
  root,
  manifest.timetable.path,
  encodeURIComponent(lineId.replace(/^line:/iu, "")),
);
const index: GtfsTimetableLineIndex = JSON.parse(
  await fs.readFile(join(directory, "index.json"), "utf8"),
);
const trips = new Map<string, GtfsTimetableTrip>();
for (const file of index.chunks) {
  const chunk: GtfsTimetableChunk = JSON.parse(
    await fs.readFile(join(directory, file.file), "utf8"),
  );
  for (const trip of chunk.trips) trips.set(trip.id, trip);
}

let sourceCallsChecked = 0;
if (process.argv[3]) {
  const source = resolve(process.argv[3]);
  const sourceIds = new Set<string>();
  await readCsv(join(source, "trips.txt"), (row) => {
    if (row.route_id !== index.lineId) return;
    const trip = trips.get(row.trip_id);
    assert(trip, `Lost source trip ${row.trip_id}`);
    assert.equal(trip.serviceId, row.service_id);
    assert.equal(trip.directionId, row.direction_id || undefined);
    assert.equal(trip.headsign, row.trip_headsign || undefined);
    sourceIds.add(row.trip_id);
  });
  assert.equal(sourceIds.size, trips.size);
  const calls = new Map(
    [...trips].map(([id, trip]) => [id, new Map(trip.calls.map((call) => [call[1], call]))]),
  );
  await readCsv(join(source, "stop_times.txt"), (row) => {
    if (!sourceIds.has(row.trip_id)) return;
    const call = calls.get(row.trip_id)?.get(Number(row.stop_sequence));
    assert(call, `Lost source call ${row.trip_id}/${row.stop_sequence}`);
    assert.equal(index.stops[call[0]]!.id, row.stop_id);
    assert.deepEqual(call.slice(2), [
      parseGtfsTime(row.arrival_time),
      parseGtfsTime(row.departure_time),
      Number(row.pickup_type || 0),
      Number(row.drop_off_type || 0),
    ]);
    sourceCallsChecked++;
  });
  assert.equal(
    sourceCallsChecked,
    [...trips.values()].reduce((sum, trip) => sum + trip.calls.length, 0),
  );
}

const api = process.env.GTFS_VERIFY_API_BASE || "http://127.0.0.1:3000";
const url = `${api}/api/lines/${encodeURIComponent(lineId)}`;
const started = performance.now();
const frequency: GtfsLineFrequencyResponse = await fetch(`${url}/frequency`).then((response) =>
  response.json(),
);
const firstMs = performance.now() - started;
const hotStarted = performance.now();
await fetch(`${url}/frequency`).then((response) => response.json());
const hotMs = performance.now() - hotStarted;
assert.equal(frequency.status, "ready");
assert.equal(frequency.datasetVersion, manifest.datasetVersion);
const topology: LineTopology = await fetch(`${url}/topology`).then((response) => response.json());
const mapping = mapFrequencyStops(index.stops, topology);
const central = frequency.sections.find((section) => section.kind === "central");
const observations: Array<{
  station: string;
  direction: string;
  departures: number;
  peakMinutes: number;
  morningSample: string[];
}> = [];
const activeServiceIds = new Set<string>();

// Independent civil-day calendar selection and local peak-gap calculation.
// This audit intentionally does not call the production frequency calculator.
{
  const date = frequency.serviceDate;
  const midnight = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(4, 6)) - 1,
    Number(date.slice(6, 8)),
  );
  const windows = [
    [7 * 3600, 9.5 * 3600],
    [17.5 * 3600, 19 * 3600],
  ];
  const samples = new Map<string, { station: string; direction: string; times: number[][] }>();
  for (let daysBack = 0; daysBack <= Math.floor(index.maxTimeSeconds / 86400); daysBack++) {
    const day = new Date(midnight - daysBack * 86400000);
    const serviceDate = day.toISOString().slice(0, 10).replaceAll("-", "");
    const weekday = (day.getUTCDay() + 6) % 7;
    const active = new Set(
      index.services
        .filter((service) =>
          service.exceptions[serviceDate] !== undefined
            ? service.exceptions[serviceDate] === 1
            : Boolean(
                service.startDate &&
                service.endDate &&
                serviceDate >= service.startDate &&
                serviceDate <= service.endDate &&
                service.weekdays & (1 << weekday),
              ),
        )
        .map((service) => service.id),
    );
    for (const id of active) activeServiceIds.add(id);
    if (!central) continue;
    for (const trip of trips.values()) {
      if (!active.has(trip.serviceId)) continue;
      const visits: Array<{ id: string; time: number | null }> = [];
      for (const call of trip.calls) {
        const stop = index.stops[call[0]]!;
        const id = mapping.get(stop.id) ?? stop.parentId ?? stop.id;
        const time = call[4] !== 1 && call[3] !== null ? call[3] - daysBack * 86400 : null;
        if (visits.at(-1)?.id === id) {
          if (time !== null) visits.at(-1)!.time = time;
        } else visits.push({ id, time });
      }
      for (let i = 0; i < visits.length - 1; i++) {
        const current = visits[i]!;
        const rank = central.stationIds.indexOf(current.id);
        const next = central.stationIds.indexOf(visits[i + 1]!.id);
        if (rank < 0 || next < 0 || rank === next || current.time === null) continue;
        const window = windows.findIndex(
          ([start, end]) => current.time! >= start! && current.time! < end!,
        );
        if (window < 0) continue;
        const direction = next > rank ? "forward" : "reverse";
        const key = `${current.id}/${direction}`;
        const sample = samples.get(key) ?? { station: current.id, direction, times: [[], []] };
        sample.times[window]!.push(current.time);
        samples.set(key, sample);
      }
    }
  }
  for (const sample of samples.values()) {
    const times = sample.times.map((values) => [...new Set(values)].sort((a, b) => a - b));
    const gaps = times
      .flatMap((values) => values.slice(1).map((value, i) => (value - values[i]!) / 60))
      .sort((a, b) => a - b);
    if (!gaps.length) continue;
    const middle = Math.floor(gaps.length / 2);
    const peakMinutes = gaps.length % 2 ? gaps[middle]! : (gaps[middle - 1]! + gaps[middle]!) / 2;
    observations.push({
      station:
        topology.stations.find((station) => station.id === sample.station)?.name ?? sample.station,
      direction: sample.direction,
      departures: times.flat().length,
      peakMinutes,
      morningSample: times[0]!
        .slice(0, 8)
        .map((seconds) => new Date(seconds * 1000).toISOString().slice(11, 19)),
    });
  }
  for (const direction of central?.directions ?? []) {
    const samples = observations.filter((sample) => direction.id.endsWith(`:${sample.direction}`));
    assert(samples.length);
    const expected = samples.reduce((sum, sample) => sum + sample.peakMinutes, 0) / samples.length;
    assert(
      Math.abs(expected - direction.peakMinutes!) < 1e-9,
      "Central interval disagrees with imported stop times",
    );
  }
}
console.log(
  JSON.stringify(
    {
      lineId,
      serviceDate: frequency.serviceDate,
      datasetVersion: manifest.datasetVersion,
      branched: frequency.branched,
      trips: trips.size,
      sourceCallsChecked,
      services: index.services.length,
      activeServices: activeServiceIds.size,
      files: index.chunks.length + 1,
      bytes: index.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0),
      activeChunkBytes: index.chunks
        .filter((chunk) => chunk.serviceIds.some((id) => activeServiceIds.has(id)))
        .reduce((sum, chunk) => sum + chunk.bytes, 0),
      requestMs: { first: Math.round(firstMs), cached: Math.round(hotMs) },
      average: frequency.average,
      sections: frequency.sections.map((section) => ({
        from: section.from.name,
        to: section.to.name,
        kind: section.kind,
        average: section.average,
        directions: section.directions.map(({ from, to, peakMinutes }) => ({
          from,
          to,
          peakMinutes,
        })),
      })),
      centralObservations: observations,
    },
    null,
    2,
  ),
);
