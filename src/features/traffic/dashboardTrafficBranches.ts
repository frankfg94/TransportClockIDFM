import {
  buildFrequencyGraph,
  findFrequencyPath,
  frequencyEdgeKey,
  getFrequencyTerminalPaths,
  mapFrequencyStops,
  type FrequencyGraph,
} from "../../../shared/gtfs/frequencyTopology";
import type { LineTopology } from "../../../server/services/topology/types";
import type { TransitBoardConfig } from "../../types/transit";
import { getTrafficSectionEvidence } from "../service-pattern/trafficImpactAnalysis";
import { getTrafficLineStatus, normalizeTrafficLineRef } from "./trafficNormalization";
import type { TrafficDisruption, TrafficLineReport } from "./types";

export function resolveBoardTrafficLineRef(board: TransitBoardConfig): string {
  return normalizeTrafficLineRef(board.schedule?.lineRef ?? board.line.ref);
}

export function createDashboardTrafficBranchFilter(topology: LineTopology) {
  const graph = buildFrequencyGraph(topology);
  const { branchParents, stationBranches } = indexTrafficBranches(topology, graph);

  const branchesByBoard = new WeakMap<TransitBoardConfig, string | undefined>();
  const impactsByDisruption = new WeakMap<TrafficDisruption, Set<string> | undefined>();
  const stationIdsByName = new Map<string, string | undefined>();

  function resolveBoardBranch(board: TransitBoardConfig): string | undefined {
    if (branchesByBoard.has(board)) return branchesByBoard.get(board);

    const stopRefs = [
      board.schedule?.stopAreaRef,
      ...board.monitoringPoints.map(({ ref }) => ref),
    ].filter((ref): ref is string => Boolean(ref));
    const stopIds = [...new Set(stopRefs.flatMap((ref) => {
      const idfmArea = ref.match(/^stop_area:(IDFM:[^:]+)$/iu)?.[1];
      return idfmArea ? [ref, idfmArea] : [ref];
    }))];
    const officialMatches = new Set(mapFrequencyStops(
      stopIds.map((id) => ({ id, name: "" })),
      topology,
    ).values());
    const station = officialMatches.size > 0
      ? (officialMatches.size === 1 ? officialMatches.values().next().value : undefined)
      : resolveStationName(board.title);
    const branch = station ? stationBranches.get(station) : undefined;
    branchesByBoard.set(board, branch);
    return branch;
  }

  function resolveStationName(name: string): string | undefined {
    if (!stationIdsByName.has(name)) {
      const id = "traffic-station-name";
      stationIdsByName.set(name, mapFrequencyStops([{ id, name }], topology).get(id));
    }
    return stationIdsByName.get(name);
  }

  function resolveImpactBranches(disruption: TrafficDisruption): Set<string> | undefined {
    if (new Set(disruption.impactedLineRefs.map(normalizeTrafficLineRef)).size > 1) {
      return undefined;
    }

    const { sections, lineWide } = getTrafficSectionEvidence(disruption);
    if (lineWide) return undefined;

    const impactedBranches = new Set<string>();
    const coveredStations = new Set<string>();
    for (const section of sections) {
      const from = resolveStationName(section.from);
      const to = resolveStationName(section.to);
      if (!from || !to) return undefined;
      const path = from === to ? [from] : findFrequencyPath(graph, from, to);
      if (!path) return undefined;

      // A branch interruption may end at a junction without affecting the
      // common track. Classify ranges by their edges and isolated stops by station.
      const sectionIds = path.length === 1
        ? [stationBranches.get(from)]
        : path.slice(1).map((station, index) =>
            graph.edges.get(frequencyEdgeKey(path[index]!, station))?.sectionId,
          );
      for (const sectionId of sectionIds) {
        if (!sectionId || !branchParents.has(sectionId)) return undefined;
        impactedBranches.add(sectionId);
      }
      path.forEach((station) => coveredStations.add(station));
    }

    for (const name of disruption.impactedStopNames) {
      const station = resolveStationName(name);
      if (!station) return undefined;
      if (coveredStations.has(station)) continue;
      const branch = stationBranches.get(station);
      if (!branch) return undefined;
      impactedBranches.add(branch);
    }

    // A list spanning several branches can represent the endpoints of an
    // unparsed range through the common track.
    if (!sections.length && impactedBranches.size !== 1) return undefined;
    return impactedBranches.size ? impactedBranches : undefined;
  }

  function isOnBranch(section: string, branch: string): boolean {
    for (let current: string | undefined = section; current; current = branchParents.get(current)) {
      if (current === branch) return true;
    }
    return false;
  }

  return (report: TrafficLineReport, boards: readonly TransitBoardConfig[]): TrafficLineReport => {
    if (branchParents.size < 2 || !boards.length || !report.disruptions.length) return report;
    const selectedBranches = new Set<string>();
    for (const board of boards) {
      const branch = resolveBoardBranch(board);
      if (!branch) return report;
      selectedBranches.add(branch);
    }

    const disruptions = report.disruptions.filter((disruption) => {
      if (!impactsByDisruption.has(disruption)) {
        impactsByDisruption.set(disruption, resolveImpactBranches(disruption));
      }
      const impactBranches = impactsByDisruption.get(disruption);
      return !impactBranches || [...impactBranches].some((impact) =>
        [...selectedBranches].some((selected) =>
          isOnBranch(impact, selected) || isOnBranch(selected, impact),
        ),
      );
    });
    if (disruptions.length === report.disruptions.length) return report;

    const status = report.status === "unknown" || report.status === "error"
      ? report.status
      : getTrafficLineStatus(disruptions, report.error);
    return { ...report, disruptions, status };
  };
}

function indexTrafficBranches(topology: LineTopology, graph: FrequencyGraph) {
  const terminalPaths = getFrequencyTerminalPaths(topology, graph)?.map((path) => new Set(path));
  const edgeCount = [...graph.neighbors.values()].reduce((count, adjacent) => count + adjacent.size, 0) / 2;
  const sectionsAtEndpoint = new Map<string, FrequencyGraph["sections"]>();
  for (const section of graph.sections) {
    for (const endpoint of new Set([section.from.id, section.to.id])) {
      const sections = sectionsAtEndpoint.get(endpoint) ?? [];
      sections.push(section);
      sectionsAtEndpoint.set(endpoint, sections);
    }
  }

  if (terminalPaths && edgeCount === graph.neighbors.size - 1) {
    const centralSections = graph.sections.filter((section) =>
      terminalPaths.every((path) => section.stationIds.every((station) => path.has(station))),
    );
    if (centralSections.length) {
      const visitedSections = new Set(centralSections.map(({ id }) => id));
      const branchParents = new Map<string, string | undefined>();
      const stationBranches = new Map<string, string>();
      const queue = centralSections.flatMap((section) => [section.from.id, section.to.id]);
      for (const endpoint of queue) {
        for (const section of sectionsAtEndpoint.get(endpoint) ?? []) {
          if (visitedSections.has(section.id)) continue;
          visitedSections.add(section.id);
          branchParents.set(section.id, stationBranches.get(endpoint));
          for (const station of section.stationIds) {
            if (station !== endpoint) stationBranches.set(station, section.id);
          }
          queue.push(section.from.id === endpoint ? section.to.id : section.from.id);
        }
      }
      if (visitedSections.size === graph.sections.length) return { branchParents, stationBranches };
    }
  }

  // When no common route can be established, only filter terminal arms.
  const branchParents = new Map<string, string | undefined>();
  const stationBranches = new Map<string, string>();
  for (const section of graph.sections) {
    if (section.kind !== "branch") continue;
    branchParents.set(section.id, undefined);
    for (const station of section.stationIds) {
      if ((sectionsAtEndpoint.get(station)?.length ?? 0) <= 1) {
        stationBranches.set(station, section.id);
      }
    }
  }
  return { branchParents, stationBranches };
}
