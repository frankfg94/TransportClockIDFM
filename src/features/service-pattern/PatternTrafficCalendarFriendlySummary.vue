<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "../../i18n";
import PatternTrafficIncidentSummaryItem from "./PatternTrafficIncidentSummaryItem.vue";
import type { PatternTrafficCalendarDay } from "./trafficCalendar";
import {
  createPatternTrafficSummaryEntries,
  type PatternTrafficSummaryEntry,
  type PatternTrafficSummaryTimeWindow,
} from "./trafficCalendarSummary";

const props = defineProps<{
  day: PatternTrafficCalendarDay;
  focusable?: boolean;
}>();

const emit = defineEmits<{
  focus: [entry: PatternTrafficSummaryEntry];
}>();

const { d, n, t } = useI18n();
const entries = computed(() => createPatternTrafficSummaryEntries(props.day));
const impactCount = computed(() =>
  Math.max(props.day.impactCount, entries.value.length),
);
const dateLabel = computed(() =>
  d(props.day.date, { day: "numeric", month: "long" }),
);
const fullDateLabel = computed(() => d(props.day.date, { dateStyle: "full" }));
const impactCountLabel = computed(() =>
  impactCount.value === 1
    ? t("pattern.trafficCalendarFriendlyImpactOne")
    : t("pattern.trafficCalendarFriendlyImpactMany", {
        count: n(impactCount.value),
      }),
);

function getEntryTitle(entry: PatternTrafficSummaryEntry): string {
  if (entry.title) return entry.title;

  const type = t(
    `pattern.trafficCalendarFriendlyTypes.${entry.incidentType}`,
  );
  if (entry.impactedStopNames.length === 1) {
    return t("pattern.trafficCalendarFriendlyAt", {
      type,
      station: entry.impactedStopNames[0],
    });
  }
  if (entry.impactedStopNames.length === 2) {
    return t("pattern.trafficCalendarFriendlyBetween", {
      type,
      from: entry.impactedStopNames[0],
      to: entry.impactedStopNames[1],
    });
  }
  if (entry.impactedStopNames.length > 2) {
    return t("pattern.trafficCalendarFriendlyOnStops", {
      type,
      count: n(entry.impactedStopNames.length),
    });
  }
  return type;
}


function getTimeWindowLabel(window: PatternTrafficSummaryTimeWindow): string {
  switch (window.kind) {
    case "all-day":
      return t("pattern.trafficCalendarFriendlyTimeAllDay");
    case "range":
      return t("pattern.trafficCalendarFriendlyTimeRange", {
        start: window.start,
        end: window.end,
      });
    case "from":
      return t("pattern.trafficCalendarFriendlyTimeFrom", {
        start: window.start,
      });
    case "until":
      return t("pattern.trafficCalendarFriendlyTimeUntil", {
        end: window.end,
      });
    default:
      return t("pattern.trafficCalendarFriendlyTimeUnknown");
  }
}

function getEntryDetails(entry: PatternTrafficSummaryEntry): string[] {
  const details = entry.timeWindows.map(getTimeWindowLabel);
  if (entry.remainingDayCount <= 0) return details;

  const remainingDaysLabel = t(
    entry.remainingDayCount === 1
      ? "pattern.trafficCalendarFriendlyRemainingDayOne"
      : "pattern.trafficCalendarFriendlyRemainingDayMany",
    { count: n(entry.remainingDayCount) },
  );
  const parenthetical = `(${remainingDaysLabel})`;

  if (details.length === 0) return [parenthetical];
  details[details.length - 1] = `${details[details.length - 1]} ${parenthetical}`;
  return details;
}

</script>

<template>
  <div class="pattern-traffic-friendly-summary">
    <header class="pattern-traffic-friendly-summary__header">
      <h3 :aria-label="fullDateLabel">
        <time :datetime="day.dateKey">{{ dateLabel }}</time>
        <span aria-hidden="true">—</span>
        <em v-if="entries.length > 0">{{ impactCountLabel }}</em>
        <em v-else>{{ t("pattern.trafficCalendarNoImpact") }}</em>
      </h3>
      <span class="pattern-traffic-friendly-summary__selected">
        {{ t("pattern.trafficCalendarFriendlySelected") }}
      </span>
    </header>

    <ul v-if="entries.length > 0" class="pattern-traffic-friendly-summary__list">
      <PatternTrafficIncidentSummaryItem
        v-for="entry in entries"
        small-title
        :key="entry.id"
        :critical="entry.critical"
        :details="getEntryDetails(entry)"
        :incident-type="entry.incidentType"
        :interactive="focusable"
        :action-label="
          focusable
            ? t('pattern.trafficCalendarFocusDisruptionAria', {
                title: getEntryTitle(entry),
              })
            : undefined
        "
        :subtitle="entry.description"
        :title="getEntryTitle(entry)"
        data-testid="pattern-traffic-calendar-friendly-incident"
        @activate="emit('focus', entry)"
      />
    </ul>

    <p v-else class="pattern-traffic-friendly-summary__empty">
      {{ t("pattern.trafficCalendarSelectedNormalDay") }}
    </p>
  </div>
</template>

<style scoped>
.pattern-traffic-friendly-summary {
  display: grid;
  gap: 18px;
  max-height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.pattern-traffic-friendly-summary__header {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
}

.pattern-traffic-friendly-summary__header h3 {
  align-items: baseline;
  display: flex;
  flex-wrap: wrap;
  font-size: 0.98rem;
  gap: 6px;
  margin: 0;
}

.pattern-traffic-friendly-summary__header time {
  color: #24213b;
  font-weight: 900;
  text-transform: lowercase;
}

.pattern-traffic-friendly-summary__header em {
  color: #7c3aed;
  font-style: normal;
  font-weight: 900;
}

.pattern-traffic-friendly-summary__selected {
  background: #f1e7ff;
  border-radius: 999px;
  color: #7c3aed;
  flex: 0 0 auto;
  font-size: 0.72rem;
  font-weight: 900;
  padding: 6px 11px;
}

.pattern-traffic-friendly-summary__list {
  display: grid;
  gap: 17px;
  list-style: none;
  margin: 0;
  max-height: min(280px, calc(100dvh - 170px));
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0 12px 0 1px;
  scrollbar-gutter: stable;
}

.pattern-traffic-friendly-summary__empty {
  color: #6b6885;
  font-size: 0.8rem;
  margin: 0;
}

@media (max-width: 520px) {
  .pattern-traffic-friendly-summary__header {
    align-items: flex-start;
  }

  .pattern-traffic-friendly-summary__list {
    gap: 15px;
  }
}
</style>
