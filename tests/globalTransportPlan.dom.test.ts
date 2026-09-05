import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick } from "vue";
import type { GeocoderPoint } from "../src/features/transport-map/contracts/geocoder";
import type { NearbyJourney } from "../src/features/nearby-stations/nearbyHeavyTransports";
import type { GtfsLineFrequencyResponse } from "../src/types/lineFrequency";
import { clampCameraToBounds } from "../src/features/transport-map/geo/camera";
import { lonLatToWorld, metersToWorldUnits, worldToLonLat, worldToScreen } from "../src/features/transport-map/geo/coordinateKernel";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../src/features/transport-map/config/globalTransportPlanConfig";
import {
  ADDRESS_BOOK_STORAGE_KEY,
  ADDRESS_BOOK_STORAGE_VERSION,
  resetAddressBookState,
} from "../src/features/address-book/addressBook";

const fixture = vi.hoisted(() => {
  const stationA = {
    id: "station:a",
    index: 0,
    name: "Châtelet",
    normalizedName: "chatelet",
    city: "Paris",
    aliases: ["Châtelet"],
    rawRefs: ["station:FR::monomodalStopPlace:chatelet"],
    lineIds: ["line:metro:1", "line:bus:38"],
    ownerChunkId: "chunk:0:0",
    isHub: true,
    sourceCrs: "EPSG:2154",
    sourceX: 652469,
    sourceY: 6861275,
    lon: 2.3522,
    lat: 48.8566,
    worldX: 0.5065,
    worldY: 0.352,
    coordinateSource: "netex",
    transformVersion: "lambert93-ntf-v1",
  };
  const stationB = {
    ...stationA,
    id: "station:b",
    index: 1,
    name: "Louvre",
    normalizedName: "louvre",
    rawRefs: ["station:b"],
    lineIds: ["line:metro:1"],
    isHub: false,
    lon: 2.34,
    lat: 48.86,
    worldX: 0.506,
    worldY: 0.351,
  };
  const metro = {
    id: "line:metro:1",
    index: 0,
    code: "1",
    label: "1",
    mode: "METRO",
    color: "#f6c445",
    textColor: "#111827",
    aliases: ["1"],
    stationIds: [stationA.id, stationB.id],
    geometryIds: ["path:1"],
  };
  const bus = {
    ...metro,
    id: "line:bus:38",
    index: 1,
    code: "38",
    label: "38",
    mode: "BUS",
    color: "#4f6f9d",
    textColor: "#fff",
    stationIds: [stationA.id],
    geometryIds: ["path:38"],
  };
  const path = {
    id: "path:1",
    lineId: metro.id,
    geometrySource: "gtfs",
    sourceVersion: "fixture",
    quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
    stationIds: [stationA.id, stationB.id],
    vertices: [
      { stationId: stationA.id, x: stationA.worldX, y: stationA.worldY },
      { stationId: stationB.id, x: stationB.worldX, y: stationB.worldY },
    ],
    minX: stationB.worldX,
    minY: stationB.worldY,
    maxX: stationA.worldX,
    maxY: stationA.worldY,
    chunkIds: ["chunk:0:0"],
  };
  const regionalPath = {
    ...path,
    id: "path:regional:1",
    geometrySource: "netex-schematic-fallback" as const,
    sourceVersion: "regional-fixture",
    quality: { complete: false, fallback: true, gapMeters: 0, stationDistanceMaxMeters: 0 },
    chunkIds: [],
  };
  const ghostPath = {
    ...path,
    id: "path:38",
    lineId: bus.id,
    stationIds: [stationA.id],
    vertices: [
      { stationId: stationA.id, x: stationA.worldX, y: stationA.worldY },
      { stationId: stationA.id, x: stationA.worldX + 0.0002, y: stationA.worldY + 0.0001 },
    ],
    minX: stationA.worldX,
    minY: stationA.worldY,
    maxX: stationA.worldX + 0.0002,
    maxY: stationA.worldY + 0.0001,
  };
  const network = {
    lines: [metro, bus],
    stations: [stationA, stationB],
    entrances: [
      { id: "entrance:a", stationIndex: 0, stationId: stationA.id, name: "Parvis principal", lon: stationA.lon, lat: stationA.lat, worldX: stationA.worldX, worldY: stationA.worldY },
      { id: "entrance:b", stationIndex: 1, stationId: stationB.id, name: "Rue de Rivoli", lon: stationB.lon, lat: stationB.lat, worldX: stationB.worldX, worldY: stationB.worldY },
    ],
    regionalPaths: [regionalPath],
    pathsById: new Map([[path.id, path]]),
    linesById: new Map([[metro.id, metro], [bus.id, bus]]),
    stationsById: new Map([[stationA.id, stationA], [stationB.id, stationB]]),
    bounds: { minX: 0.49, minY: 0.34, maxX: 0.52, maxY: 0.37 },
  };
  const manifest = {
    schemaVersion: 1,
    minReaderVersion: 1,
    dataVersion: "fixture-v1",
    generatedAt: "2026-08-02T00:00:00.000Z",
    sourceVersions: {},
    projection: { name: "WebMercatorNormalized", sourceCrs: "EPSG:2154", transformVersion: "lambert93-ntf-v1" },
    bounds: network.bounds,
    lod: [{ level: 0, minZoom: 0, maxZoom: 20, maxErrorMeters: 0.25 }],
    modes: ["BUS", "METRO"],
    files: { bootstrap: { asset: "bootstrap.json", bytes: 1, checksum: "x" }, catalog: { asset: "catalog.json", bytes: 1, checksum: "x" }, chunks: [], stationIndex: { schemaVersion: 1, kind: "stations", count: 2, bounds: network.bounds, asset: "stations.json" }, pathIndex: { schemaVersion: 1, kind: "paths", count: 1, bounds: network.bounds, asset: "paths.json" } },
    counts: { lines: 2, stations: 2, paths: 1, vertices: 2, chunks: 0, entrances: 2, bikes: 0 },
    warnings: [],
    compilation: { deterministic: true, hashAlgorithm: "sha256", quantizationMeters: 0.01, staticExternalRequests: 0 },
  };
  const rendererMetrics = { renderer: "canvas2d-main-thread", drawCalls: 1, visiblePathCount: 1, visibleStationCount: 2, renderMs: 0.4, cacheBytes: 0, focusedLineLiveRedraw: false, pathCacheCaptureCount: 0 as const, pathCacheCaptureMs: 0, pathCacheCapturedBytes: 0 };
  const renderer = {
    kind: "canvas2d-main-thread",
    mount: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(),
    getMetrics: vi.fn(() => rendererMetrics),
    dispose: vi.fn(),
  };
  const dashboardAdd = vi.fn(async () => ({ addedBoardIds: ["board:fixture"], duplicateBoardIds: [], skippedStationIds: [], placeId: "home", undo: vi.fn() }));
  return {
    network,
    manifest,
    path,
    ghostPath,
    viewportPaths: [path] as typeof path[],
    renderer,
    dashboardAdd,
    router: {
      replace: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue(undefined),
    },
    routeState: { path: "/map", query: {} as Record<string, unknown> },
    dataSourceCalls: { initialize: vi.fn(), queryViewport: vi.fn(), queryStationsWithinRadius: vi.fn(), dispose: vi.fn() },
    placesSearch: vi.fn(async (): Promise<GeocoderPoint[]> => []),
    travelRoutesSearch: vi.fn(async (): Promise<NearbyJourney[]> => []),
    radiusResults: [] as Array<{ station: typeof stationA; distanceMeters: number }>,
  };
});

const routeState = fixture.routeState;
routeState.query = {};

vi.mock("nuxt/app", () => ({
  useRoute: () => routeState,
  useRouter: () => fixture.router,
}));

vi.mock("../src/features/transport-map/render/createRenderer", () => ({
  createTransportMapRenderer: () => fixture.renderer,
}));

vi.mock("../src/features/transport-map/data/createTransportMapDataSource", () => ({
  TransportMapDataSource: class {
    constructor() {
      fixture.dataSourceCalls.initialize.mockClear();
      fixture.dataSourceCalls.queryViewport.mockClear();
    }

    initialize = fixture.dataSourceCalls.initialize.mockResolvedValue(fixture.network);
    getManifest = vi.fn(() => fixture.manifest);
    getNetwork = vi.fn(() => fixture.network);
    getStationSpatialIndex = vi.fn(() => undefined);
    queryViewport = fixture.dataSourceCalls.queryViewport.mockImplementation(async (_camera, _mask, generation) => ({
      generation,
      chunkIds: ["chunk:0:0"],
      paths: fixture.viewportPaths,
      stations: fixture.network.stations,
      bytes: 123,
      fromCache: true,
    }));
    queryStationsWithinRadius = fixture.dataSourceCalls.queryStationsWithinRadius.mockImplementation(async () => fixture.radiusResults);
    getStation = vi.fn(async (id: string) => fixture.network.stationsById.get(id));
    metrics = vi.fn(() => ({ manifestLoaded: true, catalogLoaded: true, lastGeneration: 1, lastChunkCount: 1, bytes: 123, cache: { pending: 0, active: 0, completed: 1, abandoned: 0, cache: { entries: 1, bytes: 123, hits: 1, misses: 0, evictions: 0 } } }));
    dispose = fixture.dataSourceCalls.dispose;
  },
}));

vi.mock("../src/features/transport-map/adapters/dashboard", () => ({
  listGlobalMapDashboardPlaces: () => [{ id: "home", label: "Maison" }],
  addGlobalMapTargetsToDashboard: fixture.dashboardAdd,
}));

vi.mock("../src/services/lineFrequency", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/lineFrequency")>();
  return {
    ...actual,
    // Pinning fixture lines must not reach the GTFS API in facade tests.
    fetchGtfsLineFrequency: vi.fn(async (lineId: string): Promise<GtfsLineFrequencyResponse> => ({
      lineId,
      serviceDate: actual.getGtfsServiceDate(),
      source: "gtfs",
      status: "missing",
      topologyAvailable: false,
      branched: false,
      average: {},
      directions: [],
      sections: [],
      stationCount: 0,
      sampledStationCount: 0,
    })),
  };
});

vi.mock("../src/services/nearbyDataProviders", () => ({
  createNearbyDataProviders: () => ({
    places: {
      searchDestinations: fixture.placesSearch,
      searchNearby: vi.fn(async () => []),
    },
    travelRoutes: {
      findJourneys: fixture.travelRoutesSearch,
    },
  }),
}));

import GlobalTransportPlan from "../src/features/line-map/GlobalTransportPlan.vue";

const stationBoardModalStub = defineComponent({
  name: "StationBoardModal",
  props: {
    open: Boolean,
    initialLine: { type: Object, default: undefined },
    initialFamily: { type: String, default: undefined },
    lineOnly: Boolean,
  },
  emits: ["select-line", "close"],
  template: `
    <div v-if="open" data-global-station-board-modal>
      <span data-global-station-board-modal-line>{{ initialLine?.id }}</span>
      <span data-global-station-board-modal-family>{{ initialFamily }}</span>
    </div>
  `,
});

describe("GlobalTransportPlan facade", () => {
  let wrappers: VueWrapper[] = [];

  beforeEach(() => {
    wrappers.forEach((wrapper) => wrapper.unmount());
    wrappers = [];
    document.body.innerHTML = "";
    routeState.query = {};
    fixture.renderer.mount.mockClear();
    fixture.renderer.resize.mockClear();
    fixture.renderer.render.mockClear();
    fixture.renderer.dispose.mockClear();
    fixture.router.replace.mockClear();
    fixture.router.push.mockClear();
    fixture.dataSourceCalls.initialize.mockClear();
    fixture.dataSourceCalls.queryViewport.mockClear();
    fixture.dataSourceCalls.queryStationsWithinRadius.mockClear();
    fixture.dashboardAdd.mockClear();
    fixture.placesSearch.mockReset();
    fixture.placesSearch.mockResolvedValue([]);
    fixture.travelRoutesSearch.mockReset();
    fixture.travelRoutesSearch.mockResolvedValue([]);
    window.localStorage.removeItem("transport-clock.global-map-reperes.v1");
    window.localStorage.removeItem(ADDRESS_BOOK_STORAGE_KEY);
    resetAddressBookState();
    fixture.radiusResults = [];
    fixture.viewportPaths = [fixture.path];
    fixture.network.stations[0]!.lineIds = [fixture.network.lines[0]!.id, fixture.network.lines[1]!.id];
    fixture.network.stations[1]!.lineIds = [fixture.network.lines[0]!.id];
  });

  it("mounts one canvas facade, announces ready state and filters modes by keyboard", async () => {
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

    expect(fixture.dataSourceCalls.initialize).toHaveBeenCalledTimes(1);
    expect(wrapper.findAll("canvas")).toHaveLength(1);
    expect(wrapper.find("[data-transport-map-basemap]").exists()).toBe(true);
    expect(wrapper.get("canvas.global-transport-plan__canvas").attributes("aria-label")).toContain("Réseau global");
    expect(wrapper.text()).toContain("2 lignes");
    const metroPreset = wrapper.get('[data-global-map-preset="METRO"]');
    expect(metroPreset.get(".global-transport-plan__mode-preset-select").attributes("aria-pressed")).toBe("true");

    await wrapper.get(".global-transport-plan").trigger("keydown", { key: "ArrowRight" });
    await metroPreset.get(".global-transport-plan__mode-preset-select").trigger("click");
    await flushPromises();
    expect(wrapper.find("[data-global-map-filters]").exists()).toBe(true);
    expect(wrapper.find("[data-global-map-line-panel]").exists()).toBe(false);

    await metroPreset.get(".global-transport-plan__mode-preset-detail").trigger("click");
    await flushPromises();
    expect(wrapper.find("[data-global-map-filters]").exists()).toBe(false);
    expect(wrapper.get("[data-global-map-line-panel]").classes()).toContain(
      "global-map-line-panel--embedded",
    );
    const lineButton = wrapper.get(".global-map-line-panel__line");
    await lineButton.trigger("click");
    await flushPromises();
    expect(wrapper.find("[data-global-map-line-panel]").exists()).toBe(true);
    expect(wrapper.get(".global-map-line-panel__line").classes()).toContain(
      "global-map-line-panel__line--selected",
    );
    expect(wrapper.get(".global-map-line-panel__line").attributes("aria-pressed")).toBe("true");
    await wrapper.get(".global-map-line-panel__header-action--back").trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-global-map-preset="METRO"] .global-transport-plan__mode-preset-select').attributes("aria-pressed")).toBe("true");
    await new Promise((resolve) => setTimeout(resolve, 90));
    await flushPromises();
    expect(fixture.dataSourceCalls.queryViewport.mock.calls.length).toBeGreaterThan(1);
    const initialScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
      | { entrances?: unknown[] }
      | undefined;
    expect(initialScene?.entrances).toEqual([]);
  });

  it("places both Chaos Zoom profiles before Recenter and returns a JSON report when line 14 is unavailable", async () => {
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

      const actions = wrapper.get(".global-transport-plan__actions").findAll("button");
      expect(actions[0]?.attributes("data-global-map-chaos-zoom")).toBeDefined();
      expect(actions[1]?.attributes("data-global-map-chaos-zoom-extreme")).toBeDefined();
      expect(actions[2]?.text()).toContain("Recentrer");
      expect(wrapper.find("[data-global-map-chaos-zoom-download]").exists()).toBe(false);

    await actions[0]!.trigger("click");
    await flushPromises();

    const reportElement = wrapper.get("[data-global-map-chaos-zoom-report]");
    const report = JSON.parse(reportElement.text()) as {
      status: string;
      scenario: string;
      operationCount: number;
      error?: string;
    };
    expect(report.status).toBe("failed");
    expect(report.scenario).toBe("chaos-zoom");
    expect(report.operationCount).toBe(30);
    expect(report.error).toContain("Ligne 14");
    const downloadButton = wrapper.get("[data-global-map-chaos-zoom-download]");
    expect(downloadButton.text()).toContain("Télécharger le rapport JSON");

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn((_value: Blob | MediaSource) => "blob:chaos-report");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    try {
      await downloadButton.trigger("click");
      expect(createObjectURL).toHaveBeenCalledOnce();
      const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
      const exportedReport = JSON.parse(await blob.text()) as { scenario: string; status: string };
      expect(exportedReport.scenario).toBe("chaos-zoom");
      expect(exportedReport.status).toBe("failed");
      expect(anchorClick).toHaveBeenCalledOnce();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:chaos-report");
    } finally {
      anchorClick.mockRestore();
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
    }
  });

  it("mounts the bounded cover only for a selected line and keeps it before the live raster", async () => {
    routeState.query = { line: fixture.network.lines[0]!.id, mergeDirections: "0" };
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();
    await nextTick();

    const stack = wrapper.get(".global-transport-plan__basemap-stack").element;
    const cover = stack.querySelector<HTMLElement>("[data-selected-line-basemap-cover]");
    const live = stack.querySelector<HTMLElement>("[data-transport-map-basemap]");
    expect(cover?.dataset.coverEnabled).toBe("true");
    expect(cover?.dataset.coverLineId).toBe(fixture.network.lines[0]!.id);
    expect(cover?.querySelectorAll("[data-selected-line-cover-tile]").length).toBeGreaterThan(0);
    expect(live).not.toBeNull();
    expect(live?.getAttribute("style")).toContain("opacity: 1");
    expect(live?.getAttribute("style")).toContain("visibility: visible");
    expect(cover?.parentElement?.firstElementChild).toBe(cover);
    expect(cover?.parentElement?.lastElementChild).toBe(live);
  });

  it("exposes an accessible traffic switch and opens the existing sidebar from an impacted line", async () => {
    const originalViewportPaths = fixture.viewportPaths;
    const trafficPath = {
      ...fixture.path,
      vertices: [
        fixture.path.vertices[0]!,
        { stationId: "", x: 0.6, y: 0.5 },
        fixture.path.vertices[1]!,
      ],
      maxX: 0.6,
      maxY: 0.5,
    };
    fixture.viewportPaths = [trafficPath];
    const trafficPayload = {
      configured: true,
      generatedAt: "2026-08-11T12:00:00.000Z",
      lines: [{
        lineRef: fixture.network.lines[0]!.id,
        status: "information",
        disruptions: [{
          id: "fixture-traffic",
          title: "Trafic perturbé entre Châtelet et Louvre",
          kind: "incident",
          applicationPeriods: [],
          impactedLineRefs: [fixture.network.lines[0]!.id],
          impactedStopNames: ["Châtelet", "Louvre"],
        }],
      }],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/api/traffic")
        ? new Response(JSON.stringify(trafficPayload), { status: 200 })
        : new Response(null, { status: 404 }),
    ));

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      const toggle = wrapper.get("[data-global-map-traffic-toggle]");
      expect(toggle.attributes("role")).toBe("switch");
      expect(toggle.attributes("aria-checked")).toBe("false");
      expect(toggle.attributes("data-state")).toBe("disabled");

      await toggle.trigger("click");
      await flushPromises();
      expect(toggle.attributes("aria-checked")).toBe("true");
      expect(toggle.attributes("data-state")).toBe("ready");
      const trafficScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as {
        disturbanceLineIds?: string[];
        interruptionLineIds?: string[];
      };
      expect(trafficScene.disturbanceLineIds).toContain(fixture.network.lines[0]!.id);
      expect(trafficScene.interruptionLineIds).toEqual([]);

      const canvas = wrapper.get("canvas.global-transport-plan__canvas");
      vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        right: 800,
        bottom: 500,
        width: 800,
        height: 500,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      const canvasWithPointerCapture = canvas.element as HTMLCanvasElement & {
        hasPointerCapture: (pointerId: number) => boolean;
      };
      canvasWithPointerCapture.hasPointerCapture = () => false;
      const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as Parameters<typeof worldToScreen>[1];
      const pointer = worldToScreen({
        x: 0.6,
        y: 0.5,
      }, renderedCamera);

      await canvas.trigger("pointerdown", {
        clientX: pointer.x,
        clientY: pointer.y,
        pointerId: 1,
        button: 0,
        isPrimary: true,
      });
      await canvas.trigger("pointerup", {
        clientX: pointer.x,
        clientY: pointer.y,
        pointerId: 1,
        button: 0,
        isPrimary: true,
      });
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await flushPromises();

      expect(wrapper.find(".global-map-picker-sidebar").exists()).toBe(true);
      expect((fixture.renderer.render.mock.calls.at(-1)?.[1] as { activeLineId?: string }).activeLineId)
        .toBe(fixture.network.lines[0]!.id);
      expect(wrapper.get("[data-global-map-picker-sidebar]").attributes("data-global-map-line-preview"))
        .toBeUndefined();
      expect(wrapper.find(".user-friendly-traffic").exists()).toBe(true);
      expect(wrapper.find(".user-friendly-traffic").text()).toContain("Trafic perturbé");

      await toggle.trigger("click");
      await flushPromises();
      expect(toggle.attributes("aria-checked")).toBe("false");
      expect(wrapper.find(".global-map-picker-sidebar").exists()).toBe(true);
      expect(wrapper.find(".user-friendly-traffic").exists()).toBe(false);
      const disabledScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as {
        disturbanceLineIds?: string[];
        trafficPathSpans?: unknown[];
      };
      expect(disabledScene.disturbanceLineIds).toEqual([]);
      expect(disabledScene.trafficPathSpans).toEqual([]);
    } finally {
      fixture.viewportPaths = originalViewportPaths;
      vi.unstubAllGlobals();
    }
  });

  it("keeps ghost correspondences in their native colors after station selection", async () => {
    const originalViewportPaths = fixture.viewportPaths;
    const metroLineId = fixture.network.lines[0]!.id;
    const busLineId = fixture.network.lines[1]!.id;
    fixture.viewportPaths = [fixture.path, fixture.ghostPath];
    const trafficPayload = {
      configured: true,
      generatedAt: "2026-08-11T12:00:00.000Z",
      lines: [
        {
          lineRef: metroLineId,
          status: "information",
          disruptions: [
            {
              id: "fixture-interruption",
              title: "Interruption de la ligne 1",
              kind: "incident",
              applicationPeriods: [],
              impactedLineRefs: [metroLineId],
              impactedStopNames: ["Châtelet", "Louvre"],
            },
          ],
        },
        {
          lineRef: busLineId,
          status: "information",
          disruptions: [
            {
              id: "fixture-disturbance",
              title: "Trafic perturbé sur la ligne 38",
              kind: "incident",
              applicationPeriods: [],
              impactedLineRefs: [busLineId],
              impactedStopNames: ["Châtelet"],
            },
          ],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("/api/traffic")
          ? new Response(JSON.stringify(trafficPayload), { status: 200 })
          : new Response(null, { status: 404 }),
      ),
    );

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();

      await wrapper.get("[data-global-map-traffic-toggle]").trigger("click");
      await flushPromises();

      const overviewScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as {
        ghostLineIds?: string[];
        disturbanceLineIds?: string[];
        interruptionLineIds?: string[];
      };
      expect(overviewScene.ghostLineIds).toEqual([]);
      expect(overviewScene.disturbanceLineIds).toContain(busLineId);
      expect(overviewScene.interruptionLineIds).toContain(metroLineId);

      const canvas = wrapper.get("canvas.global-transport-plan__canvas");
      vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        right: 800,
        bottom: 500,
        width: 800,
        height: 500,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      const canvasWithPointerCapture = canvas.element as HTMLCanvasElement & {
        hasPointerCapture: (pointerId: number) => boolean;
      };
      canvasWithPointerCapture.hasPointerCapture = () => false;
      const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as Parameters<typeof worldToScreen>[1];
      const stationPoint = worldToScreen(
        {
          x: fixture.network.stations[0]!.worldX,
          y: fixture.network.stations[0]!.worldY,
        },
        renderedCamera,
      );

      await canvas.trigger("pointerdown", {
        clientX: stationPoint.x,
        clientY: stationPoint.y,
        pointerId: 1,
        button: 0,
        isPrimary: true,
      });
      await canvas.trigger("pointerup", {
        clientX: stationPoint.x,
        clientY: stationPoint.y,
        pointerId: 1,
        button: 0,
        isPrimary: true,
      });
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await flushPromises();

      const stationScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as {
        ghostLineIds?: string[];
        disturbanceLineIds?: string[];
        interruptionLineIds?: string[];
      };
      expect(stationScene.ghostLineIds).toEqual(expect.arrayContaining([metroLineId, busLineId]));
      expect(stationScene.disturbanceLineIds).not.toContain(busLineId);
      expect(stationScene.interruptionLineIds).not.toContain(metroLineId);
    } finally {
      fixture.viewportPaths = originalViewportPaths;
      vi.unstubAllGlobals();
    }
  });

  it("keeps active-line traffic spans when a station also exposes ghost correspondences", async () => {
    const originalViewportPaths = fixture.viewportPaths;
    const metroLineId = fixture.network.lines[0]!.id;
    const busLineId = fixture.network.lines[1]!.id;
    fixture.viewportPaths = [fixture.path, fixture.ghostPath];
    routeState.query = { line: metroLineId, station: fixture.network.stations[0]!.id };
    const trafficPayload = {
      configured: true,
      generatedAt: "2026-08-11T12:00:00.000Z",
      lines: [
        {
          lineRef: metroLineId,
          status: "information",
          disruptions: [
            {
              id: "fixture-active-line-disturbance",
              title: "Trafic perturbé entre Châtelet et Louvre",
              kind: "incident",
              applicationPeriods: [],
              impactedLineRefs: [metroLineId],
              impactedStopNames: ["Châtelet", "Louvre"],
            },
          ],
        },
        {
          lineRef: busLineId,
          status: "information",
          disruptions: [
            {
              id: "fixture-ghost-interruption",
              title: "Interruption de la ligne 38",
              kind: "incident",
              applicationPeriods: [],
              impactedLineRefs: [busLineId],
              impactedStopNames: ["Châtelet"],
            },
          ],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("/api/traffic")
          ? new Response(JSON.stringify(trafficPayload), { status: 200 })
          : new Response(null, { status: 404 }),
      ),
    );

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await flushPromises();

      const scene = fixture.renderer.render.mock.calls.at(-1)?.[1] as {
        activeLineId?: string;
        ghostLineIds?: string[];
        interruptionLineIds?: string[];
        trafficPathSpans?: Array<{ kind?: string }>;
      };
      expect(scene.activeLineId).toBe(metroLineId);
      expect(scene.ghostLineIds).toContain(busLineId);
      expect(scene.interruptionLineIds).not.toContain(busLineId);
      expect(scene.trafficPathSpans).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: "disturbance" })]),
      );
    } finally {
      fixture.viewportPaths = originalViewportPaths;
      routeState.query = {};
      vi.unstubAllGlobals();
    }
  });

  it("enables traffic by default when a line is selected and disables it in global mode", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/api/traffic")
        ? new Response(JSON.stringify({
            configured: true,
            generatedAt: "2026-08-11T12:00:00.000Z",
            lines: [],
          }), { status: 200 })
        : new Response(null, { status: 404 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();

      await wrapper.get("[data-global-map-search] .global-map-search__open").trigger("click");
      await wrapper.get("[data-global-map-search] input").setValue("ligne 1");
      await new Promise((resolve) => setTimeout(resolve, 320));
      await flushPromises();
      const lineResult = wrapper.findAll("[data-global-map-search] .global-map-search__result")
        .find((button) => button.text().includes("Ligne 1"));
      expect(lineResult).toBeDefined();
      await lineResult!.trigger("click");
      await flushPromises();

      const toggle = wrapper.get("[data-global-map-traffic-toggle]");
      expect(toggle.attributes("aria-checked")).toBe("true");
      expect(toggle.attributes("data-state")).toBe("ready");

      const trafficRequests = fetchMock.mock.calls
        .map(([input]) => String(input))
        .filter((input) => input.includes("/api/traffic"));
      expect(trafficRequests).toHaveLength(2);
      expect(
        trafficRequests.map((input) => new URL(input, "http://localhost").searchParams.get("locale")),
      ).toEqual(["fr", "fr"]);
      expect(
        trafficRequests.some((input) => new URL(input, "http://localhost").searchParams.get("detail") === "1"),
      ).toBe(true);

      await wrapper.get("button.map-button--quiet").trigger("click");
      await flushPromises();
      expect(toggle.attributes("aria-checked")).toBe("false");
      expect(toggle.attributes("data-state")).toBe("disabled");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("opens the shared traffic calendar in the global sidebar and time-travels the map", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 11, 12, 0, 0));
    routeState.query = { line: fixture.network.lines[0]!.id, mergeDirections: "0" };
    const trafficPayload = {
      configured: true,
      generatedAt: "2026-08-11T12:00:00.000Z",
      lines: [{
        lineRef: fixture.network.lines[0]!.id,
        status: "planned",
        disruptions: [{
          id: "future-global-calendar",
          title: "Travaux prévus",
          message: "Le trafic sera interrompu entre Châtelet et Louvre.",
          kind: "works",
          applicationPeriods: [{
            begin: "20260820T000000",
            end: "20260821T000000",
          }],
          impactedLineRefs: [fixture.network.lines[0]!.id],
          impactedStopNames: [],
        }],
      }],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/api/traffic")
        ? new Response(JSON.stringify(trafficPayload), { status: 200 })
        : new Response(null, { status: 404 }),
    ));

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      await nextTick();

      const toggle = wrapper.get("[data-global-map-traffic-calendar-toggle]");
      expect(toggle.attributes("data-testid")).toBe("pattern-traffic-calendar-toggle");
      expect(wrapper.get(".global-transport-plan__actions").findAll("button")[0]).toBeDefined();

      await toggle.trigger("click");
      await flushPromises();
      expect(wrapper.find("[data-global-map-sidebar-traffic-calendar]").exists()).toBe(true);
      expect(wrapper.get("[data-global-map-picker-sidebar] h2").text()).toContain(
        "Calendrier des impacts",
      );

      await wrapper.get('[data-date="2026-08-20"]').trigger("click");
      await flushPromises();
      await vi.advanceTimersByTimeAsync(700);
      await flushPromises();
      const futureScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as {
        interruptedStationIds?: string[];
        trafficPathSpans?: Array<{ kind?: string }>;
      };
      expect(futureScene.interruptedStationIds).toEqual(
        expect.arrayContaining(["station:a", "station:b"]),
      );
      expect(futureScene.trafficPathSpans).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: "interruption" })]),
      );

      await wrapper.get(".pattern-traffic-calendar__today").trigger("click");
      await flushPromises();
      await vi.advanceTimersByTimeAsync(700);
      await flushPromises();
      const todayScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as {
        interruptedStationIds?: string[];
        trafficPathSpans?: unknown[];
      };
      expect(todayScene.interruptedStationIds).toEqual([]);
      expect(todayScene.trafficPathSpans).toEqual([]);

      await wrapper.get('[data-testid="pattern-traffic-calendar-expand"]').trigger("click");
      await nextTick();
      expect(document.body.querySelector(".global-map-sidebar-traffic-calendar-modal")).not.toBeNull();
    } finally {
      routeState.query = {};
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("keeps non-hub bus stops out of the global overview while retaining hub nodes", async () => {
    const originalStations = fixture.network.stations;
    const originalStationsById = fixture.network.stationsById;
    const busOnlyStation = {
      ...fixture.network.stations[1]!,
      id: "station:bus-only",
      name: "Arrêt de bus",
      normalizedName: "arret de bus",
      lineIds: ["line:bus:38"],
      // The compiled bootstrap can mark road stop areas as hubs. The global
      // overview must still treat bus-only records as non-node data unless
      // they are explicitly selected or part of a focused context.
      isHub: true,
      worldX: 0.5062,
      worldY: 0.3514,
    };
    fixture.network.stations = [...originalStations, busOnlyStation];
    fixture.network.stationsById = new Map(
      fixture.network.stations.map((station) => [station.id, station]),
    );

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      const bus = wrapper.get('[data-global-map-preset="BUS"] .global-transport-plan__mode-preset-select');
      await bus.trigger("click");
      await flushPromises();

      const scene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { stations?: Array<{ id: string }> }
        | undefined;
      const stationIds = scene?.stations?.map((station) => station.id) ?? [];
      expect(stationIds).not.toContain(busOnlyStation.id);
      expect(stationIds).toContain("station:a");
    } finally {
      fixture.network.stations = originalStations;
      fixture.network.stationsById = originalStationsById;
    }
  });

  it("opens the PRIM installation modal when the Bike dataset is absent", async () => {
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

    const bike = wrapper.get('[data-global-map-preset="BIKE"] .global-transport-plan__mode-preset-select');
    expect(bike.attributes("aria-disabled")).toBe("true");
    expect(bike.attributes("disabled")).toBeUndefined();
    await bike.trigger("click");
    await flushPromises();

    expect(document.body.textContent).toContain("Installer le réseau vélo PRIM");
    expect(document.body.textContent).toContain("update:all:bikes-network-data");
  });

  it("exposes Noctilien as an exclusive preset and includes it in Tout afficher", async () => {
    const originalModes = [...fixture.manifest.modes];
    fixture.manifest.modes = [...originalModes, "NOCTILIEN"];

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();

      const primaryGroup = wrapper.findAll("[data-global-map-filters] .global-transport-plan__filter-group")[0]!;
      const noctilienToggle = primaryGroup.get('[data-global-map-preset="NOCTILIEN"] .global-transport-plan__mode-preset-select');
      expect(noctilienToggle.attributes("aria-pressed")).toBe("false");
      await noctilienToggle.trigger("click");
      await flushPromises();
      expect(wrapper.find("[data-global-map-line-panel]").exists()).toBe(false);
      expect(noctilienToggle.attributes("aria-pressed")).toBe("true");

      await wrapper.get('[data-global-map-preset="ALL"] .global-transport-plan__mode-preset-select').trigger("click");
      await flushPromises();

      const afterAllGroup = wrapper.get("[data-global-map-filters] .global-transport-plan__filter-group");
      expect(afterAllGroup.get('[data-global-map-preset="ALL"] .global-transport-plan__mode-preset-select').attributes("aria-pressed")).toBe("true");
      expect(afterAllGroup.get('[data-global-map-preset="BUS"] .global-transport-plan__mode-preset-select').attributes("aria-pressed")).toBe("false");
      expect(afterAllGroup.get('[data-global-map-preset="NOCTILIEN"] .global-transport-plan__mode-preset-select').attributes("aria-pressed")).toBe("false");
    } finally {
      fixture.manifest.modes = originalModes;
    }
  });

  it("switches exclusive presets without opening the family detail panel", async () => {
    const originalModes = [...fixture.manifest.modes];
    fixture.manifest.modes = ["BUS", "METRO", "RER"];

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();

      const primaryGroup = wrapper.findAll("[data-global-map-filters] .global-transport-plan__filter-group")[0]!;
      const rer = primaryGroup.get('[data-global-map-preset="RER"] .global-transport-plan__mode-preset-select');

      await rer.trigger("click");
      await flushPromises();
      expect(wrapper.find("[data-global-map-line-panel]").exists()).toBe(false);
      expect(rer.attributes("aria-pressed")).toBe("true");
      expect(primaryGroup.get('[data-global-map-preset="METRO"] .global-transport-plan__mode-preset-select').attributes("aria-pressed")).toBe("false");
      expect(primaryGroup.get('[data-global-map-preset="BUS"] .global-transport-plan__mode-preset-select').attributes("aria-pressed")).toBe("false");

      const metro = primaryGroup.get('[data-global-map-preset="METRO"] .global-transport-plan__mode-preset-select');
      await metro.trigger("click");
      await flushPromises();
      expect(metro.attributes("aria-pressed")).toBe("true");
      expect(rer.attributes("aria-pressed")).toBe("false");

      const all = primaryGroup.get('[data-global-map-preset="ALL"] .global-transport-plan__mode-preset-select');
      await all.trigger("click");
      await flushPromises();
      expect(all.attributes("aria-pressed")).toBe("true");
      expect(primaryGroup.get('[data-global-map-preset="METRO"] .global-transport-plan__mode-preset-select').attributes("aria-pressed")).toBe("false");
      expect(primaryGroup.get('[data-global-map-preset="RER"] .global-transport-plan__mode-preset-select').attributes("aria-pressed")).toBe("false");
      expect(primaryGroup.get('[data-global-map-preset="BUS"] .global-transport-plan__mode-preset-select').attributes("aria-pressed")).toBe("false");
    } finally {
      fixture.manifest.modes = originalModes;
    }
  });

  it("keeps a station hover target larger than its rendered dot", async () => {
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushPromises();

    const canvas = wrapper.get("canvas.global-transport-plan__canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 500,
      width: 800,
      height: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as {
      centerWorldX: number;
      centerWorldY: number;
      zoom: number;
      bearing: 0;
      viewportWidthCssPx: number;
      viewportHeightCssPx: number;
      pixelRatio: number;
      generation: number;
    } | undefined;
    if (!renderedCamera) throw new Error("Expected a rendered camera");
    const stationPoint = worldToScreen({
      x: fixture.network.stations[0].worldX,
      y: fixture.network.stations[0].worldY,
    }, renderedCamera);

    await canvas.trigger("pointermove", {
      clientX: stationPoint.x + 14,
      clientY: stationPoint.y,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await flushPromises();

    expect(canvas.classes()).toContain("global-transport-plan__canvas--station-hover");
    const hoveredScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
      | { hoveredStationId?: string }
      | undefined;
    expect(hoveredScene?.hoveredStationId).toBe(fixture.network.stations[0].id);
    expect(wrapper.get(".global-transport-plan__tooltip").text()).toContain(fixture.network.stations[0].name);
  });

  it("does not let a hidden overview station steal line hover or clicks", async () => {
    const hubStation = fixture.network.stations[0]!;
    const originalHubState = hubStation.isHub;
    hubStation.isHub = false;

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await flushPromises();

      const canvas = wrapper.get("canvas.global-transport-plan__canvas");
      vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        right: 800,
        bottom: 500,
        width: 800,
        height: 500,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      const canvasWithPointerCapture = canvas.element as HTMLCanvasElement & {
        hasPointerCapture: (pointerId: number) => boolean;
      };
      canvasWithPointerCapture.hasPointerCapture = () => false;
      const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as Parameters<typeof worldToScreen>[1] | undefined;
      if (!renderedCamera) throw new Error("Expected a rendered camera");
      expect(renderedCamera.zoom).toBeLessThan(14);

      const hiddenStationPoint = worldToScreen({
        x: fixture.network.stations[1]!.worldX,
        y: fixture.network.stations[1]!.worldY,
      }, renderedCamera);

      await canvas.trigger("pointermove", {
        clientX: hiddenStationPoint.x,
        clientY: hiddenStationPoint.y,
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await flushPromises();

      const hoveredScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { hoveredStationId?: string; hoveredLineId?: string }
        | undefined;
      expect(hoveredScene?.hoveredStationId).toBeUndefined();
      expect(hoveredScene?.hoveredLineId).toBe(fixture.network.lines[0]!.id);
      expect(canvas.classes()).not.toContain("global-transport-plan__canvas--station-hover");

      await canvas.trigger("pointerdown", {
        clientX: hiddenStationPoint.x,
        clientY: hiddenStationPoint.y,
        pointerId: 1,
        button: 0,
        isPrimary: true,
      });
      await canvas.trigger("pointerup", {
        clientX: hiddenStationPoint.x,
        clientY: hiddenStationPoint.y,
        pointerId: 1,
        button: 0,
        isPrimary: true,
      });
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await flushPromises();

      expect((fixture.renderer.render.mock.calls.at(-1)?.[1] as { activeLineId?: string }).activeLineId)
        .toBe(fixture.network.lines[0]!.id);
    } finally {
      hubStation.isHub = originalHubState;
    }
  });

  it("does not let a same-family two-line hub steal an overview line", async () => {
    const primaryLine = fixture.network.lines[0]!;
    const siblingLine = fixture.network.lines[1]!;
    const originalPrimaryMode = primaryLine.mode;
    const originalSiblingMode = siblingLine.mode;
    const sameFamilyStation = fixture.network.stations[1]!;
    const originalStationLines = sameFamilyStation.lineIds;
    const originalStationHubState = sameFamilyStation.isHub;
    siblingLine.mode = "METRO";
    sameFamilyStation.lineIds = [primaryLine.id, siblingLine.id];
    sameFamilyStation.isHub = true;

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await flushPromises();

      const canvas = wrapper.get("canvas.global-transport-plan__canvas");
      vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        right: 800,
        bottom: 500,
        width: 800,
        height: 500,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      const canvasWithPointerCapture = canvas.element as HTMLCanvasElement & {
        hasPointerCapture: (pointerId: number) => boolean;
      };
      canvasWithPointerCapture.hasPointerCapture = () => false;
      const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as Parameters<typeof worldToScreen>[1] | undefined;
      if (!renderedCamera) throw new Error("Expected a rendered camera");
      expect(renderedCamera.zoom).toBeLessThan(14);

      const hubPoint = worldToScreen({
        x: sameFamilyStation.worldX,
        y: sameFamilyStation.worldY,
      }, renderedCamera);
      await canvas.trigger("pointermove", {
        clientX: hubPoint.x,
        clientY: hubPoint.y,
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await flushPromises();

      const hoveredScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { hoveredStationId?: string; hoveredLineId?: string }
        | undefined;
      expect(hoveredScene?.hoveredStationId).toBeUndefined();
      expect(hoveredScene?.hoveredLineId).toBe(primaryLine.id);
      expect(canvas.classes()).not.toContain("global-transport-plan__canvas--station-hover");

      await canvas.trigger("pointerdown", {
        clientX: hubPoint.x,
        clientY: hubPoint.y,
        pointerId: 1,
        button: 0,
        isPrimary: true,
      });
      await canvas.trigger("pointerup", {
        clientX: hubPoint.x,
        clientY: hubPoint.y,
        pointerId: 1,
        button: 0,
        isPrimary: true,
      });
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await flushPromises();

      const clickedScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { activeLineId?: string; activeStationId?: string }
        | undefined;
      expect(clickedScene?.activeLineId).toBe(primaryLine.id);
      expect(clickedScene?.activeStationId).toBeUndefined();
    } finally {
      primaryLine.mode = originalPrimaryMode;
      siblingLine.mode = originalSiblingMode;
      sameFamilyStation.lineIds = originalStationLines;
      sameFamilyStation.isHub = originalStationHubState;
    }
  });

  it("keeps every station of an active line available for hover and clicks", async () => {
    const originalQuery = routeState.query;
    const hubStation = fixture.network.stations[0]!;
    const originalHubState = hubStation.isHub;
    hubStation.isHub = false;
    routeState.query = { line: fixture.network.lines[0]!.id };

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await flushPromises();

      const canvas = wrapper.get("canvas.global-transport-plan__canvas");
      vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        right: 800,
        bottom: 500,
        width: 800,
        height: 500,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      const canvasWithPointerCapture = canvas.element as HTMLCanvasElement & {
        hasPointerCapture: (pointerId: number) => boolean;
      };
      canvasWithPointerCapture.hasPointerCapture = () => false;
      const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as Parameters<typeof worldToScreen>[1] | undefined;
      if (!renderedCamera) throw new Error("Expected a rendered camera");
      expect(renderedCamera.zoom).toBeLessThan(14);

      const activeScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { activeLineId?: string }
        | undefined;
      expect(activeScene?.activeLineId).toBe(fixture.network.lines[0]!.id);

      const hiddenStationPoint = worldToScreen({
        x: fixture.network.stations[1]!.worldX,
        y: fixture.network.stations[1]!.worldY,
      }, renderedCamera);

      await canvas.trigger("pointermove", {
        clientX: hiddenStationPoint.x,
        clientY: hiddenStationPoint.y,
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await flushPromises();

      const hoveredScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { hoveredStationId?: string; hoveredLineId?: string }
        | undefined;
      expect(hoveredScene?.hoveredStationId).toBe(fixture.network.stations[1]!.id);
      expect(hoveredScene?.hoveredLineId).toBeUndefined();
      expect(canvas.classes()).toContain("global-transport-plan__canvas--station-hover");

      await canvas.trigger("pointerdown", {
        clientX: hiddenStationPoint.x,
        clientY: hiddenStationPoint.y,
        pointerId: 1,
        button: 0,
        isPrimary: true,
      });
      await canvas.trigger("pointerup", {
        clientX: hiddenStationPoint.x,
        clientY: hiddenStationPoint.y,
        pointerId: 1,
        button: 0,
        isPrimary: true,
      });
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await flushPromises();

      const clickedScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { activeLineId?: string; activeStationId?: string }
        | undefined;
      expect(clickedScene?.activeLineId).toBe(fixture.network.lines[0]!.id);
      expect(clickedScene?.activeStationId).toBe(fixture.network.stations[1]!.id);
    } finally {
      routeState.query = originalQuery;
      hubStation.isHub = originalHubState;
    }
  });

  it("offers nearby lines in an interactive tooltip and focuses the selected option", async () => {
    const originalLines = fixture.network.lines;
    const originalLinesById = fixture.network.linesById;
    const originalViewportPaths = fixture.viewportPaths;
    const originalQuery = routeState.query;
    const primaryLine = {
      ...fixture.network.lines[0]!,
      id: "line:metro:primary",
      index: 2,
      code: "1x",
      label: "1x",
      stationIds: [],
      geometryIds: ["path:metro:primary"],
    };
    const siblingLine = {
      ...primaryLine,
      id: "line:metro:sibling",
      index: 3,
      code: "1y",
      label: "1y",
      geometryIds: ["path:metro:sibling"],
    };
    const center = { x: 0.5, y: 0.35 };
    const offset = metersToWorldUnits(4, center);
    const primaryPath = {
      ...fixture.path,
      id: "path:metro:primary",
      lineId: primaryLine.id,
      stationIds: [],
      vertices: [{ stationId: "", x: 0.499, y: 0.35 }, { stationId: "", x: 0.501, y: 0.35 }],
      minX: 0.499,
      minY: 0.35,
      maxX: 0.501,
      maxY: 0.35,
    };
    const siblingPath = {
      ...primaryPath,
      id: "path:metro:sibling",
      lineId: siblingLine.id,
      vertices: [{ stationId: "", x: 0.499, y: 0.35 + offset }, { stationId: "", x: 0.501, y: 0.35 + offset }],
      minY: 0.35 + offset,
      maxY: 0.35 + offset,
    };
    fixture.network.lines = [...originalLines, primaryLine, siblingLine];
    fixture.network.linesById = new Map(
      fixture.network.lines.map((line) => [line.id, line]),
    );
    fixture.viewportPaths = [fixture.path, primaryPath, siblingPath];
    routeState.query = { station: fixture.network.stations[0]!.id };

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await flushPromises();
      const canvas = wrapper.get("canvas.global-transport-plan__canvas");
      vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        right: 800,
        bottom: 500,
        width: 800,
        height: 500,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as Parameters<typeof worldToScreen>[1] | undefined;
      if (!renderedCamera) throw new Error("Expected a rendered camera");
      const pointer = worldToScreen(center, renderedCamera);

      await canvas.trigger("pointermove", { clientX: pointer.x, clientY: pointer.y });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await flushPromises();

      const tooltip = wrapper.get(".global-transport-plan__tooltip");
      const choices = tooltip.findAll(".global-transport-plan__tooltip-choice");
      expect(choices).toHaveLength(2);
      expect(tooltip.text()).toContain(primaryLine.label);
      expect(tooltip.text()).toContain(siblingLine.label);
      expect(tooltip.classes()).toContain("global-transport-plan__tooltip--material");
      expect((fixture.renderer.render.mock.calls.at(-1)?.[1] as { hoveredLineId?: string }).hoveredLineId).toBe(primaryLine.id);
      expect(wrapper.get("[data-global-map-picker-sidebar]").attributes("data-global-map-line-preview")).toBe(primaryLine.id);
      expect(wrapper.get("[data-global-map-picker-sidebar]").text()).toContain(primaryLine.label);
      const radiusCallsBeforeChoiceHover = fixture.dataSourceCalls.queryStationsWithinRadius.mock.calls.length;

      await canvas.trigger("pointerdown", { pointerId: 1, clientX: pointer.x, clientY: pointer.y });
      await canvas.trigger("pointerup", { pointerId: 1, clientX: pointer.x, clientY: pointer.y });
      await nextTick();
      expect(wrapper.findAll(".global-transport-plan__tooltip-choice")).toHaveLength(2);

      await choices[1]!.trigger("focus");
      await new Promise((resolve) => setTimeout(resolve, 0));
      await flushPromises();
      expect((fixture.renderer.render.mock.calls.at(-1)?.[1] as { hoveredLineId?: string }).hoveredLineId).toBe(siblingLine.id);
      expect(choices[1]!.classes()).toContain("global-transport-plan__tooltip-choice--active");
      expect(wrapper.get("[data-global-map-picker-sidebar]").attributes("data-global-map-line-preview")).toBe(siblingLine.id);
      expect(wrapper.get("[data-global-map-picker-sidebar]").text()).toContain(siblingLine.label);
      expect(fixture.dataSourceCalls.queryStationsWithinRadius.mock.calls.length).toBe(radiusCallsBeforeChoiceHover);

      await choices[1]!.trigger("blur");
      // The sidebar holds the previous preview body for the 100ms tooltip
      // gap debounce before restoring the station correspondences.
      await new Promise((resolve) => setTimeout(resolve, 110));
      await flushPromises();
      expect(wrapper.get("[data-global-map-picker-sidebar]").attributes("data-global-map-line-preview")).toBeUndefined();
      expect(wrapper.findAll(".station-transfer-details__item")).toHaveLength(2);

      await choices[1]!.trigger("focus");
      await flushPromises();

      await tooltip.trigger("pointerleave");
      await new Promise((resolve) => setTimeout(resolve, 110));
      await flushPromises();
      expect(wrapper.find(".global-transport-plan__tooltip").exists()).toBe(true);
      expect(wrapper.get("[data-global-map-picker-sidebar]").attributes("data-global-map-line-preview")).toBeUndefined();
      expect(wrapper.findAll(".station-transfer-details__item")).toHaveLength(2);
      await wrapper.get("[data-global-map-picker-sidebar]").trigger("pointerleave");
      await flushPromises();
      expect(wrapper.find(".global-transport-plan__tooltip").exists()).toBe(true);

      await wrapper.get(".global-transport-plan").trigger("keydown", { key: "Escape" });
      await nextTick();
      expect(wrapper.find(".global-transport-plan__tooltip").exists()).toBe(false);
      expect(wrapper.get("[data-global-map-picker-sidebar]").attributes("data-global-map-line-preview")).toBeUndefined();
      expect(wrapper.findAll(".station-transfer-details__item")).toHaveLength(2);

      await canvas.trigger("pointermove", { clientX: pointer.x, clientY: pointer.y });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await flushPromises();
      await canvas.trigger("pointerdown", { pointerId: 1, clientX: pointer.x, clientY: pointer.y });
      await canvas.trigger("pointerup", { pointerId: 1, clientX: pointer.x, clientY: pointer.y });
      await nextTick();
      const reopenedChoices = wrapper.findAll(".global-transport-plan__tooltip-choice");
      expect(reopenedChoices).toHaveLength(2);

      await wrapper.get(".global-transport-plan").trigger("keydown", { key: "Enter" });
      await nextTick();
      expect((document.activeElement as HTMLElement | null)?.classList.contains("global-transport-plan__tooltip-choice")).toBe(true);

      await reopenedChoices[1]!.trigger("click");
      await flushPromises();
      expect(wrapper.find(".global-transport-plan__tooltip").exists()).toBe(false);
      expect((fixture.renderer.render.mock.calls.at(-1)?.[1] as { activeLineId?: string }).activeLineId).toBe(siblingLine.id);
    } finally {
      fixture.network.lines = originalLines;
      fixture.network.linesById = originalLinesById;
      fixture.viewportPaths = originalViewportPaths;
      routeState.query = originalQuery;
    }
  });

  it("reveals correspondence nodes without labels on line hover and lets the path switch focus", async () => {
    const station = fixture.network.stations[0]!;
    const ghostStation = {
      ...fixture.network.stations[1]!,
      id: "station:ghost-only",
      index: 2,
      name: "Bus fantôme",
      normalizedName: "bus fantome",
      rawRefs: ["station:ghost-only"],
      lineIds: [fixture.network.lines[1]!.id],
      worldX: 0.515,
      worldY: 0.355,
    };
    const bus = fixture.network.lines[1]!;
    const originalStations = [...fixture.network.stations];
    const originalBusStationIds = [...bus.stationIds];
    const ghostPath = {
      ...fixture.ghostPath,
      id: "path:ghost-only",
      stationIds: [station.id, ghostStation.id],
      vertices: [
        { stationId: station.id, x: station.worldX, y: station.worldY },
        { stationId: ghostStation.id, x: ghostStation.worldX, y: ghostStation.worldY },
      ],
      minX: Math.min(station.worldX, ghostStation.worldX),
      minY: Math.min(station.worldY, ghostStation.worldY),
      maxX: Math.max(station.worldX, ghostStation.worldX),
      maxY: Math.max(station.worldY, ghostStation.worldY),
    };
    fixture.network.stations.push(ghostStation);
    fixture.network.stationsById.set(ghostStation.id, ghostStation);
    bus.stationIds = [...originalBusStationIds, ghostStation.id];
    fixture.viewportPaths = [fixture.path, ghostPath];
    routeState.query = { line: fixture.network.lines[0]!.id, station: station.id };

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await flushPromises();

      const focusedScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { stations?: Array<{ id: string }>; paths?: Array<{ id: string }>; ghostLineIds?: string[] }
        | undefined;
      expect(focusedScene?.stations?.map((item) => item.id)).not.toContain(ghostStation.id);
      expect(focusedScene?.paths?.map((item) => item.id)).toContain(ghostPath.id);
      expect(focusedScene?.ghostLineIds).toContain(bus.id);

      const canvas = wrapper.get("canvas.global-transport-plan__canvas");
      vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        right: 800,
        bottom: 500,
        width: 800,
        height: 500,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      const canvasWithPointerCapture = canvas.element as HTMLCanvasElement & {
        hasPointerCapture: (pointerId: number) => boolean;
      };
      canvasWithPointerCapture.hasPointerCapture = () => false;
      const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as {
        centerWorldX: number;
        centerWorldY: number;
        zoom: number;
        bearing: 0;
        viewportWidthCssPx: number;
        viewportHeightCssPx: number;
        pixelRatio: number;
        generation: number;
      };
      const pathPoint = worldToScreen({
        x: (station.worldX + ghostStation.worldX) / 2,
        y: (station.worldY + ghostStation.worldY) / 2,
      }, renderedCamera);

      await canvas.trigger("pointermove", {
        clientX: pathPoint.x,
        clientY: pathPoint.y,
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await flushPromises();

      expect(wrapper.get(".global-transport-plan__tooltip").text()).toContain(bus.label);
      expect(wrapper.find(".global-transport-plan__tooltip .line-icon-badge").exists()).toBe(true);
      expect(wrapper.get("[data-global-map-picker-sidebar]").attributes("data-global-map-line-preview")).toBe(bus.id);
      expect(wrapper.get("[data-global-map-picker-sidebar]").text()).toContain(bus.label);
      const hoveredScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { hoveredLineId?: string; stations?: Array<{ id: string }> }
        | undefined;
      expect(hoveredScene?.hoveredLineId).toBe(bus.id);
      expect(hoveredScene?.stations?.map((item) => item.id)).toContain(ghostStation.id);

      await canvas.trigger("wheel", {
        deltaY: 24,
        clientX: pathPoint.x,
        clientY: pathPoint.y,
      });
      await canvas.trigger("pointermove", {
        clientX: pathPoint.x,
        clientY: pathPoint.y,
      });
      await flushPromises();

      const wheelScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { hoveredLineId?: string }
        | undefined;
      expect(wheelScene?.hoveredLineId).toBeUndefined();
      expect(wrapper.find(".global-transport-plan__tooltip").exists()).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 400));
      await canvas.trigger("pointermove", {
        clientX: pathPoint.x,
        clientY: pathPoint.y,
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await flushPromises();
      expect(
        (fixture.renderer.render.mock.calls.at(-1)?.[1] as { hoveredLineId?: string })
          .hoveredLineId,
      ).toBe(bus.id);

      await canvas.trigger("pointerleave", { relatedTarget: document.body });
      await flushPromises();
      expect(wrapper.get("[data-global-map-picker-sidebar]").attributes("data-global-map-line-preview")).toBeUndefined();
      expect(wrapper.get("[data-global-map-picker-sidebar]").text()).toContain(fixture.network.lines[0]!.label);

      await canvas.trigger("pointerdown", {
        clientX: pathPoint.x,
        clientY: pathPoint.y,
        pointerId: 1,
        button: 0,
        isPrimary: true,
      });
      await canvas.trigger("pointerup", {
        clientX: pathPoint.x,
        clientY: pathPoint.y,
        pointerId: 1,
        button: 0,
        isPrimary: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await flushPromises();

      const lineScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { activeLineId?: string; stations?: Array<{ id: string }> }
        | undefined;
      expect(lineScene?.activeLineId).toBe(bus.id);
      expect(lineScene?.stations?.map((item) => item.id)).toContain(ghostStation.id);
    } finally {
      fixture.network.stations.splice(0, fixture.network.stations.length, ...originalStations);
      fixture.network.stationsById.delete(ghostStation.id);
      bus.stationIds = originalBusStationIds;
      fixture.viewportPaths = [fixture.path];
      routeState.query = {};
    }
  });

  it("highlights a sidebar ghost line on hover and selects it on click", async () => {
    const originalPaths = fixture.viewportPaths;
    fixture.viewportPaths = [fixture.path, fixture.ghostPath];
    routeState.query = { station: fixture.network.stations[0]!.id };

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();

      const transferItems = wrapper.findAll(".station-transfer-details__item");
      expect(transferItems).toHaveLength(2);
      const busTransfer = transferItems[1]!;

      await busTransfer.trigger("mouseenter");
      await flushPromises();

      const hoveredScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { hoveredLineId?: string }
        | undefined;
      expect(hoveredScene?.hoveredLineId).toBe(fixture.network.lines[1]!.id);
      expect(wrapper.get("[data-global-map-picker-sidebar]").attributes("data-global-map-line-preview")).toBeUndefined();
      expect(wrapper.find(".global-map-picker-sidebar__line-profile").exists()).toBe(false);
      expect(wrapper.findAll(".station-transfer-details__item")).toHaveLength(2);

      await wrapper.get("[data-global-map-picker-sidebar]").trigger("pointerleave");
      await flushPromises();

      const clearedScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { hoveredLineId?: string }
        | undefined;
      expect(clearedScene?.hoveredLineId).toBeUndefined();
      expect(wrapper.get("[data-global-map-picker-sidebar]").attributes("data-global-map-line-preview")).toBeUndefined();
      expect(wrapper.findAll(".station-transfer-details__item")).toHaveLength(2);

      await wrapper.findAll(".station-transfer-details__item")[1]!.trigger("click");
      await new Promise((resolve) => setTimeout(resolve, 0));
      await flushPromises();
      const selectedScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { activeLineId?: string }
        | undefined;
      expect(selectedScene?.activeLineId).toBe(fixture.network.lines[1]!.id);
      expect(wrapper.get("[data-global-map-picker-sidebar]").attributes("data-global-map-line-preview")).toBeUndefined();
      expect(wrapper.find(".global-map-picker-sidebar__line-profile").exists()).toBe(true);
      expect(wrapper.get(".global-map-picker-sidebar").text()).toContain(fixture.network.lines[1]!.label);
    } finally {
      fixture.viewportPaths = originalPaths;
      routeState.query = {};
    }
  });

  it("forwards the global basemap contrast to the raster layer", async () => {
    const wrapper = mount(GlobalTransportPlan, {
      attachTo: document.body,
      props: { basemapContrast: 1.12 },
    });
    wrappers.push(wrapper);
    await flushPromises();

    expect(wrapper.get("[data-transport-map-basemap] img").attributes("style")).toContain(
      "contrast(1.12)",
    );
  });

  it("forwards the configured basemap style to the raster layer", async () => {
    const wrapper = mount(GlobalTransportPlan, {
      attachTo: document.body,
      props: { basemapStyle: "light" },
    });
    wrappers.push(wrapper);
    await flushPromises();

    expect(wrapper.get("[data-transport-map-basemap]").attributes("data-basemap-style")).toBe(
      "light",
    );
    expect(wrapper.get("[data-transport-map-basemap] img").attributes("src")).toContain(
      "basemaps.cartocdn.com/light_all/",
    );
  });

  it("keeps diagnostics opt-in and exposes an exportable debug panel", async () => {
    routeState.query = { mapDebug: "1" };
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

    expect(wrapper.find("[data-global-map-debug]").exists()).toBe(true);
    expect(wrapper.find("[data-global-map-debug]").text()).toContain("Diagnostic performance");
    await wrapper.get("[data-global-map-debug] button").trigger("click");
    expect(wrapper.find("[data-global-map-debug] button").exists()).toBe(true);
  });

  it("activates a detailed line geometry audit from debugLine", async () => {
    routeState.query = { debugLine: "1" };
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

    expect(wrapper.get("[data-global-map-line-debug]").text()).toContain("ligne 1");
    expect(wrapper.get("[data-global-map-line-debug]").text()).toContain("Châtelet");
    const lastViewportCall = fixture.dataSourceCalls.queryViewport.mock.calls.at(-1);
    expect(lastViewportCall?.[3]).toBe(fixture.network.lines[0].id);
  });

  it("restores a station from the URL, exposes entrances and delegates dashboard add", async () => {
    routeState.query = { station: "station:a" };
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

    expect(wrapper.find(".global-map-picker-sidebar").text()).toContain("Châtelet");
    expect(wrapper.findAll(".global-transport-plan__station-pulse")).toHaveLength(1);
    const entrancesToggle = wrapper.get("#global-map-picker-sidebar-entrances-toggle");
    expect(entrancesToggle.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(".global-map-picker-sidebar__list").exists()).toBe(false);
    await entrancesToggle.trigger("click");
    expect(entrancesToggle.attributes("aria-expanded")).toBe("true");
    expect(wrapper.get(".global-map-picker-sidebar__list").text()).toContain("Sortie 1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushPromises();
    const renderedScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
      | { entrances?: Array<{ stationId: string }> }
      | undefined;
    expect(renderedScene?.entrances?.map((entrance) => entrance.stationId)).toEqual(["station:a"]);
    const addButton = wrapper.findAll("button").find((button) => button.text() === "Ajouter au tableau");
    expect(addButton).toBeDefined();
    await addButton!.trigger("click");
    await flushPromises();
    expect(fixture.dashboardAdd).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("ajoutée");
  });

  it("restores the focused line when a URL contains both line and station", async () => {
    routeState.query = { line: fixture.network.lines[0].id, station: "station:a" };
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushPromises();

    const scene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
      | { activeLineId?: string }
      | undefined;
    const lastViewportCall = fixture.dataSourceCalls.queryViewport.mock.calls.at(-1);
    expect(scene?.activeLineId).toBe(fixture.network.lines[0].id);
    expect(lastViewportCall?.[3]).toBe(fixture.network.lines[0].id);
  });

  it("preloads detailed nearby-line geometry before publishing ghost correspondences", async () => {
    const metroId = fixture.network.lines[0]!.id;
    const busId = fixture.network.lines[1]!.id;
    fixture.network.stations[0]!.lineIds = [metroId];
    fixture.network.stations[1]!.lineIds = [busId];
    fixture.radiusResults = [{ station: fixture.network.stations[1], distanceMeters: 120 }];
    routeState.query = { line: metroId, station: fixture.network.stations[0]!.id };

    let releasePreload: () => void = () => undefined;
    const preloadGate = new Promise<void>((resolve) => {
      releasePreload = resolve;
    });
    let markPreloadStarted: () => void = () => undefined;
    const preloadStarted = new Promise<void>((resolve) => {
      markPreloadStarted = resolve;
    });

    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    fixture.dataSourceCalls.queryViewport.mockImplementation(
      async (_camera, _mask, generation, _detailLineId, forcedLineIds = []) => {
        const includesNearbyBus = forcedLineIds.includes(busId);
        if (includesNearbyBus) {
          markPreloadStarted();
          await preloadGate;
        }
        return {
          generation,
          chunkIds: ["chunk:0:0"],
          paths: includesNearbyBus ? [fixture.path, fixture.ghostPath] : [fixture.path],
          stations: fixture.network.stations,
          bytes: 123,
          fromCache: true,
        };
      },
    );

    await preloadStarted;
    await flushPromises();
    const scenesBeforePreload = fixture.renderer.render.mock.calls.map(
      (call) => call[1] as { ghostLineIds?: string[]; paths?: Array<{ lineId: string }> },
    );
    expect(scenesBeforePreload.every((scene) => !scene.ghostLineIds?.includes(busId))).toBe(true);
    expect(scenesBeforePreload.every((scene) => !scene.paths?.some((path) => path.lineId === busId))).toBe(true);

    releasePreload();
    await flushPromises();
    await vi.waitFor(() => {
      const finalScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { ghostLineIds?: string[]; paths?: Array<{ lineId: string }> }
        | undefined;
      expect(finalScene?.ghostLineIds).toContain(busId);
      expect(finalScene?.paths?.some((path) => path.lineId === busId)).toBe(true);
    });
    const preloadCall = fixture.dataSourceCalls.queryViewport.mock.calls.find((call) =>
      (call[4] as string[] | undefined)?.includes(busId),
    );
    expect(preloadCall).toBeDefined();
  });

  it("numbers every nearby exit and centers the camera on the clicked exit", async () => {
    routeState.query = { station: "station:a" };
    fixture.radiusResults = [{ station: fixture.network.stations[1], distanceMeters: 120 }];
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushPromises();

    expect(fixture.dataSourceCalls.queryStationsWithinRadius).toHaveBeenCalledWith(2.3522, 48.8566, 350);
    const entrancesToggle = wrapper.get("#global-map-picker-sidebar-entrances-toggle");
    expect(entrancesToggle.attributes("aria-expanded")).toBe("false");
    await entrancesToggle.trigger("click");
    const exitButtons = wrapper.findAll("[data-testid='global-map-picker-focus-entrance']");
    expect(exitButtons).toHaveLength(2);
    expect(exitButtons[0].text()).toContain("Sortie 1");
    expect(exitButtons[1].text()).toContain("Sortie 2");
    await vi.waitFor(() => {
      const hasConnectedEntrances = fixture.renderer.render.mock.calls
        .map((call) => call[1] as { entranceStationIds?: string[] } | undefined)
        .some((scene) => ["station:a", "station:b"].every((id) => scene?.entranceStationIds?.includes(id)));
      expect(hasConnectedEntrances).toBe(true);
    });

    await exitButtons[1].trigger("click");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushPromises();

    const expectedEntrance = fixture.network.entrances[1]!;
    await vi.waitFor(() => {
      const focusedCamera = fixture.renderer.render.mock.calls
        .map((call) => call[0] as { centerWorldX?: number; centerWorldY?: number } | undefined)
        .find((camera) => camera?.centerWorldX === expectedEntrance.worldX && camera.centerWorldY === expectedEntrance.worldY);
      expect(focusedCamera).toBeDefined();
    });
    const renderedCamera = [...fixture.renderer.render.mock.calls]
      .reverse()
      .map((call) => call[0] as { centerWorldX?: number; centerWorldY?: number; zoom?: number } | undefined)
      .find((camera) => camera?.centerWorldX === expectedEntrance.worldX && camera.centerWorldY === expectedEntrance.worldY);
    expect(renderedCamera).toBeDefined();
    const focusedCamera = renderedCamera as
      | { centerWorldX: number; centerWorldY: number; zoom: number }
      | undefined;
    expect(focusedCamera?.centerWorldX).toBe(expectedEntrance.worldX);
    expect(focusedCamera?.centerWorldY).toBe(expectedEntrance.worldY);
    expect(focusedCamera?.zoom).toBeGreaterThanOrEqual(17);
    expect(exitButtons[1].attributes("aria-pressed")).toBe("true");
  });

  it("keeps every Croix de Berny RER B sidebar exit anchored in the rendered plan", async () => {
    const originalNetwork = {
      lines: fixture.network.lines,
      stations: fixture.network.stations,
      entrances: fixture.network.entrances,
      linesById: fixture.network.linesById,
      stationsById: fixture.network.stationsById,
      manifestModes: fixture.manifest.modes,
    };
    const rerB = {
      ...fixture.network.lines[0],
      id: "line:IDFM:C01743",
      code: "C01743",
      label: "B",
      mode: "RER",
      stationIds: ["station:FR::monomodalStopPlace:46007:FR1"],
      geometryIds: [],
    };
    const bus = {
      ...fixture.network.lines[1],
      id: "line:IDFM:C01321",
      code: "C01321",
      label: "321",
      stationIds: [
        "station:FR::Quay:50145166:FR1",
        "station:FR::Quay:50212254:FR1",
      ],
    };
    const croixDeBerny = {
      ...fixture.network.stations[0],
      id: "station:FR::monomodalStopPlace:46007:FR1",
      name: "La Croix de Berny",
      normalizedName: "la croix de berny",
      rawRefs: ["station:FR::monomodalStopPlace:46007:FR1"],
      lineIds: [rerB.id],
    };
    const firstExitStation = {
      ...fixture.network.stations[1],
      id: "station:FR::Quay:50145166:FR1",
      name: "La Croix de Berny RER",
      normalizedName: "la croix de berny rer",
      rawRefs: ["station:FR::Quay:50145166:FR1"],
      lineIds: [bus.id],
      worldX: croixDeBerny.worldX + 0.00005,
      worldY: croixDeBerny.worldY + 0.00005,
    };
    const secondExitStation = {
      ...firstExitStation,
      id: "station:FR::Quay:50212254:FR1",
      rawRefs: ["station:FR::Quay:50212254:FR1"],
      worldX: croixDeBerny.worldX - 0.00005,
      worldY: croixDeBerny.worldY + 0.00003,
    };
    const firstExit = {
      id: "IDFM:StopPlaceEntrance:50148629",
      stationIndex: firstExitStation.index,
      stationId: firstExitStation.id,
      name: "r. Velpeau",
      code: "2",
      lon: firstExitStation.lon,
      lat: firstExitStation.lat,
      worldX: firstExitStation.worldX,
      worldY: firstExitStation.worldY,
    };
    const secondExit = {
      ...firstExit,
      id: "IDFM:StopPlaceEntrance:50148630",
      stationIndex: secondExitStation.index,
      stationId: secondExitStation.id,
      name: "route de Versailles",
      code: "1",
      worldX: secondExitStation.worldX,
      worldY: secondExitStation.worldY,
    };

    fixture.network.lines = [rerB, bus];
    fixture.network.stations = [croixDeBerny, firstExitStation, secondExitStation];
    fixture.network.entrances = [firstExit, secondExit];
    fixture.network.linesById = new Map(fixture.network.lines.map((line) => [line.id, line]));
    fixture.network.stationsById = new Map(fixture.network.stations.map((station) => [station.id, station]));
    fixture.manifest.modes = ["BUS", "RER"];
    fixture.radiusResults = [
      { station: firstExitStation, distanceMeters: 40 },
      { station: secondExitStation, distanceMeters: 55 },
    ];
    routeState.query = {
      line: rerB.id,
      station: croixDeBerny.id,
    };

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await flushPromises();

      const entrancesToggle = wrapper.get("#global-map-picker-sidebar-entrances-toggle");
      expect(entrancesToggle.attributes("aria-expanded")).toBe("false");
      await entrancesToggle.trigger("click");
      const exitButtons = wrapper.findAll("[data-testid='global-map-picker-focus-entrance']");
      expect(exitButtons).toHaveLength(2);
      const sidebarExitIds = exitButtons.map((button) => button.attributes("data-entrance-id"));
      expect(sidebarExitIds).toEqual([
        secondExit.id,
        firstExit.id,
      ]);
      expect(wrapper.findAll(".global-map-picker-sidebar__nearby")).toHaveLength(0);

      const scene = [...fixture.renderer.render.mock.calls]
        .reverse()
        .map((call) => call[1] as {
          entrances?: Array<{ id: string; stationId: string }>;
          stations?: Array<{ id: string }>;
        })
        .find((candidate) => sidebarExitIds.every((id) => candidate.entrances?.some((entrance) => entrance.id === id)));
      const sceneEntrances = new Map((scene?.entrances ?? []).map((entrance) => [entrance.id, entrance]));
      const sceneStationIds = new Set((scene?.stations ?? []).map((station) => station.id));

      for (const button of exitButtons) {
        const entranceId = button.attributes("data-entrance-id");
        expect(entranceId).toBeDefined();
        if (!entranceId) continue;
        const entrance = sceneEntrances.get(entranceId);
        expect(entrance, `sidebar exit ${entranceId} is missing from the plan scene`).toBeDefined();
        expect(
          sceneStationIds.has(entrance!.stationId),
          `plan has no station anchor for sidebar exit ${entranceId}`,
        ).toBe(true);
      }
    } finally {
      fixture.network.lines = originalNetwork.lines;
      fixture.network.stations = originalNetwork.stations;
      fixture.network.entrances = originalNetwork.entrances;
      fixture.network.linesById = originalNetwork.linesById;
      fixture.network.stationsById = originalNetwork.stationsById;
      fixture.manifest.modes = originalNetwork.manifestModes;
      fixture.radiusResults = [];
      routeState.query = {};
    }
  });

  it("routes search station clicks to the existing station panel and exits", async () => {
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

    await wrapper.get("[data-global-map-search] .global-map-search__open").trigger("click");
    await wrapper.get("[data-global-map-search] input").setValue(fixture.network.stations[0].name);
    await new Promise((resolve) => setTimeout(resolve, 320));
    await flushPromises();
    await wrapper.get("[data-global-map-search] .global-map-search__result").trigger("click");
    await flushPromises();
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.zoomDurationMs +
          GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.panDurationMs +
          100,
      ),
    );
    await flushPromises();

    const expectedWorld = {
      x: fixture.network.stations[0].worldX,
      y: fixture.network.stations[0].worldY,
    };
    const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as
      | { centerWorldX?: number; centerWorldY?: number; zoom?: number }
      | undefined;
    expect(renderedCamera?.centerWorldX).toBeCloseTo(expectedWorld.x, 8);
    expect(renderedCamera?.centerWorldY).toBeCloseTo(expectedWorld.y, 8);
    expect(renderedCamera?.zoom).toBeCloseTo(
      GLOBAL_TRANSPORT_PLAN_CONFIG.selection.stationZoom,
      8,
    );

    expect(wrapper.find(".global-map-picker-sidebar").text()).toContain(fixture.network.stations[0].name);
    const entrancesToggle = wrapper.get("#global-map-picker-sidebar-entrances-toggle");
    expect(entrancesToggle.attributes("aria-expanded")).toBe("false");
    await entrancesToggle.trigger("click");
    expect(wrapper.get(".global-map-picker-sidebar__list").text()).toContain("Sortie 1");
  });

  it("keeps the selected station ghost overlay local to its interchange", async () => {
    const station = fixture.network.stationsById.get("station:a")!;
    const nearbyStation = fixture.network.stationsById.get("station:b")!;
    const nearbyLine = {
      ...fixture.network.lines[0],
      id: "line:metro:nearby",
      code: "99",
      label: "99",
      stationIds: [nearbyStation.id],
      geometryIds: [],
    };
    const unrelatedLine = {
      ...fixture.network.lines[0],
      id: "line:metro:far",
      code: "98",
      label: "98",
      stationIds: ["station:far"],
      geometryIds: [],
    };
    const unrelatedStation = { ...nearbyStation, id: "station:far", lineIds: [unrelatedLine.id] };
    const originalNearbyLineIds = [...nearbyStation.lineIds];
    nearbyStation.lineIds = [...originalNearbyLineIds, nearbyLine.id];
    fixture.network.linesById.set(nearbyLine.id, nearbyLine);
    fixture.network.linesById.set(unrelatedLine.id, unrelatedLine);
    fixture.network.stationsById.set(unrelatedStation.id, unrelatedStation);
    fixture.radiusResults = [{ station: nearbyStation, distanceMeters: 120 }];

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();

      await wrapper.get("[data-global-map-search] .global-map-search__open").trigger("click");
      await wrapper.get("[data-global-map-search] input").setValue(station.name);
      await new Promise((resolve) => setTimeout(resolve, 320));
      await flushPromises();
      await wrapper.get("[data-global-map-search] .global-map-search__result").trigger("click");
      await flushPromises();

      const scene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { ghostLineIds?: string[] }
        | undefined;
      expect(scene?.ghostLineIds).toEqual(expect.arrayContaining([...station.lineIds, nearbyLine.id]));
      expect(scene?.ghostLineIds).not.toContain(unrelatedLine.id);
    } finally {
      nearbyStation.lineIds = originalNearbyLineIds;
      fixture.network.linesById.delete(nearbyLine.id);
      fixture.network.linesById.delete(unrelatedLine.id);
      fixture.network.stationsById.delete(unrelatedStation.id);
      fixture.radiusResults = [];
    }
  });

  it("keeps the focused line on a station click and enables bus families", async () => {
    const originalModes = [...fixture.manifest.modes];
    fixture.manifest.modes = [...originalModes, "NOCTILIEN"];
    fixture.viewportPaths = [fixture.path, fixture.ghostPath];
    routeState.query = { line: fixture.network.lines[0].id };

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await flushPromises();

      const canvas = wrapper.get("canvas.global-transport-plan__canvas");
      vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        right: 800,
        bottom: 500,
        width: 800,
        height: 500,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      const canvasWithPointerCapture = canvas.element as HTMLCanvasElement & {
        hasPointerCapture: (pointerId: number) => boolean;
      };
      canvasWithPointerCapture.hasPointerCapture = () => false;

      const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as {
        centerWorldX: number;
        centerWorldY: number;
        zoom: number;
        bearing: 0;
        viewportWidthCssPx: number;
        viewportHeightCssPx: number;
        pixelRatio: number;
        generation: number;
      };
      const stationPoint = worldToScreen({
        x: fixture.network.stations[0].worldX,
        y: fixture.network.stations[0].worldY,
      }, renderedCamera);

      await canvas.trigger("pointerdown", {
        clientX: stationPoint.x,
        clientY: stationPoint.y,
        pointerId: 1,
        button: 0,
        isPrimary: true,
      });
      await canvas.trigger("pointerup", {
        clientX: stationPoint.x,
        clientY: stationPoint.y,
        pointerId: 1,
        button: 0,
        isPrimary: true,
      });
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await flushPromises();

      // The map keeps the focused line for geometry/traffic, but the sidebar
      // must switch to the selected station body so local correspondences are
      // rendered instead of being hidden behind the line profile.
      expect(wrapper.find(".global-map-picker-sidebar__line-profile").exists()).toBe(false);
      expect(wrapper.find(".global-map-picker-sidebar__station-heading").exists()).toBe(true);
      expect(wrapper.findAll(".station-transfer-details__item")).toHaveLength(2);

      const lastViewportCall = fixture.dataSourceCalls.queryViewport.mock.calls.at(-1);
      expect(lastViewportCall?.[3]).toBe(fixture.network.lines[0].id);
      expect(lastViewportCall?.[4]).toEqual([fixture.network.lines[1].id]);
      const primaryGroup = wrapper.findAll("[data-global-map-filters] .global-transport-plan__filter-group")[0]!;
      expect(primaryGroup.get('[data-global-map-preset="BUS"] .global-transport-plan__mode-preset-select').attributes("aria-pressed")).toBe("false");
      expect(primaryGroup.find('[data-global-map-preset="NOCTILIEN"]').exists()).toBe(true);
      expect(wrapper.get("[data-global-map-customize]").text()).toContain("Vue personnalisée");

      await wrapper.get("[data-global-map-customize]").trigger("click");
      await flushPromises();
      const customization = wrapper.get("[data-global-map-customization]");
      const busCheckbox = customization
        .findAll("input[type='checkbox']")
        .find((input) => input.attributes("aria-label")?.includes("Bus"))!;
      await busCheckbox.setValue(false);
      await flushPromises();
      expect(wrapper.findAll(".station-transfer-details__item")).toHaveLength(1);
      expect(wrapper.find(".station-transfer-details").text()).not.toContain("38");
      await new Promise((resolve) => setTimeout(resolve, 100));
      await flushPromises();
      const busHiddenViewportCall = fixture.dataSourceCalls.queryViewport.mock.calls.at(-1);
      expect(busHiddenViewportCall?.[1]).toBe(2); // METRO only
      expect(busHiddenViewportCall?.[4]).toEqual([]);
      await busCheckbox.setValue(true);
      await flushPromises();
      await customization.get("[data-global-map-customization-finish]").trigger("click");
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await flushPromises();

      await canvas.trigger("wheel", {
        deltaY: 8_000,
        clientX: 400,
        clientY: 250,
      });
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      await flushPromises();

      const wideViewportCall = fixture.dataSourceCalls.queryViewport.mock.calls.at(-1);
      const wideScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { activeLineId?: string; ghostLineIds?: string[]; paths?: Array<{ id: string }> }
        | undefined;
      expect(wideViewportCall?.[3]).toBe(fixture.network.lines[0].id);
      expect(wideViewportCall?.[4]).toEqual([fixture.network.lines[1].id]);
      expect(wideScene?.activeLineId).toBe(fixture.network.lines[0].id);
      expect(wideScene?.ghostLineIds).toEqual([fixture.network.lines[1].id]);
      expect(wideScene?.paths?.some((path) => path.id === fixture.ghostPath.id)).toBe(true);
    } finally {
      fixture.manifest.modes = originalModes;
      fixture.viewportPaths = [fixture.path];
      routeState.query = {};
    }
  });

  it("leaves the active line and mode filter before showing a station from search", async () => {
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

    await wrapper.get("[data-global-map-search] .global-map-search__open").trigger("click");
    await wrapper.get("[data-global-map-search] input").setValue("ligne 1");
    await new Promise((resolve) => setTimeout(resolve, 320));
    await flushPromises();
    const lineResult = wrapper.findAll("[data-global-map-search] .global-map-search__result")
      .find((button) => button.text().includes("Ligne 1"));
    expect(lineResult).toBeDefined();
    await lineResult!.trigger("click");
    await new Promise((resolve) => setTimeout(
      resolve,
      GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.zoomDurationMs +
        GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.panDurationMs +
        500,
    ));
    await flushPromises();
    expect(wrapper.find(".global-map-picker-sidebar").text()).toContain("Voir toute la ligne");
    expect(fixture.dataSourceCalls.queryViewport.mock.calls.some((call) => call[3] === fixture.network.lines[0].id)).toBe(true);

    await wrapper.get("[data-global-map-search] .global-map-search__open").trigger("click");
    await wrapper.get("[data-global-map-search] input").setValue(fixture.network.stations[0].name);
    await new Promise((resolve) => setTimeout(resolve, 320));
    await flushPromises();
    await wrapper.get("[data-global-map-search] .global-map-search__result").trigger("click");
    await flushPromises();

    const lastViewportCall = fixture.dataSourceCalls.queryViewport.mock.calls.at(-1);
    expect(lastViewportCall?.[1]).toBe(3); // BUS + METRO; the search leaves the mode filter.
    expect(lastViewportCall?.[3]).toBeUndefined();
    expect(wrapper.find(".global-map-picker-sidebar").text()).toContain(fixture.network.stations[0].name);
  });

  it("routes search line clicks through the animated whole-line selection view", async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();

      const line = fixture.network.lines[0]!;
      const points = line.stationIds
        .map((stationId) => fixture.network.stationsById.get(stationId))
        .filter((station): station is typeof fixture.network.stations[number] => Boolean(station));
      const expectedCenterX = (Math.min(...points.map((point) => point.worldX)) +
        Math.max(...points.map((point) => point.worldX))) / 2;
      const expectedCenterY = (Math.min(...points.map((point) => point.worldY)) +
        Math.max(...points.map((point) => point.worldY))) / 2;
      const expectedZoom = GLOBAL_TRANSPORT_PLAN_CONFIG.lineView.minZoom;

      await wrapper.get("[data-global-map-search] .global-map-search__open").trigger("click");
      await wrapper.get("[data-global-map-search] input").setValue("ligne 1");
      await vi.advanceTimersByTimeAsync(GLOBAL_TRANSPORT_PLAN_CONFIG.search.debounceMs + 32);
      await flushPromises();
      const lineResult = wrapper.findAll("[data-global-map-search] .global-map-search__result")
        .find((button) => button.text().includes("Ligne 1"));
      expect(lineResult).toBeDefined();
      await lineResult!.trigger("click");
      await flushPromises();
      await vi.advanceTimersByTimeAsync(100);
      await flushPromises();

      const intermediateCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as
        | { centerWorldX?: number; centerWorldY?: number; zoom?: number }
        | undefined;
      expect(intermediateCamera?.centerWorldX).not.toBeCloseTo(expectedCenterX, 5);
      expect(intermediateCamera?.centerWorldY).not.toBeCloseTo(expectedCenterY, 5);
      expect(intermediateCamera?.zoom).not.toBeCloseTo(expectedZoom, 5);

      await vi.advanceTimersByTimeAsync(
        GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.zoomDurationMs +
        GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.panDurationMs +
        32,
      );
      await flushPromises();

      const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as
        | { centerWorldX?: number; centerWorldY?: number; zoom?: number }
        | undefined;
      expect(renderedCamera?.centerWorldX).toBeCloseTo(expectedCenterX, 8);
      expect(renderedCamera?.centerWorldY).toBeCloseTo(expectedCenterY, 8);
      expect(renderedCamera?.zoom).toBeCloseTo(expectedZoom, 8);
      expect(wrapper.find(".global-map-picker-sidebar").text()).toContain("Voir toute la ligne");
      expect(wrapper.find(".global-map-picker-sidebar").text()).not.toContain("C000");
      const citiesToggle = wrapper.get("#global-map-picker-sidebar-line-cities-toggle");
      expect(citiesToggle.attributes("aria-expanded")).toBe("false");
      expect(wrapper.find("#global-map-picker-sidebar-line-cities").exists()).toBe(false);
      await citiesToggle.trigger("click");
      expect(citiesToggle.attributes("aria-expanded")).toBe("true");
      expect(wrapper.find("#global-map-picker-sidebar-line-cities").exists()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("searches place-only destinations and flies to a useful fixed zoom without selecting a station", async () => {
    vi.useFakeTimers();
    const place = {
      id: "place:fnac",
      lon: 2.3268,
      lat: 48.8421,
      label: "Fnac Montparnasse",
      city: "Paris",
      type: "place" as const,
    };
    fixture.placesSearch.mockResolvedValue([place]);

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();

      await wrapper.get("[data-global-map-search] .global-map-search__open").trigger("click");
      await wrapper.get("[data-global-map-search] input").setValue("fnac");
      await vi.advanceTimersByTimeAsync(GLOBAL_TRANSPORT_PLAN_CONFIG.search.debounceMs + 32);
      await flushPromises();

      expect(fixture.placesSearch).toHaveBeenCalledWith(
        "fnac",
        {
          includeStations: false,
          includePlaces: true,
          count: 8,
        },
        expect.any(AbortSignal),
      );
      const placeResult = wrapper.get('[data-global-map-search-result-type="place"]');
      await placeResult.trigger("click");
      await vi.advanceTimersByTimeAsync(100);
      await flushPromises();

      const expectedWorld = lonLatToWorld(place);
      const intermediateCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as
        | { centerWorldX?: number; centerWorldY?: number; zoom?: number }
        | undefined;
      expect(intermediateCamera?.centerWorldX).not.toBeCloseTo(expectedWorld.x, 5);
      expect(intermediateCamera?.centerWorldY).not.toBeCloseTo(expectedWorld.y, 5);
      expect(intermediateCamera?.zoom).not.toBeCloseTo(
        GLOBAL_TRANSPORT_PLAN_CONFIG.selection.stationZoom,
        5,
      );

      await vi.advanceTimersByTimeAsync(
        GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.zoomDurationMs +
        GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.panDurationMs +
        32,
      );
      await flushPromises();

      const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as
        | { centerWorldX?: number; centerWorldY?: number; zoom?: number }
        | undefined;
      expect(renderedCamera?.centerWorldX).toBeCloseTo(expectedWorld.x, 8);
      expect(renderedCamera?.centerWorldY).toBeCloseTo(expectedWorld.y, 8);
      expect(renderedCamera?.zoom).toBeCloseTo(
        GLOBAL_TRANSPORT_PLAN_CONFIG.selection.stationZoom,
        8,
      );
      expect(wrapper.find(".global-map-picker-sidebar").exists()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("collapses the itinerary for a line whose default direction is merged", async () => {
    routeState.query = { line: fixture.network.lines[0]!.id };
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await flushPromises();

    const itineraryToggle = wrapper.get("#global-map-picker-sidebar-line-route-toggle");
    expect(itineraryToggle.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find("#global-map-picker-sidebar-line-route").exists()).toBe(false);

    await itineraryToggle.trigger("click");
    expect(itineraryToggle.attributes("aria-expanded")).toBe("true");
    expect(wrapper.find("#global-map-picker-sidebar-line-route").exists()).toBe(true);
  });

  it("keeps the itinerary expanded by default for a bus line", async () => {
    routeState.query = { line: fixture.network.lines[1]!.id };
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await flushPromises();

    const itineraryToggle = wrapper.get("#global-map-picker-sidebar-line-route-toggle");
    expect(itineraryToggle.attributes("aria-expanded")).toBe("true");
    expect(wrapper.find("#global-map-picker-sidebar-line-route").exists()).toBe(true);
  });

  it("exposes line actions, changes the focused line and opens its diagram route", async () => {
    const originalLines = fixture.network.lines;
    const originalLinesById = fixture.network.linesById;
    const alternateLine = {
      ...fixture.network.lines[0]!,
      id: "line:metro:2",
      code: "2",
      label: "2",
    };
    fixture.network.lines = [originalLines[0]!, alternateLine, originalLines[1]!];
    fixture.network.linesById = new Map(
      fixture.network.lines.map((line) => [line.id, line]),
    );
    routeState.query = { line: fixture.network.lines[0]!.id };
    try {
      const wrapper = mount(GlobalTransportPlan, {
        attachTo: document.body,
        global: { stubs: { StationBoardModal: stationBoardModalStub } },
      });
      wrappers.push(wrapper);
      await flushPromises();

      expect(wrapper.find("[data-global-map-change-line]").exists()).toBe(true);
      expect(wrapper.find("[data-global-map-view-line-schema]").exists()).toBe(true);
      await wrapper.get("[data-global-map-change-line]").trigger("click");
      await flushPromises();

      expect(wrapper.get("[data-global-station-board-modal-line]").text()).toBe("line:metro:1");
      expect(wrapper.get("[data-global-station-board-modal-family]").text()).toBe("METRO");

      const modal = wrapper.findComponent(stationBoardModalStub);
      modal.vm.$emit("select-line", {
        family: "METRO",
        id: alternateLine.id,
        label: alternateLine.label,
        ref: alternateLine.id,
        navitiaId: alternateLine.id,
      });
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 100));
      await flushPromises();

      const latestScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { activeLineId?: string }
        | undefined;
      expect(latestScene?.activeLineId).toBe(alternateLine.id);
      expect(fixture.dataSourceCalls.queryViewport.mock.calls.some((call) => call[3] === alternateLine.id)).toBe(true);
      expect(fixture.router.replace).toHaveBeenCalledWith({
        query: expect.objectContaining({ line: alternateLine.id }),
      });

      await wrapper.get("[data-global-map-view-line-schema]").trigger("click");
      expect(fixture.router.push).toHaveBeenCalledWith({
        path: "/line/metro/line%3Ametro%3A2",
      });
    } finally {
      fixture.network.lines = originalLines;
      fixture.network.linesById = originalLinesById;
    }
  });

  it("keeps one vertical panel for presets and immediate manual customization", async () => {
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

    expect(wrapper.find("[data-global-map-display-panel]").exists()).toBe(false);
    expect(wrapper.findAll(".global-transport-plan__left-controls")).toHaveLength(1);

    await wrapper.get("[data-global-map-customize]").trigger("click");
    await flushPromises();

    const customization = wrapper.get("[data-global-map-customization]");
    const globalInputs = customization.findAll("input[type='checkbox']");
    expect(globalInputs).toHaveLength(2);
    expect((globalInputs.find((input) => input.attributes("aria-label")?.includes("Bus"))!.element as HTMLInputElement).checked).toBe(false);
    expect((globalInputs.find((input) => input.attributes("aria-label")?.includes("Metro"))!.element as HTMLInputElement).checked).toBe(true);

    const busCheckbox = globalInputs.find((input) => input.attributes("aria-label")?.includes("Bus"))!;
    await busCheckbox.setValue(true);
    await flushPromises();
    expect((busCheckbox.element as HTMLInputElement).checked).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await flushPromises();
    expect(fixture.dataSourceCalls.queryViewport.mock.calls.at(-1)?.[1]).toBe(3);

    await customization.get("[data-global-map-customization-select-none]").trigger("click");
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await flushPromises();
    expect(fixture.dataSourceCalls.queryViewport.mock.calls.at(-1)?.[1]).toBe(0);
    await customization.get("[data-global-map-customization-finish]").trigger("click");
    await flushPromises();

    const customButton = wrapper.get("[data-global-map-customize]");
    expect(wrapper.get('[data-global-map-preset="ALL"] .global-transport-plan__mode-preset-select').attributes("aria-pressed")).toBe("false");
    expect(customButton.text()).toContain("Vue personnalisée");
    expect(customButton.text()).toContain("Aucun réseau affiché");
    expect(wrapper.find('[data-global-map-preset="ALL"] .global-transport-plan__mode-preset-select').attributes("aria-pressed")).toBe("false");

    await customButton.trigger("click");
    await flushPromises();
    expect(wrapper.find("[data-global-map-customization]").exists()).toBe(true);
  });

  it("switches between plan and satellite basemap layers", async () => {
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

    const layerControl = wrapper.get("[data-global-map-layer-control]");
    const planButton = layerControl.get("[data-global-map-layer-plan]");
    const satelliteButton = layerControl.get("[data-global-map-layer-satellite]");

    expect(planButton.attributes("aria-pressed")).toBe("true");
    expect(satelliteButton.attributes("aria-pressed")).toBe("false");

    await satelliteButton.trigger("click");

    expect(planButton.attributes("aria-pressed")).toBe("false");
    expect(satelliteButton.attributes("aria-pressed")).toBe("true");
    expect(wrapper.get("[data-transport-map-basemap]").attributes("data-basemap-layer")).toBe("satellite");

    await planButton.trigger("click");
    expect(planButton.attributes("aria-pressed")).toBe("true");
    expect(satelliteButton.attributes("aria-pressed")).toBe("false");
  });

  it("restores a line URL with the full catalogue and isolates its viewport paths", async () => {
    routeState.query = { line: fixture.network.lines[0].id };
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await flushPromises();

    expect(wrapper.find(".global-map-picker-sidebar").text()).toContain("Voir toute la ligne");
    const lastViewportCall = fixture.dataSourceCalls.queryViewport.mock.calls.at(-1);
    expect(lastViewportCall?.[3]).toBe(fixture.network.lines[0].id);
    const renderedScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
      | { paths?: Array<{ id: string }> }
      | undefined;
    expect(renderedScene?.paths?.map((path) => path.id)).toEqual(["path:1"]);
  });

  it("swaps the transport list for one embedded line panel with an animated back path", async () => {
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

    const controls = wrapper.get(".global-transport-plan__left-controls");
    expect(controls.find("[data-global-map-filters]").exists()).toBe(true);
    expect(controls.find("[data-global-map-line-panel]").exists()).toBe(false);

    await wrapper.get('[data-global-map-preset="METRO"] .global-transport-plan__mode-preset-detail').trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-global-map-filters]").exists()).toBe(false);
    const panel = wrapper.get("[data-global-map-line-panel]");
    expect(panel.classes()).toContain("global-map-line-panel--embedded");
    expect(panel.element.closest(".global-transport-plan__left-controls")).not.toBeNull();
    expect(panel.find(".global-map-line-panel__header-action--back").exists()).toBe(true);
    expect(
      panel.find(".global-map-line-panel__header-action--back").attributes("aria-label"),
    ).toBe("Retour aux réseaux de transport");

    await panel.get(".global-map-line-panel__header-action--back").trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-global-map-line-panel]").exists()).toBe(false);
    expect(wrapper.find("[data-global-map-filters]").exists()).toBe(true);
  });

  it("flies to the exact whole-line framing when a line is selected from the accordion", async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();

      const line = fixture.network.lines[0]!;
      const points = line.stationIds
        .map((stationId) => fixture.network.stationsById.get(stationId))
        .filter((station): station is typeof fixture.network.stations[number] => Boolean(station));
      const expectedCenterX = (Math.min(...points.map((point) => point.worldX)) +
        Math.max(...points.map((point) => point.worldX))) / 2;
      const expectedCenterY = (Math.min(...points.map((point) => point.worldY)) +
        Math.max(...points.map((point) => point.worldY))) / 2;
      const expectedZoom = GLOBAL_TRANSPORT_PLAN_CONFIG.lineView.minZoom;

      await wrapper.get('[data-global-map-preset="METRO"] .global-transport-plan__mode-preset-detail').trigger("click");
      await flushPromises();
      await wrapper.get("[data-global-map-line-panel] .global-map-line-panel__line").trigger("click");
      await flushPromises();
      await vi.advanceTimersByTimeAsync(100);
      await flushPromises();

      const intermediateCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as
        | { centerWorldX?: number; centerWorldY?: number; zoom?: number }
        | undefined;
      expect(intermediateCamera?.centerWorldX).not.toBeCloseTo(expectedCenterX, 5);
      expect(intermediateCamera?.centerWorldY).not.toBeCloseTo(expectedCenterY, 5);
      expect(intermediateCamera?.zoom).not.toBeCloseTo(expectedZoom, 5);

      await vi.advanceTimersByTimeAsync(
        GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.zoomDurationMs +
        GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.panDurationMs +
        32,
      );
      await flushPromises();

      const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as
        | { centerWorldX?: number; centerWorldY?: number; zoom?: number }
        | undefined;
      expect(renderedCamera?.centerWorldX).toBeCloseTo(expectedCenterX, 8);
      expect(renderedCamera?.centerWorldY).toBeCloseTo(expectedCenterY, 8);
      expect(renderedCamera?.zoom).toBeCloseTo(expectedZoom, 8);
      expect(wrapper.find(".global-map-picker-sidebar").text()).toContain("Voir toute la ligne");
      expect(fixture.router.replace).toHaveBeenCalledWith({
        query: expect.objectContaining({ line: line.id }),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("preloads the next accordion line and paints it before the camera flight finishes", async () => {
    vi.useFakeTimers();
    const originalLines = fixture.network.lines;
    const originalLinesById = fixture.network.linesById;
    const originalStations = fixture.network.stations;
    const originalStationsById = fixture.network.stationsById;
    const originalViewportPaths = fixture.viewportPaths;
    const alternateLine = {
      ...fixture.network.lines[0]!,
      id: "line:metro:10",
      code: "10",
      label: "10",
      stationIds: ["station:c", "station:d"],
      geometryIds: ["path:10"],
    };
    const stationC = {
      ...fixture.network.stations[0]!,
      id: "station:c",
      index: 2,
      name: "Ligne 10 nord",
      lineIds: [alternateLine.id],
      lon: 2.48,
      lat: 48.93,
      worldX: 0.515,
      worldY: 0.36,
    };
    const stationD = {
      ...fixture.network.stations[1]!,
      id: "station:d",
      index: 3,
      name: "Ligne 10 sud",
      lineIds: [alternateLine.id],
      lon: 2.5,
      lat: 48.91,
      worldX: 0.518,
      worldY: 0.362,
    };
    const alternatePath = {
      ...fixture.path,
      id: "path:10",
      lineId: alternateLine.id,
      stationIds: [stationC.id, stationD.id],
      vertices: [
        { stationId: stationC.id, x: stationC.worldX, y: stationC.worldY },
        { stationId: stationD.id, x: stationD.worldX, y: stationD.worldY },
      ],
      minX: stationC.worldX,
      minY: stationC.worldY,
      maxX: stationD.worldX,
      maxY: stationD.worldY,
    };
    let releasePreload!: () => void;
    const preloadGate = new Promise<void>((resolve) => {
      releasePreload = resolve;
    });
    let targetPreloadCalls = 0;
    fixture.network.lines = [fixture.network.lines[0]!, alternateLine, fixture.network.lines[1]!];
    fixture.network.linesById = new Map(
      fixture.network.lines.map((line) => [line.id, line]),
    );
    fixture.network.stations = [...fixture.network.stations, stationC, stationD];
    fixture.network.stationsById = new Map(
      fixture.network.stations.map((station) => [station.id, station]),
    );
    fixture.viewportPaths = [fixture.path];
    routeState.query = { line: fixture.network.lines[0]!.id };

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      await vi.advanceTimersByTimeAsync(120);
      await flushPromises();

      // The fixture's mocked data-source constructor installs the default
      // viewport implementation when the component mounts. Replace it after
      // the URL-restored line is ready so only the target-line warm-up is
      // gated below.
      fixture.dataSourceCalls.queryViewport.mockImplementation(
        async (_camera, _mask, generation, detailLineId, forcedLineIds) => {
          if (
            detailLineId === alternateLine.id &&
            forcedLineIds?.includes(alternateLine.id) &&
            targetPreloadCalls++ === 0
          ) {
            await preloadGate;
          }
          return {
            generation,
            chunkIds: ["chunk:0:0"],
            paths: fixture.viewportPaths,
            stations: fixture.network.stations,
            bytes: 123,
            fromCache: true,
          };
        },
      );

      await wrapper.get('[data-global-map-preset="METRO"] .global-transport-plan__mode-preset-detail').trigger("click");
      await flushPromises();
      const targetButton = wrapper
        .get("[data-global-map-line-panel]")
        .findAll(".global-map-line-panel__line")
        .find((button) => button.text().includes("10"));
      expect(targetButton).toBeDefined();

      await targetButton!.trigger("click");
      await flushPromises();
      await vi.advanceTimersByTimeAsync(32);
      await flushPromises();
      expect(targetPreloadCalls).toBe(1);
      expect(fixture.dataSourceCalls.queryViewport.mock.calls).toContainEqual(
        expect.arrayContaining([
          expect.anything(),
          expect.anything(),
          expect.any(Number),
          alternateLine.id,
          [alternateLine.id],
        ]),
      );

      const intermediateScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { activeLineId?: string; paths?: Array<{ id: string }> }
        | undefined;
      expect(intermediateScene?.activeLineId).toBe(alternateLine.id);
      expect(intermediateScene?.paths?.some((path) => path.id === alternatePath.id)).toBe(false);
      // The old viewport line must not be repainted while the target line is
      // still being decoded; otherwise the Canvas2D transition can show a
      // stale line underneath the first target frame.
      expect(intermediateScene?.paths?.some((path) => path.id === fixture.path.id)).toBe(false);

      fixture.viewportPaths = [fixture.path, alternatePath];
      releasePreload();
      await flushPromises();
      await vi.advanceTimersByTimeAsync(32);
      await flushPromises();

      const preloadedScene = fixture.renderer.render.mock.calls.at(-1)?.[1] as
        | { activeLineId?: string; paths?: Array<{ id: string }> }
        | undefined;
      expect(preloadedScene?.activeLineId).toBe(alternateLine.id);
      expect(preloadedScene?.paths?.some((path) => path.id === alternatePath.id)).toBe(true);

      await vi.advanceTimersByTimeAsync(
        GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.zoomDurationMs +
        GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.panDurationMs +
        32,
      );
      await flushPromises();

      const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as
        | { centerWorldX?: number; centerWorldY?: number; zoom?: number }
        | undefined;
      expect(renderedCamera?.centerWorldX).toBeCloseTo((stationC.worldX + stationD.worldX) / 2, 8);
      expect(renderedCamera?.centerWorldY).toBeCloseTo((stationC.worldY + stationD.worldY) / 2, 8);
      expect(renderedCamera?.zoom).toBeCloseTo(GLOBAL_TRANSPORT_PLAN_CONFIG.lineView.minZoom, 8);
    } finally {
      fixture.network.lines = originalLines;
      fixture.network.linesById = originalLinesById;
      fixture.network.stations = originalStations;
      fixture.network.stationsById = originalStationsById;
      fixture.viewportPaths = originalViewportPaths;
      fixture.dataSourceCalls.queryViewport.mockImplementation(
        async (_camera, _mask, generation) => ({
          generation,
          chunkIds: ["chunk:0:0"],
          paths: fixture.viewportPaths,
          stations: fixture.network.stations,
          bytes: 123,
          fromCache: true,
        }),
      );
      vi.useRealTimers();
    }
  });

  it("cancels an accordion camera flight when the user takes control of the map", async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();

      await wrapper.get('[data-global-map-preset="METRO"] .global-transport-plan__mode-preset-detail').trigger("click");
      await flushPromises();
      await wrapper.get("[data-global-map-line-panel] .global-map-line-panel__line").trigger("click");
      await flushPromises();
      await vi.advanceTimersByTimeAsync(100);
      await flushPromises();

      const line = fixture.network.lines[0]!;
      const points = line.stationIds
        .map((stationId) => fixture.network.stationsById.get(stationId))
        .filter((station): station is typeof fixture.network.stations[number] => Boolean(station));
      const expectedCenterX = (Math.min(...points.map((point) => point.worldX)) +
        Math.max(...points.map((point) => point.worldX))) / 2;
      const expectedCenterY = (Math.min(...points.map((point) => point.worldY)) +
        Math.max(...points.map((point) => point.worldY))) / 2;
      const expectedZoom = GLOBAL_TRANSPORT_PLAN_CONFIG.lineView.minZoom;
      const intermediateCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as
        | { centerWorldX?: number; centerWorldY?: number; zoom?: number }
        | undefined;
      expect(intermediateCamera?.centerWorldX).toBeDefined();
      expect(intermediateCamera?.centerWorldY).toBeDefined();

      const canvas = wrapper.get("canvas.global-transport-plan__canvas");
      await canvas.trigger("pointerdown", { clientX: 100, clientY: 100, pointerId: 31, button: 0 });
      await canvas.trigger("pointercancel", { clientX: 100, clientY: 100, pointerId: 31, button: 0 });
      await vi.advanceTimersByTimeAsync(32);
      await flushPromises();
      const cameraAtCancellation = fixture.renderer.render.mock.calls.at(-1)?.[0] as
        | { centerWorldX?: number; centerWorldY?: number; zoom?: number }
        | undefined;
      expect(cameraAtCancellation?.centerWorldX).not.toBeCloseTo(expectedCenterX, 5);
      expect(cameraAtCancellation?.centerWorldY).not.toBeCloseTo(expectedCenterY, 5);
      expect(cameraAtCancellation?.zoom).not.toBeCloseTo(expectedZoom, 5);

      await vi.advanceTimersByTimeAsync(
        GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.zoomDurationMs +
        GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.panDurationMs +
        200,
      );
      await flushPromises();

      const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as
        | { centerWorldX?: number; centerWorldY?: number; zoom?: number }
        | undefined;
      expect(renderedCamera?.centerWorldX).toBeCloseTo(cameraAtCancellation!.centerWorldX!, 5);
      expect(renderedCamera?.centerWorldY).toBeCloseTo(cameraAtCancellation!.centerWorldY!, 5);
      expect(renderedCamera?.zoom).toBeCloseTo(cameraAtCancellation!.zoom!, 5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips camera animation when the system requests reduced motion", async () => {
    vi.useFakeTimers();
    const originalMatchMedia = window.matchMedia;
    const reducedMotionMatchMedia = vi.fn(() => ({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: reducedMotionMatchMedia,
    });

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();

      await wrapper.get('[data-global-map-preset="METRO"] .global-transport-plan__mode-preset-detail').trigger("click");
      await flushPromises();
      await wrapper.get("[data-global-map-line-panel] .global-map-line-panel__line").trigger("click");
      await flushPromises();
      await vi.advanceTimersByTimeAsync(32);
      await flushPromises();

      const line = fixture.network.lines[0]!;
      const points = line.stationIds
        .map((stationId) => fixture.network.stationsById.get(stationId))
        .filter((station): station is typeof fixture.network.stations[number] => Boolean(station));
      const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as
        | { centerWorldX?: number; centerWorldY?: number; zoom?: number }
        | undefined;
      expect(renderedCamera?.centerWorldX).toBeCloseTo(
        (Math.min(...points.map((point) => point.worldX)) + Math.max(...points.map((point) => point.worldX))) / 2,
        8,
      );
      expect(renderedCamera?.centerWorldY).toBeCloseTo(
        (Math.min(...points.map((point) => point.worldY)) + Math.max(...points.map((point) => point.worldY))) / 2,
        8,
      );
      expect(renderedCamera?.zoom).toBeCloseTo(GLOBAL_TRANSPORT_PLAN_CONFIG.lineView.minZoom, 8);
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia,
      });
      vi.useRealTimers();
    }
  });

  it("shows the compact location request only for a prompt permission", async () => {
    const geolocation = {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(() => 92),
      clearWatch: vi.fn(),
    };
    vi.stubGlobal("navigator", {
      geolocation,
      permissions: { query: vi.fn(async () => ({ state: "prompt" })) },
    });

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      await flushPromises();

      expect(wrapper.find(".global-transport-plan__location-request").exists()).toBe(true);
      expect(wrapper.find(".global-transport-plan__user-location").exists()).toBe(false);
      expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders the user position above the canvas and grays it when stale", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T10:00:00.000Z"));
    let webWatchSuccess: ((position: GeolocationPosition) => void) | undefined;
    const geolocation = {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn((success: (position: GeolocationPosition) => void) => {
        webWatchSuccess = success;
        success(createUserPosition());
        return 91;
      }),
      clearWatch: vi.fn(),
    };

    vi.stubGlobal("navigator", {
      geolocation,
      permissions: { query: vi.fn(async () => ({ state: "granted" })) },
    });

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      await flushPromises();
      vi.runOnlyPendingTimers();
      await flushPromises();

      const marker = wrapper.find(".global-transport-plan__user-location");
      expect(marker.exists()).toBe(true);
      expect(marker.classes()).not.toContain("global-transport-plan__user-location--stale");

      const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as Parameters<typeof worldToScreen>[1];
      const expectedPoint = worldToScreen(lonLatToWorld({ lon: 2.3522, lat: 48.8566 }), renderedCamera);
      expect(Number.parseFloat((marker.element as HTMLElement).style.left)).toBeCloseTo(expectedPoint.x, 5);
      expect(Number.parseFloat((marker.element as HTMLElement).style.top)).toBeCloseTo(expectedPoint.y, 5);

      vi.advanceTimersByTime(60_001);
      await flushPromises();
      await nextTick();
      expect(marker.classes()).toContain("global-transport-plan__user-location--stale");
      expect(webWatchSuccess).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("keeps the touch long-press menu open after release and opens the itinerary", async () => {
    vi.useFakeTimers();
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600,
      width: 800, height: 600, toJSON: () => ({}),
    });
    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      const canvas = wrapper.get("canvas.global-transport-plan__canvas");
      const pointer = { pointerId: 51, pointerType: "touch", button: 0, clientX: 160, clientY: 190 };
      await canvas.trigger("pointerdown", pointer);
      await canvas.trigger("pointermove", { ...pointer, clientX: 163 });
      await vi.advanceTimersByTimeAsync(550);
      await nextTick();
      expect(document.querySelector(".global-transport-plan__context-menu")).not.toBeNull();
      await canvas.trigger("pointerup", pointer);
      await canvas.trigger("click", pointer);
      const button = [...document.querySelectorAll<HTMLButtonElement>(".global-transport-plan__context-menu button")]
        .find((entry) => entry.textContent?.includes("Itinéraire jusqu’ici"));
      expect(button).toBeDefined();
      button!.click();
      await flushPromises();
      expect(wrapper.find(".global-transport-plan__itinerary-panel").exists()).toBe(true);
    } finally {
      bounds.mockRestore();
      vi.useRealTimers();
    }
  });

  it.each(["drag", "pinch", "cancel", "release"])("cancels touch long press on %s", async (gesture) => {
    vi.useFakeTimers();
    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      const canvas = wrapper.get("canvas.global-transport-plan__canvas");
      const pointer = { pointerId: 51, pointerType: "touch", button: 0, clientX: 160, clientY: 190 };
      await canvas.trigger("pointerdown", pointer);
      if (gesture === "drag") await canvas.trigger("pointermove", { ...pointer, clientX: 190 });
      if (gesture === "pinch") await canvas.trigger("pointerdown", { ...pointer, pointerId: 52 });
      if (gesture === "cancel") await canvas.trigger("pointercancel", pointer);
      if (gesture === "release") await canvas.trigger("pointerup", pointer);
      await vi.advanceTimersByTimeAsync(600);
      expect(document.querySelector(".global-transport-plan__context-menu")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens the fixed context menu and exposes neighborhood and itinerary actions", async () => {
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

    const canvas = wrapper.get("canvas.global-transport-plan__canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      x: 40,
      y: 60,
      left: 40,
      top: 60,
      right: 840,
      bottom: 660,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });

    await canvas.trigger("contextmenu", { clientX: 160, clientY: 190 });
    await nextTick();

    const menu = document.querySelector<HTMLElement>(".global-transport-plan__context-menu");
    expect(menu).not.toBeNull();
    expect(menu?.textContent).toContain("Ajouter un repère");
    expect(menu?.textContent).toContain("Ouvrir l’annuaire");
    expect(menu?.textContent).toContain("Voir le plan du quartier");
    expect(menu?.textContent).toContain("Itinéraire jusqu’ici");
    const contextMenuPanel = menu?.closest<HTMLElement>(".context-menu");
    expect(contextMenuPanel?.style.position).toBe("fixed");
    expect(contextMenuPanel?.style.left).toBe("160px");
    expect(contextMenuPanel?.style.top).toBe("198px");

    const itineraryButton = [...document.querySelectorAll<HTMLButtonElement>(".global-transport-plan__context-menu button")]
      .find((button) => button.textContent?.includes("Itinéraire jusqu’ici"));
    expect(itineraryButton).toBeDefined();
    itineraryButton!.click();
    await nextTick();
    await flushPromises();

    expect(wrapper.find(".global-transport-plan__itinerary-panel").exists()).toBe(true);
    expect(wrapper.findAll(".global-transport-plan__itinerary-panel input[type='search']")).toHaveLength(2);
  });

  it("loads the normal map's detailed line paths when selecting a journey", async () => {
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

    const vertices = fixture.path.vertices;
    const bend = { x: (vertices[0]!.x + vertices[1]!.x) / 2 + 0.0001, y: (vertices[0]!.y + vertices[1]!.y) / 2 };
    const detailedPath = { ...fixture.path, vertices: [vertices[0]!, bend, vertices[1]!] };
    const from = worldToLonLat(vertices[0]!);
    const to = worldToLonLat(vertices[1]!);
    fixture.dataSourceCalls.queryViewport.mockImplementation(async (_camera, _mask, generation, detailLineId) => ({
      generation, chunkIds: [], paths: detailLineId ? [detailedPath] : [fixture.path],
      stations: fixture.network.stations, bytes: 1, fromCache: true,
    }));
    fixture.travelRoutesSearch.mockResolvedValue([{
      durationSeconds: 600,
      sections: [{ type: "public_transport", durationSeconds: 600, lineId: fixture.path.lineId,
        lineMode: "METRO", lineCode: "1", fromPoint: from, toPoint: to, geometry: [from, to] }],
    }]);

    const canvas = wrapper.get("canvas.global-transport-plan__canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      x: 40, y: 60, left: 40, top: 60, right: 840, bottom: 660,
      width: 800, height: 600, toJSON: () => ({}),
    });
    await canvas.trigger("contextmenu", { clientX: 160, clientY: 190 });
    await nextTick();
    const button = [...document.querySelectorAll<HTMLButtonElement>(".global-transport-plan__context-menu button")]
      .find((candidate) => candidate.textContent?.includes("Itinéraire jusqu’ici"))!;
    button.click();
    await flushPromises();
    const sidebar = wrapper.findComponent({ name: "LeftNearbySidebarBodyTravel" });
    sidebar.vm.$emit("destination", { id: "destination", type: "station", label: "Arrivée", ...to });
    await flushPromises();
    sidebar.vm.$emit("origin", { id: "origin", type: "station", label: "Départ", ...from });
    await flushPromises();
    await flushPromises();

    expect(fixture.dataSourceCalls.queryViewport).toHaveBeenCalledWith(
      expect.anything(), expect.any(Number), expect.any(Number), fixture.path.lineId, [fixture.path.lineId],
    );
    const overlay = wrapper.findComponent({ name: "GlobalTransportItineraryOverlay" });
    expect(overlay.props("segments")[0].coordinates).toEqual(detailedPath.vertices.map(worldToLonLat));
    const queryCount = fixture.dataSourceCalls.queryViewport.mock.calls.length;
    await wrapper.get(".global-transport-plan").trigger("keydown", { key: "ArrowRight" });
    await flushPromises();
    expect(fixture.dataSourceCalls.queryViewport.mock.calls.length).toBe(queryCount);
    expect(overlay.props("segments")[0].coordinates).toEqual(detailedPath.vertices.map(worldToLonLat));
  });

  it("opens the address book from the map context menu", async () => {
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

    const canvas = wrapper.get("canvas.global-transport-plan__canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      x: 40,
      y: 60,
      left: 40,
      top: 60,
      right: 840,
      bottom: 660,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });
    await canvas.trigger("contextmenu", { clientX: 160, clientY: 190 });
    await nextTick();

    const addressBookButton = [...document.querySelectorAll<HTMLButtonElement>(
      ".global-transport-plan__context-menu button",
    )].find((button) => button.textContent?.includes("Ouvrir l’annuaire"));
    expect(addressBookButton).toBeDefined();
    addressBookButton?.click();
    await flushPromises();

    expect(document.body.querySelector(".address-book-modal")).not.toBeNull();
  });

  it("offers to hide a marker from its context menu and persists the hidden state", async () => {
    window.localStorage.setItem("transport-clock.global-map-reperes.v1", JSON.stringify({
      version: 1,
      markers: [{
        id: "context-hide-marker",
        name: "Repère à masquer",
        lon: 2.3522,
        lat: 48.8566,
        icon: "pin",
      }],
    }));

    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

    const marker = wrapper.get(".global-map-marker");
    await marker.trigger("contextmenu", { clientX: 160, clientY: 190 });
    await nextTick();

    const hideButton = [...document.querySelectorAll<HTMLButtonElement>(
      ".global-transport-plan__context-menu button",
    )].find((button) => button.textContent?.includes("Masquer le repère"));
    expect(hideButton).toBeDefined();
    expect(hideButton?.querySelector("svg")).not.toBeNull();
    hideButton?.click();
    await nextTick();
    await flushPromises();

    expect(wrapper.find(".global-map-marker").exists()).toBe(false);
    expect(JSON.parse(window.localStorage.getItem("transport-clock.global-map-reperes.v1") ?? "{}").markers)
      .toEqual([expect.objectContaining({ id: "context-hide-marker", isHidden: true })]);
  });

  it("keeps hidden address-book entries available in the directory while omitting their map marker", async () => {
    window.localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify({
      version: ADDRESS_BOOK_STORAGE_VERSION,
      entries: [{
        id: "hidden-home",
        kind: "address",
        name: "Adresse discrète",
        address: "1 rue invisible, Paris",
        lon: 2.27,
        lat: 48.766,
        icon: "home",
        isHidden: true,
      }],
    }));

    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

    expect(wrapper.find(".global-map-marker").exists()).toBe(false);

    const canvas = wrapper.get("canvas.global-transport-plan__canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      x: 40,
      y: 60,
      left: 40,
      top: 60,
      right: 840,
      bottom: 660,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });
    await canvas.trigger("contextmenu", { clientX: 160, clientY: 190 });
    await nextTick();
    const addressBookButton = [...document.querySelectorAll<HTMLButtonElement>(
      ".global-transport-plan__context-menu button",
    )].find((button) => button.textContent?.includes("Ouvrir l’annuaire"));
    addressBookButton?.click();
    await flushPromises();

    expect(document.body.textContent).toContain("Adresse discrète");
    expect(document.body.textContent).toContain("Masqué");
  });

  it("measures a segment from the context-menu point and finishes it on the next map click", async () => {
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

    const canvas = wrapper.get("canvas.global-transport-plan__canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      x: 40,
      y: 60,
      left: 40,
      top: 60,
      right: 840,
      bottom: 660,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });
    await canvas.trigger("contextmenu", { clientX: 160, clientY: 190 });
    await nextTick();

    const measureButton = [...document.querySelectorAll<HTMLButtonElement>(".global-transport-plan__context-menu button")]
      .find((button) => button.textContent?.includes("Mesurer une distance"));
    expect(measureButton).toBeDefined();
    measureButton!.click();
    await nextTick();

    const overlay = wrapper.get('[data-testid="global-map-distance-measurement"]');
    expect(overlay.attributes("data-active")).toBe("true");
    expect(wrapper.text()).toContain("cliquez pour terminer");

    await canvas.trigger("pointermove", { clientX: 100, clientY: 170, pointerId: 8, button: -1 });
    await nextTick();
    const line = overlay.get("line.global-map-distance-measurement__line");
    expect(line.attributes("x1")).not.toBe(line.attributes("x2"));
    expect(line.attributes("y1")).not.toBe(line.attributes("y2"));

    await canvas.trigger("pointerdown", { clientX: 120, clientY: 160, pointerId: 8, button: 0 });
    await canvas.trigger("pointerup", { clientX: 120, clientY: 160, pointerId: 8, button: 0 });
    await nextTick();
    expect(overlay.attributes("data-active")).toBe("false");
    expect(wrapper.text()).toContain("Distance :");
  });

  it("reverse-geocodes and copies the address from the global context menu", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      results: [{
        label: "12 Rue de Rivoli, 75004 Paris",
        lon: 2.3522,
        lat: 48.8566,
        provider: "ign",
        type: "address",
      }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const originalClipboard = navigator.clipboard;
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();
      const canvas = wrapper.get("canvas.global-transport-plan__canvas");
      vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
        x: 40,
        y: 60,
        left: 40,
        top: 60,
        right: 840,
        bottom: 660,
        width: 800,
        height: 600,
        toJSON: () => ({}),
      });
      await canvas.trigger("contextmenu", { clientX: 160, clientY: 190 });
      await nextTick();

      const copyButton = [...document.querySelectorAll<HTMLButtonElement>(".global-transport-plan__context-menu button")]
        .find((button) => button.textContent?.includes("Copier l’adresse"));
      expect(copyButton).toBeDefined();
      copyButton!.click();
      await flushPromises();

      expect(writeText).toHaveBeenCalledWith("12 Rue de Rivoli, 75004 Paris");
      expect(wrapper.text()).toContain("Adresse copiée");
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
      vi.unstubAllGlobals();
    }
  });

  it("opens Nearby Stations with exact coordinates from the global context menu", async () => {
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();

    const canvas = wrapper.get("canvas.global-transport-plan__canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      x: 40,
      y: 60,
      left: 40,
      top: 60,
      right: 840,
      bottom: 660,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });
    await canvas.trigger("contextmenu", { clientX: 160, clientY: 190 });
    await nextTick();

    const openMock = vi.spyOn(window, "open").mockImplementation(() => null);
    const neighborhoodButton = [...document.querySelectorAll<HTMLButtonElement>(".global-transport-plan__context-menu button")]
      .find((button) => button.textContent?.includes("Voir le plan du quartier"));
    expect(neighborhoodButton).toBeDefined();
    neighborhoodButton!.click();
    await nextTick();

    const openedUrl = openMock.mock.calls[0]?.[0];
    expect(openedUrl).toEqual(expect.stringContaining("/nearby-stations?"));
    const openedParams = new URL(String(openedUrl), "http://localhost").searchParams;
    expect(openedParams.get("lat")).toMatch(/^-?\d+\.\d+$/u);
    expect(openedParams.get("lon")).toMatch(/^-?\d+\.\d+$/u);
    openMock.mockRestore();
  });

  it("creates, searches, edits and confirms deletion of a persistent global marker", async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
      wrappers.push(wrapper);
      await flushPromises();

      const canvas = wrapper.get("canvas.global-transport-plan__canvas");
      vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600,
        toJSON: () => ({}),
      });
      await canvas.trigger("contextmenu", { clientX: 120, clientY: 140 });
      await nextTick();
      const addButton = [...document.querySelectorAll<HTMLButtonElement>(".global-transport-plan__context-menu button")]
        .find((button) => button.textContent?.includes("Ajouter un repère"));
      addButton?.click();
      await nextTick();

      const form = document.querySelector<HTMLFormElement>("#global-map-marker-form");
      expect(form).not.toBeNull();
      const nameInput = form?.querySelector<HTMLInputElement>('input:not([type="radio"])');
      expect(nameInput).not.toBeNull();
      nameInput!.value = "Maison Châtenay";
      nameInput!.dispatchEvent(new Event("input", { bubbles: true }));
      form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await nextTick();

      expect(wrapper.find(".global-map-marker").attributes("aria-label")).toBe("Maison Châtenay");
      expect(JSON.parse(window.localStorage.getItem("transport-clock.global-map-reperes.v1") ?? "{}").markers)
        .toEqual([expect.objectContaining({ name: "Maison Châtenay" })]);

      await wrapper.get(".global-map-search__open").trigger("click");
      const searchInput = wrapper.get(".global-map-search input");
      await searchInput.setValue("Châtenay");
      await vi.advanceTimersByTimeAsync(32);
      await nextTick();
      expect(wrapper.get('[data-global-map-search-result-type="marker"]').text()).toContain("Maison Châtenay");

      const startCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as
        | Parameters<typeof clampCameraToBounds>[0]
        | undefined;
      expect(startCamera).toBeDefined();
      await wrapper.get('[data-global-map-search-result-type="marker"]').trigger("click");
      const storedMarker = JSON.parse(
        window.localStorage.getItem("transport-clock.global-map-reperes.v1") ?? "{}",
      ).markers[0] as { lon: number; lat: number };
      await vi.advanceTimersByTimeAsync(
        GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.zoomDurationMs +
          GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.panDurationMs +
          100,
      );
      await flushPromises();
      const expectedWorld = lonLatToWorld(storedMarker);
      const expectedCamera = clampCameraToBounds(
        {
          ...startCamera!,
          centerWorldX: expectedWorld.x,
          centerWorldY: expectedWorld.y,
          zoom: GLOBAL_TRANSPORT_PLAN_CONFIG.selection.stationZoom,
        },
        fixture.network.bounds,
      );
      const renderedCamera = fixture.renderer.render.mock.calls.at(-1)?.[0] as
        | { centerWorldX?: number; centerWorldY?: number; zoom?: number }
        | undefined;
      expect(renderedCamera?.centerWorldX).toBeCloseTo(expectedCamera.centerWorldX, 8);
      expect(renderedCamera?.centerWorldY).toBeCloseTo(expectedCamera.centerWorldY, 8);
      expect(renderedCamera?.zoom).toBeCloseTo(
        GLOBAL_TRANSPORT_PLAN_CONFIG.selection.stationZoom,
        8,
      );

      await canvas.trigger("contextmenu", { clientX: 130, clientY: 150 });
      await nextTick();
      await wrapper.get(".global-map-marker").trigger("contextmenu", { clientX: 130, clientY: 150 });
      await nextTick();
      const editButton = [...document.querySelectorAll<HTMLButtonElement>(".global-transport-plan__context-menu button")]
        .find((button) => button.textContent?.includes("Modifier le repère"));
      editButton?.click();
      await nextTick();
      const editForm = document.querySelector<HTMLFormElement>("#global-map-marker-form");
      const editNameInput = editForm?.querySelector<HTMLInputElement>('input:not([type="radio"])');
      editNameInput!.value = "Maison modifiée";
      editNameInput!.dispatchEvent(new Event("input", { bubbles: true }));
      editForm!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await nextTick();
      expect(wrapper.find(".global-map-marker").attributes("aria-label")).toBe("Maison modifiée");

      await wrapper.get(".global-map-marker").trigger("contextmenu", { clientX: 140, clientY: 160 });
      await nextTick();
      const deleteButton = [...document.querySelectorAll<HTMLButtonElement>(".global-transport-plan__context-menu button")]
        .find((button) => button.textContent?.includes("Supprimer le repère"));
      deleteButton?.click();
      await nextTick();
      const confirmDelete = document.querySelector<HTMLButtonElement>(".global-map-marker-form__delete");
      confirmDelete?.click();
      await nextTick();
      expect(confirmDelete?.textContent).toContain("Confirmer la suppression");
      confirmDelete?.click();
      await nextTick();
      expect(wrapper.find(".global-map-marker").exists()).toBe(false);
    } finally {
      vi.useRealTimers();
      window.localStorage.removeItem("transport-clock.global-map-reperes.v1");
    }
  });
});

function createUserPosition(): GeolocationPosition {
  return {
    coords: {
      latitude: 48.8566,
      longitude: 2.3522,
      accuracy: 12,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  };
}
