import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import GlobalMapLoadingCursor from "../src/features/line-map/GlobalMapLoadingCursor.vue";

describe("served city loading cursor", () => {
  it("starts at the click, follows the pointer and exposes real progress until hidden", async () => {
    const wrapper = mount(GlobalMapLoadingCursor, { props: { active: false, progress: null, label: "Chargement" } });
    const find = () => document.body.querySelector('[data-testid="global-map-loading-cursor"]')!;
    window.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 120, pointerType: "mouse" }));
    await wrapper.setProps({ active: true });
    expect(find().getAttribute("style")).toContain("left: 110px");
    expect(find().getAttribute("style")).toContain("top: 130px");
    expect(find().hasAttribute("aria-valuenow")).toBe(false);
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 160, pointerType: "mouse" }));
    // Tracking must not wait for Vue's pending render queue.
    expect(find().getAttribute("style")).toContain("left: 210px");
    await wrapper.setProps({ progress: 0 });
    expect(find().querySelector('.global-map-loading-cursor__arc')?.getAttribute('stroke-dasharray')).toBe('28 100');
    await wrapper.setProps({ progress: 0.5 });
    expect(find().getAttribute("aria-valuenow")).toBe("50");
    expect(find().querySelector(".global-map-loading-cursor__arc")?.getAttribute("stroke-dasharray")).toBe("54 100");
    await wrapper.setProps({ progress: 1 });
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 250, clientY: 200, pointerType: "mouse" }));
    expect(find().getAttribute("style")).toContain("left: 260px");
    expect(find().getAttribute("style")).toContain("top: 210px");
    expect(find().querySelector('.global-map-loading-cursor__rotor')).not.toBeNull();
    expect(find().querySelector('.global-map-loading-cursor__arc')?.getAttribute('stroke-dasharray')).toBe('80 100');
    expect(find().textContent?.trim()).toBe('');
    await wrapper.setProps({ active: false });
    expect(find()).toBeNull();
    wrapper.unmount();
  });

  it("uses a fixed indicator for touch and cleans up after unmount", async () => {
    const wrapper = mount(GlobalMapLoadingCursor, { props: { active: true, progress: 0.25, label: "Chargement", reduceMotion: true } });
    window.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 120, pointerType: "touch" }));
    await nextTick();
    const cursor = document.body.querySelector('[data-testid="global-map-loading-cursor"]')!;
    expect(cursor.classList.contains("global-map-loading-cursor--fixed")).toBe(true);
    expect(cursor.classList.contains("global-map-loading-cursor--still")).toBe(true);
    wrapper.unmount();
    expect(document.body.querySelector('[data-testid="global-map-loading-cursor"]')).toBeNull();
  });
});
