import { computed, onMounted, ref, watch } from "vue";
import { useAppSettings, type WeatherTestMode } from "../app-settings";
import { resolveWeatherLocation } from "./weatherLocations";
import type {
  WeatherAlert,
  WeatherCondition,
  WeatherConditionKind,
  WeatherResponse,
  WeatherSettingsLocation,
} from "./types";

export function useWeatherExperience() {
  const { settings } = useAppSettings();
  const weather = ref<WeatherResponse>();
  const loading = ref(false);
  const error = ref("");
  const dismissedAlertKey = ref("");

  const location = computed(() =>
    resolveWeatherLocation(
      settings.value.weatherLocationPreset,
      settings.value.weatherCustomLocation,
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
      }
    },
  );

  async function loadWeather(): Promise<void> {
    if (!enabled.value || loading.value) {
      return;
    }

    if (testModeEnabled.value) {
      weather.value = createTestWeatherResponse(
        settings.value.weatherTestMode,
        location.value,
      );
      return;
    }

    loading.value = true;
    error.value = "";

    try {
      const params = new URLSearchParams({
        latitude: String(location.value.latitude),
        longitude: String(location.value.longitude),
        locationLabel: location.value.label,
        lookaheadMinutes: String(settings.value.weatherLookaheadMinutes),
      });
      const response = await fetch(`/api/weather?${params}`);

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      weather.value = (await response.json()) as WeatherResponse;
    } catch (fetchError) {
      error.value =
        fetchError instanceof Error
          ? fetchError.message
          : "Impossible de charger la météo.";
    } finally {
      loading.value = false;
    }
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
      label: "Pluie",
      intensity: 2,
      temperatureC: 8,
      apparentTemperatureC: 5,
    },
    storm: {
      label: "Orage",
      intensity: 3,
      temperatureC: 13,
      apparentTemperatureC: 11,
    },
    snow: {
      label: "Neige",
      intensity: 2,
      temperatureC: 1,
      apparentTemperatureC: -2,
    },
    heat: {
      label: "Canicule",
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
