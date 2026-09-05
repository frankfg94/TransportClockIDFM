import { describe, expect, it } from "vitest";
import { resolveGlobalMapVertex } from "../src/features/transport-map/contracts/manifest";
import type { GlobalMapLine, GlobalMapPath, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { worldToScreen } from "../src/features/transport-map/geo/coordinateKernel";
import { hitTestTransportMap } from "../src/features/transport-map/spatial/hitTest";
import { buildPathSpatialIndex, buildStationSpatialIndex } from "../src/features/transport-map/spatial/packedIndex";

const line: GlobalMapLine = {
  id: "line:metro:fixture",
  index: 0,
  code: "F",
  label: "Fixture",
  mode: "METRO",
  color: "#000",
  textColor: "#fff",
  aliases: ["F"],
  stationIds: ["station:fixture"],
  geometryIds: ["path:fixture"],
};

const station: GlobalMapStation = {
  id: "station:fixture",
  index: 0,
  name: "Fixture",
  normalizedName: "fixture",
  aliases: ["Fixture"],
  rawRefs: ["station:fixture"],
  lineIds: [line.id],
  ownerChunkId: "chunk:fixture",
  isHub: true,
  sourceCrs: "EPSG:2154",
  sourceX: 652469,
  sourceY: 6861275,
  lon: 2.3522,
  lat: 48.8566,
  worldX: 0.506123,
  worldY: 0.351987,
  coordinateSource: "netex",
  transformVersion: "lambert93-ntf-v1",
};

const path: GlobalMapPath = {
  id: "path:fixture",
  lineId: line.id,
  geometrySource: "gtfs",
  sourceVersion: "fixture",
  quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
  stationIds: [station.id],
  vertices: [
    { stationId: station.id, x: station.worldX, y: station.worldY },
    { x: station.worldX + 0.00001, y: station.worldY + 0.00001 },
  ],
  minX: station.worldX,
  minY: station.worldY,
  maxX: station.worldX + 0.00001,
  maxY: station.worldY + 0.00001,
  chunkIds: ["chunk:fixture"],
};

describe("transport map anchor parity", () => {
  it("snaps a drifting provider anchor back to the canonical station marker", () => {
    const anchoredPath: GlobalMapPath = {
      ...path,
      renderStationAnchors: [{
        stationId: station.id,
        x: station.worldX + 0.000001,
        y: station.worldY + 0.000001,
      }],
    };

    expect(resolveGlobalMapVertex(anchoredPath, anchoredPath.vertices[0]!, station)).toEqual({
      x: station.worldX,
      y: station.worldY,
    });
  });

  it("keeps provider road anchors for bus strokes while preserving the station marker", () => {
    const busPath: GlobalMapPath = {
      ...path,
      lineId: "line:bus:fixture",
      renderStationAnchors: [{
        stationId: station.id,
        x: station.worldX + 0.000001,
        y: station.worldY + 0.000001,
      }],
    };

    expect(resolveGlobalMapVertex(busPath, busPath.vertices[0]!, station, "BUS")).toEqual(
      busPath.renderStationAnchors![0],
    );
    expect(resolveGlobalMapVertex(busPath, busPath.vertices[0]!, station, "METRO")).toEqual({
      x: station.worldX,
      y: station.worldY,
    });
  });

  it("keeps station, line anchor, HTML overlay and hit-test at one Float64 screen point", () => {
    for (const viewport of [[360, 800], [412, 915], [768, 1024], [1280, 720], [1920, 1080]]) {
      for (const zoom of [8, 10, 12, 14, 16, 18, 20]) {
        for (const pixelRatio of [1, 1.5, 2, 2.625, 3]) {
          const camera = createCamera({
            centerWorldX: station.worldX,
            centerWorldY: station.worldY,
            zoom,
            viewportWidthCssPx: viewport[0],
            viewportHeightCssPx: viewport[1],
            pixelRatio,
          });
          const expected = worldToScreen({ x: station.worldX, y: station.worldY }, camera);
          const lineAnchor = worldToScreen(path.vertices[0]!, camera);
          const overlay = worldToScreen({ x: station.worldX, y: station.worldY }, camera);
          const hit = hitTestTransportMap(
            expected,
            camera,
            [station],
            [line],
            [path],
            buildStationSpatialIndex([station]),
            buildPathSpatialIndex([path]),
            { modeMask: 1 << 1 },
          );
          expect(Math.hypot(lineAnchor.x - expected.x, lineAnchor.y - expected.y)).toBeLessThanOrEqual(0.25);
          expect(overlay).toEqual(expected);
          expect(hit).toMatchObject({ type: "station", id: station.id });
        }
      }
    }
  });
});
