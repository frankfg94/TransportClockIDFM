import { mount } from "@vue/test-utils";
import { Fragment, TransitionGroup, h, nextTick, ref } from "vue";
import { expect, it, vi } from "vitest";
import MapItemTransitionGroup from "../src/components/MapItemTransitionGroup";

it.each([false, true])("compares layout reads for 1000 markers (optimized: %s)", async (optimized) => {
  const offset = ref(0);
  const count = ref(1000);
  const wrapper = mount({
    setup: () => () => h(optimized ? MapItemTransitionGroup : TransitionGroup, { css: false }, {
      default: () => h(Fragment, Array.from({ length: count.value }, (_, id) =>
        h("button", { key: id, style: { left: `${id + offset.value}px` } }, String(id)),
      )),
    }),
  }, { global: { stubs: { transition: false, "transition-group": false } } });
  const first = wrapper.get("button").element;
  const measure = vi.spyOn(Element.prototype, "getBoundingClientRect");
  try {
    for (let frame = 1; frame <= 5; frame++) {
      offset.value = frame;
      await nextTick();
    }
    if (optimized) expect(measure).not.toHaveBeenCalled();
    else expect(measure.mock.calls.length).toBeGreaterThanOrEqual(5000);
    expect(wrapper.findAll("button")).toHaveLength(1000);
    expect(wrapper.get("button").element).toBe(first);
    expect(first.style.left).toBe("5px");
    count.value = 0;
    await nextTick();
    expect(wrapper.findAll("button")).toHaveLength(0);
  } finally {
    measure.mockRestore();
    wrapper.unmount();
  }
});

it("retains a removed marker while its CSS leave animation starts", async () => {
  const visible = ref(true);
  const wrapper = mount({
    setup: () => () => h(MapItemTransitionGroup, { leaveActiveClass: "marker-depop" }, {
      default: () => visible.value ? [h("button", { key: "place" }, "Place")] : [],
    }),
  }, { global: { stubs: { transition: false } } });
  visible.value = false;
  await nextTick();
  expect(wrapper.find("button").exists()).toBe(true);
  expect(wrapper.get("button").classes()).toContain("marker-depop");
  // No stylesheet in happy-dom: the normal transition completion removes it.
  await vi.waitFor(() => expect(wrapper.find("button").exists()).toBe(false));
  wrapper.unmount();
});
