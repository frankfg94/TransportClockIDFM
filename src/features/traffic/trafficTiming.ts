import { normalizeTrafficText } from "./trafficPresentation";
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

const TRAFFIC_TEXT_MONTH_PATTERN =
  "janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre";
const TRAFFIC_TEXT_WEEKDAY_PATTERN =
  String.raw`(?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+)?`;
const TRAFFIC_TEXT_MONTH_INDEXES: Record<string, number> = {
  janvier: 0,
  fevrier: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
};

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
  const textPeriod = getTrafficDisruptionTextPeriod(disruption, now);

  if (textPeriod) {
    return getTrafficPeriodTiming(textPeriod, now);
  }

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
  const textPeriod = getTrafficDisruptionTextPeriod(disruption, now);

  if (textPeriod) {
    const date = parseTrafficDate(textPeriod.begin);

    if (!date || Number.isNaN(date.getTime())) {
      return undefined;
    }

    const timeUntilStart = date.getTime() - now;

    return timeUntilStart > 0 && timeUntilStart <= lookaheadMs
      ? date
      : undefined;
  }

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
  const textPeriod = getTrafficDisruptionTextPeriod(disruption, now);

  if (textPeriod) {
    return textPeriod;
  }

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

export function getTrafficDisruptionTextPeriod(
  disruption: TrafficDisruption,
  now = Date.now(),
): TrafficPeriod | undefined {
  const searchable = normalizeTrafficText(
    `${disruption.title} ${disruption.message ?? ""}`,
  )
    .replace(/[’']/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (!searchable) {
    return undefined;
  }

  if (
    hasScheduledTimeRestriction(searchable) &&
    !isFullDayTrafficText(searchable)
  ) {
    return undefined;
  }

  const dateRange =
    extractNamedTrafficDateRange(searchable, disruption, now) ??
    extractSameMonthTrafficDateRange(searchable, disruption, now) ??
    extractSingleTrafficDate(searchable, disruption, now);

  if (!dateRange) {
    return undefined;
  }

  return {
    begin: dateRange.begin.toISOString(),
    end: dateRange.end.toISOString(),
  };
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

function extractNamedTrafficDateRange(
  text: string,
  disruption: TrafficDisruption,
  now: number,
): { begin: Date; end: Date } | undefined {
  const match = text.match(
    new RegExp(
      String.raw`\bdates?\s*:?\s*(?:du|de)\s+${TRAFFIC_TEXT_WEEKDAY_PATTERN}(\d{1,2})(?:er)?\s+(${TRAFFIC_TEXT_MONTH_PATTERN})(?:\s+(\d{4}))?\s+(?:au|a)\s+${TRAFFIC_TEXT_WEEKDAY_PATTERN}(\d{1,2})(?:er)?\s+(${TRAFFIC_TEXT_MONTH_PATTERN})(?:\s+(\d{4}))?\b`,
      "u",
    ),
  );

  if (!match) {
    return undefined;
  }

  const [
    ,
    startDayText,
    startMonthKey,
    startYearText,
    endDayText,
    endMonthKey,
    endYearText,
  ] = match;

  return createTrafficTextPeriod({
    disruption,
    endDayText,
    endMonthKey,
    endYearText,
    now,
    startDayText,
    startMonthKey,
    startYearText,
  });
}

function extractSameMonthTrafficDateRange(
  text: string,
  disruption: TrafficDisruption,
  now: number,
): { begin: Date; end: Date } | undefined {
  const match = text.match(
    new RegExp(
      String.raw`\bdates?\s*:?\s*(?:du|de)\s+${TRAFFIC_TEXT_WEEKDAY_PATTERN}(\d{1,2})(?:er)?\s+(?:au|a)\s+${TRAFFIC_TEXT_WEEKDAY_PATTERN}(\d{1,2})(?:er)?\s+(${TRAFFIC_TEXT_MONTH_PATTERN})(?:\s+(\d{4}))?\b`,
      "u",
    ),
  );

  if (!match) {
    return undefined;
  }

  const [, startDayText, endDayText, monthKey, yearText] = match;

  return createTrafficTextPeriod({
    disruption,
    endDayText,
    endMonthKey: monthKey,
    endYearText: yearText,
    now,
    startDayText,
    startMonthKey: monthKey,
    startYearText: yearText,
  });
}

function extractSingleTrafficDate(
  text: string,
  disruption: TrafficDisruption,
  now: number,
): { begin: Date; end: Date } | undefined {
  const match = text.match(
    new RegExp(
      String.raw`\bdate\s*:?\s*(?:le\s+)?${TRAFFIC_TEXT_WEEKDAY_PATTERN}(\d{1,2})(?:er)?\s+(${TRAFFIC_TEXT_MONTH_PATTERN})(?:\s+(\d{4}))?\b`,
      "u",
    ),
  );

  if (!match) {
    return undefined;
  }

  const [, dayText, monthKey, yearText] = match;

  return createTrafficTextPeriod({
    disruption,
    endDayText: dayText,
    endMonthKey: monthKey,
    endYearText: yearText,
    now,
    startDayText: dayText,
    startMonthKey: monthKey,
    startYearText: yearText,
  });
}

function createTrafficTextPeriod({
  disruption,
  endDayText,
  endMonthKey,
  endYearText,
  now,
  startDayText,
  startMonthKey,
  startYearText,
}: {
  disruption: TrafficDisruption;
  endDayText: string;
  endMonthKey: string;
  endYearText?: string;
  now: number;
  startDayText: string;
  startMonthKey: string;
  startYearText?: string;
}): { begin: Date; end: Date } | undefined {
  const startDay = Number.parseInt(startDayText, 10);
  const endDay = Number.parseInt(endDayText, 10);
  const startMonth = TRAFFIC_TEXT_MONTH_INDEXES[startMonthKey];
  const endMonth = TRAFFIC_TEXT_MONTH_INDEXES[endMonthKey];

  if (
    !Number.isFinite(startDay) ||
    !Number.isFinite(endDay) ||
    startMonth === undefined ||
    endMonth === undefined
  ) {
    return undefined;
  }

  const anchorYear = getTrafficTextYearAnchor(disruption, now);
  const candidates = getTrafficTextYearCandidates({
    anchorYear,
    disruption,
    endYearText,
    now,
    startYearText,
  });
  const periods = candidates
    .map((startYearCandidate) =>
      createTrafficTextPeriodForYear({
        endDay,
        endMonth,
        endYearText,
        startDay,
        startMonth,
        startYearCandidate,
        startYearText,
      }),
    )
    .filter(
      (period): period is { begin: Date; end: Date } => period !== undefined,
    );
  const matchingTechnicalPeriod = periods.find((period) =>
    trafficTextPeriodOverlapsApplicationPeriod(
      period,
      disruption.applicationPeriods,
    ),
  );

  return matchingTechnicalPeriod ?? periods.at(0);
}

function createTrafficTextPeriodForYear({
  endDay,
  endMonth,
  endYearText,
  startDay,
  startMonth,
  startYearCandidate,
  startYearText,
}: {
  endDay: number;
  endMonth: number;
  endYearText?: string;
  startDay: number;
  startMonth: number;
  startYearCandidate: number;
  startYearText?: string;
}): { begin: Date; end: Date } | undefined {
  const normalizedStartYear = normalizeTrafficTextYear(startYearText);
  const normalizedEndYear = normalizeTrafficTextYear(endYearText);
  let startYear = normalizedStartYear ?? startYearCandidate;
  let endYear = normalizedEndYear ?? startYear;

  if (!normalizedEndYear && endMonth < startMonth) {
    endYear += 1;
  }

  if (!normalizedStartYear && normalizedEndYear && startMonth > endMonth) {
    startYear = normalizedEndYear - 1;
  }

  const begin = createLocalTrafficDate(startYear, startMonth, startDay);
  const endDayStart = createLocalTrafficDate(endYear, endMonth, endDay);

  if (!begin || !endDayStart) {
    return undefined;
  }

  const end = new Date(endDayStart);
  end.setHours(23, 59, 59, 999);

  return end.getTime() <= begin.getTime() ? undefined : { begin, end };
}

function getTrafficTextYearCandidates({
  anchorYear,
  disruption,
  endYearText,
  now,
  startYearText,
}: {
  anchorYear: number;
  disruption: TrafficDisruption;
  endYearText?: string;
  now: number;
  startYearText?: string;
}): number[] {
  const normalizedStartYear = normalizeTrafficTextYear(startYearText);
  const normalizedEndYear = normalizeTrafficTextYear(endYearText);
  const years = new Set<number>();

  if (normalizedStartYear) {
    years.add(normalizedStartYear);
  } else if (normalizedEndYear) {
    years.add(normalizedEndYear);
    years.add(normalizedEndYear - 1);
  } else {
    years.add(anchorYear);
    years.add(anchorYear - 1);
    years.add(anchorYear + 1);
    years.add(new Date(now).getFullYear());
    disruption.applicationPeriods
      .flatMap((period) => [period.begin, period.end])
      .map((value) => parseTrafficDate(value))
      .filter((date): date is Date => Boolean(date))
      .forEach((date) => {
        const year = date.getFullYear();
        years.add(year);
        years.add(year - 1);
        years.add(year + 1);
      });
  }

  return Array.from(years);
}

function trafficTextPeriodOverlapsApplicationPeriod(
  textPeriod: { begin: Date; end: Date },
  applicationPeriods: TrafficPeriod[],
): boolean {
  return applicationPeriods.some((period) => {
    const begin = parseTrafficDate(period.begin)?.getTime();
    const end = parseTrafficDate(period.end)?.getTime();

    if (begin === undefined && end === undefined) {
      return false;
    }

    const periodBegin = begin ?? Number.NEGATIVE_INFINITY;
    const periodEnd = end ?? Number.POSITIVE_INFINITY;

    return (
      textPeriod.begin.getTime() <= periodEnd &&
      textPeriod.end.getTime() >= periodBegin
    );
  });
}

function getTrafficTextYearAnchor(
  disruption: TrafficDisruption,
  now: number,
): number {
  return (
    disruption.applicationPeriods
      .flatMap((period) => [period.begin, period.end])
      .map((value) => parseTrafficDate(value))
      .filter((date): date is Date => Boolean(date))
      .sort((left, right) => left.getTime() - right.getTime())
      .at(0)?.getFullYear() ?? new Date(now).getFullYear()
  );
}

function normalizeTrafficTextYear(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const year = Number.parseInt(value, 10);

  if (!Number.isFinite(year)) {
    return undefined;
  }

  return year < 100 ? 2000 + year : year;
}

function createLocalTrafficDate(
  year: number,
  month: number,
  day: number,
): Date | undefined {
  const date = new Date(year, month, day);

  return date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
    ? date
    : undefined;
}

function isFullDayTrafficText(text: string): boolean {
  return /\b(?:toute\s+la\s+journee|journee\s+entiere)\b/u.test(text);
}

function hasScheduledTimeRestriction(text: string): boolean {
  return /\b(?:a partir de|des)\s+\d{1,2}\s*h\s*\d{0,2}\b/u.test(text);
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
