import type {
  FrequencyDirection,
  FrequencyValues,
  GtfsLineFrequencyResponse,
} from "../../../src/types/lineFrequency";
import type { LineTopology } from "../topology/types";
import type { ActiveGtfsTimetableTrip, GtfsTimetableLoadResult } from "./timetableTypes";
import {
  buildFrequencyGraph,
  findFrequencyPath,
  frequencyEdgeKey,
  mapFrequencyStops,
} from "./frequencyTopology";

type Period = keyof FrequencyValues;
/** Bump when grouping/windows/aggregation semantics change. */
export const GTFS_FREQUENCY_CALCULATION_VERSION = 2;
const PERIODS: Period[] = ["peakMinutes", "offPeakMinutes", "nightMinutes"];
// Half-open, contiguous civil-day windows. Gaps NEVER cross their boundaries.
export const GTFS_FREQUENCY_WINDOWS: ReadonlyArray<{ start: number; end: number; period: Period }> =
  [
    { start: 0, end: 5 * 3600, period: "nightMinutes" },
    { start: 5 * 3600, end: 7 * 3600, period: "offPeakMinutes" },
    { start: 7 * 3600, end: 9.5 * 3600, period: "peakMinutes" },
    { start: 9.5 * 3600, end: 17.5 * 3600, period: "offPeakMinutes" },
    { start: 17.5 * 3600, end: 19 * 3600, period: "peakMinutes" },
    { start: 19 * 3600, end: 23.5 * 3600, period: "offPeakMinutes" },
    { start: 23.5 * 3600, end: 24 * 3600, period: "nightMinutes" },
  ];

export interface GtfsFrequencyInput {
  lineId: string;
  serviceDate: string;
  timetable: GtfsTimetableLoadResult;
  topology?: LineTopology;
}

interface CallGroup {
  stationId: string;
  topologyId?: string;
  departure: number | null;
}
interface DirectionSamples {
  id: string;
  from?: string;
  to?: string;
  sectionId?: string;
  windows: number[][];
}
type StationSamples = Map<string, Map<string, DirectionSamples>>;

interface LineMovement {
  knownDirections: Set<string>;
  /** Adjacent physical edge: -1 arriving, +1 departing. */
  roles: Map<string, number>;
  sample: DirectionSamples;
}

/** Combine local movements into senses, not branches. Shared incoming/outgoing
 * edges prove compatible orientation; opposite use of an edge forbids merging,
 * even if a feed reuses direction_id for both senses of a loop.
 */
function lineSamplesBySense(
  movements: Map<string, Map<string, LineMovement>>,
  preserveEndpoints: boolean,
): StationSamples {
  const result: StationSamples = new Map();
  const clustered = new Map<string, LineMovement[]>();
  const ambiguousDirections = new Set<string>();
  for (const [stationId, entries] of movements) {
    const groups = [...entries.values()].sort(
      (a, b) => b.roles.size - a.roles.size || a.sample.id.localeCompare(b.sample.id),
    );
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          const a = groups[i]!;
          const b = groups[j]!;
          if (
            [...a.roles].some(([edge, sense]) => b.roles.has(edge) && b.roles.get(edge) !== sense)
          )
            continue;
          const sharesEdge = [...a.roles].some(([edge, sense]) => b.roles.get(edge) === sense);
          const sharesDirection = [...a.knownDirections].some((id) => b.knownDirections.has(id));
          if (!sharesEdge && !sharesDirection) continue;
          for (const [edge, sense] of b.roles) a.roles.set(edge, sense);
          for (const id of b.knownDirections) a.knownDirections.add(id);
          b.sample.windows.forEach((times, window) => a.sample.windows[window]!.push(...times));
          groups.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
    clustered.set(stationId, groups);
    const directions = new Set(groups.flatMap((group) => [...group.knownDirections]));
    for (const direction of directions) {
      if (groups.filter((group) => group.knownDirections.has(direction)).length > 1)
        ambiguousDirections.add(direction);
    }
  }
  for (const [stationId, groups] of clustered) {
    const samples = new Map<string, DirectionSamples>();
    for (const group of groups) {
      const known = group.knownDirections.size === 1 ? [...group.knownDirections][0] : undefined;
      const unambiguous = known !== undefined && !ambiguousDirections.has(known);
      const localId = `sense:${JSON.stringify([stationId, [...group.roles].sort(([a], [b]) => a.localeCompare(b))])}`;
      let id = unambiguous
        ? `gtfs:${known}`
        : group.sample.id.startsWith("gtfs:")
          ? localId
          : group.sample.id;
      if (samples.has(id)) id = localId;
      samples.set(id, {
        ...group.sample,
        id,
        sectionId: undefined,
        from: unambiguous && !preserveEndpoints ? undefined : group.sample.from,
        to: unambiguous && !preserveEndpoints ? undefined : group.sample.to,
      });
    }
    result.set(stationId, samples);
  }
  return result;
}

function mean(values: number[]): number | undefined {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2;
}

function averageValues(values: FrequencyValues[]): FrequencyValues {
  const average: FrequencyValues = {};
  for (const period of PERIODS) {
    const value = mean(
      values.flatMap((sample) => (sample[period] === undefined ? [] : [sample[period]!])),
    );
    if (value !== undefined) average[period] = value;
  }
  return average;
}

function localValues(samples: DirectionSamples): FrequencyValues {
  const gaps: Record<Period, number[]> = { peakMinutes: [], offPeakMinutes: [], nightMinutes: [] };
  const gapsByWindow = GTFS_FREQUENCY_WINDOWS.map(() => [] as number[]);
  samples.windows.forEach((times, windowIndex) => {
    // Simultaneous calls do not create zero-minute service or extra weighting.
    const sorted = [...new Set(times)].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i]! - sorted[i - 1]!;
      if (gap > 0) {
        const minutes = gap / 60;
        const period = GTFS_FREQUENCY_WINDOWS[windowIndex]!.period;
        gaps[period].push(minutes);
        gapsByWindow[windowIndex]!.push(minutes);
      }
    }
  });
  const values: FrequencyValues = {};
  for (const period of PERIODS) {
    const value =
      period === "offPeakMinutes"
        ? (() => {
            const stableSubWindowMedians = GTFS_FREQUENCY_WINDOWS.flatMap((window, index) => {
              const windowGaps = gapsByWindow[index]!;
              if (window.period !== period || windowGaps.length < 2) return [];
              const value = median(windowGaps);
              return value === undefined ? [] : [value];
            });
            // Off-peak is displayed as the slowest stable timetable regime.
            // Sparse windows do not override the global fallback.
            return stableSubWindowMedians.length
              ? Math.max(...stableSubWindowMedians)
              : median(gaps[period]);
          })()
        : median(gaps[period]);
    if (value !== undefined) values[period] = value;
  }
  return values;
}

function summarize(
  samples: StationSamples,
  sectionId?: string,
): {
  average: FrequencyValues;
  directions: FrequencyDirection[];
  sampledStationCount: number;
} {
  const stations: FrequencyValues[] = [];
  const directions = new Map<string, { meta: DirectionSamples; values: FrequencyValues[] }>();
  for (const groups of samples.values()) {
    const local: FrequencyValues[] = [];
    for (const group of groups.values()) {
      if (sectionId !== undefined && group.sectionId !== sectionId) continue;
      const value = localValues(group);
      if (!Object.keys(value).length) continue;
      local.push(value);
      const direction = directions.get(group.id) ?? { meta: group, values: [] };
      direction.values.push(value);
      directions.set(group.id, direction);
    }
    if (local.length) stations.push(averageValues(local));
  }
  return {
    // A busy station/direction has exactly the same weight as a quiet one.
    average: averageValues(stations),
    sampledStationCount: stations.length,
    directions: [...directions.values()]
      .map(({ meta, values }) => ({
        id: meta.id,
        from: meta.from,
        to: meta.to,
        stationCount: values.length,
        ...averageValues(values),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function groupCalls(
  trip: ActiveGtfsTimetableTrip,
  parents: ReadonlyMap<string, string>,
  mappings: ReadonlyMap<string, string>,
): CallGroup[] {
  const groups: CallGroup[] = [];
  for (const call of [...trip.calls].sort((a, b) => a.sequence - b.sequence)) {
    const topologyId = mappings.get(call.stopId);
    const stationId = topologyId ?? parents.get(call.stopId) ?? call.stopId;
    const boardable =
      [0, 2, 3].includes(call.pickupType) &&
      call.departure !== null &&
      Number.isFinite(call.departure);
    const departure = boardable ? call.departure : null;
    const previous = groups.at(-1);
    if (previous?.stationId === stationId) {
      // Adjacent platforms of one parent form one visit. A later return is
      // deliberately NOT deduplicated, including a second loop in one trip.
      if (departure !== null) previous.departure = departure;
    } else {
      groups.push({ stationId, topologyId, departure });
    }
  }
  return groups;
}

/** Pure fixture entry point. No storage, clock, network or mutation of inputs. */
export function computeGtfsLineFrequency(input: GtfsFrequencyInput): GtfsLineFrequencyResponse {
  const { lineId, serviceDate, timetable, topology } = input;
  const descriptor = timetable.index ?? timetable.manifest?.timetable;
  const result: GtfsLineFrequencyResponse = {
    lineId,
    serviceDate,
    source: "gtfs",
    status: timetable.status,
    datasetVersion: timetable.manifest?.datasetVersion,
    sourceUpdatedAt: timetable.manifest?.sourceUpdatedAt,
    coverage: descriptor
      ? { startDate: descriptor.startDate, endDate: descriptor.endDate }
      : undefined,
    topologyAvailable: Boolean(topology),
    branched: false,
    average: {},
    directions: [],
    sections: [],
    stationCount: 0,
    sampledStationCount: 0,
  };
  if (timetable.status !== "ready") return result;
  const stops = timetable.index?.stops ?? [];
  const parents = new Map(stops.map((stop) => [stop.id, stop.parentId || stop.id]));
  const mappings = mapFrequencyStops(stops, topology);
  // Fixtures may use literal topology ids without a stop index; exact ids are safe.
  for (const station of topology?.stations ?? [])
    if (!mappings.has(station.id)) mappings.set(station.id, station.id);
  const graph = topology ? buildFrequencyGraph(topology) : undefined;
  const sections = new Map(graph?.sections.map((section) => [section.id, section]));
  const paths = new Map<string, string[] | undefined>();
  const pathBetween = (from: string, to: string) => {
    const key = frequencyEdgeKey(from, to);
    if (!paths.has(key)) paths.set(key, graph ? findFrequencyPath(graph, from, to) : undefined);
    return paths.get(key);
  };
  const terminalPairs = new Map<string, Set<string>>();
  const recordFullRoute = (stationIds: Array<string | undefined>) => {
    if (!graph || stationIds.some((id) => !id)) return;
    const from = stationIds[0];
    const to = stationIds.at(-1);
    if (!from || !to || from === to || !graph.terminals.has(from) || !graph.terminals.has(to))
      return;
    const pair = JSON.stringify([from, to].sort());
    const traversed = new Set<string>();
    for (let i = 1; i < stationIds.length; i++) {
      if (stationIds[i - 1] === stationIds[i]) continue;
      const path = pathBetween(stationIds[i - 1]!, stationIds[i]!);
      if (!path) return;
      for (let j = 1; j < path.length; j++) {
        traversed.add(frequencyEdgeKey(path[j - 1]!, path[j]!));
        traversed.add(frequencyEdgeKey(path[j]!, path[j - 1]!));
      }
    }
    for (const section of graph.sections) {
      if (
        !section.stationIds
          .slice(1)
          .every((id, i) => traversed.has(frequencyEdgeKey(section.stationIds[i]!, id)))
      )
        continue;
      const pairs = terminalPairs.get(section.id) ?? new Set<string>();
      pairs.add(pair);
      terminalPairs.set(section.id, pairs);
    }
  };
  for (const pattern of topology?.patterns ?? []) recordFullRoute(pattern.stops);

  const samples: StationSamples = new Map();
  const lineMovements = new Map<string, Map<string, LineMovement>>();
  const servedStations = new Set<string>();
  const seenTrips = new Set<string>();
  for (const trip of timetable.trips) {
    // Loading adjacent service days can return the same trip id on two dates.
    const identity = JSON.stringify([trip.serviceDate, trip.id]);
    if (seenTrips.has(identity)) continue;
    seenTrips.add(identity);
    const calls = groupCalls(trip, parents, mappings);
    recordFullRoute(calls.map((call) => call.topologyId));
    for (const call of calls) servedStations.add(call.stationId);
    for (let i = 0; i < calls.length - 1; i++) {
      const call = calls[i]!;
      const next = calls[i + 1]!;
      if (call.departure === null) continue;
      const windowIndex = GTFS_FREQUENCY_WINDOWS.findIndex(
        (window) => call.departure! >= window.start && call.departure! < window.end,
      );
      if (windowIndex < 0) continue;
      const path =
        call.topologyId && next.topologyId
          ? pathBetween(call.topologyId, next.topologyId)
          : undefined;
      const edge =
        path && path.length > 1
          ? graph?.edges.get(frequencyEdgeKey(path[0]!, path[1]!))
          : undefined;
      const section = edge ? sections.get(edge.sectionId) : undefined;
      // Section + sense pools interleaved destinations without combining the
      // reverse flow. Unknown topology/direction uses a local outgoing corridor,
      // never one catch-all "unknown" bucket shared by incompatible trips.
      const directionId = edge
        ? `${edge.sectionId}:${edge.forward ? "forward" : "reverse"}`
        : trip.directionId !== undefined && trip.directionId !== ""
          ? `gtfs:${trip.directionId}`
          : `unknown:${frequencyEdgeKey(call.stationId, next.stationId)}`;
      const station = samples.get(call.stationId) ?? new Map<string, DirectionSamples>();
      const group: DirectionSamples = station.get(directionId) ?? {
        id: directionId,
        sectionId: edge?.sectionId,
        from: section ? (edge!.forward ? section.from.name : section.to.name) : undefined,
        to: section ? (edge!.forward ? section.to.name : section.from.name) : undefined,
        windows: GTFS_FREQUENCY_WINDOWS.map(() => []),
      };
      group.windows[windowIndex]!.push(call.departure);
      station.set(directionId, group);
      samples.set(call.stationId, station);

      const previous =
        calls[i - 1] ?? (calls.at(-1)?.stationId === call.stationId ? calls.at(-2) : undefined);
      const incomingPath =
        previous?.topologyId && call.topologyId
          ? pathBetween(previous.topologyId, call.topologyId)
          : undefined;
      const incoming = incomingPath?.at(-2) ?? previous?.stationId;
      const outgoing = path?.[1] ?? next.stationId;
      const roles = new Map<string, number>();
      // At a reversal, the departure edge determines boarding sense.
      if (incoming && incoming !== outgoing) roles.set(incoming, -1);
      roles.set(outgoing, 1);
      const incomingEdge =
        incomingPath && incomingPath.length > 1
          ? graph?.edges.get(frequencyEdgeKey(incomingPath.at(-2)!, incomingPath.at(-1)!))
          : undefined;
      if (incomingEdge)
        roles.set(`orientation:${incomingEdge.sectionId}`, incomingEdge.forward ? 1 : -1);
      if (edge) roles.set(`orientation:${edge.sectionId}`, edge.forward ? 1 : -1);
      const movementKey = JSON.stringify([trip.directionId, [...roles]]);
      const movements = lineMovements.get(call.stationId) ?? new Map<string, LineMovement>();
      const movement: LineMovement = movements.get(movementKey) ?? {
        knownDirections: new Set(trip.directionId ? [trip.directionId] : []),
        roles,
        sample: { ...group, windows: GTFS_FREQUENCY_WINDOWS.map(() => []) },
      };
      movement.sample.windows[windowIndex]!.push(call.departure);
      movements.set(movementKey, movement);
      lineMovements.set(call.stationId, movements);
    }
  }
  const summary = summarize(lineSamplesBySense(lineMovements, graph?.sections.length === 1));
  result.average = summary.average;
  result.directions = summary.directions;
  result.sampledStationCount = summary.sampledStationCount;
  result.stationCount = servedStations.size;
  result.status = Object.keys(result.average).length ? "ready" : "insufficient";
  if (graph) {
    result.branched = [...graph.neighbors.values()].some((adjacent) => adjacent.size > 2);
    const maximum = Math.max(0, ...[...terminalPairs.values()].map((pairs) => pairs.size));
    const central = [...terminalPairs].filter(([, pairs]) => pairs.size === maximum);
    const centralId = maximum >= 2 && central.length === 1 ? central[0]![0] : undefined;
    result.sections = graph.sections.map((section) => {
      const sectionSummary = summarize(samples, section.id);
      return {
        ...section,
        kind: section.id === centralId ? "central" : section.kind,
        average: sectionSummary.average,
        directions: sectionSummary.directions,
      };
    });
  }
  return result;
}

/** Current Paris weekday; on weekends use next Monday (civil arithmetic, DST safe). */
export function getGtfsFrequencyServiceDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((value) => value.type === type)!.value);
  const civil = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  const day = civil.getUTCDay();
  if (day === 0 || day === 6) civil.setUTCDate(civil.getUTCDate() + (day === 0 ? 1 : 2));
  return civil.toISOString().slice(0, 10).replaceAll("-", "");
}
