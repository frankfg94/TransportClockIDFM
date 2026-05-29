<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Sun,
  Wind,
  X,
} from "lucide-vue-next";
import { useAppSettings } from "../app-settings";
import { resolveWeatherLocation } from "./weatherLocations";
import type {
  WeatherForecastDay,
  WeatherForecastHour,
  WeatherResponse,
} from "./types";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

type ForecastMetric = "temperature" | "precipitation" | "wind";

const CHART_MIN_WIDTH = 560;
const CHART_POINT_SPACING = 72;
const CHART_HORIZONTAL_PADDING = 28;
const CHART_HEIGHT = 140;
const CHART_BASELINE_Y = 126;

const { settings } = useAppSettings();

const weather = ref<WeatherResponse>();
const loading = ref(false);
const error = ref("");
const activeMetric = ref<ForecastMetric>("temperature");
const selectedDayIndex = ref(0);
const chartScrollElement = ref<HTMLElement>();

const location = computed(() =>
  resolveWeatherLocation(
    settings.value.weatherLocationPreset,
    settings.value.weatherCustomLocation,
  ),
);

const current = computed(() => weather.value?.forecast?.current);
const daily = computed(() => weather.value?.forecast?.daily.slice(0, 8) ?? []);
const selectedDayForecast = computed(() => daily.value[selectedDayIndex.value]);

const hourly = computed(() => {
  const hours = weather.value?.forecast?.hourly ?? [];
  const selectedDay = selectedDayForecast.value;

  if (!selectedDay) {
    return hours;
  }

  const selectedDayKey = getDateKey(selectedDay.date);
  const selectedHours = hours.filter(
    (hour) => getDateKey(hour.time) === selectedDayKey,
  );

  return selectedHours.length > 0 ? selectedHours : hours;
});

const currentIcon = computed(() => weatherIcon(current.value?.weatherCode));

const modalTitleTime = computed(() =>
  selectedDayForecast.value
    ? formatDayTitle(selectedDayForecast.value.date)
    : `${formatDay(current.value?.time)} ${formatHour(current.value?.time)}`,
);

const modalTitleLabel = computed(
  () =>
    selectedDayForecast.value?.label ??
    current.value?.label ??
    weather.value?.condition.label ??
    "Prévision",
);

const chartValues = computed(() =>
  hourly.value
    .map((hour) => ({
      hour,
      value: getMetricValue(hour, activeMetric.value),
    }))
    .filter(
      (point): point is { hour: WeatherForecastHour; value: number } =>
        typeof point.value === "number",
    ),
);

const chartWidth = computed(() =>
  Math.max(
    CHART_MIN_WIDTH,
    CHART_HORIZONTAL_PADDING * 2 +
      Math.max(0, chartValues.value.length - 1) * CHART_POINT_SPACING,
  ),
);

const chartPoints = computed(() => {
  const values = chartValues.value;

  if (values.length === 0) {
    return [];
  }

  const metric = activeMetric.value;
  const min =
    metric === "precipitation"
      ? 0
      : Math.min(...values.map((point) => point.value));
  const max =
    metric === "precipitation"
      ? Math.max(20, ...values.map((point) => point.value))
      : Math.max(...values.map((point) => point.value));
  const range = Math.max(1, max - min);

  return values.map((point, index) => {
    const x =
      values.length === 1
        ? chartWidth.value / 2
        : CHART_HORIZONTAL_PADDING + index * CHART_POINT_SPACING;
    const y = 112 - ((point.value - min) / range) * 74;

    return {
      ...point,
      x,
      y,
      label: formatMetricValue(point.value, metric),
    };
  });
});

const chartLine = computed(() =>
  chartPoints.value
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" "),
);

const chartArea = computed(() => {
  const points = chartPoints.value;

  if (points.length === 0) {
    return "";
  }

  const first = points[0];
  const last = points[points.length - 1];

  return `${chartLine.value} L ${last.x} ${CHART_BASELINE_Y} L ${first.x} ${CHART_BASELINE_Y} Z`;
});

watch(
  () => [
    props.open,
    location.value.latitude,
    location.value.longitude,
    settings.value.weatherLookaheadMinutes,
  ],
  () => {
    if (props.open) {
      void loadWeather();
    }
  },
  { immediate: true },
);

async function loadWeather(): Promise<void> {
  if (loading.value) {
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
    selectDefaultDay();
    scrollChartToStart();
  } catch (fetchError) {
    error.value =
      fetchError instanceof Error
        ? fetchError.message
        : "Impossible de charger la météo.";
  } finally {
    loading.value = false;
  }
}

function selectDay(index: number): void {
  selectedDayIndex.value = index;
  scrollChartToStart();
}

function isSelectedDay(index: number): boolean {
  return selectedDayIndex.value === index;
}

function selectDefaultDay(): void {
  const days = daily.value;

  if (days.length === 0) {
    selectedDayIndex.value = 0;
    return;
  }

  const currentDateKey = getDateKey(current.value?.time);
  const currentDayIndex = days.findIndex(
    (day) => getDateKey(day.date) === currentDateKey,
  );

  selectedDayIndex.value = currentDayIndex >= 0 ? currentDayIndex : 0;
}

function getDateKey(value?: string): string {
  if (!value) {
    return "";
  }

  const datePrefix = value.match(/^(\d{4}-\d{2}-\d{2})/);

  if (datePrefix) {
    return datePrefix[1];
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getMetricValue(
  hour: WeatherForecastHour,
  metric: ForecastMetric,
): number | undefined {
  if (metric === "precipitation") {
    return hour.precipitationProbabilityPercent ?? hour.precipitationMm;
  }

  if (metric === "wind") {
    return hour.windSpeedKmh ?? hour.windGustKmh;
  }

  return hour.temperatureC;
}

function formatMetricValue(value: number, metric: ForecastMetric): string {
  if (metric === "precipitation") {
    return `${Math.round(value)}%`;
  }

  if (metric === "wind") {
    return `${Math.round(value)} km/h`;
  }

  return `${Math.round(value)}°`;
}

function formatTemperature(value?: number): string {
  return typeof value === "number" ? `${Math.round(value)}°` : "--°";
}

function formatPercent(value?: number): string {
  return typeof value === "number" ? `${Math.round(value)}%` : "--";
}

function formatWind(value?: number): string {
  return typeof value === "number" ? `${Math.round(value)} km/h` : "--";
}

function formatHour(value?: string): string {
  if (!value) {
    return "--:--";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "--:--"
    : new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function formatDay(value?: string): string {
  if (!value) {
    return "--";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "--"
    : new Intl.DateTimeFormat("fr-FR", {
        weekday: "short",
      })
        .format(date)
        .replace(".", "");
}

function formatDayTitle(value?: string): string {
  if (!value) {
    return "--";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "--"
    : new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }).format(date);
}

function handleChartWheel(event: WheelEvent): void {
  const element = chartScrollElement.value;

  if (!element || element.scrollWidth <= element.clientWidth) {
    return;
  }

  const delta =
    Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;

  if (delta === 0) {
    return;
  }

  const maxScrollLeft = element.scrollWidth - element.clientWidth;
  const nextScrollLeft = Math.min(
    maxScrollLeft,
    Math.max(0, element.scrollLeft + delta),
  );

  if (nextScrollLeft === element.scrollLeft) {
    return;
  }

  event.preventDefault();
  element.scrollLeft = nextScrollLeft;
}

function scrollChartToStart(): void {
  void nextTick(() => {
    window.requestAnimationFrame(() => {
      chartScrollElement.value?.scrollTo({
        left: 0,
        behavior: "smooth",
      });
    });
  });
}

function dayIcon(day: WeatherForecastDay) {
  return weatherIcon(day.weatherCode);
}

function weatherIcon(code?: number) {
  if (typeof code !== "number") {
    return Cloud;
  }

  if (code === 0) {
    return Sun;
  }

  if ([1, 2].includes(code)) {
    return CloudSun;
  }

  if ([45, 48].includes(code)) {
    return CloudFog;
  }

  if ([61, 63, 65, 66, 67, 80, 81, 82, 51, 53, 55, 56, 57].includes(code)) {
    return CloudRain;
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return CloudSnow;
  }

  if ([95, 96, 99].includes(code)) {
    return CloudLightning;
  }

  return Cloud;
}
</script>

<template>
  <Transition name="weather-modal">
    <div
      v-if="open"
      class="weather-modal-backdrop"
      role="presentation"
      @click.self="emit('close')"
    >
      <section
        class="weather-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="weather-modal-title"
      >
        <button
          class="weather-modal__close icon-button"
          type="button"
          aria-label="Fermer la météo"
          @click="emit('close')"
        >
          <X aria-hidden="true" />
        </button>

        <div class="weather-modal__main">
          <div class="weather-modal__current">
            <component :is="currentIcon" class="weather-modal__icon" />
            <div class="weather-modal__temperature">
              <strong>{{ formatTemperature(current?.temperatureC) }}</strong>
              <span>°C | °F</span>
            </div>

            <dl class="weather-modal__stats">
              <div>
                <dt>Précipitations</dt>
                <dd>
                  {{ formatPercent(current?.precipitationProbabilityPercent) }}
                </dd>
              </div>
              <div>
                <dt>Humidité</dt>
                <dd>{{ formatPercent(current?.humidityPercent) }}</dd>
              </div>
              <div>
                <dt>Vent</dt>
                <dd>{{ formatWind(current?.windSpeedKmh) }}</dd>
              </div>
            </dl>
          </div>

          <div class="weather-modal__title">
            <h2 id="weather-modal-title">Météo</h2>
            <p>{{ modalTitleTime }}</p>
            <strong>{{ modalTitleLabel }}</strong>
            <span>{{ location.label }}</span>
          </div>
        </div>

        <div
          class="weather-modal__tabs"
          role="tablist"
          aria-label="Données météo"
        >
          <button
            type="button"
            :class="{
              'weather-modal__tab--active': activeMetric === 'temperature',
            }"
            @click="activeMetric = 'temperature'"
          >
            Température
          </button>
          <button
            type="button"
            :class="{
              'weather-modal__tab--active': activeMetric === 'precipitation',
            }"
            @click="activeMetric = 'precipitation'"
          >
            Précipitations
          </button>
          <button
            type="button"
            :class="{ 'weather-modal__tab--active': activeMetric === 'wind' }"
            @click="activeMetric = 'wind'"
          >
            Vent
          </button>
        </div>

        <div v-if="loading" class="weather-modal__state">
          Chargement de la météo...
        </div>

        <div
          v-else-if="error"
          class="weather-modal__state weather-modal__state--error"
        >
          {{ error }}
        </div>

        <template v-else>
          <div class="weather-modal__chart">
            <div
              ref="chartScrollElement"
              class="weather-modal__chart-scroll"
              tabindex="0"
              aria-label="Prévisions horaires défilables horizontalement"
              @wheel="handleChartWheel"
            >
              <div
                class="weather-modal__chart-inner"
                :style="{ width: `${chartWidth}px` }"
              >
                <svg
                  :viewBox="`0 0 ${chartWidth} ${CHART_HEIGHT}`"
                  role="img"
                  aria-label="Prévisions horaires"
                >
                  <path
                    v-if="chartArea"
                    :d="chartArea"
                    class="weather-modal__area"
                  />
                  <path
                    v-if="chartLine"
                    :d="chartLine"
                    class="weather-modal__line"
                  />
                  <g v-for="point in chartPoints" :key="point.hour.time">
                    <text :x="point.x" :y="Math.max(18, point.y - 10)">
                      {{ point.label }}
                    </text>
                  </g>
                </svg>

                <div class="weather-modal__hours">
                  <span
                    v-for="point in chartPoints"
                    :key="point.hour.time"
                    :style="{ left: `${point.x}px` }"
                  >
                    {{ formatHour(point.hour.time) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="weather-modal__days">
            <button
              v-for="(day, index) in daily"
              :key="day.date"
              class="weather-modal__day"
              :class="{ 'weather-modal__day--selected': isSelectedDay(index) }"
              type="button"
              :aria-pressed="isSelectedDay(index)"
              @click="selectDay(index)"
            >
              <span>{{ formatDay(day.date) }}</span>
              <component :is="dayIcon(day)" />
              <strong>
                {{ formatTemperature(day.temperatureMaxC) }}
                <small>{{ formatTemperature(day.temperatureMinC) }}</small>
              </strong>
            </button>
          </div>
        </template>

        <div class="weather-modal__footer">
          <span>
            <Droplets aria-hidden="true" />
            {{ weather?.source === "test" ? "Mode test" : "Open-Meteo" }}
          </span>
          <span>
            <Wind aria-hidden="true" />
            Mise à jour {{ formatHour(weather?.generatedAt) }}
          </span>
        </div>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.weather-modal-backdrop {
  align-items: center;
  background: rgba(15, 23, 42, 0.32);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 24px;
  position: fixed;
  z-index: 80;
}

.weather-modal {
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(16, 35, 63, 0.12);
  border-radius: 8px;
  box-shadow: 0 28px 90px rgba(15, 23, 42, 0.28);
  color: var(--ink);
  max-height: min(760px, calc(100vh - 48px));
  max-width: min(760px, calc(100vw - 32px));
  overflow: auto;
  padding: 26px 30px 24px;
  position: relative;
  width: 100%;
}

.weather-modal__close {
  position: absolute;
  right: 18px;
  top: 18px;
}

.weather-modal__close svg {
  height: 18px;
  width: 18px;
}

.weather-modal__main {
  align-items: start;
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(0, 1fr) auto;
  padding-right: 48px;
}

.weather-modal__current {
  align-items: center;
  display: flex;
  gap: 18px;
  min-width: 0;
}

.weather-modal__icon {
  color: #f2b705;
  filter: drop-shadow(0 8px 12px rgba(16, 35, 63, 0.16));
  height: 62px;
  width: 62px;
}

.weather-modal__temperature {
  align-items: start;
  display: flex;
  gap: 8px;
}

.weather-modal__temperature strong {
  color: #202124;
  font-size: 3.2rem;
  font-weight: 500;
  line-height: 0.95;
}

.weather-modal__temperature span {
  color: #202124;
  font-size: 1rem;
  padding-top: 4px;
}

.weather-modal__stats {
  color: #5f6368;
  display: grid;
  font-size: 0.9rem;
  gap: 3px;
  margin: 0;
}

.weather-modal__stats div {
  display: flex;
  gap: 5px;
}

.weather-modal__stats dt,
.weather-modal__stats dd {
  margin: 0;
}

.weather-modal__title {
  color: #4b5563;
  display: grid;
  gap: 2px;
  justify-items: end;
  text-align: right;
}

.weather-modal__title h2 {
  color: #202124;
  font-size: 1.7rem;
  font-weight: 500;
}

.weather-modal__title strong {
  color: #5f6368;
  font-size: 1.08rem;
  font-weight: 500;
}

.weather-modal__title span {
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 800;
}

.weather-modal__tabs {
  border-bottom: 1px solid #dadce0;
  display: flex;
  gap: 0;
  margin-top: 22px;
}

.weather-modal__tabs button {
  background: transparent;
  border-radius: 0;
  color: #202124;
  font-weight: 500;
  min-height: 42px;
  padding: 0 18px;
  position: relative;
}

.weather-modal__tabs button + button {
  border-left: 1px solid #dadce0;
}

.weather-modal__tabs button:hover:not(:disabled) {
  background: #f8fafc;
  transform: none;
}

.weather-modal__tab--active::after {
  background: #f2c200;
  bottom: -1px;
  content: "";
  height: 3px;
  left: 0;
  position: absolute;
  right: 0;
}

.weather-modal__state {
  color: var(--muted);
  font-weight: 850;
  padding: 36px 0;
  text-align: center;
}

.weather-modal__state--error {
  color: #b42318;
}

.weather-modal__chart {
  margin-top: 16px;
}

.weather-modal__chart-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 10px;
  scrollbar-color: #cbd5e1 transparent;
  scrollbar-width: thin;
}

.weather-modal__chart-scroll:focus-visible {
  outline: 2px solid rgba(242, 194, 0, 0.75);
  outline-offset: 4px;
}

.weather-modal__chart-scroll::-webkit-scrollbar {
  height: 8px;
}

.weather-modal__chart-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.weather-modal__chart-scroll::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 999px;
}

.weather-modal__chart-inner {
  min-width: 100%;
}

.weather-modal__chart svg {
  display: block;
  height: 150px;
  width: 100%;
}

.weather-modal__area {
  fill: rgba(252, 211, 77, 0.28);
}

.weather-modal__line {
  fill: none;
  stroke: #f2c200;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3;
}

.weather-modal__chart text {
  fill: #9aa0a6;
  font-size: 12px;
  font-weight: 800;
  text-anchor: middle;
}

.weather-modal__hours {
  color: #5f6368;
  font-size: 0.86rem;
  height: 22px;
  margin-top: -10px;
  position: relative;
  text-align: center;
}

.weather-modal__hours span {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  white-space: nowrap;
}

.weather-modal__days {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(8, minmax(68px, 1fr));
  margin-top: 18px;
}

.weather-modal__day {
  align-items: center;
  background: transparent;
  border-radius: 8px;
  color: inherit;
  display: grid;
  gap: 8px;
  justify-items: center;
  min-height: 104px;
  padding: 10px 8px;
  transition:
    background 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.weather-modal__day:hover:not(:disabled) {
  background: #f8fafc;
  transform: translateY(-1px);
}

.weather-modal__day--selected {
  background: #f1f3f4;
  box-shadow: inset 0 0 0 2px rgba(242, 194, 0, 0.86);
}

.weather-modal__day--selected:hover:not(:disabled) {
  background: #f1f3f4;
}

.weather-modal__day span {
  color: #202124;
  font-size: 1rem;
  font-weight: 500;
}

.weather-modal__day svg {
  color: #f2b705;
  height: 34px;
  width: 34px;
}

.weather-modal__day strong {
  color: #202124;
  font-size: 0.9rem;
  font-weight: 500;
}

.weather-modal__day small {
  color: #5f6368;
  font-size: 0.9rem;
  font-weight: 500;
}

.weather-modal__footer {
  border-top: 1px solid #dadce0;
  color: var(--muted);
  display: flex;
  font-size: 0.82rem;
  font-weight: 800;
  gap: 20px;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 14px;
}

.weather-modal__footer span {
  align-items: center;
  display: inline-flex;
  gap: 6px;
}

.weather-modal__footer svg {
  height: 15px;
  width: 15px;
}

.weather-modal-enter-active,
.weather-modal-leave-active {
  transition: opacity 180ms ease;
}

.weather-modal-enter-active .weather-modal,
.weather-modal-leave-active .weather-modal {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.weather-modal-enter-from,
.weather-modal-leave-to {
  opacity: 0;
}

.weather-modal-enter-from .weather-modal,
.weather-modal-leave-to .weather-modal {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

@media (max-width: 820px) {
  .weather-modal__main {
    grid-template-columns: 1fr;
  }

  .weather-modal__title {
    justify-items: start;
    text-align: left;
  }

  .weather-modal__current {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .weather-modal__days {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
