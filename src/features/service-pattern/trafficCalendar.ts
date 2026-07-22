import { getDisruptionTone } from "../traffic/trafficPresentation";
import {
  calculateTrafficImpactSeverity,
  calculateTrafficImpactTemporalMultiplier,
  TRAFFIC_IMPACT_SEVERITY_MODEL,
  type TrafficImpactSeverityResult,
  type TrafficImpactTimeWindow,
} from "../traffic/trafficImpactSeverity";
import {
  getTrafficClockMinuteOfDay,
  getTrafficDisruptionRestartClockTime,
  getTrafficDisruptionStartClockTime,
} from "../traffic/trafficTextTimes";
import { getTrafficDisruptionEffectivePeriods, parseTrafficDate } from "../traffic/trafficTiming";
import type {
  TrafficCalendarImpactScope,
  TrafficDisruption,
  TrafficPeriod,
} from "../traffic/types";
import {
  analyzeTrafficImpacts,
  getPatternTrafficEdgeKey,
  type PatternTrafficEdge,
  type PatternTrafficImpactAnalysis,
  type PatternTrafficImpactKind,
  type PatternTrafficStation,
} from "./trafficImpactAnalysis";
import { normalizePatternStationName } from "./stationKeys";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export interface PatternTrafficCalendarEvent {
  id: string;
  disruption: TrafficDisruption;
  period: TrafficPeriod;
  start: Date;
  end?: Date;
  impactAnalysis: PatternTrafficImpactAnalysis;
  kind: PatternTrafficImpactKind;
  interruptedStationKeys: string[];
  disturbedStationKeys: string[];
  affectedEdgeKeys: string[];
  affectedSegmentLabels: string[];
  fallbackStationKeys: string[];
  startTimeLabel?: string;
  restartTimeLabel?: string;
  impactTimeWindow?: TrafficImpactTimeWindow;
}

export interface PatternTrafficCalendarDay {
  id: string;
  date: Date;
  dateKey: string;
  inCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  events: PatternTrafficCalendarEvent[];
  impactCount: number;
  interruptedStationLabels: string[];
  disturbedStationLabels: string[];
  affectedSegmentLabels: string[];
  durationMinutes?: number;
  severity?: TrafficImpactSeverityResult;
  timeWindow?: string;
}

export interface PatternTrafficCalendarMonth {
  monthStart: Date;
  days: PatternTrafficCalendarDay[];
}

export interface PatternTrafficCalendarBounds {
  firstMonth: Date;
  lastMonth: Date;
}

export function createPatternTrafficCalendarEvents(
  disruptions: TrafficDisruption[],
  stations: PatternTrafficStation[],
  edges: PatternTrafficEdge[],
  impactScope: TrafficCalendarImpactScope = "all-impacts",
  now = Date.now(),
): PatternTrafficCalendarEvent[] {
  const todayStart = startOfLocalDay(new Date(now));

  return disruptions
    .flatMap((disruption) => {
      const impactAnalysis = analyzeTrafficImpacts([disruption], stations, edges);
      const inferredKind: PatternTrafficImpactKind =
        getDisruptionTone(disruption) === "red" ? "interruption" : "disturbance";
      const selectedSegments = impactAnalysis.segments.filter(
        (segment) => impactScope === "all-impacts" || segment.kind === "interruption",
      );

      if (
        selectedSegments.length === 0 &&
        impactScope === "interruptions-only" &&
        inferredKind !== "interruption"
      )
        return [];

      const stationKinds = new Map<string, PatternTrafficImpactKind>();
      const edgeKeys = new Set<string>();
      const emptyStationEdgeKeys = new Set<string>();

      selectedSegments.forEach((segment) => {
        segment.stationKeys.forEach((stationKey) => {
          const previous = stationKinds.get(stationKey);
          if (!previous || segment.kind === "interruption") {
            stationKinds.set(stationKey, segment.kind);
          }
        });
        segment.edgeKeys.forEach((edgeKey) => edgeKeys.add(edgeKey));
        if (segment.stationKeys.length === 0) {
          segment.edgeKeys.forEach((edgeKey) => emptyStationEdgeKeys.add(edgeKey));
        }
      });
      if (stationKinds.size === 0) {
        const impactedNames = new Set(
          disruption.impactedStopNames.map(normalizePatternStationName),
        );
        stations.forEach((station) => {
          if (impactedNames.has(normalizePatternStationName(station.label))) {
            stationKinds.set(station.key, inferredKind);
          }
        });
      }

      const interruptedStationKeys = Array.from(stationKinds.entries())
        .filter(([, kind]) => kind === "interruption")
        .map(([key]) => key);
      const disturbedStationKeys = Array.from(stationKinds.entries())
        .filter(([, kind]) => kind === "disturbance")
        .map(([key]) => key);
      const fallbackStationKeys =
        stationKinds.size === 0 ? getEndpointKeys(Array.from(edgeKeys), edges) : [];
      const periods = getTrafficDisruptionEffectivePeriods(disruption, now).periods;
      const startClock = getTrafficDisruptionStartClockTime(disruption);
      const restartClock = getTrafficDisruptionRestartClockTime(disruption);

      return periods.flatMap((period, periodIndex) => {
        const start = parseTrafficDate(period.begin);
        const parsedEnd = parseTrafficDate(period.end);

        if (!start || Number.isNaN(start.getTime())) return [];
        if (
          parsedEnd &&
          (!Number.isFinite(parsedEnd.getTime()) || parsedEnd.getTime() <= start.getTime())
        ) {
          return [];
        }

        const end = parsedEnd && Number.isFinite(parsedEnd.getTime()) ? parsedEnd : undefined;
        const latestCoveredTime = end?.getTime() ?? endOfLocalDay(start).getTime();

        if (latestCoveredTime < todayStart.getTime()) return [];

        const event: PatternTrafficCalendarEvent = {
          id: `${disruption.id}:${start.getTime()}:${periodIndex}`,
          disruption,
          period,
          start,
          impactAnalysis,
          kind:
            interruptedStationKeys.length > 0 ||
            selectedSegments.some((segment) => segment.kind === "interruption")
              ? "interruption"
              : selectedSegments.length > 0
                ? "disturbance"
                : inferredKind,
          interruptedStationKeys,
          disturbedStationKeys,
          affectedEdgeKeys: Array.from(edgeKeys),
          affectedSegmentLabels: getSegmentLabels(
            Array.from(emptyStationEdgeKeys),
            stations,
            edges,
          ),
          fallbackStationKeys,
        };
        if (startClock && restartClock) {
          event.impactTimeWindow = {
            startMinute: getTrafficClockMinuteOfDay(startClock),
            endMinute: getTrafficClockMinuteOfDay(restartClock),
          };
        }

        if (end) event.end = end;
        event.startTimeLabel = startClock?.label ?? formatClockTime(start);
        if (end) {
          event.restartTimeLabel = restartClock?.label ?? formatClockTime(end);
        }

        return [event];
      });
    })
    .sort((left, right) => left.start.getTime() - right.start.getTime());
}

export function createPatternTrafficCalendarMonth(
  events: PatternTrafficCalendarEvent[],
  stations: PatternTrafficStation[],
  edges: PatternTrafficEdge[],
  visibleMonth: Date,
  now = Date.now(),
): PatternTrafficCalendarMonth {
  const monthStart = startOfLocalMonth(visibleMonth);
  const todayStart = startOfLocalDay(new Date(now));
  const firstWeekday = monthStart.getDay() === 0 ? 7 : monthStart.getDay();
  const gridStart = addLocalDays(monthStart, -(firstWeekday - 1));
  const stationByKey = new Map(stations.map((station) => [station.key, station.label]));

  return {
    monthStart,
    days: Array.from({ length: 42 }, (_, index) => {
      const date = addLocalDays(gridStart, index);
      const dateStart = startOfLocalDay(date);
      const dateEnd = addLocalDays(dateStart, 1);
      const dayEvents = events.filter((event) =>
        trafficCalendarEventAffectsDay(event, dateStart, dateEnd, now),
      );
      const stationKinds = aggregateStationKinds(dayEvents);
      const interruptedStationKeys = Array.from(stationKinds.entries())
        .filter(([, kind]) => kind === "interruption")
        .map(([key]) => key);
      const disturbedStationKeys = Array.from(stationKinds.entries())
        .filter(([, kind]) => kind === "disturbance")
        .map(([key]) => key);
      const affectedStationKeys = [...interruptedStationKeys, ...disturbedStationKeys];
      const fallbackStationKeys =
        affectedStationKeys.length === 0
          ? Array.from(new Set(dayEvents.flatMap((event) => event.fallbackStationKeys)))
          : [];
      const temporalMultipliersByStationKey = createTrafficTemporalMultipliersByStation(
        affectedStationKeys.length > 0 ? affectedStationKeys : fallbackStationKeys,
        dayEvents,
        dateStart,
        dateEnd,
      );
      const severity =
        dayEvents.length > 0
          ? calculateTrafficImpactSeverity({
              affectedStationKeys,
              fallbackStationKeys,
              stations,
              edges,
              temporalMultipliersByStationKey,
            })
          : undefined;
      const durationMinutes = calculateTrafficCalendarDurationMinutes(
        dayEvents
          .filter((event): event is PatternTrafficCalendarEvent & { end: Date } =>
            Boolean(event.end),
          )
          .map((event) => ({
            start: new Date(Math.max(event.start.getTime(), dateStart.getTime())),
            end: new Date(Math.min(event.end.getTime(), dateEnd.getTime())),
          })),
      );
      const singleEvent =
        dayEvents.length === 1 &&
        isSameLocalDate(dayEvents[0].start, date) &&
        Boolean(dayEvents[0].end) &&
        isSameLocalDate(dayEvents[0].end!, date)
          ? dayEvents[0]
          : undefined;
      const timeWindow =
        singleEvent?.startTimeLabel && singleEvent.restartTimeLabel
          ? `${singleEvent.startTimeLabel}–${singleEvent.restartTimeLabel}`
          : undefined;
      const dateKey = getLocalDateKey(date);
      const day: PatternTrafficCalendarDay = {
        id: `traffic-calendar:${dateKey}`,
        date,
        dateKey,
        inCurrentMonth:
          date.getFullYear() === monthStart.getFullYear() &&
          date.getMonth() === monthStart.getMonth(),
        isToday: dateKey === getLocalDateKey(todayStart),
        isPast: dateEnd.getTime() <= todayStart.getTime(),
        events: dayEvents,
        impactCount: new Set(dayEvents.map((event) => event.disruption.id)).size,
        interruptedStationLabels: interruptedStationKeys
          .map((key) => stationByKey.get(key) ?? key)
          .sort(localeSort),
        disturbedStationLabels: disturbedStationKeys
          .map((key) => stationByKey.get(key) ?? key)
          .sort(localeSort),
        affectedSegmentLabels: Array.from(
          new Set(dayEvents.flatMap((event) => event.affectedSegmentLabels)),
        ).sort(localeSort),
      };

      if (durationMinutes !== undefined) day.durationMinutes = durationMinutes;
      if (severity) day.severity = severity;
      if (timeWindow) day.timeWindow = timeWindow;
      return day;
    }),
  };
}

export function getPatternTrafficCalendarBounds(
  events: PatternTrafficCalendarEvent[],
  now = Date.now(),
): PatternTrafficCalendarBounds {
  const firstMonth = startOfLocalMonth(new Date(now));
  const lastEventTime = events.reduce(
    (latest, event) => Math.max(latest, event.end?.getTime() ?? event.start.getTime()),
    firstMonth.getTime(),
  );

  return {
    firstMonth,
    lastMonth: startOfLocalMonth(new Date(lastEventTime)),
  };
}

export function calculateTrafficCalendarDurationMinutes(
  intervals: Array<{ start: Date; end: Date }>,
): number | undefined {
  const normalized = intervals
    .map((interval) => ({
      start: interval.start.getTime(),
      end: interval.end.getTime(),
    }))
    .filter(
      (interval) =>
        Number.isFinite(interval.start) &&
        Number.isFinite(interval.end) &&
        interval.end > interval.start,
    )
    .sort((left, right) => left.start - right.start);

  if (normalized.length === 0) return undefined;

  let total = 0;
  let currentStart = normalized[0].start;
  let currentEnd = normalized[0].end;

  normalized.slice(1).forEach((interval) => {
    if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
      return;
    }

    total += currentEnd - currentStart;
    currentStart = interval.start;
    currentEnd = interval.end;
  });
  total += currentEnd - currentStart;

  return Math.round(total / MINUTE_MS);
}

export function getTrafficCalendarEvaluationTimestamp(
  date: Date,
  now = Date.now(),
): number | undefined {
  if (getLocalDateKey(date) === getLocalDateKey(new Date(now))) {
    return undefined;
  }

  const timestamp = new Date(date);
  timestamp.setHours(12, 0, 0, 0);
  return timestamp.getTime();
}

export function addTrafficCalendarMonths(date: Date, amount: number): Date {
  const result = startOfLocalMonth(date);
  result.setMonth(result.getMonth() + amount);
  return result;
}

export function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function trafficCalendarEventAffectsDay(
  event: PatternTrafficCalendarEvent,
  dayStart: Date,
  nextDayStart: Date,
  now: number,
): boolean {
  const eventEnd = event.end?.getTime() ?? endOfLocalDay(event.start).getTime();
  const eventStart = event.start.getTime();

  if (eventStart >= dayStart.getTime() && eventStart < nextDayStart.getTime()) {
    return true;
  }

  const evaluationTimestamp = getTrafficCalendarEvaluationTimestamp(dayStart, now) ?? now;

  return eventStart <= evaluationTimestamp && eventEnd >= evaluationTimestamp;
}

function aggregateStationKinds(
  events: PatternTrafficCalendarEvent[],
): Map<string, PatternTrafficImpactKind> {
  const stationKinds = new Map<string, PatternTrafficImpactKind>();

  events.forEach((event) => {
    event.disturbedStationKeys.forEach((key) => {
      if (!stationKinds.has(key)) stationKinds.set(key, "disturbance");
    });
    event.interruptedStationKeys.forEach((key) => {
      stationKinds.set(key, "interruption");
    });
  });

  return stationKinds;
}

function createTrafficTemporalMultipliersByStation(
  stationKeys: string[],
  events: PatternTrafficCalendarEvent[],
  dayStart: Date,
  nextDayStart: Date,
): ReadonlyMap<string, number> {
  return new Map(
    stationKeys.map((stationKey) => {
      const windows = events
        .filter(
          (event) =>
            event.interruptedStationKeys.includes(stationKey) ||
            event.disturbedStationKeys.includes(stationKey) ||
            event.fallbackStationKeys.includes(stationKey),
        )
        .map((event) => getEventTrafficImpactTimeWindow(event, dayStart, nextDayStart));
      return [stationKey, calculateTrafficImpactTemporalMultiplier(windows).multiplier];
    }),
  );
}

function getEventTrafficImpactTimeWindow(
  event: PatternTrafficCalendarEvent,
  dayStart: Date,
  nextDayStart: Date,
): TrafficImpactTimeWindow | undefined {
  if (event.impactTimeWindow) return event.impactTimeWindow;
  if (!event.end) return undefined;

  const startTime = event.start.getTime();
  const endTime = event.end.getTime();
  if (startTime <= dayStart.getTime() && endTime >= nextDayStart.getTime() - 1) {
    return undefined;
  }

  return {
    startMinute: startTime > dayStart.getTime() ? getLocalMinuteOfDay(event.start) : 0,
    endMinute:
      endTime < nextDayStart.getTime()
        ? getLocalMinuteOfDay(event.end)
        : TRAFFIC_IMPACT_SEVERITY_MODEL.temporal.minutesPerDay,
  };
}

function getLocalMinuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function getEndpointKeys(edgeKeys: string[], edges: PatternTrafficEdge[]): string[] {
  const selected = new Set(edgeKeys);

  return Array.from(
    new Set(
      edges
        .filter((edge) => selected.has(getPatternTrafficEdgeKey(edge)))
        .flatMap((edge) => [edge.source, edge.target]),
    ),
  );
}

function getSegmentLabels(
  edgeKeys: string[],
  stations: PatternTrafficStation[],
  edges: PatternTrafficEdge[],
): string[] {
  if (edgeKeys.length === 0) return [];

  const selected = new Set(edgeKeys);
  const stationByKey = new Map(stations.map((station) => [station.key, station.label]));

  return Array.from(
    new Set(
      edges
        .filter((edge) => selected.has(getPatternTrafficEdgeKey(edge)))
        .map(
          (edge) =>
            `${stationByKey.get(edge.source) ?? edge.source} → ${
              stationByKey.get(edge.target) ?? edge.target
            }`,
        ),
    ),
  );
}

function startOfLocalDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfLocalDay(date: Date): Date {
  const result = startOfLocalDay(date);
  result.setDate(result.getDate() + 1);
  result.setMilliseconds(-1);
  return result;
}

function startOfLocalMonth(date: Date): Date {
  const result = startOfLocalDay(date);
  result.setDate(1);
  return result;
}

function addLocalDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function isSameLocalDate(left: Date, right: Date): boolean {
  return getLocalDateKey(left) === getLocalDateKey(right);
}

function formatClockTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
    2,
    "0",
  )}`;
}

function localeSort(left: string, right: string): number {
  return left.localeCompare(right, "fr", { sensitivity: "base" });
}

export const TRAFFIC_CALENDAR_DAY_MS = DAY_MS;
