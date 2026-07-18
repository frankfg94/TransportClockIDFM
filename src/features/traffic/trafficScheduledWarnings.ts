import { normalizeTrafficText } from "./trafficPresentation";
import { parseTrafficDate } from "./trafficTiming";
import { getTrafficDisruptionStartClockTime } from "./trafficTextTimes";
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
  const start = new Date(current);
  start.setHours(startTime.hour, startTime.minute, 0, 0);

  if (isWeekdayOnly(text) && !isWeekday(start)) {
    return undefined;
  }

  const matchingPeriod = findMatchingScheduledPeriod(
    disruption.applicationPeriods,
    start,
  );

  if (!matchingPeriod) {
    return undefined;
  }

  const startTimeMs = start.getTime();
  const endTimeMs = matchingPeriod.end?.getTime();

  if (typeof endTimeMs === "number" && now > endTimeMs) {
    return undefined;
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
  if (end && !Number.isNaN(end.getTime()) && end.getTime() <= start.getTime()) {
    return false;
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

function isWeekday(date: Date): boolean {
  const day = date.getDay();

  return day >= 1 && day <= 5;
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
