import {
  createError,
  defineEventHandler,
  getQuery,
  setHeader,
  type H3Event,
} from "h3";
import {
  normalizeOpenMeteoWeather,
} from "../../src/features/weather/openMeteo";
import type {
  OpenMeteoForecastPayload,
  WeatherResponse,
  WeatherSettingsLocation,
} from "../../src/features/weather/types";

const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const WEATHER_CACHE_TTL_MS = 10 * 60_000;
const WEATHER_TIMEOUT_MS = 3_500;

interface WeatherCacheEntry {
  expiresAt: number;
  promise: Promise<OpenMeteoForecastPayload>;
}

const weatherCache = new Map<string, WeatherCacheEntry>();

export default defineEventHandler(async (event): Promise<WeatherResponse> => {
  const location = readWeatherLocation(event);
  const lookaheadMinutes = readLookaheadMinutes(event);
  const payload = await fetchCachedOpenMeteoForecast(location);

  setHeader(event, "cache-control", "s-maxage=300, stale-while-revalidate=600");

  return normalizeOpenMeteoWeather(payload, {
    location,
    lookaheadMinutes,
  });
});

function readWeatherLocation(event: H3Event): WeatherSettingsLocation {
  const query = getQuery(event);

  return {
    label:
      typeof query.locationLabel === "string" && query.locationLabel.trim()
        ? query.locationLabel.trim()
        : "Paris",
    latitude: readCoordinate(query.latitude, 48.8566, -90, 90),
    longitude: readCoordinate(query.longitude, 2.3522, -180, 180),
  };
}

function readLookaheadMinutes(event: H3Event): number {
  const value = Number.parseInt(String(getQuery(event).lookaheadMinutes ?? ""), 10);

  return [60, 120, 240, 480, 720, 1440].includes(value) ? value : 1440;
}

function readCoordinate(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numericValue = Number.parseFloat(String(value ?? ""));

  return Number.isFinite(numericValue)
    ? Math.min(max, Math.max(min, numericValue))
    : fallback;
}

async function fetchCachedOpenMeteoForecast(
  location: WeatherSettingsLocation,
): Promise<OpenMeteoForecastPayload> {
  const cacheKey = `${location.latitude.toFixed(4)}:${location.longitude.toFixed(4)}`;
  const cached = weatherCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = fetchOpenMeteoForecast(location);
  weatherCache.set(cacheKey, {
    expiresAt: now + WEATHER_CACHE_TTL_MS,
    promise,
  });

  return promise.catch((error) => {
    weatherCache.delete(cacheKey);
    throw error;
  });
}

async function fetchOpenMeteoForecast(
  location: WeatherSettingsLocation,
): Promise<OpenMeteoForecastPayload> {
  const url = new URL(OPEN_METEO_FORECAST_URL);
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set(
    "current",
    [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation",
      "rain",
      "showers",
      "snowfall",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
    ].join(","),
  );
  url.searchParams.set(
    "minutely_15",
    [
      "temperature_2m",
      "apparent_temperature",
      "precipitation",
      "rain",
      "snowfall",
      "weather_code",
      "wind_gusts_10m",
    ].join(","),
  );
  url.searchParams.set(
    "hourly",
    [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation_probability",
      "precipitation",
      "rain",
      "snowfall",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
    ].join(","),
  );
  url.searchParams.set(
    "daily",
    [
      "temperature_2m_max",
      "temperature_2m_min",
      "apparent_temperature_max",
      "precipitation_probability_max",
      "precipitation_sum",
      "rain_sum",
      "snowfall_sum",
      "weather_code",
      "wind_speed_10m_max",
      "wind_gusts_10m_max",
    ].join(","),
  );
  url.searchParams.set("forecast_days", "8");
  url.searchParams.set("timezone", "Europe/Paris");

  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `Open-Meteo request failed: ${response.status} ${response.statusText}`,
    });
  }

  return (await response.json()) as OpenMeteoForecastPayload;
}

async function fetchWithTimeout(url: URL): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);

  try {
    return await fetch(url, {
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
