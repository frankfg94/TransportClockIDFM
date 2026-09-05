export interface StopSequencePattern {
  id: string;
  stops: string[];
}

export interface WeightedStopSequencePattern extends StopSequencePattern {
  tripCount?: number;
}

/**
 * Drops extremely rare topology variants before rendering a whole-line map.
 * NeTEx can retain obsolete journey patterns after their GTFS shapes disappear;
 * one such ghost branch must not force an otherwise precise line to use chords.
 */
export function selectRepresentativeStopSequencePatterns<
  T extends WeightedStopSequencePattern,
>(patterns: T[] = []): T[] {
  const maximumTripCount = Math.max(
    0,
    ...patterns.map((pattern) => pattern.tripCount ?? 0),
  );
  const minimumTripCount =
    maximumTripCount >= 20
      ? Math.max(2, Math.ceil(maximumTripCount * 0.1))
      : 1;
  const representative = patterns.filter(
    (pattern) =>
      pattern.tripCount === undefined ||
      pattern.tripCount >= minimumTripCount,
  );

  return selectMaximalStopSequencePatterns(
    representative.length > 0 ? representative : patterns,
  );
}

/**
 * Keeps complete route variants while removing duplicates, reverse duplicates,
 * and shorter patterns already contained in a longer route.
 */
export function selectMaximalStopSequencePatterns<T extends StopSequencePattern>(
  patterns: T[] = [],
): T[] {
  const candidates = [...patterns]
    .filter((pattern) => pattern.stops.length >= 2)
    .sort((left, right) => right.stops.length - left.stops.length);
  const selected: T[] = [];

  for (const candidate of candidates) {
    const reversedStops = [...candidate.stops].reverse();
    const alreadyCovered = selected.some(
      (parent) =>
        containsStopSequence(parent.stops, candidate.stops) ||
        containsStopSequence(parent.stops, reversedStops),
    );

    if (!alreadyCovered) selected.push(candidate);
  }

  return selected;
}

/**
 * Selects the longest directional variants while retaining an explicit
 * reverse service. The physical graph compiler uses
 * selectMaximalStopSequencePatterns, where a reverse traversal is redundant;
 * the map direction picker needs both traversals to expose the user's choice.
 */
export function selectDirectionalStopSequencePatterns<T extends StopSequencePattern>(
  patterns: T[] = [],
): T[] {
  const candidates = [...patterns]
    .filter((pattern) => pattern.stops.length >= 2)
    .sort((left, right) => right.stops.length - left.stops.length);
  const selected: T[] = [];

  for (const candidate of candidates) {
    const alreadyCovered = selected.some((parent) =>
      containsStopSequence(parent.stops, candidate.stops),
    );

    if (!alreadyCovered) selected.push(candidate);
  }

  return selected;
}

function containsStopSequence(parent: string[], candidate: string[]): boolean {
  if (candidate.length > parent.length) return false;

  return parent.some((_, start) =>
    candidate.every((stopId, offset) => parent[start + offset] === stopId),
  );
}
