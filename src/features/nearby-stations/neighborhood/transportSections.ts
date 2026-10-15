import type { LineTopology } from "../../../../server/services/topology/types";
import { buildFrequencyGraph, mapFrequencyStops } from "../../../../shared/gtfs/frequencyTopology";
import type { NearbyJourney } from "../nearbyHeavyTransports";

export interface NeighborhoodTransportSection {
  id: string;
  kind: "branch" | "shared" | "junction" | "unclassified";
  /** Raw station names; the surrounding words are translated in the view. */
  label?: string;
}

const graphs = new WeakMap<LineTopology, ReturnType<typeof buildFrequencyGraph>>();

/** Use the complete physical graph, never a station-selected frequency profile. */
export function resolveTransportSection(
  topology: LineTopology | undefined,
  station: { id: string; name: string; lon?: number; lat?: number },
  journey?: NearbyJourney,
): NeighborhoodTransportSection | undefined {
  if (!topology) return undefined;
  let graph = graphs.get(topology);
  if (!graph) {
    graph = buildFrequencyGraph(topology);
    graphs.set(topology, graph);
  }
  if (!graph.sections.length) return undefined;
  // A final footpath can change the platform actually reached. Its endpoint
  // takes precedence over the preceding vehicle's arrival and the map marker.
  const end = journey?.sections.findLast(section => section.toStopPointId || section.toStopAreaId || section.toPoint || section.toName);
  const stop = end ? {
    id: end.toStopPointId ?? end.toStopAreaId ?? "journey-end",
    parentId: end.toStopAreaId,
    name: end.toName ?? station.name,
    ...end.toPoint,
  } : station;
  const stationId = mapFrequencyStops([stop], topology).get(stop.id);
  const sections = stationId ? graph.sections.filter(section => section.stationIds.includes(stationId)) : [];
  if (!stationId || !sections.length) return { id: "unclassified", kind: "unclassified" };
  if (sections.length > 1) {
    const shared = sections.filter(section => section.kind === "shared");
    if (shared.length !== 1) return {
      id: `junction:${stationId}`, kind: "junction",
      label: topology.stations.find(candidate => candidate.id === stationId)?.name,
    };
    sections.splice(0, sections.length, shared[0]!);
  }
  const section = sections[0]!;
  const terminal = graph.terminals.has(section.from.id) ? section.from : section.to;
  return {
    id: section.id,
    kind: section.kind === "branch" ? "branch" : "shared",
    label: graph.sections.length === 1 ? undefined : section.kind === "branch"
      ? terminal.name : `${section.from.name} – ${section.to.name}`,
  };
}
