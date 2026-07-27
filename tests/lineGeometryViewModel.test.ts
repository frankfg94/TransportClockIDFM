import { describe, expect, it } from "vitest";
import { createGeographicViewport } from "../src/features/network-ghost";
import {
  applyResolvedLineGeometry,
  createLineGeometryRequestFromParts,
} from "../src/features/line-map/lineGeometryViewModel";
import type { LineGeometryResolution } from "../src/features/line-map/lineGeometry";
import type { LineMapViewModel } from "../src/features/line-map/types";

describe("resolved line geometry view model", () => {
  it("requests bus geometry edge by edge so timetable variants keep their GTFS shapes", () => {
    const stops = [
      createStop("A", 2.3, 48.8, 0.1, 0.2),
      createStop("B", 2.31, 48.81, 0.4, 0.4),
      createStop("C", 2.32, 48.82, 0.7, 0.6),
      createStop("D", 2.33, 48.83, 0.9, 0.8),
    ];

    expect(
      createLineGeometryRequestFromParts(
        { id: "line:IDFM:C01073", label: "21" },
        stops,
        [
          { id: "outbound", label: "Outbound", stopIds: ["A", "B", "C"] },
          { id: "inbound-variant", label: "Inbound", stopIds: ["C", "B", "A", "D"] },
        ],
        true,
      )?.branches,
    ).toEqual([
      { id: "A--B", stopIds: ["A", "B"] },
      { id: "B--C", stopIds: ["B", "C"] },
      { id: "A--D", stopIds: ["A", "D"] },
    ]);
  });

  it("anchors stop dots and connected segment endpoints to the same trace point", () => {
    const viewport = createGeographicViewport(
      [
        { lon: 2.3, lat: 48.8 },
        { lon: 2.31, lat: 48.81 },
      ],
      { viewBoxWidth: 1080, viewBoxHeight: 620, paddingX: 78, paddingY: 68 },
    )!;
    const map: LineMapViewModel = {
      lineId: "line:test",
      lineLabel: "Test",
      lineColor: "#123456",
      textColor: "#ffffff",
      viewport,
      geometrySource: "direct",
      geometryAttempts: [{ source: "direct", status: "success" }],
      entrances: [],
      tiles: [],
      stops: [createStop("A", 2.3, 48.8, 0.2, 0.3), createStop("B", 2.31, 48.81, 0.8, 0.7)],
      branches: [{ id: "main", label: "Main", stopIds: ["A", "B"] }],
      segments: [{ id: "A--B", fromStopId: "A", toStopId: "B" }],
    };
    const resolution: LineGeometryResolution = {
      schemaVersion: 1,
      source: "gtfs",
      datasetVersion: "fixture",
      generatedAt: "2026-07-23T12:00:00.000Z",
      stops: [
        { id: "A", lon: 2.3, lat: 48.8 },
        { id: "B", lon: 2.31, lat: 48.81 },
      ],
      branches: [{ id: "main", stopIds: ["A", "B"] }],
      segments: [
        {
          id: "A--B",
          fromStopId: "A",
          toStopId: "B",
          coordinates: [
            { lon: 2.3004, lat: 48.8002 },
            { lon: 2.305, lat: 48.806 },
            { lon: 2.3096, lat: 48.8098 },
          ],
        },
      ],
      entrances: [],
      attempts: [{ source: "gtfs", status: "success" }],
    };

    const resolved = applyResolvedLineGeometry(map, resolution);
    const points = resolved.segments[0].polyline!;

    expect(resolved.stops[0]).toMatchObject(points[0]);
    expect(resolved.stops[1]).toMatchObject(points.at(-1)!);
    expect(resolved.stops[0].lon).toBe(2.3);
    expect(resolved.stops[0].lat).toBe(48.8);
  });

  it("does not attach an unmatched nearby entrance to a stop", () => {
    const viewport = createGeographicViewport(
      [
        { lon: 2.3, lat: 48.8 },
        { lon: 2.31, lat: 48.81 },
      ],
      { viewBoxWidth: 1080, viewBoxHeight: 620, paddingX: 78, paddingY: 68 },
    )!;
    const map: LineMapViewModel = {
      lineId: "line:test",
      lineLabel: "Test",
      lineColor: "#123456",
      textColor: "#ffffff",
      viewport,
      geometrySource: "direct",
      geometryAttempts: [{ source: "direct", status: "success" }],
      entrances: [],
      tiles: [],
      stops: [createStop("A", 2.3, 48.8, 0.2, 0.3), createStop("B", 2.31, 48.81, 0.8, 0.7)],
      branches: [{ id: "main", label: "Main", stopIds: ["A", "B"] }],
      segments: [{ id: "A--B", fromStopId: "A", toStopId: "B" }],
    };
    const resolution: LineGeometryResolution = {
      schemaVersion: 1,
      source: "gtfs",
      generatedAt: "2026-07-23T12:00:00.000Z",
      stops: [
        { id: "A", lon: 2.3, lat: 48.8 },
        { id: "B", lon: 2.31, lat: 48.81 },
      ],
      branches: [{ id: "main", stopIds: ["A", "B"] }],
      segments: [
        {
          id: "A--B",
          fromStopId: "A",
          toStopId: "B",
          coordinates: [
            { lon: 2.3, lat: 48.8 },
            { lon: 2.31, lat: 48.81 },
          ],
        },
      ],
      entrances: [
        {
          id: "nearby-other-station",
          parentStopId: "OTHER",
          name: "Other station",
          lon: 2.30001,
          lat: 48.80001,
        },
      ],
      attempts: [{ source: "gtfs", status: "success" }],
    };

    expect(applyResolvedLineGeometry(map, resolution).entrances[0].parentStopId).toBe("OTHER");
  });

  it("projects stops onto provider-owned GTFS traces", () => {
    const viewport = createGeographicViewport(
      [
        { lon: 2.3, lat: 48.8 },
        { lon: 2.31, lat: 48.81 },
      ],
      { viewBoxWidth: 1080, viewBoxHeight: 620, paddingX: 78, paddingY: 68 },
    )!;
    const map: LineMapViewModel = {
      lineId: "line:IDFM:C01073",
      lineLabel: "21",
      lineColor: "#8bdc4b",
      textColor: "#000000",
      viewport,
      geometrySource: "direct",
      geometryAttempts: [{ source: "direct", status: "success" }],
      entrances: [],
      tiles: [],
      stops: [createStop("A", 2.3, 48.8, 0.25, 0.45), createStop("B", 2.31, 48.81, 0.75, 0.55)],
      branches: [{ id: "main", label: "Main", stopIds: ["A", "B"] }],
      segments: [{ id: "A--B", fromStopId: "A", toStopId: "B" }],
    };
    const resolution: LineGeometryResolution = {
      schemaVersion: 1,
      source: "gtfs",
      topology: "provider",
      generatedAt: "2026-07-23T12:00:00.000Z",
      stops: [
        { id: "trace:start", lon: 2.3, lat: 48.8 },
        { id: "trace:end", lon: 2.31, lat: 48.81 },
      ],
      branches: [{ id: "trace", stopIds: ["trace:start", "trace:end"] }],
      segments: [
        {
          id: "trace",
          fromStopId: "trace:start",
          toStopId: "trace:end",
          coordinates: [
            { lon: 2.3, lat: 48.8 },
            { lon: 2.31, lat: 48.81 },
          ],
        },
      ],
      entrances: [],
      attempts: [{ source: "gtfs", status: "success" }],
    };

    const resolved = applyResolvedLineGeometry(map, resolution);
    const [from, to] = resolved.segments[0].polyline!;
    resolved.stops.forEach((stop) => {
      const crossProduct =
        (stop.x - from.x) * (to.y - from.y) - (stop.y - from.y) * (to.x - from.x);
      expect(Math.abs(crossProduct)).toBeLessThan(0.000001);
    });
  });
});

function createStop(id: string, lon: number, lat: number, x: number, y: number) {
  return {
    id,
    label: `Station ${id}`,
    lon,
    lat,
    x,
    y,
    routeIds: ["main"],
    routeLabels: ["Main"],
    station: { id, label: `Station ${id}`, lon, lat, monitoringRef: `stop:${id}` },
  };
}
