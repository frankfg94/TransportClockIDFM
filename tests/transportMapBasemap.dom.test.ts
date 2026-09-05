import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { createCamera } from "../src/features/transport-map/geo/camera";
import TransportMapBasemap from "../src/features/transport-map/basemap/TransportMapBasemap.vue";
import { definitionTransformStyle } from "../src/features/transport-map/basemap/basemapDefinition";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../src/features/transport-map/config/globalTransportPlanConfig";
import { measureBasemapCoverage } from "../src/features/transport-map/performance/basemapCoverage";

describe("TransportMapBasemap", () => {
  it("renders a bounded non-interactive raster layer behind the map canvas", () => {
    const wrapper = mount(TransportMapBasemap, {
      props: {
        camera: createCamera({ viewportWidthCssPx: 900, viewportHeightCssPx: 560, zoom: 12 }),
      },
    });

    expect(wrapper.get("[data-transport-map-basemap]").attributes("aria-hidden")).toBe("true");
    expect(wrapper.get("[data-transport-map-basemap]").attributes("data-basemap-layer")).toBe("plan");
    expect(wrapper.get("[data-transport-map-basemap]").attributes("data-basemap-provider")).toBe("carto");
    expect(wrapper.get("[data-transport-map-basemap]").attributes("data-basemap-style")).toBe("light");
    expect(wrapper.get("[data-transport-map-basemap]").attributes("style")).toContain(
      `--global-map-basemap-background: ${GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.background}`,
    );
    expect(wrapper.findAll("img").length).toBeGreaterThan(0);
    expect(wrapper.findAll("img").length).toBeLessThanOrEqual(
      GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.highZoomMaxTiles,
    );
    expect(wrapper.get("[data-definition-role='committed'] img").attributes("src")).toContain(
      "basemaps.cartocdn.com/light_all/",
    );
  });

  it("switches the raster source when the layer changes", async () => {
    const wrapper = mount(TransportMapBasemap, {
      props: {
        camera: createCamera({ viewportWidthCssPx: 900, viewportHeightCssPx: 560, zoom: 12 }),
      },
    });

    await wrapper.setProps({ layer: "satellite" });

    expect(wrapper.get("[data-transport-map-basemap]").attributes("data-basemap-layer")).toBe("satellite");
    expect(wrapper.get("[data-definition-role='pending'] img").attributes("src")).toContain(
      "server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/",
    );
  });

  it("switches the Carto raster source when the configured style changes", async () => {
    const wrapper = mount(TransportMapBasemap, {
      props: {
        camera: createCamera({ viewportWidthCssPx: 900, viewportHeightCssPx: 560, zoom: 12 }),
        basemapStyle: "voyager",
      },
    });

    await wrapper.setProps({ basemapStyle: "light" });

    expect(wrapper.get("[data-transport-map-basemap]").attributes("data-basemap-style")).toBe("light");
    expect(wrapper.get("[data-definition-role='pending'] img").attributes("src")).toContain(
      "basemaps.cartocdn.com/light_all/",
    );
    expect(wrapper.get("[data-definition-role='pending'] img").attributes("style")).toContain("saturate(1.08)");
  });

  it("keeps the loaded definition visible while a new zoom definition loads", async () => {
    const initialCamera = createCamera({
      viewportWidthCssPx: 900,
      viewportHeightCssPx: 560,
      zoom: 12.2,
    });
    const wrapper = mount(TransportMapBasemap, { props: { camera: initialCamera } });
    const firstImage = wrapper.findAll("img")[0]!;
    await firstImage.trigger("load");

    await wrapper.setProps({
      camera: { ...initialCamera, zoom: 13.2, generation: initialCamera.generation + 1 },
    });

    const retainedImage = wrapper.find("[data-definition-role='committed'] img");
    expect(retainedImage).toBeDefined();
    expect(retainedImage?.classes("transport-map-basemap__tile--loaded")).toBe(true);
    expect(retainedImage?.attributes("style")).not.toContain("transition");
  });

  it("moves the existing raster with a compositor transform during a gesture", async () => {
    const initialCamera = createCamera({
      viewportWidthCssPx: 900,
      viewportHeightCssPx: 560,
      zoom: 12,
    });
    const wrapper = mount(TransportMapBasemap, {
      props: { camera: initialCamera },
    });
    const tileCount = wrapper.findAll("img").length;

    await wrapper.setProps({
      camera: {
        ...initialCamera,
        centerWorldX: initialCamera.centerWorldX + 0.0002,
        zoom: initialCamera.zoom + 0.35,
        generation: initialCamera.generation + 1,
      },
      interactionActive: true,
    });

    expect(wrapper.findAll("img")).toHaveLength(tileCount);
    expect(wrapper.get("[data-definition-role='committed']").attributes("style")).toContain("scale3d(");
  });

  it("precommits the next tile definition while the gesture is still active", async () => {
    const initialCamera = createCamera({
      viewportWidthCssPx: 900,
      viewportHeightCssPx: 560,
      zoom: 12.2,
    });
    const wrapper = mount(TransportMapBasemap, {
      props: { camera: initialCamera, interactionActive: true },
    });

    await wrapper.setProps({
      camera: { ...initialCamera, zoom: 13.2, generation: initialCamera.generation + 1 },
      tileRefreshCamera: { ...initialCamera, zoom: 13.2, generation: initialCamera.generation + 1 },
    });

    expect(wrapper.findAll("img").some((image) => image.attributes("src")?.includes("/14/"))).toBe(true);
  });

  it("preloads and retains the line rectangle across raster zoom levels", async () => {
    const initialCamera = createCamera({
      centerWorldX: 0.5,
      centerWorldY: 0.35,
      viewportWidthCssPx: 900,
      viewportHeightCssPx: 560,
      zoom: 8,
    });
    const wrapper = mount(TransportMapBasemap, {
      props: {
        camera: initialCamera,
        preloadBounds: { minX: 0.48, minY: 0.33, maxX: 0.52, maxY: 0.37 },
      },
    });

    expect(wrapper.findAll("img").length).toBeGreaterThan(48);
    await wrapper.setProps({
      camera: { ...initialCamera, zoom: 9, generation: initialCamera.generation + 1 },
    });

    expect(wrapper.findAll("img").some((image) => image.attributes("src")?.includes("/8/"))).toBe(true);
  });

  it("applies the configurable contrast to every tile", () => {
    const wrapper = mount(TransportMapBasemap, {
      props: {
        camera: createCamera({ viewportWidthCssPx: 900, viewportHeightCssPx: 560, zoom: 12 }),
        contrast: 1.12,
      },
    });

    expect(wrapper.get("img").attributes("style")).toContain("contrast(1.12)");
  });

  it("keeps plan parks visible while preserving the softer satellite treatment", async () => {
    const wrapper = mount(TransportMapBasemap, {
      props: {
        camera: createCamera({ viewportWidthCssPx: 900, viewportHeightCssPx: 560, zoom: 12 }),
        basemapStyle: "voyager",
      },
    });

    expect(wrapper.get("[data-transport-map-basemap]").attributes("style")).toContain(
      "--transport-map-basemap-opacity: 1",
    );
    expect(wrapper.get("img").attributes("style")).toContain("saturate(1.32)");

    await wrapper.setProps({ basemapStyle: "light" });
    expect(wrapper.get("[data-transport-map-basemap]").attributes("style")).toContain(
      "--transport-map-basemap-opacity: 0.94",
    );
    expect(wrapper.get("img").attributes("style")).toContain("saturate(1.08)");

    await wrapper.setProps({ layer: "satellite" });

    expect(wrapper.get("[data-transport-map-basemap]").attributes("style")).toContain(
      "--transport-map-basemap-opacity: 0.92",
    );
    expect(wrapper.get("img").attributes("style")).toContain("saturate(0.82)");
  });
});

describe("basemap coverage audit", () => {
  const viewport = { left: 0, top: 0, right: 100, bottom: 100 };

  it("accepts an exact viewport rectangle", () => {
    expect(measureBasemapCoverage(viewport, [viewport])).toMatchObject({
      coverageRatio: 1,
      hasGap: false,
    });
  });

  it("accepts four jointive tiles and one-pixel overlap", () => {
    const tiles = [
      { left: 0, top: 0, right: 50, bottom: 50 },
      { left: 50, top: 0, right: 100, bottom: 50 },
      { left: 0, top: 50, right: 50, bottom: 100 },
      { left: 50, top: 50, right: 100, bottom: 100 },
    ];
    expect(measureBasemapCoverage(viewport, tiles).coverageRatio).toBe(1);
    expect(measureBasemapCoverage(viewport, [
      { left: 0, top: 0, right: 51, bottom: 100 },
      { left: 50, top: 0, right: 100, bottom: 100 },
    ])).toMatchObject({ coverageRatio: 1, hasGap: false });
  });

  it("reports a two-pixel hole while tolerating one-pixel seams", () => {
    expect(measureBasemapCoverage(viewport, [
      { left: 0, top: 0, right: 49, bottom: 100 },
      { left: 51, top: 0, right: 100, bottom: 100 },
    ])).toMatchObject({ hasGap: true, maxGapPx: 2 });
  });

  it("ignores rectangles outside the viewport", () => {
    expect(measureBasemapCoverage(viewport, [
      { left: 120, top: 0, right: 160, bottom: 100 },
    ])).toMatchObject({ coveredAreaPx2: 0, coverageRatio: 0, hasGap: true });
  });

  it("reports approximately seventy-five percent coverage", () => {
    expect(measureBasemapCoverage(viewport, [
      { left: 0, top: 0, right: 75, bottom: 100 },
    ], 0).coverageRatio).toBeCloseTo(0.75, 6);
  });

  it("does not depend on rectangle order", () => {
    const rectangles = [
      { left: 0, top: 0, right: 60, bottom: 100 },
      { left: 40, top: 0, right: 100, bottom: 100 },
    ];
    expect(measureBasemapCoverage(viewport, rectangles)).toEqual(
      measureBasemapCoverage(viewport, [...rectangles].reverse()),
    );
  });
});

describe("TransportMapBasemap atomic definitions", () => {
  const initialCamera = () => createCamera({
    centerWorldX: 0.5,
    centerWorldY: 0.35,
    viewportWidthCssPx: 320,
    viewportHeightCssPx: 180,
    zoom: 8,
  });

  async function flushCommit(): Promise<void> {
    await nextTick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await nextTick();
  }

  function metrics(wrapper: ReturnType<typeof mount>) {
    return (wrapper.vm as unknown as {
      getDebugMetrics: () => Record<string, unknown>;
    }).getDebugMetrics();
  }

  async function decodeVisible(wrapper: ReturnType<typeof mount>, role = "committed"): Promise<void> {
    const images = wrapper.findAll(`[data-definition-role='${role}'] img[data-tile-priority='visible']`);
    for (const image of images) {
      Object.defineProperty(image.element, "decode", {
        configurable: true,
        value: () => Promise.resolve(),
      });
      await image.trigger("load");
    }
    await nextTick();
  }

  function pendingImages(wrapper: ReturnType<typeof mount>) {
    return wrapper.findAll("[data-definition-role='pending'] img");
  }

  it("never commits a partially decoded definition", async () => {
    const wrapper = mount(TransportMapBasemap, { props: { camera: initialCamera() } });
    await decodeVisible(wrapper);
    const initialSignature = wrapper.get("[data-definition-role='committed']").attributes("data-definition-signature");
    const nextCamera = { ...initialCamera(), zoom: 9, generation: 1 };
    await wrapper.setProps({ camera: nextCamera });

    const pending = pendingImages(wrapper);
    expect(wrapper.findAll("[data-definition-role]")).toHaveLength(2);
    expect(wrapper.get("[data-definition-role='committed']").attributes("data-definition-signature")).toBe(initialSignature);
    const resolvers: Array<() => void> = [];
    for (const image of pending.filter((candidate) => candidate.attributes("data-tile-priority") === "visible")) {
      let resolveDecode: () => void = () => undefined;
      const decodePromise = new Promise<void>((resolve) => { resolveDecode = resolve; });
      Object.defineProperty(image.element, "decode", {
        configurable: true,
        value: () => decodePromise,
      });
      resolvers.push(resolveDecode);
      await image.trigger("load");
    }
    for (const resolve of resolvers.slice(0, -1)) resolve();
    await nextTick();
    expect(wrapper.get("[data-definition-role='committed']").attributes("data-definition-signature")).toBe(initialSignature);
    expect(metrics(wrapper).commitsBeforeReady).toBe(0);

    resolvers.at(-1)?.();
    await flushCommit();
    expect(wrapper.findAll("[data-definition-role]")).toHaveLength(2);
    expect(wrapper.get("[data-definition-role='fallback']").attributes("data-definition-signature"))
      .toBe(initialSignature);
    expect(wrapper.findAll("[data-definition-role='fallback'] img").length).toBeGreaterThan(0);
    expect(wrapper.get("[data-definition-role='committed']").attributes("data-definition-signature")).not.toBe(initialSignature);
    expect(metrics(wrapper).committedDefinitionChanges).toBe(2);
    expect(metrics(wrapper).fallbackTiles).toBeGreaterThan(0);
  });

  it("ignores callbacks from a superseded definition", async () => {
    const wrapper = mount(TransportMapBasemap, { props: { camera: initialCamera() } });
    await decodeVisible(wrapper);
    const initialSignature = wrapper.get("[data-definition-role='committed']").attributes("data-definition-signature");

    await wrapper.setProps({ camera: { ...initialCamera(), zoom: 9, generation: 1 } });
    const firstPending = pendingImages(wrapper).filter((image) => image.attributes("data-tile-priority") === "visible");
    const firstResolvers: Array<() => void> = [];
    for (const image of firstPending) {
      let resolveDecode: () => void = () => undefined;
      const decodePromise = new Promise<void>((resolve) => { resolveDecode = resolve; });
      Object.defineProperty(image.element, "decode", {
        configurable: true,
        value: () => decodePromise,
      });
      firstResolvers.push(resolveDecode);
      await image.trigger("load");
    }

    await wrapper.setProps({ camera: { ...initialCamera(), zoom: 10, generation: 2 } });
    expect(metrics(wrapper).supersededDefinitions).toBe(1);
    for (const resolve of firstResolvers) resolve();
    await nextTick();
    expect(wrapper.get("[data-definition-role='committed']").attributes("data-definition-signature")).toBe(initialSignature);

    await decodeVisible(wrapper, "pending");
    await flushCommit();
    expect(wrapper.find("[data-definition-role='pending']").exists()).toBe(false);
    expect(wrapper.get("[data-definition-role='committed']").attributes("data-definition-source-zoom")).toBe("10");
    expect(metrics(wrapper).commitsBeforeReady).toBe(0);
  });

  it("keeps the previous commit after a visible tile error", async () => {
    const wrapper = mount(TransportMapBasemap, { props: { camera: initialCamera() } });
    await decodeVisible(wrapper);
    const initialSignature = wrapper.get("[data-definition-role='committed']").attributes("data-definition-signature");
    await wrapper.setProps({ camera: { ...initialCamera(), zoom: 9, generation: 1 } });
    const pending = pendingImages(wrapper);
    const failed = pending.find((image) => image.attributes("data-tile-priority") === "visible")!;
    await failed.trigger("error");
    for (const image of pending) {
      if (image === failed || image.attributes("data-tile-priority") !== "visible") continue;
      Object.defineProperty(image.element, "decode", { configurable: true, value: () => Promise.resolve() });
      await image.trigger("load");
    }
    await flushCommit();
    expect(wrapper.get("[data-definition-role='committed']").attributes("data-definition-signature")).toBe(initialSignature);
    expect(wrapper.find("[data-definition-role='pending']").exists()).toBe(true);
    expect(metrics(wrapper).visibleTileErrors).toBe(1);
    expect(metrics(wrapper).commitsBeforeReady).toBe(0);
  });

  it("does not let an overscan error block visible tiles", async () => {
    const wrapper = mount(TransportMapBasemap, { props: { camera: initialCamera() } });
    await decodeVisible(wrapper);
    await wrapper.setProps({ camera: { ...initialCamera(), zoom: 9, generation: 1 } });
    const pending = pendingImages(wrapper);
    const failedOverscan = pending.find((image) => image.attributes("data-tile-priority") === "overscan");
    expect(failedOverscan).toBeDefined();
    await failedOverscan!.trigger("error");
    await decodeVisible(wrapper, "pending");
    await flushCommit();
    expect(wrapper.find("[data-definition-role='pending']").exists()).toBe(false);
    expect(wrapper.find("[data-definition-role='committed'] img[data-tile-state='error']").exists()).toBe(true);
    expect(metrics(wrapper).visibleTileErrors).toBe(0);
  });

  it("reanchors a same-signature definition without reloading URLs", async () => {
    const camera = initialCamera();
    const wrapper = mount(TransportMapBasemap, { props: { camera } });
    await decodeVisible(wrapper);
    const signature = wrapper.get("[data-definition-role='committed']").attributes("data-definition-signature");
    const urls = wrapper.findAll("[data-definition-role='committed'] img").map((image) => image.attributes("src"));
    await wrapper.setProps({
      camera: { ...camera, centerWorldX: camera.centerWorldX + 0.00001, zoom: camera.zoom, generation: 1 },
    });
    expect(wrapper.find("[data-definition-role='pending']").exists()).toBe(false);
    expect(wrapper.get("[data-definition-role='committed']").attributes("data-definition-signature")).toBe(signature);
    expect(wrapper.findAll("[data-definition-role='committed'] img").map((image) => image.attributes("src"))).toEqual(urls);
    expect(metrics(wrapper).desiredDefinitionChanges).toBe(1);
  });

  it("anchors the visible transform to the committed camera", async () => {
    const cameraA = initialCamera();
    const cameraB = { ...cameraA, centerWorldX: cameraA.centerWorldX + 0.0002, zoom: cameraA.zoom + 0.3, generation: 1 };
    const cameraC = { ...cameraA, centerWorldX: cameraA.centerWorldX + 0.0004, zoom: cameraA.zoom + 1, generation: 2 };
    const wrapper = mount(TransportMapBasemap, { props: { camera: cameraA } });
    await decodeVisible(wrapper);
    await wrapper.setProps({ camera: cameraB, interactionActive: true });
    await wrapper.setProps({ tileRefreshCamera: cameraC });
    const committed = wrapper.get("[data-definition-role='committed']");
    expect(committed.attributes("style")).toContain(definitionTransformStyle(cameraA, cameraB)?.transform ?? "");
    await decodeVisible(wrapper, "pending");
    await flushCommit();
    expect(wrapper.get("[data-definition-role='committed']").attributes("style")).toContain(
      definitionTransformStyle(cameraC, cameraB)?.transform ?? "",
    );
  });

  it("keeps a committed definition aligned while an idle replacement decodes", async () => {
    const cameraA = initialCamera();
    const cameraB = {
      ...cameraA,
      centerWorldX: cameraA.centerWorldX + 0.0004,
      centerWorldY: cameraA.centerWorldY + 0.0003,
      zoom: cameraA.zoom + 0.8,
      generation: 1,
    };
    const wrapper = mount(TransportMapBasemap, { props: { camera: cameraA } });
    await decodeVisible(wrapper);

    await wrapper.setProps({ camera: cameraB, interactionActive: false });

    expect(wrapper.find("[data-definition-role='pending']").exists()).toBe(true);
    expect(wrapper.get("[data-definition-role='committed']").attributes("style")).toContain(
      definitionTransformStyle(cameraA, cameraB)?.transform ?? "",
    );
  });

  it("does not apply late work after cleanup", async () => {
    const wrapper = mount(TransportMapBasemap, { props: { camera: initialCamera() } });
    await decodeVisible(wrapper);
    await wrapper.setProps({ camera: { ...initialCamera(), zoom: 9, generation: 1 } });
    const pending = pendingImages(wrapper).filter((image) => image.attributes("data-tile-priority") === "visible");
    const resolvers: Array<() => void> = [];
    for (const image of pending) {
      let resolveDecode: () => void = () => undefined;
      const decodePromise = new Promise<void>((resolve) => { resolveDecode = resolve; });
      Object.defineProperty(image.element, "decode", {
        configurable: true,
        value: () => decodePromise,
      });
      resolvers.push(resolveDecode);
      await image.trigger("load");
    }
    wrapper.unmount();
    for (const resolve of resolvers) resolve();
    await nextTick();
    expect(document.querySelector("[data-transport-map-basemap]")).toBeNull();
  });
});
