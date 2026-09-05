import { describe, expect, it } from "vitest";
import type {
  GlobalMapLine,
  GlobalMapPath,
  GlobalMapStation,
} from "../src/features/transport-map/contracts/manifest";
import { lonLatToWorld } from "../src/features/transport-map/geo/coordinateKernel";
import { buildGlobalLineMetadata } from "../src/features/line-map/globalLineMetadata";
import { getCoordinatesDistanceKm } from "../src/services/distance";

function station(
  id: string,
  name: string,
  city: string,
  lat: number,
  lon: number,
  lineIds: string[],
  isHub = false,
): GlobalMapStation {
  const world = lonLatToWorld({ lat, lon });
  return {
    id,
    index: 0,
    name,
    normalizedName: name.toLocaleLowerCase("fr-FR"),
    city,
    aliases: [],
    rawRefs: [],
    lineIds,
    ownerChunkId: "chunk:test",
    isHub,
    sourceCrs: "EPSG:2154",
    sourceX: 0,
    sourceY: 0,
    lon,
    lat,
    worldX: world.x,
    worldY: world.y,
    coordinateSource: "netex",
    transformVersion: "lambert93-ntf-v1",
  };
}

function line(stationIds: string[]): GlobalMapLine {
  return {
    id: "line:IDFM:TEST",
    index: 0,
    code: "CTEST",
    label: "T",
    mode: "METRO",
    color: "#123456",
    textColor: "#ffffff",
    aliases: [],
    stationIds,
    geometryIds: ["path:test"],
  };
}

function path(lineId: string, points: Array<{ lat: number; lon: number }>): GlobalMapPath {
  return {
    id: "path:test",
    lineId,
    geometrySource: "gtfs",
    sourceVersion: "test",
    quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
    stationIds: [],
    vertices: points.map((point) => lonLatToWorld(point)),
    minX: 0,
    minY: 0,
    maxX: 1,
    maxY: 1,
    chunkIds: ["chunk:test"],
  };
}

describe("buildGlobalLineMetadata", () => {
  it("summarizes the ordered route, cities and detailed path length", () => {
    const first = station("station:first", "Depart", "Paris", 48.8566, 2.3522, ["line:IDFM:TEST"]);
    const second = station("station:second", "Centre", "Paris", 48.85, 2.34, ["line:IDFM:TEST"]);
    const last = station("station:last", "Terminus", "Montrouge", 48.82, 2.32, ["line:IDFM:TEST"]);
    const selectedLine = line([first.id, second.id, last.id]);

    const metadata = buildGlobalLineMetadata(
      selectedLine,
      [first, second, last],
      [path(selectedLine.id, [first, second, last])],
    );

    expect(metadata.stationCount).toBe(3);
    expect(metadata.firstStation?.name).toBe("Depart");
    expect(metadata.lastStation?.name).toBe("Terminus");
    expect(metadata.cities).toEqual(["Paris", "Montrouge"]);
    expect(metadata.lengthKm).toBeGreaterThan(3);
    expect(metadata.geometrySources).toEqual(["gtfs"]);
  });

  it("finds hub connections from neighbouring physical stop records", () => {
    const routeStation = station("station:route", "Chatelet", "Paris", 48.8566, 2.3522, ["line:IDFM:TEST"]);
    const hub = station("station:hub", "Chatelet - Les Halles", "Paris", 48.8569, 2.3525, ["line:IDFM:RERB"], true);
    const nearbyNonHub = station("station:bus", "Rue voisine", "Paris", 48.8568, 2.3523, ["line:IDFM:BUS"], false);
    const selectedLine = line([routeStation.id]);

    const metadata = buildGlobalLineMetadata(selectedLine, [routeStation, hub, nearbyNonHub], []);

    expect(metadata.connectionLineIds).toEqual(["line:IDFM:RERB"]);
  });

  it("does not measure a partial viewport path as the whole line", () => {
    const first = station("station:first", "Depart", "Paris", 48.8566, 2.3522, ["line:IDFM:TEST"]);
    const second = station("station:second", "Centre", "Paris", 48.85, 2.34, ["line:IDFM:TEST"]);
    const last = station("station:last", "Terminus", "Montrouge", 48.82, 2.32, ["line:IDFM:TEST"]);
    const selectedLine = {
      ...line([first.id, second.id, last.id]),
      geometryIds: ["path:test", "path:other"],
    };

    const metadata = buildGlobalLineMetadata(
      selectedLine,
      [first, second, last],
      [path(selectedLine.id, [first, last])],
    );
    const stationSequenceLength =
      getCoordinatesDistanceKm(first.lat, first.lon, second.lat, second.lon) +
      getCoordinatesDistanceKm(second.lat, second.lon, last.lat, last.lon);

    expect(metadata.lengthKm).toBeCloseTo(stationSequenceLength, 8);
  });
});
