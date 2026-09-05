import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import NearbyStationsMap from "../src/features/nearby-stations/NearbyStationsMap.vue";
import type { NearbyStationEntry } from "../src/features/nearby-stations/nearbyStations";
import type { NearbyHeavyTransportCandidate } from "../src/features/nearby-stations/nearbyHeavyTransports";
import { NEARBY_ISOCHRONES_NOT_CONFIGURED_CODE } from "../src/features/nearby-stations/nearbyIsochrones";
import type { NearbyNoiseZonesResponse } from "../src/features/nearby-stations/nearbyNoiseZones";
import type { GlobalMapLine, GlobalMapMode, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import { lonLatToWorld } from "../src/features/transport-map/geo/coordinateKernel";
import type { GhostLineFlowModel } from "../src/features/transport-map/overlays/ghostLineFlow";

function createLine(id: string, mode: GlobalMapLine["mode"]): GlobalMapLine {
  return {
    id,
    index: id.length,
    code: id,
    label: id,
    mode,
    color: "#5146ff",
    textColor: "#ffffff",
    aliases: [],
    stationIds: [],
    geometryIds: [],
  };
}

function createStation(id: string, name: string, line: GlobalMapLine): GlobalMapStation {
  const world = lonLatToWorld({ lon: 2.35, lat: 48.85 });
  return {
    id,
    index: id.length,
    name,
    normalizedName: name.toLowerCase(),
    aliases: [],
    rawRefs: [id],
    lineIds: [line.id],
    ownerChunkId: "fixture",
    isHub: false,
    sourceCrs: "EPSG:2154",
    sourceX: 650000,
    sourceY: 6860000,
    lon: 2.35,
    lat: 48.85,
    worldX: world.x,
    worldY: world.y,
    coordinateSource: "netex",
    transformVersion: "lambert93-ntf-v1",
  };
}

function createEntry(
  station: GlobalMapStation,
  line: GlobalMapLine,
  insideRadius = true,
  additionalLines: GlobalMapLine[] = [],
): NearbyStationEntry {
  return {
    id: station.id,
    station: { ...station, memberStationIds: [station.id] },
    memberStations: [station],
    lines: [line, ...additionalLines],
    distanceMeters: 120,
    insideRadius,
  };
}

function createProjectedHeavyCandidate(
  station: GlobalMapStation,
  line: GlobalMapLine,
): NearbyHeavyTransportCandidate {
  const entry = createEntry(station, line, false);
  return {
    id: entry.id,
    entry,
    station,
    lines: [line],
    distanceMeters: 2_300,
    access: { kind: "direct", walkingSeconds: 900, totalSeconds: 900 },
    accessByLine: { [line.id]: { kind: "direct", walkingSeconds: 900, totalSeconds: 900 } },
    projected: true,
  };
}

function createIsochroneResponse(origin = { lon: 2.35, lat: 48.85 }) {
  return {
    origin,
    zones: [5, 10, 15].map((minutes) => {
      const delta = minutes / 100_000;
      return {
        minutes,
        geometry: {
          type: "Polygon" as const,
          coordinates: [[
            [origin.lon - delta, origin.lat - delta],
            [origin.lon + delta, origin.lat - delta],
            [origin.lon + delta, origin.lat + delta],
            [origin.lon - delta, origin.lat + delta],
            [origin.lon - delta, origin.lat - delta],
          ]],
        },
      };
    }),
  };
}

function createNoiseZonesResponse(origin = { lon: 2.35, lat: 48.85 }): NearbyNoiseZonesResponse {
  return {
    schemaVersion: "1.1",
    origin,
    radiusMeters: 600,
    bbox: [2.34, 48.84, 2.36, 48.86],
    cellSizeDegrees: 0.005,
    columns: 4,
    rows: 4,
    cells: [
      { column: 1, row: 1, value: "11", noiseLevel: 1 },
      { column: 2, row: 1, value: "22", noiseLevel: 2 },
      { column: 1, row: 2, value: "33", noiseLevel: 3 },
    ],
    source: {
      id: "air-noise-grid",
      title: "Couches SIG air-bruit – 9 classes",
      producer: "Airparif et Bruitparif",
      pageUrl: "https://www.bruitparif.fr/opendata-air-bruit/",
      referencePeriod: "2024",
      attribution: "Source des données : Airparif et Bruitparif",
      limitations: [],
    },
  };
}

function installMapViewport(width: number, height: number): () => void {
  const prototype = HTMLDivElement.prototype;
  const originalWidth = Object.getOwnPropertyDescriptor(prototype, "clientWidth");
  const originalHeight = Object.getOwnPropertyDescriptor(prototype, "clientHeight");
  Object.defineProperty(prototype, "clientWidth", {
    configurable: true,
    get() {
      return this.classList?.contains("nearby-map")
        ? width
        : originalWidth?.get?.call(this) ?? 0;
    },
  });
  Object.defineProperty(prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.classList?.contains("nearby-map")
        ? height
        : originalHeight?.get?.call(this) ?? 0;
    },
  });

  return () => {
    if (originalWidth) Object.defineProperty(prototype, "clientWidth", originalWidth);
    else Reflect.deleteProperty(prototype, "clientWidth");
    if (originalHeight) Object.defineProperty(prototype, "clientHeight", originalHeight);
    else Reflect.deleteProperty(prototype, "clientHeight");
  };
}

function installMutableMapViewport(width: number, height: number): {
  set: (nextWidth: number, nextHeight: number) => void;
  restore: () => void;
} {
  const prototype = HTMLDivElement.prototype;
  const originalWidth = Object.getOwnPropertyDescriptor(prototype, "clientWidth");
  const originalHeight = Object.getOwnPropertyDescriptor(prototype, "clientHeight");
  let currentWidth = width;
  let currentHeight = height;

  Object.defineProperty(prototype, "clientWidth", {
    configurable: true,
    get() {
      return this.classList?.contains("nearby-map")
        ? currentWidth
        : originalWidth?.get?.call(this) ?? 0;
    },
  });
  Object.defineProperty(prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.classList?.contains("nearby-map")
        ? currentHeight
        : originalHeight?.get?.call(this) ?? 0;
    },
  });

  return {
    set(nextWidth, nextHeight) {
      currentWidth = nextWidth;
      currentHeight = nextHeight;
    },
    restore() {
      if (originalWidth) Object.defineProperty(prototype, "clientWidth", originalWidth);
      else Reflect.deleteProperty(prototype, "clientWidth");
      if (originalHeight) Object.defineProperty(prototype, "clientHeight", originalHeight);
      else Reflect.deleteProperty(prototype, "clientHeight");
    },
  };
}

function createDomRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockHeavyLabelGeometry(wrapper: ReturnType<typeof mount>, mapWidth: number, mapHeight: number): HTMLElement {
  const mapElement = wrapper.get(".nearby-map").element as HTMLElement;
  vi.spyOn(mapElement, "getBoundingClientRect").mockReturnValue(createDomRect(0, 0, mapWidth, mapHeight));

  const anchor = wrapper.get(".nearby-map__marker-anchor--supplemental").element as HTMLElement;
  const label = anchor.querySelector<HTMLElement>(".nearby-map__heavy-edge-label");
  if (!label) throw new Error("Expected a projected heavy label");

  vi.spyOn(anchor, "getBoundingClientRect").mockImplementation(() => {
    const pointX = Number.parseFloat(anchor.style.left);
    const pointY = Number.parseFloat(anchor.style.top);
    return createDomRect(pointX - 18, pointY - 18, 36, 36);
  });
  vi.spyOn(label, "getBoundingClientRect").mockImplementation(() => {
    const anchorBounds = anchor.getBoundingClientRect();
    const maxWidth = Number.parseFloat(
      anchor.style.getPropertyValue("--nearby-heavy-edge-label-max-width"),
    ) || 205;
    const labelWidth = Math.min(205, maxWidth);
    const labelHeight = 29;
    const isTopRight = anchor.classList.contains("nearby-map__marker-anchor--projection-top-right");
    const isBottomRight = anchor.classList.contains("nearby-map__marker-anchor--projection-bottom-right");
    const below = isTopRight;
    const top = below
      ? anchorBounds.bottom + 7
      : anchorBounds.top - 7 - labelHeight;
    return createDomRect(
      isTopRight || isBottomRight ? anchorBounds.right - labelWidth : anchorBounds.left,
      top,
      labelWidth,
      labelHeight,
    );
  });

  return label;
}

function mountMap(
  stations: NearbyStationEntry[],
  activeLineId?: string,
  lineFlowModel?: GhostLineFlowModel,
  slots: Record<string, string> = {},
  basemapStyle?: "light" | "voyager",
  scheduleState?: (stationId: string) => "visible" | "hidden" | "loading" | "unavailable" | undefined,
  supplementalStations: NearbyHeavyTransportCandidate[] = [],
  activeModes: GlobalMapMode[] = ["METRO", "BUS"],
  travelWalkingSegments: Array<{ id: string; from: { lon: number; lat: number }; to: { lon: number; lat: number } }> = [],
) {
  return mount(NearbyStationsMap, {
    props: {
      origin: { lon: 2.35, lat: 48.85 },
      radius: 600,
      stations,
      supplementalStations,
      selectedLineIds: () => [],
      activeModes,
      basemapStyle,
      activeLineId,
      lineFlowModel,
      scheduleState,
      showNearbyPlaceNames: false,
      travelWalkingSegments,
    },
    global: {
      stubs: {
        TransportMapBasemap: {
          props: {
            layer: { type: String, default: "plan" },
            basemapProvider: { type: String, default: "carto" },
            basemapStyle: { type: String, default: "light" },
          },
          template: "<div data-testid='basemap' :data-basemap-layer='layer' :data-basemap-provider='basemapProvider' :data-basemap-style='basemapStyle' />",
        },
        LineIconBadge: { template: "<span data-testid='line-badge' />" },
      },
    },
    slots,
  });
}

describe("NearbyStationsMap walking route overlay", () => {
  it("renders a dotted walking path between route endpoints", async () => {
    const restoreViewport = installMapViewport(720, 360);
    const wrapper = mountMap(
      [],
      undefined,
      undefined,
      {},
      undefined,
      undefined,
      [],
      ["METRO", "BUS"],
      [{ id: "walking:origin-to-stop", from: { lon: 2.35, lat: 48.85 }, to: { lon: 2.36, lat: 48.86 } }],
    );

    await nextTick();

    const path = wrapper.get(".nearby-map__walking-flow-path");
    expect(path.attributes("d")).toMatch(/^M\s/);
    expect(path.attributes("d")).toContain("L");
    expect(path.attributes("class")).toContain("nearby-map__walking-flow-path");

    wrapper.unmount();
    restoreViewport();
  });
});

describe("NearbyStationsMap pan interaction", () => {
  it("allows primary-pointer panning and clamps repeated movement at the nearby boundary", async () => {
    const wrapper = mountMap([]);
    const map = wrapper.get(".nearby-map");

    await map.trigger("pointerdown", {
      button: 0,
      clientX: 360,
      clientY: 180,
      pointerId: 1,
      pointerType: "mouse",
    });
    await map.trigger("pointermove", {
      buttons: 1,
      clientX: 1_000_000,
      clientY: 1_000_000,
      pointerId: 1,
      pointerType: "mouse",
    });
    await nextTick();
    const firstClampedCamera = wrapper.emitted("cameraChange")?.at(-1)?.[0] as {
      centerWorldX: number;
      centerWorldY: number;
    };

    await map.trigger("pointermove", {
      buttons: 1,
      clientX: 2_000_000,
      clientY: 2_000_000,
      pointerId: 1,
      pointerType: "mouse",
    });
    await nextTick();
    const secondClampedCamera = wrapper.emitted("cameraChange")?.at(-1)?.[0] as {
      centerWorldX: number;
      centerWorldY: number;
    };

    expect(secondClampedCamera.centerWorldX).toBe(firstClampedCamera.centerWorldX);
    expect(secondClampedCamera.centerWorldY).toBe(firstClampedCamera.centerWorldY);
    await map.trigger("pointerup", { pointerId: 1, pointerType: "mouse" });
    expect(map.classes()).not.toContain("nearby-map--dragging");
    wrapper.unmount();
  });

  it("allows one-finger panning when the map is touch-interactive", async () => {
    const restoreViewport = installMapViewport(720, 360);
    const wrapper = mountMap([]);
    const map = wrapper.get(".nearby-map");

    try {
      await nextTick();
      const before = wrapper.emitted("cameraChange")?.at(-1)?.[0] as {
        centerWorldX: number;
        centerWorldY: number;
      };
      await map.trigger("pointerdown", {
        clientX: 360,
        clientY: 180,
        pointerId: 2,
        pointerType: "touch",
      });
      await map.trigger("pointermove", {
        clientX: 400,
        clientY: 200,
        pointerId: 2,
        pointerType: "touch",
      });
      await nextTick();
      const after = wrapper.emitted("cameraChange")?.at(-1)?.[0] as {
        centerWorldX: number;
        centerWorldY: number;
      };

      expect(after.centerWorldX).not.toBe(before.centerWorldX);
      expect(after.centerWorldY).not.toBe(before.centerWorldY);
      await map.trigger("pointerup", { pointerId: 2, pointerType: "touch" });
    } finally {
      wrapper.unmount();
      restoreViewport();
    }
  });
});

describe("NearbyStationsMap walking accessibility zones and controls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the seven primary controls in Xray-first order and can hide them all", async () => {
    const wrapper = mountMap([]);
    const restoreFullscreen = await enterFullscreenForTest(wrapper);

    try {
      expect(wrapper.findAll(".nearby-map__primary-controls > button").map((button) => button.classes()[0])).toEqual([
        "nearby-map__isochrone-toggle",
        "nearby-map__noise-toggle",
        "nearby-map__air-quality-toggle",
        "nearby-map__directory-toggle",
        "nearby-map__basemap-toggle",
        "nearby-map__display-toggle",
        "nearby-map__fullscreen",
      ]);

      await wrapper.setProps({
        showIsochroneControl: false,
        showNoiseControl: false,
        showAirQualityControl: false,
        showDirectoryControl: false,
        showBasemapControl: false,
        showDisplayControl: false,
        showFullscreenControl: false,
      });
      await nextTick();
      expect(wrapper.find(".nearby-map__primary-controls").exists()).toBe(false);
    } finally {
      restoreFullscreen();
      wrapper.unmount();
    }
  });

  it("uses the keyless OpenStreetMap basemap for nearby stations", () => {
    const wrapper = mountMap([]);

    expect(wrapper.get("[data-testid='basemap']").attributes("data-basemap-provider")).toBe("openstreetmap");
    wrapper.unmount();
  });

  it("loads the compiled noise zones on demand and toggles the ear overlay", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify(createNoiseZonesResponse()),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const restoreViewport = installMapViewport(720, 360);
    const wrapper = mountMap([]);

    try {
      const button = wrapper.get(".nearby-map__noise-toggle");
      expect(button.attributes("aria-pressed")).toBe("false");
      expect(button.find("svg").exists()).toBe(true);

      await button.trigger("click");
      await flushPromises();
      await nextTick();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/neighborhood-verdict/noise-grid");
      expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ cache: "no-store" }));
      expect(wrapper.get(".nearby-map__noise-toggle").attributes("aria-pressed")).toBe("true");
      expect(wrapper.findAll(".nearby-map__noise-zone")).toHaveLength(3);
      expect(wrapper.get(".nearby-map__noise-legend").text()).toContain("2024");

      await wrapper.get(".nearby-map__noise-toggle").trigger("click");
      expect(wrapper.find(".nearby-map__noise-zones").exists()).toBe(false);
    } finally {
      wrapper.unmount();
      restoreViewport();
    }
  });

  it("loads the air quality overlay from the shared air/noise grid", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify(createNoiseZonesResponse()),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const restoreViewport = installMapViewport(720, 360);
    const wrapper = mountMap([]);

    try {
      const button = wrapper.get(".nearby-map__air-quality-toggle");
      expect(button.attributes("aria-pressed")).toBe("false");
      expect(button.find("svg").exists()).toBe(true);

      await button.trigger("click");
      await flushPromises();
      await nextTick();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/neighborhood-verdict/noise-grid");
      expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ cache: "no-store" }));
      expect(wrapper.get(".nearby-map__air-quality-toggle").attributes("aria-pressed")).toBe("true");
      expect(wrapper.get(".nearby-map__noise-toggle").attributes("aria-pressed")).toBe("false");
      expect(wrapper.findAll(".nearby-map__air-quality-zone")).toHaveLength(3);
      expect(wrapper.get(".nearby-map__air-quality-legend").text()).toContain("Qualité de l’air");

      await wrapper.get(".nearby-map__noise-toggle").trigger("click");
      expect(wrapper.get(".nearby-map__air-quality-toggle").attributes("aria-pressed")).toBe("false");
      expect(wrapper.find(".nearby-map__air-quality-zones").exists()).toBe(false);
    } finally {
      wrapper.unmount();
      restoreViewport();
    }
  });

  it("highlights hovered environment cells and shows their intensity level", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify(createNoiseZonesResponse()),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const restoreViewport = installMapViewport(720, 360);
    const wrapper = mountMap([]);

    try {
      await wrapper.get(".nearby-map__noise-toggle").trigger("click");
      await flushPromises();
      await nextTick();

      const noiseCell = wrapper.get(".nearby-map__noise-zone[data-noise-level='3']");
      await noiseCell.trigger("mouseenter", { clientX: 360, clientY: 180 });
      expect(noiseCell.classes()).toContain("nearby-map__environment-zone--hovered");
      expect(wrapper.get(".nearby-map__environment-tooltip").text()).toContain("Bruit · Intensité : Bruyant");

      await noiseCell.trigger("mouseleave");
      expect(wrapper.find(".nearby-map__environment-tooltip").exists()).toBe(false);

      await wrapper.get(".nearby-map__noise-toggle").trigger("click");
      await wrapper.get(".nearby-map__air-quality-toggle").trigger("click");
      await flushPromises();
      await nextTick();

      const airQualityCell = wrapper.get(".nearby-map__air-quality-zone[data-air-quality-level='1']");
      await airQualityCell.trigger("mouseenter", { clientX: 360, clientY: 180 });
      expect(airQualityCell.classes()).toContain("nearby-map__environment-zone--hovered");
      expect(wrapper.get(".nearby-map__environment-tooltip").text()).toContain("Pollution de l’air · Niveau : Très favorable");

      await airQualityCell.trigger("mouseleave");
      expect(wrapper.find(".nearby-map__environment-tooltip").exists()).toBe(false);
    } finally {
      wrapper.unmount();
      restoreViewport();
    }
  });

  it("loads real walking zones on demand without moving the current camera", async () => {
    let resolveRequest!: (response: Response) => void;
    const request = new Promise<Response>((resolve) => { resolveRequest = resolve; });
    const fetchMock = vi.fn(() => request);
    vi.stubGlobal("fetch", fetchMock);
    const restoreViewport = installMapViewport(720, 360);
    const wrapper = mountMap([]);

    try {
      await flushPromises();
      await nextTick();
      const cameraBeforeZones = wrapper.emitted("cameraChange")?.at(-1)?.[0];
      await wrapper.get(".nearby-map__isochrone-toggle").trigger("click");
      await nextTick();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(wrapper.find(".nearby-map__isochrone-status--loading").exists()).toBe(true);
      expect(wrapper.find(".nearby-map__isochrone-progress").exists()).toBe(true);

      resolveRequest(new Response(JSON.stringify(createIsochroneResponse()), { status: 200 }));
      await flushPromises();
      await nextTick();

      expect(wrapper.findAll(".nearby-map__walking-zone").map((path) => path.attributes("data-walking-zone"))).toEqual([
        "15",
        "10",
        "5",
      ]);
      expect(wrapper.find(".nearby-map__isochrone-legend").exists()).toBe(false);
      const cameraAfterZones = wrapper.emitted("cameraChange")?.at(-1)?.[0] as {
        centerWorldX: number;
        centerWorldY: number;
        zoom: number;
      } | undefined;
      expect(cameraAfterZones).toEqual(expect.objectContaining({
        centerWorldX: (cameraBeforeZones as typeof cameraAfterZones)?.centerWorldX,
        centerWorldY: (cameraBeforeZones as typeof cameraAfterZones)?.centerWorldY,
        zoom: (cameraBeforeZones as typeof cameraAfterZones)?.zoom,
      }));
    } finally {
      wrapper.unmount();
      restoreViewport();
    }
  });

  it("keeps isochrone geometry aligned after resizing into fullscreen", async () => {
    const viewport = installMutableMapViewport(720, 360);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(createIsochroneResponse()), { status: 200 })));
    const wrapper = mountMap([]);

    try {
      await wrapper.get(".nearby-map__isochrone-toggle").trigger("click");
      await flushPromises();
      await nextTick();
      const normalViewBox = wrapper.get(".nearby-map__walking-zones").attributes("viewBox");

      viewport.set(1_200, 700);
      const restoreFullscreen = await enterFullscreenForTest(wrapper);
      try {
        await nextTick();
        await nextTick();

        expect(normalViewBox).toBe("0 0 720 360");
        expect(wrapper.get(".nearby-map__walking-zones").attributes("viewBox")).toBe("0 0 1200 700");
        expect(Number.parseFloat(wrapper.get(".nearby-map__origin").element.getAttribute("style")?.match(/left:\s*([\d.-]+)/)?.[1] ?? "NaN"))
          .toBeCloseTo(600, 3);
      } finally {
        restoreFullscreen();
      }
    } finally {
      wrapper.unmount();
      viewport.restore();
    }
  });

  it("keeps contour paths static during wheel zoom and shows the hovered threshold", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(createIsochroneResponse()), { status: 200 })));
    const restoreViewport = installMapViewport(720, 360);
    const wrapper = mountMap([]);

    try {
      await wrapper.get(".nearby-map__isochrone-toggle").trigger("click");
      await flushPromises();
      await nextTick();

      const path = wrapper.get(".nearby-map__walking-zone[data-walking-zone='10']");
      const pathBefore = path.attributes("d");
      const transformBefore = wrapper.get(".nearby-map__walking-zones g").attributes("transform");

      await path.trigger("mouseenter", { clientX: 360, clientY: 180 });
      expect(wrapper.get(".nearby-map__isochrone-tooltip").text()).toContain("10 min");
      await path.trigger("mousemove", { clientX: 720, clientY: 180 });
      expect(wrapper.get(".nearby-map__isochrone-tooltip").attributes("style")).toContain("left: 583px");
      expect(wrapper.get(".nearby-map__isochrone-tooltip").attributes("style")).toContain("max-width: 250px");

      await wrapper.get(".nearby-map").trigger("wheel", {
        clientX: 360,
        clientY: 180,
        deltaY: -120,
      });
      await nextTick();

      expect(path.attributes("d")).toBe(pathBefore);
      expect(wrapper.get(".nearby-map__walking-zones g").attributes("transform")).not.toBe(transformBefore);
      await path.trigger("mouseleave");
      expect(wrapper.find(".nearby-map__isochrone-tooltip").exists()).toBe(false);
    } finally {
      wrapper.unmount();
      restoreViewport();
    }
  });

  it("uses the in-memory cache and retries an unavailable request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(createIsochroneResponse()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mountMap([]);

    try {
      await wrapper.get(".nearby-map__isochrone-toggle").trigger("click");
      await flushPromises();
      expect(wrapper.find(".nearby-map__isochrone-status--error").exists()).toBe(true);

      await wrapper.get(".nearby-map__isochrone-status button").trigger("click");
      await flushPromises();
      expect(wrapper.findAll(".nearby-map__walking-zone")).toHaveLength(3);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await wrapper.get(".nearby-map__isochrone-toggle").trigger("click");
      await wrapper.get(".nearby-map__isochrone-toggle").trigger("click");
      await nextTick();
      expect(wrapper.findAll(".nearby-map__walking-zone")).toHaveLength(3);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      wrapper.unmount();
    }
  });

  it("shows a dedicated OpenRouteService key mini-modal and can retry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        statusCode: 503,
        statusMessage: "An OpenRouteService API key is required to display walking zones.",
        data: { code: NEARBY_ISOCHRONES_NOT_CONFIGURED_CODE },
      }), { status: 503, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(createIsochroneResponse()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mountMap([]);

    try {
      await wrapper.get(".nearby-map__isochrone-toggle").trigger("click");
      await flushPromises();

      const modal = wrapper.get(".nearby-map__isochrone-config-modal");
      expect(modal.attributes("role")).toBe("dialog");
      expect(modal.text()).toContain("Clé OpenRouteService nécessaire");
      expect(modal.text()).toContain("NUXT_ORS_API_KEY");
      expect(wrapper.find(".nearby-map__isochrone-status--error").exists()).toBe(false);

      await modal.get(".nearby-map__isochrone-config-primary").trigger("click");
      await flushPromises();
      expect(wrapper.find(".nearby-map__isochrone-config-modal").exists()).toBe(false);
      expect(wrapper.findAll(".nearby-map__walking-zone")).toHaveLength(3);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      wrapper.unmount();
    }
  });

  it("filters normal, non-projected, and projected stations independently", async () => {
    const metro = createLine("line:metro:1", "METRO");
    const normalStation = createStation("station:normal", "Station normale", metro);
    const extraStation = createStation("station:extra", "Station supplémentaire", metro);
    const projectedStation = createStation("station:projected", "Station projetée", metro);
    const nonProjected = { ...createProjectedHeavyCandidate(extraStation, metro), projected: false };
    const projected = createProjectedHeavyCandidate(projectedStation, metro);
    const wrapper = mountMap(
      [createEntry(normalStation, metro, false)],
      undefined,
      undefined,
      {},
      undefined,
      undefined,
      [nonProjected, projected],
      ["METRO"],
    );
    const restoreFullscreen = await enterFullscreenForTest(wrapper);

    try {
      await wrapper.get(".nearby-map__display-toggle").trigger("click");
      const panel = wrapper.get("#nearby-map-display-controls");
      const mapStations = panel.get("[data-nearby-map-show-map-stations] input");
      const projectedStations = panel.get("[data-nearby-map-show-projected-stations] input");
      const normalMarkers = () => wrapper.findAll(".nearby-map__marker-anchor:not(.nearby-map__marker-anchor--supplemental)");
      const supplementalMarkers = () => wrapper.findAll(".nearby-map__marker-anchor--supplemental");

      expect(normalMarkers()).toHaveLength(1);
      expect(supplementalMarkers()).toHaveLength(2);
      await mapStations.setValue(false);
      expect(normalMarkers()).toHaveLength(0);
      expect(supplementalMarkers()).toHaveLength(1);

      await projectedStations.setValue(false);
      expect(supplementalMarkers()).toHaveLength(0);
      await mapStations.setValue(true);
      expect(normalMarkers()).toHaveLength(1);
      expect(supplementalMarkers()).toHaveLength(1);
      await projectedStations.setValue(true);
      expect(supplementalMarkers()).toHaveLength(2);
    } finally {
      restoreFullscreen();
      wrapper.unmount();
    }
  });

  it("applies safe resets when a visible control is disabled", async () => {
    let abortSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      abortSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The request was aborted.", "AbortError"));
        }, { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mountMap([]);

    try {
      await wrapper.get(".nearby-map__isochrone-toggle").trigger("click");
      await nextTick();
      await wrapper.setProps({ showIsochroneControl: false });
      expect(abortSignal?.aborted).toBe(true);
      expect(wrapper.find(".nearby-map__walking-zones").exists()).toBe(false);

      const restoreFullscreen = await enterFullscreenForTest(wrapper);
      try {
        await wrapper.get(".nearby-map__basemap-toggle").trigger("click");
        expect(wrapper.get("[data-testid='basemap']").attributes("data-basemap-layer")).toBe("satellite");
        await wrapper.setProps({ showBasemapControl: false });
        expect(wrapper.get("[data-testid='basemap']").attributes("data-basemap-layer")).toBe("plan");

        await wrapper.get(".nearby-map__display-toggle").trigger("click");
        expect(wrapper.find("#nearby-map-display-controls").exists()).toBe(true);
        await wrapper.setProps({ showDisplayControl: false });
        expect(wrapper.find("#nearby-map-display-controls").exists()).toBe(false);

        await wrapper.setProps({ showFullscreenControl: false });
        await flushPromises();
        expect(wrapper.find(".nearby-map__fullscreen").exists()).toBe(false);
        expect(wrapper.emitted("fullscreen-change")?.at(-1)).toEqual([false]);
      } finally {
        restoreFullscreen();
      }
    } finally {
      wrapper.unmount();
    }
  });
});

describe("NearbyStationsMap places directory mode", () => {
  it("exposes the dedicated neighbourhood score entry when enabled", async () => {
    const wrapper = mountMap([]);
    await wrapper.setProps({ showNeighborhoodScoreControl: true });

    const launcher = wrapper.get(".nearby-map__neighborhood-score-toggle");
    expect(launcher.attributes("aria-label")).toContain("Évaluer le quartier");
    await launcher.trigger("click");
    expect(wrapper.emitted("openNeighborhoodScore")).toHaveLength(1);
    wrapper.unmount();
  });

  it("keeps the directory launcher visible in transit mode", async () => {
    const wrapper = mountMap([]);
    const launcher = wrapper.get(".nearby-map__directory-toggle");
    expect(launcher.attributes("aria-label")).toContain("commerces");
    await launcher.trigger("click");
    expect(wrapper.emitted("openPlacesDirectory")).toHaveLength(1);
    wrapper.unmount();
  });

  it("renders every supplied place without transit chrome in preview mode", async () => {
    const restoreViewport = installMapViewport(720, 420);
    const places = Array.from({ length: 160 }, (_, index) => ({
      id: `place:${index}`,
      name: `Place ${index}`,
      lon: 2.35,
      lat: 48.85,
      category: "shop" as const,
      kind: "shop",
      distanceMeters: index + 1,
    }));
    const wrapper = mount(NearbyStationsMap, {
      props: {
        variant: "places-preview",
        selectedPlaceId: undefined,
        origin: { lon: 2.35, lat: 48.85 },
        radius: 1_200,
        stations: [],
        selectedLineIds: () => [],
        activeModes: [],
        places,
        showNearbyPlaces: true,
      },
      global: {
        stubs: {
          TransportMapBasemap: { template: "<div data-testid='basemap' />" },
          LineIconBadge: { template: "<span />" },
        },
      },
    });
    await nextTick();

    expect(wrapper.findAll(".nearby-map__place")).toHaveLength(160);
    expect(wrapper.find(".nearby-map__sidebar").exists()).toBe(false);
    expect(wrapper.find(".nearby-map__splitter").exists()).toBe(false);
    expect(wrapper.find(".nearby-map__primary-controls").exists()).toBe(false);
    expect(wrapper.find(".nearby-map__zoom-controls").exists()).toBe(false);
    expect(wrapper.find(".nearby-map__markers").exists()).toBe(true);

    await wrapper.findAll(".nearby-map__place")[0]!.trigger("click");
    expect(wrapper.emitted("selectPlace")?.at(-1)).toEqual(["place:0"]);
    await wrapper.findAll(".nearby-map__place")[0]!.trigger("contextmenu");
    expect(wrapper.emitted("placeContextMenu")?.at(-1)).toEqual(["place:0", expect.any(HTMLElement)]);
    wrapper.unmount();
    restoreViewport();
  });

  it("exposes bounded zoom controls in the directory preview when enabled", async () => {
    const restoreViewport = installMapViewport(720, 420);
    const wrapper = mount(NearbyStationsMap, {
      props: {
        variant: "places-preview",
        allowZoom: true,
        origin: { lon: 2.35, lat: 48.85 },
        radius: 1_200,
        stations: [],
        selectedLineIds: () => [],
        activeModes: [],
        places: [],
        showNearbyPlaces: true,
      },
      global: {
        stubs: {
          TransportMapBasemap: { template: "<div data-testid='basemap' />" },
          LineIconBadge: { template: "<span />" },
        },
      },
    });
    await nextTick();
    expect(wrapper.find(".nearby-map__zoom-controls").exists()).toBe(true);
    await nextTick();
    const zoomOut = wrapper.findAll(".nearby-map__zoom-button")[1]!;
    await zoomOut.trigger("click");
    expect(wrapper.find(".nearby-map__zoom-level").text()).not.toBe("100%");
    wrapper.unmount();
    restoreViewport();
  });
});

function createFlowModel(): GhostLineFlowModel {
  return {
    width: 720,
    height: 360,
    color: "#5146ff",
    strokeWidth: 4,
    lineMode: "BUS",
    paths: [{ key: "path", d: "M 0 20 L 720 20", animationDelayMs: 0 }],
    wavePaths: [],
    chevrons: [],
    termini: [{
      key: "terminus:forward",
      directionId: "forward",
      x: 180,
      y: 120,
    }],
    exits: [{
      key: "exit:forward",
      directionId: "forward",
      destination: "Direction Centre",
      side: "top",
      x: 0,
      y: 0,
      angleDeg: 0,
    }],
  };
}

async function enterFullscreenForTest(wrapper: ReturnType<typeof mount>): Promise<() => void> {
  const shell = wrapper.find(".nearby-map-shell").element as HTMLElement;
  const originalFullscreenDescriptor = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
  let fullscreenElement: Element | null = null;

  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(shell, "requestFullscreen", {
    configurable: true,
    value: vi.fn(async () => {
      fullscreenElement = shell;
      document.dispatchEvent(new Event("fullscreenchange"));
    }),
  });

  await wrapper.find(".nearby-map__fullscreen").trigger("click");
  await nextTick();

  return () => {
    if (originalFullscreenDescriptor) {
      Object.defineProperty(document, "fullscreenElement", originalFullscreenDescriptor);
    } else {
      Reflect.deleteProperty(document, "fullscreenElement");
    }
  };
}

describe("NearbyStationsMap line focus", () => {
  it("emits fullscreen state changes for overlays that must stay inside the fullscreen element", async () => {
    const metro = createLine("line:metro:1", "METRO");
    const station = createStation("station:1", "République", metro);
    const wrapper = mountMap([createEntry(station, metro)]);
    const restoreFullscreen = await enterFullscreenForTest(wrapper);

    expect(wrapper.emitted("fullscreen-change")).toEqual([[true]]);
    restoreFullscreen();
    wrapper.unmount();
  });

  it("renders a projected heavy station and exposes its station context event", async () => {
    const metro = createLine("line:metro:1", "METRO");
    const rer = createLine("line:rer:B", "RER");
    rer.code = "C01743";
    rer.label = "C01743";
    const station = createStation("station:rer", "Croix de Berny", rer);
    const entry = createEntry(station, rer, true);
    const candidate: NearbyHeavyTransportCandidate = {
      id: entry.id,
      entry,
      station,
      lines: [rer],
      distanceMeters: 2_300,
      access: { kind: "connection", walkingSeconds: 720, totalSeconds: 1_620, feederLineCode: "T10", feederMode: "BUS" },
      accessByLine: { [rer.id]: { kind: "connection", walkingSeconds: 720, totalSeconds: 1_620, feederLineCode: "T10", feederMode: "BUS" } },
      projected: true,
    };

    const wrapper = mountMap([createEntry(createStation("station:metro", "Antony", metro), metro)], undefined, undefined, {}, undefined, undefined, [candidate], ["METRO", "RER", "BUS"]);
    const marker = wrapper.find(".nearby-map__marker--supplemental");
    expect(marker.exists()).toBe(true);
    expect(wrapper.find(".nearby-map__heavy-edge-label").attributes("aria-label")).toContain("B");
    expect(wrapper.find(".nearby-map__heavy-edge-label").text()).toContain("par Bus");
    expect(wrapper.find(".nearby-map__heavy-edge-label").text()).not.toContain("correspondance");
    expect(wrapper.findAll("[data-testid='nearby-heavy-edge-line-icon']")).toHaveLength(1);
    expect(wrapper.find(".nearby-map__heavy-edge-label").text()).not.toContain("C01743");

    await marker.trigger("mouseenter");
    expect(wrapper.find(".nearby-map__marker-station-name--heavy").exists()).toBe(false);

    await marker.trigger("contextmenu");
    expect(wrapper.emitted("stationContextMenu")).toEqual([[entry.id, expect.any(HTMLElement)]]);
  });

  it("groups every heavy line served by one projected station and excludes feeder lines", () => {
    const rerB = createLine("line:rer:B", "RER");
    rerB.code = "B";
    rerB.label = "B";
    const rerA = createLine("line:rer:A", "RER");
    rerA.code = "A";
    rerA.label = "A";
    const bus = createLine("line:bus:194", "BUS");
    bus.code = "194";
    const station = createStation("station:hub", "Sartrouville", rerB);
    const entry = createEntry(station, rerB, true, [rerA, bus]);
    const access = { kind: "connection" as const, walkingSeconds: 600, totalSeconds: 1_200 };
    const candidate: NearbyHeavyTransportCandidate = {
      id: entry.id,
      entry,
      station,
      lines: [rerB, bus, rerA, rerB],
      distanceMeters: 2_500,
      access,
      accessByLine: { [rerA.id]: access, [rerB.id]: access },
      projected: true,
    };

    const wrapper = mountMap([], undefined, undefined, {}, undefined, undefined, [candidate], ["RER", "BUS"]);
    const label = wrapper.find(".nearby-map__heavy-edge-label");

    expect(label.exists()).toBe(true);
    expect(label.findAll("[data-testid='nearby-heavy-edge-line-icon']")).toHaveLength(2);
    expect(label.attributes("aria-label")).toContain("A");
    expect(label.attributes("aria-label")).toContain("B");
    expect(label.attributes("aria-label")).not.toContain("194");
  });

  it.each(["13", "4"])(
    "activates the projected Metro %s access ghost flow when its label is clicked",
    async (code) => {
      const metro = createLine(`line:metro:${code}`, "METRO");
      metro.code = code;
      metro.label = code;
      const feeder = createLine(`line:bus:access:${code}`, "BUS");
      feeder.code = `access-${code}`;
      const station = createStation(`station:metro:${code}`, `Metro ${code}`, metro);
      const feederStation = createStation(`station:bus:access:${code}`, `Accès ${code}`, feeder);
      const access = {
        kind: "connection" as const,
        walkingSeconds: 240,
        totalSeconds: 900,
        feederLineId: feeder.id,
        feederLineCode: feeder.code,
        feederMode: "BUS" as const,
        feederRideSeconds: 420,
      };
      const candidate: NearbyHeavyTransportCandidate = {
        ...createProjectedHeavyCandidate(station, metro),
        access,
        accessByLine: { [metro.id]: access },
      };
      const wrapper = mountMap(
        [createEntry(feederStation, feeder)],
        undefined,
        undefined,
        {},
        undefined,
        undefined,
        [candidate],
        ["METRO", "BUS"],
      );

      const label = wrapper.get(".nearby-map__heavy-edge-label");
      await label.trigger("click");

      expect(wrapper.emitted("activateLine")).toEqual([[metro.id, station.id, feeder.id]]);
    },
  );

  it("keeps a station oriented due north on the top projection band instead of clamping it into the right side", async () => {
    const restoreViewport = installMapViewport(720, 360);
    let wrapper: ReturnType<typeof mount> | undefined;
    try {
      const metro = createLine("line:metro:north", "METRO");
      metro.code = "N";
      metro.label = "N";
      const station = createStation("station:metro:north", "Station nord", metro);
      const originWorld = lonLatToWorld({ lon: 2.35, lat: 48.85 });
      station.worldX = originWorld.x;
      station.worldY = originWorld.y - 0.01;
      const candidate = createProjectedHeavyCandidate(station, metro);
      wrapper = mountMap([], undefined, undefined, {}, undefined, undefined, [candidate], ["METRO"]);
      await nextTick();

      const anchor = wrapper.get(".nearby-map__marker-anchor--supplemental");
      const projectedLeft = Number.parseFloat((anchor.element as HTMLElement).style.left);

      expect(anchor.classes()).toContain("nearby-map__marker-anchor--projection-top");
      expect(projectedLeft).toBeLessThan(720 * 0.6);
    } finally {
      wrapper?.unmount();
      restoreViewport();
    }
  });

  it("keeps north-projected line icons on one upper band instead of stacking them down the left edge", async () => {
    const restoreViewport = installMapViewport(720, 360);
    let wrapper: ReturnType<typeof mount> | undefined;
    try {
      const metro13 = createLine("line:metro:13", "METRO");
      metro13.code = "13";
      metro13.label = "13";
      const metro4 = createLine("line:metro:4", "METRO");
      metro4.code = "4";
      metro4.label = "4";
      const originWorld = lonLatToWorld({ lon: 2.35, lat: 48.85 });
      const northStation13 = createStation("station:metro:north:13", "Station nord 13", metro13);
      northStation13.worldX = originWorld.x;
      northStation13.worldY = originWorld.y - 0.01;
      const northStation4 = createStation("station:metro:north:4", "Station nord 4", metro4);
      northStation4.worldX = originWorld.x;
      northStation4.worldY = originWorld.y - 0.012;

      wrapper = mountMap(
        [],
        undefined,
        undefined,
        {},
        undefined,
        undefined,
        [
          createProjectedHeavyCandidate(northStation13, metro13),
          createProjectedHeavyCandidate(northStation4, metro4),
        ],
        ["METRO"],
      );
      await nextTick();

      const anchors = wrapper.findAll(".nearby-map__marker-anchor--supplemental");
      expect(anchors).toHaveLength(2);
      expect(anchors.every((anchor) => anchor.classes().includes("nearby-map__marker-anchor--projection-top"))).toBe(true);
      expect(new Set(anchors.map((anchor) => (anchor.element as HTMLElement).style.top))).toEqual(new Set(["26px"]));
    } finally {
      wrapper?.unmount();
      restoreViewport();
    }
  });

  it("reserves only the top projection band and leaves the lower map edge available", async () => {
    const restoreViewport = installMapViewport(720, 360);
    let wrapper: ReturnType<typeof mount> | undefined;
    let restoreFullscreen: (() => void) | undefined;
    try {
      const northLine = createLine("line:metro:north-band", "METRO");
      const southLine = createLine("line:metro:south-edge", "METRO");
      const originWorld = lonLatToWorld({ lon: 2.35, lat: 48.85 });
      const northStation = createStation("station:metro:north-band", "Station nord", northLine);
      northStation.worldX = originWorld.x;
      northStation.worldY = originWorld.y - 0.01;
      const southStation = createStation("station:metro:south-edge", "Station sud", southLine);
      southStation.worldX = originWorld.x;
      southStation.worldY = originWorld.y + 0.01;

      wrapper = mountMap(
        [],
        undefined,
        undefined,
        {},
        undefined,
        undefined,
        [
          createProjectedHeavyCandidate(northStation, northLine),
          createProjectedHeavyCandidate(southStation, southLine),
        ],
        ["METRO"],
      );
      restoreFullscreen = await enterFullscreenForTest(wrapper);
      await nextTick();

      const northAnchor = wrapper.get(".nearby-map__marker-anchor--projection-top");
      const southAnchor = wrapper.get(".nearby-map__marker-anchor--projection-bottom");
      expect((northAnchor.element as HTMLElement).style.top).toBe("26px");
      expect(Number.parseFloat((southAnchor.element as HTMLElement).style.top)).toBe(360);
    } finally {
      restoreFullscreen?.();
      wrapper?.unmount();
      restoreViewport();
    }
  });

  it("keeps the Metro 13 north-east projected label inside the fullscreen map", async () => {
    const restoreViewport = installMapViewport(720, 360);
    let wrapper: ReturnType<typeof mount> | undefined;
    try {
      const metro13 = createLine("line:metro:13", "METRO");
      metro13.code = "13";
      metro13.label = "13";
      const station = createStation("station:metro:13", "Châtillon–Montrouge", metro13);
      const originWorld = lonLatToWorld({ lon: 2.35, lat: 48.85 });
      station.worldX = originWorld.x + 0.01;
      station.worldY = originWorld.y - 0.01;
      const candidate = createProjectedHeavyCandidate(station, metro13);
      wrapper = mountMap([], undefined, undefined, {}, undefined, undefined, [candidate], ["METRO"]);
      await nextTick();

      const anchor = wrapper.get(".nearby-map__marker-anchor--supplemental");
      expect(anchor.classes()).toContain("nearby-map__marker-anchor--projection-top-right");
      expect((anchor.element as HTMLElement).style.top).toBe("74px");
      const label = mockHeavyLabelGeometry(wrapper, 720, 360);
      const mapBounds = wrapper.get(".nearby-map").element.getBoundingClientRect();
      const labelBounds = label.getBoundingClientRect();
      const projectedLeft = Number.parseFloat((anchor.element as HTMLElement).style.left);
      const projectionLabelMaxWidth = Number.parseFloat(
        (anchor.element as HTMLElement).style.getPropertyValue("--nearby-heavy-edge-label-max-width"),
      );
      const menuControl = wrapper.get(".nearby-map__fullscreen").element as HTMLElement;
      vi.spyOn(menuControl, "getBoundingClientRect").mockReturnValue(createDomRect(670, 12, 38, 38));
      const menuBounds = menuControl.getBoundingClientRect();

      expect(projectedLeft).toBeGreaterThanOrEqual(mapBounds.left + 2);
      expect(projectionLabelMaxWidth).toBeGreaterThan(720 * 0.4);
      expect(labelBounds.left).toBeGreaterThanOrEqual(mapBounds.left + 2);
      expect(labelBounds.top).toBeGreaterThanOrEqual(menuBounds.bottom + 8);
      expect(labelBounds.right).toBeLessThanOrEqual(mapBounds.right - 2);
      expect(labelBounds.bottom).toBeLessThanOrEqual(mapBounds.bottom - 2);
    } finally {
      wrapper?.unmount();
      restoreViewport();
    }
  });

  it("keeps the map status below the reserved top controls", async () => {
    const metro = createLine("line:metro:13", "METRO");
    const station = createStation("station:metro:13", "Châtillon–Montrouge", metro);
    const wrapper = mountMap([createEntry(station, metro)]);

    await wrapper.setProps({ loading: true });

    expect(wrapper.get(".nearby-map__loading").attributes("style")).toContain("top: 82px");
  });

  it("keeps the RER B south-east projected label inside a narrow fullscreen map", async () => {
    const restoreViewport = installMapViewport(180, 360);
    let wrapper: ReturnType<typeof mount> | undefined;
    let restoreFullscreen: (() => void) | undefined;
    try {
      const rerB = createLine("line:rer:B", "RER");
      rerB.code = "B";
      rerB.label = "B";
      const station = createStation("station:rer:B", "Croix de Berny", rerB);
      const originWorld = lonLatToWorld({ lon: 2.35, lat: 48.85 });
      station.worldX = originWorld.x + 0.01;
      station.worldY = originWorld.y + 0.01;
      const candidate = createProjectedHeavyCandidate(station, rerB);
      wrapper = mountMap([], undefined, undefined, {}, undefined, undefined, [candidate], ["RER"]);
      restoreFullscreen = await enterFullscreenForTest(wrapper);
      await nextTick();

      const anchor = wrapper.get(".nearby-map__marker-anchor--supplemental");
      expect(anchor.classes()).toContain("nearby-map__marker-anchor--projection-bottom-right");
      const label = mockHeavyLabelGeometry(wrapper, 180, 360);
      const mapBounds = wrapper.get(".nearby-map").element.getBoundingClientRect();
      const labelBounds = label.getBoundingClientRect();
      const projectedLeft = Number.parseFloat((anchor.element as HTMLElement).style.left);
      const projectionLabelMaxWidth = Number.parseFloat(
        (anchor.element as HTMLElement).style.getPropertyValue("--nearby-heavy-edge-label-max-width"),
      );
      const zoomControls = wrapper.get(".nearby-map__zoom-controls").element as HTMLElement;
      vi.spyOn(zoomControls, "getBoundingClientRect").mockReturnValue(createDomRect(120, 220, 44, 124));
      const zoomBounds = zoomControls.getBoundingClientRect();

      expect(projectedLeft).toBeGreaterThanOrEqual(mapBounds.left + 2);
      expect(projectionLabelMaxWidth).toBeGreaterThan(180 * 0.4);
      expect(labelBounds.left).toBeGreaterThanOrEqual(mapBounds.left + 2);
      expect(labelBounds.top).toBeGreaterThanOrEqual(mapBounds.top + 2);
      expect(labelBounds.right).toBeLessThanOrEqual(mapBounds.right - 2);
      expect(labelBounds.bottom).toBeLessThanOrEqual(zoomBounds.top - 8);
    } finally {
      vi.restoreAllMocks();
      restoreFullscreen?.();
      wrapper?.unmount();
      restoreViewport();
    }
  });

  it("pulses local feeder stations after selecting a reachable heavy station", async () => {
    vi.useFakeTimers();
    try {
    const bus = createLine("line:bus:194", "BUS");
    bus.code = "194";
    const metro = createLine("line:metro:1", "METRO");
    const rer = createLine("line:rer:B", "RER");
    rer.code = "B";
    const feederStation = createStation("station:feeder", "Feeder", bus);
    const unrelatedStation = createStation("station:unrelated", "Unrelated", metro);
    const heavyStation = createStation("station:croix", "La Croix de Berny", rer);
    const heavyEntry = createEntry(heavyStation, rer, true);
    const candidate: NearbyHeavyTransportCandidate = {
      id: heavyEntry.id,
      entry: heavyEntry,
      station: heavyStation,
      lines: [rer],
      distanceMeters: 2_700,
      access: {
        kind: "connection",
        walkingSeconds: 540,
        totalSeconds: 1_320,
        feederLineId: bus.id,
        feederLineCode: bus.code,
        feederMode: "BUS",
        feederRideSeconds: 600,
      },
      accessByLine: {
        [rer.id]: {
          kind: "connection",
          walkingSeconds: 540,
          totalSeconds: 1_320,
          feederLineId: bus.id,
          feederLineCode: bus.code,
          feederMode: "BUS",
          feederRideSeconds: 600,
        },
      },
      projected: true,
    };

    const wrapper = mountMap(
      [createEntry(feederStation, bus), createEntry(unrelatedStation, metro)],
      undefined,
      undefined,
      {},
      undefined,
      undefined,
      [candidate],
      ["RER", "BUS", "METRO"],
    );

    await wrapper.find(".nearby-map__marker--supplemental").trigger("click");

    const feederMarker = wrapper.findAll(".nearby-map__marker").find((marker) =>
      marker.attributes("aria-label")?.startsWith("Feeder"),
    );
    const unrelatedMarker = wrapper.findAll(".nearby-map__marker").find((marker) =>
      marker.attributes("aria-label")?.startsWith("Unrelated"),
    );
    expect(feederMarker).toBeDefined();
    expect(unrelatedMarker).toBeDefined();
    expect(feederMarker!.classes()).toContain("nearby-map__marker--feeder-pulse");
    expect(feederMarker!.classes()).not.toContain("nearby-map__marker--attenuated");
    expect(unrelatedMarker!.classes()).not.toContain("nearby-map__marker--feeder-pulse");
    expect(wrapper.emitted("activateLine")).toEqual([[rer.id, heavyStation.id, bus.id]]);

    await vi.advanceTimersByTimeAsync(3_100);
    await nextTick();
    expect(wrapper.find(".nearby-map__marker--feeder-pulse").exists()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pulses and activates every valid feeder while keeping the fastest feeder first", async () => {
    vi.useFakeTimers();
    try {
      const t10 = createLine("line:tram:T10", "TRAM");
      t10.code = "T10";
      t10.label = "T10";
      const bus412 = createLine("line:bus:412", "BUS");
      bus412.code = "412";
      bus412.label = "412";
      const rer = createLine("line:rer:B", "RER");
      rer.code = "B";
      rer.label = "B";
      const t10Station = createStation("station:t10", "Les Peintres", t10);
      const busStation = createStation("station:412", "Croix de Berny", bus412);
      const heavyStation = createStation("station:croix", "La Croix de Berny", rer);
      const entry = createEntry(heavyStation, rer, true);
      const t10Access = {
        kind: "connection" as const,
        walkingSeconds: 360,
        totalSeconds: 600,
        feederLineId: t10.id,
        feederLineCode: t10.code,
        feederMode: "TRAM" as const,
        feederRideSeconds: 420,
      };
      const busAccess = {
        kind: "connection" as const,
        walkingSeconds: 300,
        totalSeconds: 1_200,
        feederLineId: bus412.id,
        feederLineCode: bus412.code,
        feederMode: "BUS" as const,
        feederRideSeconds: 900,
      };
      const candidate: NearbyHeavyTransportCandidate = {
        id: entry.id,
        entry,
        station: heavyStation,
        lines: [rer],
        distanceMeters: 2_700,
        access: t10Access,
        accessByLine: { [rer.id]: t10Access },
        accessAlternatives: [t10Access, busAccess],
        accessAlternativesByLine: { [rer.id]: [t10Access, busAccess] },
        projected: true,
      };

      const wrapper = mountMap(
        [createEntry(t10Station, t10), createEntry(busStation, bus412)],
        undefined,
        undefined,
        {},
        undefined,
        undefined,
        [candidate],
        ["RER", "TRAM", "BUS"],
      );

      await wrapper.find(".nearby-map__marker--supplemental").trigger("click");
      await nextTick();

      const feederMarkers = wrapper.findAll(".nearby-map__marker--feeder-pulse");
      expect(feederMarkers).toHaveLength(2);
      expect(wrapper.emitted("activateLine")).toEqual([[rer.id, heavyStation.id, [t10.id, bus412.id]]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("forwards the configured basemap style to the raster layer", () => {
    const metro = createLine("line:metro:1", "METRO");
    const station = createStation("station:1", "République", metro);
    const wrapper = mountMap([createEntry(station, metro)], undefined, undefined, {}, "light");

    expect(wrapper.get("[data-testid='basemap']").attributes("data-basemap-style")).toBe("light");
  });

  it("renders the city pattern slot inside the fixed-height sidebar", () => {
    const metro = createLine("line:metro:1", "METRO");
    const station = createStation("station:1", "République", metro);
    const wrapper = mountMap(
      [createEntry(station, metro)],
      metro.id,
      undefined,
      { "city-pattern": "<div data-testid='city-pattern-slot'>cities</div>" },
    );

    expect(wrapper.find(".nearby-map__sidebar [data-testid='city-pattern-slot']").exists()).toBe(true);
  });

  it("emits line hover and activation from the station sidebar", async () => {
    const metro = createLine("line:metro:1", "METRO");
    const station = createStation("station:1", "République", metro);
    const wrapper = mountMap([createEntry(station, metro)]);

    await wrapper.find(".nearby-map__marker").trigger("mouseenter");
    const lineButton = wrapper.find(".nearby-map__line");
    expect(lineButton.exists()).toBe(true);

    await lineButton.trigger("mouseenter");
    await lineButton.trigger("click");
    await lineButton.trigger("mouseleave");

    expect(wrapper.emitted("hoverLine")).toEqual([[metro.id]]);
    expect(wrapper.emitted("activateLine")).toEqual([[metro.id]]);
    expect(wrapper.emitted("toggleLine")).toEqual([[station.id, metro.id]]);
    expect(wrapper.emitted("leaveLine")).toEqual([[metro.id]]);
  });

  it("attenuates unrelated bus markers while keeping them in the map", () => {
    const metro = createLine("line:metro:1", "METRO");
    const bus = createLine("line:bus:42", "BUS");
    const metroStation = createStation("station:metro", "République", metro);
    const busStation = createStation("station:bus", "Châtelet", bus);
    const wrapper = mountMap([
      createEntry(metroStation, metro),
      createEntry(busStation, bus),
    ], metro.id);

    const markers = wrapper.findAll(".nearby-map__marker");
    expect(markers).toHaveLength(2);
    expect(markers[1]!.classes()).toContain("nearby-map__marker--attenuated");
    expect(markers[1]!.classes()).toContain("nearby-map__marker--bus");
    expect(markers[0]!.classes()).not.toContain("nearby-map__marker--bus");
  });

  it("renders the V1-style ripple on the pinned marker and keeps walking details inline", async () => {
    const metro = createLine("line:metro:1", "METRO");
    const station = createStation("station:1", "République", metro);
    const wrapper = mountMap([createEntry(station, metro)]);

    await wrapper.find(".nearby-map__marker").trigger("click");

    expect(wrapper.find(".nearby-map__marker--pinned").exists()).toBe(true);
    expect(wrapper.findAll(".nearby-map__marker-ripple")).toHaveLength(2);
    expect(wrapper.emitted("activateLine")).toEqual([[metro.id]]);
    expect(wrapper.find(".nearby-map__pinned-label").exists()).toBe(false);
    expect(wrapper.find(".nearby-map__station-meta").text()).toContain("120 m");
    expect(wrapper.find(".nearby-map__station-meta").text()).toContain("2 min à pied");
  });

  it("shows walking details in the marker label and counts only stations with multiple lines", async () => {
    const metro = createLine("line:metro:1", "METRO");
    const bus = createLine("line:bus:42", "BUS");
    const singleLineStation = createStation("station:single", "République", metro);
    const hubStation = createStation("station:hub", "Châtelet", metro);
    hubStation.lineIds = [metro.id, bus.id];
    const wrapper = mountMap([
      createEntry(singleLineStation, metro),
      createEntry(hubStation, metro, true, [bus]),
    ]);
    const shell = wrapper.find(".nearby-map-shell").element as HTMLElement;
    const originalFullscreenDescriptor = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
    let fullscreenElement: Element | null = null;

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(shell, "requestFullscreen", {
      configurable: true,
      value: vi.fn(async () => {
        fullscreenElement = shell;
        document.dispatchEvent(new Event("fullscreenchange"));
      }),
    });

    try {
      await wrapper.find(".nearby-map__fullscreen").trigger("click");
      await wrapper.findAll(".nearby-map__marker")[1]!.trigger("mouseenter");

      const label = wrapper.find(".nearby-map__marker-station-name");
      expect(label.text()).toContain("Châtelet");
      expect(label.text()).toContain("120 m");
      expect(label.text()).toContain("2 min à pied");
      expect(wrapper.findAll(".nearby-map__line-count")).toHaveLength(1);
      expect(wrapper.get(".nearby-map__line-count").text()).toBe("2");
      expect(wrapper.findAll(".nearby-map__marker").map((marker) => marker.find(".nearby-map__line-count").exists())).toEqual([false, true]);
    } finally {
      vi.restoreAllMocks();
      if (originalFullscreenDescriptor) {
        Object.defineProperty(document, "fullscreenElement", originalFullscreenDescriptor);
      } else {
        Reflect.deleteProperty(document, "fullscreenElement");
      }
    }
  });

  it("repositions ghost exit labels inside the map bounds", async () => {
    const metro = createLine("line:metro:1", "METRO");
    const station = createStation("station:1", "République", metro);
    const wrapper = mountMap([createEntry(station, metro)], metro.id, createFlowModel());
    await nextTick();

    expect(wrapper.find(".transport-ghost-flow__exit--terminus").exists()).toBe(false);
    expect(wrapper.find(".transport-ghost-flow__exit-terminus").exists()).toBe(false);
    expect(wrapper.find(".transport-ghost-flow__terminus").exists()).toBe(true);
    expect(wrapper.find(".transport-ghost-flow__terminus-label").text()).toBe("Terminus");

    const mapElement = wrapper.find(".nearby-map").element as HTMLElement;
    const tooltipElement = wrapper.find(".transport-ghost-flow__exit").element as HTMLElement;
    const mapBounds = {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 720,
      bottom: 360,
      width: 720,
      height: 360,
      toJSON: () => ({}),
    } as DOMRect;

    vi.spyOn(mapElement, "getBoundingClientRect").mockReturnValue(mapBounds);
    vi.spyOn(tooltipElement, "getBoundingClientRect").mockImplementation(() => {
      const offsetX = Number.parseFloat(tooltipElement.style.getPropertyValue("--ghost-flow-exit-overflow-x")) || 0;
      const offsetY = Number.parseFloat(tooltipElement.style.getPropertyValue("--ghost-flow-exit-overflow-y")) || 0;
      return {
        x: -40 + offsetX,
        y: -20 + offsetY,
        left: -40 + offsetX,
        top: -20 + offsetY,
        right: 200 + offsetX,
        bottom: 80 + offsetY,
        width: 240,
        height: 100,
        toJSON: () => ({}),
      } as DOMRect;
    });

    await wrapper.setProps({ lineFlowModel: { ...createFlowModel() } });
    await nextTick();

    const finalBounds = tooltipElement.getBoundingClientRect();
    expect(finalBounds.left).toBeGreaterThanOrEqual(mapBounds.left + 2);
    expect(finalBounds.top).toBeGreaterThanOrEqual(mapBounds.top + 2);
    expect(finalBounds.right).toBeLessThanOrEqual(mapBounds.right - 2);
    expect(finalBounds.bottom).toBeLessThanOrEqual(mapBounds.bottom - 2);
  });

  it("packs several colliding off-map direction tooltips without cycling between occupied slots", async () => {
    const metro = createLine("line:metro:13", "METRO");
    const station = createStation("station:13", "Châtillon–Montrouge", metro);
    const firstFlow = { ...createFlowModel(), lineId: metro.id };
    const flows = [
      firstFlow,
      ...Array.from({ length: 5 }, (_, index) => ({
        ...createFlowModel(),
        lineId: `line:connection:${index}`,
        color: index % 2 === 0 ? "#a00078" : "#00814f",
      })),
    ];
    const wrapper = mountMap([createEntry(station, metro)], metro.id, firstFlow);

    await wrapper.setProps({ lineFlowModels: flows });
    await nextTick();

    const mapElement = wrapper.get(".nearby-map").element as HTMLElement;
    const mapBounds = createDomRect(0, 0, 900, 360);
    vi.spyOn(mapElement, "getBoundingClientRect").mockReturnValue(mapBounds);
    const tooltips = wrapper.findAll(".line-out-of-bounds-direction-tooltip");
    expect(tooltips).toHaveLength(6);

    for (const tooltipWrapper of tooltips) {
      const tooltip = tooltipWrapper.element as HTMLElement;
      vi.spyOn(tooltip, "getBoundingClientRect").mockImplementation(() => {
        const offsetX = Number.parseFloat(tooltip.style.getPropertyValue("--ghost-flow-exit-overflow-x")) || 0;
        const offsetY = Number.parseFloat(tooltip.style.getPropertyValue("--ghost-flow-exit-overflow-y")) || 0;
        return createDomRect(230 + offsetX, 240 + offsetY, 260, 92);
      });
    }

    await wrapper.setProps({
      lineFlowModels: flows.map((flow) => ({ ...flow })),
    });
    await nextTick();

    const finalBounds = tooltips.map((tooltip) =>
      (tooltip.element as HTMLElement).getBoundingClientRect(),
    );
    for (const bounds of finalBounds) {
      expect(bounds.left).toBeGreaterThanOrEqual(mapBounds.left + 2);
      expect(bounds.top).toBeGreaterThanOrEqual(mapBounds.top + 2);
      expect(bounds.right).toBeLessThanOrEqual(mapBounds.right - 2);
      expect(bounds.bottom).toBeLessThanOrEqual(mapBounds.bottom - 2);
    }
    for (let leftIndex = 0; leftIndex < finalBounds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < finalBounds.length; rightIndex += 1) {
        const leftBounds = finalBounds[leftIndex]!;
        const rightBounds = finalBounds[rightIndex]!;
        expect(
          leftBounds.right + 8 <= rightBounds.left
          || rightBounds.right + 8 <= leftBounds.left
          || leftBounds.bottom + 8 <= rightBounds.top
          || rightBounds.bottom + 8 <= leftBounds.top,
        ).toBe(true);
      }
    }
  });

  it("offers a route action on an off-map bus direction", async () => {
    const bus = createLine("line:bus:42", "BUS");
    bus.label = "42";
    const station = createStation("station:bus", "République", bus);
    const wrapper = mountMap([createEntry(station, bus)], bus.id, createFlowModel());

    await wrapper.setProps({ traceActionLabel: "Voir le tracé" });
    const action = wrapper.get(".transport-ghost-flow__trace-action");
    expect(action.text()).toBe("Voir le tracé");
    await action.trigger("click");

    expect(wrapper.emitted("viewTrace")).toEqual([[bus.id, "forward", undefined]]);
  });

  it("offers a route action on an off-map tram direction", async () => {
    const tram = createLine("line:tram:T10", "TRAM");
    tram.label = "T10";
    const station = createStation("station:tram", "Clamart", tram);
    const flow = { ...createFlowModel(), lineId: tram.id, lineMode: "TRAM" as const };
    const wrapper = mountMap([createEntry(station, tram)], tram.id, flow);

    await wrapper.setProps({ traceActionLabel: "Voir le tracé" });
    const action = wrapper.get(".transport-ghost-flow__trace-action");
    expect(action.text()).toBe("Voir le tracé");
    await action.trigger("click");

    expect(wrapper.emitted("viewTrace")).toEqual([[tram.id, "forward", undefined]]);
  });

  it("shows the global display and map controls outside fullscreen", async () => {
    const metro = createLine("line:metro:1", "METRO");
    const station = createStation("station:1", "République", metro);
    const wrapper = mountMap([createEntry(station, metro)]);
    const shell = wrapper.find(".nearby-map-shell").element as HTMLElement;
    const originalFullscreenDescriptor = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
    let fullscreenElement: Element | null = null;

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(shell, "requestFullscreen", {
      configurable: true,
      value: vi.fn(async () => {
        fullscreenElement = shell;
        document.dispatchEvent(new Event("fullscreenchange"));
      }),
    });

    try {
      expect(wrapper.find(".nearby-map__display-toggle").exists()).toBe(true);
      expect(wrapper.find(".nearby-map__basemap-toggle").exists()).toBe(true);
      expect(wrapper.find(".nearby-map__zoom-controls").exists()).toBe(true);

      await wrapper.find(".nearby-map__fullscreen").trigger("click");
      await nextTick();

      const displayToggle = wrapper.find(".nearby-map__display-toggle");
      expect(displayToggle.exists()).toBe(true);
      expect(displayToggle.attributes("aria-expanded")).toBe("false");
      const layerToggle = wrapper.get("[data-nearby-map-layer-toggle]");
      expect(layerToggle.attributes("aria-pressed")).toBe("false");
      expect(wrapper.get("[data-testid='basemap']").attributes("data-basemap-layer")).toBe("plan");

      await layerToggle.trigger("click");
      expect(layerToggle.attributes("aria-pressed")).toBe("true");
      expect(wrapper.get("[data-testid='basemap']").attributes("data-basemap-layer")).toBe("satellite");
      expect(wrapper.get(".nearby-map").classes()).toContain("nearby-map--satellite");

      await layerToggle.trigger("click");
      expect(layerToggle.attributes("aria-pressed")).toBe("false");
      expect(wrapper.get("[data-testid='basemap']").attributes("data-basemap-layer")).toBe("plan");
      expect(wrapper.get(".nearby-map").classes()).not.toContain("nearby-map--satellite");

      expect(wrapper.find(".nearby-map__zoom-controls").exists()).toBe(true);
      expect(wrapper.find(".nearby-map__zoom-level").text()).toBe("100%");

      const zoomInButton = wrapper.findAll(".nearby-map__zoom-button")[0]!;
      await zoomInButton.trigger("click");
      expect(wrapper.find(".nearby-map__zoom-level").text()).not.toBe("100%");

      for (let index = 0; index < 8; index += 1) {
        await zoomInButton.trigger("click");
      }
      expect(Number.parseInt(wrapper.find(".nearby-map__zoom-level").text(), 10)).toBeGreaterThan(200);
      for (let index = 0; index < 100; index += 1) {
        await zoomInButton.trigger("click");
      }
      expect(wrapper.find(".nearby-map__zoom-level").text()).toBe("1000%");
      expect(zoomInButton.attributes("disabled")).toBeDefined();

      await displayToggle.trigger("click");
      const panel = wrapper.find("#nearby-map-display-controls");
      expect(panel.exists()).toBe(true);
      expect(panel.findAll("input[type='checkbox']")).toHaveLength(14);
      expect((panel.find("input[type='checkbox']").element as HTMLInputElement).checked).toBe(true);

      const busCheckbox = panel.findAll("input[type='checkbox']")[0]!;
      await busCheckbox.setValue(false);
      expect(wrapper.emitted("updateActiveModes")?.at(-1)?.[0]).toEqual(["METRO"]);

      const noDepartureCheckbox = panel.get(".nearby-map__schedule-filter input");
      await noDepartureCheckbox.setValue(true);
      expect(wrapper.emitted("updateHideStationsWithoutDepartures")).toEqual([[true]]);

      const mapStationsCheckbox = panel.get("[data-nearby-map-show-map-stations] input");
      const projectedStationsCheckbox = panel.get("[data-nearby-map-show-projected-stations] input");
      expect((mapStationsCheckbox.element as HTMLInputElement).checked).toBe(true);
      expect((projectedStationsCheckbox.element as HTMLInputElement).checked).toBe(true);
      await mapStationsCheckbox.setValue(false);
      await projectedStationsCheckbox.setValue(false);
      expect((mapStationsCheckbox.element as HTMLInputElement).checked).toBe(false);
      expect((projectedStationsCheckbox.element as HTMLInputElement).checked).toBe(false);

      const clusterGrouping = panel.get("[data-nearby-map-cluster-grouping]");
      expect(clusterGrouping.attributes("value")).toBe("200");
      await clusterGrouping.setValue("300");
      expect(wrapper.emitted("updateClusterGroupingDistance")).toEqual([[300]]);
    } finally {
      vi.restoreAllMocks();
      if (originalFullscreenDescriptor) {
        Object.defineProperty(document, "fullscreenElement", originalFullscreenDescriptor);
      } else {
        Reflect.deleteProperty(document, "fullscreenElement");
      }
    }
  });

  it("relays nearby visibility toggles from fullscreen display controls", async () => {
    const metro = createLine("line:metro:1", "METRO");
    const station = createStation("station:1", "République", metro);
    const wrapper = mountMap([createEntry(station, metro)]);
    await wrapper.setProps({ hideLongWaitTransports: true, showNearbyPlaces: true, showNearbyPlaceNames: false });
    const restoreFullscreen = await enterFullscreenForTest(wrapper);

    try {
      await wrapper.get(".nearby-map__display-toggle").trigger("click");
      const panel = wrapper.get("#nearby-map-display-controls");
      const longWaitToggle = panel.get("[data-hide-long-wait-transports]");
      const placesToggle = panel.get("[data-show-nearby-places]");
      const placeNamesToggle = panel.get("[data-show-nearby-place-names]");
      expect((longWaitToggle.element as HTMLInputElement).checked).toBe(true);
      expect((placesToggle.element as HTMLInputElement).checked).toBe(true);
      expect((placeNamesToggle.element as HTMLInputElement).checked).toBe(false);
      expect((placeNamesToggle.element as HTMLInputElement).disabled).toBe(false);

      await longWaitToggle.setValue(false);
      await placesToggle.setValue(false);
      await placeNamesToggle.setValue(true);
      expect(wrapper.emitted("update:hideLongWaitTransports")).toEqual([[false]]);
      expect(wrapper.emitted("update:showNearbyPlaces")).toEqual([[false]]);
      expect(wrapper.emitted("update:showNearbyPlaceNames")).toEqual([[true]]);

      await wrapper.setProps({ showNearbyPlaces: false });
      expect((placeNamesToggle.element as HTMLInputElement).disabled).toBe(true);
    } finally {
      restoreFullscreen();
    }
  });

  it("renders named nearby places only while the places layer is enabled", async () => {
    const restoreViewport = installMapViewport(720, 360);
    let wrapper: ReturnType<typeof mount> | undefined;
    try {
      const metro = createLine("line:metro:13", "METRO");
      const station = createStation("station:13", "Châtillon–Montrouge", metro);
      wrapper = mountMap([createEntry(station, metro)]);
      await nextTick();
      await wrapper.setProps({
        showNearbyPlaces: true,
        showNearbyPlaceNames: true,
        places: [{ id: "node:1", name: "Intermarché", lon: 2.35, lat: 48.85, category: "shop", kind: "supermarket", distanceMeters: 80 }],
      });

      expect(wrapper.get(".nearby-map__place").text()).toContain("Intermarché");
      expect(wrapper.get(".nearby-map__place").attributes("aria-label")).toContain("80");
      await wrapper.setProps({ showNearbyPlaces: false });
      expect(wrapper.find(".nearby-map__place").exists()).toBe(false);
    } finally {
      wrapper?.unmount();
      restoreViewport();
    }
  });

  it("shows a compact place tooltip on hover while keeping names opt-in", async () => {
    const restoreViewport = installMapViewport(720, 360);
    let wrapper: ReturnType<typeof mount> | undefined;
    try {
      const metro = createLine("line:metro:13", "METRO");
      const station = createStation("station:13", "Châtillon–Montrouge", metro);
      wrapper = mountMap([createEntry(station, metro)]);
      await wrapper.setProps({
        showNearbyPlaces: true,
        showNearbyPlaceNames: false,
        places: [{ id: "node:1", name: "Intermarché", lon: 2.35, lat: 48.85, category: "shop", kind: "supermarket", distanceMeters: 80 }],
        walkingRoutes: {
          "node:1": {
            id: "node:1",
            provider: "idfm-navitia",
            distanceMeters: 640,
            durationSeconds: 1_500,
            coordinates: [{ lon: 2.35, lat: 48.85 }, { lon: 2.351, lat: 48.851 }],
          },
        },
      });

      expect(wrapper.find(".nearby-map__place-name").exists()).toBe(false);
      await wrapper.get(".nearby-map__place").trigger("mouseenter");

      const tooltip = wrapper.get("[data-testid='place-tooltip']");
      expect(tooltip.get(".place-tooltip__name").text()).toBe("Intermarché");
      expect(tooltip.get(".place-tooltip__type").text()).toBe("Supermarché");
      expect(tooltip.get(".place-tooltip__walking").text()).toContain("25 min");
      expect(wrapper.get(".nearby-map__place").attributes("aria-label")).toContain("640");
      expect(tooltip.find("svg").exists()).toBe(true);

      await wrapper.setProps({ showNearbyPlaceNames: true });
      expect(wrapper.get(".nearby-map__place-name").text()).toBe("Intermarché");
      await wrapper.setProps({ showNearbyPlaces: false });
      expect(wrapper.find(".nearby-map__place").exists()).toBe(false);
    } finally {
      wrapper?.unmount();
      restoreViewport();
    }
  });

  it("opens a left travel sidebar without replacing the station sidebar", async () => {
    const metro = createLine("line:metro:13", "METRO");
    const station = createStation("station:13", "Châtillon–Montrouge", metro);
    const wrapper = mountMap(
      [createEntry(station, metro)],
      undefined,
      undefined,
      { "travel-sidebar": "<div data-testid='travel-sidebar'>Itinéraires</div>" },
    );

    await wrapper.get(".nearby-map__travel-toggle").trigger("click");
    expect(wrapper.emitted("toggleTravelPanel")).toEqual([[]]);
    await wrapper.setProps({ travelPanelOpen: true });
    expect(wrapper.get("[data-testid='travel-sidebar']").text()).toBe("Itinéraires");
    expect(wrapper.find(".nearby-map__sidebar").exists()).toBe(true);
  });

  it("hides station tooltips while the travel panel is active", async () => {
    const metro = createLine("line:metro:13", "METRO");
    const station = createStation("station:13", "Châtillon–Montrouge", metro);
    const wrapper = mountMap([createEntry(station, metro)]);

    await wrapper.find(".nearby-map__marker").trigger("mouseenter");
    expect(wrapper.find(".nearby-map__marker-station-name").exists()).toBe(true);

    await wrapper.setProps({ travelPanelOpen: true });
    expect(wrapper.find(".nearby-map__marker-station-name").exists()).toBe(false);

    await wrapper.setProps({ travelPanelOpen: false });
    expect(wrapper.find(".nearby-map__marker-station-name").exists()).toBe(true);
  });

  it("keeps the add action enabled for a station outside the radius", async () => {
    const metro = createLine("line:metro:1", "METRO");
    const station = createStation("station:outside", "La Défense", metro);
    const wrapper = mountMap([createEntry(station, metro, false)]);

    await wrapper.find(".nearby-map__marker").trigger("click");

    const addButton = wrapper.find(".nearby-map__select");
    expect(addButton.exists()).toBe(true);
    expect(addButton.attributes("disabled")).toBeUndefined();

    await addButton.trigger("click");
    expect(wrapper.emitted("toggleStation")).toEqual([[station.id]]);
  });

  it("offers an accessible per-station schedule toggle when schedule state is provided", async () => {
    const metro = createLine("line:metro:1", "METRO");
    const station = createStation("station:1", "République", metro);
    const wrapper = mountMap(
      [createEntry(station, metro)],
      undefined,
      undefined,
      {},
      undefined,
      () => "visible",
    );

    await wrapper.find(".nearby-map__marker").trigger("mouseenter");

    const toggle = wrapper.get(".nearby-map__schedule-toggle");
    expect(toggle.attributes("aria-label")).toBe("Masquer les horaires de cette station");

    await toggle.trigger("click");
    expect(wrapper.emitted("toggleStationSchedule")).toEqual([[station.id]]);
  });

  it("keeps the compact schedule slot visible without hovering when schedules are enabled", async () => {
    const metro = createLine("line:metro:1", "METRO");
    const station = createStation("station:1", "République", metro);
    const wrapper = mountMap(
      [createEntry(station, metro)],
      undefined,
      undefined,
      { "station-schedules-inline": "<div data-testid='inline-schedule'>2 min</div>" },
      undefined,
      () => "visible",
    );

    const inlineSchedule = wrapper.find("[data-testid='inline-schedule']");
    expect(inlineSchedule.exists()).toBe(true);
    expect(inlineSchedule.element.parentElement?.classList.contains("nearby-map__marker-body")).toBe(true);
    expect(wrapper.find(".nearby-map__marker-station-name").exists()).toBe(false);

    await wrapper.setProps({ scheduleState: () => "hidden" });
    expect(wrapper.find("[data-testid='inline-schedule']").exists()).toBe(false);
  });

  it("keeps only feeder schedule badges while a projected heavy station is focused", async () => {
    const metro12 = createLine("line:metro:12", "METRO");
    metro12.code = "12";
    const bus394 = createLine("line:bus:394", "BUS");
    bus394.code = "394";
    const bus195 = createLine("line:bus:195", "BUS");
    bus195.code = "195";
    const feederStation = createStation("station:bus:394", "Arrêt 394", bus394);
    const unrelatedStation = createStation("station:bus:195", "Arrêt 195", bus195);
    const heavyStation = createStation("station:metro:12", "Métro 12", metro12);
    const heavyEntry = createEntry(heavyStation, metro12, false);
    const access = {
      kind: "connection" as const,
      walkingSeconds: 240,
      totalSeconds: 780,
      feederLineId: bus394.id,
      feederLineCode: bus394.code,
      feederMode: "BUS" as const,
      feederRideSeconds: 540,
    };
    const candidate: NearbyHeavyTransportCandidate = {
      id: heavyEntry.id,
      entry: heavyEntry,
      station: heavyStation,
      lines: [metro12],
      distanceMeters: 2_300,
      access,
      accessByLine: { [metro12.id]: access },
      projected: true,
    };
    const wrapper = mountMap(
      [createEntry(feederStation, bus394), createEntry(unrelatedStation, bus195)],
      undefined,
      undefined,
      { "station-schedules-inline": "<div data-testid='inline-schedule'>schedule</div>" },
      undefined,
      () => "visible",
      [candidate],
      ["METRO", "BUS"],
    );

    expect(wrapper.findAll("[data-testid='inline-schedule']")).toHaveLength(2);

    await wrapper.find(".nearby-map__marker--supplemental").trigger("click");
    await nextTick();

    const focusedInlineAnchors = wrapper.findAll(".nearby-map__marker-anchor").filter((anchor) =>
      anchor.find("[data-testid='inline-schedule']").exists(),
    );
    expect(focusedInlineAnchors).toHaveLength(1);
    expect(focusedInlineAnchors[0]!.get(".nearby-map__marker").attributes("aria-label"))
      .toContain("Arrêt 394");

    await wrapper.get(".nearby-map").trigger("click");
    await nextTick();
    expect(wrapper.findAll("[data-testid='inline-schedule']")).toHaveLength(2);
  });

  it("keeps only the access tooltip for a projected heavy station", () => {
    const rer = createLine("line:rer:B", "RER");
    rer.code = "B";
    rer.label = "B";
    const station = createStation("station:rer:B", "Croix de Berny", rer);
    const candidate = createProjectedHeavyCandidate(station, rer);
    const wrapper = mountMap(
      [],
      undefined,
      undefined,
      { "station-schedules-inline": "<div data-testid='inline-schedule'>Imminent</div>" },
      undefined,
      () => "visible",
      [candidate],
      ["RER"],
    );

    expect(wrapper.find(".nearby-map__heavy-edge-label").exists()).toBe(true);
    expect(wrapper.find("[data-testid='inline-schedule']").exists()).toBe(false);
  });

  it("allows the fullscreen sidebar splitter to be adjusted with the keyboard", async () => {
    const metro = createLine("line:metro:1", "METRO");
    const station = createStation("station:1", "République", metro);
    const wrapper = mountMap([createEntry(station, metro)]);
    const splitter = wrapper.get(".nearby-map__splitter");

    expect(splitter.attributes("aria-valuenow")).toBe("310");
    await splitter.trigger("keydown", { key: "ArrowLeft" });
    expect(splitter.attributes("aria-valuenow")).toBe("326");
    await splitter.trigger("keydown", { key: "ArrowRight" });
    expect(splitter.attributes("aria-valuenow")).toBe("310");
  });

  it("can hide stations whose loaded boards have no upcoming departures", async () => {
    const metro = createLine("line:metro:1", "METRO");
    const first = createStation("station:with-departure", "République", metro);
    const second = createStation("station:without-departure", "Châtelet", metro);
    const wrapper = mountMap([
      createEntry(first, metro),
      createEntry(second, metro),
    ]);

    await wrapper.setProps({
      hideStationsWithoutDepartures: true,
      stationHasUpcomingDeparture: (stationId: string) => stationId === first.id,
    });
    expect(wrapper.findAll(".nearby-map__marker")).toHaveLength(1);
    expect(wrapper.find(".nearby-map__marker").attributes("aria-label")).toContain("République");

    await wrapper.setProps({ hideStationsWithoutDepartures: false });
    expect(wrapper.findAll(".nearby-map__marker")).toHaveLength(2);
  });
});
