<script setup lang="ts">
import { Clock3, Footprints, House, MapPin } from "lucide-vue-next";
import LineIconBadge from "../../components/LineIconBadge.vue";
import { useI18n } from "../../i18n";
import { itineraryStepAttributes, type GlobalTransportItineraryStep } from "../line-map/globalTransportPlanItinerary";
import type { NearbyJourneySection } from "../nearby-stations/nearbyHeavyTransports";
import type { StationAccessJourney } from "./stationAccessJourneys";
import OptimizerAnimatedValue from "./OptimizerAnimatedValue.vue";

defineProps<{ journey: StationAccessJourney }>();
const { t, d, n } = useI18n();
const clock = (epoch: number) => d(new Date(epoch), { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const minutes = (seconds: number) => t("lineOptimizer.minutes", { value: n(seconds / 60, { maximumFractionDigits: 1 }) });

function stepLabel({ kind, section, courseIndex, durationSeconds }: GlobalTransportItineraryStep): string {
  if (kind === "preparation") return t("lineOptimizer.preparation", { duration: minutes(durationSeconds) });
  if (kind === "walk") return section.toName
    ? t("lineOptimizer.walkTo", { station: section.toName }) : t("stationAccess.walk");
  if (kind === "wait") return t(courseIndex === 0 ? "stationAccess.firstWait" : "stationAccess.wait");
  return t("lineOptimizer.boardTram", {
    line: section.lineCode ?? "",
    direction: section.direction ?? section.toName ?? "",
  });
}

function legTiming(section: NearbyJourneySection) {
  if (!section.timingSource) return "";
  return t(`lineOptimizer.${section.timingSource}`);
}
</script>

<template>
  <ol class="station-access-timeline">
    <li v-for="step in journey.itinerary.steps" :key="step.id" v-bind="itineraryStepAttributes(step)">
      <LineIconBadge v-if="step.kind === 'transit'" :line="{
        id: step.section.lineId, label: step.section.lineCode, mode: step.section.lineMode,
        color: step.section.lineColor, textColor: step.section.lineTextColor,
      }" compact />
      <component v-else :is="step.kind === 'wait' ? Clock3 : step.kind === 'walk' ? Footprints : House" :size="19" aria-hidden="true" />
      <div>
        <OptimizerAnimatedValue :value="clock(step.startAt)" :itinerary="journey.itinerary.route.id" />
        {{ stepLabel(step) }}
        <small v-if="step.kind === 'transit'">
          {{ t("lineOptimizer.arriveTransfer", { time: clock(step.endAt), station: step.section.toName ?? "" }) }} · {{ legTiming(step.section) }}
        </small>
        <small v-else-if="step.kind !== 'preparation'">{{ minutes(step.durationSeconds) }}</small>
      </div>
    </li>
    <li>
      <MapPin :size="19" aria-hidden="true" />
      <div>
        <strong>{{ clock(journey.arrival) }}</strong>
        {{ t("lineOptimizer.arrival", { destination: journey.itinerary.destination.label ?? "" }) }}
      </div>
    </li>
  </ol>
</template>

<style scoped>
.station-access-timeline { margin: var(--space-3) 0 0; padding: 0; list-style: none; }
.station-access-timeline li { display: grid; grid-template-columns: 3.25rem minmax(0, 1fr); gap: var(--space-2); align-items: start; padding: var(--space-2) 0; font-size: .875rem; }
.station-access-timeline li + li { border-top: 1px solid var(--border); }
.station-access-timeline li > svg { margin-left: .6rem; color: var(--muted); }
.station-access-timeline small { display: block; margin-top: 2px; color: var(--muted); }
</style>
