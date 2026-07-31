import { normalizeTrafficText } from "./trafficPresentation";
import { parseTrafficDate } from "./trafficTiming";
import {
  getTrafficDisruptionStartClockTime,
  type TrafficClockTime,
} from "./trafficTextTimes";
import type { TrafficDisruption, TrafficPeriod } from "./types";

export interface ScheduledTrafficInterruption {
  active: boolean;
  end?: Date;
  start: Date;
}

interface MatchingScheduledPeriod {
  end?: Date;
  period: TrafficPeriod;
}

const EARLY_MORNING_TECHNICAL_PERIOD_LIMIT = 6;

export function getTodayScheduledTrafficInterruption(
  disruption: TrafficDisruption,
  now = Date.now(),
): ScheduledTrafficInterruption | undefined {
  const text = normalizeTrafficText(
    `${disruption.title} ${disruption.message ?? ""}`,
  );
  const startTime = getTrafficDisruptionStartClockTime(disruption);

  if (!startTime) {
    return undefined;
  }

  const current = new Date(now);
  for (const start of getCandidateScheduledStarts(current, startTime)) {
    if (isWeekdayOnly(text) && !isWeekday(start)) {
      continue;
    }

    if (isWeekendOnly(text) && !isWeekend(start)) {
      continue;
    }

    const matchingPeriod = findMatchingScheduledPeriod(
      disruption.applicationPeriods,
      start,
    );

    if (!matchingPeriod) {
      continue;
    }

    const startTimeMs = start.getTime();
    const endTimeMs = matchingPeriod.end?.getTime();

    if (typeof endTimeMs === "number" && now > endTimeMs) {
      continue;
    }

    const scheduled: ScheduledTrafficInterruption = {
      active: now >= startTimeMs,
      start,
    };

    if (matchingPeriod.end) {
      scheduled.end = matchingPeriod.end;
    }

    return scheduled;
  }

  return undefined;
}

export function getTodayScheduledTrafficStart(
  disruption: TrafficDisruption,
  now = Date.now(),
): Date | undefined {
  const scheduled = getTodayScheduledTrafficInterruption(disruption, now);

  return scheduled && !scheduled.active ? scheduled.start : undefined;
}

function findMatchingScheduledPeriod(
  periods: TrafficPeriod[],
  start: Date,
): MatchingScheduledPeriod | undefined {
  return periods
    .map((period) => {
      const begin = parseTrafficDate(period.begin);
      const end = parseTrafficDate(period.end);

      if (!begin || Number.isNaN(begin.getTime())) {
        return undefined;
      }

      if (!periodMatchesScheduledStart(begin, end, start)) {
        return undefined;
      }

      const match: MatchingScheduledPeriod = { period };

      if (end && !Number.isNaN(end.getTime())) {
        match.end = end;
      }

      return match;
    })
    .filter((period): period is MatchingScheduledPeriod => Boolean(period))
    .sort((left, right) => {
      const leftBegin = parseTrafficDate(left.period.begin)?.getTime() ?? 0;
      const rightBegin = parseTrafficDate(right.period.begin)?.getTime() ?? 0;

      return leftBegin - rightBegin;
    })
    .at(0);
}

function periodMatchesScheduledStart(
  begin: Date,
  end: Date | undefined,
  start: Date,
): boolean {
  const endTime = end?.getTime();

  if (typeof endTime === "number" && !Number.isNaN(endTime) && endTime <= start.getTime()) {
    return false;
  }

  if (
    begin.getTime() <= start.getTime() &&
    (endTime === undefined || Number.isNaN(endTime) || endTime > start.getTime())
  ) {
    return true;
  }

  if (isSameLocalDate(begin, start)) {
    return true;
  }

  return (
    isNextLocalDate(begin, start) &&
    begin.getHours() <= EARLY_MORNING_TECHNICAL_PERIOD_LIMIT
  );
}

function isWeekdayOnly(text: string): boolean {
  return text.includes("en semaine");
}

function isWeekendOnly(text: string): boolean {
  return /\bweek[-\s]?ends?\b/u.test(text);
}

function getCandidateScheduledStarts(
  current: Date,
  startTime: TrafficClockTime,
): Date[] {
  const starts: Date[] = [];

  if (current.getHours() <= EARLY_MORNING_TECHNICAL_PERIOD_LIMIT) {
    const previous = new Date(current);
    previous.setDate(previous.getDate() - 1);
    starts.push(createScheduledStart(previous, startTime));
  }

  starts.push(createScheduledStart(current, startTime));

  return starts;
}

function createScheduledStart(date: Date, startTime: TrafficClockTime): Date {
  const start = new Date(date);
  start.setHours(startTime.hour, startTime.minute, 0, 0);
  return start;
}

function isWeekday(date: Date): boolean {
  const day = date.getDay();

  return day >= 1 && day <= 5;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();

  return day === 0 || day === 6;
}

function isSameLocalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isNextLocalDate(left: Date, right: Date): boolean {
  const next = new Date(right);
  next.setDate(next.getDate() + 1);

  return isSameLocalDate(left, next);
}
