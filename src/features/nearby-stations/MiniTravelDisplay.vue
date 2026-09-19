<script setup lang="ts">
import { computed } from "vue";
import { Footprints } from "lucide-vue-next";
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
}>();

const { t } = useI18n();

const displaySections = computed(() => props.journey.sections.filter((section) =>
  isNearbyJourneyTransitSection(section) || isNearbyJourneyWalkingSection(section),
));

const journeyLabel = computed(() => displaySections.value.map((section) =>
  isNearbyJourneyWalkingSection(section)
    ? t("nearbyStations.neighborhoodScore.miniTravel.walking")
    : section.lineCode || section.lineAliases?.[0] || section.lineId || t("nearbyStations.neighborhoodScore.miniTravel.transport"),
).join(" → "));

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
        <LineIconBadge
          v-if="isNearbyJourneyTransitSection(section)"
          :line="sectionBadge(section)"
          compact
          eager
        />
        <Footprints v-else :size="14" aria-hidden="true" />
        <small>{{ formatDuration(section.durationSeconds) }}</small>
      </span>
    </template>
  </div>
</template>

<style scoped>
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
