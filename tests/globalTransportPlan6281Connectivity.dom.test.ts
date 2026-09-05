import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GlobalMapAssetLoader,
  decodeBootstrap,
  decodeRegionalPaths,
} from "../src/features/transport-map/data/assetLoader";
import {
  getGlobalMapPathSubpathRanges,
  resolveGlobalMapVertex,
  type GlobalMapPath,
  type GlobalMapStation,
} from "../src/features/transport-map/contracts/manifest";
import {
  resolveGlobalBusDirection,
} from "../src/features/line-map/globalBusDirections";
import type { LineRouteSequence } from "../src/types/transit";
import type { LineGeometryRequest } from "../src/features/line-map/lineGeometry";

const LINE_ID = "line:IDFM:C00327";
const assetRoot = resolve(process.cwd(), "public/data/global-map/v1");

const fixture = vi.hoisted(() => ({
  network: undefined as ReturnType<typeof decodeBootstrap> | undefined,
  manifest: undefined as Awaited<ReturnType<GlobalMapAssetLoader["loadManifest"]>> | undefined,
  viewportPaths: [] as GlobalMapPath[],
  routeSequences: [] as LineRouteSequence[],
  renderer: {
    kind: "canvas2d-main-thread" as const,
    mount: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(),
    getMetrics: vi.fn(() => ({
      renderer: "canvas2d-main-thread",
      drawCalls: 1,
      visiblePathCount: 1,
      visibleStationCount: 1,
      renderMs: 0,
      cacheBytes: 0,
      focusedLineLiveRedraw: false,
      pathCacheCaptureCount: 0,
      pathCacheCaptureMs: 0,
      pathCacheCapturedBytes: 0,
    })),
    dispose: vi.fn(),
  },
  routeState: { path: "/map", query: {} as Record<string, unknown> },
}));

vi.mock("nuxt/app", () => ({
  useRoute: () => fixture.routeState,
  useRouter: () => ({ replace: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("../src/features/transport-map/render/createRenderer", () => ({
  createTransportMapRenderer: () => fixture.renderer,
}));

vi.mock("../src/services/idfm", () => ({
  fetchLineRouteSequences: vi.fn(async () => fixture.routeSequences),
}));

vi.mock("../src/services/lineGeometry", () => ({
  fetchResolvedLineGeometry: vi.fn(async (request: LineGeometryRequest) => {
    const stopsById = new Map(request.stops.map((stop) => [stop.id, stop]));
    return {
      schemaVersion: 1,
      source: "idfm-line-traces",
      topology: "provider",
      generatedAt: "2026-08-09T00:00:00.000Z",
      stops: request.stops,
      branches: request.branches,
      segments: request.branches.flatMap((branch) => branch.stopIds.slice(1).map((toStopId, index) => {
        const fromStopId = branch.stopIds[index]!;
        return {
          id: `${branch.id}:${index}`,
          fromStopId,
          toStopId,
          coordinates: [stopsById.get(fromStopId)!, stopsById.get(toStopId)!],
        };
      })),
      entrances: [],
      attempts: [{ source: "idfm-line-traces", status: "success" }],
    };
  }),
}));

vi.mock("../src/features/transport-map/adapters/dashboard", () => ({
  listGlobalMapDashboardPlaces: () => [],
  addGlobalMapTargetsToDashboard: vi.fn(),
}));

vi.mock("../src/features/transport-map/data/createTransportMapDataSource", () => ({
  TransportMapDataSource: class {
    initialize = vi.fn(async () => fixture.network!);
    getManifest = vi.fn(() => fixture.manifest!);
    getNetwork = vi.fn(() => fixture.network!);
    queryViewport = vi.fn(async (_camera, _mask, generation) => ({
      generation,
      chunkIds: ["6281"],
      paths: fixture.viewportPaths,
      stations: fixture.network!.stations,
      bytes: 0,
      fromCache: true,
    }));
    queryStationsWithinRadius = vi.fn(async () => []);
    getStation = vi.fn(async (id: string) => fixture.network!.stationsById.get(id));
    metrics = vi.fn(() => ({
      manifestLoaded: true,
      catalogLoaded: true,
      lastGeneration: 1,
      lastChunkCount: 1,
      bytes: 0,
      cache: { pending: 0, active: 0, completed: 1, abandoned: 0, cache: { entries: 1, bytes: 0, hits: 1, misses: 0, evictions: 0 } },
    }));
    dispose = vi.fn();
  },
}));

import GlobalTransportPlan from "../src/features/line-map/GlobalTransportPlan.vue";

describe("GlobalTransportPlan bus 6281 direction continuity", () => {
  let wrappers: VueWrapper[] = [];

  beforeAll(async () => {
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher() });
    const manifest = await loader.loadManifest();
    const bootstrapPayload = await loader.loadBootstrapPayload(manifest);
    const catalog = await loader.loadCatalog(manifest);
    const decodedNetwork = decodeBootstrap(bootstrapPayload, manifest, catalog);
    const regionalPayload = await loader.loadRegionalPayload(manifest);
    const regionalBusPayload = await loader.loadRegionalBusPayload(manifest);
    const line = decodedNetwork.linesById.get(LINE_ID);
    expect(line).toMatchObject({ mode: "BUS", label: "6281" });

    const regionalPaths = [
      ...(regionalPayload ? decodeRegionalPaths(regionalPayload, bootstrapPayload) : []),
      ...(regionalBusPayload ? decodeRegionalPaths(regionalBusPayload, bootstrapPayload) : []),
    ].filter((path) => path.lineId === LINE_ID);
    const bounds = lineBounds(line!, decodedNetwork.stationsById);
    const chunks = await Promise.all(
      manifest.files.chunks
        .filter((descriptor) => boundsIntersect(bounds, descriptor.bounds))
        .map((descriptor) => loader.loadChunk(manifest, descriptor)),
    );
    const detailedPaths = chunks
      .flatMap((chunk) => chunk.paths)
      .filter((path) => path.lineId === LINE_ID);
    expect(detailedPaths.length).toBeGreaterThan(0);

    fixture.network = { ...decodedNetwork, regionalPaths };
    fixture.manifest = manifest;
    fixture.viewportPaths = detailedPaths;
    fixture.routeSequences = loadNetexRouteSequences(decodedNetwork.stations);
  }, 20_000);

  beforeEach(() => {
    wrappers.forEach((wrapper) => wrapper.unmount());
    wrappers = [];
    document.body.innerHTML = "";
    fixture.renderer.render.mockClear();
    fixture.routeState.query = {};
  });

  it("renders every available direction as one connected geometry", async () => {
    const directionSelection = resolveGlobalBusDirection(fixture.routeSequences);
    expect(
      directionSelection?.options,
      "C00327 exposes exactly its two passenger directions; partial and school runs stay optional variants",
    ).toHaveLength(2);

    const visibleVariants = new Map<string, { id: string; label: string }>();
    for (const mainDirection of directionSelection!.options) {
      const mainSelection = resolveGlobalBusDirection(
        fixture.routeSequences,
        mainDirection.id,
      );
      for (const variant of mainSelection?.variants ?? []) {
        visibleVariants.set(variant.id, variant);
      }
    }
    expect(visibleVariants.size).toBeGreaterThan(2);

    for (const direction of visibleVariants.values()) {
      fixture.routeState.query = { line: LINE_ID, direction: direction.id, mergeDirections: "0" };
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await flushPromises();

      expect(
        wrapper.findAll('[data-testid^="global-map-picker-main-direction-"]'),
        "the global-map interface only shows the two main passenger directions",
      ).toHaveLength(2);

      const scene = fixture.renderer.render.mock.calls
        .map((call) => call[1] as { activeLineId?: string; paths?: GlobalMapPath[] })
        .findLast((candidate) => candidate.activeLineId === LINE_ID);
      expect(scene?.paths ?? [], `direction ${direction.label} must render geometry`).not.toHaveLength(0);
      expect(
        countRenderedGeometryComponents(scene!.paths!, fixture.network!.stationsById),
        `direction ${direction.label} must be rendered as one connected segment`,
      ).toBe(1);
    }
  }, 20_000);
});

function loadNetexRouteSequences(
  stations: readonly GlobalMapStation[],
): LineRouteSequence[] {
  const source = JSON.parse(readFileSync(
    resolve(process.cwd(), "../idfm-node-backend/public/data/netex/lines/C00327.json"),
    "utf8",
  )) as {
    patterns: Array<{
      id: string;
      name: string;
      direction?: string;
      destination?: string;
      stops: Array<{ id: string; name: string; city?: string }>;
    }>;
  };

  const stationByReference = new Map(
    stations.flatMap((station) =>
      [station.id, ...station.rawRefs].map((reference) => [reference.replace(/^station:/u, ""), station] as const),
    ),
  );
  const stationsByLabel = new Map<string, GlobalMapStation[]>();
  for (const station of stations) {
    const key = normalizeLabel(station.name);
    const candidates = stationsByLabel.get(key) ?? [];
    candidates.push(station);
    stationsByLabel.set(key, candidates);
  }
  return source.patterns.map((pattern) => ({
    id: pattern.id,
    label: pattern.name,
    direction: pattern.direction ?? pattern.destination,
    topologySource: "server" as const,
    stops: pattern.stops.map((stop) => {
      const station = stationByReference.get(stop.id)
        ?? stationsByLabel.get(normalizeLabel(stop.name))?.find((candidate) => candidate.city === stop.city)
        ?? stationsByLabel.get(normalizeLabel(stop.name))?.[0];
      if (!station) throw new Error(`Missing global station for ${stop.id}`);
      return {
        id: stop.id,
        label: stop.name,
        city: stop.city,
        lon: station.lon,
        lat: station.lat,
        station: {
          id: stop.id,
          label: stop.name,
          city: stop.city,
          lon: station.lon,
          lat: station.lat,
          monitoringRef: stop.id,
          scheduleStopAreaRef: stop.id,
        },
      };
    }),
  }));
}

function normalizeLabel(value: string): string {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function countRenderedGeometryComponents(
  paths: readonly GlobalMapPath[],
  stationsById: ReadonlyMap<string, GlobalMapStation>,
): number {
  const parent: number[] = [];
  const endpointIndex = new Map<string, number>();
  const find = (index: number): number => {
    if (parent[index] === index) return index;
    parent[index] = find(parent[index]!);
    return parent[index]!;
  };
  const join = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  const endpointId = (path: GlobalMapPath, vertexIndex: number): number => {
    const vertex = path.vertices[vertexIndex]!;
    const station = vertex.stationId ? stationsById.get(vertex.stationId) : undefined;
    const point = resolveGlobalMapVertex(path, vertex, station, "BUS");
    const key = `${Math.round(point.x * 10_000_000)}:${Math.round(point.y * 10_000_000)}`;
    const existing = endpointIndex.get(key);
    if (existing !== undefined) return existing;
    const index = parent.length;
    parent.push(index);
    endpointIndex.set(key, index);
    return index;
  };

  for (const path of paths) {
    for (const range of getGlobalMapPathSubpathRanges(path)) {
      if (range.end - range.start < 2) continue;
      join(endpointId(path, range.start), endpointId(path, range.end - 1));
    }
  }
  return new Set(parent.map((_value, index) => find(index))).size;
}

function lineBounds(
  line: { stationIds: readonly string[] },
  stationsById: ReadonlyMap<string, GlobalMapStation>,
) {
  const stations = line.stationIds
    .map((stationId) => stationsById.get(stationId))
    .filter((station): station is GlobalMapStation => Boolean(station));
  return {
    minX: Math.min(...stations.map((station) => station.worldX)),
    minY: Math.min(...stations.map((station) => station.worldY)),
    maxX: Math.max(...stations.map((station) => station.worldX)),
    maxY: Math.max(...stations.map((station) => station.worldY)),
  };
}

function boundsIntersect(
  left: { minX: number; minY: number; maxX: number; maxY: number },
  right: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return !(left.maxX < right.minX || left.minX > right.maxX || left.maxY < right.minY || left.minY > right.maxY);
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
