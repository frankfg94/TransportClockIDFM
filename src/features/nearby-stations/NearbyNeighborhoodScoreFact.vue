<script setup lang="ts">
import { CalendarDays, CircleHelp, Clapperboard, Footprints } from "lucide-vue-next";
import { useRouter } from "#imports";
import { computed } from "vue";
import { useI18n, type TranslationKey } from "../../i18n";
import { foodMarketSchedule, transportSectionValues } from "./neighborhood/factPresentation";
import { getNeighborhoodFactMarker, hasExceptionalFactMarker } from "./neighborhood/facts";
import type { NeighborhoodFact, NeighborhoodFactGeography, NeighborhoodFactPlace, NeighborhoodFactTransportReliabilityLine } from "./neighborhood";
import MiniTravelDisplay from "./MiniTravelDisplay.vue";
import { summarizeNearbyStationAccess } from "./nearbyJourneyTiming";
import type { ServiceQualityMode } from "./serviceQualityApi";
import LineIconBadge from "../../components/LineIconBadge.vue";
import { createLinePresentation } from "../../services/linePresentation";
import type { TransitFamily } from "../../types/transit";
import { formatServiceTime } from "./neighborhood/journeys";
import { formatTransportLineName } from "./neighborhood/verdict-transport-facts/heavyTransports";

const props = defineProps<{
  fact: NeighborhoodFact;
  open?: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
}>();

const { d, n, t } = useI18n();
const cinemaSize = computed(() => {
  const values = props.fact.tooltipValues;
  if (props.fact.family !== "cinema" || typeof values?.area !== "number") return undefined;
  const size = (["small", "medium", "large"] as const).find(size => size === values.size);
  if (!size) return undefined;
  return {
    label: t(`nearbyStations.neighborhoodScore.venueAnalysis.cinemaArea.${size}`),
    surface: t("nearbyStations.neighborhoodScore.venueAnalysis.cinemaSurface", { area: n(values.area) }),
  };
});
const marketTooltip = computed(() => {
  const values = props.fact.tooltipValues;
  if (props.fact.family !== "food-market" || !values || typeof values.hours !== "string") return undefined;
  const localized = transportSectionValues(props.fact, values, t);
  const formatMonth = (month: number) => d(new Date(Date.UTC(2024, month, 1)), { month: "short", timeZone: "UTC" });
  const area = typeof values.area === "number"
    ? t("nearbyStations.neighborhoodScore.venueAnalysis.marketArea", { area: `${values.areaFromFootprint ? "≈" : ""}${n(values.area)}` })
    : localized?.area;
  return {
    size: localized?.size, area, minutes: values.minutes, sessions: values.sessions, areaFromFootprint: Boolean(values.areaFromFootprint),
    traders: typeof values.listedTraders === "number" && values.traders === "—"
      ? t("nearbyStations.neighborhoodScore.venueAnalysis.tradersListed", { count: values.listedTraders }) : values.traders,
    schedule: values.hours === "—" ? undefined : foodMarketSchedule(values.hours, t, formatMonth),
  };
});
const router = useRouter();
const exceptionalMarker = computed(() => hasExceptionalFactMarker(props.fact));
const transportAccessChoices = computed(() => props.fact.travel?.routes?.filter(route => route.accessMinutes !== undefined)
  .map(route => ({ ...route, ...summarizeNearbyStationAccess(route.journey) })) ?? []);
const hasEstimatedWalking = computed(() => (props.fact.travel?.routes?.map(route => route.journey)
  ?? (props.fact.travel ? [props.fact.travel.journey] : []))
  .some(journey => summarizeNearbyStationAccess(journey).walkingEstimated));
const hasGtfsJourney = computed(() => props.fact.travel?.journey.source === "gtfs"
  || props.fact.travel?.routes?.some(route => route.journey.source === "gtfs"));

type StructuralLine = NonNullable<NeighborhoodFact["transportLines"]>[number];
const structuralModeKeys = {
  METRO: "nearbyStations.neighborhoodScore.structuralModes.metro",
  RER: "nearbyStations.neighborhoodScore.structuralModes.rer",
  TRAIN: "nearbyStations.neighborhoodScore.structuralModes.train",
  TRAM: "nearbyStations.neighborhoodScore.structuralModes.tram",
  CABLE: "nearbyStations.neighborhoodScore.structuralModes.cable",
  OTHER: "nearbyStations.neighborhoodScore.structuralModes.other",
} as const;
const structuralGroups = computed(() => Object.entries(structuralModeKeys).map(([mode, labelKey]) => ({
  mode, labelKey,
  lines: (props.fact.transportLines ?? []).filter(line => {
    const group = line.mode === "TRANSILIEN" ? "TRAIN" : line.mode in structuralModeKeys ? line.mode : "OTHER";
    return group === mode;
  }).sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true })),
})).filter(group => group.lines.length));

function lineIcon(line: StructuralLine) {
  const family = (line.mode === "TRAIN" ? "TRANSILIEN" : line.mode) as TransitFamily;
  const label = formatTransportLineName(line).replace(/^(?:métro|metro|rer|train|transilien|tramway|tram|câble|cable)\s+/iu, "");
  return { id: line.id, label, family,
    ...createLinePresentation({ id: line.id, code: label, family,
      color: line.color || undefined, textColor: line.textColor || undefined }) };
}

function lastServiceTime(seconds: number): string {
  return `${formatServiceTime(seconds)}${seconds >= 86400 ? ` ${t("nearbyStations.neighborhoodScore.nextServiceDay")}` : ""}`;
}

const transportModes: readonly ServiceQualityMode[] = ["METRO", "RER", "TRAIN", "TRAM"];
const transportModeKeys: Record<ServiceQualityMode, TranslationKey> = {
  METRO: "nearbyStations.linesRanking.modes.METRO",
  RER: "nearbyStations.linesRanking.modes.RER",
  TRAIN: "nearbyStations.linesRanking.modes.TRAIN",
  TRAM: "nearbyStations.linesRanking.modes.TRAM",
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
  return props.fact.label ?? (props.fact.labelKey ? t(props.fact.labelKey, transportSectionValues(props.fact, props.fact.labelValues, t)) : "");
}

function factTooltip(): string {
  if (props.fact.tooltip) return props.fact.tooltip;
  if (!props.fact.tooltipKey) return "";
  const values = transportSectionValues(props.fact, props.fact.tooltipValues, t);
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
  return t("nearbyStations.neighborhoodScore.regularityLineAria", {
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
        :class="{ 'nearby-neighborhood-score-fact__marker--exceptional': exceptionalMarker }"
        aria-hidden="true"
      >
        {{ getNeighborhoodFactMarker(fact) }}
      </span>
      <span>{{ factLabel() }}</span>
      <CircleHelp :size="15" aria-hidden="true" />
    </button>
    <ul v-if="fact.nearerStationAccesses?.length" class="nearby-neighborhood-score-fact__nearer-stations"
      :aria-label="t('nearbyStations.neighborhoodScore.nearerStationAccesses')">
      <li v-for="access in fact.nearerStationAccesses" :key="`${access.station}:${access.meters}`">
        {{ t("nearbyStations.neighborhoodScore.facts.transportStationNearby.label", transportSectionValues(fact, access, t)) }}
      </li>
    </ul>
    <div
      :id="`neighborhood-score-fact-${fact.id}`"
      class="nearby-neighborhood-score-fact__tooltip"
      :class="{ 'nearby-neighborhood-score-fact__tooltip--market': marketTooltip }"
      role="tooltip"
    >
      <div v-if="marketTooltip" class="nearby-neighborhood-score-fact__market" data-testid="food-market-tooltip">
        <p v-if="marketTooltip.minutes !== '—'" class="nearby-neighborhood-score-fact__market-walk">
          <Footprints :size="14" aria-hidden="true" />
          {{ t("nearbyStations.neighborhoodScore.venueAnalysis.measuredWalk", { minutes: marketTooltip.minutes }) }}
        </p>
        <div v-if="marketTooltip.schedule" class="nearby-neighborhood-score-fact__market-schedule">
          <strong class="nearby-neighborhood-score-fact__market-schedule-title">
            <CalendarDays :size="14" aria-hidden="true" />
            {{ t("nearbyStations.neighborhoodScore.venueAnalysis.hours") }}
          </strong>
          <ul v-if="marketTooltip.schedule.rows.length">
            <li v-for="row in marketTooltip.schedule.rows" :key="row.day" data-testid="food-market-schedule-day">
              <span>{{ row.label }}</span>
              <div class="nearby-neighborhood-score-fact__market-slots">
                <div v-for="slot in row.slots" :key="`${slot.period}:${slot.time}`">
                  <small v-if="slot.period">{{ slot.period }}</small>
                  <span>{{ slot.time }}</span>
                </div>
              </div>
            </li>
          </ul>
          <p v-for="(item, index) in marketTooltip.schedule.other" :key="index" class="nearby-neighborhood-score-fact__market-extra-hour">{{ item }}</p>
        </div>
        <dl class="nearby-neighborhood-score-fact__market-stats">
          <div>
            <dt>{{ t("nearbyStations.neighborhoodScore.venueAnalysis.area") }}</dt>
            <dd>{{ marketTooltip.area }}<small v-if="marketTooltip.areaFromFootprint">{{ t("nearbyStations.neighborhoodScore.venueAnalysis.marketFootprintNote") }}</small></dd>
          </div>
          <div v-if="fact.tooltipValues?.size !== 'unknown'"><dt>{{ t("nearbyStations.neighborhoodScore.venueAnalysis.size") }}</dt><dd>{{ marketTooltip.size }}</dd></div>
          <div v-if="marketTooltip.sessions !== '—'"><dt>{{ t("nearbyStations.neighborhoodScore.venueAnalysis.sessions") }}</dt><dd>{{ marketTooltip.sessions }}</dd></div>
          <div v-if="marketTooltip.traders !== '—'"><dt>{{ t("nearbyStations.neighborhoodScore.venueAnalysis.traders") }}</dt><dd>{{ marketTooltip.traders }}</dd></div>
        </dl>
      </div>
      <strong v-else>{{ factTooltip() }}</strong>
      <div v-if="cinemaSize" class="nearby-neighborhood-score-fact__cinema-size">
        <span class="nearby-neighborhood-score-fact__cinema-icon"><Clapperboard :size="19" aria-hidden="true" /></span>
        <div>
          <strong>{{ cinemaSize.label }}</strong>
          <small>{{ cinemaSize.surface }}</small>
        </div>
      </div>
      <section v-if="structuralGroups.length" class="nearby-neighborhood-score-fact__transport-lines" data-testid="structural-lines">
        <h4>{{ t("nearbyStations.neighborhoodScore.structuralBreakdown") }}</h4>
        <div v-for="group in structuralGroups" :key="group.mode" class="nearby-neighborhood-score-fact__transport-line-group" :data-structural-mode="group.mode">
          <h5>{{ t(group.labelKey) }}</h5>
          <ul class="nearby-neighborhood-score-fact__transport-line-list">
            <li v-for="line in group.lines" :key="line.id" class="nearby-neighborhood-score-fact__line-detail" data-testid="structural-line">
              <LineIconBadge :line="lineIcon(line)" compact eager />
              <span>{{ formatTransportLineName(line) }}<small v-if="line.future"> · {{ t("nearbyStations.neighborhoodScore.futureLine") }}</small></span>
            </li>
          </ul>
        </div>
      </section>
      <section v-if="fact.lastServices?.length" class="nearby-neighborhood-score-fact__transport-lines" data-testid="last-services">
        <ul class="nearby-neighborhood-score-fact__transport-line-list">
          <li v-for="item in fact.lastServices" :key="item.line.id" class="nearby-neighborhood-score-fact__line-detail" data-testid="last-service-line">
            <LineIconBadge :line="lineIcon(item.line)" compact eager />
            <span>{{ formatTransportLineName(item.line) }} · {{ item.seconds !== undefined ? lastServiceTime(item.seconds) : t("nearbyStations.neighborhoodScore.lastServiceUnavailable") }}
              <small>{{ item.stopName ?? t("nearbyStations.neighborhoodScore.lastServiceStationUnknown") }}</small>
            </span>
          </li>
        </ul>
      </section>
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
              </span>
              <span class="nearby-neighborhood-score-fact__transport-line-score">
                {{ formatReliabilityScore(line.reliabilityScore) }} %
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
      <section v-if="transportAccessChoices.length" class="nearby-neighborhood-score-fact__access-choices" :aria-label="t('nearbyStations.neighborhoodScore.transportAccessChoices')">
        <strong>{{ t("nearbyStations.neighborhoodScore.transportAccessChoices") }}</strong>
        <ul>
          <li v-for="route in transportAccessChoices" :key="route.line" data-testid="nearby-transport-access-option">
            {{ t("nearbyStations.neighborhoodScore.transportAccessChoice", { line: route.line, minutes: route.accessMinutes }) }}
            <small>{{ t(route.boardingMode === 'BUS' || route.boardingMode === 'NOCTILIEN'
              ? route.walkingEstimated ? "nearbyStations.neighborhoodScore.transportAccessWalkingEstimated" : "nearbyStations.neighborhoodScore.transportAccessWalking"
              : route.walkingEstimated ? "nearbyStations.neighborhoodScore.transportAccessWalkingTransitEstimated" : "nearbyStations.neighborhoodScore.transportAccessWalkingTransit",
              { walking: route.walkingMinutes, transit: route.transitMinutes }) }}<template v-if="route.boardingStop"> · {{ route.boardingStop }}</template></small>
            <small>{{ t("nearbyStations.neighborhoodScore.transportAccessElapsed", { elapsed: route.elapsedMinutes, wait: route.initialWaitMinutes }) }}</small>
          </li>
        </ul>
        <p class="nearby-neighborhood-score-fact__walking-estimate">{{ t("nearbyStations.neighborhoodScore.transportAccessRounding") }}</p>
      </section>
      <div v-if="fact.travel?.routes?.length && !transportAccessChoices.length" class="nearby-neighborhood-score-fact__travel-routes">
        <div
          v-for="route in fact.travel.routes"
          :key="route.line"
          class="nearby-neighborhood-score-fact__travel-route"
        >
          <MiniTravelDisplay
            :journey="route.journey"
            :hide-transit-duration="fact.kind === 'noctilienAtNight'"
          />
          <span v-if="route.direction" class="nearby-neighborhood-score-fact__travel-direction">
            {{ route.direction }}
          </span>
        </div>
      </div>
      <MiniTravelDisplay v-else-if="fact.travel" :journey="fact.travel.journey" />
      <p v-if="hasEstimatedWalking" class="nearby-neighborhood-score-fact__walking-estimate">{{ t(marketTooltip ? "nearbyStations.neighborhoodScore.venueAnalysis.marketEstimatedWalk" : "nearbyStations.neighborhoodScore.transportAccessEstimateWarning") }}</p>
      <div v-if="fact.travel?.directions?.length && !fact.travel.routes?.length" class="nearby-neighborhood-score-fact__directions">
        <strong>{{ t("nearbyStations.neighborhoodScore.miniTravel.directions") }}</strong>
        <ul>
          <li v-for="direction in fact.travel.directions" :key="direction.line">
            {{ direction.line }} · {{ direction.label }}
          </li>
        </ul>
      </div>
      <dl>
        <div>
          <dt>{{ t("nearbyStations.neighborhoodScore.evidence.sourceLabel") }}</dt>
          <dd>
            <template v-if="hasGtfsJourney">{{ t("nearbyStations.neighborhoodScore.sources.gtfsJourneys") }}</template>
            <a v-if="fact.evidence.sourceUrl && (marketTooltip || !hasGtfsJourney)" :href="fact.evidence.sourceUrl" target="_blank" rel="noopener noreferrer"><template v-if="hasGtfsJourney"> · </template>{{ fact.evidence.sourceName }}</a>
            <template v-else-if="!hasGtfsJourney">{{ fact.evidence.sourceName ?? (fact.evidence.sourceKey ? t(fact.evidence.sourceKey) : "—") }}</template>
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
.nearby-neighborhood-score-fact__nearer-stations { margin: 0 0 6px 45px; padding-inline-start: 1em; color: var(--muted); font-size: .75rem; line-height: 1.45; }
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
.nearby-neighborhood-score-fact__market { font-size: .74rem; }
.nearby-neighborhood-score-fact__cinema-size { display: flex; align-items: center; gap: 10px; margin: 8px 0; padding: 8px 10px; border-radius: 8px; background: var(--surface-soft); }
.nearby-neighborhood-score-fact__cinema-icon { display: grid; place-items: center; flex: 0 0 34px; height: 34px; border-radius: 8px; background: #ebe8fc; color: #5146b8; }
.nearby-neighborhood-score-fact__cinema-size small { display: block; color: var(--muted); font-size: .69rem; }
.nearby-neighborhood-score-fact__market-walk { align-items: center; display: flex; gap: 6px; margin: 0 0 8px; }
.nearby-neighborhood-score-fact__market-schedule { padding: 7px 10px; border-radius: 8px; background: var(--surface-soft); }
.nearby-neighborhood-score-fact__market-schedule .nearby-neighborhood-score-fact__market-schedule-title { align-items: center; display: flex; gap: 6px; margin-bottom: 3px; }
.nearby-neighborhood-score-fact__market-schedule ul { list-style: none; margin: 0; padding: 0; }
.nearby-neighborhood-score-fact__market-schedule li { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, auto); gap: 8px; padding: 4px 0; }
.nearby-neighborhood-score-fact__market-schedule li + li { border-top: 1px solid #e2e6ef; }
.nearby-neighborhood-score-fact__market-slots { display: grid; gap: 2px; text-align: right; }
.nearby-neighborhood-score-fact__market-slots > div { display: flex; flex-wrap: wrap; gap: 2px 6px; justify-content: flex-end; font-variant-numeric: tabular-nums; }
.nearby-neighborhood-score-fact__market-slots small, .nearby-neighborhood-score-fact__market-stats small { color: var(--muted); font-size: .65rem; }
.nearby-neighborhood-score-fact__market-extra-hour { margin: 3px 0 0; }
.nearby-neighborhood-score-fact__travel-routes { border-top: 1px solid #e8ebf2; display: grid; gap: 5px; margin-top: 8px; max-width: 355px; padding-top: 4px; }
.nearby-neighborhood-score-fact__travel-route { align-items: start; display: grid; gap: 4px; grid-template-columns: minmax(0, 1fr); min-width: 0; }
.nearby-neighborhood-score-fact__access-choices { border-top: 1px solid #e8ebf2; margin-top: 8px; padding-top: 4px; }
.nearby-neighborhood-score-fact__access-choices ul { display: grid; gap: 4px; list-style: none; margin: 5px 0 0; padding: 0; }
.nearby-neighborhood-score-fact__access-choices small { color: #667085; display: block; font-size: .68rem; line-height: 1.4; }
.nearby-neighborhood-score-fact__walking-estimate { color: #667085; font-size: .68rem; line-height: 1.4; margin: 8px 0 0; }
.nearby-neighborhood-score-fact__travel-route :deep(.mini-travel-display) { margin: 3px 0 0; max-width: 100%; }
.nearby-neighborhood-score-fact__travel-direction { color: #344054; font-size: .66rem; line-height: 1.3; min-width: 0; overflow-wrap: anywhere; }
.nearby-neighborhood-score-fact__directions { border-top: 1px solid #e8ebf2; margin-top: 8px; max-width: 355px; padding-top: 8px; }
.nearby-neighborhood-score-fact__directions > strong { color: #667085; font-size: .64rem; font-weight: 900; letter-spacing: .03em; text-transform: uppercase; }
.nearby-neighborhood-score-fact__directions ul { display: grid; gap: 3px; list-style: none; margin: 5px 0 0; padding: 0; }
.nearby-neighborhood-score-fact__directions li { color: #344054; font-size: .68rem; line-height: 1.35; }
.nearby-neighborhood-score-fact__transport-lines { border-top: 1px solid #e8ebf2; margin-top: 9px; max-width: 355px; padding-top: 8px; }
.nearby-neighborhood-score-fact__transport-lines h4 { color: #667085; font-size: .64rem; font-weight: 900; letter-spacing: .03em; margin: 0 0 6px; text-transform: uppercase; }
.nearby-neighborhood-score-fact__transport-line-group + .nearby-neighborhood-score-fact__transport-line-group { margin-top: 7px; }
.nearby-neighborhood-score-fact__transport-line-group h5 { color: var(--ink); font-size: .69rem; margin: 0 0 3px; }
.nearby-neighborhood-score-fact__transport-line-list { display: grid; gap: 3px; list-style: none; margin: 0; max-height: min(260px, 45vh); overflow: auto; padding: 0; }
.nearby-neighborhood-score-fact__transport-line { align-items: baseline; display: grid; gap: 2px 6px; grid-template-columns: minmax(0, 1fr) auto; padding: 2px 0; }
.nearby-neighborhood-score-fact__transport-line-name { color: #344054; font-size: .7rem; min-width: 0; overflow-wrap: anywhere; }
.nearby-neighborhood-score-fact__transport-line-score { color: #4034df; font-size: .7rem; font-variant-numeric: tabular-nums; font-weight: 900; white-space: nowrap; }
.nearby-neighborhood-score-fact__transport-line-label { color: #667085; font-size: .64rem; grid-column: 1 / -1; margin-top: -2px; }
.nearby-neighborhood-score-fact__line-detail { align-items: center; display: flex; gap: 8px; padding: 3px 0; font-size: .72rem; }
.nearby-neighborhood-score-fact__line-detail small { color: #667085; display: block; font-size: .66rem; }
.nearby-neighborhood-score-fact__places { display: grid; gap: 3px; list-style: none; margin: 8px 0 0; max-width: 355px; padding: 0; }
.nearby-neighborhood-score-fact__places li { color: #344054; font-size: .68rem; line-height: 1.35; padding-left: 10px; position: relative; }
.nearby-neighborhood-score-fact__places li::before { color: #8490a4; content: "·"; left: 0; position: absolute; }
.nearby-neighborhood-score-fact__tooltip dl { display: grid; gap: 5px; margin: 9px 0 0; }
.nearby-neighborhood-score-fact__tooltip dl > div { display: grid; gap: 2px; grid-template-columns: auto 1fr; }
.nearby-neighborhood-score-fact__tooltip dt { color: #8490a4; font-size: .64rem; font-weight: 850; }
.nearby-neighborhood-score-fact__tooltip dd { color: #344054; font-size: .68rem; margin: 0; }
.nearby-neighborhood-score-fact__tooltip .nearby-neighborhood-score-fact__market-stats { gap: 6px; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); }
.nearby-neighborhood-score-fact__tooltip .nearby-neighborhood-score-fact__market-stats > div { align-content: start; background: var(--surface-soft); border-radius: 8px; grid-template-columns: 1fr; padding: 6px 8px; }
.nearby-neighborhood-score-fact__market-stats dd { color: var(--ink); font-size: .75rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.nearby-neighborhood-score-fact__market-stats small { display: block; font-weight: 500; }
.nearby-neighborhood-score-fact__tooltip--market > dl { border-top: 1px solid #e2e6ef; padding-top: 8px; }
.nearby-neighborhood-score-fact__tooltip--market > dl > div { column-gap: 8px; }
.nearby-neighborhood-score-fact__action { background: #5146ff; border: 0; border-radius: 8px; color: #fff; cursor: pointer; font: inherit; font-size: .7rem; font-weight: 850; margin-top: 10px; padding: 7px 9px; }
.nearby-neighborhood-score-fact__action:hover, .nearby-neighborhood-score-fact__action:focus-visible { background: #4034df; outline: 2px solid rgba(81,70,255,.24); outline-offset: 2px; }
@media (max-width: 680px) {
  .nearby-neighborhood-score-fact__tooltip { left: 0; max-width: calc(100vw - 42px); position: absolute; top: calc(100% + 4px); transform: none; width: calc(100vw - 42px); }
  .nearby-neighborhood-score-fact:hover .nearby-neighborhood-score-fact__tooltip, .nearby-neighborhood-score-fact:focus-within .nearby-neighborhood-score-fact__tooltip { opacity: 0; pointer-events: none; visibility: hidden; }
  .nearby-neighborhood-score-fact.nearby-neighborhood-score-fact--open .nearby-neighborhood-score-fact__tooltip { opacity: 1; pointer-events: auto; position: relative; top: auto; visibility: visible; width: auto; }
}
</style>
