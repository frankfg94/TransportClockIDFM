import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DetailedLineMapPicker from "../src/features/line-map/DetailedLineMapPicker.vue";
import type {
  LineMapViewModel,
  LineMapStopView,
} from "../src/features/line-map/types";
import type { LineSearchOption } from "../src/types/transit";

const {
  loadDetailedLineMap,
  loadStationTransfers,
  loadTransferLineDirections,
  fetchDirectionGroupsForStation,
} = vi.hoisted(() => ({
  loadDetailedLineMap: vi.fn(),
  loadStationTransfers: vi.fn(),
  loadTransferLineDirections: vi.fn(),
  fetchDirectionGroupsForStation: vi.fn(),
}));

vi.mock("../src/features/line-map/lineMapData", () => ({
  loadDetailedLineMap,
  loadStationTransfers,
  loadTransferLineDirections,
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
  loadDetailedLineMap.mockReset();
  loadStationTransfers.mockReset();
  loadTransferLineDirections.mockReset();
  fetchDirectionGroupsForStation.mockReset();
  loadDetailedLineMap.mockResolvedValue(createMap());
  loadStationTransfers.mockResolvedValue([
    { id: "rer:b", label: "B", family: "RER" },
  ]);
  loadTransferLineDirections.mockResolvedValue({
    lineId: "bus:test",
    directions: [],
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
    expect(activeStop.exists()).toBe(true);
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
  };
}

function readPreferences(): {
  visibleBoardIds: string[];
  customBoards: Array<{ id: string }>;
} {
  return JSON.parse(
    window.localStorage.getItem("transport-clock.preferences.v2") ?? "{}",
  );
}
