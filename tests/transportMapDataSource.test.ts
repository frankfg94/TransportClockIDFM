import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GlobalMapAssetLoader } from "../src/features/transport-map/data/assetLoader";
import {
  breakIncompleteGtfsConnectors,
  TransportMapDataSource,
} from "../src/features/transport-map/data/createTransportMapDataSource";
import { selectPreferredLinePaths } from "../src/features/transport-map/data/pathPrecedence";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../src/features/transport-map/config/globalTransportPlanConfig";
import { GLOBAL_MAP_MODE_ORDER, resolveGlobalMapVertex } from "../src/features/transport-map/contracts/manifest";
import { createCamera, fitCameraToBounds } from "../src/features/transport-map/geo/camera";
import { lonLatToWorld, worldToLonLat } from "../src/features/transport-map/geo/coordinateKernel";
import { buildStationCorrespondenceContext } from "../src/features/transport-map/spatial/stationCorrespondences";

const assetRoot = resolve(process.cwd(), "public/data/global-map/v1");

function createLocalAssetLoader(
  beforeAsset?: (asset: string) => Promise<void> | void,
): GlobalMapAssetLoader {
  return new GlobalMapAssetLoader({
    fetcher: async (input: RequestInfo | URL) => {
      const asset = String(input).split("/global-map/v1/")[1];
      if (!asset) return new Response(null, { status: 404 });
      await beforeAsset?.(asset);
      try {
        return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
      } catch {
        return new Response(null, { status: 404 });
      }
    },
  });
}

describe("global transport progressive data source", () => {
  it("does not repopulate the source when disposed during manifest loading", async () => {
    let releaseManifest!: () => void;
    let manifestRequested = false;
    const manifestGate = new Promise<void>((resolveGate) => {
      releaseManifest = resolveGate;
    });
    const loader = createLocalAssetLoader(async (asset) => {
      if (asset === "manifest.json") {
        manifestRequested = true;
        await manifestGate;
      }
    });
    const source = new TransportMapDataSource({ loader });
    const initializing = source.initialize();

    await Promise.resolve();
    expect(manifestRequested).toBe(true);
    source.dispose();
    releaseManifest();

    await expect(initializing).rejects.toMatchObject({ name: "AbortError" });
    expect(source.metrics()).toMatchObject({ manifestLoaded: false, catalogLoaded: false });
    expect(() => source.getNetwork()).toThrow("not initialized");
  }, 30_000);

  it("does not commit bootstrap data when disposed during bootstrap loading", async () => {
    let releaseBootstrap!: () => void;
    let markBootstrapStarted!: () => void;
    const bootstrapGate = new Promise<void>((resolveGate) => {
      releaseBootstrap = resolveGate;
    });
    const bootstrapStarted = new Promise<void>((resolveStarted) => {
      markBootstrapStarted = resolveStarted;
    });
    const loader = createLocalAssetLoader(async (asset) => {
      if (asset === "bootstrap.json") {
        markBootstrapStarted();
        await bootstrapGate;
      }
    });
    const source = new TransportMapDataSource({ loader });
    const initializing = source.initialize();

    await bootstrapStarted;
    source.dispose();
    releaseBootstrap();

    await expect(initializing).rejects.toMatchObject({ name: "AbortError" });
    expect(source.metrics()).toMatchObject({ manifestLoaded: false, catalogLoaded: false });
    expect(() => source.getNetwork()).toThrow("not initialized");
  }, 30_000);

  it("does not commit catalog data when disposed during catalog loading", async () => {
    let releaseCatalog!: () => void;
    let catalogRequested = false;
    const catalogGate = new Promise<void>((resolveGate) => {
      releaseCatalog = resolveGate;
    });
    const loader = createLocalAssetLoader(async (asset) => {
      if (asset === "catalog.json") {
        catalogRequested = true;
        await catalogGate;
      }
    });
    const source = new TransportMapDataSource({ loader });

    await source.initialize();
    const ensuringCatalog = source.ensureCatalog();
    await Promise.resolve();
    expect(catalogRequested).toBe(true);
    source.dispose();
    releaseCatalog();

    await expect(ensuringCatalog).rejects.toMatchObject({ name: "AbortError" });
    expect(source.metrics()).toMatchObject({ manifestLoaded: false, catalogLoaded: false });
    expect(() => source.getNetwork()).toThrow("not initialized");
  }, 30_000);

  it("uses the detailed default LOD for TER before the general LOD2 zoom band", async () => {
    const loader = new GlobalMapAssetLoader({
      fetcher: async (input: RequestInfo | URL) => {
        const asset = String(input).split("/global-map/v1/")[1];
        if (!asset) return new Response(null, { status: 404 });
        try {
          return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    });
    const source = new TransportMapDataSource({ loader, maxChunkConcurrency: 1 });

    await source.initialize();
    const center = lonLatToWorld({ lon: 2.2, lat: 48.98 });
    const result = await source.queryViewport(
      createCamera({
        centerWorldX: center.x,
        centerWorldY: center.y,
        zoom: 11.5,
        viewportWidthCssPx: 1_600,
        viewportHeightCssPx: 1_000,
      }),
      (1 << 7) - 1,
      1,
    );

    const trainPaths = result.paths.filter((path) => {
      const line = source.getNetwork().linesById.get(path.lineId);
      return line?.mode === "TRAIN" && line.label === "TER" && path.lodVertices?.["1"];
    });
    expect(trainPaths.length).toBeGreaterThan(0);
    expect(trainPaths.some((path) => path.vertices.length > path.lodVertices!["1"]!.length)).toBe(
      true,
    );
    source.dispose();
  }, 30_000);

  it("keeps Transilien J provider geometry visible across the global zoom bands", async () => {
    const loader = new GlobalMapAssetLoader({
      fetcher: async (input: RequestInfo | URL) => {
        const asset = String(input).split("/global-map/v1/")[1];
        if (!asset) return new Response(null, { status: 404 });
        try {
          return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    });
    const source = new TransportMapDataSource({ loader, maxChunkConcurrency: 1 });
    const center = lonLatToWorld({ lon: 2.2, lat: 48.98 });

    await source.initialize();
    for (const zoom of [8.5, 10.2, 11.5, 14.5]) {
      const result = await source.queryViewport(
        createCamera({
          centerWorldX: center.x,
          centerWorldY: center.y,
          zoom,
          viewportWidthCssPx: 1_600,
          viewportHeightCssPx: 1_000,
        }),
        1 << 4,
        zoom,
      );
      const jPaths = result.paths.filter((path) => path.lineId === "line:IDFM:C01739");
      expect(jPaths.length, `Transilien J should be visible at zoom ${zoom}`).toBeGreaterThan(0);
      expect(jPaths.every((path) => ["gtfs", "official-open-data"].includes(path.geometrySource))).toBe(true);
      if (zoom === 11.5) {
        expect(
          jPaths.some((path) => path.vertices.length > (path.lodVertices?.["1"]?.length ?? 0)),
        ).toBe(true);
      }
    }
    source.dispose();
  }, 60_000);

  it("keeps Transilien P and N nodes and station segments identical across focused zooms", async () => {
    const loader = new GlobalMapAssetLoader({
      fetcher: async (input: RequestInfo | URL) => {
        const asset = String(input).split("/global-map/v1/")[1];
        if (!asset) return new Response(null, { status: 404 });
        try {
          return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    });
    const source = new TransportMapDataSource({ loader, maxChunkConcurrency: 1 });

    await source.initialize();
    const network = await source.ensureCatalog();
    for (const [lineIndex, lineId] of ["line:IDFM:C01730", "line:IDFM:C01736"].entries()) {
      const line = network.linesById.get(lineId);
      expect(line).toBeDefined();
      const stations = line!.stationIds
        .map((stationId) => network.stationsById.get(stationId))
        .filter((station): station is NonNullable<typeof station> => Boolean(station));
      const bounds = {
        minX: Math.min(...stations.map((station) => station.worldX)),
        minY: Math.min(...stations.map((station) => station.worldY)),
        maxX: Math.max(...stations.map((station) => station.worldX)),
        maxY: Math.max(...stations.map((station) => station.worldY)),
      };
      const centerWorldX = (bounds.minX + bounds.maxX) / 2;
      const centerWorldY = (bounds.minY + bounds.maxY) / 2;
      const signatures: string[] = [];

      for (const [zoomIndex, zoom] of [8.5, 10.3, 12, 16].entries()) {
        const generation = lineIndex * 10 + zoomIndex + 1;
        const result = await source.queryViewport(
          createCamera({
            centerWorldX,
            centerWorldY,
            zoom,
            viewportWidthCssPx: 1_600,
            viewportHeightCssPx: 1_000,
            generation,
          }),
          1 << 4,
          generation,
          line!.id,
        );
        const linePaths = result.paths.filter((path) => path.lineId === line!.id);
        expect(linePaths, `${line!.label} should be present at zoom ${zoom}`).not.toHaveLength(0);
        expect(linePaths.every((path) => ["gtfs", "official-open-data"].includes(path.geometrySource))).toBe(true);
        expect(
          linePaths.some((path) => path.vertices.length > (path.lodVertices?.["1"]?.length ?? 0)),
        ).toBe(true);

        const nodes = [...new Set(linePaths.flatMap((path) => path.stationIds))].sort();
        const segments = linePaths
          .flatMap((path) =>
            path.stationIds.slice(1).map((stationId, index) => {
              const previous = path.stationIds[index];
              return previous && previous !== stationId
                ? [previous, stationId].sort().join("--")
                : undefined;
            }),
          )
          .filter((segment): segment is string => Boolean(segment))
          .sort();
        signatures.push(JSON.stringify({ nodes, segments }));
      }

      expect(new Set(signatures), `${line!.label} topology changed with zoom`).toHaveLength(1);
    }
    source.dispose();
  }, 60_000);

  it("breaks an incomplete Transilien J connector without hiding nearby valid GTFS fragments", async () => {
    const loader = new GlobalMapAssetLoader({
      fetcher: async (input: RequestInfo | URL) => {
        const asset = String(input).split("/global-map/v1/")[1];
        if (!asset) return new Response(null, { status: 404 });
        try {
          return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    });
    const source = new TransportMapDataSource({ loader, maxChunkConcurrency: 1 });
    await source.initialize();

    const result = await source.queryViewport(
      createCamera({
        centerWorldX: (0.5048828125 + 0.50537109375) / 2,
        centerWorldY: (0.343435210903557 + 0.34357805367560024) / 2,
        zoom: 16.9,
        viewportWidthCssPx: 1_264.8,
        viewportHeightCssPx: 632.4,
      }),
      1 << 4,
      1,
    );

    const connectorPath = result.paths.find(
      (path) =>
        path.lineId === "line:IDFM:C01739" &&
        path.sourceVersion.includes("topology-edge-connectors"),
    );
    expect(connectorPath).toBeDefined();
    expect(connectorPath).toMatchObject({
      geometrySource: "gtfs",
      quality: { complete: false, fallback: false },
    });
    expect(connectorPath!.vertices.length).toBeGreaterThan(2);

    const syntheticConnector = breakIncompleteGtfsConnectors({
      ...connectorPath!,
      id: "path:synthetic-incomplete-connector",
      vertices: [
        { x: 0, y: 0 },
        { x: 0.1, y: 0.1, stationId: "station:a" },
        { x: 0.2, y: 0.2, stationId: "station:b" },
        { x: 0.3, y: 0.3 },
      ],
      subpathStarts: undefined,
    });
    expect(syntheticConnector.subpathStarts).toContain(2);

    const poissyResult = await source.queryViewport(
      createCamera({
        centerWorldX: (0.5054780626 + 0.5058059077) / 2,
        centerWorldY: (0.3435910186 + 0.3437549411) / 2,
        zoom: 14.6,
        viewportWidthCssPx: 2_040,
        viewportHeightCssPx: 900,
      }),
      1 << 4,
      2,
    );
    const poissyFragment = poissyResult.paths.find(
      (path) =>
        path.lineId === "line:IDFM:C01739" &&
        path.sourceVersion.includes("topology-edge-connectors") &&
        path.vertices.length > 100,
    );
    expect(poissyFragment).toBeDefined();
    source.dispose();
  }, 60_000);

  it("boots from two global assets and promotes to cached chunks without line requests", async () => {
    const calls: string[] = [];
    const loader = new GlobalMapAssetLoader({
      fetcher: async (input: RequestInfo | URL) => {
        const asset = String(input).split("/global-map/v1/")[1];
        if (!asset) return new Response(null, { status: 404 });
        calls.push(asset);
        try {
          return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    });
    const source = new TransportMapDataSource({ loader, maxChunkConcurrency: 1 });
    const world = lonLatToWorld({ lon: 2.3522, lat: 48.8566 });
    const mask = (1 << 7) - 1;

    await source.initialize();
    const regional = await source.queryViewport(
      createCamera({
        centerWorldX: world.x,
        centerWorldY: world.y,
        zoom: 8,
        viewportWidthCssPx: 1280,
        viewportHeightCssPx: 720,
      }),
      mask,
      1,
    );
    expect(calls).toEqual(["manifest.json", "bootstrap.json", "regional.json"]);
    expect(
      regional.paths.some((path) => path.geometrySource === "gtfs" && path.vertices.length > 2),
    ).toBe(true);

    const regionalWithBus = await source.queryViewport(
      createCamera({
        centerWorldX: world.x,
        centerWorldY: world.y,
        zoom: 9,
        viewportWidthCssPx: 1280,
        viewportHeightCssPx: 720,
      }),
      mask,
      1.5,
    );
    expect(calls).toContain("regional-bus.json");
    const busLineIds = new Set(
      source
        .getNetwork()
        .lines.filter((line) => line.mode === "BUS")
        .map((line) => line.id),
    );
    expect(regionalWithBus.paths.some((path) => busLineIds.has(path.lineId))).toBe(true);

    const detailedCamera = createCamera({
      centerWorldX: world.x,
      centerWorldY: world.y,
      zoom: 13.5,
      viewportWidthCssPx: 1280,
      viewportHeightCssPx: 720,
    });
    const firstDetailed = await source.queryViewport(detailedCamera, mask, 2);
    expect(calls.some((asset) => asset === "catalog.json")).toBe(true);
    expect(calls.some((asset) => asset.startsWith("chunks/"))).toBe(true);
    expect(calls.some((asset) => asset.includes("/lines/") || asset.startsWith("lines/"))).toBe(
      false,
    );
    expect(firstDetailed.fromCache).toBe(false);

    const nearby = await source.queryStationsWithinRadius(2.3522, 48.8566, 1_000);
    expect(nearby.length).toBeGreaterThan(0);
    expect(nearby[0]!.distanceMeters).toBeLessThanOrEqual(nearby.at(-1)!.distanceMeters);

    const secondDetailed = await source.queryViewport(
      { ...detailedCamera, generation: 3 },
      mask,
      3,
    );
    expect(secondDetailed.fromCache).toBe(true);
    expect(source.metrics().cache.cache.entries).toBeGreaterThan(0);
    source.dispose();
  }, 30_000);

  it("promotes Saint-Sulpice line 70 from regional LOD to detailed GTFS chunks at every urban zoom", async () => {
    const loader = new GlobalMapAssetLoader({
      fetcher: async (input: RequestInfo | URL) => {
        const asset = String(input).split("/global-map/v1/")[1];
        if (!asset) return new Response(null, { status: 404 });
        try {
          return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    });
    const source = new TransportMapDataSource({
      loader,
      maxChunkConcurrency: 2,
      useRegionalOverview: true,
    });
    const saintSulpice = lonLatToWorld({ lon: 2.333445094991793, lat: 48.851323373650345 });
    const busMask = 1 << GLOBAL_MAP_MODE_ORDER.indexOf("BUS");

    await source.initialize();
    const regional = await source.queryViewport(
      createCamera({
        centerWorldX: saintSulpice.x,
        centerWorldY: saintSulpice.y,
        zoom: 8,
        viewportWidthCssPx: 1_280,
        viewportHeightCssPx: 720,
      }),
      busMask,
      1,
    );
    const regionalLine70 = regional.paths.filter((path) => path.lineId === "line:IDFM:C01106");
    expect(regionalLine70.length).toBeGreaterThan(0);
    expect(regionalLine70.every((path) => path.id.startsWith("path:regional:"))).toBe(true);
    expect(regionalLine70.some((path) => path.vertices.length > 2)).toBe(true);
    expect(regionalLine70.every((path) => path.subpathStarts?.[0] === 0)).toBe(true);

    for (const [index, zoom] of [11, 12, 13, 14, 16, 18].entries()) {
      const detailed = await source.queryViewport(
        createCamera({
          centerWorldX: saintSulpice.x,
          centerWorldY: saintSulpice.y,
          zoom,
          viewportWidthCssPx: 1_280,
          viewportHeightCssPx: 720,
        }),
        busMask,
        index + 2,
      );
      const line70Paths = detailed.paths.filter((path) => path.lineId === "line:IDFM:C01106");
      expect(line70Paths.length, `line 70 at zoom ${zoom}`).toBeGreaterThan(0);
      expect(detailed.chunkIds.length, `chunks at zoom ${zoom}`).toBeGreaterThan(0);
      expect(line70Paths.every((path) => !path.id.startsWith("path:regional:"))).toBe(true);
      expect(line70Paths.every((path) => path.geometrySource === "gtfs")).toBe(true);
      expect(line70Paths.every((path) => !path.sourceVersion.includes("regional"))).toBe(true);
      expect(line70Paths.some((path) => path.vertices.length > (path.lodVertices?.["1"]?.length ?? 0))).toBe(true);
      expect(line70Paths.every((path) => path.geometrySource !== "netex-schematic-fallback")).toBe(true);
    }
    source.dispose();
  }, 60_000);

  it("hides unvalidated road fallback at detailed zoom, even for a focused edge", async () => {
    const loader = new GlobalMapAssetLoader({
      fetcher: async (input: RequestInfo | URL) => {
        const asset = String(input).split("/global-map/v1/")[1];
        if (!asset) return new Response(null, { status: 404 });
        try {
          return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    });
    const source = new TransportMapDataSource({ loader, maxChunkConcurrency: 1 });

    await source.initialize();
    const overview = await source.queryViewport(
      createCamera({
        centerWorldX: 0.5065,
        centerWorldY: 0.3445,
        zoom: 9,
        viewportWidthCssPx: 1_600,
        viewportHeightCssPx: 1_000,
      }),
      (1 << 9) - 1,
      1,
    );
    const lineById = source.getNetwork().linesById;
    const fallback = overview.paths.find((path) => {
      const line = lineById.get(path.lineId);
      return (
        path.geometrySource === "netex-schematic-fallback" &&
        (line?.mode === "BUS" || line?.mode === "NOCTILIEN")
      );
    });
    expect(fallback).toBeDefined();
    const center = fallback!.vertices.at(-1)!;
    const detailed = await source.queryViewport(
      createCamera({
        centerWorldX: center.x,
        centerWorldY: center.y,
        zoom: 20,
        viewportWidthCssPx: 1280,
        viewportHeightCssPx: 720,
      }),
      1 << 7,
      1,
      fallback!.lineId,
    );

    expect(detailed.paths.some((path) => path.geometrySource === "netex-schematic-fallback")).toBe(
      false,
    );
    source.dispose();
  }, 30_000);

  it("removes the 389 schematic detour from the unfocused detailed viewport", async () => {
    const loader = new GlobalMapAssetLoader({
      fetcher: async (input: RequestInfo | URL) => {
        const asset = String(input).split("/global-map/v1/")[1];
        if (!asset) return new Response(null, { status: 404 });
        try {
          return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    });
    const source = new TransportMapDataSource({ loader, maxChunkConcurrency: 1 });
    const lineId = "line:IDFM:C01315";
    const camera = createCamera({
      centerWorldX: 0.50621,
      centerWorldY: 0.34413,
      zoom: GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.fallbackLineMinZoom,
      viewportWidthCssPx: 1_280,
      viewportHeightCssPx: 720,
    });

    await source.initialize();
    const detailed = await source.queryViewport(camera, 1 << 7, 1);

    expect(
      detailed.paths.some(
        (path) => path.lineId === lineId && path.geometrySource === "netex-schematic-fallback",
      ),
    ).toBe(false);
    source.dispose();
  }, 30_000);

  it("loads forced correspondence lines without rendering every line of their mode", async () => {
    const loader = new GlobalMapAssetLoader({
      fetcher: async (input: RequestInfo | URL) => {
        const asset = String(input).split("/global-map/v1/")[1];
        if (!asset) return new Response(null, { status: 404 });
        try {
          return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    });
    const source = new TransportMapDataSource({ loader, maxChunkConcurrency: 1 });
    const world = lonLatToWorld({ lon: 2.3522, lat: 48.8566 });
    const camera = createCamera({
      centerWorldX: world.x,
      centerWorldY: world.y,
      zoom: 8,
      viewportWidthCssPx: 1280,
      viewportHeightCssPx: 720,
    });

    await source.initialize();
    const visible = await source.queryViewport(camera, (1 << 7) - 1, 1);
    const lineById = source.getNetwork().linesById;
    const forcedPath = visible.paths.find((path) => lineById.get(path.lineId)?.mode !== "BUS");
    expect(forcedPath).toBeDefined();
    const forcedLine = lineById.get(forcedPath!.lineId);
    expect(forcedLine).toBeDefined();
    const sameModePath = visible.paths.find(
      (path) =>
        path.lineId !== forcedPath!.lineId && lineById.get(path.lineId)?.mode === forcedLine!.mode,
    );
    expect(sameModePath).toBeDefined();

    const focused = await source.queryViewport(camera, 0, 2, undefined, [forcedPath!.lineId]);

    expect(focused.paths.length).toBeGreaterThan(0);
    expect(focused.paths.every((path) => path.lineId === forcedPath!.lineId)).toBe(true);

    const focusedWithDetailLine = await source.queryViewport(camera, 0, 3, forcedPath!.lineId, [
      sameModePath!.lineId,
    ]);
    const focusedLineIds = new Set([forcedPath!.lineId, sameModePath!.lineId]);
    expect(focusedWithDetailLine.paths.some((path) => path.lineId === forcedPath!.lineId)).toBe(
      true,
    );
    expect(focusedWithDetailLine.paths.some((path) => path.lineId === sameModePath!.lineId)).toBe(
      true,
    );
    expect(focusedWithDetailLine.paths.every((path) => focusedLineIds.has(path.lineId))).toBe(true);
    source.dispose();
  }, 30_000);

  it("renders forced Bus correspondences at the extra-wide global LOD", async () => {
    const calls: string[] = [];
    const loader = new GlobalMapAssetLoader({
      fetcher: async (input: RequestInfo | URL) => {
        const asset = String(input).split("/global-map/v1/")[1];
        if (!asset) return new Response(null, { status: 404 });
        calls.push(asset);
        try {
          return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    });
    const source = new TransportMapDataSource({ loader, maxChunkConcurrency: 1 });
    const station = lonLatToWorld({ lon: 2.306, lat: 48.763 });
    const busLineId = "line:IDFM:C00342";
    const noctilienLineId = "line:IDFM:C01418";

    await source.initialize();
    const result = await source.queryViewport(
      createCamera({
        centerWorldX: station.x,
        centerWorldY: station.y,
        zoom: 8,
        viewportWidthCssPx: 1_400,
        viewportHeightCssPx: 900,
      }),
      0,
      1,
      "line:IDFM:C02528",
      [busLineId, noctilienLineId],
    );

    expect(calls).toContain("catalog.json");
    expect(calls.some((asset) => asset.startsWith("chunks/"))).toBe(true);
    expect(result.paths.some((path) => path.lineId === busLineId)).toBe(true);
    expect(result.paths.some((path) => path.lineId === noctilienLineId)).toBe(true);
    expect(
      result.paths.every(
        (path) =>
          path.lineId === "line:IDFM:C02528" ||
          path.lineId === busLineId ||
          path.lineId === noctilienLineId,
      ),
    ).toBe(true);
    const ghostGtfsPath = result.paths.find(
      (path) => path.lineId === busLineId && path.geometrySource === "gtfs",
    );
    expect(ghostGtfsPath).toBeDefined();
    expect(ghostGtfsPath?.sourceVersion).not.toContain("regional");
    source.dispose();
  }, 30_000);

  it("keeps the detailed GTFS bridge trace for Saint-Lazare line 27 correspondences", async () => {
    const loader = new GlobalMapAssetLoader({
      fetcher: async (input: RequestInfo | URL) => {
        const asset = String(input).split("/global-map/v1/")[1];
        if (!asset) return new Response(null, { status: 404 });
        try {
          return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    });
    const source = new TransportMapDataSource({
      loader,
      maxChunkConcurrency: 2,
      decodedChunkCacheMaxEntries: 96,
      decodedChunkCacheMaxBytes: 96 * 1024 * 1024,
    });

    await source.initialize();
    const network = await source.ensureCatalog();
    const saintLazare = network.stationsById.get("station:FR::Quay:50150063:FR1");
    expect(saintLazare).toBeDefined();
    const nearby = await source.queryStationsWithinRadius(
      saintLazare!.lon,
      saintLazare!.lat,
      GLOBAL_TRANSPORT_PLAN_CONFIG.connections.radiusMeters,
    );
    const correspondence = buildStationCorrespondenceContext(
      [saintLazare!],
      nearby,
      network.linesById,
    );
    const forcedLineIds = correspondence.lines
      .filter((line) => line.mode !== "NOCTILIEN")
      .map((line) => line.id);
    const louvre = lonLatToWorld({ lon: 2.335, lat: 48.86 });
    const result = await source.queryViewport(
      createCamera({
        centerWorldX: louvre.x,
        centerWorldY: louvre.y,
        zoom: 16.7,
        viewportWidthCssPx: 1_016,
        viewportHeightCssPx: 767,
      }),
      (1 << 9) - 1,
      1,
      "line:IDFM:C01383",
      forcedLineIds,
    );

    const line27Id = "line:IDFM:C01077";
    const preferred = selectPreferredLinePaths(
      result.paths,
      source.getNetwork().regionalPaths,
      line27Id,
    );
    expect(preferred.length).toBeGreaterThan(0);
    expect(preferred.every((path) => path.geometrySource === "gtfs")).toBe(true);
    expect(
      preferred.every(
        (path) =>
          !path.id.startsWith("path:regional:") &&
          !path.sourceVersion.toLowerCase().includes("regional"),
      ),
    ).toBe(true);

    const riverVertices = (paths: typeof preferred) =>
      paths.map((path) =>
        path.vertices
          .map((vertex) => worldToLonLat(vertex))
          .filter(
            ({ lon, lat }) =>
              lon >= 2.325 && lon <= 2.345 && lat >= 48.854 && lat <= 48.864,
          ),
      );
    const detailedRiverVertices = riverVertices(preferred);
    const regionalRiverVertices = riverVertices(
      source.getNetwork().regionalPaths.filter((path) => path.lineId === line27Id),
    );
    expect(Math.max(...detailedRiverVertices.map((vertices) => vertices.length))).toBeGreaterThan(40);
    expect(Math.max(...regionalRiverVertices.map((vertices) => vertices.length))).toBeLessThanOrEqual(5);
    const detailedCoordinates = detailedRiverVertices.flat();
    expect(
      detailedCoordinates.some(
        ({ lon, lat }) => Math.abs(lon - 2.332623) < 0.00015 && Math.abs(lat - 48.858711) < 0.00015,
      ),
    ).toBe(true);
    expect(
      detailedCoordinates.some(
        ({ lon, lat }) => Math.abs(lon - 2.333356) < 0.00015 && Math.abs(lat - 48.860107) < 0.00015,
      ),
    ).toBe(true);
    source.dispose();
  }, 30_000);

  it("narrows detailed chunks to the focused line corridor and mode", async () => {
    const calls: string[] = [];
    const loader = new GlobalMapAssetLoader({
      fetcher: async (input: RequestInfo | URL) => {
        const asset = String(input).split("/global-map/v1/")[1];
        if (!asset) return new Response(null, { status: 404 });
        calls.push(asset);
        try {
          return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    });
    const source = new TransportMapDataSource({ loader, maxChunkConcurrency: 1 });

    await source.initialize();
    const network = await source.ensureCatalog();
    const line = network.linesById.get("line:IDFM:C01743");
    expect(line).toBeDefined();
    const stations = line!.stationIds
      .map((stationId) => network.stationsById.get(stationId))
      .filter((station): station is NonNullable<typeof station> => Boolean(station));
    const lineBounds = {
      minX: Math.min(...stations.map((station) => station.worldX)),
      minY: Math.min(...stations.map((station) => station.worldY)),
      maxX: Math.max(...stations.map((station) => station.worldX)),
      maxY: Math.max(...stations.map((station) => station.worldY)),
    };
    const camera = fitCameraToBounds(
      createCamera({ viewportWidthCssPx: 1_280, viewportHeightCssPx: 720 }),
      lineBounds,
      64,
      11,
      17,
    );

    const detailed = await source.queryViewport(camera, (1 << 7) - 1, 1, line!.id);
    const chunkCalls = calls.filter((asset) => asset.startsWith("chunks/"));

    expect(chunkCalls.length).toBeGreaterThan(0);
    // The focused-line invariant loads the complete GTFS corridor, which can
    // add one boundary chunk beyond the previous viewport-only budget.
    expect(chunkCalls.length).toBeLessThanOrEqual(12);
    expect(chunkCalls.every((asset) => asset.endsWith("-core.json"))).toBe(true);
    expect(detailed.paths.every((path) => path.lineId === line!.id)).toBe(true);
    source.dispose();
  }, 30_000);

  it("keeps direct Noctilien correspondences loaded across the focused-line corridor", async () => {
    const loader = new GlobalMapAssetLoader({
      fetcher: async (input: RequestInfo | URL) => {
        const asset = String(input).split("/global-map/v1/")[1];
        if (!asset) return new Response(null, { status: 404 });
        try {
          return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    });
    const source = new TransportMapDataSource({ loader, maxChunkConcurrency: 1 });
    const cameraCenter = lonLatToWorld({ lon: 2.31, lat: 48.82 });
    const camera = createCamera({
      centerWorldX: cameraCenter.x,
      centerWorldY: cameraCenter.y,
      zoom: 11.5,
      viewportWidthCssPx: 1_400,
      viewportHeightCssPx: 900,
    });
    const noctilienIds = ["line:IDFM:C01403", "line:IDFM:C01418", "line:IDFM:C02659"];

    await source.initialize();
    const detailed = await source.queryViewport(
      camera,
      (1 << 9) - 1,
      1,
      "line:IDFM:C02528",
      noctilienIds,
    );

    const lineById = source.getNetwork().linesById;
    for (const lineId of noctilienIds) {
      const linePaths = detailed.paths.filter((path) => path.lineId === lineId);
      expect(linePaths.length, lineById.get(lineId)?.code).toBeGreaterThan(0);
    }

    const n14Paths = detailed.paths.filter((path) => path.lineId === "line:IDFM:C01418");
    const parisWorld = lonLatToWorld({ lon: 2.35, lat: 48.88 });
    expect(
      n14Paths.some((path) =>
        path.vertices.some(
          (vertex) => Math.hypot(vertex.x - parisWorld.x, vertex.y - parisWorld.y) < 0.0002,
        ),
      ),
    ).toBe(true);
    expect(
      detailed.paths.every(
        (path) => path.lineId === "line:IDFM:C02528" || noctilienIds.includes(path.lineId),
      ),
    ).toBe(true);
    source.dispose();
  }, 30_000);

  it("loads the focused T6 GTFS trace at the configured detail zoom", async () => {
    const loader = new GlobalMapAssetLoader({
      fetcher: async (input: RequestInfo | URL) => {
        const asset = String(input).split("/global-map/v1/")[1];
        if (!asset) return new Response(null, { status: 404 });
        try {
          return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    });
    const source = new TransportMapDataSource({ loader, maxChunkConcurrency: 1 });

    await source.initialize();
    const network = await source.ensureCatalog();
    const line = network.linesById.get("line:IDFM:C01794");
    expect(line).toBeDefined();
    const stations = line!.stationIds
      .map((stationId) => network.stationsById.get(stationId))
      .filter((station): station is NonNullable<typeof station> => Boolean(station));
    const centerWorldX =
      (Math.min(...stations.map((station) => station.worldX)) +
        Math.max(...stations.map((station) => station.worldX))) /
      2;
    const centerWorldY =
      (Math.min(...stations.map((station) => station.worldY)) +
        Math.max(...stations.map((station) => station.worldY))) /
      2;

    const result = await source.queryViewport(
      createCamera({
        centerWorldX,
        centerWorldY,
        zoom: GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.detailLineMinZoom,
        viewportWidthCssPx: 1_600,
        viewportHeightCssPx: 1_000,
      }),
      (1 << 9) - 1,
      1,
      line!.id,
    );

    expect(result.paths.length).toBeGreaterThan(0);
    expect(result.paths.every((path) => path.lineId === line!.id)).toBe(true);
    expect(result.paths.some((path) => path.geometrySource === "gtfs")).toBe(true);
    expect(result.paths.every((path) => path.geometrySource === "gtfs")).toBe(true);
    const chatillonPath = result.paths.find((path) =>
      path.stationIds.includes("station:FR::Quay:50149051:FR1"),
    );
    expect(chatillonPath).toBeDefined();
    expect(chatillonPath?.sourceVersion).toContain("v3-adaptive-provider-endpoint-connectors");
    const chatillonVertex = chatillonPath?.vertices.find(
      (vertex) => vertex.stationId === "station:FR::Quay:50149051:FR1",
    );
    expect(chatillonVertex).toBeDefined();
    const chatillonRenderAnchor = resolveGlobalMapVertex(chatillonPath!, chatillonVertex!);
    expect(
      Math.hypot(
        (chatillonRenderAnchor.x - chatillonVertex!.x) * 40_075_016.6856,
        (chatillonRenderAnchor.y - chatillonVertex!.y) * 40_075_016.6856,
      ),
    ).toBeLessThan(0.25);
    const chatillonProviderEndpoint = chatillonPath!.vertices.find(
      (vertex) => !vertex.stationId && vertex !== chatillonVertex,
    );
    expect(chatillonProviderEndpoint).toBeDefined();
    expect(
      Math.hypot(
        (chatillonProviderEndpoint!.x - chatillonVertex!.x) * 40_075_016.6856,
        (chatillonProviderEndpoint!.y - chatillonVertex!.y) * 40_075_016.6856,
      ),
    ).toBeGreaterThan(
      GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.maxContinuousGtfsEndpointAlignmentMeters,
    );
    source.dispose();
  }, 30_000);
});
