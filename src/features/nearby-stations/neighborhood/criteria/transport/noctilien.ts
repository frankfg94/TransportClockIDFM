import type { NearbyJourney } from "../../../nearbyHeavyTransports";
import { isNearbyJourneyTransitSection, isNearbyJourneyWalkingSection } from "../../../nearbyJourneyTiming";
import type { NeighborhoodFact } from "../../contracts";
import { NEIGHBORHOOD_WALKING_LIMIT_MINUTES } from "../../contracts";
import { makeFact } from "../../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../../i18nKeys";
import { finiteNonNegative, normalizeScoreText } from "../../primitives";
import { isOpaqueTransportLineLabel } from "../../transportAccess";

interface NoctilienJourneyAccess {
  lines: string[];
  minutes: number;
  journey: NearbyJourney;
}

export function buildNoctilienFacts(journeys: readonly NearbyJourney[] | undefined): NeighborhoodFact[] {
  const bestAccessByLine = new Map<string, NoctilienJourneyAccess>();
  for (const journey of journeys ?? []) {
    const access = analyzeNoctilienJourneyAccess(journey);
    if (!access) continue;
    for (const line of access.lines) {
      const current = bestAccessByLine.get(normalizeScoreText(line));
      const lineAccess = { ...access, lines: [line] };
      if (!current || compareNoctilienJourneyAccess(lineAccess, current) < 0) {
        bestAccessByLine.set(normalizeScoreText(line), lineAccess);
      }
    }
  }

  const accesses = [...bestAccessByLine.values()];
  if (accesses.length === 0) return [];
  const lines = formatNoctilienLineList(accesses.map((access) => access.lines[0]!));
  const fastestAccess = [...accesses].sort(compareNoctilienJourneyAccess)[0]!;
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
    },
    sourceKey: SOURCE_KEYS.journeys,
    proof: "direct",
    ruleKey: RULE_KEYS.noctilienAtNight,
    ruleValues: { hour: "03:00", threshold: NEIGHBORHOOD_WALKING_LIMIT_MINUTES },
    travel: { journey: fastestAccess.journey },
  })];
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

  const lines = [...new Set(noctilienIndexes
    .map((index) => noctilienLineLabel(journey.sections[index]!))
    .filter((line): line is string => Boolean(line)))];
  if (lines.length === 0) return undefined;
  return {
    lines,
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
