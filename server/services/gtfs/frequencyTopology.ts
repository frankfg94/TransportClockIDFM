import type { FrequencySection } from "../../../src/types/lineFrequency";
import { resolveTransitLonLat } from "../../../src/features/network-ghost/geoProjection";
import { getCoordinatesDistanceMeters } from "../../../src/services/distance";
import type { LineTopology } from "../topology/types";
import type { GtfsTimetableStop } from "./timetableTypes";

export interface FrequencyGraph {
  neighbors: Map<string, Set<string>>;
  sections: FrequencySection[];
  edges: Map<string, { sectionId: string; forward: boolean }>;
  terminals: Set<string>;
}

export const frequencyEdgeKey = (from: string, to: string): string => JSON.stringify([from, to]);

/** Physical graph only: short workings and express trips cannot create forks. */
export function buildFrequencyGraph(topology: LineTopology): FrequencyGraph {
  const stations = new Map(topology.stations.map((station) => [station.id, station]));
  const neighbors = new Map<string, Set<string>>();
  const addEdge = (from: string, to: string) => {
    if (from === to || !stations.has(from) || !stations.has(to)) return;
    for (const [a, b] of [
      [from, to],
      [to, from],
    ] as const) {
      const adjacent = neighbors.get(a) ?? new Set<string>();
      adjacent.add(b);
      neighbors.set(a, adjacent);
    }
  };
  if (topology.segments.length) {
    for (const segment of topology.segments) addEdge(segment.from, segment.to);
  } else {
    for (const pattern of topology.patterns) {
      for (let i = 1; i < pattern.stops.length; i++)
        addEdge(pattern.stops[i - 1]!, pattern.stops[i]!);
    }
  }
  const terminals = new Set(
    [...neighbors].filter(([, adjacent]) => adjacent.size === 1).map(([id]) => id),
  );
  const boundaries = [...neighbors]
    .filter(([, adjacent]) => adjacent.size !== 2)
    .map(([id]) => id)
    .sort();
  const visited = new Set<string>();
  const sections: FrequencySection[] = [];
  const edges: FrequencyGraph["edges"] = new Map();
  const walk = (start: string, next: string) => {
    if (visited.has(frequencyEdgeKey(start, next))) return;
    const ids = [start];
    let previous = start;
    let current = next;
    while (true) {
      visited.add(frequencyEdgeKey(previous, current));
      visited.add(frequencyEdgeKey(current, previous));
      ids.push(current);
      const adjacent = neighbors.get(current)!;
      if (current === start || adjacent.size !== 2) break;
      const following = [...adjacent].find((id) => id !== previous)!;
      if (visited.has(frequencyEdgeKey(current, following))) break;
      previous = current;
      current = following;
    }
    // Stable ids and orientation, independent of input segment order/direction.
    if (ids[0]! > ids.at(-1)!) ids.reverse();
    const id = `section:${JSON.stringify(ids)}`;
    const from = stations.get(ids[0]!)!;
    const to = stations.get(ids.at(-1)!)!;
    sections.push({
      id,
      kind: terminals.has(from.id) || terminals.has(to.id) ? "branch" : "shared",
      from: { id: from.id, name: from.name },
      to: { id: to.id, name: to.name },
      stationIds: ids,
      average: {},
      directions: [],
    });
    for (let i = 1; i < ids.length; i++) {
      edges.set(frequencyEdgeKey(ids[i - 1]!, ids[i]!), { sectionId: id, forward: true });
      edges.set(frequencyEdgeKey(ids[i]!, ids[i - 1]!), { sectionId: id, forward: false });
    }
  };
  for (const start of boundaries) {
    for (const next of [...neighbors.get(start)!].sort()) walk(start, next);
  }
  // Components made entirely of degree-two stations are closed loops.
  for (const start of [...neighbors.keys()].sort()) {
    for (const next of [...neighbors.get(start)!].sort()) walk(start, next);
  }
  sections.sort((a, b) => a.id.localeCompare(b.id));
  if (sections.length === 1) sections[0]!.kind = "shared";
  return { neighbors, sections, edges, terminals };
}

/** Do not choose arbitrarily between equally plausible routes around a loop. */
export function findFrequencyPath(
  graph: FrequencyGraph,
  from: string,
  to: string,
): string[] | undefined {
  if (from === to || !graph.neighbors.has(from) || !graph.neighbors.has(to)) return undefined;
  const queue = [from];
  const depth = new Map([[from, 0]]);
  const ways = new Map([[from, 1]]);
  const previous = new Map<string, string>();
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!;
    if (depth.has(to) && depth.get(current)! >= depth.get(to)!) break;
    for (const neighbor of graph.neighbors.get(current)!) {
      const distance = depth.get(current)! + 1;
      if (!depth.has(neighbor)) {
        depth.set(neighbor, distance);
        ways.set(neighbor, ways.get(current)!);
        previous.set(neighbor, current);
        queue.push(neighbor);
      } else if (depth.get(neighbor) === distance) {
        ways.set(neighbor, Math.min(2, ways.get(neighbor)! + ways.get(current)!));
      }
    }
  }
  if (ways.get(to) !== 1) return undefined;
  const path = [to];
  while (path[0] !== from) path.unshift(previous.get(path[0]!)!);
  return path;
}

const normalizeName = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Exact identifiers, explicit monitoring refs, then conservative line-local matching.
 * In particular, a NeTEx StopPlace/Quay numeric suffix is NEVER a GTFS id.
 */
export function mapFrequencyStops(
  stops: readonly GtfsTimetableStop[],
  topology?: LineTopology,
): Map<string, string> {
  const mapping = new Map<string, string>();
  if (!topology) return mapping;
  const exact = new Map<string, Set<string>>();
  const add = (key: string | undefined, stationId: string) => {
    if (!key) return;
    const ids = exact.get(key) ?? new Set<string>();
    ids.add(stationId);
    exact.set(key, ids);
  };
  for (const station of topology.stations) {
    for (const id of [
      station.id,
      ...(station.aliases ?? []),
      ...(station.quays ?? []).map((q) => q.id),
    ])
      add(id, station.id);
  }
  for (const pattern of topology.patterns) {
    pattern.stops.forEach((stationId, i) => {
      const ref = pattern.monitoringRefs?.[i];
      add(ref, stationId);
      const code = ref?.match(/^STIF:StopArea:SP:([^:]+):?$/iu)?.[1];
      if (code) add(`IDFM:${code}`, stationId);
    });
  }
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  const candidates = topology.stations.map((station) => ({
    station,
    name: normalizeName(station.name),
    coordinate: resolveTransitLonLat(station),
  }));
  for (const stop of stops) {
    const identifiers = new Set([
      ...(exact.get(stop.id) ?? []),
      ...(exact.get(stop.parentId ?? "") ?? []),
    ]);
    if (identifiers.size === 1) {
      mapping.set(stop.id, [...identifiers][0]!);
      continue;
    }
    if (identifiers.size > 1) continue;
    const parent = byId.get(stop.parentId ?? "");
    const coordinate =
      resolveTransitLonLat(stop) ?? (parent ? resolveTransitLonLat(parent) : undefined);
    const name = normalizeName(parent?.name || stop.name);
    const ranked = candidates.map((candidate) => ({
      ...candidate,
      distance:
        coordinate && candidate.coordinate
          ? getCoordinatesDistanceMeters(
              coordinate.lat,
              coordinate.lon,
              candidate.coordinate.lat,
              candidate.coordinate.lon,
            )
          : undefined,
    }));
    const named = ranked.filter(
      (candidate) =>
        name &&
        candidate.name === name &&
        (candidate.distance === undefined || candidate.distance <= 450),
    );
    if (named.length === 1) {
      mapping.set(stop.id, named[0]!.station.id);
      continue;
    }
    const nearby = ranked
      .filter((candidate) => candidate.distance !== undefined && candidate.distance <= 120)
      .sort((a, b) => a.distance! - b.distance!);
    if (
      nearby.length &&
      (nearby.length === 1 || nearby[1]!.distance! - nearby[0]!.distance! >= 40)
    ) {
      mapping.set(stop.id, nearby[0]!.station.id);
    }
  }
  return mapping;
}
