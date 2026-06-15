import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DetailedLineMapPicker from "../src/features/line-map/DetailedLineMapPicker.vue";
import type {
  LineMapViewModel,
  LineMapStopView,
} from "../src/features/line-map/types";
import {
  clearNetworkGhostTopologyCache,
  createGeographicViewport,
} from "../src/features/network-ghost";
import type { LineSearchOption } from "../src/types/transit";

const {
  loadDetailedLineMap,
  loadStationTransfers,
  loadTransferLineDirections,
  loadTransferLineFrequency,
  fetchDirectionGroupsForStation,
} = vi.hoisted(() => ({
  loadDetailedLineMap: vi.fn(),
  loadStationTransfers: vi.fn(),
  loadTransferLineDirections: vi.fn(),
  loadTransferLineFrequency: vi.fn(),
  fetchDirectionGroupsForStation: vi.fn(),
}));

vi.mock("../src/features/line-map/lineMapData", () => ({
  loadDetailedLineMap,
  loadStationTransfers,
  loadTransferLineDirections,
  loadTransferLineFrequency,
}));

vi.mock("../src/services/idfm", () => ({
  fetchDirectionGroupsForStation,
}));

const line: LineSearchOption = {
  family: "METRO",
  id: "line:test",
  label: "4",
  navitiaId: "line:test",
  ref: "line:test",
  color: "#be418d",
  textColor: "#ffffff",
};

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearNetworkGhostTopologyCache();
  loadDetailedLineMap.mockReset();
  loadStationTransfers.mockReset();
  loadTransferLineDirections.mockReset();
  loadTransferLineFrequency.mockReset();
  fetchDirectionGroupsForStation.mockReset();
  loadDetailedLineMap.mockResolvedValue(createMap());
  loadStationTransfers.mockResolvedValue([
    { id: "rer:b", label: "B", family: "RER" },
  ]);
  loadTransferLineDirections.mockResolvedValue({
    lineId: "bus:test",
    directions: [],
  });
  loadTransferLineFrequency.mockResolvedValue({
    lineId: "bus:test",
    stationId: "station:a",
    serviceDate: "20260615",
    peakMinutes: 5,
    offPeakMinutes: 9,
  });
  fetchDirectionGroupsForStation.mockResolvedValue([
    {
      id: "all",
      label: "Toutes directions",
      match: {},
    },
  ]);
});

describe("DetailedLineMapPicker sidebar", () => {
  it("shows segment distances with animated distance labels", async () => {
    loadDetailedLineMap.mockResolvedValueOnce(createDistanceMap());
    const wrapper = mount(DetailedLineMapPicker, {
      props: { line, mode: "explorer", selectable: false },
    });
    await flushPromises();

    const distanceSwitch = wrapper.get(
      '[role="switch"][aria-label="Afficher les distances entre les stations"]',
    );

    expect(distanceSwitch.attributes("aria-checked")).toBe("false");
    expect(wrapper.find(".line-map-segment-distance").exists()).toBe(false);

    await distanceSwitch.trigger("click");

    expect(distanceSwitch.attributes("aria-checked")).toBe("true");
    expect(wrapper.get(".line-map-segment-distance").text()).toContain("500 m");
    expect(wrapper.get(".line-map-segment-distance__bubble").exists()).toBe(
      true,
    );

    await distanceSwitch.trigger("click");

    expect(distanceSwitch.attributes("aria-checked")).toBe("false");
    expect(wrapper.find(".line-map-segment-distance").exists()).toBe(false);
  });

  it("opens only on click, toggles closed and replaces the active station", async () => {
    const wrapper = mount(DetailedLineMapPicker, {
      props: { line, mode: "explorer", selectable: false },
      attachTo: document.body,
    });
    await flushPromises();

    const targets = wrapper.findAll(".line-map-hit-target");

    await targets[0].trigger("mouseenter");
    expect(wrapper.find('[data-testid="line-map-sidebar"]').exists()).toBe(
      false,
    );
    expect(loadStationTransfers).not.toHaveBeenCalled();

    await targets[0].trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="line-map-sidebar"]').text()).toContain(
      "Station A",
    );
    const activeStop = wrapper.get(".line-map-stop--active");
    expect(activeStop.get(".line-map-stop__dot").attributes("style")).toContain(
      "fill: #be418d",
    );
    expect(activeStop.get(".line-map-stop__dot").attributes("style")).toContain(
      "stroke: #ffffff",
    );
    expect(activeStop.find(".line-map-stop__label-background").exists()).toBe(
      true,
    );
    expect(activeStop.get(".line-map-stop__label").classes()).toContain(
      "line-map-stop__label--active",
    );
    const renderedStops = wrapper.findAll(".line-map-stop");
    expect(renderedStops.at(-1)?.classes()).toContain(
      "line-map-stop--active",
    );
    expect(loadStationTransfers).toHaveBeenCalledTimes(1);

    await targets[0].trigger("click");
    expect(wrapper.find('[data-testid="line-map-sidebar"]').exists()).toBe(
      false,
    );
    expect(wrapper.find(".line-map-stop--active").exists()).toBe(false);

    await targets[0].trigger("click");
    await targets[1].trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="line-map-sidebar"]').text()).toContain(
      "Station B",
    );

    wrapper.unmount();
  });

  it("does not let the map drag capture a station pointer gesture", async () => {
    const wrapper = mount(DetailedLineMapPicker, {
      props: { line, mode: "explorer", selectable: false },
      attachTo: document.body,
    });
    await flushPromises();

    const target = wrapper.findAll(".line-map-hit-target")[0];
    await target.trigger("pointerdown", {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    await target.trigger("pointerup", {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    await target.trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="line-map-sidebar"]').text()).toContain(
      "Station A",
    );

    wrapper.unmount();
  });

  it("keeps station dots the same visual size while zooming", async () => {
    const wrapper = mount(DetailedLineMapPicker, {
      props: { line, mode: "explorer", selectable: false },
    });
    await flushPromises();

    const initialSvgWidth = Number.parseFloat(
      (wrapper.get('[data-testid="line-map"]').element as SVGElement).style
        .width,
    );
    const initialRadius = Number(
      wrapper.get(".line-map-stop__dot").attributes("r"),
    );

    await wrapper.findAll(".line-map-zoom__button")[1].trigger("click");

    const firstZoomedSvgWidth = Number.parseFloat(
      (wrapper.get('[data-testid="line-map"]').element as SVGElement).style
        .width,
    );
    const firstZoomedRadius = Number(
      wrapper.get(".line-map-stop__dot").attributes("r"),
    );

    expect(initialRadius * initialSvgWidth).toBeCloseTo(
      firstZoomedRadius * firstZoomedSvgWidth,
      5,
    );

    await wrapper.findAll(".line-map-zoom__button")[1].trigger("click");
    const secondZoomedSvgWidth = Number.parseFloat(
      (wrapper.get('[data-testid="line-map"]').element as SVGElement).style
        .width,
    );

    expect(firstZoomedSvgWidth / initialSvgWidth).toBeCloseTo(
      secondZoomedSvgWidth / firstZoomedSvgWidth,
      2,
    );
  });

  it("keeps picker selection and hides explorer-only actions", async () => {
    const wrapper = mount(DetailedLineMapPicker, {
      props: { line },
    });
    await flushPromises();

    await wrapper.findAll(".line-map-hit-target")[0].trigger("click");
    await flushPromises();

    expect(wrapper.emitted("select")?.[0]?.[0]).toMatchObject({
      id: "station:a",
    });
    expect(wrapper.text()).not.toContain("Ajouter aux favoris");
    expect(wrapper.text()).not.toContain("Voir sur Google Maps");
    expect(wrapper.find('[data-testid="network-ghost-layer"]').exists()).toBe(
      false,
    );
  });

  it("loads ghost correspondences progressively and keeps active quays visible", async () => {
    loadStationTransfers.mockResolvedValueOnce([
      {
        id: "line:IDFM:C01743",
        label: "B",
        family: "RER",
        mode: "RER",
        color: "#4b92db",
        iconUrl: "https://example.test/rer-b.svg",
      },
    ]);
    loadTransferLineDirections.mockResolvedValueOnce({
      lineId: "line:IDFM:C01743",
      directions: ["Aéroport CDG 2", "Saint-Rémy-lès-Chevreuse"],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            stations: [
              {
                id: "ghost:a",
                name: "Station A",
                lon: 2.35,
                lat: 48.85,
              },
              {
                id: "ghost:b",
                name: "Station Ghost",
                lon: 2.365,
                lat: 48.86,
              },
            ],
            segments: [
              {
                id: "ghost:a-b",
                from: "ghost:a",
                to: "ghost:b",
              },
            ],
            patterns: [],
          }),
        ),
      ),
    );
    const wrapper = mount(DetailedLineMapPicker, {
      props: {
        line,
        mode: "explorer",
        selectable: false,
        ghostNetworkEnabled: true,
      },
      attachTo: document.body,
    });
    await flushPromises();

    await wrapper.findAll(".line-map-hit-target")[0].trigger("click");
    await flushPromises();
    await flushPromises();

    expect(fetch).toHaveBeenCalledWith(
      "/api/lines/line%3AIDFM%3AC01743/topology",
    );
    expect(wrapper.get('[data-testid="network-ghost-layer"]')).toBeTruthy();
    expect(wrapper.findAll(".network-ghost-line__segment")).toHaveLength(1);
    expect(wrapper.findAll(".network-ghost-quays__dot")).toHaveLength(2);
    expect(wrapper.text()).toMatch(/seau 1\/1/);
    const displayPanel = wrapper.get('[data-testid="line-map-display-panel"]');

    expect(displayPanel.text()).toContain("Correspondances");
    expect(
      (
        displayPanel.get("input[type='checkbox']").element as HTMLInputElement
      ).checked,
    ).toBe(true);

    await displayPanel.get(".line-map-display-panel__header").trigger("click");
    expect(
      displayPanel.find(".line-map-display-panel__content").exists(),
    ).toBe(false);
    await displayPanel.get(".line-map-display-panel__header").trigger("click");

    expect(loadTransferLineFrequency).not.toHaveBeenCalled();

    await wrapper
      .get(".network-ghost-line__hit-target")
      .trigger("pointerenter", { clientX: 120, clientY: 120 });
    await flushPromises();

    expect(loadTransferLineDirections).toHaveBeenCalledWith(
      "line:IDFM:C01743",
    );
    expect(loadTransferLineFrequency).toHaveBeenCalledWith(
      "line:IDFM:C01743",
      expect.objectContaining({
        id: "station:a",
        scheduleStopAreaRef: "stop_area:a",
      }),
    );
    expect(
      wrapper.get('[data-testid="line-map-sidebar-ghost-detail"]').text(),
    ).toContain("Aéroport CDG 2");

    expect(
      wrapper.get('[data-testid="line-map-sidebar-ghost-detail"]').text(),
    ).toContain("≈ 5 min");

    const displayInputs = wrapper.findAll(
      ".line-map-display-panel input[type='checkbox']",
    );
    await displayInputs[5].setValue(false);
    await flushPromises();
    expect(wrapper.find(".network-ghost-line").exists()).toBe(false);

    await displayInputs[0].setValue(false);
    await flushPromises();
    expect(wrapper.find('[data-testid="network-ghost-layer"]').exists()).toBe(
      false,
    );

    wrapper.unmount();
  });

  it("adds a favorite without duplicates and confirms success", async () => {
    const wrapper = mount(DetailedLineMapPicker, {
      props: { line, mode: "explorer", selectable: false },
      attachTo: document.body,
    });
    await flushPromises();
    await wrapper.findAll(".line-map-hit-target")[0].trigger("click");
    await flushPromises();

    await wrapper
      .get(".line-map-sidebar__favorite")
      .trigger("click");
    await flushPromises();

    expect(document.body.textContent).toContain(
      "Station ajoutée à l'écran d'accueil",
    );

    const firstPreferences = readPreferences();
    expect(firstPreferences.customBoards).toHaveLength(1);
    expect(firstPreferences.visibleBoardIds).toContain(
      firstPreferences.customBoards[0].id,
    );

    await wrapper
      .get(".line-map-sidebar__favorite")
      .trigger("click");
    await flushPromises();

    expect(readPreferences().customBoards).toHaveLength(1);
    wrapper.unmount();
  });

  it("shows favorite errors and opens Google Maps with coordinates or name", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    fetchDirectionGroupsForStation.mockRejectedValueOnce(new Error("offline"));
    const wrapper = mount(DetailedLineMapPicker, {
      props: { line, mode: "explorer", selectable: false },
    });
    await flushPromises();

    const targets = wrapper.findAll(".line-map-hit-target");
    await targets[0].trigger("click");
    await flushPromises();
    await wrapper.get(".line-map-sidebar__favorite").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain(
      "Impossible d'ajouter cette station à l'écran d'accueil.",
    );

    await wrapper.get(".line-map-sidebar__maps").trigger("click");
    expect(open).toHaveBeenLastCalledWith(
      "https://www.google.com/maps/search/?api=1&query=48.85%2C2.35",
      "_blank",
      "noopener,noreferrer",
    );

    await targets[1].trigger("click");
    await flushPromises();
    await wrapper.get(".line-map-sidebar__maps").trigger("click");
    expect(open).toHaveBeenLastCalledWith(
      "https://www.google.com/maps/search/?api=1&query=Station%20B%2C%20Paris",
      "_blank",
      "noopener,noreferrer",
    );
  });
});

function createMap(): LineMapViewModel {
  const stops: LineMapStopView[] = [
    {
      id: "station:a",
      label: "Station A",
      city: "Paris",
      lon: 2.35,
      lat: 48.85,
      coordinateSource: "wgs84",
      x: 0.3,
      y: 0.5,
      routeIds: ["main"],
      routeLabels: ["Main"],
      quays: [
        {
          id: "quay:a:1",
          name: "Quai A1",
          lon: 2.3501,
          lat: 48.8501,
        },
        {
          id: "quay:a:2",
          name: "Quai A2",
          lon: 2.3499,
          lat: 48.8499,
        },
      ],
      station: {
        id: "station:a",
        label: "Station A",
        city: "Paris",
        lon: 2.35,
        lat: 48.85,
        monitoringRef: "stop:a",
        scheduleStopAreaRef: "stop_area:a",
      },
    },
    {
      id: "station:b",
      label: "Station B",
      city: "Paris",
      x: 0.7,
      y: 0.5,
      coordinateSource: "fallback",
      routeIds: ["main"],
      routeLabels: ["Main"],
      station: {
        id: "station:b",
        label: "Station B",
        city: "Paris",
        monitoringRef: "stop:b",
        scheduleStopAreaRef: "stop_area:b",
      },
    },
  ];

  return {
    lineId: line.id,
    lineLabel: line.label,
    lineColor: line.color ?? "#0064ff",
    textColor: line.textColor ?? "#ffffff",
    stops,
    segments: [
      {
        id: "a-b",
        fromStopId: stops[0].id,
        toStopId: stops[1].id,
      },
    ],
    branches: [
      {
        id: "main",
        label: "Main",
        stopIds: stops.map((stop) => stop.id),
      },
    ],
    tiles: [],
    viewport: createGeographicViewport(
      [
        { lon: 2.34, lat: 48.84 },
        { lon: 2.37, lat: 48.87 },
      ],
      {
        viewBoxWidth: 1080,
        viewBoxHeight: 620,
        paddingX: 78,
        paddingY: 68,
      },
    ),
  };
}

function createDistanceMap(): LineMapViewModel {
  const map = createMap();

  map.segments[0].distanceKm = 0.5;

  return map;
}

function readPreferences(): {
  visibleBoardIds: string[];
  customBoards: Array<{ id: string }>;
} {
  return JSON.parse(
    window.localStorage.getItem("transport-clock.preferences.v2") ?? "{}",
  );
}
