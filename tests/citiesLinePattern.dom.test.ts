import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import CitiesLinePattern from "../src/features/line-map/CitiesLinePattern.vue";
import { buildCitiesLinePatternCities } from "../src/features/line-map/citiesLinePattern";

describe("CitiesLinePattern", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../src/i18n");
    vi.doUnmock("../src/features/nearby-stations/useNearbyStations");
    vi.doUnmock("../src/composables/useUserGeolocation");
    vi.doUnmock("../src/services/idfm");
  });

  it("renders cities vertically with one connector between consecutive dots", () => {
    const wrapper = mount(CitiesLinePattern, {
      props: {
        cities: [
          { name: "Créteil", departureStation: "Créteil-Préfecture" },
          { name: "Châtenay", highlighted: true },
          { name: "Clamart", terminalStation: "Clamart-Gare" },
        ],
        lineColor: "#123456",
        lineMode: "BUS",
      },
    });

    expect(wrapper.findAll(".cities-line-pattern__dot")).toHaveLength(3);
    expect(wrapper.findAll(".cities-line-pattern__connector")).toHaveLength(2);
    expect(wrapper.findAll("li").map((item) => item.text())).toEqual([
      expect.stringContaining("Créteil"),
      expect.stringContaining("Châtenay"),
      expect.stringContaining("Clamart"),
    ]);
    expect(wrapper.findAll("li")[0]!.text()).toContain("Créteil-Préfecture");
    expect(wrapper.findAll("li")[0]!.text()).not.toContain("Clamart-Gare");
    expect(wrapper.findAll("li")[2]!.text()).toContain("Clamart-Gare");
    expect(wrapper.findAll('[data-highlighted="true"]')).toHaveLength(1);
    expect(wrapper.attributes("style")).toContain("--cities-line-color: #123456");
    expect(wrapper.attributes("style")).toContain("--cities-line-width: 3px");
  });

  it("keeps both endpoint labels on the same dot when the route has one city", () => {
    const cities = buildCitiesLinePatternCities([
      { name: "Départ", city: "Créteil" },
      { name: "Terminus", city: "CRETEIL" },
    ]);
    const wrapper = mount(CitiesLinePattern, { props: { cities } });

    expect(cities).toEqual([{
      name: "Créteil",
      departureStation: "Départ",
      terminalStation: "Terminus",
    }]);
    expect(wrapper.findAll(".cities-line-pattern__dot")).toHaveLength(1);
    expect(wrapper.findAll(".cities-line-pattern__connector")).toHaveLength(0);
    expect(wrapper.text()).toContain("Départ");
    expect(wrapper.text()).toContain("Terminus");
  });

  it("mutes cities behind the current city and animates the remaining direction", () => {
    const wrapper = mount(CitiesLinePattern, {
      props: {
        cities: [
          { name: "Ville A" },
          { name: "Ville B" },
          { name: "Ville C" },
          { name: "Ville D" },
        ],
        activeFromCity: "Ville C",
        lineColor: "#e11d48",
      },
    });

    expect(wrapper.findAll(".cities-line-pattern__item--muted")).toHaveLength(2);
    expect(wrapper.findAll(".cities-line-pattern__connector--muted")).toHaveLength(2);
    expect(wrapper.findAll(".cities-line-pattern__connector--active")).toHaveLength(1);
    expect(wrapper.findAll(".cities-line-pattern__item")[2]!.classes()).not.toContain("cities-line-pattern__item--muted");
  });

  it("marks the departure city with the current-location subtitle", () => {
    const wrapper = mount(CitiesLinePattern, {
      props: {
        cities: [
          { name: "Ville A" },
          { name: "Ville B" },
        ],
        activeFromCity: "Ville A",
      },
    });

    const current = wrapper.get(".cities-line-pattern__current-city");
    expect(current.text()).toContain("Vous êtes ici");
    expect(current.find("svg").exists()).toBe(true);
  });

  it("deduplicates circular routes and highlights accent-insensitively", () => {
    const cities = buildCitiesLinePatternCities(
      [
        { name: "A", city: "Créteil" },
        { name: "B", city: "Châtenay" },
        { name: "C", city: "Clamart" },
        { name: "D", city: "CRETEIL" },
        { name: "E", city: "clamart" },
      ],
      ["CLAMART"],
    );

    expect(cities.map((city) => city.name)).toEqual(["Créteil", "Châtenay", "Clamart"]);
    expect(cities.map((city) => Boolean(city.highlighted))).toEqual([false, false, true]);
  });

  it("uses the directionally ordered stations supplied by the global sidebar", async () => {
    vi.doMock("../src/services/idfm", () => ({
      fetchLineFrequencyProfile: vi.fn(async () => undefined),
    }));
    vi.doMock("../src/services/ridership", () => ({
      fetchAnnualRidershipLine: vi.fn(async () => undefined),
    }));
    vi.doMock("../src/i18n", () => ({
      useI18n: () => ({ t: (key: string) => key }),
    }));

    const { default: GlobalMapPickerSideBar } = await import(
      "../src/features/line-map/GlobalMapPickerSideBar.vue"
    );
    const line = createLine("line:sidebar", ["station:a", "station:b", "station:c"]);
    const routeStations = [
      createStation("station:a", "Créteil-Centre", "Créteil", line.id),
      createStation("station:b", "Châtenay-Centre", "Châtenay", line.id),
      createStation("station:c", "Clamart-Gare", "Clamart", line.id),
    ];
    const wrapper = mount(GlobalMapPickerSideBar, {
      props: {
        line,
        stations: routeStations,
        cityPatternStations: [...routeStations].reverse(),
      },
      global: {
        stubs: {
          StationTransferDetails: true,
          LineIconBadge: true,
          UserFriendlyTraffic: true,
        },
      },
    });

    await wrapper.get("#global-map-picker-sidebar-line-cities-toggle").trigger("click");
    expect(wrapper.findAll(".cities-line-pattern__content strong").map((node) => node.text())).toEqual([
      "Clamart",
      "Châtenay",
      "Créteil",
    ]);
    expect(wrapper.findAll(".cities-line-pattern__dot")).toHaveLength(3);
    wrapper.unmount();
  });
});

describe("NearbyStationsSelector city pattern", () => {
  it("highlights only the cities containing an in-radius station of the pinned line", async () => {
    vi.resetModules();
    const { ref, shallowRef } = await import("vue");
    const line = createLine("line:test", ["station:a", "station:b", "station:c"]);
    const stations = [
      createStation("station:a", "Station A", "Clamart", line.id),
      createStation("station:b", "Station B", "clamart", line.id),
      createStation("station:c", "Station C", "Viroflay", line.id),
    ];
    const entries = stations.map((station, index) => ({
      id: station.id,
      station: { ...station, memberStationIds: [station.id] },
      memberStations: [station],
      lines: [line],
      distanceMeters: index === 2 ? 900 : 120,
      insideRadius: index !== 2,
    }));
    const network = {
      stations,
      stationsById: new Map(stations.map((station) => [station.id, station])),
      lines: [line],
      linesById: new Map([[line.id, line]]),
    };
    const nearby = {
      query: ref(""),
      suggestions: ref([]),
      selectedPlace: ref({ label: "Clamart", lon: 2.2, lat: 48.8 }),
      radius: ref(600),
      clusterGroupingDistanceMeters: ref(200),
      stations: ref(entries),
      visibleStations: ref(entries),
      transportMapNetwork: shallowRef(network),
      selections: ref([]),
      activeModes: ref(["BUS"]),
      isSuggesting: ref(false),
      isScanning: ref(false),
      error: ref(undefined),
      errorType: ref(undefined),
      selectedStationCount: ref(0),
      selectedBoardCount: ref(0),
      selectedTargets: ref([]),
      selectedLineIds: () => [],
      searchAddress: vi.fn(),
      selectPlace: vi.fn(),
      useCoordinates: vi.fn(),
      scanNearbyStations: vi.fn(),
      queryTransportMapViewport: vi.fn(),
      toggleStation: vi.fn(),
      toggleLine: vi.fn(),
      toggleMode: vi.fn(),
      clearSelection: vi.fn(),
      setError: vi.fn(),
      clearError: vi.fn(),
      createDraft: vi.fn(() => ({})),
    };

    vi.doMock("../src/features/nearby-stations/useNearbyStations", () => ({
      useNearbyStations: () => nearby,
    }));
    vi.doMock("../src/composables/useUserGeolocation", () => ({
      useUserGeolocation: () => ({
        coordinates: ref(undefined),
        error: ref(undefined),
        isLoading: ref(false),
        askGeolocation: vi.fn(async () => false),
        stopTracking: vi.fn(),
      }),
    }));
    vi.doMock("../src/services/idfm", () => ({
      fetchLineRouteSequences: vi.fn(async () => [{
        id: "default",
        label: "Clamart",
        direction: "Clamart",
        stops: stations.map((station) => ({
          id: station.id,
          label: station.name,
          city: station.city,
          lon: station.lon,
          lat: station.lat,
          station: { id: station.id, label: station.name, lon: station.lon, lat: station.lat },
        })),
      }]),
    }));
    vi.doMock("../src/i18n", () => ({
      useI18n: () => ({ t: (key: string) => key }),
    }));

    const { default: NearbyStationsSelector } = await import(
      "../src/features/nearby-stations/NearbyStationsSelector.vue"
    );
    const wrapper = mount(NearbyStationsSelector, {
      props: { open: true },
      global: {
        stubs: {
          AppModal: { template: "<div><slot name='header' /><slot /><slot name='footer' /></div>" },
          LineIconBadge: { template: "<span />" },
          NearbyStationsMap: {
            emits: ["activateLine"],
            template: "<aside><button data-testid='pin-line' @click='$emit(\"activateLine\", \"line:test\")'>pin</button><slot name='city-pattern' /></aside>",
          },
        },
      },
    });

    await wrapper.get('[data-testid="pin-line"]').trigger("click");
    await flushPromises();

    const highlighted = wrapper.findAll('[data-highlighted="true"]');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]!.text()).toContain("Clamart");
    expect(highlighted[0]!.text()).not.toContain("Viroflay");
    expect(wrapper.findAll(".cities-line-pattern__dot")).toHaveLength(2);
    wrapper.unmount();
  });
});

function createLine(id: string, stationIds: string[]) {
  return {
    id,
    index: 0,
    code: "TEST",
    label: "Test",
    mode: "BUS" as const,
    color: "#123456",
    textColor: "#ffffff",
    aliases: [],
    stationIds,
    geometryIds: [],
  };
}

function createStation(id: string, name: string, city: string, lineId: string) {
  return {
    id,
    index: id.length,
    name,
    normalizedName: name.toLocaleLowerCase("fr-FR"),
    city,
    aliases: [],
    rawRefs: [id],
    lineIds: [lineId],
    ownerChunkId: "test",
    isHub: false,
    sourceCrs: "EPSG:2154" as const,
    sourceX: 0,
    sourceY: 0,
    lon: 2.3,
    lat: 48.8,
    worldX: 0,
    worldY: 0,
    coordinateSource: "netex" as const,
    transformVersion: "lambert93-ntf-v1" as const,
  };
}
