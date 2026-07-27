import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { buildLineArtifacts, extractRequiredFiles, parseCsvLine } from "../scripts/gtfs/update";
import type { GtfsLineArtifact } from "../server/services/gtfs/types";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })),
  );
});

describe("GTFS compact indexer", () => {
  it("indexes branches, directions, shared shapes, entrances and every route type", async () => {
    const root = await fs.mkdtemp(join(tmpdir(), "gtfs-fixture-"));
    temporaryDirectories.push(root);
    const input = join(root, "input");
    const output = join(root, "version");
    await fs.mkdir(input);
    await writeFixture(input);

    await expect(buildLineArtifacts(input, output)).resolves.toBe(3);

    const bus = await readArtifact(output, "IDFM:BUS");
    const metro = await readArtifact(output, "IDFM:METRO");
    const funicular = await readArtifact(output, "IDFM:FUNICULAR");

    expect(bus.routeTypes).toEqual(["3"]);
    expect(new Set(bus.patterns.map((pattern) => pattern.direction))).toEqual(new Set(["0", "1"]));
    expect(Object.keys(bus.shapes).sort()).toEqual(["BUS_BRANCH", "BUS_MAIN"]);
    const projectedPattern = bus.patterns.find((pattern) => pattern.stopIds.join(",") === "A,B,C");
    expect(projectedPattern?.shapeDirection).toBe("forward");
    expect(projectedPattern?.projections.map((projection) => projection.stopId)).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(
      projectedPattern?.projections.every(
        (projection, index, projections) =>
          index === 0 ||
          projection.distanceAlongMeters >= projections[index - 1].distanceAlongMeters,
      ),
    ).toBe(true);
    expect(bus.patterns.some((pattern) => pattern.stopIds.includes("UNKNOWN"))).toBe(true);
    expect(
      bus.patterns.find((pattern) => pattern.stopIds.includes("UNKNOWN"))?.projections,
    ).toEqual([]);
    expect(bus.entrances).toContainEqual({
      id: "EXIT_A_1",
      parentStopId: "A",
      name: "1 rue de Test",
      code: "1",
      lat: 48.8002,
      lon: 2.3002,
    });
    expect(metro.routeTypes).toEqual(["1"]);
    expect(funicular.routeTypes).toEqual(["7"]);
  });

  it("parses quoted commas and escaped quotes without loading a whole CSV", () => {
    expect(parseCsvLine('A,"Station, Centre","Sortie ""Nord"""')).toEqual([
      "A",
      "Station, Centre",
      'Sortie "Nord"',
    ]);
  });

  it("streams every required file from a ZIP containing ignored large entries", async () => {
    const root = await fs.mkdtemp(join(tmpdir(), "gtfs-archive-fixture-"));
    temporaryDirectories.push(root);
    const archivePath = join(root, "fixture.zip");
    const output = join(root, "extracted");
    const largeStops = `stop_id,stop_name\n${"A,Station A\n".repeat(20_000)}`;
    const required = Object.fromEntries(
      [
        "routes.txt",
        "trips.txt",
        "stop_times.txt",
        "stops.txt",
        "shapes.txt",
        "calendar.txt",
        "calendar_dates.txt",
      ].map((name) => [name, strToU8(name === "stops.txt" ? largeStops : `${name}\n`)]),
    );
    await fs.writeFile(
      archivePath,
      zipSync({
        "ignored-before.bin": new Uint8Array(256_000),
        ...required,
        "ignored-after.bin": new Uint8Array(256_000),
      }),
    );
    await fs.mkdir(output);

    await expect(extractRequiredFiles(archivePath, output)).resolves.toBeUndefined();
    await expect(fs.readFile(join(output, "stops.txt"), "utf8")).resolves.toBe(largeStops);
    await expect(fs.readdir(output)).resolves.toHaveLength(7);
  });
  it("rejects aberrant WGS84 coordinates before publication", async () => {
    const root = await fs.mkdtemp(join(tmpdir(), "gtfs-invalid-fixture-"));
    temporaryDirectories.push(root);
    const input = join(root, "input");
    await fs.mkdir(input);
    await writeFixture(input);
    await fs.writeFile(
      join(input, "shapes.txt"),
      "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nBUS_MAIN,148.8,2.3,1\n",
    );

    await expect(buildLineArtifacts(input, join(root, "version"))).rejects.toThrow(
      "Invalid WGS84 shape coordinate",
    );
  });
});

async function writeFixture(directory: string): Promise<void> {
  const files: Record<string, string> = {
    "routes.txt": csv([
      "route_id,route_short_name,route_long_name,route_type",
      "IDFM:BUS,57,Porte de Bagnolet - Arcueil,3",
      "IDFM:METRO,13,Metro 13,1",
      "IDFM:FUNICULAR,F,Funiculaire,7",
    ]),
    "stops.txt": csv([
      "stop_id,stop_code,stop_name,stop_lat,stop_lon,location_type,parent_station",
      "A,,Station A,48.8000,2.3000,1,",
      "A_Q,,Quai A,48.8000,2.3000,0,A",
      "EXIT_A_1,1,1 rue de Test,48.8002,2.3002,2,A",
      "B,,Station B,48.8100,2.3100,1,",
      "B_Q,,Quai B,48.8100,2.3100,0,B",
      "C,,Station C,48.8200,2.3200,1,",
      "C_Q,,Quai C,48.8200,2.3200,0,C",
      "D,,Station D,48.8200,2.3300,1,",
      "D_Q,,Quai D,48.8200,2.3300,0,D",
      "M1,,Metro A,48.8300,2.3400,1,",
      "M1_Q,,Metro quai A,48.8300,2.3400,0,M1",
      "M2,,Metro B,48.8400,2.3500,1,",
      "M2_Q,,Metro quai B,48.8400,2.3500,0,M2",
      "F1,,Funiculaire bas,48.8500,2.3600,1,",
      "F1_Q,,Funiculaire bas quai,48.8500,2.3600,0,F1",
      "F2,,Funiculaire haut,48.8510,2.3610,1,",
      "F2_Q,,Funiculaire haut quai,48.8510,2.3610,0,F2",
    ]),
    "trips.txt": csv([
      "route_id,service_id,trip_id,direction_id,trip_headsign,shape_id",
      "IDFM:BUS,S,BUS_1,0,Station C,BUS_MAIN",
      "IDFM:BUS,S,BUS_2,1,Station D,BUS_BRANCH",
      "IDFM:BUS,S,BUS_3,1,Station A,BUS_MAIN",
      "IDFM:BUS,S,BUS_MISSING,0,Station D,BUS_BRANCH",
      "IDFM:METRO,S,METRO_1,0,Metro B,METRO",
      "IDFM:FUNICULAR,S,FUNICULAR_1,0,Funiculaire haut,FUNICULAR",
    ]),
    "stop_times.txt": csv([
      "trip_id,arrival_time,departure_time,stop_id,stop_sequence",
      "BUS_1,08:00:00,08:00:00,A_Q,1",
      "BUS_1,08:10:00,08:10:00,B_Q,2",
      "BUS_1,08:20:00,08:20:00,C_Q,3",
      "BUS_2,09:00:00,09:00:00,A_Q,1",
      "BUS_2,09:10:00,09:10:00,B_Q,2",
      "BUS_2,09:20:00,09:20:00,D_Q,3",
      "BUS_3,10:00:00,10:00:00,C_Q,1",
      "BUS_3,10:10:00,10:10:00,B_Q,2",
      "BUS_3,10:20:00,10:20:00,A_Q,3",
      "BUS_MISSING,11:00:00,11:00:00,A_Q,1",
      "BUS_MISSING,11:10:00,11:10:00,UNKNOWN,2",
      "BUS_MISSING,11:20:00,11:20:00,D_Q,3",
      "METRO_1,08:00:00,08:00:00,M1_Q,1",
      "METRO_1,08:05:00,08:05:00,M2_Q,2",
      "FUNICULAR_1,08:00:00,08:00:00,F1_Q,1",
      "FUNICULAR_1,08:03:00,08:03:00,F2_Q,2",
    ]),
    "shapes.txt": csv([
      "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence",
      "BUS_MAIN,48.8000,2.3000,1",
      "BUS_MAIN,48.8100,2.3100,2",
      "BUS_MAIN,48.8200,2.3200,3",
      "BUS_BRANCH,48.8000,2.3000,1",
      "BUS_BRANCH,48.8100,2.3100,2",
      "BUS_BRANCH,48.8200,2.3300,3",
      "METRO,48.8300,2.3400,1",
      "METRO,48.8400,2.3500,2",
      "FUNICULAR,48.8500,2.3600,1",
      "FUNICULAR,48.8510,2.3610,2",
    ]),
    "calendar.txt": csv([
      "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date",
      "S,1,1,1,1,1,1,1,20200101,20301231",
    ]),
    "calendar_dates.txt": "service_id,date,exception_type\n",
  };

  await Promise.all(
    Object.entries(files).map(([name, content]) => fs.writeFile(join(directory, name), content)),
  );
}

async function readArtifact(output: string, routeId: string): Promise<GtfsLineArtifact> {
  return JSON.parse(
    await fs.readFile(join(output, "lines", `${encodeURIComponent(routeId)}.json`), "utf8"),
  ) as GtfsLineArtifact;
}

function csv(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}
