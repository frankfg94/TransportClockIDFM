import type { TrafficDisruption, TrafficPeriod } from "./types";

export type TrafficTimingTab = "current" | "upcoming";

type TrafficPeriodTiming = TrafficTimingTab | "expired";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_UPCOMING_TRAFFIC_WARNING_LOOKAHEAD_DAYS = 10;

interface TrafficPeriodState {
  begin?: number;
  end?: number;
  period: TrafficPeriod;
  timing: TrafficPeriodTiming;
}

export function getCurrentTrafficDisruptions(
  disruptions: TrafficDisruption[],
  now = Date.now(),
): TrafficDisruption[] {
  return disruptions.filter(
    (disruption) => getTrafficDisruptionTiming(disruption, now) === "current",
  );
}

export function getUpcomingTrafficDisruptions(
  disruptions: TrafficDisruption[],
  now = Date.now(),
): TrafficDisruption[] {
  return disruptions.filter(
    (disruption) => getTrafficDisruptionTiming(disruption, now) === "upcoming",
  );
}

export function getTrafficDisruptionTiming(
  disruption: TrafficDisruption,
  now = Date.now(),
): TrafficPeriodTiming {
  if (disruption.applicationPeriods.length === 0) {
    return "current";
  }

  const timings = disruption.applicationPeriods.map(
    (period) => getTrafficPeriodTiming(period, now),
  );

  if (timings.includes("current")) {
    return "current";
  }

  if (timings.includes("upcoming")) {
    return "upcoming";
  }

  return "expired";
}

export function getCurrentAndUpcomingTrafficWarningDisruptions(
  disruptions: TrafficDisruption[],
  now = Date.now(),
  lookaheadDays = DEFAULT_UPCOMING_TRAFFIC_WARNING_LOOKAHEAD_DAYS,
): TrafficDisruption[] {
  return disruptions.filter(
    (disruption) =>
      getTrafficDisruptionTiming(disruption, now) === "current" ||
      Boolean(getUpcomingTrafficWarningStart(disruption, now, lookaheadDays)),
  );
}

export function getUpcomingTrafficWarningStart(
  disruption: TrafficDisruption,
  now = Date.now(),
  lookaheadDays = DEFAULT_UPCOMING_TRAFFIC_WARNING_LOOKAHEAD_DAYS,
): Date | undefined {
  if (lookaheadDays <= 0) {
    return undefined;
  }

  if (getTrafficDisruptionTiming(disruption, now) === "current") {
    return undefined;
  }

  const lookaheadMs = lookaheadDays * DAY_MS;

  return disruption.applicationPeriods
    .map((period) => parseTrafficDate(period.begin))
    .filter((date): date is Date => {
      if (!date || Number.isNaN(date.getTime())) {
        return false;
      }

      const timeUntilStart = date.getTime() - now;

      return (
        timeUntilStart > 0 &&
        timeUntilStart <= lookaheadMs
      );
    })
    .sort((left, right) => left.getTime() - right.getTime())
    .at(0);
}

export function getTrafficDisruptionDisplayPeriod(
  disruption: TrafficDisruption,
  now = Date.now(),
): TrafficPeriod | undefined {
  if (disruption.applicationPeriods.length === 0) {
    return undefined;
  }

  const periodStates = disruption.applicationPeriods.map((period) =>
    createTrafficPeriodState(period, now),
  );

  return (
    getBestCurrentPeriod(periodStates) ??
    getBestUpcomingPeriod(periodStates) ??
    getBestExpiredPeriod(periodStates) ??
    disruption.applicationPeriods[0]
  );
}

export function parseTrafficDate(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const compactDate = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/u,
  );

  if (compactDate) {
    const [, year, month, day, hour, minute, second] = compactDate;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function createTrafficPeriodState(
  period: TrafficPeriod,
  now: number,
): TrafficPeriodState {
  const begin = parseTrafficDate(period.begin)?.getTime();
  const end = parseTrafficDate(period.end)?.getTime();

  return {
    begin,
    end,
    period,
    timing: getTrafficPeriodTiming(period, now),
  };
}

function getTrafficPeriodTiming(
  period: TrafficPeriod,
  now: number,
): TrafficPeriodTiming {
  const begin = parseTrafficDate(period.begin)?.getTime();
  const end = parseTrafficDate(period.end)?.getTime();

  if (typeof begin === "number" && begin > now) {
    return "upcoming";
  }

  if (typeof end === "number" && end < now) {
    return "expired";
  }

  return "current";
}

function getBestCurrentPeriod(
  states: TrafficPeriodState[],
): TrafficPeriod | undefined {
  return states
    .filter((state) => state.timing === "current")
    .sort((left, right) => compareDefinedDesc(left.begin, right.begin))
    .at(0)?.period;
}

function getBestUpcomingPeriod(
  states: TrafficPeriodState[],
): TrafficPeriod | undefined {
  return states
    .filter((state) => state.timing === "upcoming")
    .sort((left, right) => compareDefinedAsc(left.begin, right.begin))
    .at(0)?.period;
}

function getBestExpiredPeriod(
  states: TrafficPeriodState[],
): TrafficPeriod | undefined {
  return states
    .filter((state) => state.timing === "expired")
    .sort((left, right) => compareDefinedDesc(left.end, right.end))
    .at(0)?.period;
}

function compareDefinedAsc(
  left: number | undefined,
  right: number | undefined,
): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  if (typeof left === "number") {
    return -1;
  }

  if (typeof right === "number") {
    return 1;
  }

  return 0;
}

function compareDefinedDesc(
  left: number | undefined,
  right: number | undefined,
): number {
  return compareDefinedAsc(right, left);
}
