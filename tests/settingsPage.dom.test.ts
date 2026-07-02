import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { transitBoards } from "../src/config/transitBoards";
import {
  createDefaultTransitPresetState,
  createTransitPlace,
  saveTransitPresetState,
} from "../src/storage/transitPreferences";

afterEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("../src/features/app-settings/appSettings");
  vi.doUnmock("../src/features/mobile-release");
});

describe("SettingsPage", () => {
  it("renders the global feature flag controls with default values", async () => {
    mockMobileReleaseCard();
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
    expect(wrapper.text()).toContain("Activer le cache backend");
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
    expect(wrapper.text()).toContain("Dashboards enregistrés");
    expect(wrapper.text()).toContain("Lieu par défaut");
    expect(wrapper.text()).toContain("Sélecteur de lieux");
    expect(wrapper.text()).toContain("Lieu à configurer");
    expect(wrapper.text()).toContain("Maison");
    expect(wrapper.text()).toContain("Affichage des stations");
    expect(wrapper.text()).toContain("Visible directement");

    await wrapper
      .get('[aria-label="Emplacement des boutons de stations"]')
      .trigger("click");
    expect(wrapper.text()).toContain("Dans le menu contextuel");
    expect(wrapper.text()).toContain("Accordion fermé");
    expect(wrapper.text()).toContain("Prochain passage");
    expect(wrapper.text()).toContain("Défaut actuel");
    expect(wrapper.text()).toContain("Apparence info trafic");
    expect(wrapper.text()).toContain("Style RATP compact");
    expect(wrapper.text()).toContain("Page info trafic");
    expect(wrapper.text()).toContain("Mode par défaut");
    expect(wrapper.text()).toContain("Optimisé");
    expect(wrapper.text()).toContain("Toutes les lignes");
    expect(wrapper.text()).toContain("Détection intelligente sur le schéma");
    expect(wrapper.text()).toContain("Météo dynamique");
    expect(wrapper.text()).toContain("Alertes avec fond d'écran animé");
    expect(wrapper.text()).toContain("Mode test");
    expect(wrapper.text()).toContain("Aucun test");
    expect(wrapper.text()).toContain("Prévenir à l'avance");
    expect(wrapper.text()).toContain("Toute la journée");
    expect(wrapper.text()).toContain("Lieu météo");
    expect(wrapper.text()).toContain("Paris");
    expect(wrapper.text()).toContain("Afficher le ressenti");
    expect(wrapper.text()).toContain("Afficher la minimap");
    expect(wrapper.text()).toContain("Espacement vertical compact");
    expect(wrapper.text()).toContain("258 px");
    expect(wrapper.text()).toContain("Courbes arrondies");
    expect(wrapper.text()).toContain("Ecart des fourches compactes");
    expect(wrapper.text()).toContain("158 px");
    expect(wrapper.text()).toContain("Espacement realiste");
    expect(wrapper.text()).toContain("Coefficient min");
    expect(wrapper.text()).toContain("Coefficient max");
    expect(wrapper.text()).toContain(
      "Limiter les lignes fantômes aux modes structurants",
    );
    expect(wrapper.text()).toContain("Wake lock");
    expect(wrapper.text()).toContain("Masquer la navigation");

    const backendCacheToggle = wrapper
      .findAll("label.settings-toggle")
      .find((label) => label.text().includes("Activer le cache backend"));

    expect(backendCacheToggle?.text()).not.toContain(
      "Le chargement des correspondances sera très lent",
    );
    await backendCacheToggle?.find("input").setValue(false);

    const apparentTemperatureToggle = wrapper
      .findAll("label.settings-toggle")
      .find((label) => label.text().includes("Afficher le ressenti"));

    if (!apparentTemperatureToggle) {
      throw new Error("Missing apparent temperature setting");
    }

    const apparentTemperatureInput = apparentTemperatureToggle.find("input");
    expect(
      (apparentTemperatureInput.element as HTMLInputElement).checked,
    ).toBe(true);
    await apparentTemperatureInput.setValue(false);
    expect(
      (apparentTemperatureInput.element as HTMLInputElement).checked,
    ).toBe(false);

    await wrapper.get('[aria-label="Mode du sélecteur de lieux"]').trigger("click");
    expect(wrapper.text()).toContain("Dropdown + swipe");
    expect(wrapper.text()).toContain("Dropdown seulement");
    expect(wrapper.text()).toContain("Swipe seulement");
    expect(backendCacheToggle?.text()).toContain(
      "Le chargement des correspondances sera très lent tant que le cache backend est désactivé.",
    );
  });

  it("shows a temporary notification after clearing bundles or resetting settings", async () => {
    vi.useFakeTimers();
    mockMobileReleaseCard();
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

  it("manages presets from the settings modal", async () => {
    mockMobileReleaseCard();
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

    const initialState = createTransitPlace(
      createDefaultTransitPresetState(transitBoards),
      "Studio",
      transitBoards,
    ).state;
    saveTransitPresetState(initialState);

    const { default: SettingsPage } = await import(
      "../src/features/app-settings/SettingsPage.vue"
    );
    const wrapper = mount(SettingsPage, { attachTo: document.body });

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Gérer les lieux"))
      ?.trigger("click");

    expect(document.body.textContent).toContain("Lieux enregistrés");
    expect(document.body.textContent).toContain("Studio");
    expect(
      document.body.querySelector('[aria-label="Supprimer Maison"]'),
    ).toBeNull();

    document
      .body
      .querySelector<HTMLButtonElement>('[aria-label="Renommer Studio"]')
      ?.click();
    await wrapper.vm.$nextTick();

    const input = document.body.querySelector<HTMLInputElement>(
      ".place-name-form input",
    );
    expect(input).toBeTruthy();
    input!.value = "Sport";
    input!.dispatchEvent(new Event("input"));
    await wrapper.vm.$nextTick();

    Array.from(document.body.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Renommer"))
      ?.click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain("Sport");
    expect(document.body.textContent).not.toContain("Studio");

    document
      .body
      .querySelector<HTMLButtonElement>('[aria-label="Supprimer Sport"]')
      ?.click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).not.toContain("Sport");
  });
});

function mockMobileReleaseCard(): void {
  vi.doMock("../src/features/mobile-release", () => ({
    MobileReleaseCard: defineComponent({
      template: "<section />",
    }),
  }));
}
