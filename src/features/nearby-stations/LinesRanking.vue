<script setup lang="ts">
import { computed, ref } from "vue";
import { LoaderCircle, SlidersHorizontal } from "lucide-vue-next";
import { useI18n, type TranslationKey } from "../../i18n";
import type {
  PublicServiceQuality,
  ReliabilityLabel,
  ReliabilityTrend,
  ServiceQualityLineReliability,
  ServiceQualityMode,
  ServiceQualityScoreMethod,
} from "./serviceQualityApi";

const props = defineProps<{
  data?: PublicServiceQuality;
  loading?: boolean;
  error?: Error;
}>();

const { d, n, t } = useI18n();
const modes: readonly ServiceQualityMode[] = ["METRO", "RER", "TRAIN", "TRAM"];
const modeOrder = new Map(modes.map((mode, index) => [mode, index]));
const selectedModes = ref<ServiceQualityMode[]>([...modes]);

const filteredLines = computed(() => [...(props.data?.lines ?? [])]
  .filter((line) => selectedModes.value.includes(line.mode))
  .sort((left, right) => {
    const scoreDelta = right.reliabilityScore - left.reliabilityScore;
    if (Math.abs(scoreDelta) > 0.0001) return scoreDelta;
    const modeDelta = (modeOrder.get(left.mode) ?? 99) - (modeOrder.get(right.mode) ?? 99);
    if (modeDelta !== 0) return modeDelta;
    return left.lineName.localeCompare(right.lineName, "fr", { numeric: true, sensitivity: "base" });
  }));

function isModeSelected(mode: ServiceQualityMode): boolean {
  return selectedModes.value.includes(mode);
}

function toggleMode(mode: ServiceQualityMode): void {
  selectedModes.value = isModeSelected(mode)
    ? selectedModes.value.filter((candidate) => candidate !== mode)
    : [...selectedModes.value, mode];
}

function modeLabel(mode: ServiceQualityMode): string {
  return t(`nearbyStations.linesRanking.modes.${mode}` as TranslationKey);
}

function reliabilityLabel(label: ReliabilityLabel): string {
  const key: Record<ReliabilityLabel, TranslationKey> = {
    "very-reliable": "nearbyStations.linesRanking.reliabilityLabels.veryReliable",
    reliable: "nearbyStations.linesRanking.reliabilityLabels.reliable",
    "fairly-reliable": "nearbyStations.linesRanking.reliabilityLabels.fairlyReliable",
    unreliable: "nearbyStations.linesRanking.reliabilityLabels.unreliable",
    "very-unreliable": "nearbyStations.linesRanking.reliabilityLabels.veryUnreliable",
  };
  return t(key[label]);
}

function trendLabel(trend: ReliabilityTrend): string {
  return t(`nearbyStations.linesRanking.trends.${trend}` as TranslationKey);
}

function methodLabel(method: ServiceQualityScoreMethod): string {
  const key: Record<ServiceQualityScoreMethod, TranslationKey> = {
    threshold: "nearbyStations.linesRanking.methods.threshold",
    "peer-comparison": "nearbyStations.linesRanking.methods.peerComparison",
    "metro-combined": "nearbyStations.linesRanking.methods.metroCombined",
  };
  return t(key[method]);
}

function formatValue(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value)
    ? t("nearbyStations.linesRanking.notAvailable")
    : n(value, { maximumFractionDigits: 2 });
}

function formatScore(value: number): string {
  return n(value, { maximumFractionDigits: 1 });
}

function formatMargin(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return t("nearbyStations.linesRanking.noThreshold");
  return `${value > 0 ? "+" : ""}${formatValue(value)}`;
}

function formatTrendDelta(value: number): string {
  return `${value > 0 ? "+" : ""}${formatValue(value)}`;
}

function lineAriaLabel(line: ServiceQualityLineReliability): string {
  return t("nearbyStations.linesRanking.lineAria", {
    line: line.lineName,
    mode: modeLabel(line.mode),
    score: formatScore(line.reliabilityScore),
  });
}

function indicatorValueSummary(line: ServiceQualityLineReliability): string {
  return line.indicators.map((indicator) => `${indicator.label}: ${indicator.values.map((entry) => `${entry.year} ${formatValue(entry.value)}`).join(", ")}`).join(" · ");
}
</script>

<template>
  <section class="lines-ranking" aria-labelledby="lines-ranking-title">
    <header class="lines-ranking__header">
      <div>
        <p class="lines-ranking__eyebrow">{{ t("nearbyStations.linesRanking.eyebrow") }}</p>
        <h1 id="lines-ranking-title">{{ t("nearbyStations.linesRanking.title") }}</h1>
        <p class="lines-ranking__subtitle">{{ t("nearbyStations.linesRanking.subtitle") }}</p>
      </div>
      <div v-if="data" class="lines-ranking__meta">
        <span>{{ data.lines.length }} {{ t("nearbyStations.linesRanking.line").toLowerCase() }}(s)</span>
        <span>{{ t("nearbyStations.linesRanking.updatedAt", { time: d(data.generatedAt, { dateStyle: "medium" }) }) }}</span>
      </div>
    </header>

    <div v-if="loading" class="lines-ranking__state" role="status">
      <LoaderCircle class="lines-ranking__spin" :size="20" aria-hidden="true" />
      {{ t("nearbyStations.linesRanking.loading") }}
    </div>
    <p v-else-if="error" class="lines-ranking__state lines-ranking__state--error" role="alert">
      {{ t("nearbyStations.linesRanking.error") }}
    </p>
    <p v-else-if="!data" class="lines-ranking__state" role="status">
      {{ t("nearbyStations.linesRanking.unavailable") }}
    </p>
    <template v-else>
      <section class="lines-ranking__filters" :aria-label="t('nearbyStations.linesRanking.filtersAria')">
        <div class="lines-ranking__filters-title">
          <SlidersHorizontal :size="16" aria-hidden="true" />
          <strong>{{ t("nearbyStations.linesRanking.filtersTitle") }}</strong>
        </div>
        <div class="lines-ranking__toggles">
          <button
            v-for="mode in modes"
            :key="mode"
            class="lines-ranking__toggle"
            :class="{ 'lines-ranking__toggle--active': isModeSelected(mode) }"
            type="button"
            role="switch"
            :aria-checked="isModeSelected(mode)"
            :aria-label="modeLabel(mode)"
            :data-testid="`lines-ranking-mode-${mode}`"
            @click="toggleMode(mode)"
          >
            <span class="lines-ranking__toggle-track" aria-hidden="true"><span /></span>
            {{ modeLabel(mode) }}
          </button>
        </div>
      </section>

      <p v-if="filteredLines.length === 0" class="lines-ranking__state" role="status">
        {{ t("nearbyStations.linesRanking.empty") }}
      </p>
      <div v-else class="lines-ranking__table-wrap">
        <table class="lines-ranking__table" :aria-label="t('nearbyStations.linesRanking.tableAria')">
          <thead>
            <tr>
              <th scope="col">{{ t("nearbyStations.linesRanking.line") }}</th>
              <th scope="col">{{ t("nearbyStations.linesRanking.mode") }}</th>
              <th scope="col">{{ t("nearbyStations.linesRanking.score") }}</th>
              <th scope="col">{{ t("nearbyStations.linesRanking.reliability") }}</th>
              <th scope="col">{{ t("nearbyStations.linesRanking.latestValue") }}</th>
              <th scope="col">{{ t("nearbyStations.linesRanking.weightedValue") }}</th>
              <th scope="col">{{ t("nearbyStations.linesRanking.threshold") }}</th>
              <th scope="col">{{ t("nearbyStations.linesRanking.margin") }}</th>
              <th scope="col">{{ t("nearbyStations.linesRanking.trend") }}</th>
              <th scope="col">{{ t("nearbyStations.linesRanking.years") }}</th>
              <th scope="col">{{ t("nearbyStations.linesRanking.method") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in filteredLines" :key="line.lineId" data-testid="lines-ranking-row" :aria-label="lineAriaLabel(line)">
              <th scope="row">
                <strong>{{ line.lineName }}</strong>
                <details v-if="line.indicators.length" class="lines-ranking__details">
                  <summary>{{ t("nearbyStations.linesRanking.details") }}</summary>
                  <div v-for="indicator in line.indicators" :key="indicator.id" class="lines-ranking__indicator">
                    <strong>{{ indicator.label }}</strong>
                    <span>{{ indicatorValueSummary({ ...line, indicators: [indicator] }) }}</span>
                  </div>
                </details>
              </th>
              <td><span class="lines-ranking__mode">{{ modeLabel(line.mode) }}</span></td>
              <td class="lines-ranking__score">{{ formatScore(line.reliabilityScore) }}/100</td>
              <td><span class="lines-ranking__badge" :class="`lines-ranking__badge--${line.labelKey}`">{{ reliabilityLabel(line.labelKey) }}</span></td>
              <td>{{ formatValue(line.latestValue) }}</td>
              <td>{{ formatValue(line.weightedValue) }}</td>
              <td>{{ formatValue(line.threshold) }}</td>
              <td>{{ formatMargin(line.marginToThreshold) }}</td>
              <td><span :class="`lines-ranking__trend lines-ranking__trend--${line.trend}`">{{ trendLabel(line.trend) }} ({{ formatTrendDelta(line.trendDelta) }})</span></td>
              <td>{{ line.yearsUsed.join(", ") || t("nearbyStations.linesRanking.notAvailable") }}</td>
              <td>{{ methodLabel(line.scoreMethod) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer v-if="data.sources.length || data.warnings.length" class="lines-ranking__footer">
        <p v-for="source in data.sources" :key="source.id">
          <strong>{{ t("nearbyStations.linesRanking.source") }} :</strong>
          <a :href="source.pageUrl" target="_blank" rel="noopener noreferrer">{{ source.title }}</a>
          <span> · {{ source.producer }}</span>
        </p>
        <p v-for="warning in data.warnings" :key="warning" class="lines-ranking__warning">{{ warning }}</p>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.lines-ranking { background: #fff; border: 1px solid rgba(16,35,63,.12); border-radius: 22px; box-shadow: 0 18px 48px rgba(16,35,63,.09); overflow: hidden; }
.lines-ranking__header { align-items: flex-end; background: linear-gradient(135deg, #18233f 0%, #302978 100%); color: #fff; display: flex; gap: 28px; justify-content: space-between; padding: clamp(22px, 4vw, 42px); }
.lines-ranking__eyebrow { color: #c6c1ff; font-size: .69rem; font-weight: 900; letter-spacing: .12em; margin: 0 0 8px; text-transform: uppercase; }
.lines-ranking h1 { font-size: clamp(1.65rem, 4vw, 2.5rem); letter-spacing: -.04em; margin: 0; }
.lines-ranking__subtitle { color: rgba(255,255,255,.76); font-size: .92rem; line-height: 1.5; margin: 10px 0 0; max-width: 690px; }
.lines-ranking__meta { color: rgba(255,255,255,.76); display: grid; font-size: .73rem; gap: 5px; text-align: right; white-space: nowrap; }
.lines-ranking__filters { align-items: center; border-bottom: 1px solid #e8ebf2; display: flex; gap: 20px; justify-content: space-between; padding: 16px clamp(16px, 3vw, 28px); }
.lines-ranking__filters-title { align-items: center; color: #344054; display: flex; font-size: .78rem; gap: 7px; }
.lines-ranking__toggles { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.lines-ranking__toggle { align-items: center; background: #f5f6fa; border: 1px solid #dfe3ec; border-radius: 999px; color: #475467; cursor: pointer; display: inline-flex; font: inherit; font-size: .72rem; font-weight: 800; gap: 7px; padding: 7px 10px; }
.lines-ranking__toggle--active { background: #eeecff; border-color: #aba5ff; color: #4034df; }
.lines-ranking__toggle-track { background: #aab2c1; border-radius: 999px; display: inline-flex; height: 14px; padding: 2px; transition: background .15s; width: 25px; }
.lines-ranking__toggle-track span { background: #fff; border-radius: 50%; height: 10px; transform: translateX(0); transition: transform .15s; width: 10px; }
.lines-ranking__toggle--active .lines-ranking__toggle-track { background: #5146ff; }
.lines-ranking__toggle--active .lines-ranking__toggle-track span { transform: translateX(11px); }
.lines-ranking__table-wrap { overflow-x: auto; }
.lines-ranking__table { border-collapse: collapse; font-size: .73rem; min-width: 1160px; width: 100%; }
.lines-ranking__table th, .lines-ranking__table td { border-bottom: 1px solid #edf0f5; padding: 12px 11px; text-align: left; vertical-align: top; }
.lines-ranking__table thead th { background: #fafbfc; color: #667085; font-size: .65rem; font-weight: 900; letter-spacing: .04em; position: sticky; text-transform: uppercase; top: 0; z-index: 1; }
.lines-ranking__table tbody th { color: #18233f; min-width: 130px; }
.lines-ranking__table tbody tr:hover { background: #fbfbff; }
.lines-ranking__score { color: #4034df; font-size: .86rem; font-weight: 950; white-space: nowrap; }
.lines-ranking__mode { color: #475467; white-space: nowrap; }
.lines-ranking__badge { border-radius: 999px; display: inline-block; font-size: .67rem; font-weight: 850; padding: 4px 7px; white-space: nowrap; }
.lines-ranking__badge--very-reliable { background: #e3f5e9; color: #137443; }
.lines-ranking__badge--reliable { background: #edf7e7; color: #3c7e34; }
.lines-ranking__badge--fairly-reliable { background: #fff5d9; color: #936600; }
.lines-ranking__badge--unreliable { background: #fff0e8; color: #b74b24; }
.lines-ranking__badge--very-unreliable { background: #ffe5e3; color: #a32d2d; }
.lines-ranking__trend--improving { color: #17864c; }
.lines-ranking__trend--stable { color: #667085; }
.lines-ranking__trend--declining { color: #b74b24; }
.lines-ranking__details { color: #5146ff; font-size: .65rem; font-weight: 700; margin-top: 5px; }
.lines-ranking__indicator { color: #667085; display: grid; font-size: .64rem; font-weight: 500; gap: 2px; margin-top: 6px; }
.lines-ranking__indicator strong { color: #475467; }
.lines-ranking__state { align-items: center; color: #667085; display: flex; gap: 9px; justify-content: center; min-height: 170px; padding: 25px; text-align: center; }
.lines-ranking__state--error { color: #b42318; }
.lines-ranking__footer { background: #fafbfc; border-top: 1px solid #e8ebf2; color: #667085; font-size: .68rem; line-height: 1.45; padding: 12px 16px; }
.lines-ranking__footer p { margin: 0 0 4px; }
.lines-ranking__footer p:last-child { margin-bottom: 0; }
.lines-ranking__footer a { color: #5146ff; font-weight: 750; }
.lines-ranking__warning { color: #936600; }
.lines-ranking__spin { animation: lines-ranking-spin .9s linear infinite; }
@keyframes lines-ranking-spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) {
  .lines-ranking-page { padding-inline: 10px; }
  .lines-ranking__header, .lines-ranking__filters { align-items: flex-start; flex-direction: column; }
  .lines-ranking__meta { text-align: left; }
  .lines-ranking__toggles { justify-content: flex-start; }
}
</style>
