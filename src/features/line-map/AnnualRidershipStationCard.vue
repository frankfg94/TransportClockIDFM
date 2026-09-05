<script setup lang="ts">
import { computed } from "vue";
import { BarChart3, ChevronDown, UsersRound } from "lucide-vue-next";
import { useI18n, type TranslationKey } from "../../i18n";
import type {
  AnnualRidershipRankingScope,
  AnnualRidershipSourceMetadata,
  AnnualRidershipStationResponse,
  AnnualRidershipValue,
} from "../../types/ridership";
import type { RidershipRankingPresentation } from "../../services/ridershipRanking";

interface ScopeOption {
  value: AnnualRidershipRankingScope;
  label: string;
}

const props = withDefaults(defineProps<{
  station?: AnnualRidershipStationResponse;
  loading?: boolean;
  unavailable?: boolean;
  ranking?: RidershipRankingPresentation;
  scope?: AnnualRidershipRankingScope;
  scopeOptions?: ScopeOption[];
}>(), {
  loading: false,
  unavailable: false,
  scope: "network",
  scopeOptions: () => [],
});

const emit = defineEmits<{
  "update:scope": [scope: AnnualRidershipRankingScope];
}>();

const { t } = useI18n();
const hasData = computed(() => Boolean(
  props.station?.primary.status !== "unavailable" &&
  typeof props.station?.primary.value === "number",
));
const isIdfmRailEntryValidation = computed(() =>
  props.station?.primary.metric === "annual_station_entries" &&
  props.station.primary.sourceIds.includes("idfm-rail-validations"),
);
const cardTitle = computed(() => isIdfmRailEntryValidation.value
  ? t("globalMap.sidebar.annualRidershipRailValidationTitle")
  : t("globalMap.sidebar.annualRidershipStationTitle"));
const cardHint = computed(() => isIdfmRailEntryValidation.value
  ? t("globalMap.sidebar.annualRidershipRailValidationHint")
  : t("globalMap.sidebar.annualRidershipHint"));
const selectedScopeLabel = computed(() =>
  props.scopeOptions.find((option) => option.value === props.scope)?.label ??
  t("globalMap.sidebar.annualRidershipStationScopeNetwork"));

function formatValue(value: number | null | undefined): string {
  return typeof value === "number"
    ? new Intl.NumberFormat("fr-FR").format(value)
    : "—";
}

function formatUnit(unit?: AnnualRidershipValue["unit"]): string {
  if (unit === "entries") return t("globalMap.sidebar.annualRidershipEntries");
  if (unit === "journeys") return t("globalMap.sidebar.annualRidershipJourneys");
  if (unit === "boardings") return t("globalMap.sidebar.annualRidershipBoardings");
  return t("globalMap.sidebar.annualRidershipStationUnavailable");
}

function statusLabel(value: AnnualRidershipValue): string {
  return value.status === "derived"
    ? t("globalMap.sidebar.annualRidershipDerived")
    : t("globalMap.sidebar.annualRidershipOfficial");
}

function sourceLabel(
  value: AnnualRidershipValue,
  sources: AnnualRidershipSourceMetadata[],
): string {
  const labels = value.sourceIds
    .map((sourceId) => sources.find((source) => source.id === sourceId)?.label ?? sourceId)
    .filter(Boolean);
  return labels.length ? labels.join(" · ") : t("globalMap.sidebar.lineUnavailable");
}

function levelLabel(level: RidershipRankingPresentation["level"]): string {
  const keys: Record<RidershipRankingPresentation["level"], TranslationKey> = {
    "very-high": "globalMap.sidebar.annualRidershipVeryHigh",
    high: "globalMap.sidebar.annualRidershipHigh",
    average: "globalMap.sidebar.annualRidershipAverage",
    low: "globalMap.sidebar.annualRidershipLow",
  };
  return t(keys[level]);
}

function levelDescription(level: RidershipRankingPresentation["level"]): string {
  return t("globalMap.sidebar.annualRidershipTopPercent", {
    percent: props.ranking?.topPercent ?? 100,
    scope: selectedScopeLabel.value,
  });
}

function handleScopeChange(event: Event): void {
  const value = (event.target as HTMLSelectElement | null)?.value;
  if (value === "network" || value === "mode" || value === "line") {
    emit("update:scope", value);
  }
}
</script>

<template>
  <section class="annual-ridership-station-card">
    <div class="annual-ridership-station-card__title">
      <span><BarChart3 :size="16" aria-hidden="true" />{{ cardTitle }}</span>
      <small v-if="station?.primary.year">{{ t("globalMap.sidebar.annualRidershipYear", { year: station.primary.year }) }}</small>
    </div>

    <p v-if="station?.name" class="annual-ridership-station-card__station-name">{{ station.name }}</p>
    <p class="annual-ridership-station-card__hint">{{ cardHint }}</p>

    <div v-if="loading" class="annual-ridership-station-card__loading" aria-live="polite">
      <span class="annual-ridership-station-card__loading-dot" />{{ t("globalMap.sidebar.annualRidershipLoading") }}
    </div>
    <template v-else-if="hasData && station">
      <div class="annual-ridership-station-card__total">
        <strong>{{ formatValue(station.primary.value) }}</strong>
        <span>{{ formatUnit(station.primary.unit) }}</span>
      </div>

      <p class="annual-ridership-station-card__source">
        <span
          class="annual-ridership-station-card__status"
          :class="{ 'annual-ridership-station-card__status--derived': station.primary.status === 'derived' }"
        >{{ statusLabel(station.primary) }}</span>
        <span>{{ sourceLabel(station.primary, station.sources) }}</span>
        <span v-if="station.primary.year">· {{ station.primary.year }}</span>
      </p>

      <label v-if="scopeOptions.length > 1" class="annual-ridership-station-card__scope">
        <span>{{ t("globalMap.sidebar.annualRidershipComparison") }}</span>
        <span class="annual-ridership-station-card__select-wrap">
          <select :value="scope" :aria-label="t('globalMap.sidebar.annualRidershipComparison')" @change="handleScopeChange">
            <option v-for="option in scopeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
          <ChevronDown :size="14" aria-hidden="true" />
        </span>
      </label>

      <div v-if="ranking" class="annual-ridership-station-card__ranking">
        <div class="annual-ridership-station-card__ranking-heading">
          <span class="annual-ridership-station-card__ranking-icon"><UsersRound :size="18" aria-hidden="true" /></span>
          <div>
            <strong>{{ levelLabel(ranking.level) }}</strong>
            <span>{{ levelDescription(ranking.level) }}</span>
          </div>
          <div class="annual-ridership-station-card__rank">
            <strong>{{ ranking.rank }} <small>/ {{ ranking.total }}</small></strong>
            <span>{{ t("globalMap.sidebar.annualRidershipRanking") }}</span>
          </div>
        </div>
        <div
          class="annual-ridership-station-card__meter"
          role="meter"
          :aria-label="t('globalMap.sidebar.annualRidershipPercentileAria', { percent: ranking.percentile })"
          :aria-valuenow="ranking.percentile"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span class="annual-ridership-station-card__meter-fill" :style="{ width: `${ranking.percentile}%` }" />
          <span class="annual-ridership-station-card__meter-marker" :style="{ left: `${ranking.percentile}%` }" />
        </div>
        <div class="annual-ridership-station-card__meter-labels">
          <span>{{ t("globalMap.sidebar.annualRidershipLessFrequent") }}</span>
          <span>{{ t("globalMap.sidebar.annualRidershipMoreFrequent") }}</span>
        </div>
      </div>
      <p v-else class="annual-ridership-station-card__empty">
        {{ t("globalMap.sidebar.annualRidershipRankingUnavailable") }}
      </p>
    </template>
    <p v-else class="annual-ridership-station-card__empty">
      {{ unavailable ? t("globalMap.sidebar.annualRidershipUnavailable") : t("globalMap.sidebar.annualRidershipLoading") }}
    </p>
  </section>
</template>

<style scoped>
.annual-ridership-station-card {
  display: grid;
  gap: 11px;
  padding: 14px;
  border: 1px solid var(--sidebar-border);
  border-radius: 16px;
  background: linear-gradient(145deg, #fff, #f8fbff);
  box-shadow: 0 8px 22px rgba(24, 41, 76, .05);
}
.annual-ridership-station-card__title { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #253452; font-size: .78rem; font-weight: 950; }
.annual-ridership-station-card__title > span { display: inline-flex; align-items: center; gap: 7px; }
.annual-ridership-station-card__title svg { color: var(--line-color, #496081); }
.annual-ridership-station-card__title small { color: #8491a9; font-size: .64rem; font-weight: 800; }
.annual-ridership-station-card__station-name { margin: -3px 0 0; color: #18233f; font-size: .86rem; font-weight: 900; }
.annual-ridership-station-card__hint { margin: -5px 0 0; color: #8491a9; font-size: .68rem; line-height: 1.35; }
.annual-ridership-station-card__loading { display: flex; align-items: center; gap: 8px; color: #71809d; font-size: .7rem; font-weight: 750; }
.annual-ridership-station-card__loading-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--line-color, #496081); box-shadow: 0 0 0 4px color-mix(in srgb, var(--line-color, #496081) 15%, transparent); }
.annual-ridership-station-card__empty { margin: 0; color: #8491a9; font-size: .7rem; }
.annual-ridership-station-card__total { display: flex; align-items: baseline; gap: 8px; margin-top: 1px; }
.annual-ridership-station-card__total strong { color: var(--line-color, #18233f); font-size: 1.45rem; letter-spacing: -.03em; }
.annual-ridership-station-card__total span { color: #71809d; font-size: .68rem; font-weight: 850; }
.annual-ridership-station-card__source { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin: 1px 0 0; color: #8491a9; font-size: .62rem; font-weight: 750; line-height: 1.35; }
.annual-ridership-station-card__status { padding: 3px 6px; border-radius: 999px; background: #e8f5ee; color: #267348; font-size: .58rem; font-weight: 900; letter-spacing: .03em; text-transform: uppercase; }
.annual-ridership-station-card__status--derived { background: #fff2d8; color: #9a6815; }
.annual-ridership-station-card__scope { display: grid; gap: 6px; margin-top: 3px; color: #71809d; font-size: .65rem; font-weight: 850; }
.annual-ridership-station-card__select-wrap { position: relative; display: block; }
.annual-ridership-station-card__scope select { width: 100%; min-height: 36px; padding: 0 30px 0 9px; border: 1px solid #dfe6f1; border-radius: 9px; appearance: none; background: #fff; color: #253452; font: inherit; font-size: .7rem; font-weight: 800; }
.annual-ridership-station-card__scope select:focus-visible { border-color: var(--line-color, #496081); outline: 0; box-shadow: 0 0 0 3px color-mix(in srgb, var(--line-color, #496081) 18%, transparent); }
.annual-ridership-station-card__select-wrap > svg { position: absolute; top: 50%; right: 9px; pointer-events: none; color: #71809d; transform: translateY(-50%); }
.annual-ridership-station-card__ranking { display: grid; gap: 10px; margin-top: 3px; padding: 12px; border: 1px solid #e4eaf3; border-radius: 13px; background: rgba(255, 255, 255, .78); }
.annual-ridership-station-card__ranking-heading { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 9px; }
.annual-ridership-station-card__ranking-icon { display: grid; place-items: center; flex: 0 0 34px; width: 34px; height: 34px; border-radius: 50%; background: #e8f5ee; color: #267348; line-height: 0; }
.annual-ridership-station-card__ranking-icon :deep(svg) { display: block; }
.annual-ridership-station-card__ranking-heading > div:not(.annual-ridership-station-card__rank) { min-width: 0; }
.annual-ridership-station-card__ranking-heading strong,
.annual-ridership-station-card__ranking-heading span { display: block; }
.annual-ridership-station-card__ranking-heading > .annual-ridership-station-card__ranking-icon { display: grid; }
.annual-ridership-station-card__ranking-heading > div > strong { color: #267348; font-size: .76rem; }
.annual-ridership-station-card__ranking-heading > div > span { margin-top: 3px; color: #71809d; font-size: .62rem; line-height: 1.25; }
.annual-ridership-station-card__rank { min-width: 53px; padding-left: 9px; border-left: 1px solid #e2e8f2; text-align: right; }
.annual-ridership-station-card__rank strong { color: #5523d8; font-size: 1.15rem; letter-spacing: -.03em; }
.annual-ridership-station-card__rank strong small { display: inline; color: #71809d; font-size: .72rem; }
.annual-ridership-station-card__rank span { margin-top: 2px; color: #71809d; font-size: .58rem; font-weight: 850; }
.annual-ridership-station-card__meter { position: relative; height: 9px; overflow: visible; border-radius: 999px; background: linear-gradient(90deg, #e9edf4, #d8caff 55%, #7136ef); }
.annual-ridership-station-card__meter-fill { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #b3a0ff, #5523d8); }
.annual-ridership-station-card__meter-marker { position: absolute; top: 50%; width: 15px; height: 15px; border: 3px solid #fff; border-radius: 50%; background: #5523d8; box-shadow: 0 1px 5px rgba(40, 24, 110, .35); transform: translate(-50%, -50%); }
.annual-ridership-station-card__meter-labels { display: flex; justify-content: space-between; gap: 8px; color: #8491a9; font-size: .57rem; font-weight: 750; }
</style>
