import type { GtfsTimetableLoadResult } from "../../../shared/gtfs/timetableTypes";

type Loader = (baseUrl: string, lineId: string, date: string, options: { retainServiceDayTrips: boolean }) => Promise<GtfsTimetableLoadResult>;

/** Retain one normalized line: the adjacent frequency/last-departure pair
 * shares its reads and normalization without retaining several large lines. */
export function createNeighborhoodTimetableCache(load: Loader) {
  let cached: { key: string; promise: Promise<GtfsTimetableLoadResult> } | undefined;
  return async (baseUrl: string, lineId: string, date: string, version: string) => {
    const key = JSON.stringify([baseUrl, lineId.trim().replace(/^line:/iu, ""), date, version]);
    if (cached?.key === key) return cached.promise;
    const promise = load(baseUrl, lineId, date, { retainServiceDayTrips: true });
    cached = { key, promise };
    void promise.then(result => {
      if (result.status !== "ready" && cached?.promise === promise) cached = undefined;
    }, () => { if (cached?.promise === promise) cached = undefined; });
    return promise;
  };
}

/** Match the original civil-day loader, including trips from the previous
 * service day which run after midnight. */
export function selectNeighborhoodCivilTimetable(loaded: GtfsTimetableLoadResult): GtfsTimetableLoadResult {
  return { ...loaded, trips: loaded.trips.filter(trip => trip.calls.some(call => {
    const time = call.departure ?? call.arrival;
    return time !== null && time >= 0 && time < 86400;
  })) };
}

/** Keep the complete requested service day, including departures after 24:00.
 * Previous-day spillovers belong to frequency, not to the last departure. */
export function selectNeighborhoodServiceTimetable(loaded: GtfsTimetableLoadResult, date: string): GtfsTimetableLoadResult {
  if (loaded.status === "ready" && loaded.index && (date < loaded.index.startDate || date > loaded.index.endDate)) {
    return { ...loaded, status: "out-of-coverage", trips: [] };
  }
  return { ...loaded, trips: loaded.trips.filter(trip => trip.serviceDate === date) };
}
