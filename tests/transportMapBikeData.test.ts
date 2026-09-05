import { describe, expect, it } from "vitest";
import { GlobalMapAssetLoader } from "../src/features/transport-map/data/assetLoader";
import { TransportMapDataSource } from "../src/features/transport-map/data/createTransportMapDataSource";
import {
  GLOBAL_MAP_MODE_ORDER,
  type GlobalMapBootstrap,
  type GlobalMapManifest,
  type GlobalMapRegionalPayloadV2,
} from "../src/features/transport-map/contracts/manifest";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { lonLatToWorld } from "../src/features/transport-map/geo/coordinateKernel";

describe("global map optional Bike layer", () => {
  it("does not fetch regional-bike at startup and loads it only after BIKE is selected", async () => {
    const first = lonLatToWorld({ lon: 2, lat: 48 });
    const second = lonLatToWorld({ lon: 2.1, lat: 48.1 });
    const dataVersion = "bike-fixture-v1";
    const hash = "a".repeat(64);
    const manifest: GlobalMapManifest = {
      schemaVersion: 1,
      minReaderVersion: 1,
      dataVersion,
      generatedAt: "2026-08-30T00:00:00.000Z",
      sourceVersions: { bikeNetworkSha256: hash },
      projection: {
        name: "WebMercatorNormalized",
        sourceCrs: "EPSG:2154",
        transformVersion: "lambert93-ntf-v1",
      },
      bounds: {
        minX: first.x,
        minY: first.y,
        maxX: second.x,
        maxY: second.y,
      },
      lod: [{ level: 0, minZoom: 0, maxZoom: 20, maxErrorMeters: 0.25 }],
      modes: ["BIKE"],
      files: {
        bootstrap: { asset: "bootstrap.json", bytes: 1, checksum: "fixture" },
        catalog: { asset: "catalog.json", bytes: 1, checksum: "fixture" },
        regional: { asset: "regional.json", bytes: 1, checksum: "fixture" },
        regionalBike: { asset: "regional-bike.json", bytes: 1, checksum: "fixture" },
        chunks: [],
        stationIndex: { schemaVersion: 1, kind: "stations", count: 0, bounds: { minX: first.x, minY: first.y, maxX: second.x, maxY: second.y }, asset: "stations.json" },
        pathIndex: { schemaVersion: 1, kind: "paths", count: 1, bounds: { minX: first.x, minY: first.y, maxX: second.x, maxY: second.y }, asset: "paths.json" },
      },
      counts: { lines: 1, stations: 0, paths: 1, vertices: 2, chunks: 0, entrances: 0, bikes: 1 },
      warnings: [],
      compilation: { deterministic: true, hashAlgorithm: "sha256", quantizationMeters: 0, staticExternalRequests: 0 },
    };
    const bootstrap: GlobalMapBootstrap = {
      schemaVersion: 1,
      dataVersion,
      encoding: "rows-v1",
      lines: [["line:BIKE:prim", "BIKE", "Aménagements vélo en Île-de-France", "BIKE", "#15803d", "#ffffff", [], [0], null]],
      stations: [],
      paths: [],
    };
    const bikeRegional: GlobalMapRegionalPayloadV2 = {
      schemaVersion: 1,
      dataVersion,
      encoding: "rows-v2",
      paths: [[
        0,
        5,
        [],
        [[first.x, first.y], [second.x, second.y]],
        null,
        { subpathStarts: [0], quality: [true, false, 0, 0], sourceVersion: hash },
      ]],
    };
    const calls: string[] = [];
    const loader = new GlobalMapAssetLoader({
      fetcher: async (input: RequestInfo | URL) => {
        const asset = String(input).split("/data/global-map/v1/")[1] ?? "";
        calls.push(asset);
        if (asset === "manifest.json") return new Response(JSON.stringify(manifest));
        if (asset === "bootstrap.json") return new Response(JSON.stringify(bootstrap));
        if (asset === "regional.json") return new Response(JSON.stringify({
          schemaVersion: 1,
          dataVersion,
          encoding: "rows-v2",
          paths: [],
        }));
        if (asset === "regional-bike.json") return new Response(JSON.stringify(bikeRegional));
        return new Response(null, { status: 404 });
      },
    });
    const source = new TransportMapDataSource({ loader, maxChunkConcurrency: 1 });

    await source.initialize();
    expect(calls).toEqual(["manifest.json", "bootstrap.json"]);

    const camera = createCamera({
      centerWorldX: (first.x + second.x) / 2,
      centerWorldY: (first.y + second.y) / 2,
      zoom: 8,
      viewportWidthCssPx: 1_280,
      viewportHeightCssPx: 720,
    });
    await source.queryViewport(camera, 0, 1);
    expect(calls).toEqual(["manifest.json", "bootstrap.json", "regional.json"]);

    const bikeMask = 1 << GLOBAL_MAP_MODE_ORDER.indexOf("BIKE");
    const result = await source.queryViewport(camera, bikeMask, 2);
    expect(calls).toContain("regional-bike.json");
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]).toMatchObject({
      lineId: "line:BIKE:prim",
      geometrySource: "bike-source",
      stationIds: [],
      subpathStarts: [0],
    });
    source.dispose();
  });
});
