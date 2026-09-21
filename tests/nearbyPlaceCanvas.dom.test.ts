import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import NearbyPlaceCanvas from "../src/features/nearby-stations/NearbyPlaceCanvas.vue";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { lonLatToWorld, worldScaleAtZoom } from "../src/features/transport-map/geo/coordinateKernel";
import { nearbyPlacePop } from "../src/features/nearby-stations/nearbyPlacePop";
import type { NearbyPlace } from "../src/features/nearby-stations/nearbyPlaces";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("nearby place canvas scheduling", () => {
  it("reuses icons and hit targets during pan, retains pop-out, and stops drawing when settled", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const frames = new Map<number, FrameRequestCallback>();
    let sequence = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const tick = (time: number) => {
      now = time;
      const scheduled = [...frames.values()]; frames.clear();
      scheduled.forEach(callback => callback(now));
    };
    let images = 0;
    vi.stubGlobal("Image", class {
      onload?: () => void;
      set src(_value: string) { images++; this.onload?.(); }
    });
    const drawImage = vi.fn();
    const context = { drawImage, scale: vi.fn(), setTransform: vi.fn(), clearRect: vi.fn(),
      beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const styles = vi.spyOn(window, "getComputedStyle");
    const world = lonLatToWorld({ lon: 2.35, lat: 48.85 });
    const camera = createCamera({ centerWorldX: world.x, centerWorldY: world.y, zoom: 15, viewportWidthCssPx: 1000, viewportHeightCssPx: 800 });
    const places: NearbyPlace[] = Array.from({ length: 1500 }, (_, i) => ({
      id: `place:${i}`, name: `Shop ${i}`, lon: 2.35 + i % 30 * .0001, lat: 48.85 + Math.floor(i / 30) * .00005,
      category: "shop", kind: "supermarket", distanceMeters: 100,
    }));
    const wrapper = mount(NearbyPlaceCanvas, { props: { places, camera, radius: 600, city: false, preview: false, showNames: false, reducedMotion: false } });
    try {
      expect(wrapper.findAll("button")).toHaveLength(1500);
      tick(0); tick(300);
      expect(frames.size).toBe(1);
      tick(1000); tick(1016);
      expect(frames.size).toBe(0);
      expect(images).toBe(1); // 1 category sprite, not 1 SVG decode per place.
      const first = wrapper.get("button").element;
      const firstStyle = first.getAttribute("style");
      const styleReads = styles.mock.calls.length;
      drawImage.mockClear();
      for (let i = 1; i <= 10; i++) {
        await wrapper.setProps({ camera: { ...camera, centerWorldX: world.x + i / worldScaleAtZoom(camera.zoom) } });
        tick(1016 + i * 16);
      }
      expect(wrapper.get("button").element).toBe(first);
      expect(first.getAttribute("style")).toBe(firstStyle);
      expect(styles.mock.calls.length).toBe(styleReads);
      expect(images).toBe(1);
      expect(frames.size).toBe(0);
      expect(drawImage).toHaveBeenCalledTimes(15000);
      await wrapper.get("button").trigger("click");
      expect(wrapper.emitted("selectPlace")?.at(-1)).toEqual(["place:0"]);
      await wrapper.setProps({ places: [] });
      expect(wrapper.findAll("button")).toHaveLength(0);
      drawImage.mockClear();
      tick(1200);
      expect(drawImage).toHaveBeenCalledTimes(1500); // Departing icons still animate.
      tick(1650);
      expect(frames.size).toBe(0);
    } finally { wrapper.unmount(); }
  });

  it("keeps the original pop overshoot and fade endpoints", () => {
    expect(nearbyPlacePop(-100).opacity).toBeCloseTo(0);
    expect(nearbyPlacePop(294).scale).toBeCloseTo(1.06);
    expect(nearbyPlacePop(420).scale).toBeCloseTo(1);
    expect(nearbyPlacePop(0, true).opacity).toBeCloseTo(1);
    expect(nearbyPlacePop(420, true).opacity).toBeCloseTo(0);
  });

  it("uses one accessible canvas target on coarse pointers and paints only the viewport", async () => {
    const frames = new Map<number, FrameRequestCallback>();
    let sequence = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++sequence, callback);
      return sequence;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const tick = (time: number) => {
      const scheduled = [...frames.values()];
      frames.clear();
      scheduled.forEach((callback) => callback(time));
    };
    let imageCount = 0;
    vi.stubGlobal("Image", class {
      onload?: () => void;
      set src(_value: string) {
        imageCount += 1;
        this.onload?.();
      }
    });
    const drawImage = vi.fn();
    const context = {
      drawImage,
      scale: vi.fn(),
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);

    const center = { lon: 2.35, lat: 48.85 };
    const world = lonLatToWorld(center);
    const camera = createCamera({
      centerWorldX: world.x,
      centerWorldY: world.y,
      zoom: 15,
      viewportWidthCssPx: 300,
      viewportHeightCssPx: 200,
    });
    const places: NearbyPlace[] = [
      { id: "place:center", name: "Centre", ...center, category: "shop", kind: "bakery", distanceMeters: 20 },
      { id: "place:far", name: "Hors écran", lon: 2.7, lat: 49.1, category: "shop", kind: "bakery", distanceMeters: 20 },
    ];
    const wrapper = mount(NearbyPlaceCanvas, {
      props: {
        places,
        camera,
        radius: 600,
        city: false,
        preview: false,
        showNames: false,
        reducedMotion: false,
        canvasHitTesting: true,
      },
    });

    try {
      expect(wrapper.findAll("button")).toHaveLength(0);
      expect(wrapper.get("canvas").attributes("role")).toBe("img");
      tick(0);
      expect(imageCount).toBe(1);
      expect(drawImage).toHaveBeenCalledTimes(1); // one visible POI; the mocked sprite image is not baked through drawImage

      await wrapper.get("canvas").trigger("click", { clientX: 150, clientY: 100 });
      expect(wrapper.emitted("selectPlace")?.at(-1)).toEqual(["place:center"]);

      wrapper.unmount();
      tick(16);
      expect(frames.size).toBe(0);
    } finally {
      wrapper.unmount();
    }
  });
});
