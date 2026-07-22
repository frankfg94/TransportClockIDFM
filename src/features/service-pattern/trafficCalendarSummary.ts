import { getDisruptionTone, normalizeTrafficText } from "../traffic/trafficPresentation";
import { getTrafficDisruptionEffectivePeriods, parseTrafficDate } from "../traffic/trafficTiming";
import type { TrafficDisruption } from "../traffic/types";
import type { PatternTrafficCalendarDay, PatternTrafficCalendarEvent } from "./trafficCalendar";

export type PatternTrafficSummaryIncidentType =
  | "interruption"
  | "works"
  | "slowdown"
  | "crowding"
  | "strike"
  | "weather"
  | "concert"
  | "sport"
  | "celebration"
  | "animal"
  | "fallen-tree"
  | "luggage"
  | "signalling"
  | "suspicious-package"
  | "medical"
  | "train-breakdown"
  | "police"
  | "safety"
  | "technical"
  | "incident"
  | "information";

export type PatternTrafficSummaryTimeWindow =
  | { kind: "all-day" }
  | { kind: "range"; start: string; end: string }
  | { kind: "from"; start: string }
  | { kind: "until"; end: string }
  | { kind: "unknown" };

export interface PatternTrafficSummaryCopy {
  title?: string;
  description?: string;
}

export interface PatternTrafficSummaryEntry {
  id: string;
  disruptionIds: string[];
  disruption: TrafficDisruption;
  incidentType: PatternTrafficSummaryIncidentType;
  critical: boolean;
  title?: string;
  description?: string;
  impactedStopNames: string[];
  timeWindows: PatternTrafficSummaryTimeWindow[];
  remainingDayCount: number;
}

const CROWDING_KEYWORDS = [
  "affluence",
  "crowding",
  "crowded",
  "forte frequentation",
  "saturation voyageurs",
];
const STRIKE_KEYWORDS = ["greve", "mouvement social", "strike", "industrial action"];
const WEATHER_KEYWORDS = [
  "intemperie",
  "meteo",
  "neige",
  "verglas",
  "orage",
  "tempete",
  "inondation",
  "forte chaleur",
  "weather",
  "snow",
  "flood",
  "storm",
];
const CONCERT_KEYWORDS = ["concert", "festival de musique", "fete de la musique", "music festival"];
const SPORT_KEYWORDS = [
  "manifestation sportive",
  "evenement sportif",
  "epreuve sportive",
  "competition sportive",
  "course cycliste",
  "tour de france",
  "marathon",
  "sporting event",
];
const CELEBRATION_KEYWORDS = [
  "feu d'artifice",
  "feu d’artifice",
  "feux d'artifice",
  "feux d’artifice",
  "fete",
  "festivite",
  "celebration",
  "14 juillet",
  "nouvel an",
  "fireworks",
];
const ANIMAL_KEYWORDS = [
  "animal sur les voies",
  "animaux sur les voies",
  "presence d'un animal",
  "presence d’un animal",
  "presence d'animaux",
  "presence d’animaux",
  "divagation d'animaux",
  "divagation d’animaux",
  "animal on track",
];
const FALLEN_TREE_KEYWORDS = [
  "arbre tombe",
  "arbre sur les voies",
  "chute d'arbre",
  "chute d’arbre",
  "vegetation sur les voies",
  "fallen tree",
];
const LUGGAGE_KEYWORDS = [
  "bagage oublie",
  "bagage abandonne",
  "valise oubliee",
  "objet oublie",
  "forgotten luggage",
  "unattended luggage",
];
const SIGNALLING_KEYWORDS = [
  "signalisation",
  "defaut de signal",
  "panne de signal",
  "signal failure",
];
const SUSPICIOUS_PACKAGE_KEYWORDS = [
  "colis suspect",
  "paquet suspect",
  "objet suspect",
  "suspicious package",
];
const MEDICAL_KEYWORDS = [
  "malaise voyageur",
  "malaise d'un voyageur",
  "malaise d’un voyageur",
  "malaise d un voyageur",
  "voyageur malade",
  "urgence medicale",
  "medical emergency",
];
const TRAIN_BREAKDOWN_KEYWORDS = [
  "panne de train",
  "panne d'un train",
  "panne d’un train",
  "panne d un train",
  "train en panne",
  "avarie de train",
  "avarie de materiel roulant",
  "panne de materiel roulant",
  "train failure",
  "vehicle failure",
  "rolling stock failure",
];
const POLICE_KEYWORDS = [
  "police",
  "forces de l'ordre",
  "forces de l’ordre",
  "forces de l ordre",
  "police activity",
];
const SLOWDOWN_KEYWORDS = [
  "ralentissement",
  "trafic ralenti",
  "circulation ralentie",
  "retard",
  "delai",
  "service reduit",
  "frequence reduite",
  "slow traffic",
  "delayed",
  "delay",
  "reduced service",
];
const SAFETY_KEYWORDS = [
  "securite",
  "police",
  "colis suspect",
  "bagage oublie",
  "malaise voyageur",
  "personne sur les voies",
  "acte de malveillance",
  "security",
  "police activity",
  "medical emergency",
  "suspicious package",
];
const TECHNICAL_KEYWORDS = [
  "incident technique",
  "panne",
  "avarie",
  "signalisation",
  "defaut de signal",
  "materiel roulant",
  "aiguillage",
  "alimentation electrique",
  "technical",
  "equipment failure",
  "signal failure",
  "vehicle failure",
  "power failure",
];

export function createPatternTrafficSummaryEntries(
  day: PatternTrafficCalendarDay,
): PatternTrafficSummaryEntry[] {
  const eventsByDisruption = new Map<string, PatternTrafficCalendarEvent[]>();

  day.events.forEach((event) => {
    const existing = eventsByDisruption.get(event.disruption.id) ?? [];
    existing.push(event);
    eventsByDisruption.set(event.disruption.id, existing);
  });

  const entries = Array.from(eventsByDisruption.values()).map((events) => {
    const disruption = events[0].disruption;
    const timeWindows = deduplicateTimeWindows(
      events.map((event) => getPatternTrafficSummaryTimeWindow(event, day.date)),
    );
    const copy = getPatternTrafficSummaryCopy(disruption);

    return {
      id: disruption.id,
      disruptionIds: [disruption.id],
      disruption,
      incidentType: classifyPatternTrafficIncident(disruption, events),
      critical:
        getDisruptionTone(disruption) === "red" ||
        events.some((event) => event.kind === "interruption"),
      title: copy.title,
      description: copy.description,
      impactedStopNames: disruption.impactedStopNames,
      timeWindows,
      remainingDayCount: getPatternTrafficSummaryRemainingDayCount(events, day.date),
    };
  });

  return mergeEquivalentSummaryEntries(entries);
}

export function getPatternTrafficSummaryRemainingDayCount(
  events: PatternTrafficCalendarEvent[],
  selectedDate: Date,
): number {
  const selectedDayStart = startOfLocalDay(selectedDate);
  const firstRemainingDay = addLocalDays(selectedDayStart, 1);
  const remainingDates = new Set<string>();
  const periods = events.map((event) => ({ start: event.start, end: event.end }));

  events.forEach((event) => {
    const sourcePeriods = getTrafficDisruptionEffectivePeriods(event.disruption).periods;

    sourcePeriods.forEach((period) => {
      const start = parseTrafficDate(period.begin);
      const end = parseTrafficDate(period.end);
      if (
        start &&
        end &&
        Number.isFinite(start.getTime()) &&
        Number.isFinite(end.getTime()) &&
        end.getTime() > start.getTime()
      ) {
        periods.push({ start, end });
      }
    });
  });

  periods.forEach((period) => {
    if (!period.end) return;

    for (
      let dayStart = firstRemainingDay;
      dayStart.getTime() < period.end.getTime();
      dayStart = addLocalDays(dayStart, 1)
    ) {
      const nextDayStart = addLocalDays(dayStart, 1);
      if (
        period.start.getTime() < nextDayStart.getTime() &&
        period.end.getTime() > dayStart.getTime()
      ) {
        remainingDates.add(getLocalDateKey(dayStart));
      }
    }
  });

  return remainingDates.size;
}

export function classifyPatternTrafficIncident(
  disruption: TrafficDisruption,
  events: PatternTrafficCalendarEvent[] = [],
): PatternTrafficSummaryIncidentType {
  const searchable = normalizeTrafficText(
    [disruption.title, disruption.message, disruption.motif, disruption.cause, disruption.severity]
      .filter((value): value is string => Boolean(value))
      .join(" "),
  );
  const title = normalizeTrafficText(disruption.title);
  const worksKeywords = ["travaux", "chantier", "maintenance", "works"];
  const interruptionKeywords = [
    "interrompu",
    "interrompue",
    "interruption",
    "aucun train",
    "aucune circulation",
    "ne circule pas",
    "trafic suspendu",
    "service suspendu",
    "fermeture",
    "no service",
  ];

  if (disruption.kind === "works" || containsAny(title, worksKeywords)) {
    return "works";
  }
  if (containsAny(searchable, CONCERT_KEYWORDS)) return "concert";
  if (containsAny(searchable, SPORT_KEYWORDS)) return "sport";
  if (containsAny(searchable, CELEBRATION_KEYWORDS)) return "celebration";
  if (containsAny(searchable, ANIMAL_KEYWORDS)) return "animal";
  if (containsAny(searchable, FALLEN_TREE_KEYWORDS)) return "fallen-tree";
  if (containsAny(searchable, LUGGAGE_KEYWORDS)) return "luggage";
  if (containsAny(searchable, SIGNALLING_KEYWORDS)) return "signalling";
  if (containsAny(searchable, SUSPICIOUS_PACKAGE_KEYWORDS)) {
    return "suspicious-package";
  }
  if (containsAny(searchable, MEDICAL_KEYWORDS)) return "medical";
  if (containsAny(searchable, TRAIN_BREAKDOWN_KEYWORDS)) {
    return "train-breakdown";
  }
  if (containsAny(searchable, POLICE_KEYWORDS)) return "police";
  if (containsAny(title, interruptionKeywords)) return "interruption";
  if (containsAny(searchable, CROWDING_KEYWORDS)) return "crowding";
  if (containsAny(searchable, STRIKE_KEYWORDS)) return "strike";
  if (containsAny(searchable, WEATHER_KEYWORDS)) return "weather";
  if (containsAny(searchable, SLOWDOWN_KEYWORDS)) return "slowdown";
  if (containsAny(searchable, SAFETY_KEYWORDS)) return "safety";
  if (containsAny(searchable, TECHNICAL_KEYWORDS)) return "technical";
  if (
    getDisruptionTone(disruption) === "red" ||
    events.some((event) => event.kind === "interruption")
  ) {
    return "interruption";
  }
  if (containsAny(searchable, worksKeywords)) return "works";
  if (disruption.kind === "information") return "information";
  return "incident";
}

export function getPatternTrafficSummaryCopy(
  disruption: TrafficDisruption,
): PatternTrafficSummaryCopy {
  const sourceText = [disruption.motif, disruption.message, disruption.cause, disruption.title]
    .filter((value): value is string => Boolean(value))
    .join("\n");
  const explicitReason = extractTrafficReason(sourceText);
  if (explicitReason && !isGenericTrafficTitle(explicitReason)) {
    return splitTrafficSummaryCopy(explicitReason);
  }
  if (explicitReason && normalizeTrafficText(explicitReason) === "travaux") {
    const description =
      extractTrafficReasonContext(disruption.title) ??
      extractTrafficReasonContext(disruption.message);

    return description ? { title: "Travaux", description } : { title: "Travaux" };
  }

  const operationalSummary = extractOperationalTrafficSummary(sourceText);
  if (operationalSummary) return operationalSummary;

  const title = getConciseTrafficTitle(disruption.title);
  if (title && !isGenericTrafficTitle(title)) {
    return splitTrafficSummaryCopy(title);
  }

  const cause = getConciseTrafficTitle(disruption.cause);
  if (cause && !isGenericTrafficTitle(cause)) {
    return splitTrafficSummaryCopy(cause);
  }

  const messageLead = getConciseTrafficTitle(disruption.message);
  return messageLead && !isGenericTrafficTitle(messageLead)
    ? splitTrafficSummaryCopy(messageLead)
    : {};
}

export function getPatternTrafficSummaryTitle(disruption: TrafficDisruption): string | undefined {
  return getPatternTrafficSummaryCopy(disruption).title;
}

const LINE_TITLE_PREFIX_PATTERN =
  /^(?:(?:m[eé]tro|rer|tram(?:way)?|transilien|ligne|bus)\s+)[a-z0-9][a-z0-9.+/-]{0,7}\s*:\s*/iu;

function getConciseTrafficTitle(value?: string): string | undefined {
  const lead = getConciseTextLead(value, true);
  if (!lead) return undefined;

  const withoutLinePrefix = lead.replace(LINE_TITLE_PREFIX_PATTERN, "").trim();
  const segments = withoutLinePrefix.split(/\s+[-–—]\s+/u);
  while (segments.length > 1 && isGenericTrafficTitle(segments[segments.length - 1])) {
    segments.pop();
  }

  return cleanSummaryText(segments.join(" – "));
}

function extractTrafficReason(value: string): string | undefined {
  const plainText = normalizeMultilineTrafficText(value);
  if (!plainText) return undefined;

  const motifMarker = /\bmotif\s*:\s*/iu.exec(plainText);
  if (motifMarker) {
    return cleanSummaryText(
      extractTrafficClause(plainText, motifMarker.index + motifMarker[0].length),
    );
  }

  const reasonMarker =
    /\b(?:en\s+raison\s+(?:de(?:s)?\s+|d['’])|pour\s+cause\s+de\s+|[àa]\s+cause\s+de\s+|(?:[àa]\s+la\s+)?suite\s+[àa]\s+)/iu.exec(
      plainText,
    );
  return reasonMarker
    ? cleanSummaryText(extractTrafficClause(plainText, reasonMarker.index + reasonMarker[0].length))
    : undefined;
}

function extractTrafficReasonContext(value?: string): string | undefined {
  if (!value) return undefined;

  const plainText = normalizeMultilineTrafficText(value);
  const marker =
    /\b(?:en\s+raison\s+(?:de(?:s)?\s+|d['’])|pour\s+cause\s+de\s+|[àa]\s+cause\s+de\s+|(?:[àa]\s+la\s+)?suite\s+[àa]\s+)/iu.exec(
      plainText,
    );
  if (!marker) return undefined;

  let start = marker.index;
  while (start > 0 && !/[.!?\n]/u.test(plainText[start - 1])) {
    start -= 1;
  }

  let end = marker.index + marker[0].length;
  while (end < plainText.length && !/[.!?\n]/u.test(plainText[end])) {
    end += 1;
  }
  if (end < plainText.length && /[.!?]/u.test(plainText[end])) {
    end += 1;
  }

  return cleanSummaryText(plainText.slice(start, end));
}

function normalizeMultilineTrafficText(value: string): string {
  return value
    .replace(/<[^>]+>/gu, " ")
    .replace(/[^\S\r\n]+/gu, " ")
    .replace(/\r?\n\s*/gu, "\n")
    .trim();
}

function extractTrafficClause(value: string, start: number): string {
  const line = value.slice(start).split(/\r?\n/u, 1)[0].trim();
  let parenthesisDepth = 0;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "(") {
      parenthesisDepth += 1;
      continue;
    }
    if (character === ")") {
      parenthesisDepth = Math.max(0, parenthesisDepth - 1);
      continue;
    }
    if (
      parenthesisDepth === 0 &&
      /[.!?;]/u.test(character) &&
      (index === line.length - 1 ||
        /^(?:\s+(?:reprise|p[ée]riode|dates?|arr[êe]ts?|trafic|rer|ligne|bus|pour)\b)/iu.test(
          line.slice(index + 1),
        ))
    ) {
      return line.slice(0, index);
    }
  }

  return line;
}

function splitTrafficSummaryCopy(value: string): PatternTrafficSummaryCopy {
  const cleaned = cleanSummaryText(value);
  if (!cleaned) return {};

  const parenthetical = splitTrailingParenthetical(cleaned);
  if (!parenthetical) {
    return { title: canonicalizeSummaryTitle(cleaned) };
  }

  return {
    title: canonicalizeSummaryTitle(parenthetical.title),
    description: sentenceCase(parenthetical.description),
  };
}

function canonicalizeSummaryTitle(value: string): string {
  const normalized = normalizeTrafficText(value)
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();

  if (
    normalized === "travaux sur le reseau ferre" ||
    normalized === "travaux sur le reseau ferroviaire"
  ) {
    return "Travaux sur le réseau ferroviaire";
  }

  return value;
}

function splitTrailingParenthetical(
  value: string,
): { title: string; description: string } | undefined {
  if (!value.endsWith(")")) return undefined;

  let depth = 0;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const character = value[index];
    if (character === ")") {
      depth += 1;
      continue;
    }
    if (character !== "(") continue;

    depth -= 1;
    if (depth !== 0) continue;

    const title = cleanSummaryText(value.slice(0, index));
    const description = cleanSummaryText(value.slice(index + 1, -1));
    return title && description ? { title, description } : undefined;
  }

  return undefined;
}

function extractOperationalTrafficSummary(value: string): PatternTrafficSummaryCopy | undefined {
  const plainText = normalizeMultilineTrafficText(value);
  const normalized = normalizeTrafficText(plainText);

  if (
    /\boffre de transport (?:est |sera )?adaptee\b/u.test(normalized) ||
    /\bservice (?:est |sera )?adapte\b/u.test(normalized)
  ) {
    const trainNotice = plainText.match(
      /\bcertains trains ne circuleront pas[^.!?\r\n]*[.!?]?/iu,
    )?.[0];

    return {
      title: "Offre de transport adaptée",
      description: trainNotice ? sentenceCase(trainNotice) : undefined,
    };
  }

  return undefined;
}

function cleanSummaryText(value: string): string | undefined {
  const cleaned = value
    .replace(LINE_TITLE_PREFIX_PATTERN, "")
    .replace(/^[\s:–—-]+|[\s:–—-]+$/gu, "")
    .replace(/[.!?;]+$/gu, "")
    .replace(/(\d+(?:[.,]\d+)?)\s*(km|m)\b/giu, "$1 $2")
    .replace(/\s+/gu, " ")
    .trim();

  return cleaned ? sentenceCase(cleaned) : undefined;
}

function sentenceCase(value: string): string {
  return value.replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase("fr-FR"));
}
export function getPatternTrafficSummaryTimeWindow(
  event: PatternTrafficCalendarEvent,
  day: Date,
): PatternTrafficSummaryTimeWindow {
  if (event.impactTimeWindow) {
    const { startMinute, endMinute } = event.impactTimeWindow;
    if (startMinute <= 0 && endMinute >= 24 * 60) return { kind: "all-day" };
    return {
      kind: "range",
      start: formatMinuteOfDay(startMinute),
      end: formatMinuteOfDay(endMinute),
    };
  }

  const technicalStartLabel = formatClock(event.start);
  const technicalEndLabel = event.end ? formatClock(event.end) : undefined;
  const explicitStartLabel =
    event.startTimeLabel && event.startTimeLabel !== technicalStartLabel
      ? event.startTimeLabel
      : undefined;
  const explicitEndLabel =
    event.restartTimeLabel && event.restartTimeLabel !== technicalEndLabel
      ? event.restartTimeLabel
      : undefined;

  if (explicitStartLabel && explicitEndLabel) {
    return {
      kind: "range",
      start: explicitStartLabel,
      end: explicitEndLabel,
    };
  }
  if (explicitStartLabel) return { kind: "from", start: explicitStartLabel };
  if (explicitEndLabel) return { kind: "until", end: explicitEndLabel };

  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const nextDayStart = new Date(dayStart);
  nextDayStart.setDate(nextDayStart.getDate() + 1);
  const startsBeforeDay = event.start.getTime() <= dayStart.getTime();
  const endsAfterDay = event.end === undefined || event.end.getTime() >= nextDayStart.getTime();

  if (startsBeforeDay && endsAfterDay) return { kind: "all-day" };
  if (startsBeforeDay && event.end) {
    return { kind: "until", end: formatClock(event.end) };
  }
  if (endsAfterDay) {
    return { kind: "from", start: formatClock(event.start) };
  }
  if (event.end) {
    return {
      kind: "range",
      start: formatClock(event.start),
      end: formatClock(event.end),
    };
  }
  return { kind: "unknown" };
}

function getConciseTextLead(value?: string, skipScheduleOnly = false): string | undefined {
  if (!value) return undefined;

  return value
    .replace(/<[^>]+>/gu, " ")
    .split(/\r?\n|(?<=[.!?])\s+/u)
    .map((part) => part.replace(/\s+/gu, " ").trim())
    .find((part) => Boolean(part) && (!skipScheduleOnly || !isScheduleOnlyText(part)));
}
function isGenericTrafficTitle(value: string): boolean {
  const normalized = normalizeTrafficText(value)
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
  if (
    [
      "information trafic",
      "info trafic",
      "traffic information",
      "perturbation",
      "incident",
      "interruption",
      "travaux",
      "works",
    ].includes(normalized)
  ) {
    return true;
  }

  return /^(?:le )?(?:trafic|circulation|service) (?:est )?(?:(?:tres|fortement|partiellement|legerement) )?(?:interrompu|interrompue|suspendu|suspendue|perturbe|perturbee|ralenti|ralentie)$/u.test(
    normalized,
  );
}

function isScheduleOnlyText(value: string): boolean {
  const normalized = normalizeTrafficText(value);
  return /^(?:dates?|horaires?|periode|du |de |a partir de|jusqu)/u.test(normalized);
}

function containsAny(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
    2,
    "0",
  )}`;
}

function formatMinuteOfDay(value: number): string {
  const normalized = Math.max(0, Math.min(24 * 60, Math.round(value)));
  if (normalized === 24 * 60) return "24:00";
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(
    normalized % 60,
  ).padStart(2, "0")}`;
}

function deduplicateTimeWindows(
  windows: PatternTrafficSummaryTimeWindow[],
): PatternTrafficSummaryTimeWindow[] {
  const unique = new Map<string, PatternTrafficSummaryTimeWindow>();
  windows.forEach((window) => unique.set(JSON.stringify(window), window));
  return Array.from(unique.values());
}

function mergeEquivalentSummaryEntries(
  entries: PatternTrafficSummaryEntry[],
): PatternTrafficSummaryEntry[] {
  const merged = new Map<string, PatternTrafficSummaryEntry>();

  entries.forEach((entry) => {
    const titleKey = normalizeTrafficText(entry.title ?? entry.disruption.title)
      .replace(/[^a-z0-9]+/gu, " ")
      .trim();
    const descriptionKey = normalizeTrafficText(entry.description ?? "")
      .replace(/[^a-z0-9]+/gu, " ")
      .trim();
    const key = [entry.incidentType, titleKey, descriptionKey].join(":");
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, { ...entry });
      return;
    }

    existing.critical ||= entry.critical;
    existing.disruptionIds = Array.from(
      new Set([...existing.disruptionIds, ...entry.disruptionIds]),
    );
    existing.impactedStopNames = Array.from(
      new Set([...existing.impactedStopNames, ...entry.impactedStopNames]),
    );
    existing.timeWindows = deduplicateTimeWindows([...existing.timeWindows, ...entry.timeWindows]);
    existing.remainingDayCount = Math.max(existing.remainingDayCount, entry.remainingDayCount);
  });

  return Array.from(merged.values());
}

function startOfLocalDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addLocalDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function getLocalDateKey(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}
