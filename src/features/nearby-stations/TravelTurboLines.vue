<script setup lang="ts">
import { computed } from "vue";
import { Clock3, Footprints } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import LineIconBadge from "../../components/LineIconBadge.vue";
import { createLinePresentation } from "../../services/linePresentation";
import type { NearbyJourneySection } from "./nearbyHeavyTransports";
import { isNearbyJourneyTransitSection, isNearbyJourneyWaitingSection, isNearbyJourneyWalkingSection } from "./nearbyJourneyTiming";
import { turboDurationMinutes, turboTime } from "./travelTurbo";

const props = withDefaults(defineProps<{
  sections: readonly NearbyJourneySection[];
  showLineIcons?: boolean;
}>(), { showLineIcons: true });
const { t } = useI18n();

const transitLines = computed(() => {
  const transitIndexes = props.sections.flatMap((section, index) => isNearbyJourneyTransitSection(section) ? [index] : []);
  return transitIndexes.map((index, lineIndex) => {
    const nextIndex = transitIndexes[lineIndex + 1];
    const between = nextIndex === undefined ? [] : props.sections.slice(index + 1, nextIndex);
    return {
      section: props.sections[index]!,
      walkingSeconds: between
        .filter(isNearbyJourneyWalkingSection)
        .reduce((total, section) => total + sectionSeconds(section), 0),
      waitingSeconds: nextIndex === undefined
        ? 0
        : waitingSecondsBetween(props.sections[index]!, props.sections[nextIndex]!, between),
    };
  });
});
const walkingOnlySeconds = computed(() => {
  const walkingSeconds = props.sections
    .filter(isNearbyJourneyWalkingSection)
    .reduce((total, section) => total + sectionSeconds(section), 0);
  return walkingSeconds > 0
    ? walkingSeconds
    : props.sections.reduce((total, section) => total + sectionSeconds(section), 0);
});

function sectionSeconds(section: NearbyJourneySection): number {
  return Number.isFinite(section.durationSeconds) ? Math.max(0, section.durationSeconds) : 0;
}

function waitingSecondsBetween(
  previous: NearbyJourneySection,
  next: NearbyJourneySection,
  between: readonly NearbyJourneySection[],
): number {
  const explicitWaiting = between
    .filter(isNearbyJourneyWaitingSection)
    .reduce((total, section) => total + sectionSeconds(section), 0);
  const previousArrival = turboTime(previous.arrivalDateTime);
  const nextDeparture = turboTime(next.departureDateTime);
  const movementSeconds = between
    .filter((section) => !isNearbyJourneyWaitingSection(section))
    .reduce((total, section) => total + sectionSeconds(section), 0);
  const timestampWaiting = previousArrival === undefined || nextDeparture === undefined
    ? 0
    : Math.max(0, (nextDeparture - previousArrival) / 1000 - movementSeconds);
  return Math.max(explicitWaiting, timestampWaiting);
}

function formatDuration(seconds: number): string {
  const minutes = turboDurationMinutes(seconds);
  if (minutes < 60) return t("nearbyStations.travel.minutes", { minutes });

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0
    ? t("travelTurbo.durationHours", { hours })
    : t("travelTurbo.durationHoursMinutes", { hours, minutes: String(remainder).padStart(2, "0") });
}
</script>

<template>
  <span class="travel-turbo__lines">
    <template v-if="transitLines.length">
      <template v-for="(line, index) in transitLines" :key="`${line.section.lineId ?? line.section.lineCode ?? 'line'}:${index}`">
        <span v-if="index" aria-hidden="true">→</span>
        <LineIconBadge
          v-if="props.showLineIcons"
          :line="{ shortName: line.section.lineCode, ...createLinePresentation({ id: line.section.lineId, code: line.section.lineCode, mode: line.section.lineMode, color: line.section.lineColor }) }"
          compact
          eager
        />
        <span v-else>{{ line.section.lineCode }}</span>
        <span v-if="line.walkingSeconds > 0" class="travel-turbo__detail travel-turbo__walking" :aria-label="t('nearbyStations.travel.walking')">
          <Footprints :size="12" aria-hidden="true" />
          <small>{{ formatDuration(line.walkingSeconds) }}</small>
        </span>
        <span v-if="line.waitingSeconds > 0" class="travel-turbo__detail travel-turbo__waiting" :aria-label="t('travelTurbo.waiting', { duration: formatDuration(line.waitingSeconds) })">
          <Clock3 :size="12" aria-hidden="true" />
          <small>{{ formatDuration(line.waitingSeconds) }}</small>
        </span>
      </template>
    </template>
    <template v-else>
      <span class="travel-turbo__walking-only">
        <Footprints :size="14" aria-hidden="true" />
        <span>{{ t("nearbyStations.travel.walking") }}</span>
        <small v-if="walkingOnlySeconds > 0">{{ formatDuration(walkingOnlySeconds) }}</small>
      </span>
    </template>
  </span>
</template>

<style scoped>
.travel-turbo__lines { align-items: center; display: flex; gap: 5px; max-width: 100%; min-width: 0; overflow-x: auto; scrollbar-width: thin; }
.travel-turbo__lines :deep(.line-icon-badge) { height: 23px; min-width: 26px; }
.travel-turbo__detail, .travel-turbo__walking-only { align-items: center; display: inline-flex; flex: 0 0 auto; gap: 3px; white-space: nowrap; }
.travel-turbo__detail { color: #64708d; font-size: .66rem; }
.travel-turbo__detail svg, .travel-turbo__walking-only svg { flex: 0 0 auto; }
.travel-turbo__waiting { color: #7c5c00; }
.travel-turbo__walking-only { color: #5146ff; }
.travel-turbo__walking-only small { color: #64708d; font-size: .66rem; font-variant-numeric: tabular-nums; }
</style>
