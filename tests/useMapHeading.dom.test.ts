import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { compassHeading, smoothHeading, useMapHeading } from "../src/composables/useMapHeading";

describe("map heading", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("rejects unreliable bearings and accounts for screen rotation", () => {
    expect(compassHeading({ absolute: false, alpha: 12 } as DeviceOrientationEvent, 0)).toBeUndefined();
    expect(compassHeading({ webkitCompassHeading: 25, webkitCompassAccuracy: 90 } as unknown as DeviceOrientationEvent, 0)).toBeUndefined();
    expect(compassHeading({ webkitCompassHeading: 25, webkitCompassAccuracy: 5 } as unknown as DeviceOrientationEvent, 90)).toBe(115);
    expect(compassHeading({ absolute: true, alpha: 270 } as DeviceOrientationEvent, 90)).toBe(180);
    expect(smoothHeading(359, 3)).toBe(360);
  });
  it("expires stale headings and removes listeners", () => {
    vi.useFakeTimers();
    vi.stubGlobal("DeviceOrientationEvent", class {});
    let state!: ReturnType<typeof useMapHeading>;
    const wrapper = mount(defineComponent({ setup() { state = useMapHeading(ref(true)); return () => h("div"); } }));
    const event = new Event("deviceorientationabsolute");
    Object.defineProperties(event, { absolute: { value: true }, alpha: { value: 270 } });
    window.dispatchEvent(event);
    expect(state.heading.value).toBe(90);
    vi.advanceTimersByTime(5001);
    expect(state.heading.value).toBeUndefined();
    wrapper.unmount();
    window.dispatchEvent(event);
    expect(state.heading.value).toBeUndefined();
  });
  it("keeps the marker without a heading when permission is denied", async () => {
    vi.stubGlobal("DeviceOrientationEvent", class { static requestPermission = vi.fn().mockResolvedValue("denied"); });
    let state!: ReturnType<typeof useMapHeading>;
    const wrapper = mount(defineComponent({ setup() { state = useMapHeading(ref(true)); return () => h("div"); } }));
    await state.requestPermission();
    expect(state.heading.value).toBeUndefined();
    wrapper.unmount();
  });
});
