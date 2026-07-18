import type { TransferLineOption, TransitFamily } from "../../types/transit";

export type TrafficImpactSeverity = "low" | "medium" | "high";
export type TrafficTopologyRole =
  | "small-branch"
  | "major-branch"
  | "trunk-end"
  | "trunk-core";

export interface TrafficImpactSeverityStation {
  key: string;
  label: string;
  transfers?: TransferLineOption[];
}

export interface TrafficImpactSeverityEdge {
  source: string;
  target: string;
}
export interface TrafficImpactTimeWindow {
  startMinute: number;
  endMinute: number;
}

export interface TrafficImpactTemporalMultiplierResult {
  multiplier: number;
  coverageRatio: number;
  coveredMinutes: number;
  offPeakMinutes: number;
  weightedMinutes: number;
  assumesFullDay: boolean;
}


export interface TrafficImpactStationContribution {
  stationKey: string;
  baseScore: number;
  transferScore: number;
  topologyRole: TrafficTopologyRole;
  topologyMultiplier: number;
  contribution: number;
  temporalMultiplier: number;
  unadjustedContribution: number;
}

export interface TrafficImpactSeverityResult {
  level: TrafficImpactSeverity;
  score: number;
  affectedStationCount: number;
  stationContributions: TrafficImpactStationContribution[];
}

export const TRAFFIC_IMPACT_SEVERITY_MODEL = Object.freeze({
  baseStationScore: 1,
  transferWeights: Object.freeze({
    RER: 4,
    TRANSILIEN: 3,
    METRO: 2.5,
    TRAM: 1.5,
    CABLE: 1,
    BUS: 0,
    NOCTILIEN: 0,
  } satisfies Record<TransitFamily, number>),
  topologyMultipliers: Object.freeze({
    "small-branch": 0.8,
    "major-branch": 1,
    "trunk-end": 1.2,
    "trunk-core": 1.4,
  } satisfies Record<TrafficTopologyRole, number>),
  thresholds: Object.freeze({ medium: 5, high: 12 }),
  smallBranchRatio: 0.25,
  temporal: Object.freeze({
    minutesPerDay: 24 * 60,
    fullDayToleranceMinutes: 1,
    offPeakStartMinute: 21 * 60 + 30,
    offPeakEndMinute: 6 * 60 + 30,
    offPeakMultiplier: 0.5,
    unspecifiedMultiplier: 1,
  }),
  trunkEndRatio: 0.25,
});

export function calculateTrafficImpactSeverity({
  affectedStationKeys,
  fallbackStationKeys = [],
  temporalMultipliersByStationKey,
  stations,
  edges,
}: {
  affectedStationKeys: Iterable<string>;
  fallbackStationKeys?: Iterable<string>;
  temporalMultipliersByStationKey?: ReadonlyMap<string, number>;
  stations: TrafficImpactSeverityStation[];
  edges: TrafficImpactSeverityEdge[];
}): TrafficImpactSeverityResult {
  const stationByKey = new Map(stations.map((station) => [station.key, station]));
  const selectedKeys = Array.from(new Set(affectedStationKeys)).filter((key) =>
    stationByKey.has(key),
  );
  const resolvedKeys =
    selectedKeys.length > 0
      ? selectedKeys
      : Array.from(new Set(fallbackStationKeys)).filter((key) =>
          stationByKey.has(key),
        );
  const topologyRoles = classifyTrafficTopology(stations, edges);
  const stationContributions = resolvedKeys.map((stationKey) => {
    const station = stationByKey.get(stationKey)!;
    const topologyRole = topologyRoles[stationKey] ?? "trunk-core";
    const topologyMultiplier =
      TRAFFIC_IMPACT_SEVERITY_MODEL.topologyMultipliers[topologyRole];
    const transferScore = getTrafficTransferScore(station.transfers ?? []);
    const temporalMultiplier = clampTrafficMultiplier(
      temporalMultipliersByStationKey?.get(stationKey) ??
        TRAFFIC_IMPACT_SEVERITY_MODEL.temporal.unspecifiedMultiplier,
    );
    const unadjustedContribution = roundTrafficScore(
      (TRAFFIC_IMPACT_SEVERITY_MODEL.baseStationScore + transferScore) *
        topologyMultiplier,
    );
    const contribution = roundTrafficScore(
      unadjustedContribution * temporalMultiplier,
    );

    return {
      stationKey,
      baseScore: TRAFFIC_IMPACT_SEVERITY_MODEL.baseStationScore,
      transferScore,
      topologyRole,
      topologyMultiplier,
      temporalMultiplier,
      unadjustedContribution,
      contribution,
    };
  });
  const score = roundTrafficScore(
    stationContributions.reduce((sum, item) => sum + item.contribution, 0),
  );

  return {
    level: getTrafficImpactSeverityLevel(score),
    score,
    affectedStationCount: resolvedKeys.length,
    stationContributions,
  };
}

export function calculateTrafficImpactTemporalMultiplier(
  windows: Array<TrafficImpactTimeWindow | undefined>,
): TrafficImpactTemporalMultiplierResult {
  const temporalModel = TRAFFIC_IMPACT_SEVERITY_MODEL.temporal;
  if (windows.length === 0 || windows.some((window) => !window)) {
    return createFullDayTemporalResult();
  }

  const intervals: Array<{ start: number; end: number }> = [];
  for (const window of windows as TrafficImpactTimeWindow[]) {
    if (
      !Number.isFinite(window.startMinute) ||
      !Number.isFinite(window.endMinute)
    ) {
      return createFullDayTemporalResult();
    }

    const start = clampMinuteOfDay(window.startMinute);
    const end = clampMinuteOfDay(window.endMinute);
    if (start === end) return createFullDayTemporalResult();
    if (start < end) {
      intervals.push({ start, end });
    } else {
      intervals.push({ start, end: temporalModel.minutesPerDay });
      intervals.push({ start: 0, end });
    }
  }

  const mergedIntervals = mergeTrafficTimeIntervals(intervals);
  const coveredMinutes = mergedIntervals.reduce(
    (sum, interval) => sum + interval.end - interval.start,
    0,
  );
  if (
    coveredMinutes >=
    temporalModel.minutesPerDay - temporalModel.fullDayToleranceMinutes
  ) {
    return createFullDayTemporalResult();
  }

  const offPeakIntervals = [
    { start: 0, end: temporalModel.offPeakEndMinute },
    {
      start: temporalModel.offPeakStartMinute,
      end: temporalModel.minutesPerDay,
    },
  ];
  const offPeakMinutes = mergedIntervals.reduce(
    (sum, interval) =>
      sum +
      offPeakIntervals.reduce(
        (intervalSum, offPeak) =>
          intervalSum + getTrafficIntervalOverlap(interval, offPeak),
        0,
      ),
    0,
  );
  const weightedMinutes = roundTrafficScore(
    coveredMinutes -
      offPeakMinutes +
      offPeakMinutes * temporalModel.offPeakMultiplier,
  );

  return {
    multiplier: roundTrafficScore(
      weightedMinutes / temporalModel.minutesPerDay,
    ),
    coverageRatio: roundTrafficScore(
      coveredMinutes / temporalModel.minutesPerDay,
    ),
    coveredMinutes,
    offPeakMinutes,
    weightedMinutes,
    assumesFullDay: false,
  };
}


export function getTrafficImpactSeverityLevel(
  score: number,
): TrafficImpactSeverity {
  if (score >= TRAFFIC_IMPACT_SEVERITY_MODEL.thresholds.high) return "high";
  if (score >= TRAFFIC_IMPACT_SEVERITY_MODEL.thresholds.medium) return "medium";
  return "low";
}

export function getTrafficTransferScore(
  transfers: TransferLineOption[],
): number {
  const seen = new Set<string>();

  return roundTrafficScore(
    transfers.reduce((score, transfer) => {
      const family = resolveTransferFamily(transfer);
      if (!family) return score;

      const key = `${family}:${transfer.ref ?? transfer.id ?? transfer.label}`;
      if (seen.has(key)) return score;

      seen.add(key);
      return score + TRAFFIC_IMPACT_SEVERITY_MODEL.transferWeights[family];
    }, 0),
  );
}

export function classifyTrafficTopology(
  stations: TrafficImpactSeverityStation[],
  edges: TrafficImpactSeverityEdge[],
): Record<string, TrafficTopologyRole> {
  const stationKeys = new Set(stations.map((station) => station.key));
  const adjacency = createAdjacency(stationKeys, edges);
  const roles: Record<string, TrafficTopologyRole> = {};

  getConnectedComponents(stationKeys, adjacency).forEach((component) => {
    classifyTrafficComponent(component, adjacency, roles);
  });

  return roles;
}

function classifyTrafficComponent(
  component: Set<string>,
  adjacency: Map<string, Set<string>>,
  roles: Record<string, TrafficTopologyRole>,
): void {
  const terminals = Array.from(component).filter(
    (key) => countNeighbors(key, component, adjacency) <= 1,
  );

  if (terminals.length === 0) {
    component.forEach((key) => {
      roles[key] = "trunk-core";
    });
    return;
  }

  const coverage = new Map(Array.from(component, (key) => [key, 0]));
  for (let left = 0; left < terminals.length; left += 1) {
    for (let right = left + 1; right < terminals.length; right += 1) {
      findShortestPath(
        terminals[left],
        terminals[right],
        adjacency,
        component,
      ).forEach((key) => coverage.set(key, (coverage.get(key) ?? 0) + 1));
    }
  }

  const maxCoverage = Math.max(...coverage.values(), 0);
  const trunk = new Set(
    Array.from(component).filter(
      (key) => terminals.length <= 2 || coverage.get(key) === maxCoverage,
    ),
  );

  classifyTrunkRoles(trunk, adjacency, roles);

  const branches = new Set(
    Array.from(component).filter((key) => !trunk.has(key)),
  );
  getConnectedComponents(branches, adjacency).forEach((branch) => {
    const role: TrafficTopologyRole =
      branch.size / component.size <=
      TRAFFIC_IMPACT_SEVERITY_MODEL.smallBranchRatio
        ? "small-branch"
        : "major-branch";
    branch.forEach((key) => {
      roles[key] = role;
    });
  });
}

function classifyTrunkRoles(
  trunk: Set<string>,
  adjacency: Map<string, Set<string>>,
  roles: Record<string, TrafficTopologyRole>,
): void {
  if (trunk.size <= 1) {
    trunk.forEach((key) => {
      roles[key] = "trunk-core";
    });
    return;
  }

  const ends = Array.from(trunk).filter(
    (key) => countNeighbors(key, trunk, adjacency) <= 1,
  );
  if (ends.length === 0) {
    trunk.forEach((key) => {
      roles[key] = "trunk-core";
    });
    return;
  }

  const diameter = getGraphDiameter(trunk, adjacency);
  trunk.forEach((key) => {
    const distanceToEnd = Math.min(
      ...ends.map(
        (end) => findShortestPath(key, end, adjacency, trunk).length - 1,
      ),
    );
    roles[key] =
      diameter > 0 &&
      distanceToEnd / diameter <=
        TRAFFIC_IMPACT_SEVERITY_MODEL.trunkEndRatio
        ? "trunk-end"
        : "trunk-core";
  });
}

function createAdjacency(
  stationKeys: Set<string>,
  edges: TrafficImpactSeverityEdge[],
): Map<string, Set<string>> {
  const adjacency = new Map(
    Array.from(stationKeys, (key) => [key, new Set<string>()]),
  );

  edges.forEach((edge) => {
    if (!stationKeys.has(edge.source) || !stationKeys.has(edge.target)) return;
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  });

  return adjacency;
}

function getConnectedComponents(
  keys: Set<string>,
  adjacency: Map<string, Set<string>>,
): Set<string>[] {
  const remaining = new Set(keys);
  const components: Set<string>[] = [];

  while (remaining.size > 0) {
    const first = remaining.values().next().value as string;
    const component = new Set<string>();
    const queue = [first];
    remaining.delete(first);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.add(current);
      (adjacency.get(current) ?? new Set()).forEach((next) => {
        if (!remaining.has(next)) return;
        remaining.delete(next);
        queue.push(next);
      });
    }

    components.push(component);
  }

  return components;
}

function findShortestPath(
  source: string,
  target: string,
  adjacency: Map<string, Set<string>>,
  allowed: Set<string>,
): string[] {
  if (source === target) return [source];

  const queue: string[][] = [[source]];
  const visited = new Set([source]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];

    for (const next of adjacency.get(current) ?? []) {
      if (!allowed.has(next) || visited.has(next)) continue;
      const nextPath = [...path, next];
      if (next === target) return nextPath;
      visited.add(next);
      queue.push(nextPath);
    }
  }

  return [];
}

function getGraphDiameter(
  keys: Set<string>,
  adjacency: Map<string, Set<string>>,
): number {
  const values = Array.from(keys);
  let diameter = 0;

  values.forEach((left, index) => {
    values.slice(index + 1).forEach((right) => {
      const path = findShortestPath(left, right, adjacency, keys);
      diameter = Math.max(diameter, path.length > 0 ? path.length - 1 : 0);
    });
  });

  return diameter;
}

function countNeighbors(
  key: string,
  component: Set<string>,
  adjacency: Map<string, Set<string>>,
): number {
  return Array.from(adjacency.get(key) ?? []).filter((neighbor) =>
    component.has(neighbor),
  ).length;
}

function resolveTransferFamily(
  transfer: TransferLineOption,
): TransitFamily | undefined {
  if (transfer.family) return transfer.family;

  const mode = transfer.mode?.trim().toLowerCase();
  const families: Record<string, TransitFamily> = {
    rer: "RER",
    train: "TRANSILIEN",
    transilien: "TRANSILIEN",
    metro: "METRO",
    tram: "TRAM",
    tramway: "TRAM",
    cable: "CABLE",
    bus: "BUS",
    noctilien: "NOCTILIEN",
  };

  return mode ? families[mode] : undefined;
}

function createFullDayTemporalResult(): TrafficImpactTemporalMultiplierResult {
  const minutesPerDay =
    TRAFFIC_IMPACT_SEVERITY_MODEL.temporal.minutesPerDay;
  return {
    multiplier:
      TRAFFIC_IMPACT_SEVERITY_MODEL.temporal.unspecifiedMultiplier,
    coverageRatio: 1,
    coveredMinutes: minutesPerDay,
    offPeakMinutes:
      TRAFFIC_IMPACT_SEVERITY_MODEL.temporal.offPeakEndMinute +
      minutesPerDay -
      TRAFFIC_IMPACT_SEVERITY_MODEL.temporal.offPeakStartMinute,
    weightedMinutes: minutesPerDay,
    assumesFullDay: true,
  };
}

function clampMinuteOfDay(value: number): number {
  return Math.min(
    TRAFFIC_IMPACT_SEVERITY_MODEL.temporal.minutesPerDay,
    Math.max(0, Math.round(value)),
  );
}

function clampTrafficMultiplier(value: number): number {
  if (!Number.isFinite(value)) {
    return TRAFFIC_IMPACT_SEVERITY_MODEL.temporal.unspecifiedMultiplier;
  }
  return Math.min(1, Math.max(0, value));
}

function mergeTrafficTimeIntervals(
  intervals: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start);
  const merged: Array<{ start: number; end: number }> = [];

  sorted.forEach((interval) => {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
      return;
    }
    previous.end = Math.max(previous.end, interval.end);
  });

  return merged;
}

function getTrafficIntervalOverlap(
  left: { start: number; end: number },
  right: { start: number; end: number },
): number {
  return Math.max(
    0,
    Math.min(left.end, right.end) - Math.max(left.start, right.start),
  );
}


function roundTrafficScore(value: number): number {
  return Math.round(value * 100) / 100;
}
