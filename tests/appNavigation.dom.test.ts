import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
  vi.doUnmock("#imports");
  vi.doUnmock("../src/features/app-settings/appSettings");
});

describe("AppNavigation", () => {
  it("keeps Info trafic visible and secondary pages in the triple-dot menu", async () => {
    vi.useFakeTimers();
    vi.doMock("#imports", () => ({
      useRoute: () => ({ path: "/settings" }),
    }));
    vi.doMock("../src/features/app-settings/appSettings", async (importActual) => {
      const actual =
        await importActual<
          typeof import("../src/features/app-settings/appSettings")
        >();
      const { ref } = await import("vue");
      const settings = ref({
        ...actual.createDefaultAppSettings(),
        navigationAutoHide: "1m" as const,
      });

      return {
        ...actual,
        useAppSettings: () => ({
          settings,
          effectiveMaxDeparturesPerDirection: ref(undefined),
          updateSettings: vi.fn(),
          resetSettings: vi.fn(),
        }),
      };
    });

    const { default: AppNavigation } = await import(
      "../src/features/app-settings/AppNavigation.vue"
    );
    const wrapper = mount(AppNavigation, {
      global: {
        stubs: {
          NuxtLink: {
            props: ["to"],
            template: '<a :href="to"><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Stations");
    expect(wrapper.text()).toContain("Info trafic");
    expect(wrapper.text()).not.toContain("Paramètres");
    expect(wrapper.text()).not.toContain("Health");

    await wrapper.get("button.app-navigation__menu-button").trigger("click");
    expect(wrapper.text()).toContain("Info trafic");
    expect(wrapper.text()).toContain("Paramètres");
    expect(wrapper.text()).toContain("Health");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(wrapper.classes()).toContain("app-navigation--hidden");
    expect(wrapper.text()).not.toContain("Health");

    window.dispatchEvent(new Event("pointermove"));
    await wrapper.vm.$nextTick();
    expect(wrapper.classes()).not.toContain("app-navigation--hidden");
  });
});
