import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  GlobalMapAssetLoader,
  decodeBootstrap,
  decodeRegionalPaths,
} from "../src/features/transport-map/data/assetLoader";
import {
  getGlobalMapPathSubpathRanges,
  resolveGlobalMapVertex,
} from "../src/features/transport-map/contracts/manifest";
import type {
  GlobalMapLine,
  GlobalMapManifest,
  GlobalMapPath,
  GlobalMapStation,
} from "../src/features/transport-map/contracts/manifest";
import {
  filterPathsForGlobalBusDirection,
} from "../src/features/line-map/globalBusDirections";
import { selectPreferredLinePaths } from "../src/features/transport-map/data/pathPrecedence";

const assetRoot = resolve(process.cwd(), "public/data/global-map/v1");

const regressionLines = [
  ["412", "line:IDFM:C00342"],
  ["N22", "line:IDFM:C01407"],
  ["382", "line:IDFM:C02459"],
  ["4457", "line:IDFM:C01568"],
  ["6178", "line:IDFM:C00040"],
  ["2111", "line:IDFM:C00254"],
  ["2264", "line:IDFM:C00911"],
  ["P", "line:IDFM:C01730"],
] as const;

// This is the selected topology direction visible in the 2264 screenshot.
// Keeping the expected order in the regression test makes the assertion
// independent from the current order of the static line catalogue.
const bus2264Direction = [
  "station:FR::Quay:50164397:FR1",
  "station:FR::Quay:50164436:FR1",
  "station:FR::Quay:50103642:FR1",
  "station:FR::Quay:50164404:FR1",
  "station:FR::Quay:50164413:FR1",
  "station:FR::Quay:50211671:FR1",
  "station:FR::Quay:50164384:FR1",
  "station:FR::Quay:50164433:FR1",
  "station:FR::Quay:50164431:FR1",
  "station:FR::Quay:50164414:FR1",
  "station:FR::Quay:50164422:FR1",
  "station:FR::Quay:50164398:FR1",
  "station:FR::Quay:50165224:FR1",
  "station:FR::Quay:50164383:FR1",
  "station:FR::Quay:50102708:FR1",
  "station:FR::Quay:50102701:FR1",
  "station:FR::Quay:50102856:FR1",
  "station:FR::Quay:50164393:FR1",
  "station:FR::Quay:50019139:FR1",
  "station:FR::Quay:50019136:FR1",
] as const;

let linesById: Awaited<ReturnType<typeof decodeBootstrap>>["linesById"];
let stationsById: Awaited<ReturnType<typeof decodeBootstrap>>["stationsById"];
let manifest: GlobalMapManifest;
let regionalPaths: GlobalMapPath[];
let detailedPaths: GlobalMapPath[];
let line38DetailedPaths: GlobalMapPath[];

describe("global map line connectivity regressions", () => {
  beforeAll(async () => {
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher() });
    manifest = await loader.loadManifest();
    const bootstrap = await loader.loadBootstrapPayload(manifest);
    const catalog = await loader.loadCatalog(manifest);
    const regional = await loader.loadRegionalPayload(manifest);
    const regionalBus = await loader.loadRegionalBusPayload(manifest);
    const network = decodeBootstrap(bootstrap, manifest, catalog);

    linesById = network.linesById;
    stationsById = network.stationsById;
    regionalPaths = [
      ...(regional ? decodeRegionalPaths(regional, bootstrap) : []),
      ...(regionalBus ? decodeRegionalPaths(regionalBus, bootstrap) : []),
    ];

    const regressionLineIds = new Set<string>(regressionLines.map(([, lineId]) => lineId));
    const targetBounds = regressionLines
      .map(([, lineId]) => lineBounds(network.linesById.get(lineId)!, network.stationsById))
      .filter((bounds): bounds is Bounds => Boolean(bounds));
    const descriptors = manifest.files.chunks.filter((descriptor) =>
      targetBounds.some((bounds) => boundsIntersect(bounds, descriptor.bounds)),
    );
    const payloads = await Promise.all(
      descriptors.map((descriptor) => loader.loadChunk(manifest, descriptor)),
    );
    detailedPaths = payloads
      .flatMap((payload) => payload.paths)
      .filter((path) => regressionLineIds.has(path.lineId));

    const line38 = network.linesById.get("line:IDFM:C01083");
    const line38Bounds = line38 ? lineBounds(line38, network.stationsById) : undefined;
    const line38Descriptors = line38Bounds
      ? manifest.files.chunks.filter((descriptor) => boundsIntersect(line38Bounds, descriptor.bounds))
      : [];
    const line38Payloads = await Promise.all(
      line38Descriptors.map((descriptor) => loader.loadChunk(manifest, descriptor)),
    );
    line38DetailedPaths = line38Payloads
      .flatMap((payload) => payload.paths)
      .filter((path) => path.lineId === "line:IDFM:C01083");
  }, 20_000);

  it.each(regressionLines)(
    "%s keeps every station attached to a rendered stroke",
    (_label, lineId) => {
      const line = linesById.get(lineId);
      expect(line, lineId).toBeDefined();

      const linePaths = detailedPaths.filter((path) => path.lineId === lineId);
      const regionalLinePaths = regionalPaths.filter((path) => path.lineId === lineId);
      const selectedPaths = selectPreferredLinePaths(linePaths, regionalLinePaths, lineId);
      expect(linePaths.length, lineId).toBeGreaterThan(0);
      expect(selectedPaths.length, lineId).toBeGreaterThan(0);
      expect(selectedPaths.every((path) => getGlobalMapPathSubpathRanges(path).length > 0), lineId).toBe(true);

      const renderedStationIds = new Set<string>();
      const adjacentStationIds = new Map<string, Set<string>>(
        line!.stationIds.map((stationId) => [stationId, new Set<string>()]),
      );
      const stationIdsByBasePath = new Map<string, Set<string>>();

      for (const path of selectedPaths) {
        const pathStationIds = renderedStationIdsInStroke(path, stationsById);
        for (const stationId of pathStationIds) renderedStationIds.add(stationId);
        const baseStationIds = stationIdsByBasePath.get(basePathId(path)) ?? new Set<string>();
        for (const stationId of pathStationIds) baseStationIds.add(stationId);
        stationIdsByBasePath.set(basePathId(path), baseStationIds);

        for (const range of getGlobalMapPathSubpathRanges(path)) {
          const stationIds = path.vertices
            .slice(range.start, range.end)
            .flatMap((vertex) => vertex.stationId ? [vertex.stationId] : []);
          for (let index = 1; index < stationIds.length; index += 1) {
            const previous = stationIds[index - 1]!;
            const current = stationIds[index]!;
            if (previous === current) continue;
            adjacentStationIds.get(previous)?.add(current);
            adjacentStationIds.get(current)?.add(previous);
          }
        }

        for (const stationId of pathStationIds) {
          const station = stationsById.get(stationId);
          const vertex = path.vertices.find((candidate) => candidate.stationId === stationId);
          expect(vertex, `${lineId} ${stationId} must have a vertex in a stroke`).toBeDefined();
          expect(
            resolveGlobalMapVertex(path, vertex!, station),
            `${lineId} ${stationId} must render on its canonical station marker`,
          ).toMatchObject({ x: station?.worldX, y: station?.worldY });
        }
      }

      for (const stationIds of stationIdsByBasePath.values()) {
        connectAll(stationIds, adjacentStationIds);
      }

      expect(line!.stationIds.filter((stationId) => !renderedStationIds.has(stationId)), lineId).toEqual([]);
      expect(line!.stationIds.filter((stationId) => (adjacentStationIds.get(stationId)?.size ?? 0) === 0), lineId).toEqual([]);

      const visited = new Set<string>();
      const queue = [line!.stationIds[0]!];
      while (queue.length > 0) {
        const stationId = queue.shift()!;
        if (visited.has(stationId)) continue;
        visited.add(stationId);
        for (const adjacent of adjacentStationIds.get(stationId) ?? []) {
          if (!visited.has(adjacent)) queue.push(adjacent);
        }
      }

      expect(visited.size, lineId).toBe(line!.stationIds.length);
    },
  );

  it("38 requires every station to belong to one continuous non-fallback detail stroke", () => {
    const lineId = "line:IDFM:C01083";
    const line = linesById.get(lineId);
    expect(line, lineId).toBeDefined();

    // This mirrors the detail-zoom renderer: schematic fallback paths are
    // deliberately hidden for buses, so they must not make an orphan station
    // look connected in this assertion.
    const selectedDetailPaths = selectPreferredLinePaths(
      line38DetailedPaths,
      regionalPaths.filter((path) => path.lineId === lineId),
      lineId,
    ).filter((path) => path.geometrySource !== "netex-schematic-fallback");

    const adjacentStationIds = new Map<string, Set<string>>(
      line!.stationIds.map((stationId) => [stationId, new Set<string>()]),
    );
    for (const path of selectedDetailPaths) {
      for (const range of getGlobalMapPathSubpathRanges(path)) {
        const stationIds = path.vertices
          .slice(range.start, range.end)
          .flatMap((vertex) => vertex.stationId ? [vertex.stationId] : [])
          .filter((stationId) => adjacentStationIds.has(stationId));
        for (let index = 1; index < stationIds.length; index += 1) {
          const previous = stationIds[index - 1]!;
          const current = stationIds[index]!;
          if (previous === current) continue;
          adjacentStationIds.get(previous)?.add(current);
          adjacentStationIds.get(current)?.add(previous);
        }
      }
    }

    const firstConnectedStation = line!.stationIds.find(
      (stationId) => (adjacentStationIds.get(stationId)?.size ?? 0) > 0,
    );
    const visited = new Set<string>();
    const queue = firstConnectedStation ? [firstConnectedStation] : [];
    while (queue.length > 0) {
      const stationId = queue.shift()!;
      if (visited.has(stationId)) continue;
      visited.add(stationId);
      for (const adjacent of adjacentStationIds.get(stationId) ?? []) {
        if (!visited.has(adjacent)) queue.push(adjacent);
      }
    }

    const disconnectedStations = line!.stationIds
      .filter((stationId) => (adjacentStationIds.get(stationId)?.size ?? 0) === 0 || !visited.has(stationId))
      .map((stationId) => stationsById.get(stationId)?.name ?? stationId);

    expect(
      disconnectedStations,
      `${lineId} must not leave any station outside one continuous detail stroke`,
    ).toEqual([]);
  });

  it("2264 keeps every station and every consecutive direction pair in the rendered detail geometry", () => {
    const lineId = "line:IDFM:C00911";
    const line = linesById.get(lineId);
    expect(line).toBeDefined();
    expect(line!.stationIds).toEqual(expect.arrayContaining([...bus2264Direction]));

    const preferredPaths = selectPreferredLinePaths(
      detailedPaths.filter((path) => path.lineId === lineId),
      regionalPaths.filter((path) => path.lineId === lineId),
      lineId,
    );
    const edgeKeys = new Set<string>();
    for (let index = 1; index < bus2264Direction.length; index += 1) {
      edgeKeys.add([bus2264Direction[index - 1]!, bus2264Direction[index]!].sort().join("::"));
    }
    const selectedPaths = filterPathsForGlobalBusDirection(
      preferredPaths,
      edgeKeys,
      new Set(bus2264Direction),
      { allowReversedPathStorage: true },
    );

    const renderedStationIds = new Set(
      selectedPaths.flatMap((path) => renderedStationIdsInStroke(path, stationsById)),
    );
    expect(
      bus2264Direction.filter((stationId) => !renderedStationIds.has(stationId)),
      "2264 must not leave an orphan station vertex after direction filtering",
    ).toEqual([]);

    const missingPairs = bus2264Direction.slice(1).flatMap((stationId, index) => {
      const previousStationId = bus2264Direction[index]!;
      return hasStationPairGeometry(selectedPaths, previousStationId, stationId)
        ? []
        : [`${previousStationId} -> ${stationId}`];
    });
    expect(
      missingPairs,
      "2264 must keep a strokable geometry fragment for every consecutive station pair",
    ).toEqual([]);
  });
});

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function lineBounds(
  line: GlobalMapLine,
  stations: ReadonlyMap<string, GlobalMapStation>,
): Bounds | undefined {
  const lineStations = line.stationIds
    .map((stationId) => stations.get(stationId))
    .filter((station): station is GlobalMapStation => Boolean(station));
  if (lineStations.length === 0) return undefined;
  return {
    minX: Math.min(...lineStations.map((station) => station.worldX)),
    minY: Math.min(...lineStations.map((station) => station.worldY)),
    maxX: Math.max(...lineStations.map((station) => station.worldX)),
    maxY: Math.max(...lineStations.map((station) => station.worldY)),
  };
}

function boundsIntersect(left: Bounds, right: Bounds): boolean {
  return !(left.maxX < right.minX || left.minX > right.maxX || left.maxY < right.minY || left.minY > right.maxY);
}

function renderedStationIdsInStroke(
  path: GlobalMapPath,
  stations: ReadonlyMap<string, GlobalMapStation>,
): string[] {
  const ids = new Set<string>();
  for (const range of getGlobalMapPathSubpathRanges(path)) {
    for (const vertex of path.vertices.slice(range.start, range.end)) {
      if (!vertex.stationId || !stations.has(vertex.stationId)) continue;
      ids.add(vertex.stationId);
    }
  }
  return [...ids];
}

function connectAll(
  stationIds: ReadonlySet<string>,
  adjacentStationIds: Map<string, Set<string>>,
): void {
  const ids = [...stationIds];
  for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
      const left = ids[leftIndex]!;
      const right = ids[rightIndex]!;
      adjacentStationIds.get(left)?.add(right);
      adjacentStationIds.get(right)?.add(left);
    }
  }
}

function hasStationPairGeometry(
  paths: readonly GlobalMapPath[],
  leftStationId: string,
  rightStationId: string,
): boolean {
  const stationIdsByBasePath = new Map<string, Set<string>>();
  for (const path of paths) {
    const stationIds = new Set(renderedStationIdsInStroke(path, stationsById));
    for (const range of getGlobalMapPathSubpathRanges(path)) {
      const subpathStationIds = path.vertices
        .slice(range.start, range.end)
        .flatMap((vertex) => vertex.stationId ? [vertex.stationId] : []);
      if (subpathStationIds.includes(leftStationId) && subpathStationIds.includes(rightStationId)) {
        return true;
      }
    }
    const baseStationIds = stationIdsByBasePath.get(basePathId(path)) ?? new Set<string>();
    for (const stationId of stationIds) baseStationIds.add(stationId);
    stationIdsByBasePath.set(basePathId(path), baseStationIds);
  }

  return [...stationIdsByBasePath.values()].some((stationIds) =>
    stationIds.has(leftStationId) && stationIds.has(rightStationId),
  );
}

function basePathId(path: GlobalMapPath): string {
  const separator = path.id.indexOf("#");
  return separator >= 0 ? path.id.slice(0, separator) : path.id;
}

function createLocalFetcher() {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const asset = String(input).split("/global-map/v1/")[1];
    if (!asset) return new Response(null, { status: 404 });
    try {
      return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
    } catch {
      return new Response(null, { status: 404 });
    }
  };
}
