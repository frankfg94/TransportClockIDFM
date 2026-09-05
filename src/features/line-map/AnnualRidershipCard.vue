<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { BarChart3, ChevronDown, UsersRound } from "lucide-vue-next";
import { useI18n, type TranslationKey } from "../../i18n";
import type { RidershipRankingPresentation } from "../../services/ridershipRanking";
import type {
  AnnualRidershipLineResponse,
  AnnualRidershipSourceMetadata,
  AnnualRidershipValue,
} from "../../types/ridership";

const props = withDefaults(defineProps<{
  line?: AnnualRidershipLineResponse;
  loading?: boolean;
  unavailable?: boolean;
  preview?: boolean;
  ranking?: RidershipRankingPresentation;
  rankingSubject?: string;
}>(), {
  loading: false,
  unavailable: false,
  preview: false,
  rankingSubject: "",
});

const { t } = useI18n();
const stationsExpanded = ref(false);
const hasData = computed(() => Boolean(
  props.line?.primary.status !== "unavailable" &&
  typeof props.line?.primary.value === "number",
));
const hasStationData = computed(() => props.line?.stations.some((station) => (
  station.primary.status !== "unavailable" &&
  typeof station.primary.value === "number"
)) ?? false);
const monthlyHref = computed(() => props.line?.monthlyAvailability?.hasMonthlyHistory
  ? `/ridership/line/${encodeURIComponent(props.line.id)}`
  : undefined);

watch(() => props.line?.id, () => {
  stationsExpanded.value = false;
});

function formatValue(value: number | null | undefined): string {
  return typeof value === "number"
    ? new Intl.NumberFormat("fr-FR").format(value)
    : "—";
}

function formatUnit(unit?: AnnualRidershipValue["unit"]): string {
  if (unit === "entries") return t("globalMap.sidebar.annualRidershipEntries");
  if (unit === "journeys") return t("globalMap.sidebar.annualRidershipJourneys");
  if (unit === "boardings") return t("globalMap.sidebar.annualRidershipBoardings");
  return t("globalMap.sidebar.lineUnavailable");
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
  const threshold = level === "very-high" ? 25 : level === "high" ? 50 : level === "average" ? 75 : 100;
  return t("globalMap.sidebar.annualRidershipLineTopPercent", {
    percent: threshold,
    scope: props.rankingSubject || t("globalMap.sidebar.annualRidershipLineScope"),
  });
}
</script>

<template>
  <section class="annual-ridership-card">
    <div class="annual-ridership-card__title">
      <span><BarChart3 :size="16" aria-hidden="true" />{{ t("globalMap.sidebar.annualRidership") }}</span>
      <small v-if="line?.primary.year">{{ t("globalMap.sidebar.annualRidershipYear", { year: line.primary.year }) }}</small>
    </div>

    <p class="annual-ridership-card__hint">{{ t("globalMap.sidebar.annualRidershipHint") }}</p>

    <p v-if="preview" class="annual-ridership-card__empty" aria-live="polite">
      {{ t("globalMap.sidebar.annualRidershipPreviewUnavailable") }}
    </p>
    <div v-else-if="loading" class="annual-ridership-card__loading" aria-live="polite">
      <span class="annual-ridership-card__loading-dot" />{{ t("globalMap.sidebar.annualRidershipLoading") }}
    </div>
    <template v-else-if="line && (hasData || hasStationData)">
      <template v-if="hasData">
        <div class="annual-ridership-card__total">
          <strong>{{ formatValue(line.primary.value) }}</strong>
          <span>{{ formatUnit(line.primary.unit) }}</span>
        </div>

        <p class="annual-ridership-card__source">
          <span
            class="annual-ridership-card__status"
            :class="{ 'annual-ridership-card__status--derived': line.primary.status === 'derived' }"
          >{{ statusLabel(line.primary) }}</span>
          <span>{{ sourceLabel(line.primary, line.sources) }}</span>
          <span v-if="line.primary.year">· {{ line.primary.year }}</span>
        </p>

        <div v-if="props.ranking" class="annual-ridership-card__ranking">
          <div class="annual-ridership-card__ranking-icon"><UsersRound :size="18" aria-hidden="true" /></div>
          <div class="annual-ridership-card__ranking-copy">
            <strong>{{ levelLabel(props.ranking.level) }}</strong>
            <span>{{ levelDescription(props.ranking.level) }}</span>
          </div>
          <div class="annual-ridership-card__rank">
            <strong>{{ props.ranking.rank }} <small>/ {{ props.ranking.total }}</small></strong>
            <span>{{ t("globalMap.sidebar.annualRidershipRanking") }}</span>
          </div>
        </div>
      </template>
      <p v-else class="annual-ridership-card__empty">
        {{ t("globalMap.sidebar.annualRidershipLineStationOnly") }}
      </p>

      <a
        v-if="monthlyHref"
        class="annual-ridership-card__monthly-link"
        :href="monthlyHref"
        target="_blank"
        rel="noopener noreferrer"
      >{{ t("globalMap.sidebar.annualRidershipMonthlyHistory") }}</a>

      <div v-if="line.stations.length" class="annual-ridership-card__stations">
        <button
          class="annual-ridership-card__toggle"
          :class="{ 'annual-ridership-card__toggle--expanded': stationsExpanded }"
          type="button"
          aria-controls="annual-ridership-stations"
          :aria-expanded="stationsExpanded"
          @click="stationsExpanded = !stationsExpanded"
        >
          <span>{{ t("globalMap.sidebar.annualRidershipStations", { count: line.stations.length }) }}</span>
          <ChevronDown :size="16" aria-hidden="true" />
        </button>

        <ul v-if="stationsExpanded" id="annual-ridership-stations" class="annual-ridership-card__list">
          <li v-for="station in line.stations" :key="station.id">
            <span class="annual-ridership-card__station-name">
              <strong>{{ station.name }}</strong>
              <small v-if="station.city">{{ station.city }}</small>
            </span>
            <span class="annual-ridership-card__station-value">
              <strong v-if="station.primary.value !== null && station.primary.status !== 'unavailable'">{{ formatValue(station.primary.value) }}</strong>
              <strong v-else>—</strong>
              <small v-if="station.primary.status !== 'unavailable'">{{ formatUnit(station.primary.unit) }}</small>
              <small v-else>{{ t("globalMap.sidebar.annualRidershipStationUnavailable") }}</small>
              <small v-if="station.primary.status !== 'unavailable' && station.primary.year" class="annual-ridership-card__station-source">{{ station.primary.year }} · {{ sourceLabel(station.primary, line.sources) }}</small>
              <em v-if="station.primary.status === 'derived'">{{ t("globalMap.sidebar.annualRidershipDerived") }}</em>
            </span>
          </li>
        </ul>
      </div>
    </template>
    <p v-else class="annual-ridership-card__empty">
      {{ unavailable ? t("globalMap.sidebar.annualRidershipUnavailable") : t("globalMap.sidebar.annualRidershipLoading") }}
    </p>
  </section>
</template>

<style scoped>
.annual-ridership-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--sidebar-border);
  border-radius: 16px;
  background: linear-gradient(145deg, #fff, #f8fbff);
  box-shadow: 0 8px 22px rgba(24, 41, 76, .05);
}
.annual-ridership-card__title { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #253452; font-size: .78rem; font-weight: 950; }
.annual-ridership-card__title > span { display: inline-flex; align-items: center; gap: 7px; }
.annual-ridership-card__title svg { color: var(--line-color, #496081); }
.annual-ridership-card__title small { color: #8491a9; font-size: .64rem; font-weight: 800; }
.annual-ridership-card__hint { margin: -4px 0 0; color: #8491a9; font-size: .68rem; line-height: 1.35; }
.annual-ridership-card__loading { display: flex; align-items: center; gap: 8px; color: #71809d; font-size: .7rem; font-weight: 750; }
.annual-ridership-card__loading-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--line-color); box-shadow: 0 0 0 4px color-mix(in srgb, var(--line-color) 15%, transparent); }
.annual-ridership-card__empty { margin: 0; color: #8491a9; font-size: .7rem; }
.annual-ridership-card__total { display: flex; align-items: baseline; gap: 8px; margin-top: 5px; }
.annual-ridership-card__total strong { color: var(--line-color, #18233f); font-size: 1.45rem; letter-spacing: -.03em; }
.annual-ridership-card__total span { color: #71809d; font-size: .68rem; font-weight: 850; }
.annual-ridership-card__source { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin: 8px 0 0; color: #8491a9; font-size: .62rem; font-weight: 750; line-height: 1.35; }
.annual-ridership-card__monthly-link { display: inline-flex; width: max-content; align-items: center; gap: 5px; margin-top: 2px; color: var(--line-color, #496081); font-size: .68rem; font-weight: 900; text-decoration: none; }
.annual-ridership-card__monthly-link:hover, .annual-ridership-card__monthly-link:focus-visible { text-decoration: underline; outline: 0; }
.annual-ridership-card__status { padding: 3px 6px; border-radius: 999px; background: #e8f5ee; color: #267348; font-size: .58rem; font-weight: 900; letter-spacing: .03em; text-transform: uppercase; }
.annual-ridership-card__status--derived { background: #fff2d8; color: #9a6815; }
.annual-ridership-card__ranking { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 9px; margin-top: 4px; padding: 11px; border: 1px solid #e4eaf3; border-radius: 13px; background: rgba(255, 255, 255, .78); }
.annual-ridership-card__ranking-icon { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; background: #e8f5ee; color: #267348; }
.annual-ridership-card__ranking-copy { min-width: 0; }
.annual-ridership-card__ranking-copy strong,
.annual-ridership-card__ranking-copy span,
.annual-ridership-card__rank strong,
.annual-ridership-card__rank span { display: block; }
.annual-ridership-card__ranking-copy strong { color: #267348; font-size: .76rem; }
.annual-ridership-card__ranking-copy span { margin-top: 3px; color: #71809d; font-size: .62rem; line-height: 1.25; }
.annual-ridership-card__rank { min-width: 53px; padding-left: 9px; border-left: 1px solid #e2e8f2; text-align: right; }
.annual-ridership-card__rank strong { color: #5523d8; font-size: 1.15rem; letter-spacing: -.03em; }
.annual-ridership-card__rank strong small { display: inline; color: #71809d; font-size: .72rem; }
.annual-ridership-card__rank span { margin-top: 2px; color: #71809d; font-size: .58rem; font-weight: 850; }
.annual-ridership-card__stations { display: grid; gap: 8px; margin-top: 13px; padding-top: 10px; border-top: 1px solid #e8edf5; }
.annual-ridership-card__toggle { display: inline-flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; padding: 0; border: 0; background: transparent; color: #253452; font: inherit; font-size: .72rem; font-weight: 850; text-align: left; cursor: pointer; }
.annual-ridership-card__toggle > svg { flex: 0 0 auto; transition: transform 160ms ease; }
.annual-ridership-card__toggle:hover, .annual-ridership-card__toggle:focus-visible { color: var(--line-color, #253452); outline: 0; }
.annual-ridership-card__toggle--expanded > svg { transform: rotate(180deg); }
.annual-ridership-card__list { display: grid; gap: 5px; max-height: 280px; margin: 0; padding: 0; overflow: auto; list-style: none; }
.annual-ridership-card__list li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 8px; border: 1px solid #e4eaf3; border-radius: 9px; background: rgba(255, 255, 255, .8); }
.annual-ridership-card__station-name { min-width: 0; }
.annual-ridership-card__list strong, .annual-ridership-card__list small, .annual-ridership-card__list em { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.annual-ridership-card__station-name strong { color: #253452; font-size: .7rem; }
.annual-ridership-card__station-name small { margin-top: 2px; color: #8491a9; font-size: .6rem; }
.annual-ridership-card__station-value { flex: 0 0 auto; text-align: right; }
.annual-ridership-card__station-value strong { color: var(--line-color, #18233f); font-size: .72rem; }
.annual-ridership-card__station-value small { margin-top: 2px; color: #71809d; font-size: .58rem; }
.annual-ridership-card__station-source { max-width: 150px; }
.annual-ridership-card__station-value em { margin-top: 2px; color: #9a6815; font-size: .55rem; font-style: normal; font-weight: 850; }
</style>
