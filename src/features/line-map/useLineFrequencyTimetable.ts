import type { GtfsLineFrequencyResponse, FrequencySection } from "../../types/lineFrequency";
import type {
  GtfsLineTimetableResponse,
  GtfsLineTimetableStop,
} from "../../types/lineFrequencyTimetable";
import { fetchGtfsLineFrequency } from "../../services/lineFrequency";
import { fetchGtfsLineTimetable } from "../../services/lineFrequencyTimetable";
import { canonicalGtfsTimetableStationId } from "./lineFrequencyTimetableIntervals";

export interface GtfsLastService {
  seconds: number;
  stopName?: string;
}

export interface UseLineFrequencyTimetableOptions {
  fetchFrequency?: typeof fetchGtfsLineFrequency;
  fetchTimetable?: typeof fetchGtfsLineTimetable;
}

/**
 * Shared GTFS source for line frequency cards and nearby-neighborhood facts.
 * A station lookup narrows a branched line to the section that actually serves
 * that station; without a station the line-level profile is returned.
 */
export function useLineFrequencyTimetable(options: UseLineFrequencyTimetableOptions = {}) {
  const loadFrequency = options.fetchFrequency ?? fetchGtfsLineFrequency;
  const loadTimetable = options.fetchTimetable ?? fetchGtfsLineTimetable;
  const frequencyCache = new Map<string, Promise<GtfsLineFrequencyResponse>>();
  const timetableCache = new Map<string, Promise<GtfsLineTimetableResponse>>();

  async function getFrequencies(
    lineId: string,
    stationId?: string,
    requestOptions: { signal?: AbortSignal } = {},
  ): Promise<GtfsLineFrequencyResponse> {
    const key = lineId.trim();
    let pending = frequencyCache.get(key);
    if (!pending) {
      pending = loadFrequency(key, requestOptions);
      frequencyCache.set(key, pending);
      void pending.catch(() => {
        if (frequencyCache.get(key) === pending) frequencyCache.delete(key);
      });
    }
    const profile = await pending;
    return selectFrequencySection(profile, stationId);
  }

  async function getTimetable(
    lineId: string,
    requestOptions: { serviceDate?: string; signal?: AbortSignal } = {},
  ): Promise<GtfsLineTimetableResponse> {
    const key = `${lineId.trim()}:${requestOptions.serviceDate ?? "current"}`;
    let pending = timetableCache.get(key);
    if (!pending) {
      pending = loadTimetable(lineId.trim(), requestOptions);
      timetableCache.set(key, pending);
      void pending.catch(() => {
        if (timetableCache.get(key) === pending) timetableCache.delete(key);
      });
    }
    return pending;
  }

  async function getLastService(
    lineId: string,
    stationId?: string,
    requestOptions: { serviceDate?: string; signal?: AbortSignal } = {},
  ): Promise<GtfsLastService | undefined> {
    const timetable = await getTimetable(lineId, requestOptions);
    if (timetable.status !== "ready") return undefined;

    const matchingStops = stationId
      ? timetable.stops.filter((stop) => stopMatchesStation(stop, stationId))
      : timetable.stops;
    const stopIds = new Set(matchingStops.map((stop) => stop.id));
    if (stopIds.size === 0 && stationId) return undefined;

    let latest: GtfsLastService | undefined;
    for (const trip of timetable.trips) {
      for (const call of trip.calls) {
        if (!stopIds.has(call.stopId)) continue;
        const seconds = call.departure ?? call.arrival;
        if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) continue;
        if (!latest || seconds > latest.seconds) {
          latest = {
            seconds,
            stopName: timetable.stops.find((stop) => stop.id === call.stopId)?.name,
          };
        }
      }
    }
    return latest;
  }

  return { getFrequencies, getTimetable, getLastService, selectFrequencySection };
}

export function selectFrequencySection(
  profile: GtfsLineFrequencyResponse,
  stationId?: string,
): GtfsLineFrequencyResponse {
  const normalizedStationId = stationId?.trim();
  if (!normalizedStationId || profile.sections.length === 0) return profile;

  const matchingSections = profile.sections.filter((section) => section.stationIds.some((id) =>
    canonicalGtfsTimetableStationId(id) === canonicalGtfsTimetableStationId(normalizedStationId),
  ));
  const section = [...matchingSections].sort(compareFrequencySections)[0];
  if (!section) return profile;

  return {
    ...profile,
    average: { ...section.average },
    directions: section.directions.map((direction) => ({ ...direction })),
    sections: [section],
    branched: false,
    stationCount: section.stationIds.length,
    sampledStationCount: section.stationIds.length,
  };
}

function compareFrequencySections(left: FrequencySection, right: FrequencySection): number {
  return Number(right.kind === "central") - Number(left.kind === "central")
    || right.stationIds.length - left.stationIds.length
    || left.id.localeCompare(right.id);
}

function stopMatchesStation(stop: GtfsLineTimetableStop, stationId: string): boolean {
  const wanted = canonicalGtfsTimetableStationId(stationId);
  return [stop.id, stop.parentId, stop.topologyId]
    .filter((value): value is string => Boolean(value))
    .some((value) => canonicalGtfsTimetableStationId(value) === wanted);
}
