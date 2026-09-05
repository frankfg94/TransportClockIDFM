<script setup lang="ts">
import { computed, ref } from "vue";
import type { MonthlySeriesPoint } from "../../types/ridership";
import { movingAverage } from "./monthlyRidership";

const props = withDefaults(defineProps<{
  series: MonthlySeriesPoint[];
  color: string;
  label: string;
  locale?: "fr" | "en";
  showMovingAverage?: boolean;
  compact?: boolean;
}>(), {
  showMovingAverage: false,
  compact: false,
  locale: "fr",
});

const width = computed(() => props.compact ? 520 : 760);
const height = computed(() => props.compact ? 170 : 300);
const padding = computed(() => props.compact
  ? { top: 12, right: 12, bottom: 30, left: 48 }
  : { top: 22, right: 22, bottom: 42, left: 58 });
const observedValues = computed(() => props.series
  .map((point) => point.value)
  .filter((value): value is number => typeof value === "number" && Number.isFinite(value)));
const maximum = computed(() => Math.max(1, ...observedValues.value));
const chartWidth = computed(() => width.value - padding.value.left - padding.value.right);
const chartHeight = computed(() => height.value - padding.value.top - padding.value.bottom);
const plotted = computed(() => props.series.map((point, index) => ({
  ...point,
  index,
  x: xFor(index, props.series.length),
  y: point.value === null ? null : yFor(point.value),
})));
const averagePlotted = computed(() => movingAverage(props.series).map((point, index) => ({
  ...point,
  index,
  x: xFor(index, props.series.length),
  y: point.value === null ? null : yFor(point.value),
})));
const rawRows = computed(() => props.series.filter((point) => point.value !== null));
const linePath = computed(() => makePath(plotted.value));
const averagePath = computed(() => makePath(averagePlotted.value));
const yTicks = computed(() => [0, maximum.value / 2, maximum.value]);
const hoveredMonth = ref<string | null>(null);
const hoveredPoint = computed(() => plotted.value.find((point) => point.month === hoveredMonth.value && point.y !== null));
const tooltipWidth = computed(() => props.compact ? 142 : 156);
const tooltipHeight = 40;
const tooltipX = computed(() => {
  const point = hoveredPoint.value;
  if (!point) return 0;
  return clamp(
    point.x - tooltipWidth.value / 2,
    padding.value.left,
    width.value - padding.value.right - tooltipWidth.value,
  );
});
const tooltipY = computed(() => {
  const point = hoveredPoint.value;
  if (!point || point.y === null) return 0;
  const above = point.y - tooltipHeight - 10;
  if (above >= padding.value.top) return above;
  return Math.min(
    point.y + 10,
    height.value - padding.value.bottom - tooltipHeight,
  );
});

function xFor(index: number, count: number): number {
  if (count <= 1) return padding.value.left + chartWidth.value / 2;
  return padding.value.left + (index / (count - 1)) * chartWidth.value;
}

function yFor(value: number): number {
  return padding.value.top + chartHeight.value - (value / maximum.value) * chartHeight.value;
}

function clamp(value: number, minimum: number, maximumValue: number): number {
  return Math.min(Math.max(value, minimum), maximumValue);
}

function makePath(points: Array<{ x: number; y: number | null }>): string {
  let path = "";
  for (const point of points) {
    if (point.y === null) continue;
    const previous = points[point === points[0] ? 0 : points.indexOf(point) - 1];
    const command = !path || !previous || previous.y === null ? "M" : "L";
    path += `${command}${point.x.toFixed(2)} ${point.y.toFixed(2)} `;
  }
  return path.trim();
}

function formatValue(value: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(props.locale === "en" ? "en-US" : "fr-FR", { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function formatMonthLong(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(props.locale === "en" ? "en-US" : "fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}
</script>

<template>
  <figure class="monthly-chart" :class="{ 'monthly-chart--compact': compact }">
    <svg
      class="monthly-chart__svg"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      :aria-label="label"
    >
      <g class="monthly-chart__grid" aria-hidden="true">
        <line
          v-for="tick in yTicks"
          :key="tick"
          :x1="padding.left"
          :x2="width - padding.right"
          :y1="yFor(tick)"
          :y2="yFor(tick)"
        />
      </g>
      <path v-if="showMovingAverage && averagePath" class="monthly-chart__average" :d="averagePath" :stroke="color" aria-hidden="true" />
      <path class="monthly-chart__line" :d="linePath" :stroke="color" aria-hidden="true" />
      <g class="monthly-chart__points">
        <template v-for="point in plotted" :key="point.month">
          <circle
            v-if="point.y !== null"
            :cx="point.x"
            :cy="point.y"
            :r="compact ? 3 : 4"
            :fill="color"
            :aria-label="`${formatMonthLong(point.month)} · ${formatValue(point.value ?? 0)}`"
            tabindex="0"
            @mouseenter="hoveredMonth = point.month"
            @mouseleave="hoveredMonth = null"
            @focus="hoveredMonth = point.month"
            @blur="hoveredMonth = null"
          >
            <title>{{ formatMonthLong(point.month) }} · {{ formatValue(point.value ?? 0) }}</title>
          </circle>
        </template>
      </g>
      <g
        v-if="hoveredPoint"
        class="monthly-chart__tooltip"
        data-testid="monthly-chart-tooltip"
        :transform="`translate(${tooltipX} ${tooltipY})`"
        aria-hidden="true"
      >
        <rect :width="tooltipWidth" :height="tooltipHeight" rx="8" />
        <text x="12" y="16">
          <tspan x="12" dy="0">{{ formatMonthLong(hoveredPoint.month) }}</tspan>
          <tspan x="12" dy="15">{{ formatValue(hoveredPoint.value ?? 0) }}</tspan>
        </text>
      </g>
      <g class="monthly-chart__labels" aria-hidden="true">
        <text :x="padding.left" :y="height - 10">{{ series[0]?.month ?? "" }}</text>
        <text :x="width - padding.right" :y="height - 10" text-anchor="end">{{ series.at(-1)?.month ?? "" }}</text>
        <text :x="padding.left - 9" :y="padding.top + 4" text-anchor="end">{{ formatValue(maximum) }}</text>
        <text :x="padding.left - 9" :y="height - padding.bottom + 4" text-anchor="end">0</text>
      </g>
    </svg>
    <figcaption v-if="rawRows.length" class="monthly-chart__raw">
      <span v-for="point in rawRows" :key="point.month" class="monthly-chart__raw-item">
        <strong>{{ formatMonth(point.month) }}</strong>
        <span>{{ formatValue(point.value ?? 0) }}</span>
      </span>
    </figcaption>
  </figure>
</template>

<style scoped>
.monthly-chart { margin: 0; }
.monthly-chart__svg { display: block; width: 100%; min-height: 220px; overflow: visible; }
.monthly-chart--compact .monthly-chart__svg { min-height: 130px; }
.monthly-chart__grid line { stroke: #e9edf4; stroke-width: 1; stroke-dasharray: 3 5; }
.monthly-chart__line, .monthly-chart__average { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.monthly-chart__line { stroke-width: 3; }
.monthly-chart__average { stroke-width: 2; stroke-dasharray: 6 5; opacity: .52; }
.monthly-chart__points circle { cursor: crosshair; stroke: #fff; stroke-width: 2; }
.monthly-chart__tooltip { pointer-events: none; }
.monthly-chart__tooltip rect { fill: #1f2d49; opacity: .96; }
.monthly-chart__tooltip text { fill: #fff; font-size: 11px; font-weight: 800; }
.monthly-chart__labels { fill: #8491a9; font-size: 11px; font-weight: 700; }
.monthly-chart__raw { display: flex; gap: 6px; max-width: 100%; padding-top: 8px; overflow-x: auto; }
.monthly-chart__raw-item { display: grid; gap: 2px; min-width: 62px; padding: 6px 7px; border: 1px solid #e5eaf3; border-radius: 8px; background: #fbfcff; }
.monthly-chart__raw-item strong { color: #8491a9; font-size: .58rem; font-weight: 850; text-transform: capitalize; }
.monthly-chart__raw-item span { color: #253452; font-size: .68rem; font-weight: 900; }
</style>
