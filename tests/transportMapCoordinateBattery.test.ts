import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { GlobalMapChunkPayload, GlobalMapManifest } from "../src/features/transport-map/contracts/manifest";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { worldToLonLat, worldToScreen } from "../src/features/transport-map/geo/coordinateKernel";
import { TRANSPORT_MAP_PRECISION } from "../src/features/transport-map/geo/precisionContract";

const assetRoot = resolve(process.cwd(), "public/data/global-map/v1");
const manifest = readJson<GlobalMapManifest>("manifest.json");
const catalog = readJson<{ stations: Array<[string, string, string | null, number, number, number, number, number, number]> }>("catalog.json");
const stationsById = new Map(catalog.stations.map((row) => [row[0], { x: row[7], y: row[8] }]));

describe("global transport coordinate battery", () => {
  it("pins station anchors through the full and lower-detail chunk representations", () => {
    const camera = createCamera({ zoom: 18, viewportWidthCssPx: 1080, viewportHeightCssPx: 720 });
    const largestChunks = [...manifest.files.chunks]
      .sort((left, right) => (right.bytes ?? 0) - (left.bytes ?? 0))
      .slice(0, 3);
    let checkedPaths = 0;

    for (const descriptor of largestChunks) {
      const payload = readJson<GlobalMapChunkPayload>(descriptor.asset);
      expect(payload.chunk.id).toBe(descriptor.id);
      expect(payload.chunk.pathIds.slice().sort()).toEqual(payload.paths.map((path) => path.id).sort());
      for (const path of payload.paths) {
        checkedPaths += 1;
        const fullAnchorIds = unique(path.vertices.flatMap((vertex) => vertex.stationId ? [vertex.stationId] : []));
        expect(fullAnchorIds).toEqual(unique(path.stationIds));
        expect(path.chunkIds).toContain(descriptor.id);
        for (const vertex of path.vertices) {
          expect(vertex.x).toBeGreaterThanOrEqual(payload.chunk.bounds.minX - 1e-12);
          expect(vertex.x).toBeLessThanOrEqual(payload.chunk.bounds.maxX + 1e-12);
          expect(vertex.y).toBeGreaterThanOrEqual(payload.chunk.bounds.minY - 1e-12);
          expect(vertex.y).toBeLessThanOrEqual(payload.chunk.bounds.maxY + 1e-12);
          if (vertex.stationId) assertStationAnchor(vertex.stationId, vertex.x, vertex.y, camera);
        }
        for (const [lod, vertices] of Object.entries(path.lodVertices ?? {})) {
          const lodAnchorIds = unique(vertices.flatMap((vertex) => vertex.stationId ? [vertex.stationId] : []));
          expect(lodAnchorIds, `${path.id} LOD ${lod}`).toEqual(fullAnchorIds);
          for (const vertex of vertices) {
            expect(vertex.x).toBeGreaterThanOrEqual(payload.chunk.bounds.minX - 1e-12);
            expect(vertex.x).toBeLessThanOrEqual(payload.chunk.bounds.maxX + 1e-12);
            expect(vertex.y).toBeGreaterThanOrEqual(payload.chunk.bounds.minY - 1e-12);
            expect(vertex.y).toBeLessThanOrEqual(payload.chunk.bounds.maxY + 1e-12);
            if (vertex.stationId) assertStationAnchor(vertex.stationId, vertex.x, vertex.y, camera);
          }
        }
      }
    }

    expect(checkedPaths).toBeGreaterThan(0);
    expect(manifest.modes).toEqual(expect.arrayContaining([
      "BUS",
      "METRO",
      "RER",
      "TRAIN",
      "TRANSILIEN",
      "TRAM",
      "CABLE",
      "NOCTILIEN",
    ]));
    expect(manifest.warnings.some((warning) => warning.code === "optional-source-unavailable" && warning.sample?.includes("BIKE"))).toBe(true);
  }, 30_000);
});

function assertStationAnchor(stationId: string, x: number, y: number, camera: ReturnType<typeof createCamera>): void {
  const station = stationsById.get(stationId);
  expect(station, `unknown station anchor ${stationId}`).toBeDefined();
  const expected = station!;
  expect(worldDistanceMeters({ x, y }, expected)).toBeLessThanOrEqual(TRANSPORT_MAP_PRECISION.detailedVertexMeters);
  const stationScreen = worldToScreen(expected, camera);
  const vertexScreen = worldToScreen({ x, y }, camera);
  expect(Math.hypot(stationScreen.x - vertexScreen.x, stationScreen.y - vertexScreen.y)).toBeLessThanOrEqual(
    TRANSPORT_MAP_PRECISION.canvasAnchorCssPx,
  );
  // The HTML overlay and Canvas both consume this Float64 screen transform;
  // keeping the comparison here makes that contract explicit and renderer-neutral.
  expect(worldToScreen(expected, camera)).toEqual(worldToScreen({ x, y }, camera));
}

function worldDistanceMeters(left: { x: number; y: number }, right: { x: number; y: number }): number {
  const leftLonLat = worldToLonLat(left);
  const rightLonLat = worldToLonLat(right);
  const radius = 6_378_137;
  const phi1 = leftLonLat.lat * Math.PI / 180;
  const phi2 = rightLonLat.lat * Math.PI / 180;
  const dPhi = (rightLonLat.lat - leftLonLat.lat) * Math.PI / 180;
  const dLambda = (rightLonLat.lon - leftLonLat.lon) * Math.PI / 180;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function readJson<T>(asset: string): T {
  return JSON.parse(readFileSync(resolve(assetRoot, asset), "utf8")) as T;
}
