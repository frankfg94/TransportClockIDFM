import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
    expect(wrapper.text()).toContain("Expiration des bundles");
    expect(wrapper.text()).toContain("15 jours");
    expect(wrapper.text()).toContain("Chargement des correspondances");
    expect(wrapper.text()).toContain("Auto");
    expect(wrapper.text()).toContain("Concurrence des bundles");
    expect(wrapper.text()).toContain("1 appel à la fois");
    expect(wrapper.text()).toContain("Espacement des appels bundles");
    expect(wrapper.text()).toContain("Aucun delai");
    expect(wrapper.text()).toContain("Bundles de correspondances");
    expect(wrapper.text()).toContain("View bundles");
    expect(wrapper.text()).toContain("Clear bundles");
    expect(wrapper.text()).toContain("Accordion fermé");
    expect(wrapper.text()).toContain("Dernier passage");
    expect(wrapper.text()).toContain("Défaut actuel");
    expect(wrapper.text()).toContain("Apparence info trafic");
    expect(wrapper.text()).toContain("Style RATP compact");
    expect(wrapper.text()).toContain("Page info trafic");
    expect(wrapper.text()).toContain("Mode par défaut");
    expect(wrapper.text()).toContain("Optimisé");
    expect(wrapper.text()).toContain("Toutes les lignes");
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

  it("shows a temporary notification after clearing bundles or resetting settings", async () => {
    vi.useFakeTimers();
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ bundles: [] }))),
    );
    const wrapper = mount(SettingsPage, { attachTo: document.body });

    const clearBundlesButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Clear bundles");

    expect(clearBundlesButton).toBeTruthy();
    await clearBundlesButton?.trigger("click");
    expect(document.body.textContent).toContain("Bundles supprimés");

    await vi.advanceTimersByTimeAsync(5_000);
    expect(document.body.textContent).not.toContain("Bundles supprimés");

    const resetButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("initialiser"));

    expect(resetButton).toBeTruthy();
    await resetButton?.trigger("click");
    expect(document.body.textContent).toContain("Paramètres réinitialisés");
  });
});
