<script setup lang="ts">
import { CircleHelp } from "lucide-vue-next";
import { useRouter } from "#imports";
import { computed } from "vue";
import { useI18n, type TranslationKey } from "../../i18n";
import type { NeighborhoodFact, NeighborhoodFactGeography, NeighborhoodFactPlace, NeighborhoodFactTransportReliabilityLine } from "./neighborhood";
import MiniTravelDisplay from "./MiniTravelDisplay.vue";
import type { ReliabilityLabel, ServiceQualityMode } from "./serviceQualityApi";

const props = defineProps<{
  fact: NeighborhoodFact;
  open?: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
}>();

const { d, n, t } = useI18n();
const router = useRouter();

const transportModes: readonly ServiceQualityMode[] = ["METRO", "RER", "TRAIN", "TRAM"];
const transportModeKeys: Record<ServiceQualityMode, TranslationKey> = {
  METRO: "nearbyStations.linesRanking.modes.METRO",
  RER: "nearbyStations.linesRanking.modes.RER",
  TRAIN: "nearbyStations.linesRanking.modes.TRAIN",
  TRAM: "nearbyStations.linesRanking.modes.TRAM",
};
const reliabilityLabelKeys: Record<ReliabilityLabel, TranslationKey> = {
  "very-reliable": "nearbyStations.linesRanking.reliabilityLabels.veryReliable",
  reliable: "nearbyStations.linesRanking.reliabilityLabels.reliable",
  "fairly-reliable": "nearbyStations.linesRanking.reliabilityLabels.fairlyReliable",
  unreliable: "nearbyStations.linesRanking.reliabilityLabels.unreliable",
  "very-unreliable": "nearbyStations.linesRanking.reliabilityLabels.veryUnreliable",
};

interface TransportReliabilityGroup {
  mode: ServiceQualityMode;
  lines: NeighborhoodFactTransportReliabilityLine[];
}

const geographyKeys: Record<NeighborhoodFactGeography["level"], TranslationKey> = {
  point: "nearbyStations.neighborhoodScore.evidence.geographyPoint",
  commune: "nearbyStations.neighborhoodScore.evidence.geographyCommune",
  department: "nearbyStations.neighborhoodScore.evidence.geographyDepartment",
  region: "nearbyStations.neighborhoodScore.evidence.geographyRegion",
};

function proofKey(proof: NeighborhoodFact["evidence"]["proof"]): TranslationKey {
  return proof === "direct"
    ? "nearbyStations.neighborhoodScore.evidence.direct"
    : "nearbyStations.neighborhoodScore.evidence.derived";
}

function toggle(): void {
  emit("toggle");
}

function factLabel(): string {
  return props.fact.label ?? (props.fact.labelKey ? t(props.fact.labelKey, props.fact.labelValues) : "");
}

function factTooltip(): string {
  if (props.fact.tooltip) return props.fact.tooltip;
  if (!props.fact.tooltipKey) return "";
  const values = props.fact.tooltipValues;
  if (props.fact.kind === "transportServiceQuality" && typeof values?.trend === "string") {
    const trendKey: Record<string, TranslationKey> = {
      improving: "nearbyStations.linesRanking.trends.improving",
      stable: "nearbyStations.linesRanking.trends.stable",
      declining: "nearbyStations.linesRanking.trends.declining",
    };
    return t(props.fact.tooltipKey, { ...values, trend: t(trendKey[values.trend] ?? "nearbyStations.linesRanking.trends.stable") });
  }
  return t(props.fact.tooltipKey, values);
}

function modeLabel(mode: ServiceQualityMode): string {
  return t(transportModeKeys[mode]);
}

function reliabilityLabel(label: ReliabilityLabel): string {
  return t(reliabilityLabelKeys[label]);
}

function formatReliabilityScore(score: number): string {
  return n(score, { maximumFractionDigits: 1 });
}

function compareTransportReliabilityLines(
  left: NeighborhoodFactTransportReliabilityLine,
  right: NeighborhoodFactTransportReliabilityLine,
): number {
  const scoreDelta = right.reliabilityScore - left.reliabilityScore;
  if (Math.abs(scoreDelta) > 0.0001) return scoreDelta;
  return left.lineName.localeCompare(right.lineName, "fr", { numeric: true, sensitivity: "base" });
}

const transportReliabilityGroups = computed<TransportReliabilityGroup[]>(() => {
  if (props.fact.kind !== "transportServiceQuality") return [];
  const lines = props.fact.transportReliabilityLines ?? [];
  return transportModes
    .map((mode) => ({
      mode,
      lines: lines
        .filter((line) => line.mode === mode)
        .sort(compareTransportReliabilityLines),
    }))
    .filter((group) => group.lines.length > 0);
});

function transportLineAriaLabel(line: NeighborhoodFactTransportReliabilityLine): string {
  return t("nearbyStations.linesRanking.lineAria", {
    line: line.lineName,
    mode: modeLabel(line.mode),
    score: formatReliabilityScore(line.reliabilityScore),
  });
}

function placeItemLabel(place: NeighborhoodFactPlace): string {
  return t("nearbyStations.neighborhoodScore.evidence.placeItem", {
    name: place.name,
    minutes: place.minutes,
    meters: place.distanceMeters,
  });
}

function openAction(): void {
  if (props.fact.action?.href) void router.replace({ path: props.fact.action.href });
}

function geographyLabel(): string {
  const geography = props.fact.evidence.geography;
  if (!geography) return "";
  const key = geographyKeys[geography.level];
  return `${t(key)}${geography.name ? ` · ${geography.name}` : geography.code ? ` · ${geography.code}` : ""}`;
}
</script>

<template>
  <div
    class="nearby-neighborhood-score-fact"
    :class="[
      `nearby-neighborhood-score-fact--${fact.polarity}`,
      { 'nearby-neighborhood-score-fact--open': open },
    ]"
  >
    <button
      class="nearby-neighborhood-score-fact__trigger"
      type="button"
      :aria-describedby="`neighborhood-score-fact-${fact.id}`"
      :aria-expanded="open"
      @click="toggle"
    >
      <span
        class="nearby-neighborhood-score-fact__marker"
        :class="{ 'nearby-neighborhood-score-fact__marker--exceptional': fact.emphasis === 'exceptional' }"
        aria-hidden="true"
      >
        {{ fact.emphasis === "exceptional" ? "+++" : fact.polarity === "positive" ? "+" : fact.polarity === "negative" ? "−" : "•" }}
      </span>
      <span>{{ factLabel() }}</span>
      <CircleHelp :size="15" aria-hidden="true" />
    </button>
    <div
      :id="`neighborhood-score-fact-${fact.id}`"
      class="nearby-neighborhood-score-fact__tooltip"
      role="tooltip"
    >
      <strong>{{ factTooltip() }}</strong>
      <section
        v-if="transportReliabilityGroups.length"
        class="nearby-neighborhood-score-fact__transport-lines"
        :aria-label="t('nearbyStations.neighborhoodScore.transportReliabilityBreakdown')"
      >
        <h4>{{ t("nearbyStations.neighborhoodScore.transportReliabilityBreakdown") }}</h4>
        <div
          v-for="group in transportReliabilityGroups"
          :key="group.mode"
          class="nearby-neighborhood-score-fact__transport-line-group"
          :data-testid="`nearby-transport-reliability-mode-${group.mode}`"
        >
          <h5>{{ modeLabel(group.mode) }}</h5>
          <ol class="nearby-neighborhood-score-fact__transport-line-list">
            <li
              v-for="line in group.lines"
              :key="line.lineId"
              class="nearby-neighborhood-score-fact__transport-line"
              data-testid="nearby-transport-reliability-line"
              :aria-label="transportLineAriaLabel(line)"
            >
              <span class="nearby-neighborhood-score-fact__transport-line-name">
                {{ t("nearbyStations.linesRanking.line") }} {{ line.lineName }}
                <span class="nearby-neighborhood-score-fact__transport-line-label">
                 ({{ reliabilityLabel(line.labelKey) }})
                </span>
              </span>
              <span class="nearby-neighborhood-score-fact__transport-line-score">
                {{ formatReliabilityScore(line.reliabilityScore) }}/100
              </span>
            </li>
          </ol>
        </div>
      </section>
      <ul v-if="fact.places?.length" class="nearby-neighborhood-score-fact__places">
        <li v-for="place in fact.places" :key="`${place.name}-${place.distanceMeters}`">
          {{ placeItemLabel(place) }}
        </li>
      </ul>
      <MiniTravelDisplay v-if="fact.travel" :journey="fact.travel.journey" />
      <dl>
        <div>
          <dt>{{ t("nearbyStations.neighborhoodScore.evidence.sourceLabel") }}</dt>
          <dd>
            <a v-if="fact.evidence.sourceUrl" :href="fact.evidence.sourceUrl" target="_blank" rel="noopener noreferrer">{{ fact.evidence.sourceName }}</a>
            <template v-else>{{ fact.evidence.sourceName ?? (fact.evidence.sourceKey ? t(fact.evidence.sourceKey) : "—") }}</template>
            <small v-if="fact.evidence.licence"> · {{ fact.evidence.licence }}</small>
          </dd>
        </div>
        <div>
          <dt>{{ t("nearbyStations.neighborhoodScore.evidence.ruleLabel") }}</dt>
          <dd>{{ fact.evidence.rule ?? (fact.evidence.ruleKey ? t(fact.evidence.ruleKey, fact.evidence.ruleValues) : "—") }}</dd>
        </div>
        <div v-if="fact.evidence.referencePeriod">
          <dt>{{ t("nearbyStations.neighborhoodScore.evidence.periodLabel") }}</dt>
          <dd>{{ fact.evidence.referencePeriod }}</dd>
        </div>
        <div v-if="fact.evidence.value !== undefined || fact.evidence.unit || fact.evidence.geography">
          <dt>{{ t("nearbyStations.neighborhoodScore.evidence.valueLabel") }}</dt>
          <dd>
            <span v-if="fact.evidence.value !== undefined">{{ fact.evidence.value }}<template v-if="fact.evidence.unit"> {{ fact.evidence.unit }}</template></span>
            <span v-if="fact.evidence.geography"> · {{ geographyLabel() }}</span>
          </dd>
        </div>
        <div>
          <dt>{{ t("nearbyStations.neighborhoodScore.evidence.proofLabel") }}</dt>
          <dd>{{ t(proofKey(fact.evidence.proof)) }}</dd>
        </div>
        <div>
          <dt>{{ t("nearbyStations.neighborhoodScore.evidence.freshnessLabel") }}</dt>
          <dd>{{ t("nearbyStations.neighborhoodScore.evidence.loadedAt", { time: d(fact.evidence.observedAt, { dateStyle: "short", timeStyle: "short" }) }) }}</dd>
        </div>
      </dl>
      <button
        v-if="fact.action"
        type="button"
        class="nearby-neighborhood-score-fact__action"
        @click.stop="openAction"
      >
        {{ t(fact.action.labelKey) }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.nearby-neighborhood-score-fact { position: relative; }
.nearby-neighborhood-score-fact__trigger { align-items: center; background: transparent; border-radius: 9px; color: var(--ink); display: grid; font-size: .8rem; gap: 7px; grid-template-columns: 31px minmax(0, 1fr) auto; justify-content: flex-start; line-height: 1.35; min-height: 35px; padding: 6px 7px; text-align: left; width: 100%; }
.nearby-neighborhood-score-fact__trigger:hover, .nearby-neighborhood-score-fact__trigger:focus-visible { background: #f6f7fb; outline: 0; }
.nearby-neighborhood-score-fact__trigger > span:nth-child(2) { min-width: 0; }
.nearby-neighborhood-score-fact__trigger > svg { color: #8490a4; flex: 0 0 auto; }
.nearby-neighborhood-score-fact__marker { align-items: center; border-radius: 999px; display: inline-flex; font-size: .72rem; font-weight: 950; height: 19px; justify-content: center; justify-self: center; width: 19px; }
.nearby-neighborhood-score-fact__marker--exceptional { font-size: .61rem; letter-spacing: -.08em; width: 31px; }
.nearby-neighborhood-score-fact--positive .nearby-neighborhood-score-fact__marker { background: #e3f5e9; color: #17864c; }
.nearby-neighborhood-score-fact--negative .nearby-neighborhood-score-fact__marker { background: #fff0e8; color: #b74b24; }
.nearby-neighborhood-score-fact--neutral .nearby-neighborhood-score-fact__marker { background: #eef2f7; color: #64748b; }
.nearby-neighborhood-score-fact__tooltip { background: #fff; border: 1px solid rgba(16,35,63,.16); border-radius: 11px; box-shadow: 0 14px 30px rgba(16,35,63,.16); color: #344054; left: 0; max-width: min(380px, calc(100vw - 42px)); opacity: 0; padding: 11px 12px; pointer-events: none; position: absolute; top: calc(100% + 4px); transform: translateY(-3px); transition: opacity .14s ease, transform .14s ease, visibility .14s ease; visibility: hidden; width: max-content; z-index: 8; }
.nearby-neighborhood-score-fact:hover .nearby-neighborhood-score-fact__tooltip, .nearby-neighborhood-score-fact:focus-within .nearby-neighborhood-score-fact__tooltip, .nearby-neighborhood-score-fact--open .nearby-neighborhood-score-fact__tooltip { opacity: 1; pointer-events: auto; transform: translateY(0); visibility: visible; }
.nearby-neighborhood-score-fact__tooltip strong { color: var(--ink); display: block; font-size: .78rem; line-height: 1.35; max-width: 355px; }
.nearby-neighborhood-score-fact__transport-lines { border-top: 1px solid #e8ebf2; margin-top: 9px; max-width: 355px; padding-top: 8px; }
.nearby-neighborhood-score-fact__transport-lines h4 { color: #667085; font-size: .64rem; font-weight: 900; letter-spacing: .03em; margin: 0 0 6px; text-transform: uppercase; }
.nearby-neighborhood-score-fact__transport-line-group + .nearby-neighborhood-score-fact__transport-line-group { margin-top: 7px; }
.nearby-neighborhood-score-fact__transport-line-group h5 { color: var(--ink); font-size: .69rem; margin: 0 0 3px; }
.nearby-neighborhood-score-fact__transport-line-list { display: grid; gap: 3px; list-style: none; margin: 0; max-height: min(260px, 45vh); overflow: auto; padding: 0; }
.nearby-neighborhood-score-fact__transport-line { align-items: baseline; display: grid; gap: 2px 6px; grid-template-columns: minmax(0, 1fr) auto; padding: 2px 0; }
.nearby-neighborhood-score-fact__transport-line-name { color: #344054; font-size: .7rem; min-width: 0; overflow-wrap: anywhere; }
.nearby-neighborhood-score-fact__transport-line-score { color: #4034df; font-size: .7rem; font-variant-numeric: tabular-nums; font-weight: 900; white-space: nowrap; }
.nearby-neighborhood-score-fact__transport-line-label { color: #667085; font-size: .64rem; grid-column: 1 / -1; margin-top: -2px; }
.nearby-neighborhood-score-fact__places { display: grid; gap: 3px; list-style: none; margin: 8px 0 0; max-width: 355px; padding: 0; }
.nearby-neighborhood-score-fact__places li { color: #344054; font-size: .68rem; line-height: 1.35; padding-left: 10px; position: relative; }
.nearby-neighborhood-score-fact__places li::before { color: #8490a4; content: "·"; left: 0; position: absolute; }
.nearby-neighborhood-score-fact__tooltip dl { display: grid; gap: 5px; margin: 9px 0 0; }
.nearby-neighborhood-score-fact__tooltip dl > div { display: grid; gap: 2px; grid-template-columns: auto 1fr; }
.nearby-neighborhood-score-fact__tooltip dt { color: #8490a4; font-size: .64rem; font-weight: 850; }
.nearby-neighborhood-score-fact__tooltip dd { color: #344054; font-size: .68rem; margin: 0; }
.nearby-neighborhood-score-fact__action { background: #5146ff; border: 0; border-radius: 8px; color: #fff; cursor: pointer; font: inherit; font-size: .7rem; font-weight: 850; margin-top: 10px; padding: 7px 9px; }
.nearby-neighborhood-score-fact__action:hover, .nearby-neighborhood-score-fact__action:focus-visible { background: #4034df; outline: 2px solid rgba(81,70,255,.24); outline-offset: 2px; }
@media (max-width: 680px) {
  .nearby-neighborhood-score-fact__tooltip { left: 0; max-width: calc(100vw - 42px); position: absolute; top: calc(100% + 4px); transform: none; width: calc(100vw - 42px); }
  .nearby-neighborhood-score-fact:hover .nearby-neighborhood-score-fact__tooltip { opacity: 0; pointer-events: none; visibility: hidden; }
  .nearby-neighborhood-score-fact:focus-within .nearby-neighborhood-score-fact__tooltip, .nearby-neighborhood-score-fact--open .nearby-neighborhood-score-fact__tooltip { opacity: 1; pointer-events: auto; position: relative; top: auto; visibility: visible; width: auto; }
}
</style>
