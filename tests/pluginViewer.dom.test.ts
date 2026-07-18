import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import type { TransportClockClientPlugin } from "@transport-clock/nuxt-plugin-host/types";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("../src/features/app-settings/appSettings");
  vi.doUnmock("../src/features/plugins/pluginRuntime");
});

describe("PluginViewer", () => {
  it("filters, paginates, toggles modes and opens settings on demand", async () => {
    const SettingsComponent = defineComponent({
      props: { disabled: Boolean, modelValue: null },
      template:
        '<label data-testid="synthetic-settings">Advanced settings <input :disabled="disabled" /></label>',
    });
    const CustomIcon = defineComponent({
      template: '<svg data-testid="synthetic-custom-icon"></svg>',
    });
    const plugins = createPlugins(23, SettingsComponent, CustomIcon);
    const actual = await import("../src/features/app-settings/appSettings");
    const settings = ref({
      ...actual.createDefaultAppSettings(),
      language: "fr" as const,
      pluginViewerMode: "grid" as const,
      plugins: Object.fromEntries(
        plugins.map((plugin) => [
          plugin.id,
          {
            enabled: true,
            value: plugin.settings?.defaultValue ?? null,
            version: plugin.settings?.version ?? 1,
          },
        ]),
      ),
    });
    const updateSettings = vi.fn((patch: Record<string, unknown>) => {
      settings.value = { ...settings.value, ...patch } as typeof settings.value;
    });

    vi.doMock("../src/features/plugins/pluginRuntime", () => ({
      getTransportClockPlugins: () => plugins,
    }));
    vi.doMock("../src/features/app-settings/appSettings", async (importActual) => ({
      ...(await importActual<
        typeof import("../src/features/app-settings/appSettings")
      >()),
      useAppSettings: () => ({
        settings,
        updateSettings,
        resetSettings: vi.fn(),
      }),
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            plugins: plugins.slice(0, 22).map((plugin) => ({
              apiVersion: plugin.apiVersion,
              id: plugin.id,
              version: plugin.version,
            })),
          }),
        ),
      ),
    );

    const { default: PluginViewer } = await import(
      "../src/features/app-settings/PluginViewer.vue"
    );
    const wrapper = mount(PluginViewer, { attachTo: document.body });
    await vi.waitFor(() => {
      expect(wrapper.findAll(".plugin-card")).toHaveLength(10);
    });

    expect(wrapper.get('[data-testid="plugin-catalog"]').classes()).toContain(
      "plugin-viewer__catalog--grid",
    );
    expect(wrapper.find('[data-testid="plugin-custom-icon"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="plugin-fallback-icon"]').exists()).toBe(true);
    expect(document.body.textContent).not.toContain("Advanced settings");
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("Compatible");
    });

    await wrapper.get('[aria-label="Aller à la page 2"]').trigger("click");
    expect(wrapper.findAll(".plugin-card")).toHaveLength(10);
    await wrapper.get('[aria-label="Aller à la page 3"]').trigger("click");
    expect(wrapper.findAll(".plugin-card")).toHaveLength(3);

    await wrapper.get('input[type="search"]').setValue("eclair");
    expect(wrapper.findAll(".plugin-card")).toHaveLength(1);
    expect(wrapper.text()).toContain("Éclair temps réel");
    expect(wrapper.find(".plugin-pagination").exists()).toBe(false);

    await wrapper.get('input[type="search"]').setValue("");
    await wrapper.get('[aria-label="Afficher en liste"]').trigger("click");
    expect(settings.value.pluginViewerMode).toBe("list");
    expect(wrapper.get('[data-testid="plugin-catalog"]').classes()).toContain(
      "plugin-viewer__catalog--list",
    );

    const customize = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Personnaliser"));
    await customize?.trigger("click");
    expect(document.body.textContent).toContain("Advanced settings");

    document.body
      .querySelector<HTMLButtonElement>('[aria-label="Fermer"]')
      ?.click();
    await wrapper.vm.$nextTick();
    expect(document.body.textContent).not.toContain("Advanced settings");

    const firstToggle = wrapper.get('.plugin-card input[type="checkbox"]');
    await firstToggle.setValue(false);
    const notification = wrapper.emitted("notify")?.at(-1)?.[0] as
      | { message: string; tone: string }
      | undefined;
    expect(notification?.tone).toBe("success");
    expect(notification?.message).toContain("désactivé");

    await customize?.trigger("click");
    expect(document.body.textContent).toContain(
      "Activez ce plugin pour modifier ses paramètres.",
    );
    expect(
      document.body.querySelector<HTMLInputElement>(
        '[data-testid="synthetic-settings"] input',
      )?.disabled,
    ).toBe(true);
  });

  it("renders a dedicated empty state when the build contains no plugin", async () => {
    const actual = await import("../src/features/app-settings/appSettings");
    const settings = ref({
      ...actual.createDefaultAppSettings(),
      language: "fr" as const,
      plugins: {},
    });
    vi.doMock("../src/features/plugins/pluginRuntime", () => ({
      getTransportClockPlugins: () => [],
    }));
    vi.doMock("../src/features/app-settings/appSettings", async (importActual) => ({
      ...(await importActual<
        typeof import("../src/features/app-settings/appSettings")
      >()),
      useAppSettings: () => ({
        settings,
        updateSettings: vi.fn(),
        resetSettings: vi.fn(),
      }),
    }));
    vi.stubGlobal("fetch", vi.fn());

    const { default: PluginViewer } = await import(
      "../src/features/app-settings/PluginViewer.vue"
    );
    const wrapper = mount(PluginViewer);

    expect(wrapper.text()).toContain("Aucun plugin n'est inclus dans ce build.");
    expect(wrapper.find('input[type="search"]').exists()).toBe(false);
  });
});

function createPlugins(
  count: number,
  settingsComponent: ReturnType<typeof defineComponent>,
  iconComponent: ReturnType<typeof defineComponent>,
): TransportClockClientPlugin[] {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return {
      apiVersion: 1,
      defaultEnabled: true,
      id: "synthetic-plugin-" + String(number).padStart(2, "0"),
      version: "1." + number + ".0",
      metadata: {
        author: number % 2 === 0 ? "Équipe Démo" : "Transport Clock",
        name: {
          en: number === 1 ? "Realtime Spark" : "Plugin " + number,
          fr: number === 1 ? "Éclair temps réel" : "Plugin " + number,
        },
        description: {
          en: "Synthetic plugin number " + number,
          fr: "Plugin synthétique numéro " + number,
        },
      },
      presentation:
        number === 1
          ? { accentColor: "#7c3aed", icon: iconComponent }
          : undefined,
      settings:
        number === 1
          ? {
              component: settingsComponent,
              defaultValue: { detail: true },
              normalize: (value) => value,
              version: 1,
            }
          : undefined,
    };
  });
}
