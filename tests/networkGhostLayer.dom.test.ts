import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import TransitNetworkGhostLayer from "../src/features/network-ghost/TransitNetworkGhostLayer.vue";
import type { NetworkGhostLineView } from "../src/features/network-ghost";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TransitNetworkGhostLayer", () => {
  it("reveals stations on hover, pins on click and resets from the parent", async () => {
    const Host = defineComponent({
      components: { TransitNetworkGhostLayer },
      props: {
        resetKey: {
          type: Number,
          required: true,
        },
        zoom: {
          type: Number,
          required: true,
        },
      },
      setup() {
        return { lines: [createLine()] };
      },
      template: `
        <div style="position: relative; width: 1080px; height: 620px">
          <TransitNetworkGhostLayer
            :lines="lines"
            :anchor-x="0.5"
            :anchor-y="0.5"
            :reset-key="resetKey"
            :zoom="zoom"
          />
        </div>
      `,
    });
    const wrapper = mount(Host, {
      props: { resetKey: 0, zoom: 1 },
      attachTo: document.body,
    });
    const hitTarget = wrapper.get(".network-ghost-line__accessibility-button");
    const ghostLayer = wrapper.getComponent(TransitNetworkGhostLayer);

    expect(wrapper.find(".network-ghost-line__station").exists()).toBe(false);
    const sharedPath = wrapper.get(".network-ghost-line__segment");
    expect(wrapper.findAll(".network-ghost-line__accessibility-button")).toHaveLength(1);

    await hitTarget.trigger("pointerenter", { clientX: 100, clientY: 100 });
    expect(wrapper.findAll(".network-ghost-line__station")).toHaveLength(2);
    expect(wrapper.findAll(".network-ghost-line__segment")).toHaveLength(1);
    expect(wrapper.get(".network-ghost-line__segment").element).toBe(sharedPath.element);
    expect(wrapper.get(".network-ghost-line").attributes("style")).toContain(
      "--network-ghost-width: 7px",
    );
    expect(wrapper.get(".network-ghost-tooltip").text()).toContain("Ligne B");
    expect(wrapper.get(".network-ghost-line").classes()).toContain("network-ghost-line--hovered");
    expect(ghostLayer.emitted("activeLineChange")?.at(-1)?.[0]).toMatchObject({ id: "rer:b" });
    expect(wrapper.get(".network-ghost-tooltip__icon").attributes("href")).toBe(
      "https://example.test/rer-b.svg",
    );
    expect(Number(wrapper.get(".network-ghost-line__station").attributes("r"))).toBe(4);

    await wrapper.setProps({ zoom: 4 });
    expect(Number(wrapper.get(".network-ghost-line__station").attributes("r"))).toBe(1);
    expect(wrapper.get(".network-ghost-tooltip").attributes("transform")).toContain("scale(0.25)");

    await hitTarget.trigger("click");
    await hitTarget.trigger("pointerleave");
    expect(wrapper.findAll(".network-ghost-line__station")).toHaveLength(2);

    await wrapper.setProps({ resetKey: 1 });
    expect(wrapper.find(".network-ghost-line__station").exists()).toBe(false);
    wrapper.unmount();
  });

  it("keeps bus and Noctilien thinner than metro, and metro thinner than RER at high zoom", () => {
    const wrapper = mount(TransitNetworkGhostLayer, {
      props: {
        lines: [
          createLine({
            id: "bus:21",
            label: "21",
            family: "BUS",
            mode: "Bus",
            isBus: true,
          }),
          createLine({
            id: "noctilien:n21",
            label: "N21",
            family: "NOCTILIEN",
            mode: "Noctilien",
            isBus: true,
          }),
          createLine({
            id: "metro:7",
            label: "7",
            family: "METRO",
            mode: "Métro",
          }),
          createLine({
            id: "rer:b",
            label: "B",
            family: "RER",
            mode: "RER",
          }),
        ],
        anchorX: 0.5,
        anchorY: 0.5,
        zoom: 142.24,
        viewportRect: { x: 0, y: 0, width: 800, height: 500 },
      },
      attachTo: document.body,
    });

    const lineWidth = (lineId: string) =>
      wrapper
        .get(`[data-network-ghost-line-id="${lineId}"]`)
        .attributes("style");

    expect(lineWidth("bus:21")).toContain("--network-ghost-width: 4px");
    expect(lineWidth("noctilien:n21")).toContain("--network-ghost-width: 4px");
    expect(lineWidth("metro:7")).toContain("--network-ghost-width: 6px");
    expect(lineWidth("rer:b")).toContain("--network-ghost-width: 7px");

    wrapper.unmount();
  });

  it("keeps one GTFS polyline with exactly the same coordinates before and after hover", async () => {
    const line = createLine({
      geometrySource: "gtfs",
      geometryAttempts: [{ source: "gtfs", status: "success" }],
    });
    const coordinatesBeforeHover = structuredClone(
      line.segments.map((segment) => segment.polyline),
    );
    const wrapper = mount(TransitNetworkGhostLayer, {
      props: {
        lines: [line],
        anchorX: 0.5,
        anchorY: 0.5,
        viewportRect: { x: 0, y: 0, width: 800, height: 500 },
      },
      attachTo: document.body,
    });
    const sharedPath = wrapper.get(".network-ghost-line__segment");
    expect(wrapper.find(".network-ghost-canvas-layer").exists()).toBe(false);

    await wrapper
      .get(".network-ghost-line__accessibility-button")
      .trigger("pointerenter", { clientX: 100, clientY: 100 });

    const activeLine = wrapper
      .getComponent(TransitNetworkGhostLayer)
      .emitted("activeLineChange")
      ?.at(-1)?.[0] as NetworkGhostLineView;
    expect(activeLine.geometrySource).toBe("gtfs");
    expect(activeLine.segments.map((segment) => segment.polyline)).toEqual(
      coordinatesBeforeHover,
    );
    const activeSegment = wrapper.get(
      ".network-ghost-line--active .network-ghost-line__segment",
    );
    expect(activeSegment.element).toBe(sharedPath.element);
    const firstStation = wrapper.findAll(".network-ghost-line__station")[0];
    expectPathToStartAtStation(activeSegment.attributes("d"), firstStation.attributes());
    expect(wrapper.findAll(".network-ghost-line__segment")).toHaveLength(1);

    wrapper.unmount();
  });

  it("does not draw provisional straight bus traces before precise geometry is ready", async () => {
    const pending = createLine({
      id: "bus:172",
      label: "172",
      mode: "Bus",
      isBus: true,
      geometryPending: true,
      geometrySource: "direct",
    });
    const wrapper = mount(TransitNetworkGhostLayer, {
      props: {
        lines: [pending],
        anchorX: 0.5,
        anchorY: 0.5,
        zoom: 5.59,
      },
      attachTo: document.body,
    });

    expect(wrapper.find('[data-network-ghost-line="bus:172"]').exists()).toBe(false);

    await wrapper.setProps({
      lines: [
        {
          ...pending,
          geometryPending: false,
          geometrySource: "gtfs",
          geometryAttempts: [{ source: "gtfs", status: "success" }],
        },
      ],
    });
    await vi.waitFor(() =>
      expect(wrapper.find('[data-network-ghost-line="bus:172"]').exists()).toBe(true),
    );

    await wrapper
      .get('[data-network-ghost-line="bus:172"]')
      .trigger("pointerenter", { clientX: 100, clientY: 100 });
    expectPathToStartAtStation(
      wrapper.get(".network-ghost-line__segment").attributes("d"),
      wrapper.get(".network-ghost-line__station").attributes(),
    );

    wrapper.unmount();
  });

  it("reuses the exact cached SVG path for a bus through a 14224% zoom", async () => {
    const baseLine = createLine();
    const line = createLine({
      id: "bus:187",
      label: "187",
      mode: "Bus",
      isBus: true,
      geometrySource: "gtfs",
      geometryAttempts: [{ source: "gtfs", status: "success" }],
      segments: [baseLine.segments[0], createSecondSegment()],
    });
    const wrapper = mount(TransitNetworkGhostLayer, {
      props: {
        lines: [line],
        anchorX: 0.5,
        anchorY: 0.5,
        zoom: 1,
      },
      attachTo: document.body,
    });

    const backgroundSegment = wrapper.get(".network-ghost-line__segment--background");
    const cachedPath = backgroundSegment.attributes("d") ?? "";
    expect(wrapper.findAll(".network-ghost-line__segment--background")).toHaveLength(1);
    expect(cachedPath.match(/\bM /gu)).toHaveLength(2);
    expect(wrapper.find(".network-ghost-line--active").exists()).toBe(false);

    await wrapper.setProps({ zoom: 142.24 });
    expect(backgroundSegment.attributes("d")).toBe(cachedPath);

    await wrapper
      .get('[data-network-ghost-line="bus:187"]')
      .trigger("pointerenter", { clientX: 100, clientY: 100 });

    const activeSegment = wrapper.get(
      ".network-ghost-line--active .network-ghost-line__segment",
    );
    expect(
      wrapper.findAll(".network-ghost-line--active .network-ghost-line__segment"),
    ).toHaveLength(1);
    expect(activeSegment.element).toBe(backgroundSegment.element);
    expectPathToStartAtStation(
      backgroundSegment.attributes("d"),
      wrapper.get(".network-ghost-line__station").attributes(),
    );

    wrapper.unmount();
  });

  it("applies a pending selection when its asynchronously loaded line appears", async () => {
    const wrapper = mount(TransitNetworkGhostLayer, {
      props: {
        lines: [],
        anchorX: 0.5,
        anchorY: 0.5,
        tapRequest: { id: 1, lineId: "rer:b", mode: "select" },
      },
      attachTo: document.body,
    });

    expect(wrapper.find(".network-ghost-line--active").exists()).toBe(false);
    await wrapper.setProps({ lines: [createLine()] });
    expect(wrapper.get(".network-ghost-line--active").attributes()).toMatchObject({
      "data-network-ghost-line-id": "rer:b",
    });
    wrapper.unmount();
  });

  it("gives click and parent selection priority over a hovered line", async () => {
    const Host = defineComponent({
      components: { TransitNetworkGhostLayer },
      props: {
        tapRequest: {
          type: Object,
          default: undefined,
        },
      },
      setup() {
        return {
          lines: [
            createLine(),
            createLine({
              id: "tram:t4",
              label: "T4",
              mode: "Tram",
              color: "#e3b300",
              anchorX: 0.45,
              anchorY: 0.62,
            }),
          ],
        };
      },
      template: `
        <div style="position: relative; width: 1080px; height: 620px">
          <TransitNetworkGhostLayer
            :lines="lines"
            :anchor-x="0.5"
            :anchor-y="0.5"
            :tap-request="tapRequest"
          />
        </div>
      `,
    });
    const wrapper = mount(Host, {
      attachTo: document.body,
    });

    await wrapper
      .get('[data-network-ghost-line="rer:b"]')
      .trigger("pointerenter", { clientX: 100, clientY: 100 });
    expect(wrapper.get(".network-ghost-line--active").attributes()).toMatchObject({
      "data-network-ghost-line-id": "rer:b",
    });

    await wrapper.setProps({
      tapRequest: { id: 1, lineId: "tram:t4", mode: "select" },
    });

    expect(wrapper.get(".network-ghost-line--active").attributes()).toMatchObject({
      "data-network-ghost-line-id": "tram:t4",
    });
    expect(wrapper.get('[data-network-ghost-line="rer:b"]').classes()).not.toContain(
      "network-ghost-line--hovered",
    );

    await wrapper
      .get('[data-network-ghost-line="rer:b"]')
      .trigger("pointerenter", { clientX: 110, clientY: 100 });
    expect(wrapper.get(".network-ghost-line--active").attributes()).toMatchObject({
      "data-network-ghost-line-id": "tram:t4",
    });

    await wrapper.get('[data-network-ghost-line="rer:b"]').trigger("click");
    expect(wrapper.get(".network-ghost-line--active").attributes()).toMatchObject({
      "data-network-ghost-line-id": "rer:b",
    });

    await wrapper.get('[data-network-ghost-line="rer:b"]').trigger("click");
    expect(wrapper.find(".network-ghost-line--active").exists()).toBe(false);

    wrapper.unmount();
  });

  it("keeps one shared SVG path while moving and zooming", async () => {
    const wrapper = mount(TransitNetworkGhostLayer, {
      props: {
        lines: [createLine()],
        anchorX: 0.5,
        anchorY: 0.5,
        viewportRect: { x: 0, y: 0, width: 800, height: 500 },
        zoom: 1,
        moving: false,
      },
      attachTo: document.body,
    });

    const sharedPath = wrapper.get(".network-ghost-line__segment").element;
    expect(wrapper.find(".network-ghost-canvas-layer").exists()).toBe(false);

    await wrapper.setProps({ moving: true, zoom: 2 });
    await wrapper
      .get(".network-ghost-line__accessibility-button")
      .trigger("pointerenter", { clientX: 100, clientY: 100 });
    expect(wrapper.find(".network-ghost-line--active").exists()).toBe(false);
    expect(wrapper.get(".network-ghost-line__segment").element).toBe(sharedPath);

    await wrapper.setProps({ moving: false });
    expect(wrapper.get(".network-ghost-line__segment").element).toBe(sharedPath);
    expect(wrapper.find(".network-ghost-canvas-layer").exists()).toBe(false);

    wrapper.unmount();
  });

  it("renders metro ghost lines once without starting the Canvas worker", async () => {
    const workers: FakeCanvasWorker[] = [];
    class FakeCanvasWorker {
      onmessage?: (event: MessageEvent) => void;
      onerror?: () => void;
      readonly requests: Array<Record<string, unknown>> = [];

      constructor() {
        workers.push(this);
      }

      postMessage(request: Record<string, unknown>) {
        this.requests.push(request);
      }

      terminate() {}
    }
    vi.stubGlobal("Worker", FakeCanvasWorker);

    const wrapper = mount(TransitNetworkGhostLayer, {
      props: {
        lines: [
          createLine({ id: "metro:7", label: "7", mode: "Métro" }),
          createLine({ id: "metro:14", label: "14", mode: "Métro" }),
        ],
        anchorX: 0.5,
        anchorY: 0.5,
        viewportRect: { x: 0, y: 0, width: 800, height: 500 },
      },
      attachTo: document.body,
    });

    await wrapper.vm.$nextTick();
    expect(workers).toHaveLength(0);
    expect(wrapper.find(".network-ghost-canvas-layer").exists()).toBe(false);
    expect(wrapper.findAll(".network-ghost-line__segment")).toHaveLength(2);

    const metro7Path = wrapper.get(
      '[data-network-ghost-line-id="metro:7"] .network-ghost-line__segment',
    ).element;
    await wrapper
      .get('[data-network-ghost-line="metro:7"]')
      .trigger("pointerenter", { clientX: 100, clientY: 100 });
    expect(wrapper.findAll(".network-ghost-line__segment")).toHaveLength(2);
    expect(
      wrapper.get(
        '[data-network-ghost-line-id="metro:7"] .network-ghost-line__segment',
      ).element,
    ).toBe(metro7Path);
    wrapper.unmount();
  });
});

function createSecondSegment() {
  return {
    id: "b-c",
    fromStationId: "b",
    toStationId: "c",
    fromX: 0.6,
    fromY: 0.5,
    toX: 0.8,
    toY: 0.6,
    polyline: [
      { x: 0.6, y: 0.5 },
      { x: 0.8, y: 0.6 },
    ],
    level: 0,
  };
}

function expectPathToStartAtStation(
  path: string | undefined,
  station: Record<string, string>,
): void {
  expect(path).toBeDefined();
  const start = path?.match(/^M ([\d.-]+) ([\d.-]+)/u);
  expect(start).not.toBeNull();
  expect(Number(start?.[1])).toBeCloseTo(Number(station.cx), 5);
  expect(Number(start?.[2])).toBeCloseTo(Number(station.cy), 5);
}

function createLine(overrides: Partial<NetworkGhostLineView> = {}): NetworkGhostLineView {
  const id = overrides.id ?? "rer:b";
  const anchorX = overrides.anchorX ?? 0.4;
  const anchorY = overrides.anchorY ?? 0.5;

  return {
    id,
    label: "Ligne B",
    mode: "RER",
    color: "#4b92db",
    textColor: "#ffffff",
    iconUrl: "https://example.test/rer-b.svg",
    isBus: false,
    anchorStationId: "a",
    anchorX,
    anchorY,
    geometrySource: "direct",
    geometryAttempts: [{ source: "direct", status: "success" }],
    loadOrder: 0,
    stations: [
      { id: `${id}:a`, label: "Alpha", x: anchorX, y: anchorY },
      { id: `${id}:b`, label: "Beta", x: anchorX + 0.2, y: anchorY },
    ],
    segments: [
      {
        id: "a-b",
        fromStationId: `${id}:a`,
        toStationId: `${id}:b`,
        fromX: anchorX,
        fromY: anchorY,
        toX: anchorX + 0.2,
        toY: anchorY,
        polyline: [
          { x: anchorX, y: anchorY },
          { x: anchorX + 0.1, y: anchorY + 0.08 },
          { x: anchorX + 0.2, y: anchorY },
        ],
        level: 0,
      },
    ],
    ...overrides,
  };
}
