import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResponsiveSidePanel from "../src/components/ResponsiveSidePanel.vue";

function createMediaQueryList(matches: boolean, media = "(max-width: 1100px)"): MediaQueryList {
  return {
    matches,
    media,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("ResponsiveSidePanel", () => {
  it("preserves parent-owned slot data while switching between desktop and mobile", async () => {
    const listeners = new Map<string, (event: MediaQueryListEvent) => void>();
    vi.spyOn(window, "matchMedia").mockImplementation(query => ({
      ...createMediaQueryList(false, query),
      addEventListener: vi.fn((_name, callback) => listeners.set(query, callback as (event: MediaQueryListEvent) => void)),
    }));
    const wrapper = mount(defineComponent({
      components: { ResponsiveSidePanel },
      setup: () => ({ text: ref("Valeur conservée") }),
      template: `<ResponsiveSidePanel open title="Fiche" mobile-sheet><input v-model="text" /></ResponsiveSidePanel>`,
    }), { attachTo: document.body });
    await flushPromises();
    expect(wrapper.find('[data-testid="responsive-side-panel"]').exists()).toBe(true);
    const mobileQuery = [...listeners.keys()].find(query => query.includes("720px"))!;
    listeners.get(mobileQuery)!({ matches: true } as MediaQueryListEvent);
    await flushPromises();
    expect(wrapper.find('[data-testid="draggable-bottom-sheet"]').exists()).toBe(true);
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("Valeur conservée");
    await wrapper.get("input").setValue("Modifiée sur mobile");
    listeners.get(mobileQuery)!({ matches: false } as MediaQueryListEvent);
    await flushPromises();
    expect(wrapper.find('[data-testid="responsive-side-panel"]').exists()).toBe(true);
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("Modifiée sur mobile");
    wrapper.unmount();
  });

  it("traps Tab only in the modal desktop overlay", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue(createMediaQueryList(true));
    const wrapper = mount(ResponsiveSidePanel, {
      props: { open: true, title: "Panneau superposé" },
      slots: { default: "<button data-testid='last-control'>Dernière action</button>" },
      attachTo: document.body,
    });
    await flushPromises();
    const first = wrapper.get('[data-testid="responsive-side-panel-close"]');
    const last = wrapper.get('[data-testid="last-control"]');
    (last.element as HTMLButtonElement).focus();
    await last.trigger("keydown", { key: "Tab" });
    expect(document.activeElement).toBe(first.element);
    await first.trigger("keydown", { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last.element);
    wrapper.unmount();
  });

  it("renders arbitrary content and closes from its controls and Escape", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue(createMediaQueryList(false));
    const wrapper = mount(ResponsiveSidePanel, {
      props: {
        open: true,
        title: "Panneau générique",
        closeLabel: "Fermer le panneau",
        busy: true,
      },
      attrs: { class: "custom-panel" },
      slots: {
        header: "<span data-testid='custom-header'>En-tête</span>",
        default: "<button data-testid='arbitrary-content'>Action</button>",
        footer: "<span data-testid='custom-footer'>Pied</span>",
      },
      attachTo: document.body,
    });

    const panel = wrapper.get('[data-testid="responsive-side-panel"]');
    expect(panel.classes()).toContain("custom-panel");
    expect(panel.attributes("role")).toBe("complementary");
    expect(panel.attributes("aria-busy")).toBe("true");
    expect(wrapper.get('[data-testid="custom-header"]').text()).toBe("En-tête");
    expect(wrapper.get('[data-testid="arbitrary-content"]').text()).toBe("Action");
    expect(wrapper.get('[data-testid="custom-footer"]').text()).toBe("Pied");

    const parentKeydown = vi.fn();
    document.body.addEventListener("keydown", parentKeydown);
    await panel.trigger("keydown", { key: "Escape" });
    document.body.removeEventListener("keydown", parentKeydown);
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(parentKeydown).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="responsive-side-panel-close"]').trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(2);
  });

  it("acts as an overlay dialog and restores focus to its trigger", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue(createMediaQueryList(true));
    const trigger = document.createElement("button");
    trigger.textContent = "Ouvrir";
    document.body.append(trigger);
    trigger.focus();

    const wrapper = mount(ResponsiveSidePanel, {
      props: {
        open: false,
        title: "Panneau superposé",
      },
      attachTo: document.body,
    });

    await wrapper.setProps({ open: true });
    await nextTick();
    const panel = wrapper.get('[data-testid="responsive-side-panel"]');
    expect(panel.attributes("role")).toBe("dialog");
    expect(panel.attributes("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(panel.element);

    await wrapper.setProps({ open: false });
    await nextTick();
    expect(document.activeElement).toBe(trigger);
  });

  it("ignores the opening tap click before enabling the tablet backdrop", async () => {
    vi.useFakeTimers();
    vi.spyOn(window, "matchMedia").mockImplementation((query) =>
      createMediaQueryList(query.includes("1100px"), query),
    );
    const wrapper = mount(ResponsiveSidePanel, {
      props: {
        open: false,
        title: "Panneau tablette",
      },
      attachTo: document.body,
    });

    await wrapper.setProps({ open: true });
    await nextTick();
    await wrapper.get(".responsive-side-panel__backdrop").trigger("click");
    expect(wrapper.emitted("close")).toBeUndefined();

    vi.advanceTimersByTime(351);
    await wrapper.get(".responsive-side-panel__backdrop").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it("supports the mobile bottom-sheet stages and drag gestures", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => createMediaQueryList(true, query));
    const wrapper = mount(ResponsiveSidePanel, {
      props: {
        open: true,
        title: "Fiche station",
        mobileSheet: true,
        mobileSheetStage: "mid",
      },
      attachTo: document.body,
    });
    await flushPromises();

    const panel = wrapper.get('[data-testid="draggable-bottom-sheet"]');
    const handle = wrapper.get('[data-testid="draggable-bottom-sheet-drag-handle"]');
    expect(panel.classes()).toContain("draggable-bottom-sheet--mid");
    expect(document.activeElement).toBe(panel.element);
    expect(panel.attributes("role")).toBe("complementary");
    expect(panel.attributes("aria-modal")).toBeUndefined();

    await handle.trigger("click");
    expect(wrapper.emitted("mobileSheetStageChange")?.at(-1)).toEqual(["full"]);

    await wrapper.setProps({ mobileSheetStage: "full" });
    await handle.trigger("pointerdown", {
      button: 0,
      clientY: 100,
      pointerId: 3,
      pointerType: "touch",
      isPrimary: true,
    });
    await handle.trigger("pointermove", {
      clientY: 180,
      pointerId: 3,
      pointerType: "touch",
      isPrimary: true,
    });
    await handle.trigger("pointerup", {
      clientY: 180,
      pointerId: 3,
      pointerType: "touch",
      isPrimary: true,
    });
    expect(wrapper.emitted("mobileSheetStageChange")?.at(-1)).toEqual(["mid"]);

    await wrapper.setProps({ mobileSheetStage: "peek" });
    await handle.trigger("pointerdown", {
      button: 0,
      clientY: 100,
      pointerId: 4,
      pointerType: "touch",
      isPrimary: true,
    });
    await handle.trigger("pointerup", {
      clientY: 180,
      pointerId: 4,
      pointerType: "touch",
      isPrimary: true,
    });
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
