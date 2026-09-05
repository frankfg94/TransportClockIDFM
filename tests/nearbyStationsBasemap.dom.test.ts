import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import NearbyStationsBasemap from "../src/features/nearby-stations/NearbyStationsBasemap.vue";
import { createCamera } from "../src/features/transport-map/geo/camera";

describe("NearbyStationsBasemap", () => {
  it("keeps one fully decoded area cover mounted while the live camera dezooms", async () => {
    const referenceCamera = createCamera({
      centerWorldX: 0.5,
      centerWorldY: 0.5,
      viewportWidthCssPx: 900,
      viewportHeightCssPx: 560,
      zoom: 14.2,
    });
    const wrapper = mount(NearbyStationsBasemap, {
      props: {
        camera: referenceCamera,
        referenceCamera,
        bounds: { minX: 0.4998, minY: 0.4998, maxX: 0.5002, maxY: 0.5002 },
        sourceZoom: 14,
      },
      global: {
        stubs: {
          TransportMapBasemap: {
            props: ["camera", "layer", "basemapProvider", "basemapStyle", "contrast", "interactionActive"],
            template: "<div class='transport-map-basemap' data-live-basemap :data-basemap-provider='basemapProvider' />",
          },
        },
      },
    });

    const cover = wrapper.get("[data-nearby-basemap-cover]");
    const images = cover.findAll("img");
    expect(images.length).toBeGreaterThan(0);
    expect(cover.attributes("data-source-zoom")).toBe("14");
    expect(cover.attributes("data-ready")).toBe("false");
    expect(images.every((image) => image.attributes("src")?.includes("/14/"))).toBe(true);
    expect(wrapper.get("[data-live-basemap]").attributes("data-basemap-provider")).toBe("openstreetmap");

    for (const image of images.slice(0, -1)) await image.trigger("load");
    await flushPromises();
    expect(cover.attributes("data-ready")).toBe("false");

    await images.at(-1)!.trigger("load");
    await flushPromises();
    expect(cover.attributes("data-ready")).toBe("true");

    const initialTileStyles = images.map((image) => image.attributes("style"));
    const transform = wrapper.get(".nearby-stations-basemap__cover-transform");
    const initialTransform = transform.attributes("style");
    await wrapper.setProps({
      camera: {
        ...referenceCamera,
        centerWorldX: referenceCamera.centerWorldX + 0.00002,
        zoom: 13.9,
        generation: referenceCamera.generation + 1,
      },
      interactionActive: true,
    });

    expect(cover.findAll("img")).toHaveLength(images.length);
    expect(cover.findAll("img").map((image) => image.attributes("style"))).toEqual(initialTileStyles);
    expect(transform.attributes("style")).not.toBe(initialTransform);
    expect(cover.attributes("data-ready")).toBe("true");
  });

  it("audits the requested live tile definition 200 ms after a dezoom settles", async () => {
    vi.useFakeTimers();
    try {
      const referenceCamera = createCamera({
        centerWorldX: 0.5,
        centerWorldY: 0.5,
        viewportWidthCssPx: 900,
        viewportHeightCssPx: 560,
        zoom: 14.2,
      });
      const wrapper = mount(NearbyStationsBasemap, {
        props: {
          camera: referenceCamera,
          referenceCamera,
          bounds: { minX: 0.4998, minY: 0.4998, maxX: 0.5002, maxY: 0.5002 },
          sourceZoom: 14,
          interactionActive: true,
        },
        global: {
          stubs: {
            TransportMapBasemap: { template: "<div class='transport-map-basemap' />" },
          },
        },
      });

      await wrapper.setProps({
        camera: {
          ...referenceCamera,
          zoom: 13.9,
          generation: referenceCamera.generation + 1,
        },
      });
      await wrapper.setProps({ interactionActive: false });
      await vi.advanceTimersByTimeAsync(199);
      expect(wrapper.emitted("coverageAudit")).toBeUndefined();

      await vi.advanceTimersByTimeAsync(1);
      expect(wrapper.emitted("coverageAudit")?.[0]?.[0]).toMatchObject({
        ready: false,
        attempt: 1,
        delayMs: 200,
      });
      expect(wrapper.attributes("data-live-ready")).toBe("false");
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
