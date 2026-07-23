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
    expect(wrapper.find(".network-ghost-line__segment").exists()).toBe(false);
    expect(wrapper.findAll(".network-ghost-line__accessibility-button")).toHaveLength(1);

    await hitTarget.trigger("pointerenter", { clientX: 100, clientY: 100 });
    expect(wrapper.findAll(".network-ghost-line__station")).toHaveLength(2);
    expect(wrapper.get(".network-ghost-line__segment").attributes("d")).toContain("Q");
    expect(wrapper.get(".network-ghost-line").attributes("style")).toContain(
      "--network-ghost-width: 5px",
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

  it("keeps the settled canvas while moving and swaps the next render atomically", async () => {
    vi.useFakeTimers();
    const animationFrames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => {
      animationFrames.delete(handle);
    });

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

    await runAnimationFramesUntil(
      animationFrames,
      () => wrapper.find(".network-ghost-canvas-layer--ready").exists(),
    );
    expect(wrapper.findAll(".network-ghost-canvas-layer")).toHaveLength(1);
    const settledLayerId = wrapper.get(".network-ghost-canvas-layer").attributes("data-layer-id");

    await wrapper.setProps({ moving: true, zoom: 2 });
    await wrapper
      .get(".network-ghost-line__accessibility-button")
      .trigger("pointerenter", { clientX: 100, clientY: 100 });
    expect(wrapper.find(".network-ghost-line--active").exists()).toBe(false);
    expect(wrapper.get(".network-ghost-canvas-layer").attributes("data-layer-id")).toBe(
      settledLayerId,
    );
    expect(animationFrames.size).toBe(0);

    await wrapper.setProps({ moving: false });
    vi.advanceTimersByTime(48);
    runNextAnimationFrame(animationFrames);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".network-ghost-canvas-layer")).toHaveLength(2);

    await runAnimationFramesUntil(
      animationFrames,
      () =>
        wrapper.findAll(".network-ghost-canvas-layer").length === 1 &&
        wrapper.find(".network-ghost-canvas-layer--ready").exists(),
    );
    expect(wrapper.findAll(".network-ghost-canvas-layer")).toHaveLength(1);
    expect(wrapper.get(".network-ghost-canvas-layer").attributes("data-layer-id")).not.toBe(
      settledLayerId,
    );

    wrapper.unmount();
  });

  it("posts cloneable Worker requests, discards stale bitmaps and swaps the latest layer", async () => {
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
        lines: [createLine()],
        anchorX: 0.5,
        anchorY: 0.5,
        viewportRect: { x: 0, y: 0, width: 800, height: 500 },
      },
      attachTo: document.body,
    });

    await vi.waitFor(() => expect(workers[0]?.requests).toHaveLength(1));
    const firstRequest = workers[0].requests[0] as {
      generation: number;
      lines: NetworkGhostLineView[];
    };
    expect(() => structuredClone(firstRequest)).not.toThrow();

    await wrapper.setProps({
      lines: [createLine({ segments: [createLine().segments[0], createSecondSegment()] })],
    });
    await vi.waitFor(() => expect(workers[0].requests).toHaveLength(2));
    const secondRequest = workers[0].requests[1] as { generation: number };
    const staleClose = vi.fn();
    workers[0].onmessage?.({
      data: createWorkerResponse(firstRequest.generation, { close: staleClose }),
    } as MessageEvent);
    await wrapper.vm.$nextTick();
    expect(staleClose).toHaveBeenCalledOnce();
    expect(wrapper.find(".network-ghost-canvas-layer--ready").exists()).toBe(false);

    const latestClose = vi.fn();
    workers[0].onmessage?.({
      data: createWorkerResponse(secondRequest.generation, { close: latestClose }, 2),
    } as MessageEvent);
    await vi.waitFor(() =>
      expect(wrapper.find(".network-ghost-canvas-layer--ready").exists()).toBe(true),
    );
    expect(wrapper.get(".network-ghost-canvas-layer").attributes("data-layer-id")).toBe(
      String(secondRequest.generation),
    );
    expect(latestClose).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
});

function createWorkerResponse(
  generation: number,
  bitmap: { close: () => void },
  segmentCount = 1,
) {
  const tile = {
    id: "0:0",
    x: 0,
    y: 0,
    width: 512,
    height: 512,
    pixelWidth: 512,
    pixelHeight: 512,
    memoryBytes: 512 * 512 * 4,
    priority: "visible" as const,
  };
  return {
    type: "tiles" as const,
    generation,
    phase: "visible" as const,
    signature: `generation:${generation}`,
    plan: {
      zoom: 1,
      pixelRatio: 1,
      tileSize: 512,
      memoryBytes: tile.memoryBytes,
      tiles: [tile],
    },
    tiles: [{ ...tile, bitmap }],
    lineCount: 1,
    segmentCount,
    workerDurationMs: 4,
  };
}

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

function runNextAnimationFrame(frames: Map<number, FrameRequestCallback>): void {
  const next = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
  if (!next) throw new Error("Expected an animation frame");
  frames.delete(next[0]);
  next[1](performance.now());
}

async function runAnimationFramesUntil(
  frames: Map<number, FrameRequestCallback>,
  predicate: () => boolean,
  maximumFrames = 32,
): Promise<void> {
  for (let index = 0; index < maximumFrames; index += 1) {
    if (predicate()) return;
    await Promise.resolve();
    if (frames.size === 0) continue;
    runNextAnimationFrame(frames);
    await Promise.resolve();
  }

  throw new Error("Canvas render did not settle within the frame budget");
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
