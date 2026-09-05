<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from "vue";
import { ArrowLeft, ChevronDown, Edit2, ExternalLink, Info, LineChart, MapPin, ShieldCheck } from "lucide-vue-next";
import { navigateTo, useRoute } from "#imports";
import { useI18n } from "../../../src/i18n";
import { fetchMonthlyRidershipLine } from "../../../src/services/ridership";
import type { GlobalMapMode } from "../../../src/features/transport-map/contracts/manifest";
import type {
  MonthlyRidershipLineDocument,
  MonthlyRidershipStationDocument,
  MonthlySeriesPoint,
} from "../../../src/types/ridership";
import type { LineSearchOption, TransitFamily } from "../../../src/types/transit";
import MonthlyRidershipChart from "../../../src/features/ridership-monthly/MonthlyRidershipChart.vue";
import {
  chartHorizonYears,
  ROLLING_WINDOW_MONTHS,
  selectMonthlyChartSeries,
  selectMonthlyChartSourceSeries,
  summarizeMonthlySeries,
} from "../../../src/features/ridership-monthly/monthlyRidership";

const StationBoardModal = defineAsyncComponent(
  () => import("../../../src/components/StationBoardModal.vue"),
);

const route = useRoute();
const { t, n, d, locale } = useI18n();
const line = ref<MonthlyRidershipLineDocument>();
const loading = ref(true);
const error = ref<string>();
const displayStepKey = ref("1");
const showMovingAverage = ref(false);
const stationsExpanded = ref(false);
const lineSelectorOpen = ref(false);
const displaySteps = ROLLING_WINDOW_MONTHS;
const statuses: MonthlySeriesPoint["status"][] = ["complete", "partial", "missing"];
let latestLineRequest = 0;

const displayStep = computed(() => Number(displayStepKey.value) || 1);
const chartSourceSeries = computed(() => line.value
  ? selectMonthlyChartSourceSeries(line.value.series, displayStep.value)
  : []);
const chartSeries = computed(() => line.value
  ? selectMonthlyChartSeries(line.value.series, displayStep.value)
  : []);
const summary = computed(() => summarizeMonthlySeries(chartSourceSeries.value));
const chartSummary = computed(() => summarizeMonthlySeries(chartSeries.value));
const movingAverageLabel = computed(() => displayStep.value === 1
  ? t("ridershipMonthly.movingAverage")
  : t("ridershipMonthly.movingAverageSteps", { months: displayStep.value * 3 }));
const pageTitle = computed(() => line.value
  ? t("ridershipMonthly.title", { line: line.value.label })
  : t("ridershipMonthly.eyebrow"));
const periodLabel = computed(() => {
  const series = chartSourceSeries.value;
  return series.length ? `${series[0]!.month} – ${series.at(-1)!.month}` : "—";
});
const unitLabel = computed(() => line.value?.unit === "boardings"
  ? t("ridershipMonthly.boardings")
  : t("ridershipMonthly.entries"));
const monthlyColor = computed(() => line.value?.color ?? "#496081");
const lineSelectorInitialLine = computed<LineSearchOption | undefined>(() => {
  const currentLine = line.value;
  const family = monthlyModeToTransitFamily(currentLine?.mode);
  if (!currentLine || !family) return undefined;

  return {
    family,
    id: currentLine.id,
    label: currentLine.label || currentLine.code,
    ref: currentLine.code || currentLine.id,
    navitiaId: currentLine.id,
    color: currentLine.color,
    textColor: currentLine.textColor,
    displayName: currentLine.label || currentLine.code,
  };
});
const lineSelectorInitialFamily = computed<TransitFamily | undefined>(
  () => lineSelectorInitialLine.value?.family,
);
const stationSeries = (station: MonthlyRidershipStationDocument): MonthlySeriesPoint[] => (
  selectMonthlyChartSeries(station.series, displayStep.value)
);

onMounted(loadLine);
watch(() => route.params.lineId, () => {
  stationsExpanded.value = false;
  lineSelectorOpen.value = false;
  void loadLine();
});

async function loadLine(): Promise<void> {
  const requestId = ++latestLineRequest;
  loading.value = true;
  error.value = undefined;
  try {
    const lineId = currentRouteLineId();
    if (!lineId) throw new Error("Missing line id");
    const loadedLine = await fetchMonthlyRidershipLine(lineId);
    if (requestId !== latestLineRequest) return;
    line.value = loadedLine;
    displayStepKey.value = "1";
  } catch {
    if (requestId !== latestLineRequest) return;
    error.value = t("ridershipMonthly.error");
  } finally {
    if (requestId === latestLineRequest) loading.value = false;
  }
}

function currentRouteLineId(): string | undefined {
  const lineId = route.params.lineId;
  return Array.isArray(lineId) ? lineId[0] : lineId;
}

function monthlyModeToTransitFamily(mode: GlobalMapMode | undefined): TransitFamily | undefined {
  if (mode === "TRAIN") return "TRANSILIEN";
  if (mode === "METRO" || mode === "RER" || mode === "TRAM" || mode === "TRANSILIEN") return mode;
  return undefined;
}

function selectLineFromModal(selectedLine: LineSearchOption): void {
  lineSelectorOpen.value = false;
  if (!selectedLine.id || selectedLine.id === currentRouteLineId()) return;

  // Nuxt performs this as an SPA route change: the page stays mounted while
  // the watcher replaces only the monthly document and resets its controls.
  void navigateTo({ path: `/ridership/line/${encodeURIComponent(selectedLine.id)}` });
}

function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" ? n(value, { maximumFractionDigits: 0 }) : "—";
}

function formatPercent(value: number | null): string {
  return value === null ? t("ridershipMonthly.notComparable") : `${value >= 0 ? "+" : ""}${n(value, { maximumFractionDigits: 1 })} %`;
}

function formatMonth(month: string | undefined): string {
  if (!month) return "—";
  const [year, monthNumber] = month.split("-").map(Number);
  return d(new Date(Date.UTC(year, monthNumber - 1, 1)), { month: "long", year: "numeric", timeZone: "UTC" });
}

function statusLabel(status: MonthlySeriesPoint["status"]): string {
  if (status === "complete") return t("ridershipMonthly.statusComplete");
  if (status === "partial") return t("ridershipMonthly.statusPartial");
  return t("ridershipMonthly.statusMissing");
}

function windowLabel(months: number): string {
  if (months === 1) return t("ridershipMonthly.oneMonth");
  if (months === 12) return t("ridershipMonthly.oneYear");
  return t("ridershipMonthly.monthsWindow", { count: months });
}

function chartRangeLabel(months: number): string {
  const years = chartHorizonYears(months);
  return years === 1
    ? t("ridershipMonthly.oneYear")
    : t("ridershipMonthly.yearsWindow", { count: years });
}

function sourcePeriodLabel(source: MonthlyRidershipLineDocument["sources"][number]): string {
  return `${source.period.label} · ${source.period.start} – ${source.period.end}`;
}

function milestoneDate(value: string): string {
  return value.length > 10 ? value.slice(0, 10) : value;
}
</script>

<template>
  <main class="monthly-page" :style="{ '--line-color': monthlyColor }">
    <header class="monthly-page__header">
      <a class="monthly-page__back" href="/map">
        <ArrowLeft :size="16" aria-hidden="true" />
        <span>{{ t("ridershipMonthly.backToMap") }}</span>
      </a>
      <div v-if="line" class="monthly-page__identity">
        <span class="monthly-page__mode" :style="{ backgroundColor: line.color, color: line.textColor }">{{ line.mode }}</span>
        <span class="monthly-page__eyebrow">{{ t("ridershipMonthly.eyebrow") }}</span>
        <h1>{{ pageTitle }}</h1>
        <p>{{ t("ridershipMonthly.subtitle") }}</p>
        <button
          class="monthly-page__line-switch"
          type="button"
          :aria-label="t('ridershipMonthly.changeLineAria')"
          :title="t('ridershipMonthly.changeLineAria')"
          @click="lineSelectorOpen = true"
        >
          <Edit2 :size="14" aria-hidden="true" />
          <span>{{ t("ridershipMonthly.changeLine") }}</span>
        </button>
      </div>
      <div v-else class="monthly-page__identity">
        <span class="monthly-page__eyebrow">{{ t("ridershipMonthly.eyebrow") }}</span>
        <h1>{{ pageTitle }}</h1>
      </div>
    </header>

    <p v-if="loading" class="monthly-page__state" aria-live="polite"><LineChart :size="18" />{{ t("ridershipMonthly.loading") }}</p>
    <p v-else-if="error" class="monthly-page__state monthly-page__state--error" aria-live="assertive">{{ error }}</p>

    <template v-else-if="line">
      <section class="monthly-page__controls" :aria-label="t('ridershipMonthly.controlsAria')">
        <label>
          <span>{{ t("ridershipMonthly.stepLabel") }}</span>
          <select v-model="displayStepKey">
            <option v-for="step in displaySteps" :key="step" :value="String(step)">{{ windowLabel(step) }} · {{ chartRangeLabel(step) }}</option>
          </select>
        </label>
        <label class="monthly-page__check">
          <input v-model="showMovingAverage" type="checkbox" />
          <span>{{ movingAverageLabel }}</span>
        </label>
        <span class="monthly-page__period">{{ t("ridershipMonthly.periodsCovered", { from: periodLabel.split(" – ")[0], to: periodLabel.split(" – ")[1] }) }}</span>
      </section>

      <section class="monthly-page__metrics" :aria-label="t('ridershipMonthly.summaryAria')">
        <article>
          <span>{{ t("ridershipMonthly.total") }}</span>
          <strong>{{ formatNumber(summary.total) }}</strong>
          <small>{{ unitLabel }}</small>
        </article>
        <article>
          <span>{{ t("ridershipMonthly.averagePerCoveredDay") }}</span>
          <strong>{{ formatNumber(summary.averagePerCoveredDay) }}</strong>
          <small>{{ t("ridershipMonthly.monthCoverage", { covered: summary.coveredDays }) }}</small>
        </article>
        <article>
          <span>{{ t("ridershipMonthly.yearOverYear") }}</span>
          <strong :class="{ 'is-muted': summary.yearOverYear === null }">{{ formatPercent(summary.yearOverYear) }}</strong>
          <small>{{ summary.latest ? formatMonth(summary.latest.month) : t("ridershipMonthly.noComparison") }}</small>
        </article>
        <article>
          <span>{{ t("ridershipMonthly.totalProgression") }}</span>
          <strong :class="{ 'is-muted': chartSummary.totalProgression === null }">{{ formatPercent(chartSummary.totalProgression) }}</strong>
          <small>{{ t("ridershipMonthly.periodsCovered", { from: periodLabel.split(" – ")[0], to: periodLabel.split(" – ")[1] }) }}</small>
        </article>
        <article>
          <span>{{ t("ridershipMonthly.record") }}</span>
          <strong>{{ formatNumber(summary.record?.value) }}</strong>
          <small>{{ summary.record ? formatMonth(summary.record.month) : "—" }}</small>
        </article>
        <article>
          <span>{{ t("ridershipMonthly.lastMonth") }}</span>
          <strong>{{ formatNumber(summary.latest?.value) }}</strong>
          <small>{{ summary.latest ? `${formatMonth(summary.latest.month)} · ${statusLabel(summary.latest.status)}` : "—" }}</small>
        </article>
      </section>

      <section class="monthly-card monthly-card--chart">
        <div class="monthly-card__heading">
          <div>
            <span class="monthly-card__kicker"><LineChart :size="15" />{{ t("ridershipMonthly.rawValues") }}</span>
            <h2>{{ line.label }} · {{ windowLabel(displayStep) }} · {{ chartRangeLabel(displayStep) }}</h2>
          </div>
          <span class="monthly-card__unit">{{ unitLabel }}</span>
        </div>
        <MonthlyRidershipChart
          :series="chartSeries"
          :color="line.color"
          :label="`${line.label} · ${t('ridershipMonthly.rawValues')} · ${windowLabel(displayStep)}`"
          :locale="locale"
          :show-moving-average="showMovingAverage"
        />
        <div v-if="chartSeries.length" class="monthly-page__statuses">
          <span v-for="status in statuses" :key="status" :class="`monthly-status monthly-status--${status}`">
            {{ statusLabel(status) }} · {{ chartSeries.filter((point) => point.status === status).length }}
          </span>
        </div>
        <p v-else class="monthly-page__empty">{{ t("ridershipMonthly.noData") }}</p>
      </section>

      <section class="monthly-card monthly-card--cohort">
        <div class="monthly-card__heading">
          <div>
            <span class="monthly-card__kicker"><ShieldCheck :size="15" />{{ t("ridershipMonthly.cohortTitle") }}</span>
            <h2>{{ t("ridershipMonthly.referenceConfiguration") }}</h2>
          </div>
        </div>
        <div class="monthly-page__cohort-grid">
          <div>
            <strong>{{ line.cohort.includedStationIds.length }}</strong>
            <span>{{ t("ridershipMonthly.includedStations", { count: line.cohort.includedStationIds.length }) }}</span>
          </div>
          <div>
            <strong>{{ line.cohort.excludedStations.length }}</strong>
            <span>{{ t("ridershipMonthly.excludedStations", { count: line.cohort.excludedStations.length }) }}</span>
          </div>
          <div class="monthly-page__cohort-note">
            <strong>{{ t("ridershipMonthly.observableCohort") }}</strong>
            <span v-if="line.fullObservedCohortFrom">{{ formatMonth(line.fullObservedCohortFrom) }}</span>
            <span v-else>{{ t("ridershipMonthly.dataUnavailable") }}</span>
          </div>
        </div>
      </section>

      <section class="monthly-card monthly-card--stations">
        <button class="monthly-card__disclosure" type="button" :aria-expanded="stationsExpanded" @click="stationsExpanded = !stationsExpanded">
          <span><MapPin :size="16" />{{ t("ridershipMonthly.stationsTitle") }}</span>
          <small>{{ stationsExpanded ? t("ridershipMonthly.stationsClose") : t("ridershipMonthly.stationsOpen") }}</small>
          <ChevronDown :size="16" :class="{ 'is-open': stationsExpanded }" />
        </button>
        <div v-if="stationsExpanded" class="monthly-page__stations">
          <article v-for="station in line.stations" :key="station.id" class="monthly-page__station">
            <div class="monthly-page__station-heading">
              <div>
                <h3>{{ station.name }}</h3>
                <small>{{ station.city || t("ridershipMonthly.cityMissing") }}</small>
              </div>
              <span>{{ station.coverage.observedMonths }} / {{ station.series.length }}</span>
            </div>
            <MonthlyRidershipChart :series="stationSeries(station)" :color="line.color" :label="station.name" :locale="locale" compact />
          </article>
          <p v-if="!line.stations.length" class="monthly-page__empty">{{ t("ridershipMonthly.dataUnavailable") }}</p>
        </div>
      </section>

      <details v-if="line.cohort.excludedStations.length" class="monthly-card monthly-card--excluded">
        <summary><Info :size="16" />{{ t("ridershipMonthly.excludedTitle") }}</summary>
        <ul>
          <li v-for="station in line.cohort.excludedStations" :key="station.id">
            <strong>{{ station.name }}</strong>
            <span>{{ station.city || t("ridershipMonthly.cityMissing") }}</span>
            <small>{{ t("ridershipMonthly.excludedReason") }}</small>
            <small>{{ t("ridershipMonthly.otherLines", { lines: station.otherActiveLineIds.join(", ") }) }}</small>
          </li>
        </ul>
      </details>

      <section class="monthly-card monthly-card--milestones">
        <div class="monthly-card__heading">
          <div>
            <span class="monthly-card__kicker"><ShieldCheck :size="15" />{{ t("ridershipMonthly.milestonesTitle") }}</span>
            <h2>{{ t("ridershipMonthly.milestonesTitle") }}</h2>
          </div>
        </div>
        <ul v-if="line.milestones.length" class="monthly-page__milestones">
          <li v-for="milestone in line.milestones" :key="`${milestone.date}-${milestone.label}`">
            <time>{{ milestoneDate(milestone.date) }}</time>
            <div>
              <strong>{{ milestone.label }}</strong>
              <span>{{ milestone.description }}</span>
              <small>{{ t("ridershipMonthly.milestoneSource", { source: milestone.source }) }} · <a :href="milestone.sourceUrl" target="_blank" rel="noopener noreferrer"><ExternalLink :size="11" />{{ milestone.confidence }}</a></small>
            </div>
          </li>
        </ul>
        <p v-else class="monthly-page__empty">{{ t("ridershipMonthly.noMilestones") }}</p>
      </section>

      <details class="monthly-card monthly-card--sources">
        <summary>{{ t("ridershipMonthly.sourceTitle") }}</summary>
        <ul>
          <li v-for="source in line.sources" :key="source.id">
            <a :href="source.officialUrl" target="_blank" rel="noopener noreferrer">{{ source.datasetId }} <ExternalLink :size="12" /></a>
            <span>{{ t("ridershipMonthly.sourcePeriod", { period: sourcePeriodLabel(source) }) }}</span>
            <small>{{ t("ridershipMonthly.sourceRecords", { count: source.recordCount }) }} · SHA-256 {{ source.checksum.slice(0, 12) }}…</small>
          </li>
        </ul>
      </details>

      <section class="monthly-card monthly-card--methodology">
        <div class="monthly-card__heading">
          <div>
            <span class="monthly-card__kicker"><Info :size="15" />{{ t("ridershipMonthly.methodologyTitle") }}</span>
            <h2>{{ t("ridershipMonthly.methodologyTitle") }}</h2>
          </div>
        </div>
        <ul>
          <li>{{ t("ridershipMonthly.censoring") }}</li>
          <li>{{ t("ridershipMonthly.missingMonths") }}</li>
          <li>{{ t("ridershipMonthly.periodsCovered", { from: line.coverage.firstObservedMonth || "—", to: line.coverage.lastObservedMonth || "—" }) }}</li>
          <li>{{ t("ridershipMonthly.notComparableToOmnil") }}</li>
        </ul>
        <p class="monthly-page__disclaimer">{{ t("ridershipMonthly.disclaimer") }}</p>
      </section>
    </template>

    <StationBoardModal
      v-if="lineSelectorOpen"
      :open="lineSelectorOpen"
      line-only
      :initial-line="lineSelectorInitialLine"
      :initial-family="lineSelectorInitialFamily"
      @select-line="selectLineFromModal"
      @close="lineSelectorOpen = false"
    />
  </main>
</template>

<style scoped>
.monthly-page { min-height: 100vh; padding: 28px clamp(16px, 4vw, 64px) 72px; background: radial-gradient(circle at 0 0, color-mix(in srgb, var(--line-color) 10%, white), transparent 34%), #f5f7fb; color: #253452; }
.monthly-page__header, .monthly-page > template, .monthly-page__controls, .monthly-page__metrics, .monthly-card, .monthly-page__state { width: min(1080px, 100%); margin-inline: auto; }
.monthly-page__header { display: grid; gap: 20px; margin-bottom: 24px; }
.monthly-page__back { display: inline-flex; align-items: center; gap: 7px; width: max-content; color: #5b6985; font-size: .76rem; font-weight: 850; text-decoration: none; }
.monthly-page__back:hover { color: var(--line-color); }
.monthly-page__identity { display: grid; gap: 8px; }
.monthly-page__mode { display: inline-flex; align-items: center; justify-content: center; width: max-content; min-width: 42px; padding: 5px 9px; border-radius: 999px; font-size: .66rem; font-weight: 950; letter-spacing: .06em; }
.monthly-page__eyebrow, .monthly-card__kicker { display: inline-flex; align-items: center; gap: 7px; color: var(--line-color); font-size: .7rem; font-weight: 950; letter-spacing: .12em; text-transform: uppercase; }
.monthly-page h1 { max-width: 800px; margin: 0; color: #18233f; font-size: clamp(2rem, 5vw, 4.5rem); line-height: .98; letter-spacing: -.06em; }
.monthly-page__identity p { max-width: 700px; margin: 0; color: #71809d; font-size: .92rem; line-height: 1.5; }
.monthly-page__line-switch { display: inline-flex; align-items: center; gap: 7px; width: max-content; padding: 8px 11px; border: 1px solid color-mix(in srgb, var(--line-color) 24%, #dce3ef); border-radius: 10px; background: #fff; color: var(--line-color); font: inherit; font-size: .7rem; font-weight: 900; cursor: pointer; }
.monthly-page__line-switch:hover { background: color-mix(in srgb, var(--line-color) 7%, #fff); }
.monthly-page__state { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 160px; color: #71809d; font-weight: 800; }
.monthly-page__state--error { color: #a33d51; }
.monthly-page__controls { display: flex; flex-wrap: wrap; align-items: end; gap: 14px; margin-bottom: 14px; padding: 14px; border: 1px solid #e0e6f0; border-radius: 16px; background: rgba(255, 255, 255, .82); }
.monthly-page__controls label { display: grid; gap: 5px; color: #71809d; font-size: .64rem; font-weight: 850; }
.monthly-page__controls select { min-width: 130px; padding: 8px 30px 8px 10px; border: 1px solid #dce3ef; border-radius: 9px; background: #fff; color: #253452; font: inherit; font-size: .74rem; font-weight: 850; }
.monthly-page__check { display: flex !important; align-items: center; align-self: center; gap: 7px !important; padding-top: 18px; }
.monthly-page__period { margin-left: auto; color: #8491a9; font-size: .65rem; font-weight: 750; }
.monthly-page__metrics { display: grid; grid-template-columns: repeat(6, 1fr); gap: 9px; margin-bottom: 14px; }
.monthly-page__metrics article { display: grid; gap: 5px; min-width: 0; padding: 13px; border: 1px solid #e0e6f0; border-radius: 14px; background: #fff; box-shadow: 0 7px 18px rgba(28, 45, 79, .04); }
.monthly-page__metrics span { color: #8491a9; font-size: .62rem; font-weight: 850; }
.monthly-page__metrics strong { overflow: hidden; color: var(--line-color); font-size: clamp(1rem, 2.5vw, 1.45rem); letter-spacing: -.04em; text-overflow: ellipsis; white-space: nowrap; }
.monthly-page__metrics strong.is-muted { color: #9ba6b8; font-size: .85rem; letter-spacing: 0; }
.monthly-page__metrics small { min-height: 1.2em; color: #71809d; font-size: .58rem; line-height: 1.25; }
.monthly-card { margin-bottom: 14px; padding: clamp(15px, 3vw, 26px); border: 1px solid #e0e6f0; border-radius: 20px; background: rgba(255, 255, 255, .88); box-shadow: 0 12px 28px rgba(28, 45, 79, .05); }
.monthly-card__heading { display: flex; align-items: start; justify-content: space-between; gap: 12px; margin-bottom: 15px; }
.monthly-card__heading h2 { margin: 7px 0 0; color: #18233f; font-size: 1.15rem; letter-spacing: -.03em; }
.monthly-card__unit { padding: 5px 8px; border-radius: 999px; background: color-mix(in srgb, var(--line-color) 10%, white); color: var(--line-color); font-size: .62rem; font-weight: 900; }
.monthly-page__statuses { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
.monthly-status { padding: 5px 8px; border-radius: 999px; font-size: .6rem; font-weight: 900; }
.monthly-status--complete { background: #e8f5ee; color: #267348; }
.monthly-status--partial { background: #fff2d8; color: #9a6815; }
.monthly-status--missing { background: #eff2f7; color: #71809d; }
.monthly-page__cohort-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.monthly-page__cohort-grid > div { display: grid; gap: 6px; padding: 13px; border-radius: 13px; background: #f7f9fc; }
.monthly-page__cohort-grid strong { color: var(--line-color); font-size: 1.15rem; }
.monthly-page__cohort-grid span { color: #71809d; font-size: .68rem; line-height: 1.3; }
.monthly-page__cohort-note strong { font-size: .76rem; }
.monthly-card__disclosure { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 10px; width: 100%; padding: 0; border: 0; background: transparent; color: #253452; font: inherit; text-align: left; cursor: pointer; }
.monthly-card__disclosure > span { display: inline-flex; align-items: center; gap: 7px; font-size: .86rem; font-weight: 950; }
.monthly-card__disclosure small { color: #8491a9; font-size: .62rem; font-weight: 800; }
.monthly-card__disclosure svg:last-child { color: var(--line-color); transition: transform 160ms ease; }
.monthly-card__disclosure svg.is-open { transform: rotate(180deg); }
.monthly-page__stations { display: grid; gap: 12px; margin-top: 18px; }
.monthly-page__station { padding: 13px; border: 1px solid #e5eaf2; border-radius: 14px; background: #fbfcff; }
.monthly-page__station-heading { display: flex; align-items: start; justify-content: space-between; gap: 10px; margin-bottom: 5px; }
.monthly-page__station h3 { margin: 0; color: #253452; font-size: .8rem; }
.monthly-page__station small, .monthly-page__station-heading > span { color: #8491a9; font-size: .62rem; }
.monthly-card--excluded summary, .monthly-card--sources summary { display: flex; align-items: center; gap: 7px; color: #253452; font-size: .82rem; font-weight: 900; cursor: pointer; }
.monthly-card--excluded ul, .monthly-card--sources ul, .monthly-card--milestones ul, .monthly-card--methodology ul { display: grid; gap: 8px; margin: 15px 0 0; padding: 0; list-style: none; }
.monthly-card--excluded li, .monthly-card--sources li { display: grid; gap: 3px; padding: 10px; border-radius: 10px; background: #f7f9fc; }
.monthly-card--excluded li strong, .monthly-card--sources li a { color: #253452; font-size: .73rem; font-weight: 900; }
.monthly-card--excluded li span, .monthly-card--excluded li small, .monthly-card--sources li span, .monthly-card--sources li small { color: #71809d; font-size: .63rem; line-height: 1.35; }
.monthly-card--sources li a { display: inline-flex; align-items: center; gap: 5px; color: var(--line-color); text-decoration: none; }
.monthly-page__milestones li { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 12px; padding: 10px 0; border-bottom: 1px solid #edf0f5; }
.monthly-page__milestones li:last-child { border-bottom: 0; }
.monthly-page__milestones time { color: var(--line-color); font-size: .7rem; font-weight: 900; }
.monthly-page__milestones div { display: grid; gap: 4px; }
.monthly-page__milestones strong { color: #253452; font-size: .75rem; }
.monthly-page__milestones span, .monthly-page__milestones small { color: #71809d; font-size: .65rem; line-height: 1.35; }
.monthly-page__milestones a { display: inline-flex; align-items: center; gap: 3px; color: var(--line-color); }
.monthly-card--methodology li { color: #71809d; font-size: .7rem; line-height: 1.4; }
.monthly-page__disclaimer { margin: 18px 0 0; padding: 11px; border-left: 3px solid var(--line-color); background: color-mix(in srgb, var(--line-color) 6%, white); color: #51617d; font-size: .7rem; font-weight: 800; line-height: 1.4; }
.monthly-page__empty { margin: 0; color: #8491a9; font-size: .72rem; }
@media (max-width: 900px) { .monthly-page__metrics { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 580px) { .monthly-page { padding: 20px 12px 50px; } .monthly-page__metrics { grid-template-columns: repeat(2, 1fr); } .monthly-page__cohort-grid { grid-template-columns: 1fr; } .monthly-page__period { width: 100%; margin-left: 0; } .monthly-page__milestones li { grid-template-columns: 1fr; gap: 4px; } .monthly-card__disclosure { grid-template-columns: minmax(0, 1fr) auto; } .monthly-card__disclosure small { grid-column: 1; grid-row: 2; } .monthly-card__disclosure svg:last-child { grid-column: 2; grid-row: 1 / span 2; } }
</style>
