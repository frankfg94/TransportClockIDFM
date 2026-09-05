import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTimetableArtifacts, parseGtfsTime } from "../scripts/gtfs/timetableIndexer";
import { clearGtfsRuntimeCaches } from "../server/services/gtfs/runtime";
import { isGtfsServiceActive } from "../server/services/gtfs/timetableCalendar";
import {
  clearGtfsTimetableCaches,
  loadGtfsTimetableForDate,
} from "../server/services/gtfs/timetableRuntime";
import type {
  GtfsTimetableChunk,
  GtfsTimetableLineIndex,
  GtfsTimetableService,
} from "../server/services/gtfs/timetableTypes";
import type { GtfsManifest } from "../server/services/gtfs/types";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  clearGtfsRuntimeCaches();
  clearGtfsTimetableCaches();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), "gtfs-timetable-test-"));
  roots.push(root);
  const input = join(root, "input"),
    output = join(root, "output");
  await fs.mkdir(input);
  const files = {
    "stops.txt":
      "stop_id,stop_name,parent_station,stop_lat,stop_lon\nS,Station,,48.8,2.3\nQ1,Quai 1,S,48.8,2.3\nQ2,Quai 2,S,48.8,2.3\nT,Terminus,,48.9,2.4\n",
    "calendar.txt":
      "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nW,1,1,1,1,1,0,0,20260801,20260930\nP,0,0,0,0,0,0,1,20260801,20260930\n",
    "calendar_dates.txt": "service_id,date,exception_type\nW,20260831,2\nX,20260831,1\n",
    "trips.txt":
      "route_id,service_id,trip_id,direction_id,trip_headsign,shape_id\nIDFM:A,X,EXTRA,0,Terminus,\nIDFM:A,P,OVERNIGHT,1,Station,\nIDFM:A,W,REMOVED,0,Terminus,\nIDFM:B,X,BUS,0,Terminus,\n",
    "stop_times.txt":
      "trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type\nEXTRA,07:06:30,07:06:45,T,4,1,0\nOVERNIGHT,24:15:00,24:15:30,Q1,1,0,0\nEXTRA,07:00:00,07:00:30,Q1,1,0,0\nEXTRA,07:01:00,07:01:30,Q2,2,1,0\nOVERNIGHT,24:25:00,24:25:30,T,2,1,0\nEXTRA,,,Q1,3,0,0\nREMOVED,07:00:00,07:00:00,Q1,1,0,0\nBUS,08:00:00,08:00:00,T,1,0,0\n",
  };
  await Promise.all(
    Object.entries(files).map(([file, text]) => fs.writeFile(join(input, file), text)),
  );
  return { input, output };
}

describe("GTFS timetable import and calendar", () => {
  it("preserves every trip independently of geometry, quay ids, order, seconds, missing times and restrictions", async () => {
    const { input, output } = await fixture();
    const summary = await buildTimetableArtifacts(input, output);
    expect(summary).toMatchObject({
      lineCount: 2,
      tripCount: 4,
      schemaVersion: 1,
      startDate: "20260801",
      endDate: "20260930",
    });
    const index: GtfsTimetableLineIndex = JSON.parse(
      await fs.readFile(join(output, "IDFM%3AA", "index.json"), "utf8"),
    );
    const chunks: GtfsTimetableChunk[] = await Promise.all(
      index.chunks.map(async (chunk) =>
        JSON.parse(await fs.readFile(join(output, "IDFM%3AA", chunk.file), "utf8")),
      ),
    );
    const extra = chunks.flatMap((chunk) => chunk.trips).find((trip) => trip.id === "EXTRA")!;
    expect(extra.directionId).toBe("0");
    expect(extra.headsign).toBe("Terminus");
    expect(extra.calls.map((call) => index.stops[call[0]].id)).toEqual(["Q1", "Q2", "Q1", "T"]);
    expect(extra.calls.map((call) => call.slice(1))).toEqual([
      [1, 25200, 25230, 0, 0],
      [2, 25260, 25290, 1, 0],
      [3, null, null, 0, 0],
      [4, 25590, 25605, 1, 0],
    ]);
    expect(index.stops.find((s) => s.id === "Q1")?.parentId).toBe("S");
    expect(index.stops.find((s) => s.id === "S")?.name).toBe("Station");
    expect(index.maxTimeSeconds).toBe(87930);
    for (const chunk of index.chunks) {
      expect(chunk.bytes).toBeLessThanOrEqual(4 * 1024 * 1024);
      expect(chunk.serviceIds).toHaveLength(1);
    }
  });

  it("splits large schedules into bounded files with service metadata", async () => {
    const { input, output } = await fixture();
    const tripRows = Array.from({ length: 200 }, (_, i) => `IDFM:A,W,T${i},0,Terminus,`).join("\n");
    const timeRows = Array.from({ length: 200 }, (_, i) => `T${i},08:00:00,08:00:00,Q1,1,0,0`).join(
      "\n",
    );
    await fs.appendFile(join(input, "trips.txt"), tripRows + "\n");
    await fs.appendFile(join(input, "stop_times.txt"), timeRows + "\n");
    await buildTimetableArtifacts(input, output, { maxFileBytes: 4096 });
    const index: GtfsTimetableLineIndex = JSON.parse(
      await fs.readFile(join(output, "IDFM%3AA", "index.json"), "utf8"),
    );
    expect(index.chunks.length).toBeGreaterThan(1);
    for (const file of await fs.readdir(join(output, "IDFM%3AA")))
      expect((await fs.stat(join(output, "IDFM%3AA", file))).size).toBeLessThanOrEqual(4096);
    expect(index.chunks.reduce((n, c) => n + c.tripCount, 0)).toBe(203);
  });

  it("applies date-specific additions/removals before regular weekdays", () => {
    const service: GtfsTimetableService = {
      id: "S",
      startDate: "20260801",
      endDate: "20260831",
      weekdays: 31,
      exceptions: { "20260831": 2, "20260905": 1 },
    };
    expect(isGtfsServiceActive(service, "20260828")).toBe(true);
    expect(isGtfsServiceActive(service, "20260829")).toBe(false);
    expect(isGtfsServiceActive(service, "20260831")).toBe(false);
    expect(isGtfsServiceActive(service, "20260905")).toBe(true);
    expect(parseGtfsTime("25:03:07")).toBe(90187);
    expect(parseGtfsTime("")).toBeNull();
    expect(() => parseGtfsTime("25:75:00")).toThrow();
  });

  it("loads only active courses plus previous-day overnight passages and keeps old manifests readable", async () => {
    const { input, output } = await fixture();
    const summary = await buildTimetableArtifacts(input, output);
    const prefix = `timetables/v1/${"a".repeat(64)}/run1`;
    const manifest: GtfsManifest = {
      schemaVersion: 1,
      sha256: "a".repeat(64),
      datasetVersion: "2026-08-27",
      installedAt: "2026-08-27T00:00:00Z",
      cacheGeneration: 1,
      lineCount: 2,
      timetable: { ...summary, path: prefix },
    };
    const getItem = vi.fn(async (key: string) => {
      if (key === "current.json") return manifest;
      if (!key.startsWith(prefix + "/")) return null;
      return JSON.parse(await fs.readFile(join(output, key.slice(prefix.length + 1)), "utf8"));
    });
    vi.stubGlobal("useStorage", () => ({ getItem }));
    vi.stubEnv("GTFS_ENABLED", "true");
    const result = await loadGtfsTimetableForDate(undefined, "line:IDFM:A", "20260831");
    expect(result.status).toBe("ready");
    expect(result.trips.map((t) => t.id).sort()).toEqual(["EXTRA", "OVERNIGHT"]);
    expect(result.trips.find((t) => t.id === "OVERNIGHT")).toMatchObject({
      serviceDate: "20260830",
      calls: [{ departure: 930 }, { departure: 1530 }],
    });
    expect(getItem.mock.calls.every(([key]) => !key.includes("IDFM%3AB"))).toBe(true);
    const index: GtfsTimetableLineIndex = JSON.parse(
      await fs.readFile(join(output, "IDFM%3AA", "index.json"), "utf8"),
    );
    const removedChunk = index.chunks.find((chunk) => chunk.serviceIds.includes("W"))!;
    expect(getItem.mock.calls.some(([key]) => key.endsWith(`/IDFM%3AA/${removedChunk.file}`))).toBe(
      false,
    );
    expect((await loadGtfsTimetableForDate(undefined, "line:IDFM:A", "20261201")).status).toBe(
      "out-of-coverage",
    );
    delete manifest.timetable;
    clearGtfsRuntimeCaches();
    expect((await loadGtfsTimetableForDate(undefined, "line:IDFM:A", "20260831")).status).toBe(
      "missing",
    );
  });

  it("skips inactive chunks and invalidates immutable index references after a version switch", async () => {
    const prefix = `timetables/v1/${"b".repeat(64)}/run1`;
    const manifest: GtfsManifest = {
      schemaVersion: 1,
      sha256: "b".repeat(64),
      datasetVersion: "2026-08-27",
      installedAt: "2026-08-27T00:00:00Z",
      cacheGeneration: 1,
      lineCount: 1,
      timetable: {
        schemaVersion: 1,
        path: prefix,
        startDate: "20260801",
        endDate: "20260930",
        lineCount: 1,
        tripCount: 2,
        fileCount: 3,
        bytes: 1000,
      },
    };
    const index: GtfsTimetableLineIndex = {
      schemaVersion: 1,
      lineId: "IDFM:A",
      stops: [
        { id: "S", name: "S" },
        { id: "T", name: "T" },
      ],
      services: [
        { id: "ON", weekdays: 31, startDate: "20260801", endDate: "20260930", exceptions: {} },
        { id: "OFF", weekdays: 32, startDate: "20260801", endDate: "20260930", exceptions: {} },
      ],
      chunks: [
        { file: "0000.json", serviceIds: ["ON"], bytes: 400, tripCount: 1 },
        { file: "0001.json", serviceIds: ["OFF"], bytes: 400, tripCount: 1 },
      ],
      startDate: "20260801",
      endDate: "20260930",
      maxTimeSeconds: 86400,
      tripCount: 2,
    };
    const chunk: GtfsTimetableChunk = {
      schemaVersion: 1,
      trips: [
        {
          id: "T",
          serviceId: "ON",
          directionId: "0",
          calls: [
            [0, 1, 28800, 28800, 0, 0],
            [1, 2, 29400, 29400, 1, 0],
          ],
        },
      ],
    };
    const getItem = vi.fn(async (key: string) => {
      if (key === "current.json") return manifest;
      if (key.endsWith("index.json")) return index;
      if (key.endsWith("0000.json")) return chunk;
      throw new Error("An inactive chunk should not be read");
    });
    vi.stubGlobal("useStorage", () => ({ getItem }));
    vi.stubEnv("GTFS_ENABLED", "true");
    expect((await loadGtfsTimetableForDate(undefined, "IDFM:A", "20260831")).trips).toHaveLength(1);
    expect(getItem.mock.calls.some(([key]) => key.endsWith("0001.json"))).toBe(false);
    manifest.timetable!.path = prefix.replace("run1", "run2");
    clearGtfsRuntimeCaches();
    await loadGtfsTimetableForDate(undefined, "IDFM:A", "20260831");
    expect(getItem.mock.calls.some(([key]) => key.includes("run2/IDFM%3AA/index.json"))).toBe(true);
    vi.stubEnv("GTFS_ENABLED", "false");
    expect((await loadGtfsTimetableForDate(undefined, "IDFM:A", "20260831")).status).toBe(
      "disabled",
    );
  });
});
