import { flushPromises, mount, shallowMount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NearbyStationScheduleItem } from "../src/features/nearby-stations/nearbyStationSchedules";
import type { NearbyStationEntry } from "../src/features/nearby-stations/nearbyStations";
import type { NearbyPlace } from "../src/features/nearby-stations/nearbyPlaces";
import MyNearbyStationsPage from "../src/features/nearby-stations/MyNearbyStationsPage.vue";

const mocks = vi.hoisted(() => ({
  geocode: vi.fn(),
  nearby: {
    query: { value: "" },
    selectedPlace: { value: undefined as { lon: number; lat: number; label?: string } | undefined },
    radius: { value: 600 },
    clusterGroupingDistanceMeters: { value: 200 },
    stations: { value: [] },
    visibleStations: { value: [] as NearbyStationEntry[] },
    activeModes: { value: ["METRO", "RER", "TRAIN", "TRANSILIEN", "TRAM", "CABLE", "BUS", "NOCTILIEN"] },
    isScanning: { value: false },
    errorType: { value: undefined },
    selectedLineIds: vi.fn(() => []),
    selectPlace: vi.fn(async (place: { lon: number; lat: number; label?: string }) => {
      mocks.nearby.selectedPlace.value = place;
    }),
    clearError: vi.fn(),
    toggleMode: vi.fn(),
    setActiveModes: vi.fn(),
    toggleStation: vi.fn(),
    toggleLine: vi.fn(),
  },
  routeState: {
    path: "/nearby-stations",
    query: {} as Record<string, unknown>,
    params: {} as Record<string, unknown>,
  },
  lineFlow: {
    lineFlowLoading: { value: false },
    lineFlowModel: { value: undefined },
    activeLineId: { value: undefined },
    hoveredLineId: { value: undefined },
    handleCameraChange: vi.fn(),
    handleHoverLine: vi.fn(),
    handleLeaveLine: vi.fn(),
    handleActivateLine: vi.fn(),
    clearLineFocus: vi.fn(),
  },
  schedules: {
    items: { value: [] as unknown[] },
    isRefreshing: { value: false },
    scheduleState: vi.fn(),
    toggleStationSchedule: vi.fn(),
    resetVisibility: vi.fn(),
  },
  nearbyPlaces: {
    places: { value: [] as unknown[] },
    isLoading: { value: false },
    error: { value: undefined as Error | undefined },
    refresh: vi.fn(async () => undefined),
  },
  nearbyPlacesOptions: undefined as undefined | { radius: { value: number }; enabled: { value: boolean } },
  travelRoutes: {
    destination: { value: undefined as { lon: number; lat: number; label?: string } | undefined },
    departureDateTime: { value: "" },
    routes: { value: [] as unknown[] },
    selectedRoute: { value: undefined },
    selectedRouteId: { value: undefined },
    isLoading: { value: false },
    error: { value: undefined as string | undefined },
    setDestination: vi.fn(async (point: { lon: number; lat: number; label?: string }) => {
      mocks.travelRoutes.destination.value = point;
    }),
    setDepartureDateTime: vi.fn(),
    searchDestinations: vi.fn(async () => []),
    refresh: vi.fn(),
    selectRoute: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock("#imports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#imports")>();
  return {
    ...actual,
    useRoute: () => mocks.routeState,
    useRouter: () => ({ replace: vi.fn(async () => undefined) }),
  };
});

const trafficScheduleItem = {
  id: "station:rer:B",
  stationId: "station:rer",
  line: { id: "line:rer:B", sourceLineId: "line:rer:B", mode: "RER" },
  state: "visible",
  board: {
    line: { ref: "line:rer:B" },
    schedule: { lineRef: "line:rer:B" },
  },
} as unknown as NearbyStationScheduleItem;

vi.mock("../src/features/nearby-stations/geocoding", () => ({
  createIgnTransportMapGeocoder: () => ({ geocode: mocks.geocode }),
}));
vi.mock("../src/features/nearby-stations/useNearbyStations", () => ({
  useNearbyStations: () => mocks.nearby,
}));
vi.mock("../src/features/nearby-stations/useNearbyStationsLineFlow", () => ({
  useNearbyStationsLineFlow: () => mocks.lineFlow,
}));
vi.mock("../src/features/nearby-stations/useNearbyStationSchedules", () => ({
  useNearbyStationSchedules: () => mocks.schedules,
}));
vi.mock("../src/features/nearby-stations/useNearbyPlaces", () => ({
  useNearbyPlaces: (options: { radius: { value: number }; enabled: { value: boolean } }) => {
    mocks.nearbyPlacesOptions = options;
    return mocks.nearbyPlaces;
  },
}));
vi.mock("../src/features/nearby-stations/useTravelRoutes", () => ({
  useTravelRoutes: () => mocks.travelRoutes,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.nearby.selectedPlace.value = undefined;
  mocks.nearby.visibleStations.value = [];
  mocks.schedules.items.value = [];
  mocks.nearbyPlaces.places.value = [];
  mocks.nearbyPlaces.error.value = undefined;
  mocks.nearbyPlacesOptions = undefined;
  mocks.travelRoutes.destination.value = undefined;
  mocks.routeState.query = {};
});

describe("MyNearbyStationsPage", () => {
  it("offers the address presets, selects the first one, changes address and reports geocoding errors", async () => {
    mocks.geocode.mockImplementation(async (label: string) => {
      if (label.includes("division leclerc")) throw new Error("IGN unavailable");
      return [{ lon: 2.35, lat: 48.85, label, provider: "ign" }];
    });

    const wrapper = shallowMount(MyNearbyStationsPage, {
      global: {
        stubs: {
          NearbyStationsMap: {
            props: { hideLongWaitTransports: Boolean, showNearbyPlaceNames: Boolean },
            template: "<div data-testid='nearby-map' :data-hide-long-wait-transports='String(hideLongWaitTransports)' :data-show-nearby-place-names='String(showNearbyPlaceNames)'><slot name='station-schedules' :active-station-id='undefined' /><slot name='traffic-modal' /></div>",
          },
          NearbyStationSchedulePanel: {
            props: ["items", "trafficAlertForItem"],
            emits: ["openTraffic"],
            template: "<div data-testid='schedule-panel'><button v-if='items.length && trafficAlertForItem && trafficAlertForItem(items[0])' class='mock-traffic-chip' type='button' @click='$emit(\"openTraffic\", items[0], trafficAlertForItem(items[0]))'>{{ trafficAlertForItem(items[0]).label }}</button></div>",
          },
        },
      },
    });

    await flushPromises();

    expect(wrapper.get("[data-testid='nearby-map']").attributes("data-hide-long-wait-transports")).toBe("true");
    expect(wrapper.get("[data-testid='nearby-map']").attributes("data-show-nearby-place-names")).toBe("false");
    expect(mocks.nearbyPlacesOptions?.radius.value).toBe(1_200);
    expect(mocks.nearbyPlacesOptions?.enabled.value).toBe(true);
    const select = wrapper.get("select");
    expect(select.findAll("option")).toHaveLength(4);
    expect((select.element as HTMLSelectElement).value).toBe("chateaubriand");
    expect(mocks.geocode).toHaveBeenCalledWith("9 rue chateaubriand 92320");

    await select.setValue("simoneDeBeauvoir");
    await flushPromises();
    expect(mocks.geocode).toHaveBeenCalledWith("1 avenue simone de beauvoir cormeilles en parisis");
    expect(mocks.nearby.selectPlace).toHaveBeenCalledTimes(2);

    await select.setValue("divisionLeclerc");
    await flushPromises();
    expect(wrapper.text()).toContain("La recherche d'adresses est temporairement indisponible.");

    wrapper.unmount();
  });

  it("uses exact address coordinates from the Nearby URL without geocoding again", async () => {
    mocks.routeState.query = {
      address: "277 avenue de la division leclerc, Châtenay-Malabry",
      lat: "48.76591",
      lon: "2.26821",
    };
    mocks.geocode.mockResolvedValue([{ lon: 9, lat: 9, label: "wrong fallback", provider: "ign" }]);

    const wrapper = shallowMount(MyNearbyStationsPage, {
      global: {
        stubs: {
          NearbyStationsMap: {
            template: "<div data-testid='nearby-map'><slot name='station-schedules' :active-station-id='undefined' /><slot name='traffic-modal' /></div>",
          },
        },
      },
    });

    await flushPromises();

    expect(mocks.geocode).not.toHaveBeenCalled();
    expect(mocks.nearby.selectPlace).toHaveBeenCalledWith(expect.objectContaining({
      label: "277 avenue de la division leclerc, Châtenay-Malabry",
      lat: 48.76591,
      lon: 2.26821,
      provider: "global-map",
    }));
    expect((wrapper.get("select").element as HTMLSelectElement).value).toBe("__custom");
    expect(wrapper.get(".my-nearby-stations-page__resolved").text()).toContain("277 avenue de la division leclerc");

    wrapper.unmount();
  });

  it("loads nearby line traffic and opens the shared modal from a card chip", async () => {
    const now = Date.now();
    mocks.schedules.items.value = [trafficScheduleItem];
    mocks.geocode.mockResolvedValue([{ lon: 2.35, lat: 48.85, label: "Châteaubriand", provider: "ign" }]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        lines: [{
          lineRef: "line:rer:B",
          status: "disrupted",
          disruptions: [{
            id: "disruption:rer-b",
            title: "Trafic interrompu",
            message: "La circulation est interrompue.",
            kind: "incident",
            applicationPeriods: [{
              begin: new Date(now - 60_000).toISOString(),
              end: new Date(now + 3_600_000).toISOString(),
            }],
            impactedLineRefs: ["line:rer:B"],
            impactedStopNames: [],
          }],
        }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = mount(MyNearbyStationsPage, {
      global: {
        stubs: {
          NearbyStationsMap: {
            template: "<div data-testid='nearby-map'><slot name='station-schedules' :active-station-id='undefined' /><slot name='traffic-modal' /></div>",
          },
          NearbyStationSchedulePanel: {
            props: ["items", "trafficAlertForItem"],
            emits: ["openTraffic"],
            template: "<div data-testid='schedule-panel'><button v-if='items.length && trafficAlertForItem && trafficAlertForItem(items[0])' class='mock-traffic-chip' type='button' @click='$emit(\"openTraffic\", items[0], trafficAlertForItem(items[0]))'>{{ trafficAlertForItem(items[0]).label }}</button></div>",
          },
        },
      },
    });

    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/traffic?"));
    const chip = wrapper.get(".mock-traffic-chip");
    expect(chip.text()).toBe("Interruption");

    await chip.trigger("click");
    await flushPromises();

    expect(wrapper.find(".traffic-alert-modal").exists()).toBe(true);
    expect(wrapper.get("[role='dialog']").text()).toContain("Trafic interrompu");

    wrapper.unmount();
  });

  it("offers Google Maps, route and clipboard actions for a station context menu", async () => {
    mocks.geocode.mockResolvedValue([{ lon: 2.29, lat: 48.80, label: "Origin", provider: "ign" }]);
    mocks.nearby.visibleStations.value = [{
      id: "station:test",
      station: {
        id: "station:test",
        name: "Station Test",
        city: "Clamart",
        lon: 2.295,
        lat: 48.805,
      },
      memberStations: [],
      lines: [],
      distanceMeters: 240,
    } as unknown as NearbyStationEntry];

    const openMock = vi.spyOn(window, "open").mockImplementation(() => null);
    const originalClipboard = navigator.clipboard;
    const clipboardWriteMock = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWriteMock },
    });

    const wrapper = shallowMount(MyNearbyStationsPage, {
      global: {
        stubs: {
          NearbyStationsMap: {
            props: ["travelPanelOpen"],
            emits: ["stationContextMenu"],
            template: "<div data-testid='nearby-map' :data-travel-open='String(travelPanelOpen)'><button class='mock-station' type='button' @click='$emit(\"stationContextMenu\", \"station:test\", $event.currentTarget)'>station</button><slot name='station-schedules' :active-station-id='undefined' /><slot name='traffic-modal' /></div>",
          },
          ContextMenu: {
            props: ["open"],
            template: "<div v-if='open' data-testid='station-context-menu'><slot /></div>",
          },
        },
      },
    });

    await flushPromises();
    await wrapper.get(".mock-station").trigger("click");
    await flushPromises();

    const menu = wrapper.get("[data-testid='station-context-menu']");
    expect(menu.text()).toContain("Ouvrir la station dans Google Maps");
    await menu.findAll("button")[0]!.trigger("click");
    expect(openMock).toHaveBeenCalledWith(
      expect.stringContaining("Station%20Test"),
      "_blank",
      "noopener,noreferrer",
    );

    await wrapper.get(".mock-station").trigger("click");
    await flushPromises();
    await wrapper.get("[data-testid='station-context-menu']").findAll("button")[1]!.trigger("click");
    await flushPromises();
    expect(mocks.travelRoutes.setDestination).toHaveBeenCalledWith(expect.objectContaining({
      label: "Station Test, Clamart",
      type: "station",
      lon: 2.295,
      lat: 48.805,
    }));
    expect(wrapper.get("[data-testid='nearby-map']").attributes("data-travel-open")).toBe("true");

    await wrapper.get(".mock-station").trigger("click");
    await flushPromises();
    await wrapper.get("[data-testid='station-context-menu']").findAll("button")[2]!.trigger("click");
    await flushPromises();
    expect(clipboardWriteMock).toHaveBeenCalledWith("Station Test, Clamart");
    expect(wrapper.text()).toContain("Adresse de la station copiée");

    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: originalClipboard });
    } else {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    }
    openMock.mockRestore();
    wrapper.unmount();
  });

  it("offers Google Maps, route and clipboard actions for a place context menu", async () => {
    mocks.geocode.mockResolvedValue([{ lon: 2.29, lat: 48.80, label: "Origin", provider: "ign" }]);
    mocks.nearbyPlaces.places.value = [{
      id: "place:test",
      name: "Super U",
      address: "12 rue de Paris",
      city: "Clamart",
      lon: 2.295,
      lat: 48.805,
      category: "shop",
      kind: "supermarket",
      distanceMeters: 240,
    } as NearbyPlace];

    const openMock = vi.spyOn(window, "open").mockImplementation(() => null);
    const originalClipboard = navigator.clipboard;
    const clipboardWriteMock = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWriteMock },
    });

    const wrapper = shallowMount(MyNearbyStationsPage, {
      global: {
        stubs: {
          NearbyStationsMap: {
            props: ["travelPanelOpen"],
            emits: ["placeContextMenu"],
            template: "<div data-testid='nearby-map'><button class='mock-place' type='button' @contextmenu='$emit(\"placeContextMenu\", \"place:test\", $event.currentTarget)'>place</button><slot name='station-schedules' :active-station-id='undefined' /><slot name='traffic-modal' /></div>",
          },
          ContextMenu: {
            props: ["open"],
            template: "<div v-if='open' data-testid='place-context-menu'><slot /></div>",
          },
        },
      },
    });

    await flushPromises();
    await wrapper.get(".mock-place").trigger("contextmenu");
    await flushPromises();

    const menu = wrapper.get("[data-testid='place-context-menu']");
    expect(menu.text()).toContain("Ouvrir le lieu dans Google Maps");
    await menu.findAll("button")[0]!.trigger("click");
    expect(openMock).toHaveBeenCalledWith(
      expect.stringContaining("Super%20U"),
      "_blank",
      "noopener,noreferrer",
    );

    await wrapper.get(".mock-place").trigger("contextmenu");
    await flushPromises();
    await wrapper.get("[data-testid='place-context-menu']").findAll("button")[1]!.trigger("click");
    await flushPromises();
    expect(mocks.travelRoutes.setDestination).toHaveBeenCalledWith(expect.objectContaining({
      id: "place:test",
      label: "Super U, 12 rue de Paris, Clamart",
      type: "place",
      lon: 2.295,
      lat: 48.805,
    }));

    await wrapper.get(".mock-place").trigger("contextmenu");
    await flushPromises();
    await wrapper.get("[data-testid='place-context-menu']").findAll("button")[2]!.trigger("click");
    await flushPromises();
    expect(clipboardWriteMock).toHaveBeenCalledWith("Super U, 12 rue de Paris, Clamart");
    expect(wrapper.text()).toContain("Adresse du lieu copiée");

    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: originalClipboard });
    } else {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    }
    openMock.mockRestore();
    wrapper.unmount();
  });
});
