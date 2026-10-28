import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import GlobalMapFitLineButton from "../src/features/line-map/GlobalMapFitLineButton.vue";
import { createCamera, fitCameraToBounds, updateCamera } from "../src/features/transport-map/geo/camera";

const bounds = { minX: .50, minY: .34, maxX: .51, maxY: .35 };
const fitted = fitCameraToBounds(createCamera({ viewportWidthCssPx: 1280, viewportHeightCssPx: 720 }), bounds);

describe("floating line fit control", () => {
  it("appears for clipped or wholly off-screen lines and disappears after fitting", async () => {
    const wrapper = mount(GlobalMapFitLineButton, { props: { bounds, camera: fitted } });
    expect(wrapper.find("button").exists()).toBe(false);
    await wrapper.setProps({ camera: updateCamera(fitted, { zoom: fitted.zoom + 2 }) });
    expect(wrapper.get("button").text()).toMatch(/^(Recentrer|Recenter)$/);
    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("fit")).toHaveLength(1);
    await wrapper.setProps({ camera: updateCamera(fitted, { centerWorldX: .7 }) });
    expect(wrapper.find("button").exists()).toBe(true);
    await wrapper.setProps({ camera: fitted });
    expect(wrapper.find("button").exists()).toBe(false);
    wrapper.unmount();
  });

  it("stays hidden for the entire fit even while the line is still clipped", async () => {
    const clipped = updateCamera(fitted, { zoom: fitted.zoom + 2 });
    const wrapper = mount(GlobalMapFitLineButton, { props: { bounds, camera: clipped } });
    expect(wrapper.find("button").exists()).toBe(true);
    await wrapper.setProps({ fitting: true });
    expect(wrapper.find("button").exists()).toBe(false);
    await wrapper.setProps({ camera: updateCamera(clipped, { zoom: clipped.zoom - .1 }) });
    expect(wrapper.find("button").exists()).toBe(false);
    // An interrupted flight releases the control if the line remains clipped.
    await wrapper.setProps({ fitting: false });
    expect(wrapper.find("button").exists()).toBe(true);
    await wrapper.setProps({ fitting: true, camera: fitted });
    await wrapper.setProps({ fitting: false });
    expect(wrapper.find("button").exists()).toBe(false);
    wrapper.unmount();
  });

  it("responds to resize and new geometry without measuring layout", async () => {
    const wrapper = mount(GlobalMapFitLineButton, { props: { bounds, camera: fitted } });
    const layout = vi.spyOn(Element.prototype, "getBoundingClientRect");
    try {
      await wrapper.setProps({ camera: updateCamera(fitted, { viewportWidthCssPx: 100 }) });
      expect(wrapper.find("button").exists()).toBe(true);
      await wrapper.setProps({ camera: fitted, bounds: { ...bounds, maxY: .40 } });
      expect(wrapper.find("button").exists()).toBe(true);
      expect(layout).not.toHaveBeenCalled();
    } finally {
      layout.mockRestore();
      wrapper.unmount();
    }
  });
});
