import { describe, expect, it } from "vitest";
import { GLOBAL_MAP_MODE_ORDER } from "../src/features/transport-map/contracts/manifest";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { hitTestTransportMap, queryTransportMapLineCandidates } from "../src/features/transport-map/spatial/hitTest";
import { buildPathSpatialIndex, buildStationSpatialIndex } from "../src/features/transport-map/spatial/packedIndex";
import type { GlobalMapLine, GlobalMapPath, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import { metersToWorldUnits, screenToWorld, worldToScreen } from "../src/features/transport-map/geo/coordinateKernel";
import {
  createStationNodeVisibilityPredicate,
  GLOBAL_TRANSPORT_PLAN_STATION_DETAIL_ZOOM,
} from "../src/features/transport-map/render/stationNodeVisibility";

const line: GlobalMapLine = {
  id: "line:1",
  index: 0,
  code: "1",
  label: "1",
  mode: "METRO",
  color: "#0f766e",
  textColor: "#fff",
  aliases: ["1"],
  stationIds: ["station:a", "station:b"],
  geometryIds: ["path:1"],
};
const hubLine: GlobalMapLine = {
  ...line,
  id: "line:hub",
  code: "T2",
  label: "T2",
  mode: "TRAM",
  stationIds: ["station:a"],
};
const stations: GlobalMapStation[] = [
  {
    id: "station:a", index: 0, name: "A", normalizedName: "a", aliases: ["A"], rawRefs: ["a"], lineIds: [line.id, hubLine.id], ownerChunkId: "z", isHub: true, sourceCrs: "EPSG:2154", sourceX: 650000, sourceY: 6800000, lon: 2.3, lat: 48.8, worldX: 0.506, worldY: 0.342, coordinateSource: "netex", transformVersion: "lambert93-ntf-v1",
  },
  {
    id: "station:b", index: 1, name: "B", normalizedName: "b", aliases: ["B"], rawRefs: ["b"], lineIds: [line.id], ownerChunkId: "z", isHub: false, sourceCrs: "EPSG:2154", sourceX: 650100, sourceY: 6800100, lon: 2.31, lat: 48.81, worldX: 0.5064, worldY: 0.3418, coordinateSource: "netex", transformVersion: "lambert93-ntf-v1",
  },
];
const paths: GlobalMapPath[] = [{
  id: "path:1", lineId: line.id, geometrySource: "gtfs", sourceVersion: "test", quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 }, stationIds: stations.map((station) => station.id), vertices: [{ stationId: stations[0]!.id, x: stations[0]!.worldX, y: stations[0]!.worldY }, { x: 0.5062, y: 0.3419 }, { stationId: stations[1]!.id, x: stations[1]!.worldX, y: stations[1]!.worldY }], minX: 0.506, minY: 0.3418, maxX: 0.5064, maxY: 0.342, chunkIds: [],
}];

describe("global transport spatial primitive", () => {
  it("matches the rendered station visibility around the detail zoom", () => {
    const scene = {
      lines: [line, hubLine],
      activeLineId: line.id,
      selectedStationIds: [],
      visibleModeMask: (1 << GLOBAL_MAP_MODE_ORDER.indexOf(line.mode)) |
        (1 << GLOBAL_MAP_MODE_ORDER.indexOf(hubLine.mode)),
      ghostLineIds: [],
    };

    const overviewVisibility = createStationNodeVisibilityPredicate(
      createCamera({ zoom: GLOBAL_TRANSPORT_PLAN_STATION_DETAIL_ZOOM - 0.01 }),
      scene,
    );
    expect(overviewVisibility(stations[0]!)).toBe(true);
    expect(overviewVisibility(stations[1]!)).toBe(true);

    const detailVisibility = createStationNodeVisibilityPredicate(
      createCamera({ zoom: GLOBAL_TRANSPORT_PLAN_STATION_DETAIL_ZOOM }),
      scene,
    );
    expect(detailVisibility(stations[1]!)).toBe(true);

    const selectedOverviewVisibility = createStationNodeVisibilityPredicate(
      createCamera({ zoom: GLOBAL_TRANSPORT_PLAN_STATION_DETAIL_ZOOM - 0.01 }),
      { ...scene, selectedStationIds: [stations[1]!.id] },
    );
    expect(selectedOverviewVisibility(stations[1]!)).toBe(true);
  });

  it("hides same-family two-line interchanges such as the U line in overview", () => {
    const uLine: GlobalMapLine = {
      ...line,
      id: "line:IDFM:C01741",
      code: "U",
      label: "U",
      mode: "TRANSILIEN",
      stationIds: ["station:puteaux"],
    };
    const nLine: GlobalMapLine = {
      ...line,
      id: "line:IDFM:C01736",
      code: "N",
      label: "N",
      mode: "TRANSILIEN",
      stationIds: ["station:puteaux"],
    };
    const uStation: GlobalMapStation = {
      ...stations[0]!,
      id: "station:puteaux",
      name: "Puteaux",
      lineIds: [uLine.id, nLine.id],
      isHub: true,
    };
    const scene = {
      lines: [uLine, nLine],
      activeLineId: undefined,
      selectedStationIds: [],
      visibleModeMask: 1 << GLOBAL_MAP_MODE_ORDER.indexOf("TRANSILIEN"),
      ghostLineIds: [],
    };

    const overviewVisibility = createStationNodeVisibilityPredicate(
      createCamera({ zoom: GLOBAL_TRANSPORT_PLAN_STATION_DETAIL_ZOOM - 0.01 }),
      scene,
    );
    expect(overviewVisibility(uStation)).toBe(false);

    const detailVisibility = createStationNodeVisibilityPredicate(
      createCamera({ zoom: GLOBAL_TRANSPORT_PLAN_STATION_DETAIL_ZOOM }),
      scene,
    );
    expect(detailVisibility(uStation)).toBe(true);

    const majorHubVisibility = createStationNodeVisibilityPredicate(
      createCamera({ zoom: GLOBAL_TRANSPORT_PLAN_STATION_DETAIL_ZOOM - 0.01 }),
      scene,
    );
    expect(majorHubVisibility({
      ...uStation,
      lineIds: [uLine.id, nLine.id, "line:IDFM:C01739"],
    })).toBe(true);
  });

  it("hits stations before nearby line geometry in CSS coordinates", () => {
    const camera = createCamera({ centerWorldX: 0.5062, centerWorldY: 0.342, zoom: 15, viewportWidthCssPx: 600, viewportHeightCssPx: 400 });
    const point = worldToScreen({ x: stations[0]!.worldX, y: stations[0]!.worldY }, camera);
    const result = hitTestTransportMap(point, camera, stations, [line], paths, buildStationSpatialIndex(stations), buildPathSpatialIndex(paths), { modeMask: 1 << 1 });
    expect(result?.type).toBe("station");
    expect(result?.id).toBe(stations[0]!.id);
  });

  it("keeps a station hit inside the expanded target when the line is nearby", () => {
    const camera = createCamera({ centerWorldX: 0.5062, centerWorldY: 0.342, zoom: 15, viewportWidthCssPx: 600, viewportHeightCssPx: 400 });
    const stationPoint = worldToScreen({ x: stations[0]!.worldX, y: stations[0]!.worldY }, camera);
    const nearbyLineEnd = screenToWorld({ x: stationPoint.x + 9, y: stationPoint.y }, camera);
    const nearbyPath: GlobalMapPath = {
      ...paths[0]!,
      id: "path:nearby",
      vertices: [
        { stationId: stations[0]!.id, x: stations[0]!.worldX, y: stations[0]!.worldY },
        { x: nearbyLineEnd.x, y: nearbyLineEnd.y },
      ],
      minX: Math.min(stations[0]!.worldX, nearbyLineEnd.x),
      minY: Math.min(stations[0]!.worldY, nearbyLineEnd.y),
      maxX: Math.max(stations[0]!.worldX, nearbyLineEnd.x),
      maxY: Math.max(stations[0]!.worldY, nearbyLineEnd.y),
    };
    const point = { x: stationPoint.x + 14, y: stationPoint.y };
    const result = hitTestTransportMap(
      point,
      camera,
      stations,
      [line],
      [nearbyPath],
      buildStationSpatialIndex(stations),
      buildPathSpatialIndex([nearbyPath]),
      { modeMask: 1 << 1 },
    );

    expect(result?.type).toBe("station");
    expect(result?.id).toBe(stations[0]!.id);
    expect(result?.distanceCssPx).toBeCloseTo(14, 5);
  });

  it("groups nearby rendered lines by id around the primary path", () => {
    const camera = createCamera({ centerWorldX: 0.5062, centerWorldY: 0.342, zoom: 15, viewportWidthCssPx: 600, viewportHeightCssPx: 400 });
    const primaryPoint = { x: 0.5062, y: 0.3419 };
    const point = worldToScreen(primaryPoint, camera);
    const fourMeters = metersToWorldUnits(4, primaryPoint);
    const sevenMeters = metersToWorldUnits(7, primaryPoint);
    const siblingLine: GlobalMapLine = { ...line, id: "line:2", index: 1, code: "2", label: "2", geometryIds: ["path:2"] };
    const outsideLine: GlobalMapLine = { ...line, id: "line:3", index: 2, code: "3", label: "3", geometryIds: ["path:3"] };
    const hiddenLine: GlobalMapLine = { ...line, id: "line:bus", index: 3, code: "38", label: "38", mode: "BUS", geometryIds: ["path:bus"] };
    const translatePath = (path: GlobalMapPath, id: string, lineId: string, offsetY: number): GlobalMapPath => ({
      ...path,
      id,
      lineId,
      stationIds: [],
      vertices: path.vertices.map((vertex) => ({ x: vertex.x, y: vertex.y + offsetY, stationId: undefined })),
      minY: path.minY + offsetY,
      maxY: path.maxY + offsetY,
    });
    const siblingPath = translatePath(paths[0]!, "path:2", siblingLine.id, fourMeters);
    const siblingDuplicate = translatePath(paths[0]!, "path:2-duplicate", siblingLine.id, fourMeters);
    const outsidePath = translatePath(paths[0]!, "path:3", outsideLine.id, sevenMeters);
    const hiddenPath = translatePath(paths[0]!, "path:bus", hiddenLine.id, fourMeters / 2);
    const renderedPaths = [paths[0]!, siblingPath, siblingDuplicate, outsidePath, hiddenPath];
    const candidates = queryTransportMapLineCandidates(
      point,
      camera,
      [],
      [line, siblingLine, outsideLine, hiddenLine],
      renderedPaths,
      buildPathSpatialIndex(renderedPaths),
      { modeMask: 1 << 1, lineCandidateRadiusMeters: 5 },
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual([line.id, siblingLine.id]);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.vertexSegmentIndex).toBe(0);
    expect(candidates.filter((candidate) => candidate.id === siblingLine.id)).toHaveLength(1);
    expect(candidates[1]!.distanceMeters).toBeGreaterThan(3);
    expect(candidates[1]!.distanceMeters).toBeLessThan(5);
  });
});
