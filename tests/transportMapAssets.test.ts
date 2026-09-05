import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GlobalMapAssetLoader,
  assertRegionalPayload,
  decodeBootstrap,
  decodeRegionalPaths,
} from "../src/features/transport-map/data/assetLoader";
import {
  resolveGlobalMapVertex,
  type GlobalMapRegionalPayloadV2,
} from "../src/features/transport-map/contracts/manifest";
import { sourceToLonLat, worldToLonLat, lonLatToWorld } from "../src/features/transport-map/geo/coordinateKernel";
import { createTransportMapPerformanceTrace } from "../src/features/transport-map/performance/transportMapPerformanceTrace";

const assetRoot = resolve(process.cwd(), "public/data/global-map/v1");

function createLocalFetcher(calls: string[]) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    const asset = url.split("/global-map/v1/")[1];
    if (!asset) return new Response(null, { status: 404 });
    calls.push(asset);
    try {
      return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
    } catch {
      return new Response(null, { status: 404 });
    }
  };
}

describe("global transport static asset contract", () => {
  it("decodes rows-v2 subpaths and preserves regional quality provenance", async () => {
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher([]) });
    const manifest = await loader.loadManifest();
    const bootstrap = await loader.loadBootstrapPayload(manifest);
    const pathIndex = bootstrap.paths[0]?.[0];
    expect(pathIndex).toBeDefined();
    const payload = {
      schemaVersion: manifest.schemaVersion,
      dataVersion: manifest.dataVersion,
      encoding: "rows-v2",
      paths: [[
        pathIndex!,
        1,
        ["station:synthetic:a", "station:synthetic:b", "station:synthetic:c", "station:synthetic:d"],
        [[0, 0, 0], [1, 0, 1], [10, 0, 2], [11, 0, 3]],
        null,
        {
          subpathStarts: [0, 2],
          quality: [false, false, 42.5, 17.25],
          sourceVersion: "synthetic-rows-v2-subpaths",
        },
      ]],
    } satisfies GlobalMapRegionalPayloadV2;

    expect(assertRegionalPayload(payload, manifest)).toBe(payload);
    const [decoded] = decodeRegionalPaths(payload, bootstrap);
    expect(decoded).toMatchObject({
      geometrySource: "gtfs",
      sourceVersion: "synthetic-rows-v2-subpaths",
      quality: {
        complete: false,
        fallback: false,
        gapMeters: 42.5,
        stationDistanceMaxMeters: 17.25,
      },
      subpathStarts: [0, 2],
    });
    expect(() => assertRegionalPayload({
      ...payload,
      paths: [[
        ...payload.paths[0]!.slice(0, 5),
        { ...payload.paths[0]![5], subpathStarts: [0, 4] },
      ] as typeof payload.paths[number]],
    }, manifest)).toThrow(/metadata/);
  });

  it("keeps the manifest and regional bootstrap inside their budgets", async () => {
    const calls: string[] = [];
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher(calls) });
    const manifest = await loader.loadManifest();
    const bootstrap = await loader.loadBootstrapPayload(manifest);
    const regionalPayload = await loader.loadRegionalPayload(manifest);
    const regionalBusPayload = await loader.loadRegionalBusPayload(manifest);
    const regionalPaths = [
      ...(regionalPayload ? decodeRegionalPaths(regionalPayload, bootstrap) : []),
      ...(regionalBusPayload ? decodeRegionalPaths(regionalBusPayload, bootstrap) : []),
    ];

    expect(statSync(resolve(assetRoot, "manifest.json")).size).toBeLessThanOrEqual(250_000);
    expect(statSync(resolve(assetRoot, "bootstrap.json")).size).toBeLessThanOrEqual(2_000_000);
    expect(manifest.files.regional).toBeDefined();
    expect(manifest.files.regionalBus).toBeDefined();
    expect(regionalPaths.length).toBe(manifest.counts.paths);
    expect(regionalPaths.some((path) => path.geometrySource === "gtfs" && path.vertices.length > 2)).toBe(true);
    expect(manifest.files.chunks.every((chunk) => !("pathIds" in chunk))).toBe(true);
    for (const mode of ["BUS", "METRO", "RER", "TRAIN", "TRANSILIEN", "TRAM", "CABLE", "NOCTILIEN"] as const) {
      expect(manifest.modes).toContain(mode);
    }
    expect(manifest.files.chunks.some((chunk) => chunk.modes?.length === 1 && chunk.modes[0] === "BUS")).toBe(true);
    expect(manifest.files.chunks.every((chunk) =>
      !chunk.modes?.includes("BUS") || chunk.modes.every((mode) => mode === "BUS" || mode === "NOCTILIEN"),
    )).toBe(true);
    expect(manifest.files.chunks.some((chunk) => !chunk.modes?.includes("BUS"))).toBe(true);
    expect(manifest.warnings).toContainEqual(expect.objectContaining({ code: "line-color-palette-missing", count: 2011 }));
    expect(manifest.palette).toMatchObject({ complete: false, entryCount: 0, missingCount: 2011 });
    expect(manifest.warnings.some((warning) => warning.code === "optional-source-unavailable" && warning.sample?.includes("BIKE"))).toBe(true);
    expect(bootstrap.stations.length).toBeGreaterThan(0);
    const lineLabels = Object.fromEntries(bootstrap.lines.map(([, code, label]) => [code, label]));
    expect(lineLabels["C01728"]).toBe("D");
    expect(lineLabels["C01729"]).toBe("E");
    expect(lineLabels["C01730"]).toBe("P");
    expect(lineLabels["C01731"]).toBe("R");
    expect(lineLabels["C01736"]).toBe("N");
    expect(lineLabels["C01737"]).toBe("H");
    expect(lineLabels["C01738"]).toBe("K");
    expect(lineLabels["C01739"]).toBe("J");
    expect(lineLabels["C01740"]).toBe("L");
    expect(lineLabels["C01741"]).toBe("U");
    expect(lineLabels["C01742"]).toBe("A");
    expect(lineLabels["C01743"]).toBe("B");
    expect(lineLabels["C02711"]).toBe("V");
    expect(calls).toEqual(["manifest.json", "bootstrap.json", "regional.json", "regional-bus.json"]);
  });

  it("traces chunk body consumption and JSON parsing separately", async () => {
    const trace = createTransportMapPerformanceTrace({ observeLongTasks: false });
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher([]), trace });
    const manifest = await loader.loadManifest();
    const descriptor = manifest.files.chunks[0];
    expect(descriptor).toBeDefined();

    trace.start({ scenario: "chunk-instrumentation" });
    await loader.loadChunk(manifest, descriptor!);
    const report = trace.stop();

    expect(report.events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "chunk_fetch",
      "chunk_response_body",
      "chunk_json_parse",
      "chunk_decode",
    ]));
    expect(report.events.find((event) => event.type === "chunk_response_body")?.metadata).toEqual(
      expect.objectContaining({ chunkId: descriptor!.id }),
    );
    expect(report.events.find((event) => event.type === "chunk_json_parse")?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("does not route Transilien P through Châtelet when a GTFS shape diverges", async () => {
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher([]) });
    const manifest = await loader.loadManifest();
    const bootstrap = await loader.loadBootstrapPayload(manifest);
    const regional = await loader.loadRegionalPayload(manifest);
    const regionalBus = await loader.loadRegionalBusPayload(manifest);
    const pPaths = [
      ...(regional ? decodeRegionalPaths(regional, bootstrap) : []),
      ...(regionalBus ? decodeRegionalPaths(regionalBus, bootstrap) : []),
    ].filter((path) => path.lineId === "line:IDFM:C01730");
    const nearestChateletMeters = Math.min(...pPaths.flatMap((path) =>
      path.vertices.map((vertex) => {
        const coordinate = worldToLonLat({ x: vertex.x, y: vertex.y });
        return haversineMeters(coordinate.lat, coordinate.lon, 48.861745, 2.3469765);
      }),
    ));

    expect(pPaths.length).toBeGreaterThan(0);
    expect(pPaths.some((path) => path.geometrySource === "official-open-data")).toBe(true);
    expect(nearestChateletMeters).toBeGreaterThan(1_000);
  });

  it("loads the complete local catalogue with transfers and entrances without line requests", async () => {
    const calls: string[] = [];
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher(calls) });
    const manifest = await loader.loadManifest();
    const bootstrapPayload = await loader.loadBootstrapPayload(manifest);
    const catalog = await loader.loadCatalog(manifest);
    const network = decodeBootstrap(bootstrapPayload, manifest, catalog);

    expect(catalog.stations.length).toBe(manifest.counts.stations);
    expect(catalog.entrances.length).toBe(manifest.counts.entrances);
    expect(network.lines.length).toBe(manifest.counts.lines);
    expect(network.entrances.length).toBeGreaterThan(0);
    expect(catalog.entrances.some((row) => Boolean(row[7]))).toBe(true);
    expect(network.entrances.some((entrance) => Boolean(entrance.code))).toBe(true);
    const chatillon = network.stations.find((station) =>
      station.id === "station:FR::Quay:50239724:FR1",
    );
    expect(chatillon).toBeDefined();
    const chatillonContextStationIds = new Set(network.stations
      .filter((station) => haversineMeters(chatillon!.lat, chatillon!.lon, station.lat, station.lon) <= 350)
      .map((station) => station.id));
    const chatillonEntrances = network.entrances.filter((entrance) =>
      chatillonContextStationIds.has(entrance.stationId),
    );
    expect(chatillonEntrances.map((entrance) => entrance.id).sort()).toEqual([
      "IDFM:StopPlaceEntrance:50148468",
      "IDFM:StopPlaceEntrance:50148469",
    ].sort());
    expect(network.stations.some((station) => station.lineIds.length > 1)).toBe(true);
    expect(calls.filter((asset) => asset.includes("/lines/")).length).toBe(0);
  }, 15_000);

  it("embeds Metro 4 with the V1 GTFS projection pipeline", async () => {
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher([]) });
    const manifest = await loader.loadManifest();
    const bootstrap = await loader.loadBootstrapPayload(manifest);
    const regional = await loader.loadRegionalPayload(manifest);
    const metro4Paths = regional
      ? decodeRegionalPaths(regional, bootstrap).filter((path) => path.lineId === "line:IDFM:C01374")
      : [];

    expect(metro4Paths).toHaveLength(1);
    expect(metro4Paths[0]).toMatchObject({
      geometrySource: "gtfs",
      quality: { complete: true, fallback: false },
    });
    expect(metro4Paths[0]?.stationIds).toHaveLength(29);
    expect(metro4Paths[0]?.vertices.length).toBeGreaterThan(20);
    expect(metro4Paths[0]?.renderStationAnchors).toHaveLength(29);

    const catalog = await loader.loadCatalog(manifest);
    const cite = catalog.stations.find((row) => row[0].includes("50026461"));
    const citeAnchor = metro4Paths[0]?.renderStationAnchors?.find((anchor) => anchor.stationId === cite?.[0]);
    expect(cite).toBeDefined();
    expect(citeAnchor).toBeDefined();
    const citeVertex = metro4Paths[0]?.vertices.find((vertex) => vertex.stationId === cite![0]);
    expect(citeVertex).toMatchObject({ x: cite![7], y: cite![8] });
    expect(resolveGlobalMapVertex(metro4Paths[0]!, citeVertex!)).toMatchObject(citeAnchor!);
    expect(Math.hypot(citeAnchor!.x - cite![7], citeAnchor!.y - cite![8]) * 40_075_016.68557849).toBeLessThanOrEqual(0.25);
  });

  it("keeps a topology-matched GTFS alias on the current regional pack", async () => {
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher([]) });
    const manifest = await loader.loadManifest();
    const bootstrap = await loader.loadBootstrapPayload(manifest);
    const regional = await loader.loadRegionalPayload(manifest);
    const regionalBus = await loader.loadRegionalBusPayload(manifest);
    const aliasedPaths = [
      ...(regional ? decodeRegionalPaths(regional, bootstrap) : []),
      ...(regionalBus ? decodeRegionalPaths(regionalBus, bootstrap) : []),
    ].filter((path) => path.lineId === "line:IDFM:C01683");

    expect(manifest.warnings).toContainEqual(expect.objectContaining({
      code: "gtfs-line-alias",
      sample: expect.arrayContaining(["C01683->IDFM:C01843"]),
    }));
    expect(aliasedPaths.length).toBeGreaterThan(0);
    expect(aliasedPaths.every((path) => path.geometrySource === "gtfs")).toBe(true);
    expect(aliasedPaths.every((path) => path.quality.complete && !path.quality.fallback)).toBe(true);
    expect(aliasedPaths.every((path) => path.quality.stationDistanceMaxMeters <= 300)).toBe(true);
    expect(aliasedPaths.every((path) => path.vertices.length >= 2)).toBe(true);
    expect(aliasedPaths.some((path) => path.vertices.length > 2)).toBe(true);
  });

  it("keeps Noctilien N21 on complete provider edges without schematic water-crossing chords", async () => {
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher([]) });
    const manifest = await loader.loadManifest();
    const bootstrap = await loader.loadBootstrapPayload(manifest);
    const regional = await loader.loadRegionalPayload(manifest);
    const regionalBus = await loader.loadRegionalBusPayload(manifest);
    const n21Paths = [
      ...(regional ? decodeRegionalPaths(regional, bootstrap) : []),
      ...(regionalBus ? decodeRegionalPaths(regionalBus, bootstrap) : []),
    ].filter((path) => path.lineId === "line:IDFM:C01401");

    expect(n21Paths.length).toBeGreaterThan(0);
    expect(n21Paths.every((path) => ["gtfs", "official-open-data"].includes(path.geometrySource))).toBe(true);
    expect(n21Paths.every((path) => path.quality.complete && !path.quality.fallback)).toBe(true);
    expect(n21Paths.every((path) => path.quality.stationDistanceMaxMeters <= 300)).toBe(true);
    expect(n21Paths.some((path) => path.vertices.length > 2)).toBe(true);
  });

  it("keeps bus 6281 on complete precompiled geometry", async () => {
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher([]) });
    const manifest = await loader.loadManifest();
    const bootstrap = await loader.loadBootstrapPayload(manifest);
    const regionalBus = await loader.loadRegionalBusPayload(manifest);
    const paths = regionalBus
      ? decodeRegionalPaths(regionalBus, bootstrap).filter((path) => path.lineId === "line:IDFM:C00327")
      : [];

    expect(paths).toHaveLength(29);
    expect(paths.every((path) => ["gtfs", "official-open-data", "mixed"].includes(path.geometrySource))).toBe(true);
    expect(paths.every((path) => path.quality.complete && !path.quality.fallback)).toBe(true);
    expect(paths.some((path) => path.vertices.length > 2)).toBe(true);
    expect(paths.every((path) => (path.renderStationAnchors?.length ?? 0) > 0)).toBe(true);
  });

  it("keeps the two clipped T1 fragments disjoint inside its tile", async () => {
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher([]) });
    const manifest = await loader.loadManifest();
    const bootstrap = await loader.loadBootstrapPayload(manifest);
    const regional = await loader.loadRegionalPayload(manifest);
    const descriptor = manifest.files.chunks.find((chunk) => chunk.id === "z11-1037-704-core");
    expect(descriptor).toBeDefined();

    const payload = await loader.loadChunk(manifest, descriptor!);
    const t1Path = payload.paths.find((path) => path.lineId === "line:IDFM:C01389");
    expect(t1Path).toBeDefined();
    expect(t1Path!.subpathStarts?.length).toBeGreaterThan(1);
    expect(t1Path!.subpathStarts?.[0]).toBe(0);
    expect(t1Path!.subpathStarts?.[1]).toBeLessThan(t1Path!.vertices.length);
    expect(t1Path!.lodSubpathStarts?.["1"]?.length).toBe(t1Path!.subpathStarts?.length);
    expect(t1Path!.lodSubpathStarts?.["1"]?.[0]).toBe(0);
    expect(t1Path!.lodSubpathStarts?.["1"]?.[1]).toBeLessThan(t1Path!.lodVertices?.["1"]?.length ?? 0);

    const regionalT1Path = regional
      ? decodeRegionalPaths(regional, bootstrap).find((path) => path.lineId === "line:IDFM:C01389")
      : undefined;
    expect(regionalT1Path).toMatchObject({
      quality: { complete: true, fallback: false },
    });
    expect(["gtfs", "official-open-data", "mixed"]).toContain(regionalT1Path?.geometrySource);
    expect(regionalT1Path?.vertices.length).toBeGreaterThan(20);
  });

  it("keeps N15 and the split bus routes on precompiled GTFS geometry", async () => {
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher([]) });
    const manifest = await loader.loadManifest();
    const bootstrap = await loader.loadBootstrapPayload(manifest);
    const regional = await loader.loadRegionalPayload(manifest);
    const regionalBus = await loader.loadRegionalBusPayload(manifest);
    const paths = [
      ...(regional ? decodeRegionalPaths(regional, bootstrap) : []),
      ...(regionalBus ? decodeRegionalPaths(regionalBus, bootstrap) : []),
    ];
    const expected = new Map([
      ["line:IDFM:C01417", "N15"],
      ["line:IDFM:C01103", "67"],
      ["line:IDFM:C01105", "69"],
      ["line:IDFM:C01107", "72"],
      ["line:IDFM:C01127", "96"],
    ]);

    for (const [lineId, label] of expected) {
      const linePaths = paths.filter((path) => path.lineId === lineId);
      expect(linePaths.length, label).toBeGreaterThan(0);
      expect(linePaths.every((path) => path.geometrySource === "gtfs"), label).toBe(true);
      expect(linePaths.some((path) => path.vertices.length > 2), label).toBe(true);
    }
  });

  it("refuses a manifest with a newer reader or transform", async () => {
    const loader = new GlobalMapAssetLoader({
      fetcher: async () => new Response(JSON.stringify({
        schemaVersion: 1,
        minReaderVersion: 99,
        projection: { transformVersion: "lambert93-ntf-v1" },
      }), { status: 200 }),
    });
    await expect(loader.loadManifest()).rejects.toThrow(/reader/);
  });

  it("uses the GTFS colors packed in the global-map bootstrap", async () => {
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher([]) });
    const manifest = await loader.loadManifest();
    const bootstrap = await loader.loadBootstrapPayload(manifest);
    const network = decodeBootstrap(bootstrap, manifest);

    expect(network.linesById.get("line:IDFM:C01742")).toMatchObject({ color: "#eb2132", textColor: "#ffffff" });
    expect(network.linesById.get("line:IDFM:C01729")).toMatchObject({ color: "#b94e9a", textColor: "#ffffff" });
    expect(network.linesById.get("line:IDFM:C01730")).toMatchObject({ color: "#f58f53", textColor: "#000000" });
    expect(network.linesById.get("line:IDFM:C01374")).toMatchObject({ color: "#a0006e", textColor: "#ffffff" });
  });

  it("preserves packed station references and supports legacy twelve-column stations", async () => {
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher([]) });
    const manifest = await loader.loadManifest();
    const bootstrap = await loader.loadBootstrapPayload(manifest);
    const catalog = await loader.loadCatalog(manifest);
    const houilles = catalog.stations.find((row) => row[12]?.includes("64741"))!;
    expect(houilles).toBeDefined();
    const network = decodeBootstrap(bootstrap, manifest, catalog);
    expect(network.stations.find((station) => station.id === houilles[0])?.rawRefs).toContain("64741");
    const legacy = structuredClone(bootstrap);
    legacy.stations = legacy.stations.map((row) => row.slice(0, 12) as typeof row);
    const oldNetwork = decodeBootstrap(legacy, manifest);
    expect(oldNetwork.stations[0].rawRefs).toEqual([legacy.stations[0][0]]);
  });

  it("preserves the canonical station coordinate through serialization and world conversion", async () => {
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher([]) });
    const manifest = await loader.loadManifest();
    const catalog = await loader.loadCatalog(manifest);
    let maximumMeters = 0;
    for (const row of catalog.stations) {
      const [, , , sourceX, sourceY, lon, lat, worldX, worldY] = row;
      const transformed = sourceToLonLat({ x: sourceX, y: sourceY, srsName: "EPSG:2154" });
      maximumMeters = Math.max(maximumMeters, haversineMeters(transformed.lat, transformed.lon, lat, lon));
      const roundTrip = worldToLonLat(lonLatToWorld({ lon, lat }));
      maximumMeters = Math.max(maximumMeters, haversineMeters(roundTrip.lat, roundTrip.lon, lat, lon));
      expect(Math.abs(lonLatToWorld({ lon, lat }).x - worldX)).toBeLessThan(1e-12);
      expect(Math.abs(lonLatToWorld({ lon, lat }).y - worldY)).toBeLessThan(1e-12);
    }
    expect(maximumMeters).toBeLessThanOrEqual(0.05);
  });
});

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6_378_137;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const dPhi = (lat2 - lat1) * Math.PI / 180;
  const dLambda = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
