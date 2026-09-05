import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useAppSettings, type WeatherTestMode } from "../app-settings";
import { useI18n } from "../../i18n";
import { resolveWeatherLocation } from "./weatherLocations";
import { toServerApiUrl } from "../../services/serverApi";
import type {
  WeatherAlert,
  WeatherCondition,
  WeatherConditionKind,
  WeatherResponse,
  WeatherSettingsLocation,
} from "./types";

export function useWeatherExperience() {
  const { settings } = useAppSettings();
  const { t } = useI18n();
  const weather = ref<WeatherResponse>();
  const loading = ref(false);
  const error = ref("");
  const dismissedAlertKey = ref("");
  let requestGeneration = 0;

  const location = computed(() =>
    resolveWeatherLocation(
      settings.value.weatherLocationPreset,
      settings.value.weatherCustomLocation,
      t("settings.options.weatherLocation.custom"),
    ),
  );
  const enabled = computed(() => settings.value.weatherMode !== "disabled");
  const testModeEnabled = computed(
    () => settings.value.weatherTestMode !== "off",
  );
  const alertKey = computed(() =>
    weather.value?.alert
      ? `${weather.value.alert.kind}:${weather.value.alert.startsAt}`
      : "",
  );

  onMounted(() => {
    if (enabled.value) {
      void loadWeather();
    }
  });

  watch(
    () => [
      settings.value.weatherMode,
      settings.value.weatherTestMode,
      settings.value.weatherLookaheadMinutes,
      location.value.latitude,
      location.value.longitude,
    ],
    () => {
      weather.value = undefined;
      error.value = "";
      dismissedAlertKey.value = "";

      if (enabled.value) {
        void loadWeather();
      } else {
        invalidateWeatherRequest();
      }
    },
  );

  onBeforeUnmount(invalidateWeatherRequest);

  async function loadWeather(): Promise<void> {
    const requestGenerationAtStart = ++requestGeneration;
    const requestLocation = { ...location.value };
    const lookaheadMinutes = settings.value.weatherLookaheadMinutes;

    error.value = "";

    if (!enabled.value) {
      loading.value = false;
      return;
    }

    if (testModeEnabled.value) {
      weather.value = createTestWeatherResponse(
        settings.value.weatherTestMode,
        requestLocation,
      );
      loading.value = false;
      return;
    }

    loading.value = true;

    try {
      const params = new URLSearchParams({
        latitude: String(requestLocation.latitude),
        longitude: String(requestLocation.longitude),
        locationLabel: requestLocation.label,
        lookaheadMinutes: String(lookaheadMinutes),
      });
      const response = await fetch(toServerApiUrl(`/api/weather?${params}`));

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const nextWeather = (await response.json()) as WeatherResponse;

      if (requestGenerationAtStart !== requestGeneration) {
        return;
      }

      weather.value = nextWeather;
    } catch (fetchError) {
      if (requestGenerationAtStart !== requestGeneration) {
        return;
      }

      error.value =
        fetchError instanceof Error
          ? fetchError.message
          : t("weather.loadFailed");
    } finally {
      if (requestGenerationAtStart === requestGeneration) {
        loading.value = false;
      }
    }
  }

  function invalidateWeatherRequest(): void {
    requestGeneration += 1;
    loading.value = false;
  }

  function dismissAlert(): void {
    dismissedAlertKey.value = alertKey.value;
  }

  return {
    settings,
    weather,
    loading,
    error,
    enabled,
    alertKey,
    dismissedAlertKey,
    loadWeather,
    dismissAlert,
  };
}

function createTestWeatherResponse(
  testMode: WeatherTestMode,
  location: WeatherSettingsLocation,
): WeatherResponse {
  const now = new Date();
  const startsAt = new Date(now.getTime() + 14 * 60_000);
  const endsAt = new Date(now.getTime() + 94 * 60_000);
  const kind = testMode === "off" ? "rain" : testMode;
  const condition = createTestCondition(kind);

  return {
    generatedAt: now.toISOString(),
    source: "test",
    location,
    condition,
    alert: createTestAlert(kind, startsAt, endsAt, condition),
  };
}

function createTestCondition(
  kind: Exclude<WeatherConditionKind, "normal">,
): WeatherCondition {
  const details: Record<
    Exclude<WeatherConditionKind, "normal">,
    Pick<
      WeatherCondition,
      "label" | "intensity" | "temperatureC" | "apparentTemperatureC"
    >
  > = {
    rain: {
      label: "Rain",
      intensity: 2,
      temperatureC: 8,
      apparentTemperatureC: 5,
    },
    storm: {
      label: "Storm",
      intensity: 3,
      temperatureC: 13,
      apparentTemperatureC: 11,
    },
    snow: {
      label: "Snow",
      intensity: 2,
      temperatureC: 1,
      apparentTemperatureC: -2,
    },
    heat: {
      label: "Heatwave",
      intensity: 3,
      temperatureC: 36,
      apparentTemperatureC: 39,
    },
  };

  return {
    kind,
    ...details[kind],
  };
}

function createTestAlert(
  kind: Exclude<WeatherConditionKind, "normal">,
  startsAt: Date,
  endsAt: Date,
  condition: WeatherCondition,
): WeatherAlert {
  return {
    kind,
    label: condition.label,
    startsAt: startsAt.toISOString(),
    startsInMinutes: 14,
    umbrellaAfter:
      kind === "rain" || kind === "storm" ? startsAt.toISOString() : undefined,
    endsAt: endsAt.toISOString(),
    endsInMinutes: 94,
    intensity: condition.intensity,
    temperatureC: condition.temperatureC,
    apparentTemperatureC: condition.apparentTemperatureC,
  };
}
