<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "../i18n";
import { calculateDvfPriceChanges, formatDvfPriceChange } from "../services/real-estate/priceTrends";
import type { DvfYearlyPrice } from "../services/real-estate/compiledRealEstate";

const props = withDefaults(defineProps<{
  series?: readonly DvfYearlyPrice[];
  measure?: "mean" | "median";
}>(), { measure: "median" });

const { n, t } = useI18n();

const chartPoints = computed(() => {
  const values = (props.series ?? [])
    .filter((point) => point.transactionCount >= 5)
    .map((point) => ({
      year: point.year,
      value: props.measure === "mean" ? point.meanPriceM2 : point.medianPriceM2,
    }))
    .filter((point) => Number.isFinite(point.value) && point.value > 0)
    .sort((left, right) => left.year - right.year);
  if (values.length < 2) return [];

  const years = values.map((point) => point.year);
  const prices = values.map((point) => point.value);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || Math.max(maxPrice * .04, 1);
  const yearRange = Math.max(1, maxYear - minYear);
  return values.map((point) => ({
    year: point.year,
    x: 3 + ((point.year - minYear) / yearRange) * 72,
    y: 22 - ((point.value - minPrice) / priceRange) * 16,
  }));
});

const changes = computed(() => calculateDvfPriceChanges(props.series, props.measure));
const pointString = computed(() => chartPoints.value.map((point) => `${point.x},${point.y}`).join(" "));
const firstYear = computed(() => chartPoints.value[0]?.year);
const lastYear = computed(() => chartPoints.value.at(-1)?.year);

function periodLabel(change: { period: 1 | 3 | 5; fromYear: number; toYear: number }): string {
  // The available DVF release currently contains five calendar vintages
  // (2021–2025), not six endpoints for a strict five-elapsed-year comparison.
  // Show the actual dates on the five-vintage value instead of implying 5 years.
  if (change.period === 5) return `${change.fromYear}–${change.toYear}`;
  return t(`nearbyStations.realEstate.trendPeriod${change.period}`);
}

function formatChange(value: number): string {
  return formatDvfPriceChange(value, (amount, maximumFractionDigits) => n(amount, {
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  }));
}
</script>

<template>
  <div
    v-if="chartPoints.length >= 2 || changes.length"
    class="nearby-real-estate-trend"
    role="group"
    :aria-label="t('nearbyStations.realEstate.trendLabel')"
    data-testid="nearby-real-estate-trend"
  >
    <div v-if="chartPoints.length >= 2" class="nearby-real-estate-trend__chart-row">
      <span class="nearby-real-estate-trend__title">
        {{ t("nearbyStations.realEstate.trendLabel") }}
        <small v-if="firstYear && lastYear">{{ firstYear }}–{{ lastYear }}</small>
      </span>
      <svg
        class="nearby-real-estate-trend__chart"
        viewBox="0 0 78 26"
        preserveAspectRatio="none"
        role="img"
        :aria-label="t('nearbyStations.realEstate.trendChartAria', { from: firstYear, to: lastYear })"
      >
        <line x1="2" y1="23" x2="76" y2="23" />
        <polyline :points="pointString" />
        <circle v-for="point in chartPoints" :key="point.year" :cx="point.x" :cy="point.y" r="1.8" />
      </svg>
    </div>
    <div v-if="changes.length" class="nearby-real-estate-trend__changes">
      <span
        v-for="change in changes"
        :key="change.period"
        class="nearby-real-estate-trend__change"
        :title="t('nearbyStations.realEstate.trendIntervalTitle', { from: change.fromYear, to: change.toYear })"
        :aria-label="t('nearbyStations.realEstate.trendChangeAria', { period: periodLabel(change), change: formatChange(change.percent), from: change.fromYear, to: change.toYear })"
        :data-trend-period="change.period"
      >
        <small>{{ periodLabel(change) }}</small>
        <strong>{{ formatChange(change.percent) }}</strong>
      </span>
    </div>
  </div>
</template>

<style scoped>
.nearby-real-estate-trend {
  border-top: 1px solid rgba(148, 89, 101, .12);
  display: grid;
  gap: 4px;
  margin-top: 2px;
  padding-top: 5px;
}
.nearby-real-estate-trend__chart-row {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  min-width: 0;
}
.nearby-real-estate-trend__title {
  color: #66515a;
  font-size: .65rem;
  font-weight: 760;
  line-height: 1.25;
}
.nearby-real-estate-trend__title small {
  color: #8b7a80;
  display: block;
  font-size: .58rem;
  font-weight: 560;
}
.nearby-real-estate-trend__chart {
  flex: 0 0 78px;
  height: 26px;
  overflow: visible;
}
.nearby-real-estate-trend__chart line {
  stroke: rgba(148, 89, 101, .2);
  stroke-width: 1;
}
.nearby-real-estate-trend__chart polyline {
  fill: none;
  stroke: #a83b4d;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.2;
}
.nearby-real-estate-trend__chart circle { fill: #a83b4d; stroke: #fff; stroke-width: .8; }
.nearby-real-estate-trend__changes {
  display: grid;
  gap: 4px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.nearby-real-estate-trend__change {
  align-items: center;
  background: rgba(255, 255, 255, .66);
  border: 1px solid rgba(148, 89, 101, .11);
  border-radius: 6px;
  color: #465366;
  display: flex;
  flex-direction: column;
  gap: 3px;
  justify-content: center;
  min-width: 0;
  padding: 3px 4px;
  text-align: center;
}
.nearby-real-estate-trend__change small {
  color: #7c6870;
  font-size: .58rem;
  line-height: 1.15;
  white-space: nowrap;
}
.nearby-real-estate-trend__change strong {
  color: #465366;
  font-size: .64rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
  white-space: nowrap;
}
</style>
