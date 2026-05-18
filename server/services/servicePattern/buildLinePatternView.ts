import type {
  Departure,
  DepartureCall,
  DepartureCallStatus,
  DepartureCallingPattern,
  LineConfig,
  LinePatternStationStatus,
  LinePatternViewResponse,
  LineRouteSequence,
  LineRouteStop,
  StationSearchOption,
  TransitBoardConfig,
  TransitMode,
} from "../../../src/types/transit";
import { buildNeighborMap, segmentId } from "../topology/buildLineTopology";
import { getLineTopology } from "../topology/getLineTopology";
import type {
  LineTopology,
  TopologyPattern,
  TopologyStation,
} from "../topology/types";

interface BuildLinePatternViewParams {
  transportType: string;
  lineId: string;
  directionId?: string;
  startStationId?: string;
  startStationCandidates?: string[];
}

interface OrientedPattern {
  directionId: string;
  destination: TopologyStation;
  stops: TopologyStation[];
  sourcePattern: TopologyPattern;
}

const LINE_COLORS: Record<string, Pick<LineConfig, "color" | "textColor">> = {
  "rer-a": { color: "#e2231a", textColor: "#ffffff" },
  "rer-b": { color: "#5291ce", textColor: "#ffffff" },
  "rer-d": { color: "#008b5b", textColor: "#ffffff" },
  "transilien-j": { color: "#d6cd00", textColor: "#111827" },
  "metro-4": { color: "#be418d", textColor: "#ffffff" },
  t10: { color: "#6e6e00", textColor: "#ffffff" },
};

export async function buildLinePatternView(
  params: BuildLinePatternViewParams,
): Promise<LinePatternViewResponse> {
  const resolvedLineId = resolveHumanLineId(params.transportType, params.lineId);
  const topology = await getLineTopology(resolvedLineId);

  return buildLinePatternViewFromTopology(params, topology);
}

export function buildLinePatternViewFromTopology(
  params: BuildLinePatternViewParams,
  topology: LineTopology,
): LinePatternViewResponse {
  const orientedPattern = resolveOrientedPattern(
    topology,
    params.directionId ?? "",
  );
  const startStation =
    findStationInPattern(orientedPattern.stops, [
      ...(params.startStationCandidates ?? []),
      params.startStationId,
    ]) ??
    orientedPattern.stops[0];
  const startIndex = Math.max(
    0,
    orientedPattern.stops.findIndex((station) => station.id === startStation.id),
  );
  const activeStops = orientedPattern.stops.slice(startIndex);
  const activeIds = new Set(activeStops.map((station) => station.id));
  const currentId = activeStops[0]?.id;
  const stationStatuses = topology.stations.map((station) =>
    createStationStatus(station, activeIds, currentId, activeStops),
  );
  const calls = createPatternCalls(topology.stations, activeStops, stationStatuses);
  const lineTopology = convertTopologyToLineRouteSequences(topology);
  const activeSegmentIds = createActiveSegmentIds(activeStops);
  const line = createLineConfig(topology, params.transportType);
  const board = createBoard(topology, line, startStation);
  const departure = createDeparture(
    topology,
    board,
    orientedPattern.destination,
    startStation,
  );
  const pattern: DepartureCallingPattern = {
    departureId: departure.id,
    destination: orientedPattern.destination.name,
    serviceType: "omnibus",
    calls,
    lineTopology,
  };

  return {
    lineId: topology.line.id,
    transportType: params.transportType,
    directionId: orientedPattern.directionId,
    startStationId: startStation.id,
    activeSegmentIds,
    stationStatuses,
    board,
    departure,
    pattern,
  };
}

export function resolveHumanLineId(transportType: string, lineId: string): string {
  const normalizedType = normalizeId(transportType);
  const normalizedLine = normalizeId(lineId);

  if (normalizedType === "rer") {
    return `rer-${normalizedLine}`;
  }

  if (normalizedType === "metro") {
    return `metro-${normalizedLine}`;
  }

  if (normalizedType === "transilien" || normalizedType === "train") {
    return normalizedLine === "j" ? "transilien-j" : normalizedLine;
  }

  return normalizedLine;
}

function resolveOrientedPattern(
  topology: LineTopology,
  directionId: string,
): OrientedPattern {
  const stations = new Map(topology.stations.map((station) => [station.id, station]));
  const normalizedDirection = normalizeId(directionId);
  const candidates = topology.patterns
    .flatMap((pattern) => {
      const first = stations.get(pattern.stops[0]);
      const last = stations.get(pattern.stops[pattern.stops.length - 1]);

      if (!first || !last) {
        return [];
      }

      return [
        {
          pattern,
          destination: last,
          stops: pattern.stops,
          score: scoreDirectionMatch(pattern, last, normalizedDirection),
        },
        {
          pattern,
          destination: first,
          stops: [...pattern.stops].reverse(),
          score: scoreDirectionMatch(pattern, first, normalizedDirection),
        },
      ];
    })
    .filter((candidate) => !normalizedDirection || candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.pattern.tripCount - left.pattern.tripCount,
    );
  const selected =
    candidates[0] ??
    topology.patterns.flatMap((pattern) => {
      const stops = pattern.stops.flatMap((stationId) => {
        const station = stations.get(stationId);

        return station ? [station] : [];
      });
      const destination = stops[stops.length - 1];

      return destination
        ? [
            {
              pattern,
              destination,
              stops: pattern.stops,
              score: 0,
            },
          ]
        : [];
    })[0];

  if (!selected) {
    throw new Error(`No displayable pattern for ${topology.line.name}`);
  }

  const stops = selected.stops.flatMap((stationId) => {
    const station = stations.get(stationId);

    return station ? [station] : [];
  });

  return {
    directionId: selected.destination.id,
    destination: selected.destination,
    sourcePattern: selected.pattern,
    stops,
  };
}

function scoreDirectionMatch(
  pattern: TopologyPattern,
  destination: TopologyStation,
  normalizedDirection: string,
): number {
  if (!normalizedDirection) {
    return pattern.tripCount;
  }

  const destinationValues = [destination.id, destination.name].map(normalizeId);

  if (destinationValues.some((value) => value === normalizedDirection)) {
    return 200;
  }

  if (
    destinationValues.some(
      (value) =>
        value.includes(normalizedDirection) || normalizedDirection.includes(value),
    )
  ) {
    return 150;
  }

  return normalizeId(pattern.id) === normalizedDirection ? 90 : 0;
}

function findStationInPattern(
  stations: TopologyStation[],
  stationCandidates: Array<string | undefined>,
): TopologyStation | undefined {
  const normalizedStations = stationCandidates.map(normalizeId).filter(Boolean);

  if (normalizedStations.length === 0) {
    return undefined;
  }

  const stationEntries = stations.map((station) => ({
    station,
    candidates: [station.id, station.name, ...(station.aliases ?? [])].map(
      normalizeId,
    ),
  }));
  for (const normalizedStation of normalizedStations) {
    const exactMatch = stationEntries.find(({ candidates }) =>
      candidates.some((candidate) => candidate === normalizedStation),
    );

    if (exactMatch) {
      return exactMatch.station;
    }
  }

  for (const normalizedStation of normalizedStations) {
    const fuzzyMatch = stationEntries.find(({ candidates }) =>
      candidates.some(
        (candidate) =>
          candidate.includes(normalizedStation) ||
          normalizedStation.includes(candidate),
      ),
    );

    if (fuzzyMatch) {
      return fuzzyMatch.station;
    }
  }

  return undefined;
}

function createStationStatus(
  station: TopologyStation,
  activeIds: Set<string>,
  currentId: string | undefined,
  activeStops: TopologyStation[],
): LinePatternStationStatus {
  const activeIndex = activeStops.findIndex((activeStop) => activeStop.id === station.id);
  const status: DepartureCallStatus =
    station.id === currentId
      ? "current"
      : activeIds.has(station.id)
        ? "served"
        : "not_served";

  return {
    id: station.id,
    label: station.name,
    status,
    current: status === "current",
    served: status === "current" || status === "served",
    order: activeIndex >= 0 ? activeIndex : undefined,
  };
}

function createPatternCalls(
  stations: TopologyStation[],
  activeStops: TopologyStation[],
  stationStatuses: LinePatternStationStatus[],
): DepartureCall[] {
  const stationsById = new Map(stations.map((station) => [station.id, station]));
  const statusesById = new Map(stationStatuses.map((status) => [status.id, status]));
  const emitted = new Set<string>();
  const orderedStations = [
    ...activeStops,
    ...stations.filter((station) => !activeStops.some((active) => active.id === station.id)),
  ];

  return orderedStations.flatMap((station) => {
    if (emitted.has(station.id)) {
      return [];
    }

    emitted.add(station.id);

    const resolvedStation = stationsById.get(station.id) ?? station;
    const status = statusesById.get(station.id);

    return [
      {
        id: `call:${resolvedStation.id}`,
        label: resolvedStation.name,
        current: Boolean(status?.current),
        served: Boolean(status?.served),
        status: status?.status ?? "unknown",
        stopAreaRef: resolvedStation.id,
      } satisfies DepartureCall,
    ];
  });
}

function createActiveSegmentIds(activeStops: TopologyStation[]): string[] {
  return activeStops.slice(0, -1).map((station, index) =>
    segmentId(station.id, activeStops[index + 1].id),
  );
}

function convertTopologyToLineRouteSequences(
  topology: LineTopology,
): LineRouteSequence[] {
  const stations = new Map(topology.stations.map((station) => [station.id, station]));

  return topology.patterns
    .map((pattern) => {
      const stops = pattern.stops.flatMap((stationId) => {
        const station = stations.get(stationId);

        if (!station) {
          return [];
        }

        const searchStation: StationSearchOption = {
          id: station.id,
          label: station.name,
          monitoringRef: "",
          scheduleStopAreaRef: station.id,
        };

        return [
          {
            id: station.id,
            label: station.name,
            lat: station.lat,
            lon: station.lon,
            station: searchStation,
          } satisfies LineRouteStop,
        ];
      });

      return {
        id: pattern.id,
        label: `${pattern.terminalFrom} - ${pattern.terminalTo}`,
        direction: pattern.terminalTo,
        topologySource: "server",
        stops,
      } satisfies LineRouteSequence;
    })
    .filter((sequence) => sequence.stops.length > 1);
}

function createLineConfig(
  topology: LineTopology,
  transportType: string,
): LineConfig {
  const slug = normalizeId(topology.line.aliases.at(-1) ?? topology.line.shortName);
  const fallbackSlug = normalizeId(`${transportType}-${topology.line.shortName}`);
  const colors =
    LINE_COLORS[slug] ??
    LINE_COLORS[fallbackSlug] ??
    ({ color: "#0064ff", textColor: "#ffffff" } satisfies Pick<
      LineConfig,
      "color" | "textColor"
    >);

  return {
    ref: topology.line.id,
    shortName: topology.line.shortName,
    longName: topology.line.name,
    mode: toTransitMode(topology.line.mode),
    color: colors.color,
    textColor: colors.textColor,
  };
}

function createBoard(
  topology: LineTopology,
  line: LineConfig,
  startStation: TopologyStation,
): TransitBoardConfig {
  return {
    id: `line-pattern:${topology.line.id}:${startStation.id}`,
    title: startStation.name,
    city: startStation.name,
    line,
    monitoringPoints: [
      {
        ref: startStation.id,
        label: startStation.name,
      },
    ],
    directionGroups: [],
    schedule: {
      lineRef: topology.line.id,
      stopAreaRef: startStation.id,
    },
    maxDepartures: 1,
  };
}

function createDeparture(
  topology: LineTopology,
  board: TransitBoardConfig,
  destination: TopologyStation,
  startStation: TopologyStation,
): Departure {
  return {
    id: `line-pattern:${topology.line.id}:${startStation.id}:${destination.id}`,
    lineRef: topology.line.id,
    monitoringRef: startStation.id,
    stopName: startStation.name,
    destination: destination.name,
    monitoringLabel: startStation.name,
    vehicleAtStop: false,
  };
}

function toTransitMode(mode: string): TransitMode {
  const normalized = normalizeId(mode);

  if (normalized.includes("metro")) {
    return "metro";
  }

  if (normalized.includes("tram")) {
    return "tram";
  }

  if (normalized.includes("rer")) {
    return "rer";
  }

  if (normalized.includes("bus")) {
    return "bus";
  }

  return "train";
}

function normalizeId(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function assertPatternHasNoOrphanStations(
  response: LinePatternViewResponse,
): string[] {
  const stationIds = response.pattern.lineTopology?.flatMap((sequence) =>
    sequence.stops.map((stop) => stop.id),
  ) ?? [];
  const uniqueStationIds = [...new Set(stationIds)];
  const segments = response.pattern.lineTopology?.flatMap((sequence) =>
    sequence.stops.slice(0, -1).map((stop, index) => ({
      id: segmentId(stop.id, sequence.stops[index + 1].id),
      from: stop.id,
      to: sequence.stops[index + 1].id,
      patterns: [sequence.id],
    })),
  ) ?? [];
  const neighbors = buildNeighborMap(uniqueStationIds, segments);

  return uniqueStationIds.filter((stationId) => (neighbors.get(stationId)?.size ?? 0) === 0);
}
