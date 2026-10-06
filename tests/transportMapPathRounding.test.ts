import { TransportMapRenderModelBuilder } from "../src/features/transport-map/render/transportMapRenderModel";
import type { TransportMapRenderScene } from "../src/features/transport-map/contracts/renderer";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { describe, expect, it } from "vitest";
import { createTransportMapPathRoundingOptions, roundTransportMapPositions } from "../src/features/transport-map/render/pathRounding";
import { lonLatToWorld, worldToLonLat, worldScaleAtZoom } from "../src/features/transport-map/geo/coordinateKernel";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../src/features/transport-map/config/globalTransportPlanConfig";
import { materializeLod } from "../src/features/transport-map/data/createTransportMapDataSource";
import type { GlobalMapPath } from "../src/features/transport-map/contracts/manifest";

describe("focused line rounding", () => {
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
