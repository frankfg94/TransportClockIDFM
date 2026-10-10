import type { NearbyJourney } from "../../../nearbyHeavyTransports";
import { isNearbyJourneyTransitSection, isNearbyJourneyWalkingSection } from "../../../nearbyJourneyTiming";
import type { NeighborhoodFact } from "../../contracts";
import { NEIGHBORHOOD_WALKING_LIMIT_MINUTES } from "../../contracts";
import { makeFact } from "../../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../../i18nKeys";
import { finiteNonNegative, normalizeScoreText } from "../../primitives";
import { isOpaqueTransportLineLabel } from "../../transportAccess";
import { DEFAULT_NEIGHBORHOOD_NIGHT_DEPARTURE_TIME } from "../../departureTimes";

interface NoctilienJourneyAccess {
  lines: string[];
  minutes: number;
  journey: NearbyJourney;
}

export function buildNoctilienFacts(
  journeys: readonly NearbyJourney[] | undefined,
  departureTime = DEFAULT_NEIGHBORHOOD_NIGHT_DEPARTURE_TIME,
): NeighborhoodFact[] {
  const bestAccessByLine = new Map<string, NoctilienJourneyAccess>();
  const lineByKey = new Map<string, string>();
  const directionsByLine = new Map<string, Set<string>>();
  for (const journey of journeys ?? []) {
    const access = analyzeNoctilienJourneyAccess(journey);
    if (!access) continue;
    for (const line of access.lines) {
      const key = normalizeScoreText(line);
      lineByKey.set(key, line);
      const directions = directionsByLine.get(key) ?? new Set<string>();
      for (const direction of noctilienDirections(journey, line)) directions.add(direction);
      directionsByLine.set(key, directions);
      const current = bestAccessByLine.get(key);
      const lineAccess = { ...access, lines: [line] };
      if (!current || compareNoctilienJourneyAccess(lineAccess, current) < 0) {
        bestAccessByLine.set(key, lineAccess);
      }
    }
  }

  const accesses = [...bestAccessByLine.values()].sort((left, right) =>
    left.lines[0]!.localeCompare(right.lines[0]!, "fr-FR", { numeric: true }));
  if (accesses.length === 0) return [];
  const lines = formatNoctilienLineList(accesses.map((access) => access.lines[0]!));
  const fastestAccess = [...accesses].sort(compareNoctilienJourneyAccess)[0]!;
  const routes = accesses.map((access) => {
    const line = access.lines[0]!;
    const lineDirections = [...(directionsByLine.get(normalizeScoreText(line)) ?? [])]
      .sort((left, right) => left.localeCompare(right, "fr-FR", { numeric: true }));
    return {
      line,
      journey: journeyToNoctilienLine(access.journey, line),
      direction: lineDirections.length === 2
        ? lineDirections.join(" ↔ ")
        : lineDirections.join(", "),
    };
  });
  const directions = [...directionsByLine.entries()]
    .map(([key, values]) => {
      const lineDirections = [...values].sort((left, right) => left.localeCompare(right, "fr-FR", { numeric: true }));
      return {
        line: lineByKey.get(key)!,
        label: lineDirections.length === 2
          ? lineDirections.join(" ↔ ")
          : lineDirections.join(", "),
      };
    })
    .filter((item) => item.label)
    .sort((left, right) => left.line.localeCompare(right.line, "fr-FR", { numeric: true }));
  return [makeFact({
    id: `noctilien-${normalizeScoreText(lines).replace(/[^a-z0-9]+/gu, "-")}`,
    kind: "noctilienAtNight",
    category: "transport",
    polarity: "positive",
    family: "noctilien:night-access",
    priority: 8,
    values: {
      line: lines,
      minutes: Math.max(...accesses.map((access) => access.minutes)),
      hour: departureTime,
    },
    sourceKey: SOURCE_KEYS.journeys,
    proof: "direct",
    ruleKey: RULE_KEYS.noctilienAtNight,
    ruleValues: { hour: departureTime, threshold: NEIGHBORHOOD_WALKING_LIMIT_MINUTES },
    travel: {
      journey: journeyToNoctilienLine(fastestAccess.journey, fastestAccess.lines[0]!),
      routes,
      directions,
    },
  })];
}

function journeyToNoctilienLine(journey: NearbyJourney, line: string): NearbyJourney {
  const noctilienIndex = journey.sections.findIndex((section) =>
    normalizeScoreText(noctilienLineLabel(section) ?? "") === normalizeScoreText(line));
  if (noctilienIndex < 0) return journey;
  const sections = journey.sections.slice(0, noctilienIndex + 1);
  return {
    ...journey,
    sections,
    durationSeconds: sections.reduce((total, section) => total + section.durationSeconds, 0),
    arrivalDateTime: sections.at(-1)?.arrivalDateTime ?? journey.arrivalDateTime,
  };
}

function analyzeNoctilienJourneyAccess(journey: NearbyJourney): NoctilienJourneyAccess | undefined {
  const noctilienIndexes = journey.sections.flatMap((section, index) =>
    noctilienLineLabel(section) ? [index] : []);
  const firstNoctilienIndex = noctilienIndexes[0];
  if (firstNoctilienIndex === undefined) return undefined;

  const accessSections = journey.sections.slice(0, firstNoctilienIndex);
  // The signal describes a walk from the origin to a Noctilien stop. A route
  // that first uses another transit line is not an access-to-Noctilien fact.
  if (accessSections.some(isNearbyJourneyTransitSection)) return undefined;
  const walkingSeconds = accessSections
    .filter(isNearbyJourneyWalkingSection)
    .reduce((sum, section) => sum + (finiteNonNegative(section.durationSeconds) ?? 0), 0);
  if (!(walkingSeconds < NEIGHBORHOOD_WALKING_LIMIT_MINUTES * 60)) return undefined;

  // Only the first boarded line is reachable on foot from the origin.
  // Later Noctilien sections require a ride and cannot share this walk time.
  const line = noctilienLineLabel(journey.sections[firstNoctilienIndex]!);
  if (!line) return undefined;
  return {
    lines: [line],
    minutes: Math.max(1, Math.ceil(walkingSeconds / 60)),
    journey,
  };
}

function noctilienLineLabel(section: NearbyJourney["sections"][number]): string | undefined {
  if (!isNearbyJourneyTransitSection(section)) return undefined;
  const references = [section.lineCode, ...(section.lineAliases ?? [])]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const noctilienCode = references.find((value) => /^n\s*\d+$/iu.test(value));
  if (noctilienCode) return noctilienCode.replace(/\s+/gu, "").toLocaleUpperCase("fr-FR");
  if (section.lineMode?.toLocaleUpperCase("fr-FR") !== "NOCTILIEN") return undefined;
  return references.find((value) => !isOpaqueTransportLineLabel(value)) ?? "Noctilien";
}

function noctilienDirections(journey: NearbyJourney, line: string): string[] {
  return [...new Set(journey.sections
    .filter((section) => normalizeScoreText(noctilienLineLabel(section) ?? "") === normalizeScoreText(line))
    .map((section) => section.direction?.trim())
    .filter((direction): direction is string => Boolean(direction)))];
}

function compareNoctilienJourneyAccess(left: NoctilienJourneyAccess, right: NoctilienJourneyAccess): number {
  return left.minutes - right.minutes
    || (finiteNonNegative(left.journey.durationSeconds) ?? Number.MAX_SAFE_INTEGER)
      - (finiteNonNegative(right.journey.durationSeconds) ?? Number.MAX_SAFE_INTEGER)
    || left.lines[0]!.localeCompare(right.lines[0]!, "fr-FR", { numeric: true });
}

function formatNoctilienLineList(lines: readonly string[]): string {
  const uniqueLines = [...new Set(lines)].sort((left, right) => left.localeCompare(right, "fr-FR", { numeric: true }));
  if (uniqueLines.length <= 1) return uniqueLines[0] ?? "Noctilien";
  if (uniqueLines.length === 2) return `${uniqueLines[0]} et ${uniqueLines[1]}`;
  return `${uniqueLines.slice(0, -1).join(", ")} et ${uniqueLines.at(-1)}`;
}
