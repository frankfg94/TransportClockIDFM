import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../src/features/app-settings/appSettings");
});

describe("SettingsPage", () => {
  it("renders the global feature flag controls with default values", async () => {
    vi.doMock("../src/features/app-settings/appSettings", async (importActual) => {
      const actual =
        await importActual<
          typeof import("../src/features/app-settings/appSettings")
        >();
      const { computed, ref } = await import("vue");
      const settings = ref(actual.createDefaultAppSettings());

      return {
        ...actual,
        useAppSettings: () => ({
          settings,
          effectiveMaxDeparturesPerDirection: computed(() =>
            actual.getEffectiveMaxDeparturesPerDirection(settings.value),
          ),
          updateSettings: (patch: Partial<typeof settings.value>) => {
            settings.value = actual.normalizeAppSettings({
              ...settings.value,
              ...patch,
            });
          },
          resetSettings: () => {
            settings.value = actual.createDefaultAppSettings();
          },
        }),
      };
    });

    const { default: SettingsPage } = await import(
      "../src/features/app-settings/SettingsPage.vue"
    );
    const wrapper = mount(SettingsPage);

    expect(wrapper.text()).toContain("Personnalisation du dashboard");
    expect(wrapper.text()).toContain("Accordion fermé");
    expect(wrapper.text()).toContain("Dernier passage");
    expect(wrapper.text()).toContain("Défaut actuel");
    expect(wrapper.text()).toContain("Apparence info trafic");
    expect(wrapper.text()).toContain("Style RATP compact");
    expect(wrapper.text()).toContain("Météo dynamique");
    expect(wrapper.text()).toContain("Alertes avec fond d'écran animé");
    expect(wrapper.text()).toContain("Mode test");
    expect(wrapper.text()).toContain("Aucun test");
    expect(wrapper.text()).toContain("Prévenir à l'avance");
    expect(wrapper.text()).toContain("Toute la journée");
    expect(wrapper.text()).toContain("Lieu météo");
    expect(wrapper.text()).toContain("Paris");
    expect(wrapper.text()).toContain("Afficher la minimap");
    expect(wrapper.text()).toContain("Wake lock");
    expect(wrapper.text()).toContain("Masquer la navigation");
  });
});
