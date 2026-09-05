import type {
  GlobalMapLine,
  GlobalMapMode,
  GlobalMapStation,
} from "../transport-map/contracts/manifest";
import type { PublicFutureGpeStation } from "./neighborhoodVerdictApi";
import type {
  HeavyJourneyEvaluation,
  HeavyJourneyEvaluationInput,
  NearbyHeavyAccessPresentation,
  NearbyHeavyTransportAccess,
  NearbyJourney,
  NearbyJourneySection,
} from "./nearbyHeavyTransports";
import {
  analyzeNearbyJourneyTiming,
  isNearbyJourneyTransitSection as isTransitSection,
  isNearbyJourneyWalkingSection as isWalkingSection,
} from "./nearbyJourneyTiming";

/** Modes that can be displayed as the target heavy transport. */
export const NEARBY_HEAVY_TRANSPORT_MODES: readonly GlobalMapMode[] = [
  "METRO",
  "RER",
  "TRAIN",
  "TRANSILIEN",
];

/** Non-bus feeder modes allowed in a two-segment reliable connection. */
export const NEARBY_HEAVY_RELIABLE_FEEDER_MODES: readonly GlobalMapMode[] = [
  "TRAM",
  "CABLE",
];

/** Bus-like modes are never accepted in a two-segment reliable connection. */
export const NEARBY_HEAVY_BUS_MODES: readonly GlobalMapMode[] = [
  "BUS",
  "NOCTILIEN",
];

export const NEARBY_HEAVY_DIRECT_WALK_MAX_METERS = 2_000;
export const NEARBY_HEAVY_FEEDER_WALK_MAX_SECONDS = 15 * 60;
/** Bus and Noctilien are useful only for a genuinely short station access. */
export const NEARBY_HEAVY_BUS_ACCESS_MAX_SECONDS = 15 * 60;
export const NEARBY_HEAVY_TOTAL_MAX_SECONDS = 30 * 60;
export const NEARBY_HEAVY_LONG_WALK_HIDE_SECONDS = 20 * 60;
export const NEARBY_HEAVY_SEARCH_MAX_METERS = 5_000;

/**
 * Return the duration used for nearby-heavy labels and eligibility.
 *
 * New access objects expose `scoreSeconds`, which removes only the initial
 * wait. `travelSeconds` is retained as a compatibility alias for snapshots
 * and tests created before the timing policy was introduced.
 */
export function getNearbyHeavyAccessTravelSeconds(
  access: Pick<NearbyHeavyTransportAccess, "scoreSeconds" | "travelSeconds" | "totalSeconds">,
): number {
  if (Number.isFinite(access.scoreSeconds) && (access.scoreSeconds ?? 0) >= 0) {
    return access.scoreSeconds!;
  }
  return Number.isFinite(access.travelSeconds) && (access.travelSeconds ?? 0) >= 0
    ? access.travelSeconds!
    : access.totalSeconds;
}

export interface NearbyHeavyTargetCandidate {
  station: GlobalMapStation;
  line: GlobalMapLine;
  distanceMeters: number;
  /** A future heavy line resolved at the same physical target algorithm. */
  futureProject?: PublicFutureGpeStation;
}

/**
 * Keep the nearest stations for every active heavy line and additionally keep
 * every multi-heavy-line hub in the search radius. The second rule prevents a
 * hub such as Massy-Palaiseau from disappearing only because it is seventh on
 * one branch while remaining a useful target for another branch.
 */
export function selectNearbyHeavyTargetCandidates(
  candidates: readonly NearbyHeavyTargetCandidate[],
  perLineLimit = 6,
): NearbyHeavyTargetCandidate[] {
  const unique = new Map<string, NearbyHeavyTargetCandidate>();
  const heavyLinesByStation = new Map<string, Set<string>>();

  for (const candidate of candidates) {
    if (!NEARBY_HEAVY_TRANSPORT_MODES.includes(candidate.line.mode)) continue;
    const key = `${candidate.station.id}:${candidate.line.id}`;
    if (!unique.has(key)) unique.set(key, candidate);
    const lineIds = heavyLinesByStation.get(candidate.station.id) ?? new Set<string>();
    lineIds.add(candidate.line.id);
    heavyLinesByStation.set(candidate.station.id, lineIds);
  }

  const selected = new Map<string, NearbyHeavyTargetCandidate>();
  const byLine = new Map<string, NearbyHeavyTargetCandidate[]>();
  for (const candidate of unique.values()) {
    const lineCandidates = byLine.get(candidate.line.id) ?? [];
    lineCandidates.push(candidate);
    byLine.set(candidate.line.id, lineCandidates);
  }

  for (const lineCandidates of byLine.values()) {
    lineCandidates
      .sort((left, right) => left.distanceMeters - right.distanceMeters || left.station.name.localeCompare(right.station.name, "fr"))
      .slice(0, Math.max(1, Math.round(perLineLimit)))
      .forEach((candidate) => selected.set(`${candidate.station.id}:${candidate.line.id}`, candidate));
  }

  for (const candidate of unique.values()) {
    if ((heavyLinesByStation.get(candidate.station.id)?.size ?? 0) >= 2) {
      selected.set(`${candidate.station.id}:${candidate.line.id}`, candidate);
    }
  }

  return [...selected.values()].sort(
    (left, right) => left.distanceMeters - right.distanceMeters || left.station.name.localeCompare(right.station.name, "fr"),
  );
}

/**
 * Keep one shortest journey per feeder line. This is deliberately a pure
 * business rule: providers and UI code only supply normalized journeys.
 */
export function listNearbyHeavyJourneyAlternatives(
  journeys: readonly NearbyJourney[],
  input: Omit<HeavyJourneyEvaluationInput, "journey">,
): HeavyJourneyEvaluation[] {
  const alternatives = new Map<string, HeavyJourneyEvaluation>();

  for (const journey of journeys) {
    const evaluation = evaluateNearbyHeavyJourney({ ...input, journey });
    if (!evaluation) continue;

    const key = evaluation.kind === "direct"
      ? "direct"
      : `connection:${normalizeAccessLineKey(evaluation.feederLineCode ?? evaluation.feederLineId ?? evaluation.feederMode ?? "unknown")}`;
    const existing = alternatives.get(key);
    if (!existing || compareHeavyJourneyEvaluations(evaluation, existing) < 0) {
      alternatives.set(key, evaluation);
    }
  }

  return [...alternatives.values()].sort(compareHeavyJourneyEvaluations);
}

/**
 * Keep long walking details out of projected heavy-station labels. A short
 * feeder ride remains useful context even when the full walking route is not.
 */
export function getNearbyHeavyAccessPresentation(
  access: NearbyHeavyTransportAccess,
  projected = false,
): NearbyHeavyAccessPresentation | undefined {
  const totalWalkingSeconds = access.totalWalkingSeconds ?? access.walkingSeconds;
  if (projected && totalWalkingSeconds > NEARBY_HEAVY_LONG_WALK_HIDE_SECONDS) {
    if (
      typeof access.feederRideSeconds === "number" &&
      access.feederRideSeconds < NEARBY_HEAVY_LONG_WALK_HIDE_SECONDS
    ) {
      return {
        kind: "feeder",
        minutes: Math.max(1, Math.ceil(access.feederRideSeconds / 60)),
        mode: access.feederMode,
      };
    }

    return undefined;
  }

  if (access.kind === "connection" && access.feederMode) {
    return {
      kind: "feeder",
      minutes: Math.max(1, Math.ceil(getNearbyHeavyAccessTravelSeconds(access) / 60)),
      mode: access.feederMode,
    };
  }

  return {
    kind: access.kind === "direct" ? "walking" : "connection",
    minutes: Math.max(1, Math.ceil(getNearbyHeavyAccessTravelSeconds(access) / 60)),
  };
}

/**
 * Pure eligibility rule for a heavy target.
 *
 * A single local feeder keeps the historical rule. A two-transit-section
 * journey is a stricter business case: local TRAM/CABLE first, then one
 * heavy mode, with no BUS/NOCTILIEN section. This is what makes T10 -> RER B
 * reliable while excluding bus-based double connections.
 */
export function evaluateNearbyHeavyJourney(
  input: HeavyJourneyEvaluationInput,
): HeavyJourneyEvaluation | undefined {
  const sections = input.journey.sections.filter((section) => section.durationSeconds >= 0);
  const transitSections = sections.filter(isTransitSection);
  const walkingSections = sections.filter(isWalkingSection);
  const timing = analyzeNearbyJourneyTiming(input.journey);
  const totalSeconds = timing.elapsedSeconds;
  const travelSeconds = timing.scoreSeconds;
  const walkingDistanceMeters = walkingDistance(sections);
  const totalWalkingSeconds = walkingSections.reduce((sum, section) => sum + section.durationSeconds, 0);

  if (totalSeconds > NEARBY_HEAVY_TOTAL_MAX_SECONDS) return undefined;

  if (
    transitSections.length === 0 &&
    (walkingDistanceMeters ?? input.stationDistanceMeters) <= NEARBY_HEAVY_DIRECT_WALK_MAX_METERS
  ) {
    return {
      kind: "direct",
      walkingSeconds: totalWalkingSeconds,
      totalWalkingSeconds,
      totalSeconds,
      movementSeconds: timing.movementSeconds,
      initialWaitSeconds: timing.initialWaitSeconds,
      scoreSeconds: timing.scoreSeconds,
      travelSeconds,
    };
  }

  if (transitSections.length === 1) {
    return evaluateSingleLocalFeeder(
      sections,
      transitSections[0]!,
      totalWalkingSeconds,
      totalSeconds,
      travelSeconds,
      timing,
      input,
    );
  }

  if (transitSections.length !== 2) return undefined;

  const firstTransitIndex = sections.findIndex(isTransitSection);
  const secondTransitIndex = findNextTransitIndex(sections, firstTransitIndex + 1);
  const feeder = transitSections[0]!;
  const heavy = transitSections[1]!;
  const feederMode = sectionLineMode(feeder);
  const heavyMode = sectionLineMode(heavy);

  if (
    secondTransitIndex < 0 ||
    !isLocalFeeder(feeder, input.localLineIds, input.localLineCodes) ||
    !isReliableFeederMode(feederMode) ||
    !isHeavyMode(heavyMode) ||
    isBusLikeMode(feederMode) ||
    isBusLikeMode(heavyMode)
  ) {
    return undefined;
  }

  const feederWalkingSeconds = sections
    .slice(0, firstTransitIndex)
    .filter(isWalkingSection)
    .reduce((sum, section) => sum + section.durationSeconds, 0);
  if (feederWalkingSeconds > NEARBY_HEAVY_FEEDER_WALK_MAX_SECONDS) return undefined;

  return {
    kind: "connection",
    walkingSeconds: feederWalkingSeconds,
    totalWalkingSeconds,
    totalSeconds,
    movementSeconds: timing.movementSeconds,
    initialWaitSeconds: timing.initialWaitSeconds,
    scoreSeconds: timing.scoreSeconds,
    travelSeconds,
    feederLineId: feeder.lineId,
    feederLineCode: findMatchingLocalLineCode(feeder, input.localLineCodes) ?? feeder.lineCode,
    feederMode,
    feederRideSeconds: feeder.durationSeconds,
  };
}

export function chooseBestNearbyHeavyJourney(
  journeys: readonly NearbyJourney[],
  input: Omit<HeavyJourneyEvaluationInput, "journey">,
): HeavyJourneyEvaluation | undefined {
  return listNearbyHeavyJourneyAlternatives(journeys, input)[0];
}

function evaluateSingleLocalFeeder(
  sections: NearbyJourneySection[],
  feeder: NearbyJourneySection,
  totalWalkingSeconds: number,
  totalSeconds: number,
  travelSeconds: number,
  timing: ReturnType<typeof analyzeNearbyJourneyTiming>,
  input: HeavyJourneyEvaluationInput,
): HeavyJourneyEvaluation | undefined {
  const firstTransitIndex = sections.findIndex(isTransitSection);
  const feederWalkingSeconds = firstTransitIndex < 0
    ? 0
    : sections
      .slice(0, firstTransitIndex)
      .filter(isWalkingSection)
      .reduce((sum, section) => sum + section.durationSeconds, 0);
  const feederMode = sectionLineMode(feeder);
  if (
    !isLocalFeeder(feeder, input.localLineIds, input.localLineCodes) ||
    feederWalkingSeconds > NEARBY_HEAVY_FEEDER_WALK_MAX_SECONDS ||
    (isBusLikeMode(feederMode) && travelSeconds > NEARBY_HEAVY_BUS_ACCESS_MAX_SECONDS)
  ) return undefined;

  return {
    kind: "connection",
    walkingSeconds: feederWalkingSeconds,
    totalWalkingSeconds,
    totalSeconds,
    movementSeconds: timing.movementSeconds,
    initialWaitSeconds: timing.initialWaitSeconds,
    scoreSeconds: timing.scoreSeconds,
    travelSeconds,
    feederLineId: feeder.lineId,
    feederLineCode: findMatchingLocalLineCode(feeder, input.localLineCodes) ?? feeder.lineCode,
    feederMode: sectionLineMode(feeder),
    feederRideSeconds: feeder.durationSeconds,
  };
}

function compareHeavyJourneyEvaluations(
  left: HeavyJourneyEvaluation,
  right: HeavyJourneyEvaluation,
): number {
  return left.scoreSeconds - right.scoreSeconds ||
    left.totalSeconds - right.totalSeconds ||
    left.walkingSeconds - right.walkingSeconds ||
    (left.feederRideSeconds ?? Number.POSITIVE_INFINITY) - (right.feederRideSeconds ?? Number.POSITIVE_INFINITY) ||
    (left.feederLineCode ?? left.feederLineId ?? "").localeCompare(right.feederLineCode ?? right.feederLineId ?? "", "fr");
}

function normalizeAccessLineKey(value: string): string {
  return value.trim().toLocaleLowerCase("fr-FR");
}

function findNextTransitIndex(sections: NearbyJourneySection[], start: number): number {
  for (let index = start; index < sections.length; index += 1) {
    if (isTransitSection(sections[index]!)) return index;
  }
  return -1;
}

function isLocalFeeder(
  section: NearbyJourneySection,
  localLineIds?: ReadonlySet<string>,
  localLineCodes?: ReadonlySet<string>,
): boolean {
  if (section.lineId && localLineIds?.has(section.lineId)) return true;
  const sectionReferences = [section.lineCode, ...(section.lineAliases ?? [])]
    .filter((value): value is string => Boolean(value?.trim()));
  return sectionReferences.some((sectionReference) =>
    [...(localLineCodes ?? [])].some((localLineCode) =>
      lineReferenceVariants(sectionReference).some((variant) =>
        lineReferenceVariants(localLineCode).includes(variant),
      ),
    ),
  );
}

function findMatchingLocalLineCode(
  section: NearbyJourneySection,
  localLineCodes?: ReadonlySet<string>,
): string | undefined {
  const sectionReferences = [section.lineCode, ...(section.lineAliases ?? [])]
    .filter((value): value is string => Boolean(value?.trim()));
  return [...(localLineCodes ?? [])].find((localLineCode) =>
    sectionReferences.some((sectionReference) =>
      lineReferenceVariants(sectionReference).some((variant) =>
        lineReferenceVariants(localLineCode).includes(variant),
      ),
    ),
  );
}

function lineReferenceVariants(value: string): string[] {
  const normalized = normalizeAccessLineKey(value);
  const variants = new Set([normalized]);
  const parenthetical = /\((?:ex(?:\.|\s+)?|anciennement\s+)?([^)]*)\)/giu;
  for (const match of normalized.matchAll(parenthetical)) {
    const alias = match[1]?.trim();
    if (alias) variants.add(alias);
  }
  return [...variants];
}

function sectionLineMode(section: NearbyJourneySection): GlobalMapMode | undefined {
  return section.lineMode ?? journeyMode(section.mode);
}

function isHeavyMode(mode: GlobalMapMode | undefined): boolean {
  return Boolean(mode && NEARBY_HEAVY_TRANSPORT_MODES.includes(mode));
}

function isReliableFeederMode(mode: GlobalMapMode | undefined): boolean {
  return Boolean(mode && NEARBY_HEAVY_RELIABLE_FEEDER_MODES.includes(mode));
}

function isBusLikeMode(mode: GlobalMapMode | undefined): boolean {
  return Boolean(mode && NEARBY_HEAVY_BUS_MODES.includes(mode));
}

function journeyMode(value?: string): GlobalMapMode | undefined {
  const mode = (value ?? "").toLocaleLowerCase("fr-FR");
  if (mode === "bus") return "BUS";
  if (mode === "tram" || mode === "tramway") return "TRAM";
  if (mode === "metro" || mode === "métro") return "METRO";
  if (mode === "rer") return "RER";
  if (mode === "train" || mode === "transilien") return "TRANSILIEN";
  if (mode === "noctilien") return "NOCTILIEN";
  if (mode === "cable") return "CABLE";
  return undefined;
}

function walkingDistance(sections: readonly NearbyJourneySection[]): number | undefined {
  const walkingSections = sections.filter(isWalkingSection);
  if (walkingSections.length === 0) return 0;
  if (walkingSections.some((section) =>
    !Number.isFinite(section.distanceMeters) ||
    (section.durationSeconds >= 120 && (section.distanceMeters ?? 0) <= 10),
  )) return undefined;
  return walkingSections.reduce((sum, section) => sum + (section.distanceMeters ?? 0), 0);
}
