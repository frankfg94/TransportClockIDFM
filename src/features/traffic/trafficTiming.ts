import { normalizeTrafficText } from "./trafficPresentation";
import type { TrafficDisruption, TrafficPeriod } from "./types";

export type TrafficTimingTab = "current" | "upcoming";

export type TrafficTextDateSetKind = "range" | "until" | "single" | "estimated-end";

export interface TrafficTextDateSet {
  id: string;
  kind: TrafficTextDateSetKind;
  period?: TrafficPeriod;
  start?: Date;
  end?: Date;
  endLabel?: string;
  explicitStart: boolean;
  evening: boolean;
  titleHint?: string;
  rawText: string;
  sourceLine: string;
  sourceText: string;
}

interface TrafficTextDateSetMatch {
  kind: TrafficTextDateSetKind;
  index: number;
  length: number;
  startDayText?: string;
  startMonthKey?: string;
  startYearText?: string;
  endDayText?: string;
  endMonthKey?: string;
  endYearText?: string;
  endLabel?: string;
}

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
const TRAFFIC_TEXT_WEEKDAY_PATTERN = String.raw`(?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+)?`;
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
  const periods = getTrafficDisruptionEffectivePeriods(disruption, now).periods;

  if (periods.length === 0) {
    return "current";
  }

  const timings = periods.map((period) => getTrafficPeriodTiming(period, now));

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

  return getTrafficDisruptionEffectivePeriods(disruption, now)
    .periods.map((period) => parseTrafficDate(period.begin))
    .filter((date): date is Date => {
      if (!date || Number.isNaN(date.getTime())) {
        return false;
      }

      const timeUntilStart = date.getTime() - now;

      return timeUntilStart > 0 && timeUntilStart <= lookaheadMs;
    })
    .sort((left, right) => left.getTime() - right.getTime())
    .at(0);
}
export function getTrafficDisruptionDisplayPeriod(
  disruption: TrafficDisruption,
  now = Date.now(),
): TrafficPeriod | undefined {
  const periods = getTrafficDisruptionEffectivePeriods(disruption, now).periods;

  if (periods.length === 0) {
    return undefined;
  }

  const periodStates = periods.map((period) => createTrafficPeriodState(period, now));

  return (
    getBestCurrentPeriod(periodStates) ??
    getBestUpcomingPeriod(periodStates) ??
    getBestExpiredPeriod(periodStates) ??
    periods[0]
  );
}
export function parseTrafficDate(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const compactDate = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/u);

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
  return getTrafficDisruptionEffectivePeriods(disruption, now).textPeriods.at(0);
}

export function getTrafficDisruptionTextDateSets(
  disruption: TrafficDisruption,
  now = Date.now(),
): TrafficTextDateSet[] {
  const source = [disruption.title, disruption.message, disruption.motif]
    .filter((value): value is string => Boolean(value))
    .join("\n");
  const searchable = normalizeTrafficText(source).replace(/[’']/gu, " ").replace(/\r/gu, "");
  const matchGroups = groupTrafficTextDateSetMatches(extractTrafficTextDateSetMatches(searchable));
  const evening = hasEveningTrafficPeriod(searchable);

  return matchGroups.flatMap((matchGroup, index) => {
    const match = selectBestTrafficTextDateSetMatch(matchGroup);
    const line = getTrafficTextSourceLine(source, match.index);
    const nextGroup = matchGroups[index + 1];
    const sectionStart =
      index === 0
        ? 0
        : Math.min(
            ...matchGroup.map(
              (candidate) => getTrafficTextSourceLine(source, candidate.index).start,
            ),
          );
    const sectionEnd = nextGroup
      ? Math.min(...nextGroup.map((candidate) => candidate.index))
      : source.length;
    const sourceText = source.slice(sectionStart, sectionEnd);
    const rawText = source.slice(match.index, match.index + match.length);
    let period: TrafficPeriod | undefined;
    let start: Date | undefined;
    let end: Date | undefined;

    if (match.kind === "range" || match.kind === "single") {
      const parsedPeriod = createTrafficTextPeriod({
        disruption,
        endDayText: match.endDayText ?? "",
        endMonthKey: match.endMonthKey ?? "",
        endYearText: match.endYearText,
        now,
        startDayText: match.startDayText ?? "",
        startMonthKey: match.startMonthKey ?? "",
        startYearText: match.startYearText,
      });
      if (!parsedPeriod) return [];

      start = parsedPeriod.begin;
      end = parsedPeriod.end;
      period = {
        begin: start.toISOString(),
        end: end.toISOString(),
      };
    } else if (match.kind === "until") {
      const parsedPeriod = createInclusiveTrafficEndPeriod({
        disruption,
        endDayText: match.endDayText ?? "",
        endMonthKey: match.endMonthKey ?? "",
        endYearText: match.endYearText,
        now,
      });
      if (!parsedPeriod) return [];

      end = parsedPeriod.end;
      period = {
        begin: parsedPeriod.begin.toISOString(),
        end: end.toISOString(),
      };
    }

    return [
      {
        id: createTrafficTextDateSetId(match, period, index),
        kind: match.kind,
        period,
        start,
        end,
        endLabel: match.endLabel,
        explicitStart: match.kind === "range" || match.kind === "single",
        evening,
        titleHint: getTrafficTextDateSetTitleHint(source, matchGroup),
        rawText,
        sourceLine: line.text,
        sourceText,
      },
    ];
  });
}
export function getTrafficDisruptionEffectivePeriods(
  disruption: TrafficDisruption,
  now = Date.now(),
): {
  periods: TrafficPeriod[];
  textPeriods: TrafficPeriod[];
  dateSets: TrafficTextDateSet[];
} {
  const dateSets = getTrafficDisruptionTextDateSets(disruption, now);
  const textPeriods = dateSets.flatMap((dateSet) => (dateSet.period ? [dateSet.period] : []));
  const searchable = normalizeTrafficText(
    [disruption.title, disruption.message, disruption.motif]
      .filter((value): value is string => Boolean(value))
      .join(" "),
  )
    .replace(/[’']/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const canUseTextPeriods =
    textPeriods.length > 0 &&
    !(hasScheduledTimeRestriction(searchable) && !isFullDayTrafficText(searchable));

  return {
    periods: canUseTextPeriods ? textPeriods : disruption.applicationPeriods,
    textPeriods: canUseTextPeriods ? textPeriods : [],
    dateSets,
  };
}

function extractTrafficTextDateSetMatches(text: string): TrafficTextDateSetMatch[] {
  const matches = [
    ...extractNamedTrafficDateSetMatches(text),
    ...extractSameMonthTrafficDateSetMatches(text),
    ...extractNumericTrafficDateSetMatches(text),
    ...extractUntilTrafficDateSetMatches(text),
    ...extractSingleTrafficDateSetMatches(text),
    ...extractEstimatedEndTrafficDateSetMatches(text),
  ].sort((left, right) => left.index - right.index);
  const explicitPeriodEnds = new Set(
    matches
      .filter((match) => match.kind === "range" || match.kind === "single")
      .map(getTrafficTextDateSetEndKey),
  );

  return matches.filter(
    (match) =>
      match.kind !== "until" || !explicitPeriodEnds.has(getTrafficTextDateSetEndKey(match)),
  );
}

function groupTrafficTextDateSetMatches(
  matches: TrafficTextDateSetMatch[],
): TrafficTextDateSetMatch[][] {
  const groups = new Map<string, TrafficTextDateSetMatch[]>();

  matches.forEach((match) => {
    const key = getTrafficTextDateSetMatchKey(match);
    const group = groups.get(key);

    if (group) {
      group.push(match);
    } else {
      groups.set(key, [match]);
    }
  });

  return Array.from(groups.values()).sort((left, right) => left[0].index - right[0].index);
}

function getTrafficTextDateSetMatchKey(match: TrafficTextDateSetMatch): string {
  return [
    match.kind,
    normalizeTrafficTextDateSetDay(match.startDayText),
    match.startMonthKey ?? "",
    normalizeTrafficTextDateSetDay(match.endDayText),
    match.endMonthKey ?? "",
    match.endLabel ?? "",
  ].join("|");
}

function getTrafficTextDateSetEndKey(match: TrafficTextDateSetMatch): string {
  return [normalizeTrafficTextDateSetDay(match.endDayText), match.endMonthKey ?? ""].join("|");
}

function normalizeTrafficTextDateSetDay(value?: string): string {
  if (!value) return "";

  const day = Number.parseInt(value, 10);
  return Number.isFinite(day) ? String(day) : value;
}

function selectBestTrafficTextDateSetMatch(
  matches: TrafficTextDateSetMatch[],
): TrafficTextDateSetMatch {
  return [...matches].sort((left, right) => {
    const leftScore = Number(Boolean(left.startYearText)) + Number(Boolean(left.endYearText));
    const rightScore = Number(Boolean(right.startYearText)) + Number(Boolean(right.endYearText));

    return rightScore - leftScore || left.index - right.index;
  })[0];
}

export function getTrafficTitleWithoutLinePrefix(value: string): string {
  const compact = value.replace(/\s+/gu, " ").trim();
  const withoutLine = compact
    .replace(
      /^(?:la\s+)?ligne\s+[a-z0-9-]+\s+(?:est\s+)?(?:déviée|interrompue|perturbée)\s*:\s*/iu,
      "",
    )
    .replace(
      /^(?:(?:rer|m[eé]tro|tramway|ligne|transilien|bus)\s+[a-z0-9-]+)\s*:\s*/iu,
      "",
    )
    .trim();
  const title = withoutLine || compact;

  return title ? title.charAt(0).toLocaleUpperCase("fr-FR") + title.slice(1) : title;
}
function getTrafficTextDateSetTitleHint(
  source: string,
  matches: TrafficTextDateSetMatch[],
): string | undefined {
  return matches
    .flatMap((match) => {
      const line = getTrafficTextSourceLine(source, match.index);
      const rawPrefix = line.text
        .slice(0, Math.max(0, match.index - line.start))
        .replace(/^\s*[-–—•]\s*/u, "")
        .replace(/^\s*(?:dates?|periode|période)\s*:\s*/iu, "")
        .replace(/\b(?:du|de)\s*$/iu, "")
        .replace(
          /(?:^|\s)(?:du\s+)?\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\s*(?:au|a|[-–])\s*\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\s*(?:et)?\s*$/iu,
          "",
        )
        .replace(/\b(?:sauf|excepte|excepté)\s*$/iu, "")
        .replace(/\bdans\s+les?\s+2\s+sens\s*$/iu, "")
        .replace(/[\s:;,–—-]+$/gu, "")
        .replace(/\s+/gu, " ")
        .trim();
      const rawNormalized = normalizeTrafficText(rawPrefix);
      const transportSpecific = /\b(?:rer|metro|tramway|ligne|transilien|bus)\b/u.test(
        rawNormalized,
      );
      const prefix = getTrafficTitleWithoutLinePrefix(rawPrefix);
      const normalized = normalizeTrafficText(prefix);
      const isGeneric =
        /^(?:attention|important|a noter|dates?|periode|travaux|information trafic|trafic (?:interrompu|perturbe)|arret(?:s)? non desservi(?:s)?)$/u.test(
          normalized,
        );
      const containsAnnouncementMetadata =
        /\b(?:dates?|periode|rappel)\s*:/u.test(rawNormalized) ||
        /^(?:reprise|jusqu|du|date|a partir)\b/u.test(normalized);
      const suffixHint = getTrafficTextDateSetSuffixHint(line, match);
      const title = isGeneric ? suffixHint : prefix;

      if (!title || title.length > 130 || containsAnnouncementMetadata) {
        return [];
      }

      return [
        {
          title,
          score: Number(transportSpecific) * 100 + Math.min(title.length, 80),
        },
      ];
    })
    .sort((left, right) => right.score - left.score)
    .at(0)?.title;
}

function getTrafficTextDateSetSuffixHint(
  line: { start: number; text: string },
  match: TrafficTextDateSetMatch,
): string | undefined {
  const relativeEnd = match.index - line.start + match.length;
  const suffix = line.text
    .slice(relativeEnd)
    .replace(/^\s*[:;,–—-]?\s*/u, "")
    .split(/\s*[:;]\s*/u, 1)[0]
    .replace(/[.!,\s]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  const normalized = normalizeTrafficText(suffix);

  if (
    suffix.length < 4 ||
    suffix.length > 100 ||
    /^(?:dates?|periode|attention|important|a noter)$/u.test(normalized)
  ) {
    return undefined;
  }

  return getTrafficTitleWithoutLinePrefix(suffix);
}

function extractNamedTrafficDateSetMatches(text: string): TrafficTextDateSetMatch[] {
  const pattern = new RegExp(
    "\\b(?:dates?\\s*:\\s*)?(?:du|de)\\s+" +
      TRAFFIC_TEXT_WEEKDAY_PATTERN +
      "(\\d{1,2})(?:er)?\\s+(" +
      TRAFFIC_TEXT_MONTH_PATTERN +
      ")(?:\\s+(\\d{4}))?\\s+(?:au|a|jusqu\\s+au)\\s+" +
      TRAFFIC_TEXT_WEEKDAY_PATTERN +
      "(\\d{1,2})(?:er)?\\s+(" +
      TRAFFIC_TEXT_MONTH_PATTERN +
      ")(?:\\s+(\\d{4}))?\\b",
    "gu",
  );

  return Array.from(text.matchAll(pattern)).flatMap((match) =>
    match.index === undefined
      ? []
      : [
          {
            kind: "range" as const,
            index: match.index,
            length: match[0].length,
            startDayText: match[1],
            startMonthKey: match[2],
            startYearText: match[3],
            endDayText: match[4],
            endMonthKey: match[5],
            endYearText: match[6],
          },
        ],
  );
}

function extractSameMonthTrafficDateSetMatches(text: string): TrafficTextDateSetMatch[] {
  const pattern = new RegExp(
    "\\b(?:dates?\\s*:\\s*)?(?:du|de)\\s+" +
      TRAFFIC_TEXT_WEEKDAY_PATTERN +
      "(\\d{1,2})(?:er)?\\s+(?:au|a|jusqu\\s+au)\\s+" +
      TRAFFIC_TEXT_WEEKDAY_PATTERN +
      "(\\d{1,2})(?:er)?\\s+(" +
      TRAFFIC_TEXT_MONTH_PATTERN +
      ")(?:\\s+(\\d{4}))?\\b",
    "gu",
  );

  return Array.from(text.matchAll(pattern)).flatMap((match) =>
    match.index === undefined
      ? []
      : [
          {
            kind: "range" as const,
            index: match.index,
            length: match[0].length,
            startDayText: match[1],
            startMonthKey: match[3],
            startYearText: match[4],
            endDayText: match[2],
            endMonthKey: match[3],
            endYearText: match[4],
          },
        ],
  );
}

function extractNumericTrafficDateSetMatches(text: string): TrafficTextDateSetMatch[] {
  const fullRangePatterns = [
    /\b(?:dates?\s*:\s*)?(?:du|de)\s+(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s*(?:au|a|[-–])\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/gu,
    /\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s*(?:au|a|[-–])\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/gu,
  ];
  const fullRanges = fullRangePatterns.flatMap((pattern) =>
    Array.from(text.matchAll(pattern)).flatMap((match) => {
      const startMonth = normalizeNumericTrafficMonth(match[2]);
      const endMonth = normalizeNumericTrafficMonth(match[5]);

      return match.index === undefined || startMonth === undefined || endMonth === undefined
        ? []
        : [
            {
              kind: "range" as const,
              index: match.index,
              length: match[0].length,
              startDayText: match[1],
              startMonthKey: startMonth,
              startYearText: match[3],
              endDayText: match[4],
              endMonthKey: endMonth,
              endYearText: match[6],
            },
          ];
    }),
  );
  const compactSameMonthPattern =
    /(?<![\d./])\b(\d{1,2})\s*[-–]\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/gu;
  const compactSameMonth = Array.from(text.matchAll(compactSameMonthPattern)).flatMap((match) => {
    const month = normalizeNumericTrafficMonth(match[3]);

    return match.index === undefined || month === undefined
      ? []
      : [
          {
            kind: "range" as const,
            index: match.index,
            length: match[0].length,
            startDayText: match[1],
            startMonthKey: month,
            startYearText: match[4],
            endDayText: match[2],
            endMonthKey: month,
            endYearText: match[4],
          },
        ];
  });

  return [...fullRanges, ...compactSameMonth];
}
function extractUntilTrafficDateSetMatches(text: string): TrafficTextDateSetMatch[] {
  const namedPattern = new RegExp(
    "\\bjusqu\\s+au\\s+" +
      TRAFFIC_TEXT_WEEKDAY_PATTERN +
      "(\\d{1,2})(?:er)?\\s+(" +
      TRAFFIC_TEXT_MONTH_PATTERN +
      ")(?:\\s+(\\d{4}))?(?:\\s+inclus)?\\b",
    "gu",
  );
  const numericPattern =
    /\bjusqu\s+au\s+(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?(?:\s+inclus)?\b/gu;
  const named = Array.from(text.matchAll(namedPattern)).flatMap((match) =>
    match.index === undefined
      ? []
      : [
          {
            kind: "until" as const,
            index: match.index,
            length: match[0].length,
            endDayText: match[1],
            endMonthKey: match[2],
            endYearText: match[3],
          },
        ],
  );
  const numeric = Array.from(text.matchAll(numericPattern)).flatMap((match) => {
    const month = normalizeNumericTrafficMonth(match[2]);

    return match.index === undefined || month === undefined
      ? []
      : [
          {
            kind: "until" as const,
            index: match.index,
            length: match[0].length,
            endDayText: match[1],
            endMonthKey: month,
            endYearText: match[3],
          },
        ];
  });

  const estimatedRestartPattern = new RegExp(
    "\\breprise(?:\\s+des\\s+circulations)?\\s+" +
      "(?:estimee|prevue|envisagee)\\s*:?\\s*" +
      TRAFFIC_TEXT_WEEKDAY_PATTERN +
      "(\\d{1,2})(?:er)?\\s+(" +
      TRAFFIC_TEXT_MONTH_PATTERN +
      ")(?:\\s+(\\d{4}))?\\b",
    "gu",
  );
  const estimatedRestarts = Array.from(text.matchAll(estimatedRestartPattern)).flatMap((match) =>
    match.index === undefined
      ? []
      : [
          {
            kind: "until" as const,
            index: match.index,
            length: match[0].length,
            endDayText: match[1],
            endMonthKey: match[2],
            endYearText: match[3],
          },
        ],
  );

  return [...named, ...numeric, ...estimatedRestarts];
}

function extractSingleTrafficDateSetMatches(text: string): TrafficTextDateSetMatch[] {
  const pattern = new RegExp(
    "\\b(?:date\\s*:?\\s*(?:le\\s+)?|le\\s+)" +
      TRAFFIC_TEXT_WEEKDAY_PATTERN +
      "(\\d{1,2})(?:er)?\\s+(" +
      TRAFFIC_TEXT_MONTH_PATTERN +
      ")(?:\\s+(\\d{4}))?\\b",
    "gu",
  );

  return Array.from(text.matchAll(pattern)).flatMap((match) =>
    match.index === undefined
      ? []
      : [
          {
            kind: "single" as const,
            index: match.index,
            length: match[0].length,
            startDayText: match[1],
            startMonthKey: match[2],
            startYearText: match[3],
            endDayText: match[1],
            endMonthKey: match[2],
            endYearText: match[3],
          },
        ],
  );
}

function extractEstimatedEndTrafficDateSetMatches(text: string): TrafficTextDateSetMatch[] {
  const pattern = /\bfin\s+(?:de\s+l\s+|d\s+)?ete\s+(\d{4})\b/gu;

  return Array.from(text.matchAll(pattern)).flatMap((match) => {
    if (
      match.index === undefined ||
      !/\breprise\b/u.test(text.slice(Math.max(0, match.index - 120), match.index))
    ) {
      return [];
    }

    return [
      {
        kind: "estimated-end" as const,
        index: match.index,
        length: match[0].length,
        endLabel: "fin d’été " + match[1],
      },
    ];
  });
}

function createInclusiveTrafficEndPeriod({
  disruption,
  endDayText,
  endMonthKey,
  endYearText,
  now,
}: {
  disruption: TrafficDisruption;
  endDayText: string;
  endMonthKey: string;
  endYearText?: string;
  now: number;
}): { begin: Date; end: Date } | undefined {
  const endDay = Number.parseInt(endDayText, 10);
  const endMonth = TRAFFIC_TEXT_MONTH_INDEXES[endMonthKey];

  if (!Number.isFinite(endDay) || endMonth === undefined) {
    return undefined;
  }

  const anchorYear = getTrafficTextYearAnchor(disruption, now);
  const periods = getTrafficTextYearCandidates({
    anchorYear,
    disruption,
    endYearText,
    now,
  })
    .map((endYearCandidate) => {
      const endYear = normalizeTrafficTextYear(endYearText) ?? endYearCandidate;
      const endDayStart = createLocalTrafficDate(endYear, endMonth, endDay);
      if (!endDayStart) return undefined;

      const end = new Date(endDayStart);
      end.setHours(23, 59, 59, 999);
      const begin = disruption.applicationPeriods
        .map((applicationPeriod) => parseTrafficDate(applicationPeriod.begin))
        .filter((date): date is Date => Boolean(date))
        .filter((date) => date.getTime() <= end.getTime())
        .sort((left, right) => left.getTime() - right.getTime())
        .at(0);

      return begin && end.getTime() > begin.getTime() ? { begin, end } : undefined;
    })
    .filter((period): period is { begin: Date; end: Date } => period !== undefined);
  const matchingTechnicalPeriod = periods.find((period) =>
    trafficTextPeriodOverlapsApplicationPeriod(period, disruption.applicationPeriods),
  );

  return matchingTechnicalPeriod ?? periods.at(0);
}

function normalizeNumericTrafficMonth(value: string): string | undefined {
  const monthIndex = Number.parseInt(value, 10) - 1;

  return Object.entries(TRAFFIC_TEXT_MONTH_INDEXES).find(([, index]) => index === monthIndex)?.[0];
}

function hasEveningTrafficPeriod(text: string): boolean {
  return /(?:^|\n)\s*periode\s*:[^\n]*\bsoirees?\b/u.test(text);
}

function getTrafficTextSourceLine(source: string, index: number): { start: number; text: string } {
  const start = Math.max(0, source.lastIndexOf("\n", index - 1) + 1);
  const lineEnd = source.indexOf("\n", index);
  const end = lineEnd < 0 ? source.length : lineEnd;

  return { start, text: source.slice(start, end) };
}

function createTrafficTextDateSetId(
  match: TrafficTextDateSetMatch,
  period: TrafficPeriod | undefined,
  index: number,
): string {
  return [match.kind, period?.begin ?? "", period?.end ?? "", match.endLabel ?? "", index].join(
    ":",
  );
}
function createTrafficPeriodState(period: TrafficPeriod, now: number): TrafficPeriodState {
  const begin = parseTrafficDate(period.begin)?.getTime();
  const end = parseTrafficDate(period.end)?.getTime();

  return {
    begin,
    end,
    period,
    timing: getTrafficPeriodTiming(period, now),
  };
}

function getTrafficPeriodTiming(period: TrafficPeriod, now: number): TrafficPeriodTiming {
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
    .filter((period): period is { begin: Date; end: Date } => period !== undefined);
  const matchingTechnicalPeriod = periods.find((period) =>
    trafficTextPeriodOverlapsApplicationPeriod(period, disruption.applicationPeriods),
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

    return textPeriod.begin.getTime() <= periodEnd && textPeriod.end.getTime() >= periodBegin;
  });
}

function getTrafficTextYearAnchor(disruption: TrafficDisruption, now: number): number {
  return (
    disruption.applicationPeriods
      .flatMap((period) => [period.begin, period.end])
      .map((value) => parseTrafficDate(value))
      .filter((date): date is Date => Boolean(date))
      .sort((left, right) => left.getTime() - right.getTime())
      .at(0)
      ?.getFullYear() ?? new Date(now).getFullYear()
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

function createLocalTrafficDate(year: number, month: number, day: number): Date | undefined {
  const date = new Date(year, month, day);

  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date
    : undefined;
}

function isFullDayTrafficText(text: string): boolean {
  return /\b(?:toute\s+la\s+journee|journee\s+entiere)\b/u.test(text);
}

function hasScheduledTimeRestriction(text: string): boolean {
  return /\b(?:a partir de|des)\s+\d{1,2}\s*h\s*\d{0,2}\b/u.test(text);
}

function getBestCurrentPeriod(states: TrafficPeriodState[]): TrafficPeriod | undefined {
  return states
    .filter((state) => state.timing === "current")
    .sort((left, right) => compareDefinedDesc(left.begin, right.begin))
    .at(0)?.period;
}

function getBestUpcomingPeriod(states: TrafficPeriodState[]): TrafficPeriod | undefined {
  return states
    .filter((state) => state.timing === "upcoming")
    .sort((left, right) => compareDefinedAsc(left.begin, right.begin))
    .at(0)?.period;
}

function getBestExpiredPeriod(states: TrafficPeriodState[]): TrafficPeriod | undefined {
  return states
    .filter((state) => state.timing === "expired")
    .sort((left, right) => compareDefinedDesc(left.end, right.end))
    .at(0)?.period;
}

function compareDefinedAsc(left: number | undefined, right: number | undefined): number {
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

function compareDefinedDesc(left: number | undefined, right: number | undefined): number {
  return compareDefinedAsc(right, left);
}
