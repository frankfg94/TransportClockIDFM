<script setup lang="ts">
import { computed } from "vue";
import { ArrowLeftRight, Footprints } from "lucide-vue-next";
import LineIconBadge from "../../components/LineIconBadge.vue";
import { useI18n } from "../../i18n";
import { createLinePresentation, transitFamilyToMode } from "../../services/linePresentation";
import type { TransitFamily } from "../../types/transit";
import type { NearbyJourney, NearbyJourneySection } from "./nearbyHeavyTransports";
import {
  isNearbyJourneyTransitSection,
  isNearbyJourneyWalkingSection,
} from "./nearbyJourneyTiming";

const props = defineProps<{
  journey: NearbyJourney;
  hideTransitDuration?: boolean;
}>();

const { t } = useI18n();

const displaySections = computed(() => props.journey.sections.filter((section) =>
  isNearbyJourneyTransitSection(section) || isNearbyJourneyWalkingSection(section) || section.transferDurationSource === "gtfs-minimum",
));

const journeyLabel = computed(() => displaySections.value.map((section) =>
  section.transferDurationSource === "gtfs-minimum" ? t("nearbyStations.neighborhoodScore.gtfsTransferLabel") : isNearbyJourneyWalkingSection(section)
    ? t("nearbyStations.neighborhoodScore.miniTravel.walking")
    : section.lineCode || section.lineAliases?.[0] || section.lineId || t("nearbyStations.neighborhoodScore.miniTravel.transport"),
).join(" → "));
const summary = computed(() => ({
  total: Math.ceil((props.journey.durationSeconds ?? props.journey.sections.reduce((sum, section) => sum + section.durationSeconds, 0)) / 60),
  walking: Math.ceil(props.journey.sections.filter(isNearbyJourneyWalkingSection).reduce((sum, section) => sum + section.durationSeconds, 0) / 60),
  waiting: Math.ceil(props.journey.sections.filter(section => section.type === "waiting").reduce((sum, section) => sum + section.durationSeconds, 0) / 60),
  transfers: props.journey.transferCount ?? Math.max(0, props.journey.sections.filter(isNearbyJourneyTransitSection).length - 1),
}));
const referenceDate = computed(() => props.journey.departureDateTime?.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2}).*$/u, "$3/$2/$1 $4:$5") ?? "—");
const minimumTransferSeconds = computed(() => props.journey.sections.filter(section => section.transferDurationSource === "gtfs-minimum").reduce((sum, section) => sum + section.durationSeconds, 0));
const sameLineChanges = computed(() => {
  const changes: Array<{ section: NearbyJourneySection; line: string; station: string; from?: string; to?: string; waitingSeconds: number }> = [];
  let preceding: NearbyJourneySection | undefined, waitingSeconds = 0;
  for (const section of props.journey.sections) {
    if (section.type === "waiting") waitingSeconds += section.durationSeconds;
    if (!isNearbyJourneyTransitSection(section)) continue;
    const sameLine = preceding?.lineId && section.lineId
      ? preceding.lineId === section.lineId
      : Boolean(preceding?.lineCode && preceding.lineCode === section.lineCode && preceding.lineMode === section.lineMode);
    const sameStation = Boolean(preceding?.toStopAreaId && preceding.toStopAreaId === section.fromStopAreaId)
      || Boolean(preceding?.toStopPointId && preceding.toStopPointId === section.fromStopPointId);
    const station = section.fromName ?? preceding?.toName;
    if (sameLine && sameStation && station && preceding?.vehicleJourneyId && section.vehicleJourneyId
      && preceding.vehicleJourneyId !== section.vehicleJourneyId) {
      changes.push({ section, station, line: section.lineCode ?? section.lineId!,
        from: preceding.mission ?? preceding.direction, to: section.mission ?? section.direction, waitingSeconds });
    }
    preceding = section; waitingSeconds = 0;
  }
  return changes;
});
function formatTransferDuration(seconds: number): string {
  return t("nearbyStations.neighborhoodScore.gtfsTransferDuration", { minutes: Math.floor(seconds / 60), seconds: Math.round(seconds % 60).toString().padStart(2, "0") });
}

function sectionFamily(section: NearbyJourneySection): TransitFamily {
  if (section.lineMode === "METRO") return "METRO";
  if (section.lineMode === "RER") return "RER";
  if (section.lineMode === "TRAM") return "TRAM";
  if (section.lineMode === "CABLE") return "CABLE";
  if (section.lineMode === "TRAIN" || section.lineMode === "TRANSILIEN") return "TRANSILIEN";
  if (section.lineMode === "NOCTILIEN") return "NOCTILIEN";
  return "BUS";
}

function sectionBadge(section: NearbyJourneySection) {
  const family = sectionFamily(section);
  const identity = section.lineId ?? section.lineCode ?? section.lineAliases?.[0];
  const presentation = createLinePresentation({
    id: identity,
    code: section.lineCode,
    family,
    mode: transitFamilyToMode(family),
    ref: identity,
    shortName: section.lineCode,
    color: section.lineColor,
    textColor: section.lineTextColor,
  });
  return {
    id: identity,
    ref: identity,
    label: section.lineCode || section.lineAliases?.[0] || "?",
    family,
    mode: transitFamilyToMode(family),
    ...presentation,
  };
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60
    ? t("nearbyStations.travel.hoursMinutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
    : t("nearbyStations.travel.minutes", { minutes });
}
</script>

<template>
  <div
    v-if="displaySections.length"
    class="mini-travel-display"
    role="list"
    :aria-label="t('nearbyStations.neighborhoodScore.miniTravel.aria', { lines: journeyLabel })"
  >
    <template v-for="(section, index) in displaySections" :key="`${index}:${section.lineId ?? section.lineCode ?? section.type ?? 'walk'}`">
      <span v-if="index" class="mini-travel-display__separator" aria-hidden="true" />
      <span class="mini-travel-display__leg" role="listitem">
        <ArrowLeftRight
          v-if="journey.source === 'gtfs' && sameLineChanges.some(change => change.section === section)"
          :size="14"
          :aria-label="t('nearbyStations.neighborhoodScore.gtfsTrainChange')"
        />
        <LineIconBadge
          v-if="isNearbyJourneyTransitSection(section)"
          :line="sectionBadge(section)"
          compact
          eager
        />
        <ArrowLeftRight v-else-if="section.transferDurationSource === 'gtfs-minimum'" :size="14" :aria-label="t('nearbyStations.neighborhoodScore.gtfsTransferLabel')" />
        <Footprints v-else :size="14" aria-hidden="true" />
        <small v-if="!props.hideTransitDuration || !isNearbyJourneyTransitSection(section)">
          {{ section.transferDurationSource === "gtfs-minimum" ? formatTransferDuration(section.durationSeconds) : formatDuration(section.durationSeconds) }}
        </small>
      </span>
    </template>
  </div>
  <p v-if="journey.source === 'gtfs'" class="mini-travel-display__summary">
    {{ t("nearbyStations.neighborhoodScore.gtfsJourneyDate", { date: referenceDate, version: journey.datasetVersion ?? "—" }) }}<br>
    {{ t("nearbyStations.neighborhoodScore.gtfsJourneySummary", summary) }}
    <span v-if="journey.status === 'partial'"> · {{ t("nearbyStations.neighborhoodScore.gtfsJourneyPartial") }}</span>
    <template v-if="minimumTransferSeconds"><br>{{ t("nearbyStations.neighborhoodScore.gtfsTransferMinimum", { duration: formatTransferDuration(minimumTransferSeconds) }) }}</template>
    <template v-for="(change, index) in sameLineChanges" :key="index">
      <br>{{ t("nearbyStations.neighborhoodScore.gtfsSameLineChange", { line: change.line, station: change.station, duration: formatTransferDuration(change.waitingSeconds) }) }}
      <template v-if="change.from && change.to && change.from !== change.to"> {{ t("nearbyStations.neighborhoodScore.gtfsMissionChange", { from: change.from, to: change.to }) }}</template>
    </template>
  </p>
</template>

<style scoped>
.mini-travel-display__summary { font-size: .75rem; margin: .5rem 0; }
.mini-travel-display { align-items: center; display: flex; gap: 6px; max-width: 100%; margin: 9px 0 2px; overflow-x: auto; padding: 2px 0 3px; scrollbar-width: thin; }
.mini-travel-display__leg { align-items: center; color: #475569; display: inline-flex; flex: 0 0 auto; gap: 3px; min-width: max-content; }
.mini-travel-display__leg small { font-size: .63rem; font-variant-numeric: tabular-nums; font-weight: 850; white-space: nowrap; }
.mini-travel-display__separator { background: rgba(100,116,139,.42); display: inline-block; flex: 0 0 12px; height: 1px; min-width: 12px; }
.mini-travel-display :deep(.line-icon-badge) { height: 24px; min-width: 27px; }
.mini-travel-display :deep(.line-icon-badge--compact) { height: 24px; }
.mini-travel-display :deep(.line-icon-badge--compact img) { max-height: 24px; max-width: 42px; }
.mini-travel-display :deep(.line-icon-badge__fallback) { min-height: 20px; min-width: 24px; padding: 2px 4px; }
.mini-travel-display :deep(.line-icon-badge__label) { font-size: .6rem; }
</style>
