import type { TranslationKey } from "../../i18n";
import type {
  GtfsLineTimetableCall,
  GtfsLineTimetableStop,
  GtfsLineTimetableTrip,
} from "../../types/lineFrequencyTimetable";

export interface GtfsLineTimetableWindow {
  key: string;
  startSeconds: number;
  endSeconds: number;
  label: TranslationKey;
}

/**
 * NeTEx and GTFS can prefix the same stop-place identifier differently. Keep
 * the conservative, identifier-based part when it is available so a line
 * section can be matched without a line-specific alias table.
 */
export function canonicalGtfsTimetableStationId(value: string): string {
  const monomodal = value.match(/monomodalStopPlace:(\d+)/iu);
  return monomodal ? `monomodalStopPlace:${monomodal[1]}` : value;
}

/**
 * The same generic service-day bands used by the frequency computation. They
 * are deliberately line-agnostic: the timetable fills each cell from the
 * actual departures found in that band.
 */
export const GTFS_LINE_TIMETABLE_WINDOWS = [
  {
    key: "beforeFive",
    startSeconds: 0,
    endSeconds: 5 * 3600,
    label: "globalMap.sidebar.gtfsFrequency.timetableBeforeFive",
  },
  {
    key: "fiveToSeven",
    startSeconds: 5 * 3600,
    endSeconds: 7 * 3600,
    label: "globalMap.sidebar.gtfsFrequency.timetableFiveToSeven",
  },
  {
    key: "sevenToNineThirty",
    startSeconds: 7 * 3600,
    endSeconds: 9.5 * 3600,
    label: "globalMap.sidebar.gtfsFrequency.timetableSevenToNineThirty",
  },
  {
    key: "nineThirtyToSeventeenThirty",
    startSeconds: 9.5 * 3600,
    endSeconds: 17.5 * 3600,
    label: "globalMap.sidebar.gtfsFrequency.timetableNineThirtyToSeventeenThirty",
  },
  {
    key: "seventeenThirtyToNineteen",
    startSeconds: 17.5 * 3600,
    endSeconds: 19 * 3600,
    label: "globalMap.sidebar.gtfsFrequency.timetableSeventeenThirtyToNineteen",
  },
  {
    key: "nineteenToTwentyThreeThirty",
    startSeconds: 19 * 3600,
    endSeconds: 23.5 * 3600,
    label: "globalMap.sidebar.gtfsFrequency.timetableNineteenToTwentyThreeThirty",
  },
  {
    key: "afterTwentyThreeThirty",
    startSeconds: 23.5 * 3600,
    endSeconds: 24 * 3600,
    label: "globalMap.sidebar.gtfsFrequency.timetableAfterTwentyThreeThirty",
  },
] as const satisfies readonly GtfsLineTimetableWindow[];

export interface GtfsTimetableInterval {
  /** Raw minutes are kept so callers can round only at presentation time. */
  minMinutes: number;
  maxMinutes: number;
}

function median(values: readonly number[]): number | undefined {
  if (!values.length) return undefined;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

export function isBoardableGtfsTimetableCall(call: GtfsLineTimetableCall): boolean {
  return (
    [0, 2, 3].includes(call.pickupType) &&
    call.departure !== null &&
    Number.isFinite(call.departure)
  );
}

/**
 * Builds a human-readable interval range for one direction and one time band.
 * Departures are compared at each station (parent stop when available), then
 * each station contributes its median headway. Taking the range of those
 * medians avoids letting one missed/duplicated departure at an endpoint make
 * the whole line look like it has an unusably wide interval. Gaps crossing a
 * time-band boundary stay out of both bands, so each table cell describes only
 * its own period.
 */
export function calculateGtfsTimetableInterval(
  trips: readonly GtfsLineTimetableTrip[],
  window: GtfsLineTimetableWindow,
  stopsById?: ReadonlyMap<string, GtfsLineTimetableStop>,
  allowedStationIds?: ReadonlySet<string>,
): GtfsTimetableInterval | undefined {
  const departuresByStation = new Map<string, Set<number>>();
  const canonicalAllowedStationIds = allowedStationIds
    ? new Set([...allowedStationIds].map(canonicalGtfsTimetableStationId))
    : undefined;

  for (const trip of trips) {
    for (const call of trip.calls) {
      if (!isBoardableGtfsTimetableCall(call)) continue;
      const departure = call.departure;
      if (departure === null || departure < window.startSeconds || departure >= window.endSeconds) {
        continue;
      }

      const stop = stopsById?.get(call.stopId);
      const stationKey = stop?.parentId ?? call.stopId;
      const topologyStationKey = stop?.topologyId;
      const canonicalStopId = canonicalGtfsTimetableStationId(call.stopId);
      const canonicalStationKey = canonicalGtfsTimetableStationId(stationKey);
      const canonicalTopologyStationKey = topologyStationKey
        ? canonicalGtfsTimetableStationId(topologyStationKey)
        : undefined;
      if (
        allowedStationIds &&
        !allowedStationIds.has(call.stopId) &&
        !allowedStationIds.has(stationKey) &&
        !allowedStationIds.has(topologyStationKey ?? "") &&
        !canonicalAllowedStationIds?.has(canonicalStopId) &&
        !canonicalAllowedStationIds?.has(canonicalStationKey) &&
        !canonicalAllowedStationIds?.has(canonicalTopologyStationKey ?? "")
      ) {
        continue;
      }
      const departures = departuresByStation.get(stationKey) ?? new Set<number>();
      departures.add(departure);
      departuresByStation.set(stationKey, departures);
    }
  }

  const stationMedians: number[] = [];
  for (const departures of departuresByStation.values()) {
    const ordered = [...departures].sort((left, right) => left - right);
    const gaps: number[] = [];
    for (let index = 1; index < ordered.length; index += 1) {
      const gapSeconds = ordered[index]! - ordered[index - 1]!;
      if (gapSeconds > 0) gaps.push(gapSeconds / 60);
    }
    // A station with a single passage cannot tell us anything about a
    // frequency. It must not influence the range or create a fake interval.
    if (gaps.length < 2) continue;
    const value = median(gaps);
    if (value !== undefined) stationMedians.push(value);
  }

  if (!stationMedians.length) return undefined;
  return {
    minMinutes: Math.min(...stationMedians),
    maxMinutes: Math.max(...stationMedians),
  };
}
