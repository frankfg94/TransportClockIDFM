import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { createCamera } from "../src/features/transport-map/geo/camera";
import SelectedLineBasemapCover from "../src/features/transport-map/basemap/SelectedLineBasemapCover.vue";

const anchorCamera = createCamera({
  centerWorldX: 0.5,
  centerWorldY: 0.35,
  viewportWidthCssPx: 900,
  viewportHeightCssPx: 560,
  zoom: 12,
  pixelRatio: 1,
});

const baseProps = {
  enabled: true,
  lineId: "line:IDFM:C01384",
  camera: anchorCamera,
  anchorCamera,
  lineBounds: { minX: 0.492, minY: 0.338, maxX: 0.508, maxY: 0.362 },
  layer: "plan" as const,
  basemapStyle: "light" as const,
  contrast: 1,
  interactionActive: false,
};

async function flush(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

function markImageDecodable(image: { element: Element }): void {
  const element = image.element as HTMLImageElement;
  Object.defineProperty(element, "complete", { configurable: true, value: true });
  Object.defineProperty(element, "naturalWidth", { configurable: true, value: 256 });
  Object.defineProperty(element, "naturalHeight", { configurable: true, value: 256 });
  Object.defineProperty(element, "decode", {
    configurable: true,
    value: () => Promise.resolve(),
  });
}

async function decodeAll(wrapper: ReturnType<typeof mount>): Promise<void> {
  for (const image of wrapper.findAll("img")) {
    markImageDecodable(image);
    await image.trigger("load");
  }
  await flush();
}

function metrics(wrapper: ReturnType<typeof mount>): Record<string, unknown> {
  return (wrapper.vm as unknown as {
    getDebugMetrics: () => Record<string, unknown>;
  }).getDebugMetrics();
}

describe("SelectedLineBasemapCover", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("mounts disabled without a raster definition and exposes the required debug attributes", () => {
    const wrapper = mount(SelectedLineBasemapCover, {
      props: { ...baseProps, enabled: false },
    });

    const root = wrapper.get("[data-selected-line-basemap-cover]");
    expect(root.attributes("aria-hidden")).toBe("true");
    expect(root.attributes("data-cover-enabled")).toBe("false");
    expect(root.attributes("data-cover-ready")).toBe("false");
    expect(wrapper.findAll("[data-selected-line-cover-tile]")).toHaveLength(0);
  });

  it("keeps the cover atomic until every fixed-source tile is decoded", async () => {
    const wrapper = mount(SelectedLineBasemapCover, { props: baseProps });
    const root = wrapper.get("[data-selected-line-basemap-cover]");
    const images = wrapper.findAll("img[data-selected-line-cover-tile]");

    expect(images.length).toBeGreaterThan(0);
    expect(root.attributes("data-cover-ready")).toBe("false");
    expect(images.every((image) => image.attributes("crossorigin") === "anonymous")).toBe(true);
    expect(new Set(images.map((image) => image.attributes("data-cover-tile-state"))).size).toBe(1);
    expect(images.every((image) => image.attributes("data-cover-tile-state") === "loading")).toBe(true);

    markImageDecodable(images[0]!);
    await images[0]!.trigger("load");
    await flush();
    expect(root.attributes("data-cover-ready")).toBe("false");

    await decodeAll(wrapper);
    expect(root.attributes("data-cover-ready")).toBe("true");
    expect(wrapper.findAll("img[data-cover-tile-state='decoded']")).toHaveLength(images.length);
    expect(root.classes()).toContain("selected-line-basemap-cover--ready");
  });

  it("uses one source zoom and one definition-level transform while the live camera moves", async () => {
    const wrapper = mount(SelectedLineBasemapCover, { props: baseProps });
    const definition = wrapper.get("[data-selected-line-cover-definition]");
    const key = definition.attributes("data-cover-definition-key");
    const tileCount = wrapper.findAll("img").length;
    const sourceZoom = wrapper.get("[data-selected-line-basemap-cover]").attributes("data-cover-source-zoom");

    await wrapper.setProps({
      camera: {
        ...anchorCamera,
        centerWorldX: anchorCamera.centerWorldX + 0.001,
        zoom: anchorCamera.zoom + 0.4,
        generation: anchorCamera.generation + 1,
      },
      interactionActive: true,
    });
    await flush();

    expect(wrapper.get("[data-selected-line-cover-definition]").attributes("data-cover-definition-key")).toBe(
      key,
    );
    expect(wrapper.findAll("img")).toHaveLength(tileCount);
    expect(wrapper.get("[data-selected-line-basemap-cover]").attributes("data-cover-source-zoom")).toBe(
      sourceZoom,
    );
    expect(wrapper.get("[data-selected-line-cover-definition]").attributes("style")).toContain(
      "transform:",
    );
  });

  it("rebuilds on an explicit anchor change and does not mutate the previous definition", async () => {
    const wrapper = mount(SelectedLineBasemapCover, { props: baseProps });
    const firstKey = wrapper.get("[data-selected-line-cover-definition]").attributes("data-cover-definition-key");
    const firstImages = wrapper.findAll("img");

    await wrapper.setProps({
      anchorCamera: {
        ...anchorCamera,
        centerWorldX: anchorCamera.centerWorldX + 0.01,
        generation: anchorCamera.generation + 1,
      },
      camera: {
        ...anchorCamera,
        centerWorldX: anchorCamera.centerWorldX + 0.01,
        generation: anchorCamera.generation + 1,
      },
    });
    await flush();

    const nextKey = wrapper.get("[data-selected-line-cover-definition]").attributes("data-cover-definition-key");
    expect(nextKey).not.toBe(firstKey);
    expect(wrapper.findAll("img")).not.toBe(firstImages);
    expect(metrics(wrapper).rebuilds).toBe(2);
  });

  it("retries a failed definition once and then leaves the live path usable", async () => {
    vi.useFakeTimers();
    const wrapper = mount(SelectedLineBasemapCover, { props: baseProps });
    await wrapper.find("img").trigger("error");
    expect(metrics(wrapper).retries).toBe(1);

    vi.advanceTimersByTime(500);
    await flush();
    expect(metrics(wrapper).rebuilds).toBe(2);

    await wrapper.find("img").trigger("error");
    expect(metrics(wrapper).terminalFailures).toBe(1);
    expect(wrapper.get("[data-selected-line-basemap-cover]").attributes("data-cover-ready")).toBe("false");
  });

  it("records bounded decoded memory and failure/callback counters", async () => {
    const wrapper = mount(SelectedLineBasemapCover, { props: baseProps });
    const root = wrapper.get("[data-selected-line-basemap-cover]");
    const currentMetrics = metrics(wrapper);

    expect(Number(root.attributes("data-cover-tile-count"))).toBeGreaterThan(0);
    expect(Number(root.attributes("data-cover-estimated-decoded-bytes"))).toBeLessThanOrEqual(
      32 * 1024 * 1024,
    );
    expect(currentMetrics.enabled).toBe(true);
    expect(currentMetrics.mounted).toBe(true);
    expect(currentMetrics.lateCallbacksIgnored).toBe(0);

    await decodeAll(wrapper);
    expect(metrics(wrapper).loadedTiles).toBe(Number(root.attributes("data-cover-tile-count")));
  });

  it("flattens a decoded mosaic into one canvas and releases every source image node", async () => {
    const clearRect = vi.fn();
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect,
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const wrapper = mount(SelectedLineBasemapCover, { props: baseProps });
    const tileCount = wrapper.findAll("img[data-selected-line-cover-tile]").length;

    await decodeAll(wrapper);

    const root = wrapper.get("[data-selected-line-basemap-cover]");
    const canvas = wrapper.get("canvas[data-selected-line-cover-composite]");
    expect(root.attributes("data-cover-ready")).toBe("true");
    expect(root.attributes("data-cover-render-mode")).toBe("canvas");
    expect(root.attributes("data-cover-composite-verified")).toBe("true");
    expect(wrapper.findAll("img[data-selected-line-cover-tile]")).toHaveLength(0);
    expect(drawImage).toHaveBeenCalledTimes(tileCount);
    expect(clearRect).toHaveBeenCalledTimes(1);
    expect(Number((canvas.element as HTMLCanvasElement).width)).toBeGreaterThan(0);
    expect(Number((canvas.element as HTMLCanvasElement).height)).toBeGreaterThan(0);
  });

  it("rejects a transparent composite instead of publishing it as cache-ready", async () => {
    vi.useFakeTimers();
    const clearRect = vi.fn();
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      return {
        canvas: this,
        clearRect,
        drawImage,
        getImageData: () => ({ data: new Uint8ClampedArray([245, 244, 232, 0]) }),
      } as unknown as CanvasRenderingContext2D;
    });
    const wrapper = mount(SelectedLineBasemapCover, { props: baseProps });

    await decodeAll(wrapper);

    const root = wrapper.get("[data-selected-line-basemap-cover]");
    expect(root.attributes("data-cover-ready")).toBe("false");
    expect(root.attributes("data-cover-composite-verified")).toBe("false");
    expect(root.attributes("data-cover-render-mode")).toBe("tiles");
    expect(metrics(wrapper).rejectedComposites).toBe(1);
    expect(metrics(wrapper).retries).toBe(1);
  });
});
