import { probeGreenSpaceTransit } from "../src/features/nearby-stations/useGreenSpaceTransit";
import { flushPromises, mount } from "@vue/test-utils";
import { expect, it, vi } from "vitest";
import type { GreenBoundary } from "../shared/natureInCity";
import NeighborhoodGreeneryMap from "../src/features/nearby-stations/NeighborhoodGreeneryMap.vue";
import { routeToGreenSpace } from "../src/features/nearby-stations/greenSpaceWalking";
import { getGreenSpaceMapData } from "../src/features/nearby-stations/greenSpaceMapData";

const mocks = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  setData: vi.fn(),
  route: vi.fn(),
  constructMap: vi.fn(),
  moving: false,
  moveEnd: undefined as (() => void) | undefined,
}));

vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(),
  LngLatBounds: class { extend() {} isEmpty() { return false; } },
  Marker: class {
    constructor(private options: { element: HTMLElement }) {}
    setLngLat() { return this; }
    addTo(map: { host: HTMLElement }) { map.host.append(this.options.element); }
    remove() { this.options.element.remove(); }
  },
  Map: class {
    host: HTMLElement;
    sources = new Map<string, { setData(data: unknown): void }>();
    styleLoaded?: () => void;
    constructor({ container }: { container: HTMLElement }) { this.host = container; mocks.constructMap(); }
    getCanvas() { return { getContext: () => ({}), addEventListener: vi.fn() }; }
    once(event: string, callback: () => void) {
      if (event === "moveend") mocks.moveEnd = callback;
      else this.styleLoaded = callback;
    }
    isMoving() { return mocks.moving; }
    setStyle() { this.styleLoaded?.(); }
    addSource(id: string) { this.sources.set(id, { setData: (data: unknown) => mocks.setData(id, data) }); }
    getSource(id: string) { return this.sources.get(id); }
    fitBounds = mocks.fitBounds;
    hasImage() { return true; }
    on() {}
    off() {}
    setPaintProperty() {}
    addLayer() {}
    resize() {}
    remove() {}
  },
}));
vi.mock("../src/services/nearbyWalkingRoutes", () => ({ getNearbyWalkingRoute: mocks.route }));

function square(lon: number): GreenBoundary {
  return { type: "Polygon", coordinates: [[[lon, 48.8], [lon + .01, 48.8],
    [lon + .01, 48.81], [lon, 48.81], [lon, 48.8]]] };
}

it("shares geometry between the background loader and the map even if one selection is cancelled", async () => {
  const geometry = { boundary: square(2.30) };
  let deliver!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { deliver = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const reference = { scope: "park", id: "cache-fixture" } as const;
  const first = new AbortController();
  const second = new AbortController();
  try {
    const background = getGreenSpaceMapData(reference, undefined, first.signal);
    const displayed = getGreenSpaceMapData(reference, undefined, second.signal);
    first.abort();
    deliver(new Response(JSON.stringify(geometry)));
    await expect(background).rejects.toMatchObject({ name: "AbortError" });
    await expect(displayed).resolves.toEqual(geometry);
    await expect(getGreenSpaceMapData({ ...reference }, undefined, second.signal)).resolves.toEqual(geometry);
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("uses the fastest verified entrance even when another gate is closer as the crow flies", async () => {
  const origin = { lon: 2.29, lat: 48.805 };
  const near = { lon: 2.30, lat: 48.805 };
  const far = { lon: 2.31, lat: 48.805 };
  mocks.route.mockImplementation(({ destination, routingPolicy }) => {
    if (destination.lon === near.lon && routingPolicy !== "gtfs-access") {
      return Promise.resolve({ provider: "straight-line", fallback: true, coordinates: [origin, destination] });
    }
    return Promise.resolve({ provider: routingPolicy === "gtfs-access" ? "ign-bdtopo" : "idfm-navitia",
      coordinates: [origin, destination], durationSeconds: destination.lon === near.lon ? 1500 : 1057 });
  });
  try {
    const result = await routeToGreenSpace({ boundary: square(2.30), entrances: [near, far] },
      { scope: "park", id: "fixture" }, origin, "Jardin", new AbortController().signal);
    expect(result).toMatchObject({ access: "entrance",
      route: { provider: "idfm-navitia", durationSeconds: 1057, coordinates: [origin, far] } });
    expect(mocks.route.mock.calls.map(([request]) => [request.destination, request.routingPolicy])).toEqual([
      [near, undefined], [far, undefined], [near, "gtfs-access"],
    ]);
  } finally {
    mocks.route.mockReset();
  }
});

it("reveals only places in the selected boundary after the camera stops", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () =>
    ({ boundary: square(url.includes("id=first") ? 2.30 : 2.32) }) })));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const base = { category: "service" as const, kind: "toilets", distanceMeters: 100, lat: 48.805 };
  const wrapper = mount(NeighborhoodGreeneryMap, { props: { expanded: true, reference: { scope: "park", id: "first" },
    places: [{ ...base, id: "1", name: "Équipement A", lon: 2.305 }, { ...base, id: "2", name: "Équipement B", lon: 2.325 }] } });
  try {
    const rendered = () => mocks.setData.mock.calls.filter(([source]) => source === "park-equipment").at(-1)?.[1].features;
    await flushPromises();
    const toggle = wrapper.get('[role="switch"]');
    expect(toggle.attributes("aria-checked")).toBe("false");
    expect(wrapper.findAll(".greenery-place-marker")).toHaveLength(0);
    await toggle.trigger("click");
    await flushPromises();
    expect(rendered()).toEqual([{ type: "Feature", geometry: { type: "Point", coordinates: [2.305, 48.805] },
      properties: { icon: "park-equipment-toilets", name: "Équipement A" } }]);
    mocks.moving = true;
    await wrapper.setProps({ reference: { scope: "park", id: "second" } });
    await flushPromises();
    expect(rendered()?.map((feature: { properties: { name: string } }) => feature.properties.name)).toEqual(["Équipement A"]);
    mocks.moving = false;
    mocks.moveEnd?.();
    await flushPromises();
    expect(rendered()?.map((feature: { properties: { name: string } }) => feature.properties.name)).toEqual(["Équipement B"]);
    await toggle.trigger("click");
    await flushPromises();
    expect(rendered()).toEqual([]);
  } finally {
    mocks.moving = false;
    mocks.moveEnd = undefined;
    wrapper.unmount();
    vi.unstubAllGlobals();
  }
});

it("sends hundreds of equipment points to a single map source without creating HTML markers", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ boundary: square(2.4) }) })));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const places = Array.from({ length: 650 }, (_, index) => ({
    category: "service" as const, kind: index % 2 ? "bench" : "toilets", distanceMeters: 10,
    id: String(index), name: `Équipement ${index}`, lat: 48.805, lon: 2.401 + index / 100000,
  }));
  const start = mocks.setData.mock.calls.length;
  const wrapper = mount(NeighborhoodGreeneryMap, { props: {
    expanded: true, reference: { scope: "park", id: "many-facilities" }, places,
  } });
  try {
    await flushPromises();
    await wrapper.get('[role="switch"]').trigger("click");
    await flushPromises();
    const updates = mocks.setData.mock.calls.slice(start).filter(([source]) => source === "park-equipment");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.[1].features).toHaveLength(650);
    expect(wrapper.find(".greenery-place-marker").exists()).toBe(false);
  } finally {
    wrapper.unmount();
    vi.unstubAllGlobals();
  }
});

it("routes to public entrances, eases on the same map, and omits the route inside a park", async () => {
  mocks.constructMap.mockClear();
  const origin = { lon: 2.25, lat: 48.805 };
  const entrance = { lon: 2.301, lat: 48.8 };
  const fetchMap = vi.fn((url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve(
    url.includes("id=outside")
      ? { boundary: square(2.30), entrances: [entrance], surfaceM2: 340_000, openingHours: "08:00–20:00",
        subsites: [{ name: "Jardin historique", boundary: square(2.30) }] }
      : url.includes("id=inside") ? { boundary: square(2.245) } : { boundary: square(2.30) },
  ) }));
  vi.stubGlobal("fetch", fetchMap);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  mocks.route.mockImplementation(({ origin, destination }) =>
    Promise.resolve({ provider: "openrouteservice", coordinates: [origin, destination], durationSeconds: 240 }));
  const wrapper = mount(NeighborhoodGreeneryMap, { props: { expanded: true, origin, mapLabel: "Parc test",
    reference: { scope: "park", id: "outside" } } });
  try {
    await flushPromises();
    expect(wrapper.find(".greenery-home-marker").exists()).toBe(true);
    expect(wrapper.text()).toContain("34 ha");
    expect(wrapper.text()).toContain("08:00–20:00");
    expect(wrapper.text()).toContain("Jardin historique");
    expect(mocks.route.mock.calls[0]?.[0]).toMatchObject({ origin, destination: entrance });
    expect(mocks.setData).toHaveBeenLastCalledWith("walk", expect.objectContaining({
      features: [expect.objectContaining({ geometry: { type: "LineString", coordinates: [[2.25, 48.805], [2.301, 48.8]] } })],
    }));
    const subsite = wrapper.get(".greenery-preview__subsites button");
    await subsite.trigger("click");
    expect(subsite.attributes("aria-pressed")).toBe("true");
    expect(mocks.setData).toHaveBeenCalledWith("subsite", expect.objectContaining({
      features: [expect.objectContaining({ geometry: square(2.30) })],
    }));

    await wrapper.setProps({ reference: { scope: "park", id: "inside" } });
    await flushPromises();
    expect(mocks.constructMap).toHaveBeenCalledTimes(1);
    expect(mocks.fitBounds).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ linear: true, duration: 750 }));
    expect(mocks.route).toHaveBeenCalledTimes(1);
    expect(mocks.setData).toHaveBeenLastCalledWith("walk", { type: "FeatureCollection", features: [] });
    expect(wrapper.text()).not.toContain("08:00–20:00");

    await wrapper.setProps({ reference: { scope: "park", id: "contour" } });
    await flushPromises();
    expect(mocks.route.mock.calls[1]?.[0]).toMatchObject({ origin, destination: { lon: 2.30, lat: 48.805 } });
  } finally {
    wrapper.unmount();
    vi.unstubAllGlobals();
  }
});

it.each([false, true])("checks the pedestrian network arrival for woodland transit (inside: %s)", async (inside) => {
  const origin = { lon: 2.25, lat: 48.805 };
  const edge = { lon: 2.3, lat: 48.805 };
  const main = { lon: 2.304, lat: 48.805 };
  const routedArrival = { lon: inside ? 2.303 : 2.299, lat: 48.805 };
  const probeJourneys = vi.fn(async (request: { destination: { lon: number; lat: number } }) => {
    const forMain = request.destination.lon === main.lon;
    return [{
      durationSeconds: forMain ? 1200 : 660,
      sections: [
        { type: "public_transport", lineMode: "TRAM" as const, lineCode: "T6", durationSeconds: 600 },
        { type: "walking", durationSeconds: forMain ? 600 : 60, geometry: [origin, routedArrival, request.destination] },
      ],
    }];
  });
  const result = await probeGreenSpaceTransit({ id: "woods", scope: "woodland", origin,
    edge, entrances: [], boundary: square(2.3) },
  { probeJourneys, spaces: [{ id: "woodland:woods", woodlandMap: { id: "woods" }, transitPoints: [main] }] },
  new AbortController().signal);
  expect(result.reachesMainWoodland).toBe(inside);
  expect(result.best?.durationSeconds).toBe(inside ? 1200 : 660);
});

it("offers both modes on a park, renders a prepared direct journey, and restores the walking trace", async () => {
  const origin = { lon: 2.25, lat: 48.805 };
  const destination = { lon: 2.3, lat: 48.805 };
  const transitLeg = { type: "public_transport", durationSeconds: 600, lineCode: "T6", lineMode: "TRAM" as const,
    geometry: [origin, destination] };
  const probeJourneys = vi.fn(async (request: { destination: { lon: number } }) => [
    { transferCount: 1, durationSeconds: 420, sections: [transitLeg, transitLeg] },
    ...(request.destination.lon > 2.305 ? [{ transferCount: 0, durationSeconds: 900, sections: [transitLeg] }]
      : [{ transferCount: 0, durationSeconds: 850, sections: [transitLeg, { type: "walking", durationSeconds: 250 }] }]),
  ]);
  mocks.route.mockImplementation(({ origin, destination }) =>
    Promise.resolve({ provider: "openrouteservice", coordinates: [origin, destination], durationSeconds: 240 }));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true, json: async () => ({ boundary: square(2.30), entrances: [destination] }),
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const { best } = await probeGreenSpaceTransit({ id: "sceaux", scope: "park", origin,
    edge: destination, entrances: [destination], boundary: square(2.30) },
    { probeJourneys, datetime: "20261121T090000" }, new AbortController().signal);
  expect(probeJourneys.mock.calls.length).toBeGreaterThan(1);
  expect(probeJourneys.mock.calls[0]?.[0]).toMatchObject({ origin, destination, maxTransfers: 0 });
  probeJourneys.mockClear();
  const wrapper = mount(NeighborhoodGreeneryMap, { props: { expanded: true, origin, mapLabel: "Forêt test",
    reference: { scope: "park", id: "sceaux" },
    transit: { probeJourneys, datetime: "20261121T090000", version: "test", journeys: new Map([["sceaux", best]]), loadPaths: async () => [] },
  } });
  try {
    await flushPromises();
    const [walking, transit] = wrapper.findAll(".greenery-preview__mode button");
    expect(walking?.attributes("aria-pressed")).toBe("true");
    expect(transit?.attributes("aria-pressed")).toBe("false");
    expect(probeJourneys).not.toHaveBeenCalled();
    await transit!.trigger("click");
    await flushPromises();
    expect(transit?.attributes("aria-pressed")).toBe("true");
    expect(probeJourneys).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("15 min · direct");
    expect(wrapper.get(".line-icon-badge__label").text()).toBe("T6");
    expect(wrapper.find(".greenery-preview__map .greenery-preview__line-label").exists()).toBe(true);
    expect(wrapper.emitted("transit-duration")?.[0]?.[1]).toBe(15);
    expect(mocks.setData).toHaveBeenCalledWith("transit", expect.objectContaining({
      features: [expect.objectContaining({ geometry: { type: "LineString", coordinates: [[2.25, 48.805], [2.3, 48.805]] } })],
    }));
    await walking!.trigger("click");
    expect(walking?.attributes("aria-pressed")).toBe("true");
    expect(mocks.setData).toHaveBeenLastCalledWith("walk", expect.objectContaining({
      features: [expect.objectContaining({ geometry: expect.objectContaining({ type: "LineString" }) })],
    }));
    await wrapper.setProps({ reference: { scope: "address", ...origin, version: "0".repeat(24) } });
    await flushPromises();
    expect(wrapper.find(".greenery-preview__mode").exists()).toBe(false);
  } finally {
    wrapper.unmount();
    vi.unstubAllGlobals();
  }
});
