import type { NearbyJourney, NearbyJourneySection } from "./nearbyHeavyTransports";

/**
 * Durations exposed by the neighborhood score for one real journey.
 *
 * `elapsedSeconds` is Navitia's full elapsed duration. The score removes only
 * the initial wait before the first vehicle; waits between later vehicles are
 * deliberately kept in `scoreSeconds`.
 */
export interface NearbyJourneyTiming {
  elapsedSeconds: number;
  initialWaitSeconds: number;
  movementSeconds: number;
  scoreSeconds: number;
  firstTransitIndex: number;
}

export function analyzeNearbyJourneyTiming(journey: NearbyJourney): NearbyJourneyTiming {
  const sections = journey.sections.filter((section) => finiteNonNegative(section.durationSeconds) !== undefined);
  const elapsedSeconds = finiteNonNegative(journey.durationSeconds)
    ?? sections.reduce((sum, section) => sum + section.durationSeconds, 0);
  const firstTransitIndex = sections.findIndex(isNearbyJourneyTransitSection);
  const movementSeconds = sections
    .filter((section) => !isNearbyJourneyWaitingSection(section))
    .reduce((sum, section) => sum + section.durationSeconds, 0);

  if (firstTransitIndex < 0) {
    return {
      elapsedSeconds,
      initialWaitSeconds: 0,
      movementSeconds,
      scoreSeconds: elapsedSeconds,
      firstTransitIndex,
    };
  }

  const beforeFirstTransit = sections.slice(0, firstTransitIndex);
  const explicitWaitSeconds = beforeFirstTransit
    .filter(isNearbyJourneyWaitingSection)
    .reduce((sum, section) => sum + section.durationSeconds, 0);
  const walkingBeforeFirstTransit = beforeFirstTransit
    .filter(isNearbyJourneyWalkingSection)
    .reduce((sum, section) => sum + section.durationSeconds, 0);
  const routeStart = parseJourneyDateTime(
    journey.departureDateTime
      ?? sections[0]?.departureDateTime,
  );
  const firstTransitDeparture = parseJourneyDateTime(sections[firstTransitIndex]?.departureDateTime);
  const timestampWaitSeconds = routeStart !== undefined && firstTransitDeparture !== undefined
    ? Math.max(0, (firstTransitDeparture - routeStart) / 1_000 - walkingBeforeFirstTransit)
    : 0;
  const initialWaitSeconds = Math.max(explicitWaitSeconds, timestampWaitSeconds);

  return {
    elapsedSeconds,
    initialWaitSeconds,
    movementSeconds,
    scoreSeconds: Math.max(0, elapsedSeconds - initialWaitSeconds),
    firstTransitIndex,
  };
}

export function isNearbyJourneyWaitingSection(section: NearbyJourneySection): boolean {
  const type = (section.type ?? "").toLocaleLowerCase("fr-FR");
  const mode = (section.mode ?? "").toLocaleLowerCase("fr-FR");
  return type.includes("waiting")
    || type.includes("wait")
    || type.includes("boarding")
    || mode.includes("waiting")
    || mode.includes("boarding");
}

export function isNearbyJourneyWalkingSection(section: NearbyJourneySection): boolean {
  const type = (section.type ?? "").toLocaleLowerCase("fr-FR");
  const mode = (section.mode ?? "").toLocaleLowerCase("fr-FR");
  if (
    type.includes("public_transport")
    || type.includes("public-transport")
    || Boolean(section.lineId || section.lineCode || section.lineMode)
  ) return false;
  return type.includes("street")
    || type.includes("walking")
    || type.includes("transfer")
    || mode === "walking"
    || mode === "pedestrian"
    || (!type && !mode);
}

export function isNearbyJourneyTransitSection(section: NearbyJourneySection): boolean {
  if (isNearbyJourneyWalkingSection(section) || isNearbyJourneyWaitingSection(section)) return false;
  const type = (section.type ?? "").toLocaleLowerCase("fr-FR");
  return type.includes("public_transport")
    || type.includes("public-transport")
    || Boolean(section.lineId || section.lineCode || section.lineMode);
}

function parseJourneyDateTime(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const compact = value.trim().match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/u);
  if (compact) {
    const date = new Date(
      Number(compact[1]),
      Number(compact[2]) - 1,
      Number(compact[3]),
      Number(compact[4]),
      Number(compact[5]),
      Number(compact[6] ?? "0"),
    );
    return Number.isFinite(date.getTime()) ? date.getTime() : undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function finiteNonNegative(value: number | undefined): number | undefined {
  return Number.isFinite(value) && (value ?? -1) >= 0 ? value : undefined;
}
