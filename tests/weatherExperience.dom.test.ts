import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../src/features/app-settings/appSettings";
import type { WeatherResponse } from "../src/features/weather/types";

const baseSettings: AppSettings = {
  version: 1,
  language: "fr",
  closedDirectionSummaryMode: "last",
  maxDeparturesPerDirection: "default",
  showPatternMiniMap: true,
  showPatternCityZones: true,
  terminalDirectionsOnly: false,
  hiddenDirectionIdsByBoardId: {},
  wakeLockDuration: "none",
  wakeDeviceOnAlarm: true,
  boardTogglesPlacement: "inline",
  placePresetNavigationMode: "dropdown-swipe",
  navigationAutoHide: "none",
  reduceMotion: false,
  compactLinePlanMode: "auto",
  patternRoundedCurves: false,
  patternCompactBranchGap: 258,
  patternCompactForkGap: 158,
  patternRealisticMinGapCoefficient: 0.5,
  patternRealisticMaxGapCoefficient: 5,
  richTransferTooltips: true,
  ghostNetworkStructuralOnly: false,
  trafficInfoDesign: "ratp",
  trafficInfoDefaultScope: "optimized",
  trafficWarningLookaheadDays: 10,
  fullscreenStationPanelDesign: "all-directions",
  fullscreenStationPanelDarkTheme: false,
  smartTrafficDetection: true,
  transferResolverMode: "auto",
  transferBundleBackendCacheEnabled: true,
  transferBundleLocalCacheEnabled: true,
  transferBundleRetentionDays: 15,
  transferBundleRequestConcurrency: 1,
  transferBundleRequestSpacingMs: 0,
  weatherMode: "animated",
  weatherLookaheadMinutes: 1440,
  weatherShowApparentTemperature: true,
  weatherLocationPreset: "paris",
  weatherCustomLocation: {
    label: "Paris",
    latitude: 48.8566,
    longitude: 2.3522,
  },
  weatherTestMode: "off",
};

const rainResponse: WeatherResponse = {
  generatedAt: "2026-05-28T00:20:00.000Z",
  source: "open-meteo",
  location: baseSettings.weatherCustomLocation,
  condition: {
    kind: "rain",
    label: "Pluie",
    intensity: 2,
    temperatureC: 8,
    apparentTemperatureC: 5,
  },
  alert: {
    kind: "rain",
    label: "Pluie",
    startsAt: "2026-05-28T00:35:00.000Z",
    startsInMinutes: 14,
    umbrellaAfter: "2026-05-28T00:35:00.000Z",
    endsAt: "2026-05-28T01:50:00.000Z",
    endsInMinutes: 90,
    intensity: 2,
    temperatureC: 8,
    apparentTemperatureC: 5,
  },
};

const heatResponse: WeatherResponse = {
  generatedAt: "2026-06-21T10:00:00.000Z",
  source: "open-meteo",
  location: baseSettings.weatherCustomLocation,
  condition: {
    kind: "heat",
    label: "Canicule",
    intensity: 2,
    temperatureC: 37,
    apparentTemperatureC: 39,
  },
  alert: {
    kind: "heat",
    label: "Canicule",
    startsAt: "2026-06-21T10:00:00.000Z",
    startsInMinutes: 0,
    intensity: 2,
    temperatureC: 37,
    apparentTemperatureC: 39,
  },
};

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.doUnmock("../src/features/app-settings");
});

async function mountWeatherExperience(settingsPatch: Partial<AppSettings>) {
  vi.doMock("../src/features/app-settings", async (importActual) => {
    const actual =
      await importActual<typeof import("../src/features/app-settings")>();
    const { ref } = await import("vue");
    const settings = ref({
      ...baseSettings,
      ...settingsPatch,
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

  const { default: WeatherExperience } = await import(
    "../src/features/weather/WeatherExperience.vue"
  );

  return mount(WeatherExperience, {
    global: {
      stubs: {
        VueParticles: true,
      },
    },
  });
}

describe("WeatherExperience", () => {
  it("does not fetch weather when the feature is disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = await mountWeatherExperience({ weatherMode: "disabled" });
    await flushPromises();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toBe("");
  });

  it("renders rain alert details and dismisses until refresh", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => rainResponse,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = await mountWeatherExperience({});
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("Pluie prevue dans 14 min");
    expect(wrapper.text()).toContain("Prends un parapluie");
    expect(wrapper.text()).toContain("fin dans 90 min");
    expect(wrapper.findAll(".weather-alert__icon span")).toHaveLength(2);
    expect(wrapper.find("#weather-rain-particles").exists()).toBe(true);

    await wrapper.get(".weather-alert__close").trigger("click");
    expect(wrapper.text()).not.toContain("Pluie prevue dans 14 min");
  });

  it("forces a static background when reduced motion is enabled", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => rainResponse,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = await mountWeatherExperience({ reduceMotion: true });
    await flushPromises();

    expect(wrapper.get(".weather-backdrop").classes()).not.toContain(
      "weather-backdrop--animated",
    );
  });

  it("uses test mode weather without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = await mountWeatherExperience({ weatherTestMode: "storm" });
    await flushPromises();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Orage prevu dans 14 min");
    expect(wrapper.text()).toContain("fin dans 94 min");
    expect(wrapper.get(".weather-backdrop").classes()).toContain(
      "weather-backdrop--storm",
    );
  });

  it("shows the measured maximum and apparent temperature for heat alerts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => heatResponse,
      })),
    );

    const wrapper = await mountWeatherExperience({});
    await flushPromises();

    expect(wrapper.text()).toContain("37 \u00B0C \u00B7 ressenti 39 \u00B0C");
  });

  it("can hide the apparent temperature in heat alerts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => heatResponse,
      })),
    );

    const wrapper = await mountWeatherExperience({
      weatherShowApparentTemperature: false,
    });
    await flushPromises();

    expect(wrapper.text()).toContain("37 \u00B0C");
    expect(wrapper.text()).not.toContain("ressenti");
  });
});
