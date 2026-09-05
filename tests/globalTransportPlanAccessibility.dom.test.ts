import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

const station = {
  id: "station:accessibility",
  index: 0,
  name: "Station accessible",
  normalizedName: "station accessible",
  aliases: ["Station accessible"],
  rawRefs: ["station:accessibility"],
  lineIds: ["line:metro:fixture"],
  ownerChunkId: "fixture",
  isHub: true,
  sourceCrs: "EPSG:2154",
  sourceX: 652469,
  sourceY: 6861275,
  lon: 2.3522,
  lat: 48.8566,
  worldX: 0.506,
  worldY: 0.352,
  coordinateSource: "netex",
  transformVersion: "lambert93-ntf-v1",
};
const line = {
  id: "line:metro:fixture",
  index: 0,
  code: "F",
  label: "Fixture",
  mode: "METRO",
  color: "#000",
  textColor: "#fff",
  aliases: ["F"],
  stationIds: [station.id],
  geometryIds: [],
};
const network = {
  lines: [line],
  stations: [station],
  entrances: [],
  regionalPaths: [],
  pathsById: new Map(),
  linesById: new Map([[line.id, line]]),
  stationsById: new Map([[station.id, station]]),
  bounds: { minX: 0.49, minY: 0.34, maxX: 0.52, maxY: 0.37 },
};
const manifest = {
  schemaVersion: 1,
  minReaderVersion: 1,
  dataVersion: "accessibility-fixture",
  generatedAt: "2026-08-02T00:00:00.000Z",
  sourceVersions: {},
  projection: { name: "WebMercatorNormalized", sourceCrs: "EPSG:2154", transformVersion: "lambert93-ntf-v1" },
  bounds: network.bounds,
  lod: [{ level: 0, minZoom: 0, maxZoom: 20, maxErrorMeters: 0.25 }],
  modes: ["METRO"],
  files: { bootstrap: { asset: "bootstrap.json", bytes: 1, checksum: "x" }, catalog: { asset: "catalog.json", bytes: 1, checksum: "x" }, chunks: [], stationIndex: { schemaVersion: 1, kind: "stations", count: 1, bounds: network.bounds, asset: "stations.json" }, pathIndex: { schemaVersion: 1, kind: "paths", count: 0, bounds: network.bounds, asset: "paths.json" } },
  counts: { lines: 1, stations: 1, paths: 0, vertices: 0, chunks: 0, entrances: 0, bikes: 0 },
  warnings: [],
  compilation: { deterministic: true, hashAlgorithm: "sha256", quantizationMeters: 0.01, staticExternalRequests: 0 },
};

vi.mock("nuxt/app", () => ({
  useRoute: () => ({ query: {}, path: "/map" }),
  useRouter: () => ({ replace: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock("../src/features/transport-map/render/createRenderer", () => ({
  createTransportMapRenderer: () => ({
    kind: "canvas2d-main-thread",
    mount: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(),
    getMetrics: () => ({ renderer: "canvas2d-main-thread", drawCalls: 0, visiblePathCount: 0, visibleStationCount: 0, renderMs: 0, cacheBytes: 0, focusedLineLiveRedraw: false, pathCacheCaptureCount: 0 as const, pathCacheCaptureMs: 0, pathCacheCapturedBytes: 0 }),
    dispose: vi.fn(),
  }),
}));
vi.mock("../src/features/transport-map/data/createTransportMapDataSource", () => ({
  TransportMapDataSource: class {
    initialize = vi.fn(async () => network);
    getManifest = vi.fn(() => manifest);
    getNetwork = vi.fn(() => network);
    queryViewport = vi.fn(async (_camera, _mask, generation) => ({ generation, chunkIds: [], paths: [], stations: network.stations, bytes: 0, fromCache: true }));
    queryStationsWithinRadius = vi.fn(async () => []);
    getStation = vi.fn(async () => station);
    metrics = vi.fn(() => ({ manifestLoaded: true, catalogLoaded: true, lastGeneration: 1, lastChunkCount: 0, bytes: 0, cache: { pending: 0, active: 0, completed: 0, abandoned: 0, cache: { entries: 0, bytes: 0, hits: 0, misses: 0, evictions: 0 } } }));
    dispose = vi.fn();
  },
}));
vi.mock("../src/features/transport-map/adapters/dashboard", () => ({
  listGlobalMapDashboardPlaces: () => [{ id: "home", label: "Maison" }],
  addGlobalMapTargetsToDashboard: vi.fn(),
}));

import GlobalTransportPlan from "../src/features/line-map/GlobalTransportPlan.vue";

describe("GlobalTransportPlan accessibility contract", () => {
  it("exposes an ordered keyboard surface without one DOM control per station", async () => {
    const wrapper = mount(GlobalTransportPlan, { attachTo: document.body });
    await flushPromises();

    const root = wrapper.get(".global-transport-plan");
    const canvas = wrapper.get("canvas");
    expect(root.attributes("tabindex")).toBe("0");
    expect(root.attributes("aria-label")).toBeTruthy();
    expect(canvas.attributes("role")).toBe("img");
    expect(wrapper.get("[data-global-map-filters] .global-transport-plan__filter-heading h2").text()).toContain("Explorer");
    expect(canvas.attributes("aria-label")).toContain("flèches");

    const buttons = wrapper.findAll("button");
    // One global radar button and one per catalog mode; never one per station.
    const radarButtons = wrapper.findAll("[data-global-map-radar-toggle], [data-global-map-mode-radar]");
    expect(radarButtons).toHaveLength(1 + manifest.modes.length);
    expect(radarButtons.every((button) => button.attributes("aria-controls") === "global-map-radar-panel")).toBe(true);
    expect(buttons.length - radarButtons.length).toBeLessThanOrEqual(21);
    expect(buttons.every((button) => button.attributes("aria-label") || button.text().trim())).toBe(true);
    const presetButtons = wrapper.findAll(
      "[data-global-map-preset] .global-transport-plan__mode-preset-select",
    );
    expect(presetButtons.every((button) => button.attributes("aria-pressed") !== undefined)).toBe(true);
    expect(wrapper.get('[data-global-map-preset="ALL"] .global-transport-plan__mode-preset-select').text()).toBe("Tout afficher");
    expect(wrapper.find("[data-global-map-customize]").exists()).toBe(true);

    wrapper.unmount();
  });
});
