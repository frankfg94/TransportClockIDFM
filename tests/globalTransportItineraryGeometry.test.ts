import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createGlobalTransportItinerarySegments,
  clipGlobalTransportItineraryLine,
  resolveGlobalTransportItineraryLine,
  getGlobalTransportItineraryBounds,
} from "../src/features/line-map/globalTransportItineraryGeometry";
import { resolveGlobalMapVertex, type GlobalMapLine, type GlobalMapPath } from "../src/features/transport-map/contracts/manifest";
import { lonLatToWorld, worldToLonLat } from "../src/features/transport-map/geo/coordinateKernel";
import { selectPreferredLinePaths } from "../src/features/transport-map/data/pathPrecedence";
import { GlobalMapAssetLoader } from "../src/features/transport-map/data/assetLoader";
import { TransportMapDataSource } from "../src/features/transport-map/data/createTransportMapDataSource";
import { createCamera } from "../src/features/transport-map/geo/camera";

const origin = { lon: 2.2, lat: 48.8 };
const tramStop = { lon: 2.21, lat: 48.801 };
const rerStop = { lon: 2.24, lat: 48.82 };
const destination = { lon: 2.25, lat: 48.821 };

describe("global transport itinerary geometry", () => {
  it("keeps transit geometry and reuses the dotted walking sections", () => {
    const segments = createGlobalTransportItinerarySegments(
      {
        id: "journey:t10-rer-b",
        sections: [
          {
            type: "street_network",
            mode: "walking",
            durationSeconds: 300,
            fromPoint: origin,
            toPoint: tramStop,
            geometry: [origin, { lon: 2.205, lat: 48.8005 }, tramStop],
          },
          {
            type: "public_transport",
            mode: "tram",
            lineMode: "TRAM",
            lineCode: "T10",
            lineColor: "#f59e0b",
            durationSeconds: 600,
            fromPoint: tramStop,
            toPoint: rerStop,
            geometry: [tramStop, { lon: 2.22, lat: 48.81 }, rerStop],
          },
          {
            type: "public_transport",
            mode: "rer",
            lineMode: "RER",
            lineCode: "B",
            lineColor: "#5b2c83",
            durationSeconds: 900,
            fromPoint: rerStop,
            toPoint: destination,
            geometry: [rerStop, destination],
          },
        ],
      },
      origin,
      destination,
    );

    expect(segments.map((segment) => segment.kind)).toEqual(["walking", "transit", "transit"]);
    expect(segments[0]?.coordinates).toEqual([
      origin,
      { lon: 2.205, lat: 48.8005 },
      tramStop,
    ]);
    expect(segments[1]?.color).toBe("#f59e0b");
    expect(segments[2]?.lineCode).toBe("B");

    const bounds = getGlobalTransportItineraryBounds(segments, [origin, destination]);
    expect(bounds?.minX).toBeLessThan(bounds?.maxX ?? 0);
    expect(bounds?.minY).toBeLessThan(bounds?.maxY ?? 0);
  });

  it("ignores non-transport sections without inventing a map segment", () => {
    const segments = createGlobalTransportItinerarySegments(
      {
        id: "journey:wait",
        sections: [
          { type: "waiting", mode: "waiting", durationSeconds: 30, fromPoint: origin, toPoint: tramStop },
          { type: "public_transport", lineMode: "TRAM", lineCode: "T10", durationSeconds: 300, fromPoint: tramStop, toPoint: destination },
        ],
      },
      origin,
      destination,
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe("transit");
  });

  it("starts the final dotted walk at the selected exit", () => {
    const fastestExit = { lon: 2.245, lat: 48.818 };
    const route = {
      id: "journey:exit",
      sections: [
        {
          type: "public_transport",
          mode: "tram",
          lineMode: "TRAM" as const,
          lineCode: "T10",
          durationSeconds: 600,
          fromPoint: origin,
          toPoint: rerStop,
        },
        {
          type: "street_network",
          mode: "walking",
          durationSeconds: 300,
          fromPoint: rerStop,
          toPoint: destination,
        },
      ],
    };

    const segments = createGlobalTransportItinerarySegments(route, origin, destination, {
      resolveFinalTransitExitPoint: () => fastestExit,
    });

    expect(segments.find((segment) => segment.kind === "walking")?.coordinates).toEqual([
      fastestExit,
      destination,
    ]);
  });

  it("starts a transfer dotted walk at the selected exit", () => {
    const transferStop = { lon: 2.23, lat: 48.815 };
    const fastestExit = { lon: 2.225, lat: 48.814 };
    const route = {
      id: "journey:transfer-exit",
      sections: [
        {
          type: "public_transport",
          mode: "tram",
          lineMode: "TRAM" as const,
          lineCode: "T10",
          durationSeconds: 600,
          fromPoint: origin,
          toPoint: rerStop,
        },
        {
          type: "street_network",
          mode: "walking",
          durationSeconds: 240,
          fromPoint: rerStop,
          toPoint: transferStop,
        },
        {
          type: "public_transport",
          mode: "rer",
          lineMode: "RER" as const,
          lineCode: "B",
          durationSeconds: 900,
          fromPoint: transferStop,
          toPoint: destination,
        },
      ],
    };

    const segments = createGlobalTransportItinerarySegments(route, origin, destination, {
      resolveTransitExitPoint: (section, target) => {
        expect(section.lineCode).toBe("T10");
        expect(target).toEqual(transferStop);
        return fastestExit;
      },
    });

    expect(segments.find((segment) => segment.kind === "walking")?.coordinates).toEqual([
      fastestExit,
      transferStop,
    ]);
  });

  it.each(["gtfs", "official-open-data"] as const)("keeps the normal map's %s vertices across tile boundaries, in both directions", (source) => {
    const points = [origin, tramStop, rerStop, destination];
    const vertices = points.map((point, index) => ({
      ...lonLatToWorld(point),
      ...(index === 0 ? { stationId: "from" } : index === 3 ? { stationId: "to" } : {}),
    }));
    const paths = [makePath("first", vertices.slice(0, 3), source), makePath("second", vertices.slice(2), source)];
    const preferred = selectPreferredLinePaths(paths, [makePath("regional", [vertices[0]!, vertices[3]!], source)], line.id);
    const coordinates = clipGlobalTransportItineraryLine(preferred, line, new Map(), { durationSeconds: 60 }, origin, destination);
    expect(coordinates).toEqual(vertices.map(worldToLonLat));
    expect(clipGlobalTransportItineraryLine(preferred, line, new Map(), { durationSeconds: 60 }, destination, origin))
      .toEqual([...coordinates!].reverse());
  });

  it("does not replace a disconnected map subpath with a straight journey connector", () => {
    const path = makePath("split", [
      { ...lonLatToWorld(origin), stationId: "from" }, lonLatToWorld(tramStop),
      lonLatToWorld(rerStop), { ...lonLatToWorld(destination), stationId: "to" },
    ]);
    path.subpathStarts = [0, 2];
    const section = { durationSeconds: 60, lineId: line.id, fromPoint: origin, toPoint: destination, geometry: [origin, destination] };
    expect(createGlobalTransportItinerarySegments({ id: "route", sections: [section] }, origin, destination, {
      resolveTransitGeometry: () => clipGlobalTransportItineraryLine([path], line, new Map(), section, origin, destination),
    })).toEqual([]);
  });

  it("resolves line identity generically and refuses an ambiguous display code", () => {
    const section = { durationSeconds: 60, lineCode: line.code, lineMode: line.mode };
    expect(resolveGlobalTransportItineraryLine(section, [line])).toBe(line);
    expect(resolveGlobalTransportItineraryLine(section, [line, { ...line, id: "other" }])).toBeUndefined();
    expect(resolveGlobalTransportItineraryLine({ ...section, lineId: "other" }, [line, { ...line, id: "other" }])?.id).toBe("other");
  });

  it("uses the actual detailed map vertices for Herblay–Saint-Lazare instead of the regional LOD", async () => {
    const source = new TransportMapDataSource({
      maxChunkConcurrency: 1,
      loader: new GlobalMapAssetLoader({ fetcher: async (input) => {
        const asset = String(input).split("/global-map/v1/")[1];
        return asset ? new Response(readFileSync(resolve("public/data/global-map/v1", asset))) : new Response(null, { status: 404 });
      } }),
    });
    try {
      await source.initialize();
      const section = { durationSeconds: 900, lineCode: "J", lineMode: "TRANSILIEN" as const };
      const mapLine = resolveGlobalTransportItineraryLine(section, source.getNetwork().lines)!;
      const detailed = await source.queryViewport(createCamera({ zoom: 14.2 }), 0, 1, mapLine.id, [mapLine.id]);
      const network = source.getNetwork();
      const from = network.stations.find((station) => station.name === "Herblay" && station.lineIds.includes(mapLine.id))!;
      const to = network.stations.find((station) => station.name === "Gare Saint-Lazare" && station.lineIds.includes(mapLine.id))!;
      const paths = selectPreferredLinePaths(detailed.paths, network.regionalPaths, mapLine.id);
      const clipped = clipGlobalTransportItineraryLine(paths, mapLine, network.stationsById, section, from, to)!;
      const regional = clipGlobalTransportItineraryLine(network.regionalPaths, mapLine, network.stationsById, section, from, to)!;
      expect(clipped.length).toBeGreaterThan(regional.length * 3);
      const normalMapPoints = new Set(paths.flatMap((path) => path.vertices.map((vertex) => JSON.stringify(worldToLonLat(
        resolveGlobalMapVertex(path, vertex, vertex.stationId ? network.stationsById.get(vertex.stationId) : undefined, mapLine.mode),
      )))));
      expect(clipped.every((point) => normalMapPoints.has(JSON.stringify(point)))).toBe(true);
      expect(clipped[0]?.lon).toBeCloseTo(from.lon, 6);
      expect(clipped.at(-1)?.lon).toBeCloseTo(to.lon, 6);
    } finally {
      source.dispose();
    }
  }, 30_000);
});

const line: GlobalMapLine = { id: "line:test", index: 0, code: "X", label: "X", mode: "METRO", color: "#000000", textColor: "#ffffff", aliases: [], stationIds: [], geometryIds: [] };

function makePath(id: string, vertices: GlobalMapPath["vertices"], source: GlobalMapPath["geometrySource"] = "gtfs"): GlobalMapPath {
  return {
    id, lineId: line.id, geometrySource: source, sourceVersion: "test",
    quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
    stationIds: vertices.flatMap((vertex) => vertex.stationId ? [vertex.stationId] : []), vertices,
    minX: 0, minY: 0, maxX: 1, maxY: 1, chunkIds: [],
  };
}
