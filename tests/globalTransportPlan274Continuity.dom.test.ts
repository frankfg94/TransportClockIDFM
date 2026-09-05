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
import { selectDirectionalStopSequencePatterns } from "../src/features/line-map/topologyPatterns";
import type {
  LineGeometryRequest,
  LineGeometrySegment,
} from "../src/features/line-map/lineGeometry";
import type { LineRouteSequence } from "../src/types/transit";

const LINE_ID = "line:IDFM:C01255";
const assetRoot = resolve(process.cwd(), "public/data/global-map/v1");

const fixture = vi.hoisted(() => ({
  network: undefined as ReturnType<typeof decodeBootstrap> | undefined,
  manifest: undefined as Awaited<ReturnType<GlobalMapAssetLoader["loadManifest"]>> | undefined,
  viewportPaths: [] as GlobalMapPath[],
  routeSequences: [] as LineRouteSequence[],
  geometryRequests: [] as LineGeometryRequest[],
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
    fixture.geometryRequests.push(request);

    return {
      schemaVersion: 1,
      source: "gtfs" as const,
      topology: "requested" as const,
      generatedAt: "2026-08-09T00:00:00.000Z",
      datasetVersion: "2026-08-03",
      stops: request.stops,
      branches: request.branches,
      segments: createGapProneProviderSegments(request),
      entrances: [],
      attempts: [{ source: "gtfs" as const, status: "success" as const }],
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
      chunkIds: ["274"],
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

describe("GlobalTransportPlan bus 274 direction continuity", () => {
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
    expect(line).toMatchObject({ mode: "BUS", label: "274" });

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

    const direction = resolveGlobalBusDirection(fixture.routeSequences);
    expect(direction?.options.find((option) => option.label === "Saint-Denis RER"))
      .toMatchObject({ stopCount: 33 });
  }, 20_000);

  beforeEach(() => {
    wrappers.forEach((wrapper) => wrapper.unmount());
    wrappers = [];
    document.body.innerHTML = "";
    fixture.renderer.render.mockClear();
    fixture.geometryRequests = [];
    fixture.routeState.query = {};
  });

  it("renders Saint-Denis RER as one continuous geometry", async () => {
    fixture.routeState.query = { line: LINE_ID, direction: "pattern:4" };
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushPromises();

    const scene = fixture.renderer.render.mock.calls
      .map((call) => call[1] as { activeLineId?: string; paths?: GlobalMapPath[] })
      .findLast((candidate) => candidate.activeLineId === LINE_ID);
    expect(fixture.geometryRequests).toHaveLength(1);
    expect(fixture.geometryRequests[0]?.stops).toHaveLength(33);
    expect(scene?.paths ?? [], "274 must render geometry").not.toHaveLength(0);
    expect(scene!.paths, "the selected bus direction must collapse to one rendered path").toHaveLength(1);
    expect(getGlobalMapPathSubpathRanges(scene!.paths![0]!)).toHaveLength(1);
    expect(scene!.paths![0]).toMatchObject({
      id: `path:${LINE_ID}:direction:pattern:4`,
      geometrySource: "gtfs",
      quality: { complete: true, fallback: false },
    });
    expect(
      countRenderedGeometryComponents(scene!.paths!, fixture.network!.stationsById),
      "a bus direction must never remain split into several rendered pieces",
    ).toBe(1);
  }, 20_000);
});

function loadNetexRouteSequences(
  stations: readonly GlobalMapStation[],
): LineRouteSequence[] {
  const source = JSON.parse(readFileSync(
    resolve(process.cwd(), "../idfm-node-backend/public/data/netex/lines/C01255.json"),
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
  const selectedPatternIds = new Set(
    selectDirectionalStopSequencePatterns(
      source.patterns.map((pattern) => ({
        id: pattern.id,
        stops: pattern.stops.map((stop) => stop.id),
      })),
    ).map((pattern) => pattern.id),
  );

  const stationByReference = new Map(
    stations.flatMap((station) =>
      [station.id, ...station.rawRefs].map((reference) => [
        reference.replace(/^station:/u, ""),
        station,
      ] as const),
    ),
  );
  const stationsByLabel = new Map<string, GlobalMapStation[]>();
  for (const station of stations) {
    const key = normalizeLabel(station.name);
    const candidates = stationsByLabel.get(key) ?? [];
    candidates.push(station);
    stationsByLabel.set(key, candidates);
  }
  return source.patterns
    .filter((pattern) => selectedPatternIds.has(pattern.id))
    .map((pattern) => ({
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

function createGapProneProviderSegments(
  request: LineGeometryRequest,
): LineGeometrySegment[] {
  const branch = request.branches[0];
  if (!branch) return [];
  const stopsById = new Map(request.stops.map((stop) => [stop.id, stop]));

  return branch.stopIds.slice(1).flatMap((toStopId, index) => {
    const fromStop = stopsById.get(branch.stopIds[index]!);
    const toStop = stopsById.get(toStopId);
    if (!fromStop || !toStop) return [];

    // Simulate the two independently projected GTFS edges that caused the
    // 274 regression: each edge is valid, but its shared-stop endpoint is on
    // the opposite side of the requested stop from its neighbour.
    const offset = index % 2 === 0 ? 0.0015 : -0.0015;
    return [{
      id: `gtfs:274:${index}`,
      fromStopId: fromStop.id,
      toStopId: toStop.id,
      coordinates: [
        { lon: fromStop.lon + offset, lat: fromStop.lat + offset },
        { lon: toStop.lon + offset, lat: toStop.lat + offset },
      ],
    }];
  });
}

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
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
