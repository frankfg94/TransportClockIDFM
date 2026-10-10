import type { GlobalMapLine, GlobalMapMode } from "../../transport-map/contracts/manifest";
import { NEARBY_HEAVY_TOTAL_MAX_SECONDS } from "../nearbyHeavyTransportRules";
import type { NearbyHeavyTransportCandidate, NearbyJourney, NearbyJourneySection } from "../nearbyHeavyTransports";
import { getNearbyHeavyAccessTravelSeconds } from "../nearbyHeavyTransports";
import { isNearbyJourneyTransitSection } from "../nearbyJourneyTiming";
import type { PublicFutureGpeStation } from "../neighborhoodVerdictApi";
import type { NeighborhoodFact, NeighborhoodFactKind, NeighborhoodScoreInput } from "./contracts";
import { HEAVY_SCORE_MODES } from "./contracts";
import { makeFact } from "./facts";
import { RULE_KEYS, SOURCE_KEYS } from "./i18nKeys";
import { commercialDistanceMeters } from "./places";
import { normalizeScoreText } from "./primitives";

export interface NeighborhoodTransportAccessSignal {
  line: GlobalMapLine;
  lineName: string;
  /** Present when this line came from a GPE target resolved by the heavy router. */
  futureProject?: PublicFutureGpeStation;
  source: "route" | "map";
  accessKind: "walking" | "connection" | "map";
  /** Elapsed route duration, retained for eligibility and provenance. */
  totalSeconds: number;
  /** Display duration: walking and riding sections, excluding waits. */
  travelSeconds: number;
  minutes: number;
  distanceMeters: number;
  via?: string;
  journey?: NearbyJourney;
}

// Keep the verdict aligned with the resolver used by NearbyStationsMap. The
// resolver has already rejected routes beyond this limit; applying the same
// limit here prevents a valid projected station (for example RER B via T10)
// from disappearing merely because it is outside the 600 m map radius.
export const NEIGHBORHOOD_ROUTED_TRANSPORT_LIMIT_SECONDS = NEARBY_HEAVY_TOTAL_MAX_SECONDS;
export const NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS = 15 * 60;
const NEIGHBORHOOD_TRANSPORT_AT_FOOT_METERS = 400;
const KNOWN_LINE_LABELS_BY_CODE: Readonly<Record<string, string>> = {
  C01728: "D",
  C01729: "E",
  C01730: "P",
  C01731: "R",
  C01736: "N",
  C01737: "H",
  C01738: "K",
  C01739: "J",
  C01740: "L",
  C01741: "U",
  C01742: "A",
  C01743: "B",
  C02528: "T10",
  C02711: "V",
};

export function listTransportAccessSignals(input: NeighborhoodScoreInput): NeighborhoodTransportAccessSignal[] {
  const byLine = new Map<string, NeighborhoodTransportAccessSignal>();

  for (const entry of input.stations) {
    if (!entry.insideRadius) continue;
    for (const line of entry.lines) {
      if (!HEAVY_SCORE_MODES.has(line.mode)) continue;
      const distanceMeters = entry.lineDistanceMeters?.[line.id] ?? entry.distanceMeters;
      if (!Number.isFinite(distanceMeters) || distanceMeters < 0) continue;
      const signal: NeighborhoodTransportAccessSignal = {
        line,
        lineName: formatTransportLineName(line),
        source: "map",
        accessKind: distanceMeters <= NEIGHBORHOOD_TRANSPORT_AT_FOOT_METERS ? "walking" : "map",
        totalSeconds: Math.max(60, Math.round(distanceMeters / 80) * 60),
        travelSeconds: Math.max(60, Math.round(distanceMeters / 80) * 60),
        distanceMeters: Math.round(distanceMeters),
        minutes: Math.max(1, Math.round(distanceMeters / 80)),
      };
      keepBestTransportSignal(byLine, signal);
    }
  }

  for (const candidate of input.heavyCandidates ?? []) {
    for (const line of candidate.lines) {
      if (!HEAVY_SCORE_MODES.has(line.mode)) continue;
      const access = accessForHeavyLine(candidate, line);
      if (!Number.isFinite(access.totalSeconds) || access.totalSeconds < 0) continue;
      const eligibilitySeconds = access.journey?.source === "gtfs" ? getNearbyHeavyAccessTravelSeconds(access) : access.totalSeconds;
      if (eligibilitySeconds > NEIGHBORHOOD_ROUTED_TRANSPORT_LIMIT_SECONDS) continue;
      const signal: NeighborhoodTransportAccessSignal = {
        line,
        lineName: formatTransportLineName(line),
        futureProject: candidate.futureProjectsByLine?.[line.id],
        source: "route",
        accessKind: access.kind === "direct" ? "walking" : "connection",
        totalSeconds: access.totalSeconds,
        travelSeconds: getNearbyHeavyAccessTravelSeconds(access),
        minutes: formatTransportMinutes(
          getNearbyHeavyAccessTravelSeconds(access),
          access.kind === "direct",
        ),
        distanceMeters: Math.max(0, Math.round(candidate.distanceMeters)),
        via: access.kind === "connection"
          ? formatJourneyTransitRoute(input, access.journey, line) ?? formatFeederLineName(input, access)
          : undefined,
        journey: access.journey,
      };
      keepBestTransportSignal(byLine, signal);
    }
  }

  return [...byLine.values()].sort(compareTransportAccessSignalsForDisplay);
}

function keepBestTransportSignal(
  byLine: Map<string, NeighborhoodTransportAccessSignal>,
  signal: NeighborhoodTransportAccessSignal,
): void {
  const key = signal.futureProject
    ? `future:${signal.futureProject.id}`
    : lineKey(signal.line);
  const current = byLine.get(key);
  if (!current || compareTransportAccessSignals(signal, current) < 0) byLine.set(key, signal);
}

function compareTransportAccessSignals(
  left: NeighborhoodTransportAccessSignal,
  right: NeighborhoodTransportAccessSignal,
): number {
  return Number(right.source === "route") - Number(left.source === "route")
    || left.travelSeconds - right.travelSeconds
    || left.totalSeconds - right.totalSeconds
    || left.minutes - right.minutes
    || left.distanceMeters - right.distanceMeters
    || left.lineName.localeCompare(right.lineName, "fr-FR");
}

function compareTransportAccessSignalsForDisplay(
  left: NeighborhoodTransportAccessSignal,
  right: NeighborhoodTransportAccessSignal,
): number {
  return left.minutes - right.minutes
    || Number(right.source === "route") - Number(left.source === "route")
    || left.travelSeconds - right.travelSeconds
    || left.distanceMeters - right.distanceMeters
    || left.lineName.localeCompare(right.lineName, "fr-FR");
}

function accessForHeavyLine(
  candidate: NearbyHeavyTransportCandidate,
  line: GlobalMapLine,
): NearbyHeavyTransportCandidate["access"] {
  return candidate.accessAlternativesByLine?.[line.id]?.[0]
    ?? candidate.accessByLine[line.id]
    ?? candidate.access;
}

export function formatTransportLineName(line: Pick<GlobalMapLine, "id" | "code" | "label" | "mode" | "sourceLineId" | "aliases">): string {
  const directLabel = line.label.trim();
  const knownLabel = [line.code, line.sourceLineId ?? "", line.id, ...line.aliases]
    .map(lineIdentityCode)
    .filter((code): code is string => Boolean(code))
    .map((code) => KNOWN_LINE_LABELS_BY_CODE[code])
    .find((label): label is string => Boolean(label));
  const lineLabel = !isOpaqueTransportLineLabel(directLabel)
    ? directLabel
    : (knownLabel ?? (directLabel || line.code.trim()));
  if (!lineLabel) return transportModeLabel(line.mode);
  return /^(?:métro|metro|rer|train|transilien|tram|tramway|cable|câble)\b/iu.test(lineLabel)
    ? lineLabel
    : `${transportModeLabel(line.mode)} ${lineLabel}`;
}

function formatFeederLineName(
  input: NeighborhoodScoreInput,
  access: NearbyHeavyTransportCandidate["access"],
): string | undefined {
  const references = [access.feederLineId, access.feederLineCode]
    .map((reference) => reference?.trim())
    .filter((reference): reference is string => Boolean(reference));
  const reference = references[0];
  if (!reference) return undefined;
  const feederLines = input.stations.flatMap((entry) => entry.lines);
  const exactFeeder = feederLines.find((line) => references.some((candidateReference) => [
    line.id,
    line.code,
    line.label,
    line.sourceLineId ?? "",
    ...line.aliases,
  ].some((value) => value.trim() === candidateReference)));
  const feeder = exactFeeder ?? feederLines.find((line) => [
    line.id,
    line.code,
    line.label,
    line.sourceLineId ?? "",
    ...line.aliases,
  ].some((value) => transportLineReferencesMatch(value, reference)));
  if (feeder) return formatTransportLineName(feeder);
  const mode = access.feederMode ? transportModeLabel(access.feederMode) : "transport";
  return `${mode} ${reference}`;
}

function formatJourneyTransitRoute(
  input: NeighborhoodScoreInput,
  journey: NearbyJourney | undefined,
  targetLine: GlobalMapLine,
): string | undefined {
  if (!journey) return undefined;
  const knownLines = [
    ...input.stations.flatMap((entry) => entry.lines),
    ...(input.heavyCandidates ?? []).flatMap((candidate) => [
      ...candidate.lines,
      ...(candidate.correspondenceLines ?? []),
    ]),
  ];
  const routeLabels: string[] = [];
  const seenLabels = new Set<string>();

  for (const section of journey.sections.filter(isNearbyJourneyTransitSection)) {
    const line = knownLines.find((candidate) => journeySectionMatchesLine(section, candidate));
    if (line && journeySectionMatchesLine(section, targetLine)) continue;
    const label = line
      ? formatTransportLineName(line)
      : formatJourneySectionLineName(section);
    if (!label) continue;
    const key = normalizeScoreText(label);
    if (seenLabels.has(key)) continue;
    seenLabels.add(key);
    routeLabels.push(label);
  }

  return routeLabels.join(" → ") || undefined;
}

function journeySectionMatchesLine(section: NearbyJourneySection, line: GlobalMapLine): boolean {
  if (section.lineMode && section.lineMode !== line.mode) return false;
  const sectionReferences = [section.lineId, section.lineCode, ...(section.lineAliases ?? [])]
    .filter((value): value is string => Boolean(value?.trim()));
  const lineReferences = [line.id, line.code, line.label, line.sourceLineId, ...line.aliases]
    .filter((value): value is string => Boolean(value?.trim()));
  return sectionReferences.some((sectionReference) => lineReferences.some((lineReference) =>
    transportLineReferencesMatch(sectionReference, lineReference),
  ));
}

function formatJourneySectionLineName(section: NearbyJourneySection): string | undefined {
  const reference = [section.lineCode, ...(section.lineAliases ?? []), section.lineId]
    .find((value) => value?.trim() && !isOpaqueTransportLineLabel(value));
  if (!reference) return undefined;
  const mode = section.lineMode ?? journeySectionMode(section.mode);
  return mode ? `${transportModeLabel(mode)} ${reference.trim()}` : reference.trim();
}

function journeySectionMode(mode?: string): GlobalMapMode | undefined {
  switch ((mode ?? "").trim().toLocaleLowerCase("fr-FR")) {
    case "metro":
    case "métro": return "METRO";
    case "rer": return "RER";
    case "train": return "TRAIN";
    case "transilien": return "TRANSILIEN";
    case "tram":
    case "tramway": return "TRAM";
    case "noctilien": return "NOCTILIEN";
    case "cable":
    case "câble": return "CABLE";
    case "bus": return "BUS";
    default: return undefined;
  }
}

function formatTransportMinutes(seconds: number, directWalking: boolean): number {
  const rounded = directWalking ? Math.round(seconds / 60) : Math.ceil(seconds / 60);
  return Math.max(1, rounded);
}

export function coLocatedCurrentLines(
  input: NeighborhoodScoreInput,
  project: { lon: number; lat: number; coLocatedCurrentLineCodes?: readonly string[] },
  accessibleLineKeys: ReadonlySet<string>,
): GlobalMapLine[] {
  const linesByKey = new Map<string, GlobalMapLine>();
  const declaredCodes = project.coLocatedCurrentLineCodes ?? [];
  const addLine = (line: GlobalMapLine, nearProject: boolean): void => {
    if (!HEAVY_SCORE_MODES.has(line.mode)) return;
    const declared = declaredCodes.some((code) => transportLineReferencesMatch(line.code || line.label, code));
    if (!declared && (!nearProject || !accessibleLineKeys.has(lineKey(line)))) return;
    if (!declared && !accessibleLineKeys.has(lineKey(line))) return;
    linesByKey.set(lineKey(line), line);
  };
  for (const entry of input.stations) {
    const members = entry.memberStations.length > 0 ? entry.memberStations : [entry.station];
    const nearProject = members.some((station) => commercialDistanceMeters(station, project) <= 100);
    if (!nearProject) continue;
    for (const line of entry.lines) addLine(line, true);
  }
  for (const candidate of input.heavyCandidates ?? []) {
    if (commercialDistanceMeters(candidate.station, project) > 100) continue;
    for (const line of [
      ...candidate.lines,
      ...(candidate.correspondenceLines ?? []),
      ...(candidate.coLocatedHeavyLines ?? []),
    ]) {
      addLine(line, true);
    }
  }
  return [...linesByKey.values()];
}

export function transportLineReferencesMatch(left: string, right: string): boolean {
  const normalize = (value: string) => normalizeScoreText(value).replace(/[^a-z0-9]+/gu, "");
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight
    || normalizedLeft.endsWith(normalizedRight)
    || normalizedRight.endsWith(normalizedLeft);
}

function lineIdentityCode(value: string): string | undefined {
  const match = value.match(/C\d{5}/iu);
  return match?.[0]?.toUpperCase();
}

export function isOpaqueTransportLineLabel(value: string): boolean {
  return /^(?:line:)?(?:IDFM:)?C\d{5}$/iu.test(value);
}

function transportModeLabel(mode: GlobalMapMode): string {
  switch (mode) {
    case "METRO": return "Métro";
    case "RER": return "RER";
    case "TRAIN": return "Train";
    case "TRANSILIEN": return "Transilien";
    case "TRAM": return "Tramway";
    case "CABLE": return "Câble";
    default: return mode;
  }
}

export function makeTransportAccessFact(signal: NeighborhoodTransportAccessSignal): NeighborhoodFact {
  const atAddress = signal.accessKind === "walking" && signal.minutes <= 2;
  const kind: NeighborhoodFactKind = atAddress
    ? "transportLineAtAddress"
    : signal.source === "route"
      ? "transportLineNearby"
      : signal.distanceMeters <= NEIGHBORHOOD_TRANSPORT_AT_FOOT_METERS
        ? "transportLineAtFoot"
        : "transportLineDistance";
  const values = {
    line: signal.lineName,
    minutes: signal.minutes,
    meters: signal.distanceMeters,
    via: signal.accessKind === "walking"
      ? " à pied"
      : signal.via ? ` via ${signal.via}` : "",
  };
  return makeFact({
    id: `transport-line-${lineKey(signal.line).replace(/[^a-z0-9]+/giu, "-")}`,
    kind,
    category: "transport",
    polarity: "positive",
    family: `transport-proximity:${lineKey(signal.line)}`,
    priority: atAddress
      ? 13
      : signal.source === "route" ? 12 : signal.distanceMeters <= NEIGHBORHOOD_TRANSPORT_AT_FOOT_METERS ? 11 : 10,
    values,
    sourceKey: signal.source === "route" ? SOURCE_KEYS.heavyRoutes : SOURCE_KEYS.stations,
    proof: signal.source === "route" ? "direct" : "derived",
    ruleKey: signal.source === "route" ? RULE_KEYS.transportProximity : RULE_KEYS.transportDistance,
    ruleValues: { threshold: signal.source === "route" ? 15 : 1_500 },
    emphasis: atAddress ? "exceptional" : undefined,
    travel: signal.journey ? { journey: signal.journey } : undefined,
  });
}

export function lineKey(line: Pick<GlobalMapLine, "id" | "code">): string {
  return line.code.trim()
    ? `code:${line.code.trim().toLocaleLowerCase("fr-FR")}`
    : `id:${line.id}`;
}
