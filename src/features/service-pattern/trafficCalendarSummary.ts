import { getDisruptionTone, normalizeTrafficText } from "../traffic/trafficPresentation";
import type { TrafficDisruption } from "../traffic/types";
import type {
  PatternTrafficCalendarDay,
  PatternTrafficCalendarEvent,
} from "./trafficCalendar";

export type PatternTrafficSummaryIncidentType =
  | "interruption"
  | "works"
  | "slowdown"
  | "crowding"
  | "strike"
  | "weather"
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

export interface PatternTrafficSummaryEntry {
  id: string;
  disruption: TrafficDisruption;
  incidentType: PatternTrafficSummaryIncidentType;
  critical: boolean;
  title?: string;
  impactedStopNames: string[];
  timeWindows: PatternTrafficSummaryTimeWindow[];
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

    return {
      id: disruption.id,
      disruption,
      incidentType: classifyPatternTrafficIncident(disruption, events),
      critical:
        getDisruptionTone(disruption) === "red" ||
        events.some((event) => event.kind === "interruption"),
      title: getPatternTrafficSummaryTitle(disruption),
      impactedStopNames: disruption.impactedStopNames,
      timeWindows,
    };
  });

  return mergeEquivalentSummaryEntries(entries);
}

export function classifyPatternTrafficIncident(
  disruption: TrafficDisruption,
  events: PatternTrafficCalendarEvent[] = [],
): PatternTrafficSummaryIncidentType {
  const searchable = normalizeTrafficText(
    `${disruption.title} ${disruption.message ?? ""} ${
      disruption.cause ?? ""
    } ${disruption.severity ?? ""}`,
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

  if (containsAny(title, interruptionKeywords)) return "interruption";
  if (
    disruption.kind === "works" ||
    containsAny(title, worksKeywords)
  ) {
    return "works";
  }
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

export function getPatternTrafficSummaryTitle(
  disruption: TrafficDisruption,
): string | undefined {
  const title = getConciseTextLead(disruption.title, true);

  if (title && !isGenericTrafficTitle(title)) return title;

  const messageLead = getConciseTextLead(disruption.message, true);
  return messageLead && !isGenericTrafficTitle(messageLead)
    ? messageLead
    : undefined;
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
  const endsAfterDay =
    event.end === undefined || event.end.getTime() >= nextDayStart.getTime();

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

function getConciseTextLead(
  value?: string,
  skipScheduleOnly = false,
): string | undefined {
  if (!value) return undefined;

  const lead = value
    .replace(/<[^>]+>/gu, " ")
    .split(/\r?\n|(?<=[.!?])\s+/u)
    .map((part) => part.replace(/\s+/gu, " ").trim())
    .find(
      (part) =>
        Boolean(part) && (!skipScheduleOnly || !isScheduleOnlyText(part)),
    );
  if (!lead) return undefined;
  if (lead.length <= 112) return lead;

  const clipped = lead.slice(0, 109);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace >= 72 ? lastSpace : 109).trimEnd()}…`;
}

function isGenericTrafficTitle(value: string): boolean {
  const normalized = normalizeTrafficText(value).replace(/[^a-z0-9]+/gu, " ").trim();
  return [
    "information trafic",
    "info trafic",
    "traffic information",
    "perturbation",
    "incident",
    "interruption",
    "travaux",
    "works",
  ].includes(normalized);
}

function isScheduleOnlyText(value: string): boolean {
  const normalized = normalizeTrafficText(value);
  return /^(?:dates?|horaires?|periode|du |de |a partir de|jusqu)/u.test(
    normalized,
  );
}

function containsAny(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
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
    const titleKey = normalizeTrafficText(
      entry.title ?? entry.disruption.title,
    ).replace(/[^a-z0-9]+/gu, " ").trim();
    const key = `${entry.incidentType}:${titleKey}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, { ...entry });
      return;
    }

    existing.critical ||= entry.critical;
    existing.impactedStopNames = Array.from(
      new Set([...existing.impactedStopNames, ...entry.impactedStopNames]),
    );
    existing.timeWindows = deduplicateTimeWindows([
      ...existing.timeWindows,
      ...entry.timeWindows,
    ]);
  });

  return Array.from(merged.values());
}
