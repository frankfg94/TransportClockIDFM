import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import DraggableBottomSheet from "../src/components/DraggableBottomSheet.vue";

const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function sheet(options: Parameters<typeof mount<typeof DraggableBottomSheet>>[1] = {}) {
  const wrapper = mount(DraggableBottomSheet, { ...options, attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
}

describe("DraggableBottomSheet", () => {
  it("works with only a default slot, without a viewport or application-specific props", async () => {
    const matchMedia = vi.spyOn(window, "matchMedia");
    const wrapper = sheet({ slots: { default: "<button>Contenu arbitraire</button>" } });
    await nextTick();
    expect(wrapper.get('[data-testid="draggable-bottom-sheet"]').attributes("aria-label")).toBe("Panneau");
    expect(wrapper.text()).toContain("Contenu arbitraire");
    expect(matchMedia).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="draggable-bottom-sheet-drag-handle"]').trigger("click");
    expect(wrapper.get("aside").classes()).toContain("draggable-bottom-sheet--full");
    await wrapper.get('[data-testid="draggable-bottom-sheet-drag-handle"]').trigger("click");
    expect(wrapper.get("aside").classes()).toContain("draggable-bottom-sheet--mid");
    await wrapper.get('[data-testid="draggable-bottom-sheet-close"]').trigger("click");
    expect(wrapper.find("aside").exists()).toBe(false);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("forwards attributes and supports header, content and footer slots", async () => {
    const wrapper = sheet({
      props: { title: "Titre accessible", closeLabel: "Fermer la fiche", busy: true },
      attrs: { class: "custom-sheet", "data-owner": "caller" },
      slots: { header: "<h2>En-tête libre</h2>", default: "<input aria-label='Recherche libre' />", footer: "<button>Terminer</button>" },
    });
    expect(wrapper.get("aside").classes()).toContain("custom-sheet");
    expect(wrapper.get("aside").attributes("data-owner")).toBe("caller");
    expect(wrapper.get("aside").attributes("aria-busy")).toBe("true");
    expect(wrapper.get("h2").text()).toBe("En-tête libre");
    expect(wrapper.get("footer").text()).toBe("Terminer");
    expect(wrapper.get('[data-testid="draggable-bottom-sheet-close"]').attributes("aria-label")).toBe("Fermer la fiche");
  });

  it("retains the slotted DOM when the stage changes and permits a completely custom header", async () => {
    const wrapper = sheet({ props: { showCloseButton: false }, slots: { default: "<input />" } });
    const input = wrapper.get("input");
    await input.setValue("Conserver ma saisie");
    await wrapper.get('[data-testid="draggable-bottom-sheet-drag-handle"]').trigger("click");
    expect(wrapper.get("input").element).toBe(input.element);
    expect((input.element as HTMLInputElement).value).toBe("Conserver ma saisie");
    expect(wrapper.find("header").exists()).toBe(false);
  });

  it("closes on Escape, restores focus and isolates keys from the surrounding map", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const parentKeydown = vi.fn();
    document.body.addEventListener("keydown", parentKeydown);
    const wrapper = sheet();
    await nextTick();
    expect(document.activeElement).toBe(wrapper.get("aside").element);
    await wrapper.get("aside").trigger("keydown", { key: "ArrowDown" });
    await wrapper.get("aside").trigger("keydown", { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
    expect(wrapper.emitted("update:open")?.at(-1)).toEqual([false]);
    expect(parentKeydown).not.toHaveBeenCalled();
    document.body.removeEventListener("keydown", parentKeydown);
  });

  it("moves through the stages with touch pointers and suppresses the trailing drag click", async () => {
    vi.useFakeTimers();
    const wrapper = sheet();
    const handle = wrapper.get('[data-testid="draggable-bottom-sheet-drag-handle"]');
    const drag = async (from: number, to: number) => {
      await handle.trigger("pointerdown", { pointerId: 4, pointerType: "touch", isPrimary: true, clientY: from });
      await handle.trigger("pointermove", { pointerId: 4, pointerType: "touch", clientY: to });
      await handle.trigger("pointerup", { pointerId: 4, pointerType: "touch", clientY: to });
    };
    await drag(200, 100);
    expect(wrapper.get("aside").classes()).toContain("draggable-bottom-sheet--full");
    await handle.trigger("click");
    expect(wrapper.get("aside").classes()).toContain("draggable-bottom-sheet--full");
    vi.advanceTimersByTime(121);
    await drag(100, 200);
    expect(wrapper.get("aside").classes()).toContain("draggable-bottom-sheet--mid");
    await drag(100, 200);
    expect(wrapper.get("aside").classes()).toContain("draggable-bottom-sheet--peek");
    await drag(100, 200);
    expect(wrapper.find("aside").exists()).toBe(false);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("ignores unrelated pointers and abandons a cancelled gesture", async () => {
    const wrapper = sheet();
    const handle = wrapper.get('[data-testid="draggable-bottom-sheet-drag-handle"]');
    await handle.trigger("pointerdown", { pointerId: 1, pointerType: "touch", isPrimary: true, clientY: 100 });
    await handle.trigger("pointermove", { pointerId: 2, clientY: 220 });
    expect(wrapper.get("aside").attributes("style")).toContain("0px");
    await handle.trigger("pointercancel", { pointerId: 1 });
    await handle.trigger("pointerup", { pointerId: 1, clientY: 220 });
    expect(wrapper.emitted("update:stage")).toBeUndefined();
    expect(wrapper.find("aside").classes()).not.toContain("draggable-bottom-sheet--dragging");
  });

  it("allows a controlled stage and guards the optional backdrop against the opening tap", async () => {
    vi.useFakeTimers();
    const wrapper = sheet({ props: { open: false, stage: "peek", backdrop: true } });
    await wrapper.setProps({ open: true });
    await wrapper.get(".draggable-bottom-sheet__backdrop").trigger("click");
    expect(wrapper.emitted("close")).toBeUndefined();
    await wrapper.get('[data-testid="draggable-bottom-sheet-drag-handle"]').trigger("click");
    expect(wrapper.emitted("update:stage")?.at(-1)).toEqual(["full"]);
    await wrapper.setProps({ stage: "full" });
    expect(wrapper.get("aside").classes()).toContain("draggable-bottom-sheet--full");
    vi.advanceTimersByTime(351);
    await wrapper.get(".draggable-bottom-sheet__backdrop").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
  it("supports custom snap heights, continuous resize, cancellation and a persistent collapsed stage", async () => {
    vi.useFakeTimers();
    const wrapper = sheet({ props: { stage: "peek", snapHeights: () => ({ peek: 180, mid: 400, full: 680 }), cycleStages: true, dismissOnSwipe: false, showCloseButton: false, unwrappedContent: true } });
    const handle = wrapper.get('[data-testid="draggable-bottom-sheet-drag-handle"]');
    await handle.trigger("click");
    await wrapper.setProps({ stage: "mid" });
    expect(wrapper.get("aside").attributes("style")).toContain("400px");
    await handle.trigger("pointerdown", { pointerId: 7, isPrimary: true, pointerType: "touch", clientY: 500 });
    await handle.trigger("pointermove", { pointerId: 7, clientY: 220 });
    expect(wrapper.get("aside").attributes("style")).toContain("680px");
    expect(wrapper.emitted("resize")?.at(-1)).toEqual([680, true]);
    await handle.trigger("pointerup", { pointerId: 7, clientY: 220 });
    expect(wrapper.emitted("update:stage")?.at(-1)).toEqual(["full"]);
    expect(wrapper.emitted("resize")?.at(-1)).toEqual([680, false]);
    await wrapper.setProps({ stage: "peek" });
    vi.advanceTimersByTime(121);
    await handle.trigger("pointerdown", { pointerId: 8, isPrimary: true, clientY: 100 });
    await handle.trigger("pointermove", { pointerId: 8, clientY: 500 });
    await handle.trigger("pointerup", { pointerId: 8, clientY: 500 });
    expect(wrapper.emitted("close")).toBeUndefined();
    vi.advanceTimersByTime(121);
    await handle.trigger("pointerdown", { pointerId: 9, isPrimary: true, clientY: 500 });
    await handle.trigger("pointermove", { pointerId: 9, clientY: 100 });
    await handle.trigger("pointercancel", { pointerId: 9 });
    expect(wrapper.emitted("resize")?.at(-1)).toEqual([180, false]);
    expect(wrapper.get("aside").attributes("style")).toContain("180px");
  });

  it("disables the sheet on desktop without remounting its slotted content", async () => {
    const wrapper = sheet({ props: { enabled: false }, slots: { default: "<input />" } });
    const input = wrapper.get("input");
    await input.setValue("Valeur conservée");
    expect(wrapper.find('[data-testid="draggable-bottom-sheet-drag-handle"]').exists()).toBe(false);
    expect(wrapper.get("aside").classes()).not.toContain("draggable-bottom-sheet");
    await wrapper.setProps({ enabled: true });
    expect(wrapper.get("input").element).toBe(input.element);
    expect((input.element as HTMLInputElement).value).toBe("Valeur conservée");
    expect(wrapper.find('[data-testid="draggable-bottom-sheet-drag-handle"]').exists()).toBe(true);
  });

});
