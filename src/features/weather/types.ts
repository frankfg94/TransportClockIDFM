export type WeatherConditionKind = "normal" | "rain" | "storm" | "snow" | "heat";

export type WeatherIntensity = 1 | 2 | 3;

export interface WeatherSettingsLocation {
  label: string;
  latitude: number;
  longitude: number;
}

export interface WeatherCondition {
  kind: WeatherConditionKind;
  label: string;
  intensity: WeatherIntensity;
  temperatureC?: number;
  apparentTemperatureC?: number;
}

export interface WeatherAlert {
  kind: Exclude<WeatherConditionKind, "normal">;
  label: string;
  startsAt: string;
  startsInMinutes: number;
  umbrellaAfter?: string;
  endsAt?: string;
  endsInMinutes?: number;
  intensity: WeatherIntensity;
  temperatureC?: number;
  apparentTemperatureC?: number;
}

export interface WeatherResponse {
  generatedAt: string;
  source: "open-meteo" | "test";
  location: WeatherSettingsLocation;
  condition: WeatherCondition;
  alert?: WeatherAlert;
  forecast?: WeatherForecast;
}

export interface WeatherForecast {
  current?: WeatherForecastCurrent;
  hourly: WeatherForecastHour[];
  daily: WeatherForecastDay[];
}

export interface WeatherForecastCurrent {
  time?: string;
  label: string;
  weatherCode?: number;
  temperatureC?: number;
  apparentTemperatureC?: number;
  humidityPercent?: number;
  precipitationMm?: number;
  precipitationProbabilityPercent?: number;
  windSpeedKmh?: number;
  windGustKmh?: number;
}

export interface WeatherForecastHour {
  time: string;
  label: string;
  weatherCode?: number;
  temperatureC?: number;
  apparentTemperatureC?: number;
  humidityPercent?: number;
  precipitationMm?: number;
  precipitationProbabilityPercent?: number;
  windSpeedKmh?: number;
  windGustKmh?: number;
}

export interface WeatherForecastDay {
  date: string;
  label: string;
  weatherCode?: number;
  temperatureMaxC?: number;
  temperatureMinC?: number;
  apparentTemperatureMaxC?: number;
  precipitationMm?: number;
  precipitationProbabilityPercent?: number;
  windSpeedMaxKmh?: number;
  windGustMaxKmh?: number;
}

export interface OpenMeteoForecastPayload {
  current?: OpenMeteoCurrentWeather;
  minutely_15?: OpenMeteoWeatherSeries;
  forecast_minutely_15?: OpenMeteoWeatherSeries;
  hourly?: OpenMeteoWeatherSeries;
  daily?: OpenMeteoDailyWeatherSeries;
  utc_offset_seconds?: number;
}

export interface OpenMeteoCurrentWeather {
  time?: string | number;
  temperature_2m?: number;
  apparent_temperature?: number;
  relative_humidity_2m?: number;
  precipitation?: number;
  rain?: number;
  showers?: number;
  snowfall?: number;
  weather_code?: number;
  wind_speed_10m?: number;
  wind_gusts_10m?: number;
}

export interface OpenMeteoWeatherSeries {
  time?: Array<string | number>;
  temperature_2m?: number[];
  apparent_temperature?: number[];
  relative_humidity_2m?: number[];
  precipitation_probability?: number[];
  precipitation?: number[];
  rain?: number[];
  showers?: number[];
  snowfall?: number[];
  weather_code?: number[];
  wind_speed_10m?: number[];
  wind_gusts_10m?: number[];
}

export interface OpenMeteoDailyWeatherSeries {
  time?: Array<string | number>;
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  apparent_temperature_max?: number[];
  precipitation_probability_max?: number[];
  precipitation_sum?: number[];
  rain_sum?: number[];
  snowfall_sum?: number[];
  weather_code?: number[];
  wind_speed_10m_max?: number[];
  wind_gusts_10m_max?: number[];
}
