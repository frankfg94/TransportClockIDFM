import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { GlobalMapCatalog, GlobalMapLine, GlobalMapPath } from "../src/features/transport-map/contracts/manifest";
import { resolveGlobalMapVertex } from "../src/features/transport-map/contracts/manifest";

const assetRoot = resolve(process.cwd(), "public/data/global-map/v1");
const CHATELET_STATION_ID = "station:FR::Quay:50114566:FR1";
const CHATELET_BUS_CHUNK = "chunks/z11-1037-704-bus.json";
const CHATELET_CORE_CHUNK = "chunks/z11-1037-704-core.json";

describe("Châtelet detailed road geometry", () => {
  it("keeps GTFS road anchors for the bus and Noctilien paths", () => {
    const catalog = readJson<GlobalMapCatalog>("catalog.json");
    const lines = readJson<{ lines: Array<[string, string, string, GlobalMapLine["mode"]]> }>("bootstrap.json").lines;
    const lineModes = new Map(lines.map(([id, , , mode]) => [id, mode]));
    const station = catalog.stations.find(([id]) => id === CHATELET_STATION_ID);
    expect(station, "Châtelet canonical station is missing").toBeDefined();

    const targetX = station![7];
    const targetY = station![8];
    const paths = [CHATELET_BUS_CHUNK, CHATELET_CORE_CHUNK]
      .flatMap((file) => readJson<{ paths: GlobalMapPath[] }>(file).paths)
      .filter((path) => {
        const mode = lineModes.get(path.lineId);
        const nearestVertexDistance = Math.min(
          ...path.vertices.map((vertex) => Math.hypot(vertex.x - targetX, vertex.y - targetY)),
        );
        return (mode === "BUS" || mode === "NOCTILIEN") && nearestVertexDistance < 0.000005;
      });

    const gtfsPaths = paths.filter((path) => path.geometrySource === "gtfs");
    expect(gtfsPaths.length).toBeGreaterThan(20);
    expect(gtfsPaths.every((path) => path.sourceVersion.includes("v3-provider-road-anchors"))).toBe(true);

    const line58PontNeuf = paths.find((path) => path.id.startsWith("path:line:IDFM:C01095:segment:17#"));
    expect(line58PontNeuf, "line 58 Pont Neuf → Châtelet geometry is missing").toBeDefined();
    const stationVertex = line58PontNeuf!.vertices.find((vertex) => vertex.stationId === "station:FR::Quay:50115002:FR1");
    expect(stationVertex).toBeDefined();
    const resolvedVertex = resolveGlobalMapVertex(line58PontNeuf!, stationVertex!);
    expect(resolvedVertex).not.toEqual(stationVertex);
    expect(Math.hypot(
      (resolvedVertex.x - stationVertex!.x) * 40_075_016.6856,
      (resolvedVertex.y - stationVertex!.y) * 40_075_016.6856,
    )).toBeGreaterThan(75);
  });
});

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(assetRoot, file), "utf8")) as T;
}
