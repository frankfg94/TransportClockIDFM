import type {
  OpenMeteoCurrentWeather,
  OpenMeteoDailyWeatherSeries,
  OpenMeteoForecastPayload,
  OpenMeteoWeatherSeries,
  WeatherAlert,
  WeatherCondition,
  WeatherConditionKind,
  WeatherForecast,
  WeatherForecastCurrent,
  WeatherForecastDay,
  WeatherForecastHour,
  WeatherIntensity,
  WeatherResponse,
  WeatherSettingsLocation,
} from "./types";

interface NormalizeWeatherOptions {
  location: WeatherSettingsLocation;
  lookaheadMinutes: number;
  now?: Date;
}

interface WeatherSample {
  time: Date;
  kind: WeatherConditionKind;
  intensity: WeatherIntensity;
  temperatureC?: number;
  apparentTemperatureC?: number;
}

const WEATHER_PRIORITY: Record<WeatherConditionKind, number> = {
  normal: 0,
  rain: 1,
  heat: 2,
  snow: 3,
  storm: 4,
};

export function normalizeOpenMeteoWeather(
  payload: OpenMeteoForecastPayload,
  options: NormalizeWeatherOptions,
): WeatherResponse {
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const samples = collectForecastSamples(payload);
  const currentCondition = getCurrentCondition(payload.current, samples, now);
  const alert = findPriorityAlert(samples, payload, now, options.lookaheadMinutes);
  const condition = alert
    ? weatherAlertToCondition(alert)
    : currentCondition ?? createNormalCondition(payload.current);

  return {
    generatedAt,
    source: "open-meteo",
    location: options.location,
    condition,
    alert,
    forecast: createWeatherForecast(payload, now),
  };
}

function createWeatherForecast(
  payload: OpenMeteoForecastPayload,
  now: Date,
): WeatherForecast {
  return {
    current: createCurrentForecast(payload.current, payload.hourly, now),
    hourly: createHourlyForecast(payload.hourly, now),
    daily: createDailyForecast(payload.daily),
  };
}

function createCurrentForecast(
  current: OpenMeteoCurrentWeather | undefined,
  hourly: OpenMeteoWeatherSeries | undefined,
  now: Date,
): WeatherForecastCurrent | undefined {
  if (current) {
    const weatherCode = readNumberAt([current.weather_code ?? Number.NaN], 0);

    return {
      time: parseOpenMeteoTime(current.time)?.toISOString(),
      label: getWeatherCodeLabel(weatherCode),
      weatherCode,
      temperatureC: current.temperature_2m,
      apparentTemperatureC: current.apparent_temperature,
      humidityPercent: current.relative_humidity_2m,
      precipitationMm: current.precipitation,
      precipitationProbabilityPercent: findNearestHourlyValue(
        hourly,
        now,
        "precipitation_probability",
      ),
      windSpeedKmh: current.wind_speed_10m,
      windGustKmh: current.wind_gusts_10m,
    };
  }

  const nearestHour = createHourlyForecast(hourly, now)[0];

  return nearestHour
    ? {
        time: nearestHour.time,
        label: nearestHour.label,
        weatherCode: nearestHour.weatherCode,
        temperatureC: nearestHour.temperatureC,
        apparentTemperatureC: nearestHour.apparentTemperatureC,
        humidityPercent: nearestHour.humidityPercent,
        precipitationMm: nearestHour.precipitationMm,
        precipitationProbabilityPercent:
          nearestHour.precipitationProbabilityPercent,
        windSpeedKmh: nearestHour.windSpeedKmh,
        windGustKmh: nearestHour.windGustKmh,
      }
    : undefined;
}

function createHourlyForecast(
  hourly: OpenMeteoWeatherSeries | undefined,
  now: Date,
): WeatherForecastHour[] {
  if (!hourly?.time?.length) {
    return [];
  }

  return hourly.time
    .map((timeValue, index): WeatherForecastHour | undefined => {
      const time = parseOpenMeteoTime(timeValue);

      if (!time || time.getTime() < now.getTime() - 90 * 60_000) {
        return undefined;
      }

      const weatherCode = readNumberAt(hourly.weather_code, index);

      return {
        time: time.toISOString(),
        label: getWeatherCodeLabel(weatherCode),
        weatherCode,
        temperatureC: readNumberAt(hourly.temperature_2m, index),
        apparentTemperatureC: readNumberAt(hourly.apparent_temperature, index),
        humidityPercent: readNumberAt(hourly.relative_humidity_2m, index),
        precipitationMm: readNumberAt(hourly.precipitation, index),
        precipitationProbabilityPercent: readNumberAt(
          hourly.precipitation_probability,
          index,
        ),
        windSpeedKmh: readNumberAt(hourly.wind_speed_10m, index),
        windGustKmh: readNumberAt(hourly.wind_gusts_10m, index),
      };
    })
    .filter((hour): hour is WeatherForecastHour => Boolean(hour))
    .slice(0, 24 * 8);
}

function createDailyForecast(
  daily: OpenMeteoDailyWeatherSeries | undefined,
): WeatherForecastDay[] {
  if (!daily?.time?.length) {
    return [];
  }

  return daily.time
    .map((timeValue, index): WeatherForecastDay | undefined => {
      const time = parseOpenMeteoTime(timeValue);

      if (!time) {
        return undefined;
      }

      const weatherCode = readNumberAt(daily.weather_code, index);

      return {
        date: time.toISOString(),
        label: getWeatherCodeLabel(weatherCode),
        weatherCode,
        temperatureMaxC: readNumberAt(daily.temperature_2m_max, index),
        temperatureMinC: readNumberAt(daily.temperature_2m_min, index),
        apparentTemperatureMaxC: readNumberAt(
          daily.apparent_temperature_max,
          index,
        ),
        precipitationMm: Math.max(
          0,
          readNumberAt(daily.precipitation_sum, index) ?? 0,
          readNumberAt(daily.rain_sum, index) ?? 0,
          readNumberAt(daily.snowfall_sum, index) ?? 0,
        ),
        precipitationProbabilityPercent: readNumberAt(
          daily.precipitation_probability_max,
          index,
        ),
        windSpeedMaxKmh: readNumberAt(daily.wind_speed_10m_max, index),
        windGustMaxKmh: readNumberAt(daily.wind_gusts_10m_max, index),
      };
    })
    .filter((day): day is WeatherForecastDay => Boolean(day))
    .slice(0, 8);
}

function findNearestHourlyValue(
  hourly: OpenMeteoWeatherSeries | undefined,
  now: Date,
  key: keyof OpenMeteoWeatherSeries,
): number | undefined {
  if (!hourly?.time?.length) {
    return undefined;
  }

  let nearest:
    | {
        distance: number;
        value?: number;
      }
    | undefined;

  hourly.time.forEach((timeValue, index) => {
    const time = parseOpenMeteoTime(timeValue);
    const value = readNumberAt(hourly[key] as number[] | undefined, index);

    if (!time || typeof value !== "number") {
      return;
    }

    const distance = Math.abs(time.getTime() - now.getTime());

    if (!nearest || distance < nearest.distance) {
      nearest = { distance, value };
    }
  });

  return nearest?.value;
}

function collectForecastSamples(
  payload: OpenMeteoForecastPayload,
): WeatherSample[] {
  const minutelyForecast = payload.minutely_15 ?? payload.forecast_minutely_15;

  return [
    ...readSeriesSamples(minutelyForecast),
    ...readSeriesSamples(payload.hourly),
  ].sort((left, right) => left.time.getTime() - right.time.getTime());
}

function readSeriesSamples(series?: OpenMeteoWeatherSeries): WeatherSample[] {
  if (!series?.time?.length) {
    return [];
  }

  return series.time
    .map((timeValue, index) => {
      const time = parseOpenMeteoTime(timeValue);

      if (!time) {
        return undefined;
      }

      return createSample({
        time,
        temperatureC: readNumberAt(series.temperature_2m, index),
        apparentTemperatureC: readNumberAt(series.apparent_temperature, index),
        precipitation: readNumberAt(series.precipitation, index),
        rain: readNumberAt(series.rain, index),
        showers: readNumberAt(series.showers, index),
        snowfall: readNumberAt(series.snowfall, index),
        weatherCode: readNumberAt(series.weather_code, index),
        windGustKmh: readNumberAt(series.wind_gusts_10m, index),
      });
    })
    .filter((sample): sample is WeatherSample => Boolean(sample));
}

function getCurrentCondition(
  current: OpenMeteoCurrentWeather | undefined,
  samples: WeatherSample[],
  now: Date,
): WeatherCondition | undefined {
  if (current) {
    const currentSample = createSample({
      time: parseOpenMeteoTime(current.time) ?? now,
      temperatureC: current.temperature_2m,
      apparentTemperatureC: current.apparent_temperature,
      precipitation: current.precipitation,
      rain: current.rain,
      showers: current.showers,
      snowfall: current.snowfall,
      weatherCode: current.weather_code,
      windGustKmh: current.wind_gusts_10m,
    });

    return sampleToCondition(currentSample);
  }

  const nearestSample = samples.find(
    (sample) => Math.abs(sample.time.getTime() - now.getTime()) <= 60 * 60_000,
  );

  return nearestSample ? sampleToCondition(nearestSample) : undefined;
}

function findPriorityAlert(
  samples: WeatherSample[],
  payload: OpenMeteoForecastPayload,
  now: Date,
  lookaheadMinutes: number,
): WeatherAlert | undefined {
  const windowEnd = new Date(now.getTime() + lookaheadMinutes * 60_000);
  const candidates = samples.filter(
    (sample) =>
      sample.kind !== "normal" &&
      sample.time.getTime() >= now.getTime() - 20 * 60_000 &&
      sample.time.getTime() <= windowEnd.getTime(),
  );

  const heatAlert = findDailyHeatAlert(payload, now, windowEnd);

  if (heatAlert) {
    candidates.push(heatAlert);
  }

  if (candidates.length === 0) {
    return undefined;
  }

  const selected = candidates.sort(
    (left, right) =>
      WEATHER_PRIORITY[right.kind] - WEATHER_PRIORITY[left.kind] ||
      left.time.getTime() - right.time.getTime(),
  )[0];
  const eventStart = findEventBoundary(samples, selected, -1) ?? selected.time;
  const effectiveStart = eventStart.getTime() < now.getTime() ? now : eventStart;
  const eventEnd = findEventBoundary(samples, selected, 1);
  const endsInMinutes = eventEnd
    ? Math.max(0, Math.round((eventEnd.getTime() - now.getTime()) / 60_000))
    : undefined;

  return {
    kind: selected.kind as WeatherAlert["kind"],
    label: getWeatherLabel(selected.kind),
    startsAt: effectiveStart.toISOString(),
    startsInMinutes: Math.max(
      0,
      Math.round((effectiveStart.getTime() - now.getTime()) / 60_000),
    ),
    umbrellaAfter:
      selected.kind === "rain" || selected.kind === "storm"
        ? effectiveStart.toISOString()
        : undefined,
    endsAt: eventEnd?.toISOString(),
    endsInMinutes:
      typeof endsInMinutes === "number" && endsInMinutes <= 120
        ? endsInMinutes
        : undefined,
    intensity: selected.intensity,
    temperatureC: selected.temperatureC,
    apparentTemperatureC: selected.apparentTemperatureC,
  };
}

function findDailyHeatAlert(
  payload: OpenMeteoForecastPayload,
  now: Date,
  windowEnd: Date,
): WeatherSample | undefined {
  const maxTemperatures = payload.daily?.temperature_2m_max ?? [];
  const maxApparentTemperatures = payload.daily?.apparent_temperature_max ?? [];
  const timeValues = payload.daily?.time ?? [];

  for (let index = 0; index < timeValues.length; index += 1) {
    const time = parseOpenMeteoTime(timeValues[index]);
    const temperatureC = readNumberAt(maxTemperatures, index);
    const apparentTemperatureC = readNumberAt(maxApparentTemperatures, index);
    const strongestTemperature = Math.max(
      temperatureC ?? Number.NEGATIVE_INFINITY,
      apparentTemperatureC ?? Number.NEGATIVE_INFINITY,
    );

    if (!time || strongestTemperature < 32) {
      continue;
    }

    const sample: WeatherSample = {
      time:
        time.getTime() < now.getTime()
          ? now
          : new Date(time.getTime() + 14 * 60 * 60_000),
      kind: "heat",
      intensity: getHeatIntensity(strongestTemperature),
      temperatureC,
      apparentTemperatureC,
    };

    if (sample.time <= windowEnd) {
      return sample;
    }
  }

  return undefined;
}

function findEventBoundary(
  samples: WeatherSample[],
  selected: WeatherSample,
  direction: -1 | 1,
): Date | undefined {
  const selectedIndex = samples.findIndex(
    (sample) => sample.time.getTime() === selected.time.getTime(),
  );

  if (selectedIndex < 0) {
    return undefined;
  }

  let cursor = selectedIndex;
  while (
    samples[cursor + direction] &&
    samples[cursor + direction].kind === selected.kind
  ) {
    cursor += direction;
  }

  return direction === -1
    ? samples[cursor].time
    : samples[cursor + 1]?.time;
}

function createSample(input: {
  time: Date;
  temperatureC?: number;
  apparentTemperatureC?: number;
  precipitation?: number;
  rain?: number;
  showers?: number;
  snowfall?: number;
  weatherCode?: number;
  windGustKmh?: number;
}): WeatherSample {
  const code = Math.round(input.weatherCode ?? 0);
  const precipitation = Math.max(
    0,
    input.precipitation ?? 0,
    input.rain ?? 0,
    input.showers ?? 0,
  );
  const snowfall = Math.max(0, input.snowfall ?? 0);
  const apparentOrAir = Math.max(
    input.temperatureC ?? Number.NEGATIVE_INFINITY,
    input.apparentTemperatureC ?? Number.NEGATIVE_INFINITY,
  );

  if (isStormCode(code) || (input.windGustKmh ?? 0) >= 70) {
    return {
      ...input,
      kind: "storm",
      intensity: getPrecipitationIntensity(Math.max(precipitation, 1.5)),
    };
  }

  if (isSnowCode(code) || snowfall > 0) {
    return {
      ...input,
      kind: "snow",
      intensity: getSnowIntensity(snowfall),
    };
  }

  if (apparentOrAir >= 32) {
    return {
      ...input,
      kind: "heat",
      intensity: getHeatIntensity(apparentOrAir),
    };
  }

  if (isRainCode(code) || precipitation > 0) {
    return {
      ...input,
      kind: "rain",
      intensity: getPrecipitationIntensity(precipitation),
    };
  }

  return {
    ...input,
    kind: "normal",
    intensity: 1,
  };
}

function sampleToCondition(sample: WeatherSample): WeatherCondition {
  return {
    kind: sample.kind,
    label: getWeatherLabel(sample.kind),
    intensity: sample.intensity,
    temperatureC: sample.temperatureC,
    apparentTemperatureC: sample.apparentTemperatureC,
  };
}

function weatherAlertToCondition(alert: WeatherAlert): WeatherCondition {
  return {
    kind: alert.kind,
    label: alert.label,
    intensity: alert.intensity,
    temperatureC: alert.temperatureC,
    apparentTemperatureC: alert.apparentTemperatureC,
  };
}

function createNormalCondition(
  current?: OpenMeteoCurrentWeather,
): WeatherCondition {
  return {
    kind: "normal",
    label: getWeatherLabel("normal"),
    intensity: 1,
    temperatureC: current?.temperature_2m,
    apparentTemperatureC: current?.apparent_temperature,
  };
}

function parseOpenMeteoTime(value?: string | number): Date | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000);
  }

  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function readNumberAt(values: number[] | undefined, index: number): number | undefined {
  const value = values?.[index];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRainCode(code: number): boolean {
  return (
    [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)
  );
}

function isSnowCode(code: number): boolean {
  return [71, 73, 75, 77, 85, 86].includes(code);
}

function isStormCode(code: number): boolean {
  return [95, 96, 99].includes(code);
}

function getPrecipitationIntensity(amountMm: number): WeatherIntensity {
  if (amountMm >= 4) {
    return 3;
  }

  if (amountMm >= 1.2) {
    return 2;
  }

  return 1;
}

function getSnowIntensity(amountMm: number): WeatherIntensity {
  if (amountMm >= 2.5) {
    return 3;
  }

  if (amountMm >= 0.7) {
    return 2;
  }

  return 1;
}

function getHeatIntensity(temperatureC: number): WeatherIntensity {
  if (temperatureC >= 38) {
    return 3;
  }

  if (temperatureC >= 35) {
    return 2;
  }

  return 1;
}

function getWeatherLabel(kind: WeatherConditionKind): string {
  return {
    normal: "Temps calme",
    rain: "Pluie",
    storm: "Orage",
    snow: "Neige",
    heat: "Canicule",
  }[kind];
}

function getWeatherCodeLabel(code?: number): string {
  if (typeof code !== "number") {
    return "Météo indisponible";
  }

  if (code === 0) {
    return "Ciel dégagé";
  }

  if ([1, 2, 3].includes(code)) {
    return "Nuageux dans l'ensemble";
  }

  if ([45, 48].includes(code)) {
    return "Brouillard";
  }

  if ([51, 53, 55, 56, 57].includes(code)) {
    return "Bruine";
  }

  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return "Pluie";
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return "Neige";
  }

  if ([95, 96, 99].includes(code)) {
    return "Orage";
  }

  return "Météo variable";
}
