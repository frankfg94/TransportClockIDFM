import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DetailedLineMapPicker from "../src/features/line-map/DetailedLineMapPicker.vue";
import type { LineMapViewModel, LineMapStopView } from "../src/features/line-map/types";
import {
  clearNetworkGhostTopologyCache,
  createGeographicViewport,
} from "../src/features/network-ghost";
import type { LineSearchOption } from "../src/types/transit";
import type { TrafficLineReport } from "../src/features/traffic";

const {
  createMapTiles,
  loadDetailedLineMap,
  loadStationTransfers,
  loadTransferLineDirections,
  loadTransferLineFrequency,
  fetchDirectionGroupsForStation,
  fetchStationTransfers,
  fetchTransitFamilyOptions,
  searchLineStations,
  searchTransitLines,
} = vi.hoisted(() => ({
  createMapTiles: vi.fn(),
  loadDetailedLineMap: vi.fn(),
  loadStationTransfers: vi.fn(),
  loadTransferLineDirections: vi.fn(),
  loadTransferLineFrequency: vi.fn(),
  fetchDirectionGroupsForStation: vi.fn(),
  fetchStationTransfers: vi.fn(),
  fetchTransitFamilyOptions: vi.fn(),
  searchLineStations: vi.fn(),
  searchTransitLines: vi.fn(),
}));

vi.mock("../src/features/line-map/lineMapData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/features/line-map/lineMapData")>();

  return {
    ...actual,
    createMapTiles,
    getMaximumMapZoom: () => 20,
    loadDetailedLineMap,
    loadStationTransfers,
    loadTransferLineDirections,
    loadTransferLineFrequency,
  };
});

vi.mock("../src/services/idfm", () => ({
  fetchDirectionGroupsForStation,
  fetchStationTransfers,
  fetchTransitFamilyOptions,
  searchLineStations,
  searchTransitLines,
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
  vi.useRealTimers();
  document.body.innerHTML = "";
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearNetworkGhostTopologyCache();
  createMapTiles.mockReset();
  loadDetailedLineMap.mockReset();
  loadStationTransfers.mockReset();
  loadTransferLineDirections.mockReset();
  loadTransferLineFrequency.mockReset();
  fetchDirectionGroupsForStation.mockReset();
  fetchStationTransfers.mockReset();
  fetchTransitFamilyOptions.mockReset();
  searchLineStations.mockReset();
  searchTransitLines.mockReset();
  createMapTiles.mockReturnValue([]);
  loadDetailedLineMap.mockResolvedValue(createMap());
  loadStationTransfers.mockResolvedValue([{ id: "rer:b", label: "B", family: "RER" }]);
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
  fetchStationTransfers.mockResolvedValue([]);
  fetchTransitFamilyOptions.mockResolvedValue([]);
  searchLineStations.mockResolvedValue([
    {
      id: "station:c",
      label: "Station C",
      city: "Paris",
      monitoringRef: "stop:c",
      scheduleStopAreaRef: "stop_area:c",
    },
  ]);
  searchTransitLines.mockResolvedValue([]);
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
    expect(wrapper.find(".line-map-segment-distance__bubble").exists()).toBe(true);

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
    expect(wrapper.find('[data-testid="line-map-sidebar"]').exists()).toBe(false);
    expect(loadStationTransfers).not.toHaveBeenCalled();

    await targets[0].trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="line-map-sidebar"]').text()).toContain("Station A");
    const activeStop = wrapper.get(".line-map-stop--active");
    expect(activeStop.get(".line-map-stop__dot").attributes("style")).toContain("fill: #be418d");
    expect(activeStop.get(".line-map-stop__dot").attributes("style")).toContain("stroke: #ffffff");
    expect(activeStop.find(".line-map-stop__label-background").exists()).toBe(true);
    expect(activeStop.get(".line-map-stop__label").classes()).toContain(
      "line-map-stop__label--active",
    );
    const renderedStops = wrapper.findAll(".line-map-stop");
    expect(renderedStops.at(-1)?.classes()).toContain("line-map-stop--active");
    expect(loadStationTransfers).toHaveBeenCalledTimes(1);

    await targets[0].trigger("click");
    expect(wrapper.find('[data-testid="line-map-sidebar"]').exists()).toBe(false);
    expect(wrapper.find(".line-map-stop--active").exists()).toBe(false);

    await targets[0].trigger("click");
    await targets[1].trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="line-map-sidebar"]').text()).toContain("Station B");

    wrapper.unmount();
  });

  it("opens a station after a stationary pointer tap", async () => {
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

    expect(wrapper.get('[data-testid="line-map-sidebar"]').text()).toContain("Station A");

    wrapper.unmount();
  });

  it("keeps panning when a pointer gesture starts on a station", async () => {
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
      pointerId: 2,
    });
    await target.trigger("pointermove", {
      clientX: 140,
      clientY: 120,
      pointerId: 2,
    });
    await target.trigger("pointerup", {
      button: 0,
      clientX: 140,
      clientY: 120,
      pointerId: 2,
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="line-map-sidebar"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it("opens the mobile station sheet on a touch tap and ignores the synthetic click", async () => {
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
      pointerId: 7,
      pointerType: "touch",
    });
    await target.trigger("pointerup", {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 7,
      pointerType: "touch",
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="line-map-sidebar"]').text()).toContain("Station A");
    expect(loadStationTransfers).toHaveBeenCalledTimes(1);

    await target.trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="line-map-sidebar"]').exists()).toBe(true);
    expect(loadStationTransfers).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("uses the generic right panel without a bottom-sheet drag handle", async () => {
    const wrapper = mount(DetailedLineMapPicker, {
      props: { line, mode: "explorer", selectable: false },
      attachTo: document.body,
    });
    await flushPromises();

    await wrapper.findAll(".line-map-hit-target")[0].trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="app-right-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="line-map-sidebar-drag-handle"]').exists()).toBe(false);

    await wrapper.get('[data-testid="app-right-panel-close"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="line-map-sidebar"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it("keeps station dots the same visual size while zooming", async () => {
    const wrapper = mount(DetailedLineMapPicker, {
      props: { line, mode: "explorer", selectable: false },
    });
    await flushPromises();

    const initialSvgWidth = Number.parseFloat(
      (wrapper.get('[data-testid="line-map"]').element as SVGElement).style.width,
    );
    const initialRadius = Number(wrapper.get(".line-map-stop__dot").attributes("r"));

    await wrapper.findAll(".line-map-zoom__button")[1].trigger("click");

    const firstZoomedSvgWidth = Number.parseFloat(
      (wrapper.get('[data-testid="line-map"]').element as SVGElement).style.width,
    );
    const firstZoomedRadius = Number(wrapper.get(".line-map-stop__dot").attributes("r"));

    expect(initialRadius * initialSvgWidth).toBeCloseTo(firstZoomedRadius * firstZoomedSvgWidth, 5);

    await wrapper.findAll(".line-map-zoom__button")[1].trigger("click");
    const secondZoomedSvgWidth = Number.parseFloat(
      (wrapper.get('[data-testid="line-map"]').element as SVGElement).style.width,
    );

    expect(firstZoomedSvgWidth / initialSvgWidth).toBeCloseTo(
      secondZoomedSvgWidth / firstZoomedSvgWidth,
      2,
    );
  });

  it("keeps old map tiles visible until the debounced replacement is loaded", async () => {
    vi.useFakeTimers();
    const images: ControlledMapTileImage[] = [];

    class ControlledMapTileImage {
      complete = false;
      decoding = "";
      naturalWidth = 0;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      private currentSrc = "";

      constructor() {
        images.push(this);
      }

      get src() {
        return this.currentSrc;
      }

      set src(value: string) {
        this.currentSrc = value;
      }

      resolve(): void {
        this.complete = true;
        this.naturalWidth = 256;
        this.onload?.();
      }
    }

    vi.stubGlobal("Image", ControlledMapTileImage);
    const map = createMap();
    map.tiles = [createTile("old", "https://tiles.test/old.png")];
    loadDetailedLineMap.mockResolvedValueOnce(map);
    createMapTiles.mockReturnValue([
      createTile("new", "https://tiles.test/new.png"),
      createTile("overscan", "https://tiles.test/overscan.png", "overscan"),
    ]);

    const wrapper = mount(DetailedLineMapPicker, {
      props: { line, mode: "explorer", selectable: false },
    });
    await flushPromises();

    expect(wrapper.get(".line-map-tile").attributes("href")).toBe("https://tiles.test/old.png");
    expect(images).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(79);
    expect(images).toHaveLength(0);
    expect(wrapper.get(".line-map-tile").attributes("href")).toContain("old.png");

    await vi.advanceTimersByTimeAsync(1);
    expect(images).toHaveLength(1);
    expect(wrapper.get(".line-map-tile").attributes("href")).toContain("old.png");

    images[0].resolve();
    await flushPromises();

    expect(wrapper.get(".line-map-tile").attributes("href")).toBe("https://tiles.test/new.png");
    expect(wrapper.findAll(".line-map-tile")).toHaveLength(2);
    expect(images).toHaveLength(1);
    wrapper.unmount();
  });

  it("keeps the previous background when a visible tile fails", async () => {
    vi.useFakeTimers();
    const images: Array<{
      onerror: (() => void) | null;
      onload: (() => void) | null;
    }> = [];

    class FailingMapTileImage {
      complete = false;
      decoding = "";
      naturalWidth = 0;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;

      constructor() {
        images.push(this);
      }

      set src(_value: string) {}
    }

    vi.stubGlobal("Image", FailingMapTileImage);
    const map = createMap();
    map.tiles = [createTile("old", "https://tiles.test/old.png")];
    loadDetailedLineMap.mockResolvedValueOnce(map);
    createMapTiles.mockReturnValue([createTile("broken", "https://tiles.test/broken.png")]);

    const wrapper = mount(DetailedLineMapPicker, {
      props: { line, mode: "explorer", selectable: false },
    });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(80);

    images[0].onerror?.();
    await flushPromises();

    expect(wrapper.get(".line-map-tile").attributes("href")).toContain("old.png");
    wrapper.unmount();
  });

  it("ignores an obsolete tile request and swaps only the latest decoded background", async () => {
    vi.useFakeTimers();
    const images: ControlledTileRequest[] = [];

    class ControlledTileRequest {
      complete = false;
      decoding = "";
      naturalWidth = 0;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;

      constructor() {
        images.push(this);
      }

      set src(_value: string) {}

      resolve(): void {
        this.complete = true;
        this.naturalWidth = 256;
        this.onload?.();
      }
    }

    vi.stubGlobal("Image", ControlledTileRequest);
    const map = createMap();
    map.tiles = [createTile("old", "https://tiles.test/old.png")];
    loadDetailedLineMap.mockResolvedValueOnce(map);
    createMapTiles.mockReturnValue([createTile("request-a", "https://tiles.test/a.png")]);

    const wrapper = mount(DetailedLineMapPicker, {
      props: { line, mode: "explorer", selectable: false },
    });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(80);
    expect(images).toHaveLength(1);

    createMapTiles.mockReturnValue([createTile("request-b", "https://tiles.test/b.png")]);
    await wrapper.findAll(".line-map-zoom__button")[1].trigger("click");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(0);
    expect(images).toHaveLength(2);

    images[0].resolve();
    await flushPromises();
    expect(wrapper.get(".line-map-tile").attributes("href")).toContain("old.png");

    images[1].resolve();
    await flushPromises();
    expect(wrapper.get(".line-map-tile").attributes("href")).toContain("b.png");
    wrapper.unmount();
  });

  it("smoothly zooms at the cursor and continues a fast drag with inertia", async () => {
    const animationFrames = new Map<number, FrameRequestCallback>();
    let nextAnimationFrame = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextAnimationFrame += 1;
      animationFrames.set(nextAnimationFrame, callback);
      return nextAnimationFrame;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => {
      animationFrames.delete(handle);
    });

    const wrapper = mount(DetailedLineMapPicker, {
      props: { line, mode: "explorer", selectable: false },
      attachTo: document.body,
    });
    await flushPromises();
    const canvasWrapper = wrapper.get(".line-map-canvas");
    const canvas = canvasWrapper.element as HTMLDivElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(
      createDomRect({ left: 0, top: 0, width: 320, height: 220 }),
    );
    canvas.scrollLeft = 300;
    canvas.scrollTop = 160;
    const initialWidth = Number.parseFloat(
      (wrapper.get('[data-testid="line-map"]').element as SVGElement).style.width,
    );

    const initialAnchorX = (canvas.scrollLeft + 160) / (initialWidth / 1080);
    await canvasWrapper.trigger("wheel", {
      clientX: 160,
      clientY: 110,
      deltaY: -10,
    });
    expect(animationFrames.size).toBe(1);
    const firstWheelFrame = [...animationFrames.values()][0];
    animationFrames.clear();
    firstWheelFrame(16);
    await flushPromises();
    const firstAnimatedWidth = Number.parseFloat(
      (wrapper.get('[data-testid="line-map"]').element as SVGElement).style.width,
    );
    const firstCompositeWidth = Number.parseFloat(
      (wrapper.get(".line-map-world").element as HTMLDivElement).style.width,
    );
    expect(canvas.scrollLeft).toBeGreaterThan(300);
    expect(firstAnimatedWidth).toBe(initialWidth);
    expect(firstCompositeWidth).toBeGreaterThan(initialWidth);
    expect((canvas.scrollLeft + 160) / (firstCompositeWidth / 1080)).toBeCloseTo(
      initialAnchorX,
      5,
    );

    for (let frame = 0; frame < 160 && animationFrames.size > 0; frame += 1) {
      const callbacks = [...animationFrames.values()];
      animationFrames.clear();
      callbacks.forEach((callback) => callback(32 + frame * 16));
      await flushPromises();
    }

    const finalWidth = Number.parseFloat(
      (wrapper.get('[data-testid="line-map"]').element as SVGElement).style.width,
    );
    expect(finalWidth).toBeGreaterThan(firstAnimatedWidth);
    expect(animationFrames.size).toBe(0);

    animationFrames.clear();
    await canvasWrapper.trigger("pointerdown", {
      button: 0,
      clientX: 220,
      clientY: 120,
      pointerId: 51,
    });
    await canvasWrapper.trigger("pointermove", {
      clientX: 120,
      clientY: 120,
      pointerId: 51,
    });
    await canvasWrapper.trigger("pointerup", {
      clientX: 120,
      clientY: 120,
      pointerId: 51,
    });
    const scrollAtRelease = canvas.scrollLeft;
    const inertiaFrames = [...animationFrames.values()];
    animationFrames.clear();
    inertiaFrames.forEach((callback) => callback(1_000));

    expect(canvas.scrollLeft).toBeGreaterThan(scrollAtRelease);
    wrapper.unmount();
  });

  it("coalesces repeated scroll events into one visible-window calculation per frame", async () => {
    const animationFrames = new Map<number, FrameRequestCallback>();
    let nextAnimationFrame = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextAnimationFrame += 1;
      animationFrames.set(nextAnimationFrame, callback);
      return nextAnimationFrame;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => {
      animationFrames.delete(handle);
    });
    const wrapper = mount(DetailedLineMapPicker, {
      props: { line, mode: "explorer", selectable: false },
    });
    await flushPromises();
    const canvasWrapper = wrapper.get(".line-map-canvas");
    const canvas = canvasWrapper.element as HTMLDivElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(
      createDomRect({ left: 0, top: 0, width: 320, height: 220 }),
    );
    Object.defineProperty(canvas, "clientWidth", { configurable: true, value: 320 });
    Object.defineProperty(canvas, "clientHeight", { configurable: true, value: 220 });
    const callsBeforeScroll = createMapTiles.mock.calls.length;

    canvas.scrollLeft = 100;
    await canvasWrapper.trigger("scroll");
    canvas.scrollLeft = 140;
    await canvasWrapper.trigger("scroll");
    canvas.scrollLeft = 180;
    await canvasWrapper.trigger("scroll");

    expect(animationFrames.size).toBe(1);
    const frame = [...animationFrames.values()][0];
    animationFrames.clear();
    frame(16);
    await flushPromises();
    expect(createMapTiles.mock.calls.length).toBe(callsBeforeScroll + 1);
    wrapper.unmount();
  });

  it("focuses the exits overview and an exact exit from keyboard-accessible controls", async () => {
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const map = createMap();
    map.entrances = [
      {
        id: "exit:a:4",
        parentStopId: "station:a",
        name: "rue de Test",
        code: "4",
        lon: 2.3503,
        lat: 48.8502,
        x: 0.305,
        y: 0.495,
      },
    ];
    loadDetailedLineMap.mockResolvedValueOnce(map);
    const wrapper = mount(DetailedLineMapPicker, {
      props: { line, mode: "explorer", selectable: false },
      attachTo: document.body,
    });
    await flushPromises();
    const canvas = wrapper.get(".line-map-canvas").element as HTMLDivElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(
      createDomRect({ left: 0, top: 0, width: 900, height: 600 }),
    );
    Object.defineProperty(canvas, "clientWidth", { configurable: true, value: 900 });
    Object.defineProperty(canvas, "clientHeight", { configurable: true, value: 600 });

    await wrapper.findAll(".line-map-hit-target")[0].trigger("click");
    await flushPromises();
    const overviewButton = wrapper.get('[data-testid="line-map-sidebar-focus-entrances"]');
    const entranceButton = wrapper.get('[data-testid="line-map-sidebar-focus-entrance"]');
    expect(overviewButton.element.tagName).toBe("BUTTON");
    expect(entranceButton.element.tagName).toBe("BUTTON");
    expect(overviewButton.attributes("aria-label")).toContain("Station A");

    await overviewButton.trigger("click");
    await flushPromises();
    const overviewWidth = Number.parseFloat(
      (wrapper.get('[data-testid="line-map"]').element as SVGElement).style.width,
    );
    await entranceButton.trigger("click");
    await flushPromises();
    const entranceWidth = Number.parseFloat(
      (wrapper.get('[data-testid="line-map"]').element as SVGElement).style.width,
    );

    expect(requestAnimationFrame).toHaveBeenCalled();
    expect(entranceWidth).toBeGreaterThan(overviewWidth);
    expect(entranceButton.attributes("aria-pressed")).toBe("true");
    expect(wrapper.find(".line-map-entrance--focused").exists()).toBe(true);
    expect(wrapper.findAll(".line-map-entrance__pulse")).toHaveLength(2);
    expect(wrapper.get(".line-map-sidebar__entrance--focused").attributes("aria-pressed")).toBe(
      "true",
    );

    await wrapper.findAll(".line-map-hit-target")[1].trigger("click");
    await wrapper.findAll(".line-map-hit-target")[0].trigger("click");
    await flushPromises();
    expect(
      wrapper.get('[data-testid="line-map-sidebar-focus-entrance"]').attributes("aria-pressed"),
    ).toBe("false");
    wrapper.unmount();
  });

  it("sorts station exits by their numeric code", async () => {
    const map = createMap();
    map.entrances = [
      {
        id: "exit:10",
        parentStopId: "station:a",
        name: "avenue de Test",
        code: "10",
        lon: 2.3503,
        lat: 48.8502,
        x: 0.305,
        y: 0.495,
      },
      {
        id: "exit:2",
        parentStopId: "station:a",
        name: "rue de Test",
        code: "2",
        lon: 2.3503,
        lat: 48.8502,
        x: 0.305,
        y: 0.495,
      },
      {
        id: "exit:5",
        parentStopId: "station:a",
        name: "boulevard de Test",
        code: "5",
        lon: 2.3503,
        lat: 48.8502,
        x: 0.305,
        y: 0.495,
      },
    ];
    loadDetailedLineMap.mockResolvedValueOnce(map);

    const wrapper = mount(DetailedLineMapPicker, {
      props: { line, mode: "explorer", selectable: false },
      attachTo: document.body,
    });
    await flushPromises();
    await wrapper.findAll(".line-map-hit-target")[0].trigger("click");
    await flushPromises();

    expect(
      wrapper
        .findAll('[data-testid="line-map-sidebar-focus-entrance"]')
        .map((button) => button.get("strong").text()),
    ).toEqual(["Sortie 2", "Sortie 5", "Sortie 10"]);

    wrapper.unmount();
  });

  it("keeps the visible center anchored when zooming with controls", async () => {
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const wrapper = mount(DetailedLineMapPicker, {
      props: { line, mode: "explorer", selectable: false },
    });
    await flushPromises();

    const canvas = wrapper.get(".line-map-canvas").element as HTMLDivElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(
      createDomRect({ left: 10, top: 20, width: 300, height: 200 }),
    );
    canvas.scrollLeft = 400;
    canvas.scrollTop = 200;

    await wrapper.findAll(".line-map-zoom__button")[1].trigger("click");

    expect(requestAnimationFrame).toHaveBeenCalled();
    expect(canvas.scrollLeft).toBeCloseTo(532, 5);
    expect(canvas.scrollTop).toBeCloseTo(272, 5);
  });

  it("uses pending scroll as the anchor during rapid pinch zoom moves", async () => {
    const animationFrames = new Map<number, FrameRequestCallback>();
    let nextAnimationFrame = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextAnimationFrame += 1;
      animationFrames.set(nextAnimationFrame, callback);
      return nextAnimationFrame;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => {
      animationFrames.delete(handle);
    });

    const externalTouchStart = vi.fn();
    const externalTouchEnd = vi.fn();
    document.body.addEventListener("touchstart", externalTouchStart);
    document.body.addEventListener("touchend", externalTouchEnd);

    const wrapper = mount(DetailedLineMapPicker, {
      props: { line },
      attachTo: document.body,
    });
    await flushPromises();

    const canvas = wrapper.get(".line-map-canvas").element as HTMLDivElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(
      createDomRect({ left: 0, top: 0, width: 320, height: 220 }),
    );
    canvas.scrollLeft = 400;
    canvas.scrollTop = 200;

    await wrapper.get(".line-map-canvas").trigger("touchstart", {
      touches: [createTouchPoint(140, 100), createTouchPoint(180, 100)],
    });
    const firstMove = wrapper.get(".line-map-canvas").trigger("touchmove", {
      touches: [createTouchPoint(130, 100), createTouchPoint(190, 100)],
    });
    const secondMove = wrapper.get(".line-map-canvas").trigger("touchmove", {
      touches: [createTouchPoint(120, 100), createTouchPoint(200, 100)],
    });
    await Promise.all([firstMove, secondMove]);
    await wrapper.get(".line-map-canvas").trigger("touchend", {
      touches: [],
    });

    expect(canvas.scrollLeft).toBeCloseTo(960, 5);
    expect(externalTouchStart).not.toHaveBeenCalled();
    expect(externalTouchEnd).not.toHaveBeenCalled();

    animationFrames.forEach((callback) => callback(0));

    expect(canvas.scrollLeft).toBeCloseTo(960, 5);
    expect(canvas.scrollTop).toBeCloseTo(500, 5);

    document.body.removeEventListener("touchstart", externalTouchStart);
    document.body.removeEventListener("touchend", externalTouchEnd);
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
    expect(wrapper.find('[data-testid="line-map-sidebar"]').exists()).toBe(false);
    expect(loadStationTransfers).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain("Ajouter aux favoris");
    expect(wrapper.text()).not.toContain("Voir sur Google Maps");
    expect(wrapper.find('[data-testid="network-ghost-layer"]').exists()).toBe(false);
  });

  it("colors interrupted and disturbed traffic on the detailed line map", async () => {
    loadDetailedLineMap.mockResolvedValueOnce(createTrafficMap());
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              generatedAt: "2026-06-28T08:00:00Z",
              source: "prim-line-reports",
              configured: true,
              lines: [
                {
                  lineRef: line.ref,
                  status: "disrupted",
                  disruptions: [
                    {
                      id: "traffic-a-b",
                      title: "Trafic interrompu",
                      message:
                        "Le trafic est interrompu entre Station A et Station C et perturbe sur le reste de la ligne.",
                      kind: "incident",
                      applicationPeriods: [],
                      impactedLineRefs: [line.ref],
                      impactedStopNames: [],
                    },
                  ],
                },
              ],
            }),
          ),
      ),
    );

    const wrapper = mount(DetailedLineMapPicker, {
      props: {
        line,
        mode: "explorer",
        selectable: false,
        smartTrafficDetection: true,
      },
    });
    await flushPromises();
    await flushPromises();

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/traffic"));
    expect(wrapper.find(".line-map-segment--traffic-interruption").exists()).toBe(true);
    expect(wrapper.find(".line-map-segment--traffic-disturbance").exists()).toBe(true);
    expect(wrapper.find(".line-map-stop--traffic-interruption").exists()).toBe(true);
    expect(wrapper.find(".line-map-stop__traffic-cross").exists()).toBe(true);
    expect(wrapper.find(".line-map-stop--traffic-disturbance").exists()).toBe(true);

    wrapper.unmount();
  });

  it("opens the shared traffic calendar, time-travels the map and yields to station details", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1, 12, 0, 0));

    const wrapper = mount(DetailedLineMapPicker, {
      props: {
        line,
        mode: "explorer",
        selectable: false,
        smartTrafficDetection: true,
        trafficReport: {
          lineRef: line.ref,
          status: "planned",
          disruptions: [
            {
              id: "future-a-b",
              title: "Travaux prévus",
              message: "Le trafic sera interrompu entre Station A et Station B.",
              kind: "works",
              applicationPeriods: [
                {
                  begin: "20260720T000000",
                  end: "20260721T000000",
                },
              ],
              impactedLineRefs: [line.ref],
              impactedStopNames: [],
            },
          ],
        },
      },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.find(".line-map-segment--traffic-interruption").exists()).toBe(false);
    await wrapper.get(".pattern-traffic-calendar-toggle").trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="app-right-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pattern-traffic-calendar"]').exists()).toBe(true);
    expect(loadStationTransfers).toHaveBeenCalledTimes(2);

    await wrapper.get('[data-date="2026-07-20"]').trigger("click");
    await flushPromises();
    expect(wrapper.find(".line-map-segment--traffic-interruption").exists()).toBe(true);

    await wrapper.get(".pattern-traffic-calendar__today").trigger("click");
    await flushPromises();
    expect(wrapper.find(".line-map-segment--traffic-interruption").exists()).toBe(false);

    await wrapper.findAll(".line-map-hit-target")[0].trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="pattern-traffic-calendar"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="line-map-sidebar"]').text()).toContain("Station A");
    expect(wrapper.findAll('[data-testid="app-right-panel"]')).toHaveLength(1);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it("recenters and pulses twice when a calendar incident is focused, cancelling stale focus", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1, 12, 0, 0));
    loadDetailedLineMap.mockResolvedValueOnce(createTrafficMap());
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    const wrapper = mount(DetailedLineMapPicker, {
      props: {
        line,
        mode: "explorer",
        selectable: false,
        smartTrafficDetection: true,
        trafficReport: createFocusableTrafficReport(),
      },
      attachTo: document.body,
    });
    await flushPromises();

    const canvas = wrapper.get<HTMLDivElement>(".line-map-canvas").element;
    Object.defineProperty(canvas, "clientWidth", { configurable: true, value: 720 });
    Object.defineProperty(canvas, "clientHeight", { configurable: true, value: 520 });

    await wrapper.get(".pattern-traffic-calendar-toggle").trigger("click");
    await flushPromises();
    const incident = wrapper.get(
      '[data-testid="pattern-traffic-calendar-friendly-incident"][role="button"]',
    );

    await incident.trigger("click");
    await vi.advanceTimersByTimeAsync(300);
    await incident.trigger("click");

    await vi.advanceTimersByTimeAsync(1_119);
    expect(wrapper.find(".line-map-stop--traffic-focus").exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.findAll(".line-map-stop--traffic-focus").length).toBeGreaterThan(1);
    expect(canvas.scrollLeft).toBeGreaterThanOrEqual(0);

    await vi.advanceTimersByTimeAsync(901);
    expect(wrapper.find(".line-map-stop--traffic-focus").exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(599);
    expect(wrapper.findAll(".line-map-stop--traffic-focus").length).toBeGreaterThan(1);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it("uses the reduced-motion static traffic halo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1, 12, 0, 0));
    loadDetailedLineMap.mockResolvedValueOnce(createTrafficMap());
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    const wrapper = mount(DetailedLineMapPicker, {
      props: {
        line,
        mode: "explorer",
        selectable: false,
        smartTrafficDetection: true,
        reduceMotion: true,
        trafficReport: createFocusableTrafficReport(),
      },
    });
    await flushPromises();
    const canvas = wrapper.get<HTMLDivElement>(".line-map-canvas").element;
    Object.defineProperty(canvas, "clientWidth", { configurable: true, value: 720 });
    Object.defineProperty(canvas, "clientHeight", { configurable: true, value: 520 });

    await wrapper.get(".pattern-traffic-calendar-toggle").trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-testid="pattern-traffic-calendar-friendly-incident"][role="button"]')
      .trigger("click");
    await vi.advanceTimersByTimeAsync(500);

    expect(wrapper.get(".line-map-panel").classes()).toContain("line-map-panel--reduce-motion");
    expect(wrapper.find(".line-map-stop--traffic-focus").exists()).toBe(true);

    wrapper.unmount();
    vi.useRealTimers();
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
      vi.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
          if (String(input).includes("/api/gtfs/preload")) {
            return new Response(
              JSON.stringify({
                enabled: true,
                datasetVersion: "test",
                availableLineIds: ["line:IDFM:C01743"],
                missingLineIds: [],
              }),
            );
          }
          if (String(input).includes("/api/line-geometry/resolve")) {
            const request = JSON.parse(String(init?.body)) as {
              stops: Array<{ id: string; lon: number; lat: number }>;
              branches: Array<{ id: string; stopIds: string[] }>;
            };
            const stopById = new Map(request.stops.map((stop) => [stop.id, stop]));
            return new Response(
              JSON.stringify({
                schemaVersion: 1,
                source: "direct",
                generatedAt: "2026-07-23T00:00:00.000Z",
                stops: request.stops,
                branches: request.branches,
                segments: request.branches.flatMap((branch) => {
                  const from = stopById.get(branch.stopIds[0]);
                  const to = stopById.get(branch.stopIds[1]);
                  return from && to
                    ? [{
                        id: branch.id,
                        fromStopId: from.id,
                        toStopId: to.id,
                        coordinates: [from, to],
                      }]
                    : [];
                }),
                entrances: [],
                attempts: [{ source: "direct", status: "success" }],
              }),
            );
          }

          return new Response(
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
          );
        },
      ),
    );
    const wrapper = mount(DetailedLineMapPicker, {
      props: {
        line,
        mode: "explorer",
        selectable: false,
        ghostNetworkEnabled: true,
        reduceMotion: true,
      },
      attachTo: document.body,
    });
    await flushPromises();

    await wrapper.findAll(".line-map-hit-target")[0].trigger("click");
    await flushPromises();
    await flushPromises();

    expect(fetch).toHaveBeenCalledWith(
      "/api/lines/line%3AIDFM%3AC01743/topology",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(wrapper.get('[data-testid="network-ghost-layer"]')).toBeTruthy();
    expect(wrapper.findAll(".network-ghost-line__segment")).toHaveLength(0);
    expect(wrapper.findAll(".network-ghost-line__accessibility-button")).toHaveLength(1);
    expect(wrapper.findAll(".network-ghost-quays__dot")).toHaveLength(2);
    expect(wrapper.text()).toMatch(/seau 1\/1/);
    const displayPanel = wrapper.get('[data-testid="line-map-display-panel"]');

    expect(displayPanel.text()).toContain("Correspondances");
    expect((displayPanel.get("input[type='checkbox']").element as HTMLInputElement).checked).toBe(
      true,
    );

    await displayPanel.get(".line-map-display-panel__header").trigger("click");
    expect(displayPanel.find(".line-map-display-panel__content").exists()).toBe(false);
    await displayPanel.get(".line-map-display-panel__header").trigger("click");

    expect(loadTransferLineFrequency).not.toHaveBeenCalled();

    const ghostTarget = wrapper.get(".network-ghost-line__accessibility-button");
    const canvas = wrapper.get(".line-map-canvas");
    const initialScrollLeft = (canvas.element as HTMLDivElement).scrollLeft;

    await ghostTarget.trigger("pointerdown", {
      button: 0,
      clientX: 160,
      clientY: 160,
      pointerId: 71,
      pointerType: "touch",
    });
    await canvas.trigger("pointermove", {
      clientX: 112,
      clientY: 160,
      pointerId: 71,
      pointerType: "touch",
    });
    await canvas.trigger("pointerup", {
      clientX: 112,
      clientY: 160,
      pointerId: 71,
      pointerType: "touch",
    });
    await flushPromises();

    expect((canvas.element as HTMLDivElement).scrollLeft).toBeGreaterThan(initialScrollLeft);
    expect(wrapper.find(".network-ghost-line--active").exists()).toBe(false);
    expect(loadTransferLineDirections).not.toHaveBeenCalled();

    await ghostTarget.trigger("pointerdown", {
      button: 0,
      clientX: 120,
      clientY: 120,
      pointerId: 72,
      pointerType: "touch",
    });
    await canvas.trigger("pointerup", {
      clientX: 120,
      clientY: 120,
      pointerId: 72,
      pointerType: "touch",
    });
    await flushPromises();

    expect(loadTransferLineDirections).toHaveBeenCalledWith("line:IDFM:C01743");
    expect(loadTransferLineFrequency).toHaveBeenCalledWith(
      "line:IDFM:C01743",
      expect.objectContaining({
        id: "station:a",
        scheduleStopAreaRef: "stop_area:a",
      }),
    );
    expect(wrapper.get('[data-testid="line-map-sidebar-ghost-detail"]').text()).toContain(
      "Aéroport CDG 2",
    );

    expect(wrapper.get('[data-testid="line-map-sidebar-ghost-detail"]').text()).toContain(
      "~ 5 min",
    );

    const displayInputs = wrapper.findAll(".line-map-display-panel input[type='checkbox']");
    await displayInputs[5].setValue(false);
    await flushPromises();
    expect(wrapper.find(".network-ghost-line").exists()).toBe(false);

    await displayInputs[0].setValue(false);
    await flushPromises();
    expect(wrapper.find('[data-testid="network-ghost-layer"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it("selects a ghost line from a transfer icon without toggling it off", async () => {
    loadStationTransfers.mockResolvedValueOnce([
      {
        id: "line:IDFM:C01743",
        label: "B",
        family: "RER",
        mode: "RER",
        color: "#4b92db",
      },
    ]);
    stubGhostTopologyFetch();
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

    const transferButton = wrapper.get(".station-transfer-details__item");
    await transferButton.trigger("click");
    await flushPromises();

    expect(wrapper.get(".network-ghost-line--active").attributes()).toMatchObject({
      "data-network-ghost-line-id": "line:IDFM:C01743",
    });
    expect(wrapper.get(".station-transfer-details__item").classes()).toContain(
      "station-transfer-details__item--active",
    );
    expect(wrapper.get('[data-testid="line-map-sidebar-entrances"]').text()).toContain("Sortie 4");
    expect(wrapper.get('[data-testid="line-map-sidebar-entrances"]').text()).toContain(
      "r. de Test",
    );

    expect(wrapper.get('[data-testid="line-map-sidebar-view-line-map"]').text()).toContain(
      "Voir le plan de cette ligne",
    );
    await wrapper.get('[data-testid="line-map-sidebar-view-line-map"]').trigger("click");

    await transferButton.trigger("click");
    await flushPromises();

    expect(wrapper.find(".network-ghost-line--active").exists()).toBe(true);
    wrapper.unmount();
  });

  it("closes station details through the generic panel action", async () => {
    loadStationTransfers.mockResolvedValueOnce([
      {
        id: "line:IDFM:C01743",
        label: "B",
        family: "RER",
        mode: "RER",
        color: "#4b92db",
      },
    ]);
    stubGhostTopologyFetch();
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
    await wrapper.get(".station-transfer-details__item").trigger("click");
    await flushPromises();

    expect(wrapper.find(".network-ghost-line--active").exists()).toBe(true);

    await wrapper.get('[data-testid="app-right-panel-close"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="line-map-sidebar"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="network-ghost-layer"]').exists()).toBe(false);
    expect(wrapper.find(".network-ghost-line--active").exists()).toBe(false);
    expect(wrapper.find(".line-map-stop--active").exists()).toBe(false);

    wrapper.unmount();
  });

  it("opens a station-only modal from the ghost detail and adds it to the selected dashboard", async () => {
    loadStationTransfers.mockResolvedValueOnce([
      {
        id: "line:IDFM:C01743",
        label: "B",
        family: "RER",
        mode: "RER",
        color: "#4b92db",
      },
    ]);
    stubGhostTopologyFetch();
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
    await wrapper.get(".station-transfer-details__item").trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="line-map-sidebar-ghost-add"]').trigger("click");
    await flushPromises();
    await flushPromises();

    expect(document.body.querySelector("[data-testid='station-board-selector']")).toBeTruthy();
    expect(document.body.textContent).toContain("Ligne selectionnee");
    expect(document.body.textContent).not.toContain("Selectionner une ligne");

    const workChoice = Array.from(
      document.body.querySelectorAll<HTMLElement>(
        "[data-testid='station-board-selector'] .station-board-selector__item",
      ),
    ).find((item) => item.textContent?.includes("Travail"));
    expect(workChoice).toBeTruthy();
    workChoice!.click();
    await flushPromises();

    const addButton = document.body.querySelector<HTMLButtonElement>(
      ".modal-panel .modal-panel__footer button:not(.button-secondary)",
    );
    if (!addButton) {
      throw new Error("Expected the station modal add button to exist.");
    }

    expect(addButton.disabled).toBe(false);
    addButton.click();
    await flushPromises();

    const workPreferences = readPreferences("work");
    expect(workPreferences.customBoards).toHaveLength(1);
    expect(workPreferences.visibleBoardIds).toContain(workPreferences.customBoards[0].id);
    expect(readPreferences("home").customBoards ?? []).toHaveLength(0);
    expect(document.body.textContent).toContain("Station ajoutee a l'ecran d'accueil");

    wrapper.unmount();
  });

  it("opens the mobile display modal and keeps the ghost controls wired", async () => {
    loadStationTransfers.mockResolvedValueOnce([
      {
        id: "line:IDFM:C01743",
        label: "B",
        family: "RER",
        mode: "RER",
        color: "#4b92db",
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              stations: [
                { id: "ghost:a", name: "Station A", lon: 2.35, lat: 48.85 },
                { id: "ghost:b", name: "Station Ghost", lon: 2.365, lat: 48.86 },
              ],
              segments: [{ id: "ghost:a-b", from: "ghost:a", to: "ghost:b" }],
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
    expect(wrapper.find('[data-testid="network-ghost-layer"]').exists()).toBe(true);

    await wrapper
      .get(".line-map-mobile-actions .pattern-flow-mobile-actions__trigger")
      .trigger("click");
    await wrapper.get('[data-testid="line-map-mobile-display-button"]').trigger("click");
    await flushPromises();

    const modal = document.body.querySelector('[data-testid="line-map-display-modal"]');
    expect(modal?.textContent).toContain("Affichage");
    const input = modal?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flushPromises();

    expect(wrapper.find('[data-testid="network-ghost-layer"]').exists()).toBe(false);

    const backdrop = document.body.querySelector(".line-map-display-modal-backdrop");
    backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
    expect(document.body.querySelector('[data-testid="line-map-display-modal"]')).toBeNull();

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

    await wrapper.get(".line-map-sidebar__favorite").trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="line-map-sidebar-favorite-selector"]').exists()).toBe(true);

    await wrapper
      .get('[data-testid="line-map-sidebar-favorite-selector"] .line-map-sidebar__favorite')
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Station ajoutee au dashboard Maison");
    expect(wrapper.find(".line-map-info-alert__progress").exists()).toBe(true);

    const firstPreferences = readPreferences();
    expect(firstPreferences.customBoards).toHaveLength(1);
    expect(firstPreferences.visibleBoardIds).toContain(firstPreferences.customBoards[0].id);

    await wrapper.get(".line-map-sidebar__favorite").trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-testid="line-map-sidebar-favorite-selector"] .line-map-sidebar__favorite')
      .trigger("click");
    await flushPromises();

    expect(readPreferences().customBoards).toHaveLength(1);
    wrapper.unmount();
  });

  it("adds a favorite to the selected dashboard and can undo it", async () => {
    vi.useFakeTimers();
    const wrapper = mount(DetailedLineMapPicker, {
      props: { line, mode: "explorer", selectable: false },
      attachTo: document.body,
    });
    await flushPromises();
    await wrapper.findAll(".line-map-hit-target")[0].trigger("click");
    await flushPromises();

    await wrapper.get(".line-map-sidebar__favorite").trigger("click");
    await flushPromises();
    const workChoice = wrapper
      .findAll('[data-testid="line-map-sidebar-favorite-selector"] .station-board-selector__item')
      .find((item) => item.text().includes("Travail"));
    expect(workChoice).toBeTruthy();
    await workChoice!.trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-testid="line-map-sidebar-favorite-selector"] .line-map-sidebar__favorite')
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Station ajoutee au dashboard Travail");
    expect(readPreferences("work").customBoards).toHaveLength(1);
    expect(wrapper.find('[data-testid="line-map-sidebar-favorite-selector"]').exists()).toBe(false);

    await wrapper.get(".line-map-info-alert__undo").trigger("click");
    await flushPromises();

    expect(readPreferences("work").customBoards).toHaveLength(0);
    expect(wrapper.find('[data-testid="line-map-favorite-alert"]').exists()).toBe(false);

    await wrapper.get(".line-map-sidebar__favorite").trigger("click");
    await flushPromises();
    const secondWorkChoice = wrapper
      .findAll('[data-testid="line-map-sidebar-favorite-selector"] .station-board-selector__item')
      .find((item) => item.text().includes("Travail"));
    expect(secondWorkChoice).toBeTruthy();
    await secondWorkChoice!.trigger("click");
    await wrapper
      .get('[data-testid="line-map-sidebar-favorite-selector"] .line-map-sidebar__favorite')
      .trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="line-map-favorite-alert"]').exists()).toBe(true);
    vi.advanceTimersByTime(5000);
    await flushPromises();
    expect(wrapper.find('[data-testid="line-map-favorite-alert"]').exists()).toBe(false);

    wrapper.unmount();
    vi.useRealTimers();
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
    await wrapper
      .get('[data-testid="line-map-sidebar-favorite-selector"] .line-map-sidebar__favorite')
      .trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Impossible d'ajouter cette station a l'ecran d'accueil.");

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

function createTile(id: string, url: string, priority: "visible" | "overscan" = "visible") {
  return {
    id,
    url,
    priority,
    x: 0,
    y: 0,
    width: 256,
    height: 256,
  };
}

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
    geometrySource: "direct",
    geometryAttempts: [{ source: "direct", status: "success" }],
    entrances: [],
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

function createTrafficMap(): LineMapViewModel {
  const map = createMap();
  const stationC: LineMapStopView = {
    id: "station:c",
    label: "Station C",
    city: "Paris",
    x: 0.9,
    y: 0.5,
    coordinateSource: "fallback",
    routeIds: ["main"],
    routeLabels: ["Main"],
    station: {
      id: "station:c",
      label: "Station C",
      city: "Paris",
      monitoringRef: "stop:c",
      scheduleStopAreaRef: "stop_area:c",
    },
  };
  const stationD: LineMapStopView = {
    id: "station:d",
    label: "Station D",
    city: "Paris",
    x: 0.98,
    y: 0.5,
    coordinateSource: "fallback",
    routeIds: ["main"],
    routeLabels: ["Main"],
    station: {
      id: "station:d",
      label: "Station D",
      city: "Paris",
      monitoringRef: "stop:d",
      scheduleStopAreaRef: "stop_area:d",
    },
  };

  map.stops = [...map.stops, stationC, stationD];
  map.segments = [
    map.segments[0],
    {
      id: "b-c",
      fromStopId: "station:b",
      toStopId: "station:c",
    },
    {
      id: "c-d",
      fromStopId: "station:c",
      toStopId: "station:d",
    },
  ];
  map.branches = [
    {
      id: "main",
      label: "Main",
      stopIds: map.stops.map((stop) => stop.id),
    },
  ];

  return map;
}

function createDomRect({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top,
  };
}

function createTouchPoint(clientX: number, clientY: number): Touch {
  return {
    clientX,
    clientY,
  } as Touch;
}

function stubGhostTopologyFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/line-geometry/resolve")) {
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            source: "gtfs",
            datasetVersion: "fixture",
            generatedAt: "2026-07-23T12:00:00.000Z",
            stops: [
              { id: "ghost:a", label: "Station A", lon: 2.35, lat: 48.85 },
              { id: "ghost:b", label: "Station Ghost", lon: 2.365, lat: 48.86 },
            ],
            branches: [{ id: "ghost:a-b", stopIds: ["ghost:a", "ghost:b"] }],
            segments: [
              {
                id: "ghost:a--ghost:b",
                fromStopId: "ghost:a",
                toStopId: "ghost:b",
                coordinates: [
                  { lon: 2.3502, lat: 48.8501 },
                  { lon: 2.356, lat: 48.856 },
                  { lon: 2.3651, lat: 48.8601 },
                ],
              },
            ],
            entrances: [
              {
                id: "exit:4",
                parentStopId: "ghost:a",
                name: "r. de Test",
                code: "4",
                lon: 2.3501,
                lat: 48.8501,
              },
            ],
            attempts: [{ source: "gtfs", status: "success" }],
          }),
        );
      }

      return new Response(
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
      );
    }),
  );
}
function createFocusableTrafficReport(): TrafficLineReport {
  return {
    lineRef: line.ref,
    status: "planned",
    disruptions: [
      {
        id: "focus-a-c",
        title: "Incident entre Station A et Station C",
        message: "Le trafic est interrompu entre Station A et Station C.",
        kind: "incident",
        applicationPeriods: [
          {
            begin: "20260701T000000",
            end: "20260702T000000",
          },
        ],
        impactedLineRefs: [line.ref],
        impactedStopNames: [],
      },
    ],
  };
}
function readPreferences(placeId = "home"): {
  visibleBoardIds: string[];
  customBoards: Array<{ id: string }>;
} {
  const value = JSON.parse(window.localStorage.getItem("transport-clock.preferences.v2") ?? "{}");

  return value.places?.find((place: { id: string }) => place.id === placeId)?.preferences ?? value;
}
