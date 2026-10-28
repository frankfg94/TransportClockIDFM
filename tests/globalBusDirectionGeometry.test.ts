import { describe, expect, it } from "vitest";
import type { LineRouteSequence } from "../src/types/transit";
import type { GlobalMapLine } from "../src/features/transport-map/contracts/manifest";
import {
  createGlobalBusDirectionGeometryPath,
} from "../src/features/line-map/globalBusDirectionGeometry";
import { resolveGlobalBusDirection } from "../src/features/line-map/globalBusDirections";
import type { LineGeometryResolution } from "../src/features/line-map/lineGeometry";
import { getGlobalMapPathSubpathRanges, resolveGlobalMapVertex } from "../src/features/transport-map/contracts/manifest";
import { lonLatToWorld } from "../src/features/transport-map/geo/coordinateKernel";

const line = {
  id: "line:IDFM:C99999",
  index: 0,
  code: "C99999",
  label: "99",
  mode: "BUS",
  color: "#4f6f9d",
  textColor: "#ffffff",
  aliases: ["99"],
  stationIds: ["station:a", "station:b", "station:c", "station:d"],
  geometryIds: [],
} satisfies GlobalMapLine;

function sequence(): LineRouteSequence {
  const stopIds = [
    "stop-point:a",
    "stop-point:b",
    "stop-point:c",
    "stop-point:b",
    "stop-point:c",
    "stop-point:d",
  ];
  return {
    id: "loop",
    label: "Boucle",
    direction: "Boucle",
    stops: stopIds.map((id, index) => ({
      id,
      label: id,
      lon: 2.3 + index / 100,
      lat: 48.8 + index / 100,
      station: {
        id: id.replace(/^stop-point:/u, "station:"),
        label: id,
        lon: 2.3 + index / 100,
        lat: 48.8 + index / 100,
        monitoringRef: id,
      },
    })),
  };
}

function segment(
  fromStopId: string,
  toStopId: string,
  from: [number, number],
  to: [number, number],
) {
  return {
    id: `${fromStopId}-${toStopId}`,
    fromStopId,
    toStopId,
    coordinates: [
      { lon: from[0], lat: from[1] },
      { lon: to[0], lat: to[1] },
    ],
  };
}

describe("global bus direction geometry", () => {
  it("still reconciles nearby provider endpoints at the same stop", () => {
    const route = sequence();
    route.stops = route.stops.slice(0, 3);
    const selection = resolveGlobalBusDirection([route], "loop")!;
    const resolution: LineGeometryResolution = {
      schemaVersion: 1, source: "gtfs", generatedAt: "2026-10-25T00:00:00Z",
      stops: [], branches: [], entrances: [], attempts: [{ source: "gtfs", status: "success" }],
      segments: [
        segment("stop-point:a", "stop-point:b", [2.3, 48.8], [2.31, 48.81]),
        segment("stop-point:b", "stop-point:c", [2.31001, 48.81], [2.32, 48.82]),
      ],
    };
    const path = createGlobalBusDirectionGeometryPath(line, selection, ["station:a", "station:b", "station:c"], resolution)!;
    expect(path.quality.complete).toBe(true);
    expect(path.quality.gapMeters).toBe(0);
    expect(path.vertices).toHaveLength(3);
    expect(getGlobalMapPathSubpathRanges(path)).toEqual([{ start: 0, end: 3 }]);
  });

  it.each(["previous", "next"])("keeps distant provider joins separate when the %s endpoint is closest to the stop", (closest) => {
    const route = sequence();
    route.stops = route.stops.slice(0, 3);
    route.stops[1]!.lon = closest === "previous" ? 2.31 : 2.315;
    route.stops[1]!.lat = 48.81;
    const selection = { ...resolveGlobalBusDirection([route], "loop")!, sequence: route };
    const resolution: LineGeometryResolution = {
      schemaVersion: 1, source: "gtfs", generatedAt: "2026-10-25T00:00:00Z",
      stops: [], branches: [], entrances: [], attempts: [{ source: "gtfs", status: "success" }],
      segments: [
        segment("stop-point:a", "stop-point:b", [2.3, 48.8], [2.31, 48.81]),
        segment("stop-point:b", "stop-point:c", [2.315, 48.81], [2.32, 48.82]),
      ],
    };
    const path = createGlobalBusDirectionGeometryPath(line, selection, ["station:a", "station:b", "station:c"], resolution)!;
    expect(path.quality.complete).toBe(false);
    expect(path.quality.fallback).toBe(false);
    expect(path.quality.gapMeters).toBeGreaterThan(300);
    expect(path.renderStationAnchors?.find((anchor) => anchor.stationId === "station:b")).toMatchObject(
      lonLatToWorld({ lon: closest === "previous" ? 2.31 : 2.315, lat: 48.81 }),
    );
    expect(getGlobalMapPathSubpathRanges(path)).toEqual([{ start: 0, end: 2 }, { start: 2, end: 4 }]);
    const canonical = { worldX: 0, worldY: 0 };
    const rendered = path.vertices.map((vertex) => {
      const { x, y } = resolveGlobalMapVertex(path, vertex, vertex.stationId ? canonical : undefined, "BUS");
      return { x, y };
    });
    expect(rendered).toEqual([
      lonLatToWorld({ lon: 2.3, lat: 48.8 }),
      lonLatToWorld({ lon: 2.31, lat: 48.81 }),
      lonLatToWorld({ lon: 2.315, lat: 48.81 }),
      lonLatToWorld({ lon: 2.32, lat: 48.82 }),
    ]);
  });

  it("reuses a validated provider edge when a loop visits it twice", () => {
    const route = sequence();
    const selection = resolveGlobalBusDirection([route], "loop");
    expect(selection).toBeDefined();

    const resolution: LineGeometryResolution = {
      schemaVersion: 1,
      source: "gtfs",
      generatedAt: "2026-09-11T00:00:00.000Z",
      stops: route.stops.map((stop) => ({
        id: stop.id,
        label: stop.label,
        lon: stop.lon!,
        lat: stop.lat!,
      })),
      branches: [{
        id: "loop",
        direction: "Boucle",
        stopIds: route.stops.map((stop) => stop.id),
      }],
      // The b -> c edge is returned once although the route traverses it twice.
      segments: [
        segment("stop-point:a", "stop-point:b", [2.3, 48.8], [2.31, 48.81]),
        segment("stop-point:b", "stop-point:c", [2.31, 48.81], [2.32, 48.82]),
        segment("stop-point:c", "stop-point:b", [2.32, 48.82], [2.31, 48.81]),
        segment("stop-point:c", "stop-point:d", [2.32, 48.82], [2.33, 48.83]),
      ],
      entrances: [],
      attempts: [{ source: "gtfs", status: "success" }],
    };

    const path = createGlobalBusDirectionGeometryPath(
      line,
      selection!,
      ["station:a", "station:b", "station:c", "station:b", "station:c", "station:d"],
      resolution,
    );

    expect(path?.quality.complete).toBe(true);
    expect(path?.quality.fallback).toBe(false);
    expect(path?.vertices).toHaveLength(6);
  });
});
