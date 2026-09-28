<script setup lang="ts">
import { computed } from "vue";
import {
  BusFront,
  ChevronDown,
  Euro,
  Info,
  Leaf,
  Minus,
  ShoppingCart,
  Shield,
  TrainFront,
  Trophy,
  Users,
  Volume2,
  Wind,
  type LucideIcon,
} from "lucide-vue-next";
import { useI18n } from "../../i18n";
import NearbyCityComparisonDumbbell from "./NearbyCityComparisonDumbbell.vue";
import NearbyCityComparisonNetworks from "./NearbyCityComparisonNetworks.vue";
import { calculateDvfPriceChanges, formatDvfPriceChange, type DvfPriceTrendChange } from "../../services/real-estate/priceTrends";
import {
  nearbyCityComparisonScale,
  nearbyCityComparisonTone,
  type NearbyCityComparisonMetric,
  type NearbyCityComparisonMetricIcon,
} from "./nearbyCityComparison";

const props = defineProps<{
  metric: NearbyCityComparisonMetric;
  currentName: string;
  targetName: string;
  expanded: boolean;
  /** False when the target city is hidden: current city stats only. */
  showTarget?: boolean;
  /** Reveal delay so the rows appear in a short, readable sequence. */
  delayMs?: number;
}>();

const emit = defineEmits<{
  toggle: [metricId: string];
}>();

const { n, t } = useI18n();

/** Metric identity glyphs, so every row is recognisable at a glance. */
const METRIC_ICONS: Record<NearbyCityComparisonMetricIcon, LucideIcon> = {
  population: Users,
  "transport-lines": BusFront,
  "transport-stations": TrainFront,
  security: Shield,
  commerce: ShoppingCart,
  "green-spaces": Leaf,
  air: Wind,
  noise: Volume2,
  "real-estate": Euro,
};

/**
 * Fixed tile tints: they identify the metric, never the verdict. The semantic
 * colour of the comparison lives in the status pill and in the dots.
 */
const METRIC_ACCENTS: Record<NearbyCityComparisonMetricIcon, string> = {
  population: "indigo",
  "transport-lines": "indigo",
  "transport-stations": "amber",
  security: "rose",
  commerce: "rose",
  "green-spaces": "teal",
  air: "emerald",
  noise: "emerald",
  "real-estate": "amber",
};

const tone = computed(() => nearbyCityComparisonTone(props.metric));
const showTarget = computed(() => props.showTarget !== false);
const scale = computed(() => nearbyCityComparisonScale(props.metric));
const icon = computed(() => (props.metric.icon ? METRIC_ICONS[props.metric.icon] : undefined));
const iconAccent = computed(() => (props.metric.icon ? METRIC_ACCENTS[props.metric.icon] : "neutral"));
const detail = computed(() => props.metric.detail);
const trendPeriods = [1, 3, 5] as const;
const currentPriceChanges = computed(() => calculateDvfPriceChanges(props.metric.priceTrend?.current));
const targetPriceChanges = computed(() => calculateDvfPriceChanges(props.metric.priceTrend?.target));
const trendDateRange = computed(() => {
  const changes = [...currentPriceChanges.value, ...targetPriceChanges.value]
    .sort((left, right) => right.period - left.period);
  const change = changes[0];
  return change ? { from: change.fromYear, to: change.toYear } : undefined;
});
const hasPriceTrend = computed(() => props.metric.id === "real-estate"
  && (currentPriceChanges.value.length > 0 || targetPriceChanges.value.length > 0));
const expandable = computed(() => Boolean(detail.value)
  && (detail.value!.current.count > 0 || (showTarget.value && detail.value!.target.count > 0)));

const statusText = computed(() => {
  if (tone.value === "better") return t("nearbyStations.cityComparison.superior");
  if (tone.value === "worse") return t("nearbyStations.cityComparison.inferior");
  if (tone.value === "equal") return t("nearbyStations.cityComparison.equal");
  if (tone.value === "neutral") return t("nearbyStations.cityComparison.realEstateNeutral");
  return t("nearbyStations.cityComparison.unavailable");
});

/** Name the city with the better value; keep translated verdicts for equal/unavailable states. */
const statusLabel = computed(() => {
  if (tone.value === "better") return props.targetName;
  if (tone.value === "worse") return props.currentName;
  return statusText.value;
});
const statusTone = computed(() =>
  tone.value === "better" || tone.value === "worse" ? "winner" : tone.value,
);

/** Screen reader summary: values first, then the verdict on the target city. */
const rowAria = computed(() => {
  if (!showTarget.value) {
    return t("nearbyStations.cityComparison.rowAriaSingle", {
      metric: props.metric.label,
      current: props.currentName,
      currentValue: props.metric.currentValue,
    });
  }
  if (tone.value === "unavailable") {
    return t("nearbyStations.cityComparison.rowAriaUnavailable", { metric: props.metric.label });
  }
  return t("nearbyStations.cityComparison.rowAria", {
    metric: props.metric.label,
    current: props.currentName,
    currentValue: props.metric.currentValue,
    target: props.targetName,
    targetValue: props.metric.targetValue,
    status: statusText.value,
  });
});

const toggleLabel = computed(() => t(
  props.expanded ? "nearbyStations.cityComparison.hideDetail" : "nearbyStations.cityComparison.showDetail",
  { metric: props.metric.label },
));

function changeForPeriod(changes: readonly DvfPriceTrendChange[], period: 1 | 3 | 5): DvfPriceTrendChange | undefined {
  return changes.find((change) => change.period === period);
}

function trendPeriodLabel(period: 1 | 3 | 5): string {
  const change = changeForPeriod(currentPriceChanges.value, period)
    ?? changeForPeriod(targetPriceChanges.value, period);
  // The current DVF release has five published annual vintages (2021–2025),
  // so surface the exact interval instead of implying five elapsed years.
  if (period === 5 && change) return `${change.fromYear}–${change.toYear}`;
  return t(`nearbyStations.realEstate.trendPeriod${period}`);
}

function formattedChange(change: DvfPriceTrendChange | undefined): string {
  if (!change) return t("nearbyStations.cityComparison.missingValue");
  return formatDvfPriceChange(change.percent, (amount, maximumFractionDigits) => n(amount, {
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  }));
}

function changeTitle(change: DvfPriceTrendChange | undefined): string | undefined {
  return change
    ? t("nearbyStations.realEstate.trendIntervalTitle", { from: change.fromYear, to: change.toYear })
    : undefined;
}
</script>

<template>
  <div
    class="comparison-metric"
    :class="[`comparison-metric--${tone}`, {
      'comparison-metric--expanded': expanded,
      'comparison-metric--single': !showTarget,
    }]"
    :data-comparison-metric="metric.id"
    :data-comparison-tone="tone"
    :style="{ '--comparison-reveal-delay': `${delayMs ?? 0}ms` }"
  >
    <div class="comparison-metric__head">
      <span
        class="comparison-metric__icon"
        :class="`comparison-metric__icon--${iconAccent}`"
        aria-hidden="true"
      >
        <component :is="icon" v-if="icon" :size="17" :stroke-width="2" />
      </span>
      <span class="comparison-metric__label">{{ metric.label }}</span>
      <NearbyCityComparisonDumbbell
        class="comparison-metric__visual"
        :scale="scale"
        :current-name="currentName"
        :target-name="targetName"
        :show-target="showTarget"
      />
      <span v-if="showTarget" class="comparison-metric__status" :data-status="statusTone">
        <Trophy v-if="tone === 'better' || tone === 'worse'" :size="14" :stroke-width="2.5" aria-hidden="true" />
        <Minus v-else-if="tone === 'equal'" :size="13" :stroke-width="3" aria-hidden="true" />
        <Info v-else :size="13" :stroke-width="2.5" aria-hidden="true" />
        <span>{{ statusLabel }}</span>
      </span>
      <button
        v-if="expandable"
        type="button"
        class="comparison-metric__toggle"
        :class="{ 'comparison-metric__toggle--open': expanded }"
        :aria-expanded="expanded"
        aria-controls="nearby-city-comparison-networks"
        :aria-label="toggleLabel"
        :title="toggleLabel"
        :data-testid="`nearby-city-comparison-toggle-${metric.id}`"
        @click="emit('toggle', metric.id)"
      >
        <ChevronDown :size="16" :stroke-width="2.6" aria-hidden="true" />
      </button>
      <span v-else class="comparison-metric__toggle-spacer" aria-hidden="true" />
      <span class="comparison-metric__sr" role="note">{{ rowAria }}</span>
    </div>

    <div
      v-if="hasPriceTrend"
      class="comparison-metric__price-trend"
      role="group"
      :aria-label="t('nearbyStations.realEstate.trendLabel')"
      data-testid="nearby-city-comparison-price-trend"
    >
      <span class="comparison-metric__price-trend-heading">{{ t("nearbyStations.realEstate.trendLabel") }}</span>
      <small v-if="trendDateRange" class="comparison-metric__price-trend-range">
        {{ t("nearbyStations.realEstate.trendDataRange", trendDateRange) }}
      </small>
      <div class="comparison-metric__price-trend-grid" :class="{ 'comparison-metric__price-trend-grid--single': !showTarget }">
        <span aria-hidden="true" />
        <small v-for="period in trendPeriods" :key="`heading:${period}`">{{ trendPeriodLabel(period) }}</small>
        <strong :title="currentName">{{ currentName }}</strong>
        <span
          v-for="period in trendPeriods"
          :key="`current:${period}`"
          :title="changeTitle(changeForPeriod(currentPriceChanges, period))"
        >{{ formattedChange(changeForPeriod(currentPriceChanges, period)) }}</span>
        <template v-if="showTarget">
          <strong :title="targetName">{{ targetName }}</strong>
          <span
            v-for="period in trendPeriods"
            :key="`target:${period}`"
            :title="changeTitle(changeForPeriod(targetPriceChanges, period))"
          >{{ formattedChange(changeForPeriod(targetPriceChanges, period)) }}</span>
        </template>
      </div>
    </div>

    <NearbyCityComparisonNetworks
      v-if="detail"
      :detail="detail"
      :current-name="currentName"
      :target-name="targetName"
      :show-target="showTarget"
      :open="expanded"
    />
  </div>
</template>

<style scoped>
.comparison-metric {
  background: #fff;
  border: 1px solid rgba(100, 116, 139, .14);
  border-radius: 14px;
  margin-bottom: 8px;
  padding: 11px 14px;
  transition: border-color 170ms ease, box-shadow 170ms ease;
}

.comparison-metric:hover {
  border-color: rgba(100, 116, 139, .24);
  box-shadow: 0 4px 14px rgba(15, 23, 42, .05);
}

/* The expanded detail belongs to the row and lifts it out of the list. */
.comparison-metric--expanded {
  border-color: rgba(81, 70, 255, .22);
  box-shadow: 0 8px 22px rgba(15, 23, 42, .07);
}

.comparison-metric__head {
  align-items: center;
  column-gap: 12px;
  display: grid;
  grid-template-columns: 34px minmax(150px, 1.3fr) minmax(200px, 2.4fr) 116px 30px;
  row-gap: 4px;
}

/* Single city: no status column, and the rail takes the freed width. */
.comparison-metric--single .comparison-metric__head {
  grid-template-columns: 34px minmax(150px, 1.3fr) minmax(0, 2.4fr) 30px;
}

/* Quiet identity tile: the numbers stay the loudest element on the row. */
.comparison-metric__icon {
  align-items: center;
  background: #f1f5f9;
  border-radius: 10px;
  color: #64748b;
  display: inline-flex;
  height: 34px;
  justify-content: center;
  width: 34px;
}

.comparison-metric__icon--indigo { background: #eef0ff; color: #5146ff; }
.comparison-metric__icon--amber { background: #fff4e5; color: #c2740b; }
.comparison-metric__icon--rose { background: #fff1f2; color: #e11d48; }
.comparison-metric__icon--teal { background: #eefbfd; color: #0c7c8a; }
.comparison-metric__icon--emerald { background: #f0fdf4; color: #059669; }

.comparison-metric__label {
  color: #131c33;
  font-size: .82rem;
  font-weight: 850;
  line-height: 1.3;
}

.comparison-metric__visual { min-width: 0; }

.comparison-metric__price-trend {
  border-top: 1px solid rgba(100, 116, 139, .12);
  display: grid;
  gap: 6px;
  margin: 10px 0 1px 46px;
  padding-top: 8px;
}
.comparison-metric__price-trend-heading {
  color: #657187;
  font-size: .72rem;
  font-weight: 760;
}
.comparison-metric__price-trend-range { color: #778397; font-size: .65rem; line-height: 1.2; }
.comparison-metric__price-trend-grid {
  align-items: center;
  display: grid;
  gap: 5px 8px;
  grid-template-columns: minmax(95px, 1.4fr) repeat(3, minmax(50px, .72fr));
}
.comparison-metric__price-trend-grid > small {
  color: #778397;
  font-size: .68rem;
  font-weight: 730;
  text-align: center;
}
.comparison-metric__price-trend-grid > strong {
  color: #465366;
  font-size: .69rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.comparison-metric__price-trend-grid > span {
  color: #465366;
  font-size: .73rem;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.comparison-metric__status {
  align-items: center;
  border-radius: 999px;
  display: inline-flex;
  font-size: .69rem;
  font-weight: 800;
  gap: 5px;
  justify-content: center;
  padding: 5px 10px;
  white-space: normal;
}

.comparison-metric__status > span {
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: center;
}

.comparison-metric__status[data-status="winner"] { background: #dcfce7; color: #15803d; }
.comparison-metric__status[data-status="equal"],
.comparison-metric__status[data-status="unavailable"],
.comparison-metric__status[data-status="neutral"] { background: #eef2f7; color: #52627a; }

.comparison-metric__toggle {
  align-items: center;
  appearance: none;
  background: rgba(100, 116, 139, .12);
  border: 0;
  border-radius: 999px;
  color: #475569;
  cursor: pointer;
  display: inline-flex;
  height: 28px;
  justify-content: center;
  padding: 0;
  width: 28px;
}

.comparison-metric__toggle svg { transition: transform 200ms cubic-bezier(.2, .8, .2, 1); }
.comparison-metric__toggle--open svg { transform: rotate(180deg); }
.comparison-metric__toggle:hover,
.comparison-metric__toggle:focus-visible { background: rgba(81, 70, 255, .2); color: #3f35d6; outline: 0; }
.comparison-metric__toggle:focus-visible { box-shadow: 0 0 0 2px rgba(81, 70, 255, .45); }

.comparison-metric__sr {
  clip: rect(0, 0, 0, 0);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}

/* The rows appear in a short sequence when the modal opens. */
@media (prefers-reduced-motion: no-preference) {
  .comparison-metric {
    animation: comparison-metric-reveal 240ms cubic-bezier(.2, .8, .2, 1) both;
    animation-delay: var(--comparison-reveal-delay, 0ms);
  }
}

@keyframes comparison-metric-reveal {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

@media (max-width: 700px) {
  .comparison-metric__head {
    column-gap: 10px;
    grid-template-columns: 34px minmax(0, 1fr) 116px 30px;
  }
  .comparison-metric__visual { grid-column: 1 / -1; order: 3; }
  .comparison-metric__status { justify-self: end; }
  .comparison-metric__price-trend { margin-left: 0; }
  .comparison-metric__price-trend-grid { gap: 5px 4px; grid-template-columns: minmax(72px, 1.2fr) repeat(3, minmax(42px, .8fr)); }
}

@media (prefers-reduced-motion: reduce) {
  .comparison-metric__toggle svg { transition: none; }
}
</style>
