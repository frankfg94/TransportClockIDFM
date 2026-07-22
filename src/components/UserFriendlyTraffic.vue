<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  BusFront,
  CalendarDays,
  ChevronDown,
  Clock3,
  MoonStar,
} from "lucide-vue-next";
import { useI18n } from "../i18n";
import PatternTrafficIncidentSummaryItem from "../features/service-pattern/PatternTrafficIncidentSummaryItem.vue";
import {
  classifyPatternTrafficIncident,
  getPatternTrafficSummaryCopy,
} from "../features/service-pattern/trafficCalendarSummary";
import {
  extractTrafficModalDateTiles,
  type TrafficModalClockTime,
  type TrafficModalDateTilePeriod,
  type TrafficModalTimeWindow,
} from "../features/traffic/trafficModalFormatting";
import { getDisruptionTone } from "../features/traffic/trafficPresentation";
import {
  getTrafficDisruptionDisplayPeriod,
  parseTrafficDate,
} from "../features/traffic/trafficTiming";
import type {
  TrafficAlertModalData,
  TrafficDisruption,
} from "../features/traffic/types";

const props = withDefaults(
  defineProps<{
    alert?: TrafficAlertModalData;
    collapsible?: boolean;
    compact?: boolean;
    critical?: boolean;
    defaultExpanded?: boolean;
    disruption: TrafficDisruption;
    highlighted?: boolean;
    smartFormattingEnabled?: boolean;
    surface?: "card" | "plain";
  }>(),
  {
    alert: undefined,
    collapsible: false,
    compact: false,
    critical: undefined,
    defaultExpanded: false,
    highlighted: false,
    smartFormattingEnabled: true,
    surface: "card",
  },
);

const { d, t } = useI18n();
const expanded = ref(props.defaultExpanded || props.highlighted);

const summary = computed(() => getPatternTrafficSummaryCopy(props.disruption));
const title = computed(
  () =>
    summary.value.title ||
    props.alert?.title ||
    props.alert?.label ||
    props.disruption.title,
);
const incidentType = computed(() =>
  classifyPatternTrafficIncident(props.disruption),
);
const isCritical = computed(
  () => props.critical ?? getDisruptionTone(props.disruption) === "red",
);
const dateTiles = computed(() =>
  props.smartFormattingEnabled
    ? extractTrafficModalDateTiles(props.disruption, summary.value.title)
    : [],
);
const message = computed(() =>
  getDistinctTrafficText([
    props.disruption.title,
    summary.value.description,
    props.disruption.message,
    props.alert?.message,
  ]),
);
const preview = computed(() =>
  getDistinctTrafficLines([
    summary.value.description,
    props.disruption.message,
    props.alert?.message,
  ])
    .slice(0, 2)
    .join("\n"),
);
const hasExpandableContent = computed(
  () =>
    message.value.length > 240 ||
    dateTiles.value.length > 1 ||
    props.disruption.impactedStopNames.length > 4,
);
const canCollapse = computed(
  () => props.collapsible && hasExpandableContent.value,
);
const showFullContent = computed(() => !canCollapse.value || expanded.value);
const visibleDateTiles = computed(() =>
  showFullContent.value ? dateTiles.value : dateTiles.value.slice(0, 1),
);
const fallbackPeriodLabel = computed(() =>
  formatDisruptionPeriodLabel(props.disruption),
);
const visibleStopNames = computed(() =>
  showFullContent.value
    ? props.disruption.impactedStopNames.slice(0, 8)
    : props.disruption.impactedStopNames.slice(0, 4),
);
const remainingStopCount = computed(() =>
  Math.max(
    0,
    props.disruption.impactedStopNames.length - visibleStopNames.value.length,
  ),
);

watch(
  () => [props.disruption.id, props.defaultExpanded] as const,
  () => {
    expanded.value = props.defaultExpanded || props.highlighted;
  },
);

watch(
  () => props.highlighted,
  (highlighted) => {
    if (highlighted) {
      expanded.value = true;
    }
  },
);

function toggleExpanded(): void {
  expanded.value = !expanded.value;
}

function getDistinctTrafficLines(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();

  return values.flatMap((value) =>
    (value ?? "")
      .split(/\r?\n/gu)
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) return false;

        const key = normalizeDistinctTrafficLine(line);
        if (seen.has(key)) return false;

        seen.add(key);
        return true;
      }),
  );
}

function getDistinctTrafficText(values: Array<string | undefined>): string {
  const seen = new Set<string>();
  const lines: string[] = [];

  values.forEach((value) => {
    let addedLine = false;

    (value ?? "").split(/\r?\n/gu).forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) {
        if (addedLine && lines.at(-1) !== "") lines.push("");
        return;
      }

      const key = normalizeDistinctTrafficLine(line);
      if (seen.has(key)) return;

      seen.add(key);
      lines.push(line);
      addedLine = true;
    });

    if (addedLine && lines.at(-1) !== "") lines.push("");
  });

  while (lines.at(-1) === "") lines.pop();
  return lines.join("\n");
}

function normalizeDistinctTrafficLine(line: string): string {
  return line
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/\s+/gu, " ")
    .replace(/[.!?;:]+$/gu, "");
}

function formatDisruptionPeriodLabel(disruption: TrafficDisruption): string {
  const period = getTrafficDisruptionDisplayPeriod(disruption);
  if (!period) return "";

  const begin = formatTrafficDateTime(period.begin);
  const end = formatTrafficDateTime(period.end);

  if (begin && end) {
    return t("traffic.period.range", { begin, end });
  }

  return begin
    ? t("traffic.period.from", { date: begin })
    : t("traffic.period.until", { date: end });
}

function formatTrafficDateTime(value?: string): string {
  if (!value) return "";

  const date = parseTrafficDate(value);
  return !date || Number.isNaN(date.getTime())
    ? value
    : d(date, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}
function formatTrafficDate(date: Date, includeYear = false): string {
  return d(date, {
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" as const } : {}),
  });
}

function isCrossYearDateRange(period: TrafficModalDateTilePeriod): boolean {
  return Boolean(
    period.start &&
    period.end &&
    period.start.getFullYear() !== period.end.getFullYear(),
  );
}

function formatIsoDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function isSameDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatClock(clock: TrafficModalClockTime): string {
  return (
    String(clock.hour).padStart(2, "0") +
    ":" +
    String(clock.minute).padStart(2, "0")
  );
}

function formatTimeWindow(window: TrafficModalTimeWindow): string {
  const start = formatClock(window.start);
  if (window.end) {
    return t("app.trafficModalTimeRange", {
      start,
      end: formatClock(window.end),
    });
  }
  if (window.untilEndOfService) {
    return t("app.trafficModalUntilEndOfService", { start });
  }

  return t("app.trafficModalFromTime", { time: start });
}
</script>

<template>
  <article
    class="user-friendly-traffic"
    :class="{
      'user-friendly-traffic--compact': compact,
      'user-friendly-traffic--critical': isCritical,
      'user-friendly-traffic--expanded': showFullContent,
      'user-friendly-traffic--highlighted': highlighted,
      'user-friendly-traffic--plain': surface === 'plain',
      'traffic-disruption--target': highlighted,
    }"
  >
    <ul class="traffic-alert-modal__summary user-friendly-traffic__summary">
      <PatternTrafficIncidentSummaryItem
        :critical="isCritical"
        :incident-type="incidentType"
        :small-title="compact"
        :title="title"
      />
    </ul>

    <ul v-if="visibleDateTiles.length" class="traffic-alert-modal__date-tiles">
      <li
        v-for="tile in visibleDateTiles"
        :key="tile.id"
        class="traffic-alert-modal__date-tile"
        :class="{
          'traffic-alert-modal__date-tile--replacement-bus':
            tile.replacementBus,
        }"
      >
        <span class="traffic-alert-modal__date-tile-icon">
          <BusFront v-if="tile.replacementBus" aria-hidden="true" />
          <CalendarDays v-else aria-hidden="true" />
        </span>
        <div class="traffic-alert-modal__date-tile-copy">
          <strong>{{ tile.title }}</strong>
          <span v-if="tile.replacementBus">
            {{ t("app.trafficModalReplacementBus") }}
          </span>
          <span
            v-if="tile.evening"
            class="traffic-alert-modal__date-tile-evening"
          >
            <MoonStar aria-hidden="true" />
            {{ t("app.trafficModalEvening") }}
          </span>
          <span
            v-if="tile.timeWindows.length"
            class="traffic-alert-modal__date-tile-times"
          >
            <Clock3 aria-hidden="true" />
            <span v-for="(window, index) in tile.timeWindows" :key="index">
              {{ formatTimeWindow(window) }}
            </span>
          </span>
        </div>
        <div
          v-if="tile.periods.length"
          class="traffic-alert-modal__date-tile-periods"
        >
          <div
            v-for="(period, periodIndex) in tile.periods"
            :key="periodIndex"
            class="traffic-alert-modal__date-tile-period"
          >
            <template v-if="period.start && period.end">
              <time :datetime="formatIsoDate(period.start)">
                {{
                  formatTrafficDate(
                    period.start,
                    isCrossYearDateRange(period),
                  )
                }}
              </time>
              <template v-if="!isSameDate(period.start, period.end)">
                <span aria-hidden="true">→</span>
                <time :datetime="formatIsoDate(period.end)">
                  {{
                    formatTrafficDate(
                      period.end,
                      isCrossYearDateRange(period),
                    )
                  }}
                </time>
              </template>
            </template>
            <time v-else-if="period.end" :datetime="formatIsoDate(period.end)">
              {{
                t("app.trafficModalUntilDate", {
                  date: formatTrafficDate(period.end),
                })
              }}
            </time>
            <span v-else-if="period.endLabel">
              {{ t("app.trafficModalUntilLabel", { label: period.endLabel }) }}
            </span>
          </div>
        </div>
      </li>
    </ul>

    <small
      v-if="visibleDateTiles.length === 0 && fallbackPeriodLabel"
      class="user-friendly-traffic__period"
    >
      {{ fallbackPeriodLabel }}
    </small>
    <p
      v-if="!showFullContent && preview"
      class="user-friendly-traffic__preview"
    >
      {{ preview }}
    </p>

    <Transition name="user-friendly-traffic-expand">
      <p
        v-if="showFullContent && message"
        class="traffic-alert-modal__detail user-friendly-traffic__detail"
      >
        {{ message }}
      </p>
    </Transition>

    <p v-if="visibleStopNames.length" class="user-friendly-traffic__stops">
      <strong>{{ t("traffic.affectedStops") }}</strong>
      {{ visibleStopNames.join(", ") }}
      <span v-if="remainingStopCount">
        {{ t("traffic.moreStops", { count: remainingStopCount }) }}
      </span>
    </p>

    <button
      v-if="canCollapse"
      class="user-friendly-traffic__toggle"
      type="button"
      :aria-expanded="expanded"
      @click="toggleExpanded"
    >
      {{
        expanded
          ? t("traffic.hideDisruptionDetails")
          : t("traffic.showDisruptionDetails")
      }}
      <ChevronDown aria-hidden="true" />
    </button>
  </article>
</template>

<style scoped>
.user-friendly-traffic {
  background: #ffffff;
  border: 1px solid #dfe4ed;
  border-radius: 16px;
  display: grid;
  gap: 18px;
  min-width: 0;
  padding: 18px;
  transition:
    border-color 220ms ease,
    box-shadow 260ms ease,
    transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.user-friendly-traffic--compact {
  border-radius: 12px;
  gap: 12px;
  padding: 14px;
}

.user-friendly-traffic--critical {
  border-color: rgba(239, 68, 68, 0.48);
}

.user-friendly-traffic--highlighted {
  border-color: #b00067;
  box-shadow:
    0 0 0 3px rgba(176, 0, 103, 0.12),
    0 16px 36px rgba(16, 35, 63, 0.12);
}

.user-friendly-traffic--plain {
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  padding: 0;
  width: 100%;
}

.traffic-alert-modal__summary,
.traffic-alert-modal__date-tiles {
  list-style: none;
  margin: 0;
  padding: 0;
}

.traffic-alert-modal__date-tiles {
  display: grid;
  gap: 10px;
}

.traffic-alert-modal__date-tile {
  align-items: center;
  background: linear-gradient(135deg, #f8faff, #ffffff);
  border: 1px solid #c7d2fe;
  border-radius: 14px;
  display: grid;
  gap: 14px;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  padding: 13px 15px;
}

.traffic-alert-modal__date-tile--replacement-bus {
  background: linear-gradient(135deg, #fff7ed, #ffffff);
  border-color: #fed7aa;
}

.traffic-alert-modal__date-tile-icon {
  align-items: center;
  background: #e0e7ff;
  border-radius: 12px;
  color: #3730a3;
  display: inline-flex;
  height: 42px;
  justify-content: center;
  width: 42px;
}

.traffic-alert-modal__date-tile--replacement-bus
  .traffic-alert-modal__date-tile-icon {
  background: #ffedd5;
  color: #ea580c;
}

.traffic-alert-modal__date-tile-icon svg {
  height: 25px;
  width: 25px;
}

.traffic-alert-modal__date-tile-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.traffic-alert-modal__date-tile-copy strong {
  color: #25213d;
  font-size: 0.98rem;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.traffic-alert-modal__date-tile-copy > span {
  color: #57516e;
  font-size: 0.86rem;
  line-height: 1.3;
}

.traffic-alert-modal__date-tile-evening,
.traffic-alert-modal__date-tile-times {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
}

.traffic-alert-modal__date-tile-evening svg,
.traffic-alert-modal__date-tile-times svg {
  flex: 0 0 auto;
  height: 15px;
  width: 15px;
}

.traffic-alert-modal__date-tile-times > span + span::before {
  color: #a09aaf;
  content: "•";
  margin-right: 8px;
}

.traffic-alert-modal__date-tile-periods {
  display: grid;
  gap: 5px;
  justify-items: end;
}

.traffic-alert-modal__date-tile-period {
  align-items: center;
  color: #17132e;
  display: flex;
  font-size: 1rem;
  font-weight: 850;
  gap: 8px;
  white-space: nowrap;
}

.user-friendly-traffic__period {
  color: #686f7d;
  font-size: 0.78rem;
  font-weight: 780;
}

.user-friendly-traffic__preview {
  color: #475569;
  display: -webkit-box;
  font-size: 0.9rem;
  font-weight: 680;
  line-height: 1.6;
  margin: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
  white-space: pre-line;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.traffic-alert-modal__detail {
  border-top: 1px solid #e2e8f0;
  color: #0f172a;
  font-size: clamp(1rem, 2.4vw, 1.16rem);
  font-weight: 500;
  line-height: 1.65;
  margin: 0;
  overflow-wrap: anywhere;
  padding-top: 18px;
  white-space: pre-line;
}

.user-friendly-traffic__stops {
  color: #5b6473;
  font-size: 0.8rem;
  line-height: 1.45;
  margin: 0;
}

.user-friendly-traffic__stops strong {
  color: #303746;
  margin-right: 4px;
}

.user-friendly-traffic__stops span {
  color: #332f9f;
  font-weight: 800;
  white-space: nowrap;
}

.user-friendly-traffic__toggle {
  align-items: center;
  align-self: end;
  background: transparent;
  border: 0;
  color: #332f9f;
  display: inline-flex;
  font-size: 0.82rem;
  font-weight: 900;
  gap: 6px;
  justify-self: start;
  padding: 2px 0;
}

.user-friendly-traffic__toggle:hover {
  background: transparent;
  transform: none;
}

.user-friendly-traffic__toggle svg {
  height: 16px;
  transition: transform 220ms ease;
  width: 16px;
}

.user-friendly-traffic__toggle[aria-expanded="true"] svg {
  transform: rotate(180deg);
}

.user-friendly-traffic--compact :deep(.pattern-traffic-friendly-summary__item) {
  gap: 10px;
}

.user-friendly-traffic--compact
  :deep(.pattern-traffic-friendly-summary__incident-icon) {
  flex-basis: 34px;
  height: 34px;
  width: 34px;
}

.user-friendly-traffic--compact
  :deep(.pattern-traffic-friendly-summary__incident-icon svg) {
  height: 26px;
  width: 26px;
}

.user-friendly-traffic-expand-enter-active,
.user-friendly-traffic-expand-leave-active {
  transition:
    opacity 180ms ease,
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.user-friendly-traffic-expand-enter-from,
.user-friendly-traffic-expand-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 560px) {
  .traffic-alert-modal__date-tile {
    align-items: start;
    grid-template-columns: 40px minmax(0, 1fr);
    padding: 13px;
  }

  .traffic-alert-modal__date-tile-icon {
    height: 38px;
    width: 38px;
  }

  .traffic-alert-modal__date-tile-periods {
    grid-column: 2;
    justify-items: start;
  }

  .traffic-alert-modal__date-tile-period {
    font-size: 0.94rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .user-friendly-traffic,
  .user-friendly-traffic__toggle svg,
  .user-friendly-traffic-expand-enter-active,
  .user-friendly-traffic-expand-leave-active {
    transition: none;
  }
}
</style>
