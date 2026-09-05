import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeocoderPoint } from "../src/features/transport-map/contracts/geocoder";
import type {
  GlobalMapEntrance,
  GlobalMapLine,
  GlobalMapStation,
} from "../src/features/transport-map/contracts/manifest";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../src/features/transport-map/config/globalTransportPlanConfig";
import GlobalTransportPlanSearch from "../src/features/transport-map/search/GlobalTransportPlanSearch.vue";
import type { GlobalMapMarker } from "../src/features/line-map/globalMapMarkers";
import { createGlobalMapSearchIndex } from "../src/features/transport-map/search/globalMapSearch";

vi.mock("../src/features/transport-map/search/globalMapSearch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/features/transport-map/search/globalMapSearch")>();
  return { ...actual, createGlobalMapSearchIndex: vi.fn(actual.createGlobalMapSearchIndex) };
});

const station = {
  id: "station:chatelet",
  index: 0,
  name: "Châtelet–Les Halles",
  normalizedName: "chatelet les halles",
  city: "Paris 1er",
  aliases: ["Châtelet", "Chatelet Les Halles"],
  rawRefs: ["station:chatelet"],
  lineIds: ["line:IDFM:C01374", "line:rer:a"],
  ownerChunkId: "chunk:0",
  isHub: true,
  sourceCrs: "EPSG:2154",
  sourceX: 652469,
  sourceY: 6861275,
  lon: 2.347,
  lat: 48.858,
  worldX: 0.5,
  worldY: 0.35,
  coordinateSource: "netex",
  transformVersion: "lambert93-ntf-v1",
} satisfies GlobalMapStation;

const line14 = {
  id: "line:IDFM:C01374",
  index: 0,
  code: "C01374",
  label: "4",
  mode: "METRO",
  color: "#be418d",
  textColor: "#ffffff",
  aliases: ["Métro 4", "Ligne 4"],
  stationIds: [station.id],
  geometryIds: ["path:14"],
} satisfies GlobalMapLine;

const lineRerA = {
  id: "line:rer:a",
  index: 1,
  code: "A",
  label: "A",
  mode: "RER",
  color: "#e2231a",
  textColor: "#ffffff",
  aliases: ["RER A"],
  stationIds: [station.id],
  geometryIds: ["path:rer-a"],
} satisfies GlobalMapLine;

const lineBus20 = {
  id: "line:bus:20",
  index: 2,
  code: "20",
  label: "20",
  mode: "BUS",
  color: "#15803d",
  textColor: "#ffffff",
  aliases: ["Bus 20"],
  stationIds: [station.id],
  geometryIds: ["path:bus-20"],
} satisfies GlobalMapLine;

const entrances: GlobalMapEntrance[] = [
  {
    id: "entrance:one",
    stationIndex: station.index,
    stationId: station.id,
    name: "Sortie 1 – Place Sainte-Opportune",
    lon: station.lon,
    lat: station.lat,
    worldX: station.worldX,
    worldY: station.worldY,
  },
  {
    id: "entrance:two",
    stationIndex: station.index,
    stationId: station.id,
    name: "Sortie 2 – Rue de Rivoli",
    lon: station.lon,
    lat: station.lat,
    worldX: station.worldX,
    worldY: station.worldY,
  },
];

const louvrePlace = {
  id: "place:louvre",
  lon: 2.3364,
  lat: 48.8606,
  label: "Musée du Louvre",
  city: "Paris",
  type: "place",
  kind: "museum",
  category: "culture",
} satisfies GeocoderPoint;

const louvreAddress = {
  id: "address:louvre",
  lon: 2.3365,
  lat: 48.8607,
  label: "Rue de Rivoli",
  city: "Paris",
  type: "address",
} satisfies GeocoderPoint;

const louvreStation = {
  id: "station:louvre",
  lon: 2.3366,
  lat: 48.8608,
  label: "Louvre-Rivoli",
  city: "Paris",
  type: "station",
} satisfies GeocoderPoint;

const savedMarker = {
  id: "marker:home",
  name: "Appartement",
  address: "277 avenue de la division leclerc, Châtenay-Malabry",
  lon: 2.267785,
  lat: 48.764151,
  icon: "home",
} satisfies GlobalMapMarker;

describe("GlobalTransportPlanSearch", () => {
  let wrapper: VueWrapper | undefined;

  beforeEach(() => {
    vi.mocked(createGlobalMapSearchIndex).mockClear();
    vi.useFakeTimers();
    window.localStorage.clear();
    wrapper?.unmount();
    wrapper = undefined;
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.useRealTimers();
  });

  it("does not index a hydrated catalogue while closed, including after reopening", async () => {
    wrapper = mount(GlobalTransportPlanSearch, {
      props: { stations: [], lines: [], catalogReady: false },
    });
    await wrapper.setProps({ stations: [station], lines: [line14, lineRerA], catalogReady: true });
    expect(createGlobalMapSearchIndex).not.toHaveBeenCalled();

    await wrapper.setProps({ open: true });
    expect(createGlobalMapSearchIndex).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain(station.name);

    await wrapper.setProps({ open: false });
    const updatedStation = { ...station, name: "Updated station" };
    await wrapper.setProps({ stations: [updatedStation] });
    expect(createGlobalMapSearchIndex).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ open: true });
    expect(createGlobalMapSearchIndex).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain(updatedStation.name);
  });

  it("is closed by default and can be opened and closed explicitly", async () => {
    wrapper = mount(GlobalTransportPlanSearch, {
      props: { stations: [station], lines: [line14, lineRerA], catalogReady: true },
    });

    expect(wrapper.find("input").exists()).toBe(false);
    await wrapper.get(".global-map-search__open").trigger("click");
    await wrapper.setProps({ open: true });
    expect(wrapper.find("input").exists()).toBe(true);
    expect(wrapper.emitted("update:open")?.[0]).toEqual([true]);

    await wrapper.get(".global-map-search__close").trigger("click");
    await wrapper.setProps({ open: false });
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.emitted("update:open")?.at(-1)).toEqual([false]);
  });

  it("presents the IDFM-style search surface and emits a station with its exit count", async () => {
    wrapper = mount(GlobalTransportPlanSearch, {
      props: {
        open: true,
        stations: [station],
        lines: [line14, lineRerA],
        entrances,
        catalogReady: true,
      },
    });

    expect(wrapper.get("input").attributes("placeholder")).toContain("station");
    expect(wrapper.text()).not.toContain("Suggestions");
    expect(wrapper.text()).toContain("Correspondances");

    await wrapper.get("input").setValue("chatelet");
    await vi.advanceTimersByTimeAsync(180);
    await wrapper.vm.$nextTick();
    const result = wrapper.find(".global-map-search__result");
    expect(result.text()).toContain("Châtelet");
    expect(result.text()).toContain("2 sorties");
    expect(result.findAll(".global-map-search__line-chip")).toHaveLength(2);

    await result.trigger("click");
    expect(wrapper.emitted("select-station")?.[0]?.[0]).toMatchObject({ id: station.id, name: station.name });
    expect(wrapper.text()).toContain("Récentes");
  });

  it("searches a complete line and emits it through keyboard selection", async () => {
    wrapper = mount(GlobalTransportPlanSearch, {
      props: {
        open: true,
        stations: [station],
        lines: [line14, lineRerA],
        entrances,
        catalogReady: true,
      },
    });

    const input = wrapper.get("input");
    await input.setValue("ligne 4");
    await vi.advanceTimersByTimeAsync(180);
    await wrapper.vm.$nextTick();
    const lineResult = wrapper.get(".global-map-search__result");
    expect(lineResult.text()).toContain("Ligne 4");
    expect(lineResult.find('img[src*="LIGIDFMC01374.svg"]').exists()).toBe(true);
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("select-line")?.[0]?.[0]).toMatchObject({ id: line14.id, code: line14.code });
  });

  it("shows only place destinations in a dedicated section and emits a clicked place", async () => {
    const searchPlaces = vi.fn(async () => [louvrePlace, louvreAddress, louvreStation]);
    wrapper = mount(GlobalTransportPlanSearch, {
      props: {
        open: true,
        stations: [],
        lines: [],
        catalogReady: true,
        searchPlaces,
      },
    });

    await wrapper.get("input").setValue("louvre");
    await vi.advanceTimersByTimeAsync(GLOBAL_TRANSPORT_PLAN_CONFIG.search.debounceMs);
    await flushPromises();
    await wrapper.vm.$nextTick();

    const placeResult = wrapper.get('[data-global-map-search-result-type="place"]');
    expect(wrapper.text()).toContain("Lieux d’intérêt");
    expect(placeResult.text()).toContain("Musée du Louvre");
    expect(placeResult.text()).toContain("Musée");
    expect(placeResult.text()).not.toContain("Lieu d’intérêt");
    expect(placeResult.find('[data-global-map-place-icon="landmark"]').exists()).toBe(true);
    expect(placeResult.text()).not.toContain("Rue de Rivoli");
    expect(placeResult.text()).not.toContain("Louvre-Rivoli");

    await placeResult.trigger("click");
    expect(wrapper.emitted("select-place")?.[0]?.[0]).toEqual(louvrePlace);
  });

  it("selects a place with the same keyboard navigation as stations and lines", async () => {
    const searchPlaces = vi.fn(async () => [louvrePlace]);
    wrapper = mount(GlobalTransportPlanSearch, {
      props: {
        open: true,
        stations: [],
        lines: [],
        catalogReady: true,
        searchPlaces,
      },
    });

    const input = wrapper.get("input");
    await input.setValue("louvre");
    await vi.advanceTimersByTimeAsync(GLOBAL_TRANSPORT_PLAN_CONFIG.search.debounceMs);
    await flushPromises();
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("select-place")?.[0]?.[0]).toEqual(louvrePlace);
  });

  it("searches saved markers by name or address and emits the selected marker", async () => {
    wrapper = mount(GlobalTransportPlanSearch, {
      props: {
        open: true,
        stations: [],
        lines: [],
        markers: [savedMarker],
        catalogReady: true,
      },
    });

    await wrapper.get("input").setValue("division leclerc");
    await vi.advanceTimersByTimeAsync(180);
    await wrapper.vm.$nextTick();

    const markerResult = wrapper.get('[data-global-map-search-result-type="marker"]');
    expect(markerResult.text()).toContain("Appartement");
    expect(markerResult.text()).toContain("277 avenue");
    await markerResult.trigger("click");

    expect(wrapper.emitted("select-marker")?.[0]?.[0]).toEqual(savedMarker);
  });

  it("does not return hidden saved markers", async () => {
    const hiddenMarker = {
      ...savedMarker,
      id: "marker:hidden",
      name: "Repère invisible",
      address: "1 rue invisible, Paris",
      isHidden: true,
    } satisfies GlobalMapMarker;
    wrapper = mount(GlobalTransportPlanSearch, {
      props: {
        open: true,
        stations: [],
        lines: [],
        markers: [hiddenMarker],
        catalogReady: true,
      },
    });

    await wrapper.get("input").setValue("invisible");
    await vi.advanceTimersByTimeAsync(180);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-global-map-search-result-type="marker"]').exists()).toBe(false);
  });

  it("aborts obsolete place requests and ignores their late responses", async () => {
    const pending: Array<{
      query: string;
      signal: AbortSignal;
      resolve: (points: GeocoderPoint[]) => void;
    }> = [];
    const searchPlaces = vi.fn((searchQuery: string, signal?: AbortSignal) => new Promise<GeocoderPoint[]>((resolve) => {
      pending.push({ query: searchQuery, signal: signal!, resolve });
    }));
    wrapper = mount(GlobalTransportPlanSearch, {
      props: {
        open: true,
        stations: [],
        lines: [],
        catalogReady: true,
        searchPlaces,
      },
    });

    const input = wrapper.get("input");
    await input.setValue("louvre");
    await vi.advanceTimersByTimeAsync(GLOBAL_TRANSPORT_PLAN_CONFIG.search.debounceMs);
    expect(searchPlaces).toHaveBeenCalledTimes(1);

    await input.setValue("louv");
    expect(pending[0]?.signal.aborted).toBe(true);
    pending[0]?.resolve([louvrePlace]);
    await flushPromises();
    expect(wrapper.text()).not.toContain("Musée du Louvre");

    await vi.advanceTimersByTimeAsync(GLOBAL_TRANSPORT_PLAN_CONFIG.search.debounceMs);
    expect(searchPlaces).toHaveBeenCalledTimes(2);
    expect(pending[1]?.query).toBe("louv");
    const newerPlace = { ...louvrePlace, id: "place:louvre-new", label: "Louvre nouveau" };
    pending[1]?.resolve([newerPlace]);
    await flushPromises();
    expect(wrapper.text()).toContain("Louvre nouveau");
    expect(wrapper.text()).not.toContain("Musée du Louvre");
  });

  it("caches identical place queries after rapid backspaces", async () => {
    const searchPlaces = vi.fn(async () => [louvrePlace]);
    wrapper = mount(GlobalTransportPlanSearch, {
      props: {
        open: true,
        stations: [],
        lines: [],
        catalogReady: true,
        searchPlaces,
      },
    });

    const input = wrapper.get("input");
    await input.setValue("louvre");
    await vi.advanceTimersByTimeAsync(GLOBAL_TRANSPORT_PLAN_CONFIG.search.debounceMs);
    await flushPromises();
    await input.setValue("louvr");
    await input.setValue("louv");
    await input.setValue("lou");
    await input.setValue("");
    await vi.advanceTimersByTimeAsync(GLOBAL_TRANSPORT_PLAN_CONFIG.search.debounceMs);
    expect(searchPlaces).toHaveBeenCalledTimes(1);

    await input.setValue("louvre");
    await vi.advanceTimersByTimeAsync(GLOBAL_TRANSPORT_PLAN_CONFIG.search.debounceMs);
    await flushPromises();
    expect(searchPlaces).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("Musée du Louvre");
  });

  it("requests the complete static catalogue when a partial bootstrap is searched", async () => {
    wrapper = mount(GlobalTransportPlanSearch, {
      props: {
        open: true,
        stations: [],
        lines: [line14],
        catalogReady: false,
        catalogLoading: false,
      },
    });

    await wrapper.get("input").setValue("14");
    expect(wrapper.emitted("request-catalog")).toHaveLength(1);
  });

  it("keeps bus chips hidden until hover delay, with focus as an accessible shortcut", async () => {
    const stationWithBus = { ...station, lineIds: [lineRerA.id, line14.id, lineBus20.id] } satisfies GlobalMapStation;
    wrapper = mount(GlobalTransportPlanSearch, {
      props: {
        open: true,
        stations: [stationWithBus],
        lines: [line14, lineRerA, lineBus20],
        catalogReady: true,
      },
    });

    await wrapper.get("input").setValue("chatelet");
    await vi.advanceTimersByTimeAsync(180);
    await wrapper.vm.$nextTick();
    const result = wrapper.get(".global-map-search__result");
    await result.trigger("pointerenter");
    expect(result.findAll(".global-map-search__line-chip")).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(result.findAll(".global-map-search__line-chip")).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(result.findAll(".global-map-search__line-chip")).toHaveLength(3);

    await result.trigger("pointerleave");
    await wrapper.setProps({ open: true });
    await wrapper.get("input").trigger("keydown", { key: "Escape" });
    await wrapper.get("input").trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("update:open")?.at(-1)).toEqual([false]);
  });
});
