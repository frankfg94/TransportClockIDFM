import type { TransferLineOption } from "../../types/transit";
import { getTrafficDisruptionRestartClockTime } from "../traffic/trafficTextTimes";
import {
  getDisruptionTone,
  normalizeTrafficText,
} from "../traffic/trafficPresentation";
import type { TrafficDisruption } from "../traffic/types";
import {
  getTrafficDisruptionDisplayPeriod,
  parseTrafficDate,
} from "../traffic/trafficTiming";
import { normalizePatternStationName } from "./stationKeys";

export type PatternTrafficImpactKind = "interruption" | "disturbance";

export interface PatternTrafficStation {
  key: string;
  label: string;
  transfers?: TransferLineOption[];
}

export interface PatternTrafficEdge {
  id?: string;
  source: string;
  target: string;
}

export interface PatternTrafficImpact {
  kind: PatternTrafficImpactKind;
  disruption: TrafficDisruption;
  restartTimeLabel?: string;
  endDateLabel?: string;
  endDateLabelSource?: "text" | "application-period";
  replacementBus: boolean;
}

export interface PatternTrafficImpactSegment extends PatternTrafficImpact {
  id: string;
  stationKeys: string[];
  edgeKeys: string[];
}

export interface PatternTrafficImpactAnalysis {
  segments: PatternTrafficImpactSegment[];
  stationImpacts: Record<string, PatternTrafficImpact>;
  edgeImpacts: Record<string, PatternTrafficImpact>;
}

interface ParsedTrafficDisruption {
  kind: PatternTrafficImpactKind | undefined;
  sections: ParsedTrafficSection[];
  restartTimeLabel?: string;
  endDateLabel?: string;
  endDateLabelSource?: "text" | "application-period";
  replacementBus: boolean;
  disturbsRestOfLine: boolean;
}

interface ParsedTrafficSection {
  from: string;
  to: string;
  kind?: PatternTrafficImpactKind;
}

interface TrafficSectionMatch extends ParsedTrafficSection {
  index: number;
  endIndex: number;
  requiresTrafficContext: boolean;
}

const DISTURBANCE_KEYWORDS = [
  "trafic perturbe",
  "trafic perturb",
  "perturbe",
  "perturb",
  "perturbation",
  "ralenti",
  "retard",
  "retards",
  "service reduit",
  "service adapte",
  "frequence reduite",
  "temps d attente allonge",
  "temps d attente allonges",
  "disturbed",
  "reduced service",
];

const NON_SERVED_INTERRUPTION_KEYWORDS = ["non desservi", "pas desservi"];

const INTERRUPTION_KEYWORDS = [
  "trafic interrompu",
  "interrompu",
  "interruption",
  "aucun train",
  "aucune circulation",
  "ne circule pas",
  "ne circulent pas",
  "trafic suspendu",
  "service suspendu",
  "fermeture",
  ...NON_SERVED_INTERRUPTION_KEYWORDS,
  "no service",
  "no-service",
];

const REPLACEMENT_BUS_KEYWORDS = [
  "bus de remplacement",
  "bus relais",
  "bus de substitution",
];
const TRAFFIC_END_MONTH_PATTERN =
  "janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre";
const TRAFFIC_END_WEEKDAY_PATTERN =
  String.raw`(?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+)?`;
const TRAFFIC_END_MONTH_LABELS: Record<string, string> = {
  janvier: "janvier",
  fevrier: "février",
  mars: "mars",
  avril: "avril",
  mai: "mai",
  juin: "juin",
  juillet: "juillet",
  aout: "août",
  septembre: "septembre",
  octobre: "octobre",
  novembre: "novembre",
  decembre: "décembre",
};
const TRAFFIC_END_MONTH_INDEXES: Record<string, number> = {
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

const SECTION_END_PATTERN =
  String.raw`(?=(?:\s+(?:(?:et|ou)\s+entre\b|et\s+(?:perturb|ralenti|interrompu|suspendu)|sur\s+le\s+reste|en\s+(?:raison|r\u00e9percussion)|suite|a\s+la\s+suite|pour\s+cause|toute\s+la|tous\s+les|dans\s+les?\s+(?:2|deux)\s+sens|du\s+\d|jusqu|reprise|veuillez)|[.;,\n]|$))`;
const BIDIRECTIONAL_SECTION_END_PATTERN =
  String.raw`(?=(?:\s+(?:periode|p[ée]riode|dates?|arr[êe]t|motif|travaux|incident)|[.;,\n]|$))`;
const FUZZY_STATION_MATCH_MIN_SCORE = 0.72;
const FUZZY_STATION_MATCH_MIN_MARGIN = 0.08;
const STATION_MATCH_IGNORED_TOKENS = new Set([
  "gare",
  "metro",
  "porte",
  "portes",
  "prte",
  "pte",
  "rer",
  "saint",
  "station",
  "train",
  "tram",
]);

export function analyzeTrafficImpacts(
  disruptions: TrafficDisruption[],
  stations: PatternTrafficStation[],
  edges: PatternTrafficEdge[],
): PatternTrafficImpactAnalysis {
  const analysis: PatternTrafficImpactAnalysis = {
    segments: [],
    stationImpacts: {},
    edgeImpacts: {},
  };
  const edgeKeys = edges.map(getPatternTrafficEdgeKey);

  disruptions.forEach((disruption) => {
    const parsed = parseTrafficDisruption(disruption);

    if (!parsed.kind && parsed.sections.length === 0) {
      return;
    }

    const baseImpact = createImpact(disruption, parsed, parsed.kind);
    const resolvedSegments = createResolvedSegments({
      disruption,
      parsed,
      stations,
      edges,
      kind: parsed.kind ?? "disturbance",
    });
    const interruptionSegments = resolvedSegments.filter(
      (segment) => segment.kind === "interruption",
    );
    const interruptionEdgeKeys = new Set(
      interruptionSegments.flatMap((segment) => segment.edgeKeys),
    );
    const interruptionStationKeys = new Set(
      interruptionSegments.flatMap((segment) => segment.stationKeys),
    );

    resolvedSegments.forEach((segment) => {
      applySegment(analysis, segment);
    });

    if (parsed.disturbsRestOfLine) {
      const restEdgeKeys = edgeKeys.filter(
        (edgeKey) => !interruptionEdgeKeys.has(edgeKey),
      );
      const restStationKeys = getStationKeysForEdges(restEdgeKeys, edges).filter(
        (stationKey) => !interruptionStationKeys.has(stationKey),
      );

      if (restEdgeKeys.length > 0 || restStationKeys.length > 0) {
        applySegment(analysis, {
          ...baseImpact,
          id: `${disruption.id}:rest-of-line`,
          kind: "disturbance",
          edgeKeys: restEdgeKeys,
          stationKeys: restStationKeys,
        });
      }
    }
  });

  return analysis;
}

export function getInterruptedStations(
  analysis: PatternTrafficImpactAnalysis,
): string[] {
  return Object.entries(analysis.stationImpacts)
    .filter(([, impact]) => impact.kind === "interruption")
    .map(([stationKey]) => stationKey);
}

export function getDisturbedStations(
  analysis: PatternTrafficImpactAnalysis,
): string[] {
  return Object.entries(analysis.stationImpacts)
    .filter(([, impact]) => impact.kind === "disturbance")
    .map(([stationKey]) => stationKey);
}

export function getPatternTrafficEdgeKey(edge: PatternTrafficEdge): string {
  return [edge.source, edge.target].sort().join("--");
}

function parseTrafficDisruption(
  disruption: TrafficDisruption,
): ParsedTrafficDisruption {
  const text = getDisruptionText(disruption);
  const searchable = normalizeSearchText(text);
  const textIntervalEndDateLabel = extractTextTrafficIntervalEndDateLabel(text);
  const applicationPeriodEndDateLabel =
    extractApplicationPeriodEndDateLabel(disruption);
  const textEndDateLabel = extractTextTrafficEndDateLabel(text);
  const endDateLabel =
    textIntervalEndDateLabel ?? applicationPeriodEndDateLabel ?? textEndDateLabel;
  const isInterruption =
    getDisruptionTone(disruption) === "red" ||
    INTERRUPTION_KEYWORDS.some((keyword) => searchable.includes(keyword));
  const isDisturbance = DISTURBANCE_KEYWORDS.some((keyword) =>
    searchable.includes(keyword),
  );

  return {
    kind: isInterruption
      ? "interruption"
      : isDisturbance
        ? "disturbance"
        : undefined,
    sections: extractTrafficSections(text),
    restartTimeLabel: getTrafficDisruptionRestartClockTime(disruption)?.label,
    endDateLabel,
    endDateLabelSource: textIntervalEndDateLabel
      ? "text"
      : applicationPeriodEndDateLabel
        ? "application-period"
        : textEndDateLabel
          ? "text"
          : undefined,
    replacementBus: hasReplacementBus(searchable),
    disturbsRestOfLine:
      isDisturbance &&
      /\b(?:reste|restant|restante)\s+de\s+la\s+ligne\b/u.test(searchable),
  };
}

function createResolvedSegments({
  disruption,
  parsed,
  stations,
  edges,
  kind,
}: {
  disruption: TrafficDisruption;
  parsed: ParsedTrafficDisruption;
  stations: PatternTrafficStation[];
  edges: PatternTrafficEdge[];
  kind: PatternTrafficImpactKind;
}): PatternTrafficImpactSegment[] {
  const segments = parsed.sections
    .map((section, index) => {
      const segmentKind = section.kind ?? kind;
      const source = resolveStationKey(section.from, stations, {
        allowFuzzy: segmentKind === "interruption",
      });
      const target = resolveStationKey(section.to, stations, {
        allowFuzzy: segmentKind === "interruption",
      });

      if (!source || !target) {
        return undefined;
      }

      return createSegmentFromEndpoints({
        disruption,
        parsed,
        edges,
        kind: segmentKind,
        source,
        target,
        index,
      });
    })
    .filter(
      (segment): segment is PatternTrafficImpactSegment => Boolean(segment),
    );

  if (segments.length > 0) {
    return segments;
  }

  const nonServedStationKeys =
    kind === "interruption"
      ? extractNonServedStationKeysFromText(
          getDisruptionText(disruption),
          stations,
        )
      : [];

  if (nonServedStationKeys.length > 0) {
    return createStationOnlySegments({
      disruption,
      parsed,
      kind,
      stationKeys: nonServedStationKeys,
      idPrefix: "non-served-station",
    });
  }

  const impactedStationKeys = disruption.impactedStopNames
    .map((name) =>
      resolveStationKey(name, stations, {
        allowFuzzy: kind === "interruption",
      }),
    )
    .filter((key): key is string => Boolean(key));

  if (impactedStationKeys.length >= 2) {
    return [
      createSegmentFromEndpoints({
        disruption,
        parsed,
        edges,
        kind,
        source: impactedStationKeys[0],
        target: impactedStationKeys[impactedStationKeys.length - 1],
        index: 0,
      }),
    ];
  }

  if (impactedStationKeys.length === 1) {
    return createStationOnlySegments({
      disruption,
      parsed,
      kind,
      stationKeys: impactedStationKeys,
      idPrefix: "station",
    });
  }

  return [];
}

function createStationOnlySegments({
  disruption,
  parsed,
  kind,
  stationKeys,
  idPrefix,
}: {
  disruption: TrafficDisruption;
  parsed: ParsedTrafficDisruption;
  kind: PatternTrafficImpactKind;
  stationKeys: string[];
  idPrefix: string;
}): PatternTrafficImpactSegment[] {
  return Array.from(new Set(stationKeys)).map((stationKey) => ({
    ...createImpact(disruption, parsed, kind),
    id: `${disruption.id}:${idPrefix}:${stationKey}`,
    stationKeys: [stationKey],
    edgeKeys: [],
  }));
}

function createSegmentFromEndpoints({
  disruption,
  parsed,
  edges,
  kind,
  source,
  target,
  index,
}: {
  disruption: TrafficDisruption;
  parsed: ParsedTrafficDisruption;
  edges: PatternTrafficEdge[];
  kind: PatternTrafficImpactKind;
  source: string;
  target: string;
  index: number;
}): PatternTrafficImpactSegment {
  const stationPath = findStationPath(source, target, edges);
  const edgeKeys = getEdgeKeysForStationPath(stationPath);
  const stationKeys =
    kind === "interruption" && stationPath.length > 1
      ? stationPath.slice(1, -1)
      : stationPath;

  return {
    ...createImpact(disruption, parsed, kind),
    id: `${disruption.id}:section:${index}`,
    stationKeys,
    edgeKeys,
  };
}

function createImpact(
  disruption: TrafficDisruption,
  parsed: ParsedTrafficDisruption,
  fallbackKind: PatternTrafficImpactKind | undefined,
): PatternTrafficImpact {
  return {
    kind: fallbackKind ?? parsed.kind ?? "disturbance",
    disruption,
    restartTimeLabel: parsed.restartTimeLabel,
    endDateLabel: parsed.endDateLabel,
    endDateLabelSource: parsed.endDateLabelSource,
    replacementBus: parsed.replacementBus,
  };
}

function applySegment(
  analysis: PatternTrafficImpactAnalysis,
  segment: PatternTrafficImpactSegment,
): void {
  analysis.segments.push(segment);

  segment.stationKeys.forEach((stationKey) => {
    analysis.stationImpacts[stationKey] = chooseStrongerImpact(
      analysis.stationImpacts[stationKey],
      segment,
    );
  });

  segment.edgeKeys.forEach((edgeKey) => {
    analysis.edgeImpacts[edgeKey] = chooseStrongerImpact(
      analysis.edgeImpacts[edgeKey],
      segment,
    );
  });
}

function chooseStrongerImpact(
  existing: PatternTrafficImpact | undefined,
  next: PatternTrafficImpact,
): PatternTrafficImpact {
  if (!existing || getImpactPriority(next) > getImpactPriority(existing)) {
    return next;
  }

  return existing;
}

function getImpactPriority(impact: PatternTrafficImpact): number {
  return impact.kind === "interruption" ? 2 : 1;
}

function hasReplacementBus(searchable: string): boolean {
  return (
    REPLACEMENT_BUS_KEYWORDS.some((keyword) => searchable.includes(keyword)) ||
    /\bnavettes?\b(?!\s+ferroviaires?\b)/u.test(searchable)
  );
}

function extractTrafficSections(text: string): ParsedTrafficSection[] {
  const sections: ParsedTrafficSection[] = [];
  const matches: TrafficSectionMatch[] = [];
  const regexes = [
    new RegExp(
      String.raw`(?:^|[\n:])\s*([^:\n]+?)\s*(?:<->|\u2194|\u21c4)\s+(.+?)${BIDIRECTIONAL_SECTION_END_PATTERN}`,
      "giu",
    ),
    new RegExp(
      String.raw`\bentre\s+(.+?)\s+et\s+(.+?)${SECTION_END_PATTERN}`,
      "giu",
    ),
    new RegExp(
      String.raw`\bdepuis\s+(.+?)\s+jusqu(?:'|’)?[aà]\s+(.+?)${SECTION_END_PATTERN}`,
      "giu",
    ),
    new RegExp(
      String.raw`\bde\s+(.+?)\s+(?:a|à|vers|jusqu(?:'|’)?[aà])\s+(.+?)${SECTION_END_PATTERN}`,
      "giu",
    ),
  ];

  regexes.forEach((regex, regexIndex) => {
    for (const match of text.matchAll(regex)) {
      const index = match.index ?? 0;

      matches.push({
        index,
        endIndex: index + match[0].length,
        from: match[1],
        to: match[2],
        kind: inferTrafficSectionKind(text, index, match[0]),
        requiresTrafficContext: regexIndex > 0,
      });
    }
  });

  matches
    .sort((left, right) => left.index - right.index)
    .reduce<TrafficSectionMatch | undefined>((previousMatch, match) => {
      const inheritedKind =
        previousMatch && canInheritTrafficSectionKind(text, previousMatch, match)
          ? previousMatch.kind
          : undefined;
      const kind = match.kind ?? inheritedKind;

      if (!match.requiresTrafficContext || kind) {
        addTrafficSections(sections, match.from, match.to, kind);
      }

      return { ...match, kind };
    }, undefined);

  return sections;
}

function canInheritTrafficSectionKind(
  text: string,
  previousMatch: TrafficSectionMatch,
  match: TrafficSectionMatch,
): boolean {
  if (!previousMatch.kind || match.index <= previousMatch.endIndex) {
    return false;
  }

  const between = normalizeSearchText(
    text.slice(previousMatch.endIndex, match.index),
  );

  return (
    between.length <= 40 &&
    /\b(?:et|ou)\b/u.test(between) &&
    !/[.;\n]/u.test(text.slice(previousMatch.endIndex, match.index))
  );
}

function addTrafficSections(
  sections: ParsedTrafficSection[],
  fromValue?: string,
  toValue?: string,
  kind?: PatternTrafficImpactKind,
): void {
  const fromOptions = splitSectionStationAlternatives(fromValue);
  const toOptions = splitSectionStationAlternatives(toValue);

  fromOptions.forEach((from) => {
    toOptions.forEach((to) => {
      if (!from || !to) {
        return;
      }

      const existing = findExistingSection(sections, from, to);

      if (existing) {
        existing.kind = chooseStrongerImpactKind(existing.kind, kind);
        return;
      }

      sections.push({ from, to, kind });
    });
  });
}

function splitSectionStationAlternatives(value?: string): string[] {
  const cleaned = cleanSectionStationLabel(value);

  if (!cleaned) {
    return [];
  }

  return cleaned
    .split(/\s*\/\s*/gu)
    .map(cleanSectionStationLabel)
    .filter((label): label is string => Boolean(label));
}

function findExistingSection(
  sections: ParsedTrafficSection[],
  from: string,
  to: string,
): ParsedTrafficSection | undefined {
  const nextKey = createSectionKey(from, to);

  return sections.find(
    (section) => createSectionKey(section.from, section.to) === nextKey,
  );
}

function chooseStrongerImpactKind(
  existing: PatternTrafficImpactKind | undefined,
  next: PatternTrafficImpactKind | undefined,
): PatternTrafficImpactKind | undefined {
  if (
    !existing ||
    (next && getImpactKindPriority(next) > getImpactKindPriority(existing))
  ) {
    return next;
  }

  return existing;
}

function getImpactKindPriority(kind: PatternTrafficImpactKind): number {
  return kind === "interruption" ? 2 : 1;
}

function inferTrafficSectionKind(
  text: string,
  matchIndex: number,
  rawMatch: string,
): PatternTrafficImpactKind | undefined {
  const contextStart = Math.max(
    findLastTrafficContextBoundary(text, matchIndex) + 1,
    matchIndex - 180,
    0,
  );
  const searchable = normalizeSearchText(
    `${text.slice(contextStart, matchIndex)} ${rawMatch.slice(0, 120)}`,
  );
  const interruptionIndex = getLastKeywordIndex(
    searchable,
    INTERRUPTION_KEYWORDS,
  );
  const disturbanceIndex = getLastKeywordIndex(
    searchable,
    DISTURBANCE_KEYWORDS,
  );

  if (interruptionIndex === -1 && disturbanceIndex === -1) {
    return undefined;
  }

  return interruptionIndex > disturbanceIndex ? "interruption" : "disturbance";
}

function findLastTrafficContextBoundary(text: string, index: number): number {
  return Math.max(
    text.lastIndexOf(".", index),
    text.lastIndexOf(";", index),
    text.lastIndexOf("\n", index),
  );
}

function getLastKeywordIndex(text: string, keywords: string[]): number {
  return Math.max(...keywords.map((keyword) => text.lastIndexOf(keyword)));
}

function createSectionKey(from: string, to: string): string {
  return [normalizePatternStationName(from), normalizePatternStationName(to)]
    .sort()
    .join("--");
}

function cleanSectionStationLabel(value?: string): string {
  return (value ?? "")
    .replace(/\s+/gu, " ")
    .replace(/\s+dans\s+les?\s+(?:2|deux)\s+sens\b.*$/giu, "")
    .replace(/\s+jusqu(?:'|’)?(?:a|à|au)\b.*$/giu, "")
    .replace(/\s+trafic\s+(?:interrompu|perturb[eé]|ralenti|suspendu)\b.*$/giu, "")
    .replace(/\s+(?:fortement\s+)?perturb[eé]\b.*$/giu, "")
    .replace(/\s+\d{1,2}\s*-\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/gu, "")
    .replace(/\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/gu, "")
    .replace(/^[\s:,-]+|[\s:,-]+$/gu, "")
    .trim();
}

function extractRestartTimeLabel(text: string): string | undefined {
  const normalized = normalizeTrafficText(text);
  const match = normalized.match(
    /(?:(?:reprise|retablissement|retour a la normale|fin)\s+(?:estimee|prevue)?\s*(?::|a|vers|pour)?\s*|jusqu(?:['’]\s*|\s*)a\s+)(minuit|midi|\d{1,2}(?::|h)\d{2}|\d{1,2}h)\b/u,
  );

  if (!match) {
    return undefined;
  }

  return formatRestartTimeLabel(match[1]);
}

function formatRestartTimeLabel(value: string): string {
  if (value === "minuit") {
    return "00:00";
  }

  if (value === "midi") {
    return "12:00";
  }

  const [hourText, minuteText = "00"] = value.replace("h", ":").split(":");
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return value;
  }

  return `${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}`;
}

function extractTextTrafficIntervalEndDateLabel(
  text: string,
): string | undefined {
  const searchable = normalizeTrafficText(text)
    .replace(/[â€™']/gu, " ")
    .replace(/\s+/gu, " ");
  const fullDayInclusive = isFullDayTextRange(searchable);
  const namedDateRangePattern = new RegExp(
    String.raw`\b(?:dates?\s*:?\s*)?(?:du|de)\s+${TRAFFIC_END_WEEKDAY_PATTERN}(\d{1,2})\s+(${TRAFFIC_END_MONTH_PATTERN})(?:\s+(\d{4}))?\s+(?:au|a)\s+${TRAFFIC_END_WEEKDAY_PATTERN}(\d{1,2})\s+(${TRAFFIC_END_MONTH_PATTERN})(?:\s+(\d{4}))?\b`,
    "u",
  );
  const namedDateRangeMatch = searchable.match(namedDateRangePattern);

  if (namedDateRangeMatch) {
    const [, , , , endDayText, endMonthKey, endYearText] =
      namedDateRangeMatch;
    const endDay = Number.parseInt(endDayText, 10);
    const endMonth = TRAFFIC_END_MONTH_LABELS[endMonthKey];

    if (fullDayInclusive) {
      return formatNextTrafficDateLabel({
        day: endDay,
        monthIndex: TRAFFIC_END_MONTH_INDEXES[endMonthKey],
        year: endYearText,
      });
    }

    return Number.isFinite(endDay) && endMonth
      ? formatTrafficEndDateParts({
          day: endDay,
          month: endMonth,
          year: endYearText,
        })
      : undefined;
  }

  const numericDateRangeMatch = searchable.match(
    /\b(?:dates?\s*:?\s*)?(?:du|de)\s+\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\s+(?:au|a)\s+(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/u,
  );

  if (!numericDateRangeMatch) {
    return undefined;
  }

  const [, endDayText, endMonthText, endYearText] = numericDateRangeMatch;
  const endDay = Number.parseInt(endDayText, 10);
  const endMonthIndex = Number.parseInt(endMonthText, 10) - 1;
  const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "long" });
  const endMonth =
    Number.isFinite(endMonthIndex) && endMonthIndex >= 0 && endMonthIndex < 12
      ? monthFormatter.format(new Date(2000, endMonthIndex, 1))
      : undefined;

  if (fullDayInclusive) {
    return formatNextTrafficDateLabel({
      day: endDay,
      monthIndex: endMonthIndex,
      year: endYearText,
    });
  }

  return Number.isFinite(endDay) && endMonth
    ? formatTrafficEndDateParts({
        day: endDay,
        month: endMonth,
        year: endYearText,
      })
    : undefined;
}

function isFullDayTextRange(searchable: string): boolean {
  return /\b(?:toute\s+la\s+journee|journee\s+entiere)\b/u.test(searchable);
}

function formatNextTrafficDateLabel({
  day,
  monthIndex,
  year,
}: {
  day: number;
  monthIndex: number | undefined;
  year?: string;
}): string | undefined {
  if (
    !Number.isFinite(day) ||
    typeof monthIndex !== "number" ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    return undefined;
  }

  const fullYear = normalizeTrafficYear(year) ?? 2000;
  const date = new Date(fullYear, monthIndex, day + 1);

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    ...(year ? { year: "numeric" } : {}),
  }).format(date);
}

function normalizeTrafficYear(year?: string): number | undefined {
  if (!year) {
    return undefined;
  }

  const parsedYear = Number.parseInt(year, 10);

  if (!Number.isFinite(parsedYear)) {
    return undefined;
  }

  return parsedYear < 100 ? 2000 + parsedYear : parsedYear;
}

function extractTextTrafficEndDateLabel(text: string): string | undefined {
  const searchable = normalizeTrafficText(text)
    .replace(/[’']/gu, " ")
    .replace(/\s+/gu, " ");
  const namedDateMatch = searchable.match(
    /\bjusqu\s+au\s+(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?(?:\s+(?:a\s+)?(\d{1,2})(?::|h)(\d{2})?)?\s*(?:inclus)?\b/u,
  );

  if (namedDateMatch) {
    const [, dayText, monthKey, yearText, hourText, minuteText] =
      namedDateMatch;
    const day = Number.parseInt(dayText, 10);
    const month = TRAFFIC_END_MONTH_LABELS[monthKey];

    if (Number.isFinite(day) && month) {
      return formatTrafficEndDateParts({
        day,
        month,
        year: yearText,
        hour: hourText,
        minute: minuteText,
      });
    }
  }

  const numericDateMatch = searchable.match(
    /\bjusqu\s+au\s+(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?:\s+(?:a\s+)?(\d{1,2})(?::|h)(\d{2})?)?\s*(?:inclus)?\b/u,
  );

  if (!numericDateMatch) {
    return undefined;
  }

  const [, dayText, monthText, yearText, hourText, minuteText] =
    numericDateMatch;
  const day = Number.parseInt(dayText, 10);
  const monthIndex = Number.parseInt(monthText, 10) - 1;
  const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "long" });
  const month =
    Number.isFinite(monthIndex) && monthIndex >= 0 && monthIndex < 12
      ? monthFormatter.format(new Date(2000, monthIndex, 1))
      : undefined;

  return Number.isFinite(day) && month
    ? formatTrafficEndDateParts({
        day,
        month,
        year: yearText,
        hour: hourText,
        minute: minuteText,
      })
    : undefined;
}

function extractApplicationPeriodEndDateLabel(
  disruption: TrafficDisruption,
): string | undefined {
  const end = getTrafficDisruptionDisplayPeriod(disruption)?.end;

  if (!end) {
    return undefined;
  }

  const date = parseTrafficDate(end);

  if (!date || Number.isNaN(date.getTime())) {
    return end;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
  }).format(date);
}

function formatTrafficEndDateParts({
  day,
  month,
  year,
  hour,
  minute,
}: {
  day: number;
  month: string;
  year?: string;
  hour?: string;
  minute?: string;
}): string {
  const dateLabel = [String(day), month, year].filter(Boolean).join(" ");

  if (!hour) {
    return dateLabel;
  }

  const minuteLabel = minute?.padStart(2, "0") ?? "00";

  return `${dateLabel} ${hour.padStart(2, "0")}:${minuteLabel}`;
}

function resolveStationKey(
  label: string,
  stations: PatternTrafficStation[],
  options: { allowFuzzy?: boolean } = {},
): string | undefined {
  const labelKeys = createStationMatchKeys(label);
  const exactStationKey = normalizePatternStationName(
    removeStationLocationQualifier(label),
  );
  const exactStation = stations.find(
    (station) =>
      normalizePatternStationName(
        removeStationLocationQualifier(station.label),
      ) === exactStationKey,
  );

  if (exactStationKey && exactStation) {
    return exactStation.key;
  }


  if (labelKeys.length === 0) {
    return undefined;
  }

  const candidates = stations
    .flatMap((station) =>
      createStationMatchKeys(station.label).map((stationKey) => ({
        station,
        score: getDirectStationMatchScore(labelKeys, stationKey),
        stationKey,
      })),
    )
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.stationKey.length - left.stationKey.length,
    );

  if (candidates[0]) {
    return candidates[0].station.key;
  }

  return options.allowFuzzy
    ? resolveFuzzyStationKey(labelKeys, stations)
    : undefined;
}

function removeStationLocationQualifier(value: string): string {
  return value
    .replace(/\s*\([^)]*\)\s*/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function extractNonServedStationKeysFromText(
  text: string,
  stations: PatternTrafficStation[],
): string[] {
  const stationKeys = new Set<string>();

  splitTrafficSentences(text).forEach((sentence) => {
    const searchable = normalizeSearchText(sentence);

    if (
      !NON_SERVED_INTERRUPTION_KEYWORDS.some((keyword) =>
        searchable.includes(keyword),
      )
    ) {
      return;
    }

    stations.forEach((station) => {
      const matchKeys = createStationMatchKeys(station.label);

      if (
        matchKeys.some((matchKey) =>
          containsNormalizedPhrase(searchable, matchKey),
        )
      ) {
        stationKeys.add(station.key);
      }
    });
  });

  return Array.from(stationKeys);
}

function splitTrafficSentences(text: string): string[] {
  return text
    .split(/;|\n|(?<!\b[A-Z])\./gu)
    .map((sentence) => sentence.trim());
}

function containsNormalizedPhrase(searchable: string, phrase: string): boolean {
  if (!phrase) {
    return false;
  }

  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = escaped.replace(/\s+/gu, String.raw`\s+`);

  return new RegExp(String.raw`(?:^|\s)${pattern}(?:\s|$)`, "u").test(
    searchable,
  );
}

function createStationMatchKeys(value: string): string[] {
  const variants = new Set<string>();
  const trimmed = value.replace(/\s+/gu, " ").trim();

  if (!trimmed) {
    return [];
  }

  variants.add(trimmed);
  variants.add(expandPorteAbbreviation(trimmed, "porte"));
  variants.add(expandPorteAbbreviation(trimmed, "portes"));
  variants.add(abbreviatePorteLabel(trimmed, "pte"));
  variants.add(abbreviatePorteLabel(trimmed, "prte"));

  const keys = new Set<string>();

  variants.forEach((variant) => {
    const key = normalizePatternStationName(variant);

    if (key) {
      keys.add(key);
    }

    normalizeTrafficText(variant)
      .replace(/[^a-z0-9]+/gu, " ")
      .split(" ")
      .filter(
        (token) =>
          token.length >= 5 && !STATION_MATCH_IGNORED_TOKENS.has(token),
      )
      .forEach((token) => keys.add(normalizePatternStationName(token)));
  });

  return Array.from(keys);
}

function expandPorteAbbreviation(value: string, replacement: string): string {
  return value.replace(/\b(?:pte|prte)\.?\b/giu, replacement);
}

function abbreviatePorteLabel(value: string, replacement: string): string {
  return value.replace(/\bportes?\b/giu, replacement);
}

function getDirectStationMatchScore(
  labelKeys: string[],
  stationKey: string,
): number {
  return Math.max(
    ...labelKeys.map((labelKey) => {
      if (stationKey === labelKey) {
        return 4;
      }

      if (stationKey.includes(labelKey)) {
        return 3 + labelKey.length / stationKey.length;
      }

      if (labelKey.includes(stationKey)) {
        return 2 + stationKey.length / labelKey.length;
      }

      return 0;
    }),
  );
}

function resolveFuzzyStationKey(
  labelKeys: string[],
  stations: PatternTrafficStation[],
): string | undefined {
  const candidates = stations
    .map((station) => {
      const stationKeys = createStationMatchKeys(station.label);
      const score = Math.max(
        ...labelKeys.flatMap((labelKey) =>
          stationKeys.map((stationKey) =>
            getFuzzyStationMatchScore(labelKey, stationKey),
          ),
        ),
      );

      return { station, score };
    })
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];
  const next = candidates[1];

  if (!best || best.score < FUZZY_STATION_MATCH_MIN_SCORE) {
    return undefined;
  }

  if (
    next &&
    best.score < 0.9 &&
    best.score - next.score < FUZZY_STATION_MATCH_MIN_MARGIN
  ) {
    return undefined;
  }

  return best.station.key;
}

function getFuzzyStationMatchScore(
  labelKey: string,
  stationKey: string,
): number {
  if (!labelKey || !stationKey) {
    return 0;
  }

  if (stationKey === labelKey) {
    return 1;
  }

  if (stationKey.includes(labelKey) || labelKey.includes(stationKey)) {
    return 0.92;
  }

  const distance = getLevenshteinDistance(labelKey, stationKey);

  return 1 - distance / Math.max(labelKey.length, stationKey.length);
}

function getLevenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array<number>(right.length + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;

      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost,
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}

function findStationPath(
  source: string,
  target: string,
  edges: PatternTrafficEdge[],
): string[] {
  if (source === target) {
    return [source];
  }

  const adjacency = new Map<string, Set<string>>();

  edges.forEach((edge) => {
    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, new Set());
    }
    if (!adjacency.has(edge.target)) {
      adjacency.set(edge.target, new Set());
    }

    adjacency.get(edge.source)!.add(edge.target);
    adjacency.get(edge.target)!.add(edge.source);
  });

  const queue: string[][] = [[source]];
  const visited = new Set<string>([source]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1];

    for (const next of adjacency.get(last) ?? []) {
      if (visited.has(next)) {
        continue;
      }

      const nextPath = [...path, next];

      if (next === target) {
        return nextPath;
      }

      visited.add(next);
      queue.push(nextPath);
    }
  }

  return [source, target];
}

function getEdgeKeysForStationPath(stationKeys: string[]): string[] {
  return stationKeys.slice(0, -1).map((source, index) =>
    [source, stationKeys[index + 1]].sort().join("--"),
  );
}

function getStationKeysForEdges(
  edgeKeys: string[],
  edges: PatternTrafficEdge[],
): string[] {
  const selectedEdgeKeys = new Set(edgeKeys);
  const stationKeys = new Set<string>();

  edges.forEach((edge) => {
    if (!selectedEdgeKeys.has(getPatternTrafficEdgeKey(edge))) {
      return;
    }

    stationKeys.add(edge.source);
    stationKeys.add(edge.target);
  });

  return Array.from(stationKeys);
}

function getDisruptionText(disruption: TrafficDisruption): string {
  return [
    disruption.title,
    disruption.message,
    disruption.severity,
    disruption.cause,
    disruption.status,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function normalizeSearchText(value: string): string {
  return normalizeTrafficText(value)
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
