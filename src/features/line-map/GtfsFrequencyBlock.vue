<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "../../i18n";
import type { FrequencyDirection, FrequencyValues } from "../../types/lineFrequency";

const props = defineProps<{
  average: FrequencyValues;
  directions: FrequencyDirection[];
  title?: string;
  endpoints?: string;
}>();
const { t, n } = useI18n();
const periods = [
  { key: "peakMinutes", label: "globalMap.sidebar.linePeak" },
  { key: "offPeakMinutes", label: "globalMap.sidebar.lineOffPeak" },
  { key: "nightMinutes", label: "globalMap.sidebar.lineNight" },
] as const;

function isHeadway(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function roundedHeadway(value?: number): number | undefined {
  return isHeadway(value) ? Math.round(value) : undefined;
}
function formatHeadway(value?: number): string {
  const rounded = roundedHeadway(value);
  return rounded !== undefined
    ? t("globalMap.sidebar.gtfsFrequency.minutes", {
        value: n(rounded),
      })
    : t("globalMap.sidebar.lineUnavailable");
}
function isDirectionUnavailable(direction: FrequencyDirection): boolean {
  return periods.every((period) => roundedHeadway(direction[period.key]) === undefined);
}
const cells = computed(() =>
  periods.map((period) => {
    const values = props.directions
      .map((direction) => roundedHeadway(direction[period.key]))
      .filter((value): value is number => value !== undefined);
    let value = formatHeadway(props.average[period.key]);
    if (values.length > 1) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      value =
        min === max
          ? t("globalMap.sidebar.gtfsFrequency.minutes", { value: n(min) })
          : t("globalMap.sidebar.gtfsFrequency.rangeMinutes", { min: n(min), max: n(max) });
    }
    return { ...period, value, available: values.length > 1 || isHeadway(props.average[period.key]) };
  }),
);
const showDirectionDetails = computed(
  () =>
    props.directions.length > 1 &&
    periods.some((period) => {
      const values = props.directions.map((direction) => roundedHeadway(direction[period.key]));
      return values.some((value) => value === undefined) || new Set(values).size > 1;
    }),
);
const summaryUnavailable = computed(() =>
  cells.value.every((cell) => !cell.available),
);
</script>

<template>
  <section class="gtfs-frequency-block">
    <div v-if="title || endpoints || summaryUnavailable" class="gtfs-frequency-block__heading">
      <div class="gtfs-frequency-block__heading-copy">
        <h4 v-if="title">{{ title }}</h4>
        <p v-if="endpoints" class="gtfs-frequency-block__endpoints">{{ endpoints }}</p>
      </div>
      <span
        v-if="summaryUnavailable"
        class="gtfs-frequency-block__summary-unavailable"
        data-testid="frequency-summary-unavailable"
      >
        {{ t("globalMap.sidebar.lineUnavailable") }}
      </span>
    </div>
    <dl v-if="!summaryUnavailable" class="gtfs-frequency-block__grid" data-testid="frequency-grid">
      <div v-for="cell in cells" :key="cell.key" :data-period="cell.key">
        <dt>{{ t(cell.label) }}</dt>
        <dd>
          <strong>{{ cell.value }}</strong>
        </dd>
      </div>
    </dl>
    <details v-if="showDirectionDetails" class="gtfs-frequency-block__details">
      <summary>{{ t("globalMap.sidebar.gtfsFrequency.directionDetails") }}</summary>
      <div
        v-for="direction in directions"
        :key="direction.id"
        class="gtfs-frequency-block__direction"
      >
        <div class="gtfs-frequency-block__direction-heading">
          <p>
          {{
            t("globalMap.sidebar.gtfsFrequency.fromTo", {
              from: direction.from || t("globalMap.sidebar.gtfsFrequency.unknownOrigin"),
              to: direction.to || t("globalMap.sidebar.gtfsFrequency.unknownDestination"),
            })
          }}
          </p>
          <span v-if="isDirectionUnavailable(direction)" class="gtfs-frequency-block__direction-unavailable">
            {{ t("globalMap.sidebar.lineUnavailable") }}
          </span>
        </div>
        <dl v-if="!isDirectionUnavailable(direction)" class="gtfs-frequency-block__grid">
          <div v-for="period in periods" :key="period.key">
            <dt>{{ t(period.label) }}</dt>
            <dd>{{ formatHeadway(direction[period.key]) }}</dd>
          </div>
        </dl>
      </div>
    </details>
  </section>
</template>

<style scoped>
.gtfs-frequency-block {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
.gtfs-frequency-block__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-width: 0;
}
.gtfs-frequency-block__heading-copy {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}
h4,
p,
dl,
dd {
  margin: 0;
}
h4 {
  color: var(--ink);
  font-size: 0.76rem;
}
.gtfs-frequency-block__endpoints,
.gtfs-frequency-block__direction p {
  color: var(--muted);
  font-size: 0.7rem;
  overflow-wrap: anywhere;
}
.gtfs-frequency-block__summary-unavailable {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 800;
  text-align: right;
}
.gtfs-frequency-block__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-1);
}
.gtfs-frequency-block__grid > div {
  min-width: 0;
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
}
dt {
  color: var(--muted);
  font-size: 0.62rem;
  font-weight: 700;
}
dd {
  margin-top: var(--space-1);
  color: var(--ink);
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
summary {
  padding: var(--space-2) 0;
  color: var(--ink);
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 700;
}
summary:focus-visible {
  outline: 2px solid var(--idfm-blue);
  outline-offset: 2px;
}
.gtfs-frequency-block__direction {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
.gtfs-frequency-block__direction-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.gtfs-frequency-block__direction-unavailable {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: .68rem;
  font-weight: 800;
}
</style>
