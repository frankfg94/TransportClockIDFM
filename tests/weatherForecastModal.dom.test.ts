import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../src/features/app-settings/appSettings";
import type { WeatherResponse } from "../src/features/weather/types";

const baseSettings: AppSettings = {
  version: 1,
  closedDirectionSummaryMode: "last",
  maxDeparturesPerDirection: "default",
  showPatternMiniMap: true,
  terminalDirectionsOnly: false,
  hiddenDirectionIdsByBoardId: {},
  wakeLockDuration: "none",
  wakeDeviceOnAlarm: true,
  boardTogglesPlacement: "inline",
  navigationAutoHide: "none",
  reduceMotion: false,
  compactLinePlanMode: "auto",
  richTransferTooltips: true,
  ghostNetworkStructuralOnly: false,
  trafficInfoDesign: "ratp",
  trafficInfoDefaultScope: "optimized",
  transferResolverMode: "auto",
  transferBundleBackendCacheEnabled: true,
  transferBundleLocalCacheEnabled: true,
  transferBundleRetentionDays: 15,
  transferBundleRequestConcurrency: 1,
  transferBundleRequestSpacingMs: 0,
  weatherMode: "animated",
  weatherLookaheadMinutes: 1440,
  weatherLocationPreset: "paris",
  weatherCustomLocation: {
    label: "Paris",
    latitude: 48.8566,
    longitude: 2.3522,
  },
  weatherTestMode: "off",
};

const weatherResponse: WeatherResponse = {
  generatedAt: "2026-05-28T18:00:00.000Z",
  source: "open-meteo",
  location: baseSettings.weatherCustomLocation,
  condition: {
    kind: "normal",
    label: "Nuageux dans l'ensemble",
    intensity: 1,
    temperatureC: 31,
    apparentTemperatureC: 32,
  },
  forecast: {
    current: {
      time: "2026-05-28T18:00:00.000Z",
      label: "Nuageux dans l'ensemble",
      weatherCode: 3,
      temperatureC: 31,
      humidityPercent: 38,
      precipitationProbabilityPercent: 25,
      windSpeedKmh: 6,
    },
    hourly: [
      {
        time: "2026-05-28T19:00:00.000Z",
        label: "Nuageux",
        weatherCode: 3,
        temperatureC: 31,
        precipitationProbabilityPercent: 25,
        windSpeedKmh: 6,
      },
      {
        time: "2026-05-28T22:00:00.000Z",
        label: "Ciel dégagé",
        weatherCode: 0,
        temperatureC: 24,
        precipitationProbabilityPercent: 10,
        windSpeedKmh: 8,
      },
      {
        time: "2026-05-29T09:00:00.000Z",
        label: "Pluie",
        weatherCode: 61,
        temperatureC: 18,
        precipitationProbabilityPercent: 90,
        windSpeedKmh: 18,
      },
    ],
    daily: [
      {
        date: "2026-05-28T00:00:00.000Z",
        label: "Nuageux",
        weatherCode: 3,
        temperatureMaxC: 33,
        temperatureMinC: 18,
      },
      {
        date: "2026-05-29T00:00:00.000Z",
        label: "Pluie",
        weatherCode: 61,
        temperatureMaxC: 22,
        temperatureMinC: 13,
      },
    ],
  },
};

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.doUnmock("../src/features/app-settings");
});

describe("WeatherForecastModal", () => {
  it("loads and renders forecast sections from the weather API", async () => {
    vi.doMock("../src/features/app-settings", async (importActual) => {
      const actual =
        await importActual<typeof import("../src/features/app-settings")>();
      const { ref } = await import("vue");
      const settings = ref(baseSettings);

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

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => weatherResponse,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { default: WeatherForecastModal } = await import(
      "../src/features/weather/WeatherForecastModal.vue"
    );
    const wrapper = mount(WeatherForecastModal, {
      props: {
        open: true,
      },
    });

    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/weather?"),
    );
    expect(wrapper.text()).toContain("Météo");
    expect(wrapper.text()).toContain("31°");
    expect(wrapper.text()).toContain("Précipitations");
    expect(wrapper.text()).toContain("Humidité");
    expect(wrapper.text()).toContain("Vent");
    expect(wrapper.text()).toContain("Open-Meteo");
  });

  it("updates the hourly chart when another day is selected", async () => {
    vi.doMock("../src/features/app-settings", async (importActual) => {
      const actual =
        await importActual<typeof import("../src/features/app-settings")>();
      const { ref } = await import("vue");
      const settings = ref(baseSettings);

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

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => weatherResponse,
      })),
    );

    const { default: WeatherForecastModal } = await import(
      "../src/features/weather/WeatherForecastModal.vue"
    );
    const wrapper = mount(WeatherForecastModal, {
      props: {
        open: true,
      },
    });

    await flushPromises();
    expect(wrapper.text()).not.toContain("90%");
    await wrapper.findAll(".weather-modal__tabs button")[1].trigger("click");

    const dayButtons = wrapper.findAll(".weather-modal__day");
    await dayButtons[1].trigger("click");

    expect(dayButtons[1].attributes("aria-pressed")).toBe("true");
    expect(wrapper.text()).toContain("90%");
    expect(wrapper.text()).toContain("vendredi 29 mai");
  });
});
