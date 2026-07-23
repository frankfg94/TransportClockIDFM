import { describe, expect, it } from "vitest";
import {
  applyNetworkGhostGeometry,
  createGeographicViewport,
  createNetworkGhostGeometryRequest,
  type NetworkGhostLineView,
} from "../src/features/network-ghost";
import type { LineGeometryResolution } from "../src/features/line-map/lineGeometry";

const line: NetworkGhostLineView = {
  id: "line:IDFM:C01085",
  label: "42",
  mode: "Bus",
  color: "#f5d547",
  textColor: "#111827",
  isBus: true,
  anchorStationId: "a",
  anchorX: 0.2,
  anchorY: 0.4,
  geometrySource: "direct",
  geometryAttempts: [{ source: "direct", status: "success" }],
  loadOrder: 0,
  stations: [
    { id: "a", label: "Alpha", lon: 2.3, lat: 48.8, x: 0.2, y: 0.4 },
    { id: "b", label: "Beta", lon: 2.31, lat: 48.81, x: 0.8, y: 0.6 },
  ],
  segments: [
    {
      id: "a-b",
      fromStationId: "a",
      toStationId: "b",
      fromX: 0.2,
      fromY: 0.4,
      toX: 0.8,
      toY: 0.6,
      level: 0,
    },
  ],
};

describe("network ghost geometry", () => {
  it("requests every ghost edge with the normalized IDFM line id", () => {
    expect(
      createNetworkGhostGeometryRequest(
        line,
        { id: "bus:42", ref: "line:IDFM:C01085", label: "42", family: "BUS" },
        true,
      ),
    ).toMatchObject({
      lineId: "line:IDFM:C01085",
      useGtfs: true,
      branches: [{ id: "a-b", stopIds: ["a", "b"] }],
    });
  });

  it("uses complete topology branches instead of selecting a shape edge by edge", () => {
    expect(
      createNetworkGhostGeometryRequest(
        {
          ...line,
          branches: [{ id: "complete", stopIds: ["a", "b"] }],
        },
        { id: "bus:42", ref: "line:IDFM:C01085", label: "42", family: "BUS" },
        true,
      ),
    ).toMatchObject({
      branches: [{ id: "complete", stopIds: ["a", "b"] }],
    });
  });

  it("applies a complete GTFS polyline without changing ghost topology", () => {
    const viewport = createGeographicViewport(line.stations, {
      viewBoxWidth: 1080,
      viewBoxHeight: 620,
      paddingX: 78,
      paddingY: 68,
    })!;
    const resolution: LineGeometryResolution = {
      schemaVersion: 1,
      source: "gtfs",
      datasetVersion: "2026-07-23",
      generatedAt: "2026-07-23T12:00:00.000Z",
      stops: line.stations.map(({ id, label, lon, lat }) => ({
        id,
        label,
        lon: lon!,
        lat: lat!,
      })),
      branches: [{ id: "a-b", stopIds: ["a", "b"] }],
      segments: [
        {
          id: "a--b",
          fromStopId: "a",
          toStopId: "b",
          coordinates: [
            { lon: 2.3003, lat: 48.8002 },
            { lon: 2.305, lat: 48.807 },
            { lon: 2.3097, lat: 48.8098 },
          ],
        },
      ],
      entrances: [
        {
          id: "exit:a:1",
          parentStopId: "a",
          name: "r. de Test",
          code: "1",
          lon: 2.3001,
          lat: 48.8001,
        },
        {
          id: "exit:nearby-but-unrelated",
          parentStopId: "another-stop-place",
          name: "Nearby station",
          lon: 2.3001,
          lat: 48.8001,
        },
      ],
      attempts: [{ source: "gtfs", status: "success" }],
    };

    const resolved = applyNetworkGhostGeometry(line, resolution, viewport);

    expect(resolved.geometrySource).toBe("gtfs");
    expect(resolved.geometryAttempts).toEqual([{ source: "gtfs", status: "success" }]);
    expect(resolved.segments[0].polyline).toHaveLength(3);
    expect(resolved.segments[0]).toMatchObject({ id: "a-b", level: 0 });
    expect(resolved.stations[0]).toMatchObject(resolved.segments[0].polyline![0]);
    expect(resolved.stations[1]).toMatchObject(resolved.segments[0].polyline!.at(-1)!);
    expect(resolved.entrances).toEqual([
      expect.objectContaining({
        id: "exit:a:1",
        parentStationId: "a",
        name: "r. de Test",
        code: "1",
      }),
      expect.objectContaining({
        id: "exit:nearby-but-unrelated",
        parentStationId: "another-stop-place",
      }),
    ]);
  });

  it("replaces stale direct topology with provider-owned trace segments", () => {
    const viewport = createGeographicViewport(line.stations, {
      viewBoxWidth: 1080,
      viewBoxHeight: 620,
      paddingX: 78,
      paddingY: 68,
    })!;
    const resolution: LineGeometryResolution = {
      schemaVersion: 1,
      source: "gtfs",
      topology: "provider",
      generatedAt: "2026-07-23T12:00:00.000Z",
      stops: [
        { id: "provider-trace:0:start", lon: 2.3, lat: 48.8 },
        { id: "provider-trace:0:end", lon: 2.31, lat: 48.81 },
      ],
      branches: [
        {
          id: "provider-trace:0",
          stopIds: ["provider-trace:0:start", "provider-trace:0:end"],
        },
      ],
      segments: [
        {
          id: "provider-trace:0",
          fromStopId: "provider-trace:0:start",
          toStopId: "provider-trace:0:end",
          coordinates: [
            { lon: 2.3, lat: 48.8 },
            { lon: 2.305, lat: 48.807 },
            { lon: 2.31, lat: 48.81 },
          ],
        },
      ],
      entrances: [],
      attempts: [{ source: "gtfs", status: "success" }],
    };

    const resolved = applyNetworkGhostGeometry(line, resolution, viewport);

    expect(resolved.segments).toHaveLength(1);
    expect(resolved.segments[0]).toMatchObject({
      id: "provider-trace:0",
      fromStationId: "provider-trace:0:start",
      toStationId: "provider-trace:0:end",
    });
    expect(resolved.segments[0].polyline).toHaveLength(3);
  });
});
