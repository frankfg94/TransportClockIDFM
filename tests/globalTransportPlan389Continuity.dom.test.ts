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
  type GlobalMapPath,
  type GlobalMapStation,
} from "../src/features/transport-map/contracts/manifest";
import {
  getGlobalBusDirectionOrderedStopIds,
  resolveGlobalBusDirection,
} from "../src/features/line-map/globalBusDirections";
import type {
  LineGeometryCoordinate,
  LineGeometryRequest,
  LineGeometrySegment,
} from "../src/features/line-map/lineGeometry";
import { createSegmentsFromTraces } from "../server/services/lineGeometry/traceProjection";
import type { LineRouteSequence } from "../src/types/transit";

const LINE_ID = "line:IDFM:C01315";
const assetRoot = resolve(process.cwd(), "public/data/global-map/v1");

const fixture = vi.hoisted(() => ({
  network: undefined as ReturnType<typeof decodeBootstrap> | undefined,
  manifest: undefined as Awaited<ReturnType<GlobalMapAssetLoader["loadManifest"]>> | undefined,
  viewportPaths: [] as GlobalMapPath[],
  routeSequences: [] as LineRouteSequence[],
  gtfsTraces: [] as LineGeometryCoordinate[][],
  fallbackLegLabels: [] as string[],
  traceResolver: undefined as
    | ((request: LineGeometryRequest) => LineGeometrySegment | undefined)
    | undefined,
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
    const segments = request.branches.flatMap((branch) =>
      branch.stopIds.slice(1).map((toStopId, index) => {
        const fromStopId = branch.stopIds[index]!;
        const edgeRequest: LineGeometryRequest = {
          ...request,
          branches: [{
            id: `${branch.id}:${index}`,
            direction: branch.direction,
            stopIds: [fromStopId, toStopId],
          }],
        };
        const providerSegment = fixture.traceResolver?.(edgeRequest);
        if (providerSegment) return providerSegment;

        const from = stopsById.get(fromStopId)!;
        const to = stopsById.get(toStopId)!;
        fixture.fallbackLegLabels.push(
          `${from.label ?? fromStopId} -> ${to.label ?? toStopId}`,
        );
        return {
          id: `${branch.id}:${index}`,
          fromStopId,
          toStopId,
          coordinates: [from, to],
          fallback: true,
        } satisfies LineGeometrySegment;
      }),
    );

    return {
      schemaVersion: 1,
      source: "gtfs" as const,
      topology: "requested" as const,
      generatedAt: "2026-08-09T00:00:00.000Z",
      stops: request.stops,
      branches: request.branches,
      segments,
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
      chunkIds: ["389"],
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

describe("GlobalTransportPlan bus 389 DOM continuity", () => {
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
    expect(line).toMatchObject({ mode: "BUS", label: "389" });

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

    const gtfsCurrent = JSON.parse(readFileSync(
      resolve(process.cwd(), ".data/gtfs/current.json"),
      "utf8",
    )) as { sha256: string };
    const gtfsArtifact = JSON.parse(readFileSync(
      resolve(
        process.cwd(),
        ".data/gtfs/versions",
        gtfsCurrent.sha256,
        "lines/IDFM%3AC01315.json",
      ),
      "utf8",
    )) as { shapes: Record<string, LineGeometryCoordinate[]> };

    fixture.network = { ...decodedNetwork, regionalPaths };
    fixture.manifest = manifest;
    fixture.viewportPaths = detailedPaths;
    fixture.routeSequences = loadNetexRouteSequences(decodedNetwork.stations);
    fixture.gtfsTraces = Object.values(gtfsArtifact.shapes);
    fixture.traceResolver = (request) => createSegmentsFromTraces(request, fixture.gtfsTraces)?.[0];
  }, 20_000);

  beforeEach(() => {
    wrappers.forEach((wrapper) => wrapper.unmount());
    wrappers = [];
    document.body.innerHTML = "";
    fixture.renderer.render.mockClear();
    fixture.routeState.query = {};
    fixture.fallbackLegLabels = [];
  });

  it("renders the regular 389 traversal through Centre Commercial du Moulin and Aérodrome Morane from GTFS", async () => {
    const direction = resolveGlobalBusDirection(fixture.routeSequences);
    expect(direction).toBeDefined();
    const selection = direction!;
    expect(selection.selectedDirectionId).toBe("pattern:2");
    expect(selection.selectedMainDirectionId).toBe("pattern:2");
    expect(selection.variants.map((variant) => variant.id)).toEqual([
      "pattern:2",
      "pattern:1",
    ]);
    expect(selection.sequence.stops.map((stop) => normalizeLabel(stop.label))).toEqual(
      expect.arrayContaining(["centre commercial du moulin", "aerodrome morane"]),
    );
    expect(selection.sequence.stops.map((stop) => normalizeLabel(stop.label))).not.toContain(
      "lycee de villebon",
    );
    const orderedStationIds = getGlobalBusDirectionOrderedStopIds(
      fixture.network!.linesById.get(LINE_ID)!,
      selection,
      fixture.network!.stations,
    );
    expect(orderedStationIds).toHaveLength(selection.sequence.stops.length);

    fixture.routeState.query = {
      line: LINE_ID,
      direction: selection.selectedDirectionId,
    };
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushPromises();

    const scene = fixture.renderer.render.mock.calls
      .map((call) => call[1] as { activeLineId?: string; paths?: GlobalMapPath[] })
      .findLast((candidate) => candidate.activeLineId === LINE_ID);
    const activePaths = scene?.paths ?? [];
    expect(activePaths, "the selected 389 direction must render geometry").not.toHaveLength(0);

    expect(
      fixture.fallbackLegLabels,
      `the regular traversal must be fully covered by GTFS, got: ${fixture.fallbackLegLabels.join(", ")}`,
    ).toEqual([]);
    const providerPath = activePaths.find((path) => path.id === `path:${LINE_ID}:direction:pattern:2`);
    expect(
      providerPath,
      "the regular 389 direction must publish a complete GTFS geometry",
    ).toBeDefined();
    expect(providerPath!.geometrySource).toBe("gtfs");
    expect(providerPath!.quality).toMatchObject({ complete: true, fallback: false });
    expect(providerPath!.stationIds).toEqual(orderedStationIds);
    expect(
      findUncoveredLegs([providerPath!], orderedStationIds, fixture.network!.stationsById),
      "Centre Commercial du Moulin and Aérodrome Morane must stay connected by the GTFS path",
    ).toEqual([]);
  }, 20_000);

  it("retains Lycée de Villebon as a special variant without inventing a straight road detour", async () => {
    const direction = resolveGlobalBusDirection(fixture.routeSequences, "pattern:1");
    expect(direction).toMatchObject({
      selectedDirectionId: "pattern:1",
      selectedMainDirectionId: "pattern:2",
    });
    const lyceeStop = direction!.sequence.stops.find(
      (stop) => normalizeLabel(stop.label) === "lycee de villebon",
    );
    expect(lyceeStop, "the official special service must remain in the topology").toBeDefined();
    const lyceeStationId = getGlobalBusDirectionOrderedStopIds(
      fixture.network!.linesById.get(LINE_ID)!,
      direction!,
      fixture.network!.stations,
    )[direction!.sequence.stops.indexOf(lyceeStop!)];
    expect(lyceeStationId).toBeDefined();

    fixture.routeState.query = { line: LINE_ID, direction: "pattern:1" };
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushPromises();

    const scene = fixture.renderer.render.mock.calls
      .map((call) => call[1] as { activeLineId?: string; paths?: GlobalMapPath[] })
      .findLast((candidate) => candidate.activeLineId === LINE_ID);
    const visible389Paths = (scene?.paths ?? []).filter((path) => path.lineId === LINE_ID);
    expect(
      fixture.fallbackLegLabels.map(normalizeLabel).some((label) =>
        label.includes("lycee de villebon"),
      ),
      "the missing GTFS coverage must identify the school detour rather than turn it into a chord",
    ).toBe(true);
    expect(
      visible389Paths.some((path) => path.stationIds.includes(lyceeStationId!)),
      "a missing GTFS road shape must not render a fictitious Lycée de Villebon detour",
    ).toBe(false);
  }, 20_000);
});

function loadNetexRouteSequences(
  stations: readonly GlobalMapStation[],
): LineRouteSequence[] {
  const source = JSON.parse(readFileSync(
    resolve(process.cwd(), "../idfm-node-backend/public/data/netex/lines/C01315.json"),
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

function findUncoveredLegs(
  paths: readonly GlobalMapPath[],
  stationIds: readonly string[],
  stationsById: ReadonlyMap<string, GlobalMapStation>,
): string[] {
  return stationIds.slice(1).flatMap((to, index) => {
    const from = stationIds[index]!;
    const covered = paths.some((path) => getGlobalMapPathSubpathRanges(path).some((range) => {
      const ids = path.vertices.slice(range.start, range.end).map((vertex) => vertex.stationId);
      const fromIndex = ids.indexOf(from);
      return fromIndex >= 0 && ids.indexOf(to) > fromIndex;
    }));
    return covered ? [] : [formatLeg(from, to, stationsById)];
  });
}

function formatLeg(
  fromId: string,
  toId: string,
  stationsById: ReadonlyMap<string, GlobalMapStation>,
): string {
  return `${stationsById.get(fromId)?.name ?? fromId} -> ${stationsById.get(toId)?.name ?? toId}`;
}

function normalizeLabel(value: string): string {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
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
