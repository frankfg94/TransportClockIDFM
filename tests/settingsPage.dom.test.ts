import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { transitBoards } from "../src/config/transitBoards";
import {
  createDefaultTransitPresetState,
  createTransitPlace,
  saveTransitPresetState,
} from "../src/storage/transitPreferences";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../src/features/transport-map/config/globalTransportPlanConfig";
import type { GlobalMapManifest } from "../src/features/transport-map/contracts/manifest";

vi.mock("nuxt/app", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const globalMapManifestFixture = {
  dataVersion: "test-v1",
  generatedAt: "2026-08-02T23:34:00.000Z",
  counts: {
    lines: 3,
    stations: 12,
    paths: 5,
    vertices: 10,
    chunks: 2,
    entrances: 0,
    bikes: 0,
  },
  files: {
    bootstrap: { bytes: 1024 },
    catalog: { bytes: 2048 },
    regional: { bytes: 4096 },
    regionalBus: { bytes: 512 },
    linePalette: { bytes: 256 },
    chunks: [{ bytes: 8192 }],
  },
  palette: { missingCount: 1 },
  warnings: [
    { code: "gtfs-topology-edge-missing", count: 1 },
    { code: "gtfs-station-coordinate-corrected", count: 2 },
    { code: "fallback-geometry", count: 3 },
    { code: "line-color-palette-missing", count: 1 },
  ],
} as unknown as GlobalMapManifest;

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
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/api/ridership/status")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              available: true,
              version: "2024-local-fixture",
              actualYears: [2024],
              source: { kind: "directory", location: "local-fixture" },
              counts: {
                lines: 2011,
                stations: 31778,
                lineMeasures: 40,
                stationMeasures: 655,
                availableLines: 40,
                availableStations: 655,
              },
            }),
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => globalMapManifestFixture,
        };
      }),
    );
    vi.doMock("../src/features/app-settings/appSettings", async (importActual) => {
      const actual =
        await importActual<
          typeof import("../src/features/app-settings/appSettings")
        >();
      const { computed, ref } = await import("vue");
      const settings = ref(actual.normalizeAppSettings({
        ...actual.createDefaultAppSettings(),
        language: "fr",
      }));

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
            settings.value = actual.normalizeAppSettings({
              ...actual.createDefaultAppSettings(),
              language: "fr",
            });
          },
        }),
      };
    });

    const { default: SettingsPage } = await import(
      "../src/features/app-settings/SettingsPage.vue"
    );
    const wrapper = mount(SettingsPage);
    expect(
      wrapper
        .findAll(".settings-panel__trigger")
        .every((trigger) => trigger.attributes("aria-expanded") === "false"),
    ).toBe(true);
    for (const trigger of wrapper.findAll(".settings-panel__trigger")) {
      await trigger.trigger("click");
    }
    await flushPromises();

    expect(wrapper.text()).toContain("Personnalisation du dashboard");
    const networkControl = wrapper.get("[data-network-concurrency-setting]");
    expect(networkControl.text()).toContain("Automatique (UNLIMITED_NETWORK)");
    for (const label of ["Illimités", "Limités à 4 appels", "Automatique (UNLIMITED_NETWORK)"]) {
      await networkControl.get("[role='combobox']").trigger("click");
      const option = networkControl.findAll("[role='option']").find((entry) => entry.text() === label);
      expect(option).toBeDefined();
      await option!.trigger("mousedown");
      expect(networkControl.get("[role='combobox']").text()).toContain(label);
    }
    expect(wrapper.find("[data-traffic-cache-settings]").exists()).toBe(true);
    expect(wrapper.find("[data-traffic-cache-refresh]").exists()).toBe(true);
    expect(wrapper.text()).toContain("Expiration des bundles");
    expect(wrapper.text()).toContain("Activer le cache backend");
    expect(wrapper.text()).toContain("15 jours");
    expect(wrapper.text()).toContain("Chargement des correspondances");
    expect(wrapper.text()).toContain("Mode de correspondance");
    expect(wrapper.text()).toContain("Auto");
    const transferResolverControl = wrapper.get(
      "[data-settings-transfer-resolver]",
    );
    expect(transferResolverControl.text()).toContain("Automatique");
    await transferResolverControl.get("[role='combobox']").trigger("click");
    const nearbyResolverOption = transferResolverControl
      .findAll("[role='option']")
      .find((option) => option.text().includes("Stations proches"));
    if (!nearbyResolverOption) {
      throw new Error("Missing nearby transfer resolver option");
    }
    await nearbyResolverOption.trigger("mousedown");
    expect(transferResolverControl.text()).toContain("Stations proches");
    expect(wrapper.text()).toContain("Concurrence des bundles");
    expect(wrapper.text()).toContain("1 appel a la fois");
    expect(wrapper.text()).toContain("Espacement des appels bundles");
    expect(wrapper.text()).toContain("Aucun delai");
    expect(wrapper.find("[data-global-map-pack-overview]").exists()).toBe(true);
    expect(wrapper.text()).toContain("Qualité des tuiles");
    expect(wrapper.text()).toContain("Vue régionale");
    expect(wrapper.text()).toContain("Vue détaillée");
    expect(wrapper.text()).toContain("128 tuiles");
    expect(wrapper.text()).toContain("Taille recensée");
    expect(wrapper.text()).toContain("Réseau et stations");
    expect(wrapper.text()).toContain("Incomplète");
    expect(wrapper.text()).toContain("Marge de sortie avant un itinéraire");
    const travelAlarmSafetyInput = wrapper.get(
      'input[aria-label="Marge de sortie avant un itinéraire"]',
    );
    expect((travelAlarmSafetyInput.element as HTMLInputElement).value).toBe("2");
    await travelAlarmSafetyInput.setValue("7");
    expect((travelAlarmSafetyInput.element as HTMLInputElement).value).toBe("7");
    expect(
      wrapper.findAll("[data-global-map-quality-cards] .settings-data-quality-card"),
    ).toHaveLength(6);
    expect(wrapper.find('[data-quality-card-id="ridership"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Cache local");
    expect(wrapper.text()).toContain("2024-local-fixture");
    expect(wrapper.find("[data-global-map-pack-summary]").exists()).toBe(true);
    expect(wrapper.find("[data-global-map-pack-files]").exists()).toBe(true);
    expect(wrapper.find("[data-global-map-pack-warnings]").exists()).toBe(true);
    expect(wrapper.find("[data-global-map-pack-manifest]").exists()).toBe(true);
    expect(wrapper.find("[data-global-map-pack-config]").exists()).toBe(true);
    expect(wrapper.text()).toContain("Bundles de correspondances");
    expect(wrapper.text()).toContain("Voir les bundles");
    expect(wrapper.text()).toContain("Vider les bundles");
    expect(wrapper.text()).toContain("Dashboards enregistres");
    expect(wrapper.text()).toContain("Lieu par defaut");
    expect(wrapper.text()).toContain("Selecteur de lieux");
    expect(wrapper.text()).toContain("Lieu a configurer");
    expect(wrapper.text()).toContain("Maison");
    expect(wrapper.text()).toContain("Affichage des stations");
    const mapContrastSlider = wrapper.get("[data-settings-map-contrast]");
    expect(mapContrastSlider.attributes("min")).toBe(
      String(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.contrast.min),
    );
    expect(mapContrastSlider.attributes("max")).toBe(
      String(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.contrast.max),
    );
    expect((mapContrastSlider.element as HTMLInputElement).value).toBe(
      String(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.contrast.default),
    );
    await mapContrastSlider.setValue("1.12");
    expect((mapContrastSlider.element as HTMLInputElement).value).toBe("1.12");
    expect(wrapper.text()).toContain("112%");
    const mapStyleControl = wrapper.get("[data-settings-map-basemap-style]");
    expect(mapStyleControl.text()).toContain("fond plus sobre");
    await mapStyleControl.get("[role='combobox']").trigger("click");
    const voyagerStyleOption = mapStyleControl
      .findAll("[role='option']")
      .find((option) => option.text().includes("espaces verts renforcés"));
    if (!voyagerStyleOption) {
      throw new Error("Missing Voyager basemap style option");
    }
    await voyagerStyleOption.trigger("mousedown");
    expect(mapStyleControl.text()).toContain("espaces verts renforcés");

    const mapAntialiasingToggle = wrapper.get(
      "[data-settings-map-antialiasing] input",
    );
    expect(mapAntialiasingToggle.attributes("role")).toBe("switch");
    expect(mapAntialiasingToggle.attributes("aria-checked")).toBe("true");
    expect((mapAntialiasingToggle.element as HTMLInputElement).checked).toBe(true);
    await mapAntialiasingToggle.setValue(false);
    expect(mapAntialiasingToggle.attributes("aria-checked")).toBe("false");
    expect((mapAntialiasingToggle.element as HTMLInputElement).checked).toBe(false);

    const nearbyMapControlToggles = wrapper.findAll(
      "[data-settings-nearby-control] input",
    );
    expect(nearbyMapControlToggles).toHaveLength(5);
    expect(
      nearbyMapControlToggles.every(
        (toggle) => (toggle.element as HTMLInputElement).checked,
      ),
    ).toBe(true);
    for (const toggle of nearbyMapControlToggles) {
      await toggle.setValue(false);
      expect((toggle.element as HTMLInputElement).checked).toBe(false);
    }

    const userLocationToggle = wrapper.get(
      "[data-settings-user-location] input",
    );
    expect((userLocationToggle.element as HTMLInputElement).checked).toBe(true);
    await userLocationToggle.setValue(false);
    expect((userLocationToggle.element as HTMLInputElement).checked).toBe(false);
    expect(wrapper.text()).toContain("Visible directement");
    expect(wrapper.text()).toContain("Afficher le bouton Plan");
    const planNavigationToggle = wrapper
      .findAll("label.settings-toggle")
      .find((label) => label.text().includes("Afficher le bouton Plan"));
    if (!planNavigationToggle) {
      throw new Error("Missing Plan navigation setting");
    }
    const planNavigationInput = planNavigationToggle.find("input");
    expect((planNavigationInput.element as HTMLInputElement).checked).toBe(true);
    await planNavigationInput.setValue(false);
    expect((planNavigationInput.element as HTMLInputElement).checked).toBe(false);

    const travelRouteLineIconsToggle = wrapper.get(
      "[data-settings-travel-route-line-icons] input",
    );
    expect(travelRouteLineIconsToggle.attributes("role")).toBe("switch");
    expect(travelRouteLineIconsToggle.attributes("aria-checked")).toBe("true");
    expect((travelRouteLineIconsToggle.element as HTMLInputElement).checked).toBe(true);
    await travelRouteLineIconsToggle.setValue(false);
    expect(travelRouteLineIconsToggle.attributes("aria-checked")).toBe("false");
    expect((travelRouteLineIconsToggle.element as HTMLInputElement).checked).toBe(false);

    await wrapper
      .get('[aria-label="Emplacement des boutons de stations"]')
      .trigger("click");
    expect(wrapper.text()).toContain("Dans le menu contextuel");
    expect(wrapper.text()).toContain("Accordion ferme");
    expect(wrapper.text()).toContain("Prochain passage");
    expect(wrapper.text()).toContain("Defaut actuel");
    expect(wrapper.text()).toContain("Apparence info trafic");
    expect(wrapper.text()).toContain("Style RATP compact");
    expect(wrapper.text()).toContain("Page info trafic");
    expect(wrapper.text()).toContain("Mode par defaut");
    expect(wrapper.text()).toContain("Optimise");
    await wrapper.get('[aria-label="Mode par defaut info trafic"]').trigger("click");
    expect(wrapper.text()).toContain("Toutes les lignes");
    expect(wrapper.text()).toContain("Detection intelligente sur le schema");
    expect(wrapper.text()).toContain(
      "Modale de perturbations et d'interruptions - formatage intelligent",
    );
    expect(wrapper.text()).toContain(
      "Analyse le texte de l'annonce pour extraire les periodes",
    );
    expect(wrapper.text()).toContain("Impacts affichés dans le calendrier");
    expect(wrapper.text()).toContain("Interruptions et perturbations");
    expect(wrapper.text()).toContain("Comment le niveau est calculé");
    expect(wrapper.text()).toContain(
      "score = Σ((1 + poids des correspondances) × coefficient topologique × coefficient temporel)",
    );
    expect(wrapper.text()).toContain("+4");
    expect(wrapper.text()).toContain("× 1,4");
    expect(wrapper.text()).toContain("? 12");
    expect(wrapper.text()).toContain("Coefficient temporel");
    expect(wrapper.text()).toContain("21:30–06:30");
    expect(wrapper.text()).toContain("22:45");
    await wrapper
      .get('[aria-label="Impacts du calendrier trafic"]')
      .trigger("click");
    expect(wrapper.text()).toContain("Interruptions uniquement");

    const smartModalFormattingToggle = wrapper
      .findAll("label.settings-toggle")
      .find((label) =>
        label.text().includes(
          "Modale de perturbations et d'interruptions - formatage intelligent",
        ),
      );
    if (!smartModalFormattingToggle) {
      throw new Error("Missing smart traffic modal formatting setting");
    }
    const smartModalFormattingInput =
      smartModalFormattingToggle.find("input");
    expect(
      (smartModalFormattingInput.element as HTMLInputElement).checked,
    ).toBe(true);
    await smartModalFormattingInput.setValue(false);
    expect(
      (smartModalFormattingInput.element as HTMLInputElement).checked,
    ).toBe(false);

    const replacementBusGroupingToggle = wrapper
      .findAll("label.settings-toggle")
      .find((label) =>
        label.text().includes("Unifier les bus de remplacement"),
      );
    if (!replacementBusGroupingToggle) {
      throw new Error("Missing replacement bus marker grouping setting");
    }
    const replacementBusGroupingInput = replacementBusGroupingToggle.find(
      "input",
    );
    expect(
      (replacementBusGroupingInput.element as HTMLInputElement).checked,
    ).toBe(true);
    await replacementBusGroupingInput.setValue(false);
    expect(
      (replacementBusGroupingInput.element as HTMLInputElement).checked,
    ).toBe(false);

    expect(wrapper.text()).toContain("Avertissement travaux sur le schema");
    expect(wrapper.text()).toContain("10 jours");
    const trafficWarningSlider = wrapper.get(
      '[aria-label="Delai d\'avertissement travaux sur le schema"]',
    );
    await trafficWarningSlider.setValue("3");
    expect(wrapper.text()).toContain("3 jours");
    expect(wrapper.text()).toContain("Meteo dynamique");
    expect(wrapper.text()).toContain("Alertes avec fond d'ecran anime");
    expect(wrapper.text()).toContain("Mode test");
    expect(wrapper.text()).toContain("Aucun test");
    expect(wrapper.text()).toContain("Prevenir a l'avance");
    expect(wrapper.text()).toContain("Toute la journee");
    expect(wrapper.text()).toContain("Lieu meteo");
    expect(wrapper.text()).toContain("Paris");
    expect(wrapper.text()).toContain("Afficher le ressenti");
    expect(wrapper.text()).toContain("Afficher la minimap");
    expect(wrapper.text()).toContain("Espacement vertical compact");
    expect(wrapper.text()).toContain("258 px");
    expect(wrapper.text()).toContain("Courbes arrondies");
    expect(wrapper.text()).toContain("Temps de marche lors d'une interruption");
    expect(wrapper.text()).toContain("Ecart des fourches compactes");
    expect(wrapper.text()).toContain("158 px");
    expect(wrapper.text()).toContain("Espacement realiste");
    expect(wrapper.text()).toContain("Coefficient min");
    expect(wrapper.text()).toContain("Coefficient max");
    expect(wrapper.text()).toContain("Plugins installés");
    expect(wrapper.text()).toContain(
      "Visualisation des transports en temps reel",
    );
    expect(wrapper.text()).not.toContain("Distance suivant le trace");
    const customizePluginButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Personnaliser"));
    expect(customizePluginButton).toBeTruthy();
    await customizePluginButton?.trigger("click");
    expect(document.body.textContent).toContain("Distance suivant le trace");
    expect(document.body.textContent).toContain("Rafraichissement reseau");
    document.body
      .querySelector<HTMLButtonElement>('[aria-label="Fermer"]')
      ?.click();
    await wrapper.vm.$nextTick();
    expect(document.body.textContent).not.toContain("Distance suivant le trace");
    expect(wrapper.text()).toContain(
      "Limiter les lignes fantomes aux modes structurants",
    );
    expect(wrapper.text()).toContain("Wake lock");
    expect(wrapper.text()).toContain("Masquer la navigation");

    const realtimeVehicleToggle = wrapper.get(
      'input[aria-label="Activer ou désactiver Visualisation des transports en temps reel"]',
    );

    expect(
      (realtimeVehicleToggle.element as HTMLInputElement).checked,
    ).toBe(true);
    await realtimeVehicleToggle.setValue(false);
    expect(
      (realtimeVehicleToggle.element as HTMLInputElement).checked,
    ).toBe(false);
    expect(document.body.textContent).toContain(
      "Visualisation des transports en temps reel désactivé",
    );

    const backendCacheToggle = wrapper
      .findAll("label.settings-toggle")
      .find((label) => label.text().includes("Activer le cache backend"));

    expect(backendCacheToggle?.text()).not.toContain(
      "Le chargement des correspondances sera tres lent",
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

    const interruptionWalkingTimesToggle = wrapper
      .findAll("label.settings-toggle")
      .find((label) =>
        label.text().includes("Temps de marche lors d'une interruption"),
      );

    if (!interruptionWalkingTimesToggle) {
      throw new Error("Missing interruption walking times setting");
    }

    const interruptionWalkingTimesInput = interruptionWalkingTimesToggle.find(
      "input",
    );
    expect(
      (interruptionWalkingTimesInput.element as HTMLInputElement).checked,
    ).toBe(true);
    await interruptionWalkingTimesInput.setValue(false);
    expect(
      (interruptionWalkingTimesInput.element as HTMLInputElement).checked,
    ).toBe(false);

    await wrapper.get('[aria-label="Mode du selecteur de lieux"]').trigger("click");
    expect(wrapper.text()).toContain("Dropdown + swipe");
    expect(wrapper.text()).toContain("Dropdown seulement");
    expect(wrapper.text()).toContain("Swipe seulement");
    expect(backendCacheToggle?.text()).toContain(
      "Le chargement des correspondances sera tres lent tant que le cache backend est desactive.",
    );
  }, 10_000);

  it("identifies Cloudflare R2 when the ridership cache is remote", async () => {
    mockMobileReleaseCard();
    vi.doMock("../src/features/app-settings/appSettings", async (importActual) => {
      const actual =
        await importActual<
          typeof import("../src/features/app-settings/appSettings")
        >();
      const { computed, ref } = await import("vue");
      const settings = ref(actual.normalizeAppSettings({
        ...actual.createDefaultAppSettings(),
        language: "fr",
      }));

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
            settings.value = actual.normalizeAppSettings({
              ...actual.createDefaultAppSettings(),
              language: "fr",
            });
          },
        }),
      };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/api/ridership/status")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              available: true,
              version: "2024-r2-fixture",
              actualYears: [2024],
              source: { kind: "r2", location: "r2://shared-bucket/ridership" },
              counts: {
                lines: 2011,
                stations: 31778,
                lineMeasures: 40,
                stationMeasures: 655,
                availableLines: 40,
                availableStations: 655,
              },
            }),
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => globalMapManifestFixture,
        };
      }),
    );

    const { default: SettingsPage } = await import(
      "../src/features/app-settings/SettingsPage.vue"
    );
    const wrapper = mount(SettingsPage);
    for (const trigger of wrapper.findAll(".settings-panel__trigger")) {
      await trigger.trigger("click");
    }
    await flushPromises();

    const ridershipCard = wrapper.find('[data-quality-card-id="ridership"]');
    expect(ridershipCard.text()).toContain("Cloudflare R2");
    expect(ridershipCard.text()).toContain("2024-r2-fixture");
  });

  it("switches the settings UI language from French to English", async () => {
    mockMobileReleaseCard();
    vi.doMock("../src/features/app-settings/appSettings", async (importActual) => {
      const actual =
        await importActual<
          typeof import("../src/features/app-settings/appSettings")
        >();
      const { computed, ref } = await import("vue");
      const settings = ref(actual.normalizeAppSettings({
        ...actual.createDefaultAppSettings(),
        language: "fr",
      }));

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
            settings.value = actual.normalizeAppSettings({
              ...actual.createDefaultAppSettings(),
              language: "fr",
            });
          },
        }),
      };
    });

    const { default: SettingsPage } = await import(
      "../src/features/app-settings/SettingsPage.vue"
    );
    const wrapper = mount(SettingsPage, { attachTo: document.body });
    expect(
      wrapper
        .findAll(".settings-panel__trigger")
        .every((trigger) => trigger.attributes("aria-expanded") === "false"),
    ).toBe(true);
    for (const trigger of wrapper.findAll(".settings-panel__trigger")) {
      await trigger.trigger("click");
    }

    expect(wrapper.text()).toContain("Langue de l'application");
    await wrapper.get('[aria-label="Langue de l\'application"]').trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "English")
      ?.trigger("mousedown");
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("Application language");
    expect(wrapper.text()).toContain("Dashboard customization");
    expect(wrapper.text()).toContain("Saved dashboards");
    expect(wrapper.text()).not.toContain("Personnalisation du dashboard");
  });

  it("shows a temporary notification after clearing bundles or resetting settings", async () => {
    vi.useFakeTimers();
    mockMobileReleaseCard();
    const clearWalkingCache = vi.fn();
    vi.doMock("../src/services/nearbyWalkingRoutes", async (importActual) => {
      const actual = await importActual<
        typeof import("../src/services/nearbyWalkingRoutes")
      >();
      return {
        ...actual,
        clearNearbyWalkingRouteCache: clearWalkingCache,
      };
    });
    vi.doMock("../src/features/app-settings/appSettings", async (importActual) => {
      const actual =
        await importActual<
          typeof import("../src/features/app-settings/appSettings")
        >();
      const { computed, ref } = await import("vue");
      const settings = ref(actual.normalizeAppSettings({
        ...actual.createDefaultAppSettings(),
        language: "fr",
      }));

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
            settings.value = actual.normalizeAppSettings({
              ...actual.createDefaultAppSettings(),
              language: "fr",
            });
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
    expect(
      wrapper
        .findAll(".settings-panel__trigger")
        .every((trigger) => trigger.attributes("aria-expanded") === "false"),
    ).toBe(true);
    for (const trigger of wrapper.findAll(".settings-panel__trigger")) {
      await trigger.trigger("click");
    }

    const clearBundlesButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Vider les bundles");

    expect(clearBundlesButton).toBeTruthy();
    await clearBundlesButton?.trigger("click");
    expect(document.body.textContent).toContain("Bundles supprimes");

    const clearWalkingCacheButton = wrapper.get("[data-settings-walking-cache-clear]");
    await clearWalkingCacheButton.trigger("click");
    expect(clearWalkingCache).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Cache des trajets piétons vidé");

    await vi.advanceTimersByTimeAsync(5_000);
    expect(document.body.textContent).not.toContain("Bundles supprimes");

    const resetButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("initialiser"));

    expect(resetButton).toBeTruthy();
    await resetButton?.trigger("click");
    expect(clearWalkingCache).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain("Parametres reinitialises");
  });

  it("manages presets from the settings modal", async () => {
    mockMobileReleaseCard();
    vi.doMock("../src/features/app-settings/appSettings", async (importActual) => {
      const actual =
        await importActual<
          typeof import("../src/features/app-settings/appSettings")
        >();
      const { computed, ref } = await import("vue");
      const settings = ref(actual.normalizeAppSettings({
        ...actual.createDefaultAppSettings(),
        language: "fr",
      }));

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
            settings.value = actual.normalizeAppSettings({
              ...actual.createDefaultAppSettings(),
              language: "fr",
            });
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
    expect(
      wrapper
        .findAll(".settings-panel__trigger")
        .every((trigger) => trigger.attributes("aria-expanded") === "false"),
    ).toBe(true);
    for (const trigger of wrapper.findAll(".settings-panel__trigger")) {
      await trigger.trigger("click");
    }

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Gerer les lieux"))
      ?.trigger("click");

    expect(document.body.textContent).toContain("Dashboards enregistres");
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
