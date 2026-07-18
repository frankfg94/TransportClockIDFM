import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppRightPanel from "../src/components/AppRightPanel.vue";

function createMediaQueryList(matches: boolean): MediaQueryList {
  return {
    matches,
    media: "(max-width: 1100px)",
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

describe("AppRightPanel", () => {
  it("renders arbitrary content and closes from its controls and Escape", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue(
      createMediaQueryList(false),
    );
    const wrapper = mount(AppRightPanel, {
      props: {
        open: true,
        title: "Panneau générique",
        closeLabel: "Fermer le panneau",
        busy: true,
      },
      slots: {
        header: "<span data-testid='custom-header'>En-tête</span>",
        default: "<button data-testid='arbitrary-content'>Action</button>",
        footer: "<span data-testid='custom-footer'>Pied</span>",
      },
      attachTo: document.body,
    });

    const panel = wrapper.get('[data-testid="app-right-panel"]');
    expect(panel.attributes("role")).toBe("complementary");
    expect(panel.attributes("aria-busy")).toBe("true");
    expect(wrapper.get('[data-testid="custom-header"]').text()).toBe(
      "En-tête",
    );
    expect(wrapper.get('[data-testid="arbitrary-content"]').text()).toBe(
      "Action",
    );
    expect(wrapper.get('[data-testid="custom-footer"]').text()).toBe("Pied");

    await panel.trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("close")).toHaveLength(1);

    await wrapper.get('[data-testid="app-right-panel-close"]').trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(2);
  });

  it("acts as an overlay dialog and restores focus to its trigger", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue(createMediaQueryList(true));
    const trigger = document.createElement("button");
    trigger.textContent = "Ouvrir";
    document.body.append(trigger);
    trigger.focus();

    const wrapper = mount(AppRightPanel, {
      props: {
        open: false,
        title: "Panneau superposé",
      },
      attachTo: document.body,
    });

    await wrapper.setProps({ open: true });
    await nextTick();
    const panel = wrapper.get('[data-testid="app-right-panel"]');
    expect(panel.attributes("role")).toBe("dialog");
    expect(panel.attributes("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(panel.element);

    await wrapper.setProps({ open: false });
    await nextTick();
    expect(document.activeElement).toBe(trigger);
  });
});
