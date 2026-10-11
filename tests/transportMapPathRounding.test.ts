import { TransportMapRenderModelBuilder } from "../src/features/transport-map/render/transportMapRenderModel";
import type { TransportMapRenderScene } from "../src/features/transport-map/contracts/renderer";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { describe, expect, it } from "vitest";
import { createTransportMapPathRoundingOptions, roundTransportMapPositions } from "../src/features/transport-map/render/pathRounding";
import { lonLatToWorld, worldToLonLat, worldScaleAtZoom } from "../src/features/transport-map/geo/coordinateKernel";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../src/features/transport-map/config/globalTransportPlanConfig";
import { materializeLod } from "../src/features/transport-map/data/createTransportMapDataSource";
import type { GlobalMapPath } from "../src/features/transport-map/contracts/manifest";
import { appendRoundedPolylineToPath } from "../src/features/line-map/lineGeometry";
import type { GlobalMapMode } from "../src/features/transport-map/contracts/manifest";

describe("focused line rounding", () => {
  it.each(["METRO", "RER", "TRAIN", "TRANSILIEN", "TRAM", "BUS", "NOCTILIEN"] as GlobalMapMode[])("preserves every Float64 coordinate of the command-based rounding for %s", (mode) => {
    const source = new Float64Array(Array.from({ length: 80 }, (_, index) => [
      2.35 + Math.floor(index / 2) * 0.00006,
      48.85 + Math.sin(Math.floor(index / 2) * 0.7) * 0.0002,
    ]).flat());
    const unchanged = source.slice();
    for (const zoom of [8, 12.25, 16, 19.5]) {
      const expected = commandBasedRounding(source, zoom, mode);
      expect(roundTransportMapPositions(source, zoom, mode)).toEqual(expected);
      expect(source).toEqual(unchanged);
    }
  });
  it("keeps metro curve coordinates identical when selecting and deselecting a line", () => {
    const builder = new TransportMapRenderModelBuilder();
    const vertices = [
      lonLatToWorld({ lon: 2.3, lat: 48.8 }),
      lonLatToWorld({ lon: 2.301, lat: 48.8 }),
      lonLatToWorld({ lon: 2.301, lat: 48.801 }),
    ];
    const scene: TransportMapRenderScene = {
      lines: [{ id: "metro", index: 0, code: "4", label: "4", mode: "METRO",
        color: "#800080", textColor: "#ffffff", aliases: [], stationIds: [], geometryIds: ["path"] }],
      paths: [{ id: "path", lineId: "metro", geometrySource: "gtfs", sourceVersion: "test",
        quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
        stationIds: [], vertices, minX: vertices[0]!.x, minY: vertices[2]!.y,
        maxX: vertices[2]!.x, maxY: vertices[0]!.y, chunkIds: [] }],
      stations: [], selectedStationIds: [], visibleModeMask: 0xffff,
    };
    const camera = createCamera({ centerWorldX: vertices[0]!.x, centerWorldY: vertices[0]!.y, zoom: 16 });
    const overview = builder.build(camera, scene).basePaths[0]!.positions;
    const focused = builder.build(camera, { ...scene, activeLineId: "metro" }).basePaths[0]!.positions;
    expect(overview.length).toBeGreaterThan(vertices.length * 2);
    expect(focused).toEqual(overview);
    expect(builder.build(camera, scene).basePaths[0]!.positions).toEqual(overview);
  });
  it("uses the same broad metro radius in overview and focused views", () => {
    const overview = createTransportMapPathRoundingOptions(false, 6.5, "METRO");
    const focused = createTransportMapPathRoundingOptions(true, 10, "METRO");
    expect(overview.maximumCornerRadius).toBe(focused.maximumCornerRadius);
    expect(overview.cornerRadiusRatio).toBe(focused.cornerRadiusRatio);
    expect(focused.maximumCornerRadius).toBeGreaterThan(10);
  });
  it("keeps global Metro geometry at full detail instead of the 250 m LOD", () => {
    const cameraLodLevel = 1;
    const effectiveLodLevel = Math.max(
      cameraLodLevel,
      GLOBAL_TRANSPORT_PLAN_CONFIG.lod.minimumLevelByMode.METRO ?? cameraLodLevel,
    );
    const fullVertices = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    const simplifiedVertices = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    const path = {
      vertices: fullVertices,
      lodVertices: { "1": simplifiedVertices },
    } as unknown as GlobalMapPath;

    expect(effectiveLodLevel).toBe(2);
    expect(materializeLod(path, effectiveLodLevel).vertices).toBe(fullVertices);
  });
  it("curves a right angle while preserving endpoints and source geometry", () => {
    const zoom = 14;
    const scale = worldScaleAtZoom(zoom);
    const origin = lonLatToWorld({ lon: 2.35, lat: 48.85 });
    const points = [[0, 0], [40, 0], [40, 40]].flatMap(([x, y]) => {
      const point = worldToLonLat({ x: origin.x + x! / scale, y: origin.y + y! / scale });
      return [point.lon, point.lat];
    });
    const source = new Float64Array(points);
    const rounded = roundTransportMapPositions(source, zoom);
    expect(Array.from(source)).toEqual(points);
    expect(rounded.length).toBeGreaterThan(source.length);
    expect(Array.from(rounded.slice(0, 2))).toEqual(points.slice(0, 2));
    expect(Array.from(rounded.slice(-2))).toEqual(points.slice(-2));
    const insideBend = Array.from({ length: rounded.length / 2 }, (_, i) => {
      const world = lonLatToWorld({ lon: rounded[i * 2]!, lat: rounded[i * 2 + 1]! });
      return { x: (world.x - origin.x) * scale, y: (world.y - origin.y) * scale };
    });
    expect(insideBend.some(({ x, y }) => x > 30 && x < 40 && y > 0 && y < 10)).toBe(true);
  });
});

/** The original shared command API is an independent geometry reference. */
function commandBasedRounding(positions: Float64Array, zoom: number, mode: GlobalMapMode): Float64Array {
  const scale = worldScaleAtZoom(zoom);
  const points = Array.from({ length: positions.length / 2 }, (_, index) => {
    const world = lonLatToWorld({ lon: positions[index * 2]!, lat: positions[index * 2 + 1]! });
    return { x: world.x * scale, y: world.y * scale };
  });
  const output: number[] = [];
  let previous = { x: 0, y: 0 };
  const append = (x: number, y: number) => {
    const point = worldToLonLat({ x: x / scale, y: y / scale });
    output.push(point.lon, point.lat);
    previous = { x, y };
  };
  appendRoundedPolylineToPath({ moveTo: append, lineTo: append, quadraticCurveTo: (cx, cy, x, y) => {
    const from = previous;
    for (let step = 1; step <= 8; step += 1) {
      const t = step / 8;
      const u = 1 - t;
      append(u * u * from.x + 2 * u * t * cx + t * t * x,
        u * u * from.y + 2 * u * t * cy + t * t * y);
    }
  } }, points, createTransportMapPathRoundingOptions(true, 0, mode));
  if (output.length >= 4) {
    output[0] = positions[0]!;
    output[1] = positions[1]!;
    output[output.length - 2] = positions[positions.length - 2]!;
    output[output.length - 1] = positions[positions.length - 1]!;
  }
  return new Float64Array(output);
}
