import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { AppSettings } from "../src/features/app-settings/appSettings";
import type { WeatherResponse } from "../src/features/weather/types";

const baseSettings: AppSettings = {
  version: 2,
  language: "fr",
  closedDirectionSummaryMode: "last",
  maxDeparturesPerDirection: "default",
  showPatternMiniMap: true,
  showPatternCityZones: true,
  terminalDirectionsOnly: false,
  hiddenDirectionIdsByBoardId: {},
  wakeLockDuration: "none",
  wakeDeviceOnAlarm: true,
  travelAlarmSafetyMinutes: 2,
  boardTogglesPlacement: "inline",
  placePresetNavigationMode: "dropdown-swipe",
  showPlanInNavigation: true,
  showTravelRouteLineIcons: true,
  showUserLocation: true,
  globalMapBasemapContrast: 1.02,
  globalMapBasemapStyle: "voyager",
  deckAntialiasing: true,
  nearbyMapShowIsochroneControl: true,
  nearbyMapShowDirectoryControl: true,
  nearbyMapShowBasemapControl: true,
  nearbyMapShowDisplayControl: true,
  nearbyMapShowFullscreenControl: true,
  navigationAutoHide: "none",
  reduceMotion: false,
  gtfsLineGeometryEnabled: true,
  pluginViewerMode: "grid",
  plugins: {},
  legacyPluginData: {},
  compactLinePlanMode: "auto",
  patternRoundedCurves: false,
  showInterruptionWalkingTimes: true,
  unifyReplacementBusMarkers: true,
  patternCompactBranchGap: 258,
  patternCompactForkGap: 158,
  patternRealisticMinGapCoefficient: 0.5,
  patternRealisticMaxGapCoefficient: 5,
  richTransferTooltips: true,
  ghostNetworkStructuralOnly: false,
  trafficCalendarImpactScope: "all-impacts",
  trafficInfoDesign: "ratp",
  trafficInfoDefaultScope: "optimized",
  trafficWarningLookaheadDays: 10,
  fullscreenStationPanelDesign: "all-directions",
  fullscreenStationPanelDarkTheme: false,
  smartTrafficDetection: true,
  smartTrafficModalFormatting: true,
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

const versaillesLocation = {
  label: "Versailles",
  latitude: 48.8014,
  longitude: 2.1301,
};

const versaillesRainResponse: WeatherResponse = {
  ...rainResponse,
  location: versaillesLocation,
};

let updateWeatherSettings:
  | ((patch: Partial<AppSettings>) => void)
  | undefined;

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.doUnmock("../src/features/app-settings");
  updateWeatherSettings = undefined;
});

async function mountWeatherExperience(settingsPatch: Partial<AppSettings>) {
  vi.doMock("../src/features/app-settings", async (importActual) => {
    const actual = await importActual<typeof import("../src/features/app-settings")>();
    const { ref } = await import("vue");
    const settings = ref({
      ...baseSettings,
      ...settingsPatch,
    });
    updateWeatherSettings = (patch) => {
      settings.value = { ...settings.value, ...patch };
    };

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

  const { default: WeatherExperience } =
    await import("../src/features/weather/WeatherExperience.vue");

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

  it("starts a new request and ignores the previous location response", async () => {
    const pendingRequests: Array<{
      resolve: (response: {
        ok: boolean;
        json: () => Promise<WeatherResponse>;
      }) => void;
      url: string;
    }> = [];
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      new Promise<{
        ok: boolean;
        json: () => Promise<WeatherResponse>;
      }>((resolve) => {
        pendingRequests.push({ resolve, url: String(input) });
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = await mountWeatherExperience({});
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(updateWeatherSettings).toBeDefined();
    updateWeatherSettings!({
      weatherLocationPreset: "custom",
      weatherCustomLocation: versaillesLocation,
    });
    await nextTick();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pendingRequests[1].url).toContain("48.8014");

    pendingRequests[0].resolve({
      ok: true,
      json: async () => rainResponse,
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain("Pluie prevue dans 14 min");

    pendingRequests[1].resolve({
      ok: true,
      json: async () => versaillesRainResponse,
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Pluie prevue dans 14 min");
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
    expect(wrapper.text()).toContain("fin dans 1 h 30");
    expect(wrapper.findAll(".weather-alert__icon span")).toHaveLength(2);
    expect(wrapper.find("#weather-rain-particles").exists()).toBe(true);

    await wrapper.get(".weather-alert__close").trigger("click");
    expect(wrapper.text()).not.toContain("Pluie prevue dans 14 min");
  });

  it("opens the weather modal from the alert and formats long durations", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ...rainResponse,
        alert: {
          ...rainResponse.alert!,
          startsInMinutes: 120,
          endsInMinutes: 150,
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = await mountWeatherExperience({});
    await flushPromises();

    expect(wrapper.text()).toContain("Pluie prevue dans 2 h");
    expect(wrapper.text()).toContain("fin dans 2 h 30");

    await wrapper.get(".weather-alert__title").trigger("click");
    expect(wrapper.emitted("open-weather")).toHaveLength(1);
  });

  it("forces a static background when reduced motion is enabled", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => rainResponse,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = await mountWeatherExperience({ reduceMotion: true });
    await flushPromises();

    expect(wrapper.get(".weather-backdrop").classes()).not.toContain("weather-backdrop--animated");
  });

  it("uses test mode weather without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = await mountWeatherExperience({ weatherTestMode: "storm" });
    await flushPromises();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Orage prevu dans 14 min");
    expect(wrapper.text()).toContain("fin dans 1 h 34");
    expect(wrapper.get(".weather-backdrop").classes()).toContain("weather-backdrop--storm");
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
