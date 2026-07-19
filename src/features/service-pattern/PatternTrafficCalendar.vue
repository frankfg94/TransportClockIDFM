<script setup lang="ts">
import { computed } from "vue";
import {
  CalendarDays,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Maximize2 as ExpandIcon,
} from "lucide-vue-next";
import { useI18n } from "../../i18n";
import TrafficDisruptionCard from "../traffic/TrafficDisruptionCard.vue";
import type { TrafficDisruption } from "../traffic/types";
import PatternTrafficCalendarFriendlySummary from "./PatternTrafficCalendarFriendlySummary.vue";
import type { PatternTrafficSummaryEntry } from "./trafficCalendarSummary";
import PatternTrafficCalendarTooltip from "./PatternTrafficCalendarTooltip.vue";
import type {
  PatternTrafficCalendarDay,
  PatternTrafficCalendarMonth,
} from "./trafficCalendar";

const props = withDefaults(
  defineProps<{
    calendar: PatternTrafficCalendarMonth;
    selectedDateKey: string;
    selectedDay?: PatternTrafficCalendarDay;
    idPrefix?: string;
    hasPrevious?: boolean;
    hasNext?: boolean;
    expanded?: boolean;
    mode?: "panel" | "modal";
    showIdentity?: boolean;
    userFriendlySummary?: boolean;
    selectedDisruptions?: TrafficDisruption[];
    focusableSummaries?: boolean;
  }>(),
  {
    selectedDay: undefined,
    idPrefix: "traffic-calendar",
    hasPrevious: false,
    hasNext: false,
    expanded: false,
    mode: "panel",
    showIdentity: true,
    userFriendlySummary: false,
    selectedDisruptions: () => [],
    focusableSummaries: false,
  },
);

const emit = defineEmits<{
  previous: [];
  next: [];
  resetToday: [];
  select: [day: PatternTrafficCalendarDay];
  expand: [];
  focusDisruption: [entry: PatternTrafficSummaryEntry];
}>();

const { d, n, t } = useI18n();
const weekdays = computed(() => [
  t("pattern.trafficCalendarWeekdays.monday"),
  t("pattern.trafficCalendarWeekdays.tuesday"),
  t("pattern.trafficCalendarWeekdays.wednesday"),
  t("pattern.trafficCalendarWeekdays.thursday"),
  t("pattern.trafficCalendarWeekdays.friday"),
  t("pattern.trafficCalendarWeekdays.saturday"),
  t("pattern.trafficCalendarWeekdays.sunday"),
]);
const monthLabel = computed(() =>
  d(props.calendar.monthStart, {
    month: "long",
    year: "numeric",
  }),
);
const selectedDay = computed(
  () =>
    props.selectedDay ??
    props.calendar.days.find(
      (day) => day.dateKey === props.selectedDateKey,
    ),
);
const todayActive = computed(() => selectedDay.value?.isToday ?? false);
const isModal = computed(() => props.expanded || props.mode === "modal");
const visibleDays = computed(() =>
  props.calendar.days.filter((day) => day.inCurrentMonth),
);

function getDayGridColumnStart(day: PatternTrafficCalendarDay): number | undefined {
  if (day.date.getDate() !== 1) return undefined;
  return day.date.getDay() || 7;
}

function getDayStatus(day: PatternTrafficCalendarDay): string {
  if (day.timeWindow) return day.timeWindow;
  if (day.impactCount > 1) {
    return t("pattern.trafficCalendarImpactCount", {
      count: n(day.impactCount),
    });
  }
  if (day.severity) {
    return t(`pattern.trafficCalendarSeverity.${day.severity.level}`);
  }
  return "";
}

function getDayAriaLabel(day: PatternTrafficCalendarDay): string {
  const dateLabel = d(day.date, { dateStyle: "full" });
  if (!day.severity) {
    return t("pattern.trafficCalendarDayNoImpactAria", { date: dateLabel });
  }

  return t("pattern.trafficCalendarDayImpactAria", {
    date: dateLabel,
    level: t(`pattern.trafficCalendarSeverity.${day.severity.level}`),
    score: n(day.severity.score),
  });
}

function getDurationLabel(minutes?: number): string {
  if (minutes === undefined) {
    return t("pattern.trafficCalendarDurationUnknown");
  }
  if (minutes < 60) {
    return t("pattern.trafficCalendarDurationMinutes", {
      count: n(minutes),
    });
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes
    ? t("pattern.trafficCalendarDurationHoursMinutes", {
        hours: n(hours),
        minutes: n(remainingMinutes),
      })
    : t("pattern.trafficCalendarDurationHours", { count: n(hours) });
}
</script>

<template>
  <section
    class="pattern-traffic-calendar"
    :class="[
      `pattern-traffic-calendar--${isModal ? 'modal' : 'panel'}`,
      { 'pattern-traffic-calendar--expanded': isModal },
    ]"
    data-testid="pattern-traffic-calendar"
  >
    <header class="pattern-traffic-calendar__header">
      <div v-if="showIdentity" class="pattern-traffic-calendar__identity">
        <span class="pattern-traffic-calendar__icon" aria-hidden="true">
          <CalendarDays />
        </span>
        <div>
          <strong>{{ t("pattern.trafficCalendarTitle") }}</strong>
          <span>{{ monthLabel }}</span>
        </div>
      </div>

      <nav
        class="pattern-traffic-calendar__navigation"
        :aria-label="t('pattern.trafficCalendarMonthNavigation')"
      >
        <button
          type="button"
          :disabled="!hasPrevious"
          :aria-label="t('pattern.trafficCalendarPreviousMonth')"
          data-testid="pattern-traffic-calendar-previous"
          @click="emit('previous')"
        >
          <ChevronLeftIcon
            class="pattern-traffic-calendar__button-icon"
            :size="20"
            :stroke-width="2.5"
            aria-hidden="true"
          />
        </button>
        <strong aria-live="polite">{{ monthLabel }}</strong>
        <button
          type="button"
          :disabled="!hasNext"
          :aria-label="t('pattern.trafficCalendarNextMonth')"
          data-testid="pattern-traffic-calendar-next"
          @click="emit('next')"
        >
          <ChevronRightIcon
            class="pattern-traffic-calendar__button-icon"
            :size="20"
            :stroke-width="2.5"
            aria-hidden="true"
          />
        </button>
      </nav>

      <div class="pattern-traffic-calendar__actions">
        <button
          class="pattern-traffic-calendar__today"
          :class="{ 'pattern-traffic-calendar__today--active': todayActive }"
          type="button"
          @click="emit('resetToday')"
        >
          {{ t("pattern.trafficCalendarToday") }}
        </button>
        <button
          v-if="!isModal"
          class="pattern-traffic-calendar__expand"
          type="button"
          :aria-label="t('pattern.trafficCalendarExpand')"
          data-testid="pattern-traffic-calendar-expand"
          @click="emit('expand')"
        >
          <ExpandIcon
            class="pattern-traffic-calendar__button-icon"
            :size="20"
            :stroke-width="2.25"
            aria-hidden="true"
          />
        </button>
      </div>
    </header>

    <div
      class="pattern-traffic-calendar__weekdays"
      role="row"
      :aria-label="t('pattern.trafficCalendarWeekdaysLabel')"
    >
      <span v-for="weekday in weekdays" :key="weekday" role="columnheader">
        {{ weekday }}
      </span>
    </div>

    <div
      class="pattern-traffic-calendar__grid"
      role="grid"
      :aria-label="monthLabel"
    >
      <PatternTrafficCalendarTooltip
        v-for="day in visibleDays"
        :key="day.dateKey"
        :day="day"
        :tooltip-id="`${idPrefix}-tooltip-${day.dateKey}`"
        :grid-column-start="getDayGridColumnStart(day)"
      >
        <button
          class="pattern-traffic-calendar__day"
          :class="[
            day.severity
              ? `pattern-traffic-calendar__day--${day.severity.level}`
              : 'pattern-traffic-calendar__day--normal',
            {
              'pattern-traffic-calendar__day--today': day.isToday,
              'pattern-traffic-calendar__day--selected':
                day.dateKey === selectedDateKey,
            },
          ]"
          type="button"
          role="gridcell"
          :aria-label="getDayAriaLabel(day)"
          :aria-selected="day.dateKey === selectedDateKey"
          :aria-describedby="
            day.events.length > 0
              ? `${idPrefix}-tooltip-${day.dateKey}`
              : undefined
          "
          :disabled="day.isPast"
          :data-date="day.dateKey"
          @click="emit('select', day)"
        >
          <span class="pattern-traffic-calendar__day-number">
            {{ day.date.getDate() }}
          </span>
          <span class="pattern-traffic-calendar__day-status">
            {{ getDayStatus(day) }}
          </span>
        </button>
      </PatternTrafficCalendarTooltip>
    </div>

    <div
      class="pattern-traffic-calendar__legend"
      :aria-label="t('pattern.trafficCalendarLegend')"
    >
      <span>
        <i class="pattern-traffic-calendar__swatch pattern-traffic-calendar__swatch--low"></i>
        {{ t("pattern.trafficCalendarSeverity.low") }}
      </span>
      <span>
        <i class="pattern-traffic-calendar__swatch pattern-traffic-calendar__swatch--medium"></i>
        {{ t("pattern.trafficCalendarSeverity.medium") }}
      </span>
      <span>
        <i class="pattern-traffic-calendar__swatch pattern-traffic-calendar__swatch--high"></i>
        {{ t("pattern.trafficCalendarSeverity.high") }}
      </span>
      <span>
        <i class="pattern-traffic-calendar__swatch pattern-traffic-calendar__swatch--normal"></i>
        {{ t("pattern.trafficCalendarNoImpact") }}
      </span>
      <small>{{ t("pattern.trafficCalendarLegendEquation") }}</small>
    </div>

    <section
      v-if="selectedDay"
      class="pattern-traffic-calendar__selected-summary"
      :class="{
        'pattern-traffic-calendar__selected-summary--friendly':
          userFriendlySummary,
      }"
      data-testid="pattern-traffic-calendar-selected-summary"
    >
      <PatternTrafficCalendarFriendlySummary
        v-if="userFriendlySummary"
        :day="selectedDay"
        :focusable="focusableSummaries"
        @focus="emit('focusDisruption', $event)"
      />
      <template v-else>
        <header>
          <div>
            <span>{{ d(selectedDay.date, { dateStyle: "full" }) }}</span>
            <strong v-if="selectedDay.severity">
              {{
                t("pattern.trafficCalendarSelectedImpact", {
                  level: t(
                    `pattern.trafficCalendarSeverity.${selectedDay.severity.level}`,
                  ),
                  score: n(selectedDay.severity.score),
                })
              }}
            </strong>
            <strong v-else>{{ t("pattern.trafficCalendarNoImpact") }}</strong>
          </div>
          <span>
            {{ t("pattern.trafficCalendarTotalDuration") }}:
            {{ getDurationLabel(selectedDay.durationMinutes) }}
          </span>
        </header>

        <div
          v-if="selectedDisruptions.length > 0"
          class="pattern-traffic-calendar__details"
        >
          <TrafficDisruptionCard
            v-for="disruption in selectedDisruptions"
            :key="disruption.id"
            :disruption="disruption"
            compact
            :impacted-stop-limit="8"
          />
        </div>
        <p v-else>{{ t("pattern.trafficCalendarSelectedNormalDay") }}</p>
      </template>
    </section>
  </section>
</template>

<style scoped>
.pattern-traffic-calendar {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(249, 250, 255, 0.99)),
    #ffffff;
  color: #17142f;
  display: grid;
  gap: 9px;
  padding: 16px;
  width: 100%;
}

.pattern-traffic-calendar--modal {
  padding: 0;
}

.pattern-traffic-calendar__header {
  align-items: center;
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(180px, 1fr) auto minmax(180px, 1fr);
}

.pattern-traffic-calendar__identity,
.pattern-traffic-calendar__identity > div,
.pattern-traffic-calendar__actions,
.pattern-traffic-calendar__navigation {
  align-items: center;
  display: flex;
}

.pattern-traffic-calendar__identity {
  gap: 10px;
}

.pattern-traffic-calendar__identity > div {
  align-items: flex-start;
  flex-direction: column;
  line-height: 1.15;
}

.pattern-traffic-calendar__identity strong {
  font-size: 0.98rem;
  font-weight: 950;
}

.pattern-traffic-calendar__identity span:not(.pattern-traffic-calendar__icon) {
  color: #6b6885;
  font-size: 0.76rem;
  text-transform: capitalize;
}

.pattern-traffic-calendar__icon {
  align-items: center;
  background: #f1e9ff;
  border-radius: 12px;
  color: #6d28d9;
  display: inline-flex;
  height: 38px;
  justify-content: center;
  width: 38px;
}

.pattern-traffic-calendar__icon svg {
  height: 20px;
  width: 20px;
}

.pattern-traffic-calendar__navigation {
  gap: 13px;
  justify-content: center;
}

.pattern-traffic-calendar__navigation strong {
  font-size: 0.92rem;
  min-width: 130px;
  text-align: center;
  text-transform: capitalize;
}

.pattern-traffic-calendar__navigation button,
.pattern-traffic-calendar__expand {
  align-items: center;
  background: #ffffff;
  border: 1px solid rgba(16, 35, 63, 0.12);
  border-radius: 50%;
  color: #292545;
  cursor: pointer;
  display: inline-flex;
  height: 34px;
  justify-content: center;
  width: 34px;
}

.pattern-traffic-calendar__navigation button:disabled {
  cursor: default;
  opacity: 0.32;
}

.pattern-traffic-calendar__button-icon {
  color: currentColor;
  display: block;
  flex: 0 0 auto;
  stroke: currentColor;
}

.pattern-traffic-calendar--panel .pattern-traffic-calendar__header {
  grid-template-columns: minmax(0, 1fr) auto;
}

.pattern-traffic-calendar--panel .pattern-traffic-calendar__navigation {
  grid-column: 1;
  grid-row: 1;
  justify-content: flex-start;
}

.pattern-traffic-calendar--panel .pattern-traffic-calendar__actions {
  grid-column: 2;
  grid-row: 1;
}

.pattern-traffic-calendar__actions {
  gap: 8px;
  justify-content: flex-end;
}

.pattern-traffic-calendar__today {
  background: #ffffff;
  border: 1px solid rgba(109, 40, 217, 0.2);
  border-radius: 999px;
  color: #5b21b6;
  cursor: pointer;
  font-size: 0.76rem;
  font-weight: 900;
  min-height: 34px;
  padding: 0 13px;
}

.pattern-traffic-calendar__today--active {
  background: #f3e8ff;
}

.pattern-traffic-calendar__weekdays,
.pattern-traffic-calendar__grid {
  display: grid;
  gap: 5px;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.pattern-traffic-calendar__weekdays {
  background: #f7f7fc;
  border-radius: 8px;
  color: #49445f;
  font-size: 0.68rem;
  font-weight: 900;
  padding: 6px 0;
  text-align: center;
}

.pattern-traffic-calendar__day {
  align-content: center;
  appearance: none;
  border: 1px solid transparent;
  border-radius: 9px;
  color: #18142f;
  cursor: pointer;
  display: grid;
  gap: 1px;
  justify-items: center;
  min-height: 49px;
  padding: 4px;
  position: relative;
  transition:
    box-shadow 130ms ease,
    transform 130ms ease;
  width: 100%;
}

.pattern-traffic-calendar__day:hover:not(:disabled),
.pattern-traffic-calendar__day:focus-visible {
  box-shadow: 0 7px 18px rgba(16, 35, 63, 0.16);
  outline: 2px solid rgba(37, 99, 235, 0.55);
  outline-offset: 1px;
  transform: translateY(-1px);
  z-index: 2;
}

.pattern-traffic-calendar__day:disabled {
  cursor: default;
  filter: grayscale(0.45);
  opacity: 0.46;
}

.pattern-traffic-calendar__day--normal {
  background: #f6f7fa;
  border-color: rgba(148, 163, 184, 0.08);
}

.pattern-traffic-calendar__day--low {
  background: linear-gradient(135deg, #ffe9ec, #ffd7dc);
  border-color: rgba(239, 68, 68, 0.1);
}

.pattern-traffic-calendar__day--medium {
  background: linear-gradient(135deg, #ffb9be, #ff969e);
  border-color: rgba(220, 38, 38, 0.16);
}

.pattern-traffic-calendar__day--high {
  background: linear-gradient(135deg, #d62931, #a90f1b);
  border-color: #8f0c15;
  color: #ffffff;
}

.pattern-traffic-calendar__day--selected {
  box-shadow:
    0 0 0 2px #ffffff,
    0 0 0 4px #2563eb;
  z-index: 1;
}

.pattern-traffic-calendar__day--today::after {
  background: currentColor;
  border-radius: 50%;
  bottom: 4px;
  content: "";
  height: 3px;
  position: absolute;
  width: 3px;
}

.pattern-traffic-calendar__day-number {
  font-size: 0.88rem;
  font-weight: 950;
  line-height: 1;
}

.pattern-traffic-calendar__day-status {
  font-size: 0.62rem;
  font-weight: 850;
  line-height: 1.1;
  min-height: 0.7rem;
}

.pattern-traffic-calendar__legend {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 7px 18px;
  padding-top: 3px;
}

.pattern-traffic-calendar__legend > span {
  align-items: center;
  display: inline-flex;
  font-size: 0.68rem;
  font-weight: 800;
  gap: 6px;
}

.pattern-traffic-calendar__legend small {
  color: #77738d;
  font-size: 0.64rem;
  margin-left: auto;
}

.pattern-traffic-calendar__swatch {
  border-radius: 50%;
  display: inline-block;
  height: 9px;
  width: 9px;
}

.pattern-traffic-calendar__swatch--low {
  background: #ffd7dc;
}

.pattern-traffic-calendar__swatch--medium {
  background: #ff969e;
}

.pattern-traffic-calendar__swatch--high {
  background: #b3121d;
}

.pattern-traffic-calendar__swatch--normal {
  background: #d4d7de;
}

.pattern-traffic-calendar__selected-summary {
  background: #f8f7fc;
  border: 1px solid rgba(16, 35, 63, 0.08);
  border-radius: 14px;
  display: grid;
  gap: 12px;
  margin-top: 6px;
  padding: 14px;
}

.pattern-traffic-calendar__selected-summary--friendly {
  background: #ffffff;
  box-sizing: border-box;
  border-color: rgba(94, 82, 132, 0.12);
  box-shadow: 0 8px 24px rgba(44, 35, 77, 0.08);
  max-height: calc(100dvh - 24px);
  min-height: 0;
  overflow: hidden;
  padding: 16px 18px;
}

.pattern-traffic-calendar__selected-summary > header {
  align-items: center;
  display: flex;
  gap: 18px;
  justify-content: space-between;
}

.pattern-traffic-calendar__selected-summary > header div {
  display: grid;
  gap: 3px;
}

.pattern-traffic-calendar__selected-summary > header span,
.pattern-traffic-calendar__selected-summary > p {
  color: #6b6885;
  font-size: 0.76rem;
  margin: 0;
}

.pattern-traffic-calendar__details {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  max-height: 260px;
  overflow: auto;
}

.pattern-traffic-calendar--panel .pattern-traffic-calendar__details {
  grid-template-columns: minmax(0, 1fr);
  max-height: 280px;
}

@media (max-width: 720px) {
  .pattern-traffic-calendar {
    padding:
      13px
      max(10px, env(safe-area-inset-right))
      max(13px, env(safe-area-inset-bottom))
      max(10px, env(safe-area-inset-left));
  }

  .pattern-traffic-calendar__header {
    grid-template-columns: 1fr auto;
  }

  .pattern-traffic-calendar__identity {
    display: none;
  }

  .pattern-traffic-calendar__navigation {
    justify-content: flex-start;
  }

  .pattern-traffic-calendar__actions {
    justify-content: flex-end;
  }

  .pattern-traffic-calendar__weekdays {
    font-size: 0.58rem;
  }

  .pattern-traffic-calendar__grid {
    gap: 3px;
  }

  .pattern-traffic-calendar__day {
    border-radius: 7px;
    min-height: 43px;
    padding: 3px 1px;
  }

  .pattern-traffic-calendar__day-number {
    font-size: 0.78rem;
  }

  .pattern-traffic-calendar__day-status {
    font-size: 0.52rem;
  }

  .pattern-traffic-calendar__legend {
    gap: 5px 11px;
  }

  .pattern-traffic-calendar__legend small {
    flex-basis: 100%;
    margin-left: 0;
  }

  .pattern-traffic-calendar__selected-summary > header {
    align-items: flex-start;
    flex-direction: column;
    gap: 7px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pattern-traffic-calendar__day {
    transition: none;
  }
}
</style>

