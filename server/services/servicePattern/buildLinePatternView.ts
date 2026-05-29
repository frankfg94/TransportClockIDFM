import type {
  Departure,
  DepartureCall,
  DepartureCallStatus,
  DepartureCallingPattern,
  LineConfig,
  LinePatternDirectionOption,
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
import {
  createNetexCacheEnvironmentKey,
  resolveKnownLineAlias,
  type NetexRuntimeEnv,
} from "../topology/netexCache";
import { createLinePresentation } from "../../../src/services/linePresentation";
import type {
  LineTopology,
  TopologyPattern,
  TopologyStation,
} from "../topology/types";

interface BuildLinePatternViewParams {
  transportType: string;
  lineId: string;
  directionId?: string;
  runtimeEnv?: NetexRuntimeEnv;
  startStationId?: string;
  startStationCandidates?: string[];
}

interface OrientedPattern {
  directionId: string;
  destination: TopologyStation;
  stops: TopologyStation[];
  sourcePattern: TopologyPattern;
}

const MAX_PATTERN_VIEW_CACHE_ENTRIES = 512;
const IDFM_MARKETPLACE_BASE =
  "https://prim.iledefrance-mobilites.fr/marketplace";
const patternViewCache = new Map<string, Promise<LinePatternViewResponse>>();
const navitiaLinePresentationCache = new Map<
  string,
  Promise<Pick<LineConfig, "color" | "iconUrl" | "iconUrls" | "textColor"> | undefined>
>();

interface NavitiaLineResponse {
  lines?: NavitiaLinePresentation[];
}

interface NavitiaLinePresentation {
  id: string;
  code?: string;
  name?: string;
  color?: string;
  text_color?: string;
  commercial_mode?: {
    name?: string;
  };
  physical_modes?: Array<{
    name?: string;
  }>;
}

export async function buildLinePatternView(
  params: BuildLinePatternViewParams,
): Promise<LinePatternViewResponse> {
  const resolvedLineId = resolveHumanLineId(params.transportType, params.lineId);
  const cacheKey = createPatternViewCacheKey(resolvedLineId, params);
  const cached = patternViewCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const request = (async () => {
    const topology = await getLineTopology(resolvedLineId, params.runtimeEnv);
    const response = buildLinePatternViewFromTopology(params, topology);

    return applyNavitiaLinePresentation(response, topology, params);
  })();

  patternViewCache.set(cacheKey, request);
  trimPatternViewCache();
  request.catch(() => {
    patternViewCache.delete(cacheKey);
  });

  return request;
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
    directionOptions: createDirectionOptions(topology),
    startStationId: startStation.id,
    activeSegmentIds,
    stationStatuses,
    board,
    departure,
    pattern,
  };
}

function createDirectionOptions(
  topology: LineTopology,
): LinePatternDirectionOption[] {
  const stations = new Map(topology.stations.map((station) => [station.id, station]));
  const directions = new Map<string, LinePatternDirectionOption>();

  topology.patterns.forEach((pattern) => {
    [pattern.stops[0], pattern.stops[pattern.stops.length - 1]].forEach(
      (stationId) => {
        const station = stations.get(stationId);

        if (station) {
          directions.set(station.id, {
            id: station.id,
            label: station.name,
            isTerminal: true,
          });
        }
      },
    );
  });

  return Array.from(directions.values()).sort((left, right) =>
    left.label.localeCompare(right.label, "fr"),
  );
}

export function resolveHumanLineId(transportType: string, lineId: string): string {
  return resolveKnownLineAlias(transportType, lineId);
}

function createPatternViewCacheKey(
  resolvedLineId: string,
  params: BuildLinePatternViewParams,
): string {
  return JSON.stringify({
    lineId: resolvedLineId,
    netexCache: createNetexCacheEnvironmentKey(params.runtimeEnv),
    presentation: getRuntimeIdfmApiKey(params.runtimeEnv) ? "idfm" : "fallback",
    transportType: normalizeId(params.transportType),
    directionId: normalizeId(params.directionId),
    startStationId: normalizeId(params.startStationId),
    startStationCandidates: (params.startStationCandidates ?? []).map(normalizeId),
  });
}

function trimPatternViewCache(): void {
  while (patternViewCache.size > MAX_PATTERN_VIEW_CACHE_ENTRIES) {
    const oldestKey = patternViewCache.keys().next().value;

    if (!oldestKey) {
      return;
    }

    patternViewCache.delete(oldestKey);
  }
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
  const segmentSequences = topology.segments
    .map<LineRouteSequence | undefined>((segment) => {
      const from = stations.get(segment.from);
      const to = stations.get(segment.to);

      if (!from || !to) {
        return undefined;
      }

      return {
        id: segment.id,
        label: `${from.name} - ${to.name}`,
        direction: to.name,
        topologySource: "server",
        stops: [from, to].map((station) => createLineRouteStop(station)),
      } satisfies LineRouteSequence;
    })
    .filter((sequence): sequence is LineRouteSequence => Boolean(sequence));
  const branchSequences = topology.branches
    .map<LineRouteSequence | undefined>((branch) => {
      const stops = branch.stops.flatMap((stationId) => {
        const station = stations.get(stationId);

        return station ? [createLineRouteStop(station)] : [];
      });
      const from = stations.get(branch.from);
      const to = stations.get(branch.to);

      if (!from || !to || stops.length < 2) {
        return undefined;
      }

      return {
        id: branch.id,
        label: `${from.name} - ${to.name}`,
        direction: to.name,
        branchLayout: branch.layout,
        topologySource: "server",
        stops,
      } satisfies LineRouteSequence;
    })
    .filter((sequence): sequence is LineRouteSequence => Boolean(sequence));

  if (segmentSequences.length > 0) {
    return [...segmentSequences, ...branchSequences];
  }

  return topology.patterns
    .map((pattern) => {
      const stops = pattern.stops.flatMap((stationId) => {
        const station = stations.get(stationId);

        if (!station) {
          return [];
        }

        return [createLineRouteStop(station)];
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

function createLineRouteStop(station: TopologyStation): LineRouteStop {
  const searchStation: StationSearchOption = {
    id: station.id,
    label: station.name,
    monitoringRef: "",
    scheduleStopAreaRef: station.id,
  };

  return {
    id: station.id,
    label: station.name,
    lat: station.lat,
    lon: station.lon,
    projectedX: station.projectedX,
    projectedY: station.projectedY,
    station: searchStation,
  };
}

function createLineConfig(
  topology: LineTopology,
  transportType: string,
): LineConfig {
  const mode = toTransitMode(transportType) ?? toTransitMode(topology.line.mode) ?? "train";
  const presentation = createLinePresentation({
    code: topology.line.shortName,
    id: topology.line.id,
    mode,
    ref: topology.line.id,
    shortName: topology.line.shortName,
  });

  return {
    ref: topology.line.id,
    shortName: topology.line.shortName,
    longName: createDisplayLineName(mode, topology.line.shortName, topology.line.name),
    mode,
    color: presentation.color,
    textColor: presentation.textColor,
    iconUrl: presentation.iconUrl,
    iconUrls: presentation.iconUrls,
  };
}

async function applyNavitiaLinePresentation(
  response: LinePatternViewResponse,
  topology: LineTopology,
  params: BuildLinePatternViewParams,
): Promise<LinePatternViewResponse> {
  const presentation = await fetchNavitiaLinePresentation(
    topology.line.id,
    params,
  ).catch(() => undefined);

  if (!presentation) {
    return response;
  }

  return {
    ...response,
    board: {
      ...response.board,
      line: {
        ...response.board.line,
        ...presentation,
      },
    },
  };
}

async function fetchNavitiaLinePresentation(
  lineId: string,
  params: BuildLinePatternViewParams,
): Promise<Pick<LineConfig, "color" | "iconUrl" | "iconUrls" | "textColor"> | undefined> {
  const apiKey = getRuntimeIdfmApiKey(params.runtimeEnv);

  if (!apiKey) {
    return undefined;
  }

  const cacheKey = `${lineId}:${normalizeId(params.transportType)}`;
  const cached = navitiaLinePresentationCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const request = fetchNavitiaLine(lineId, apiKey).then((line) => {
    if (!line) {
      return undefined;
    }

    return createLinePresentation({
      code: line.code ?? line.name,
      color: line.color,
      id: line.id,
      mode:
        toTransitMode(params.transportType) ??
        toTransitMode(line.commercial_mode?.name) ??
        toTransitMode(line.physical_modes?.[0]?.name),
      ref: line.id,
      shortName: line.code ?? line.name,
      textColor: line.text_color,
    });
  });

  navitiaLinePresentationCache.set(cacheKey, request);

  request.catch(() => {
    navitiaLinePresentationCache.delete(cacheKey);
  });

  return request;
}

async function fetchNavitiaLine(
  lineId: string,
  apiKey: string,
): Promise<NavitiaLinePresentation | undefined> {
  const url = new URL(
    `${IDFM_MARKETPLACE_BASE}/v2/navitia/lines/${encodeURIComponent(lineId)}`,
  );

  url.searchParams.set("disable_disruption", "true");
  url.searchParams.set("disable_geojson", "true");

  const response = await fetch(url, {
    headers: {
      apikey: apiKey,
    },
  });

  if (!response.ok) {
    return undefined;
  }

  const payload = (await response.json()) as NavitiaLineResponse;

  return payload.lines?.[0];
}

function getRuntimeIdfmApiKey(runtimeEnv?: NetexRuntimeEnv): string {
  return (
    runtimeEnv?.NUXT_IDFM_API_KEY ??
    runtimeEnv?.IDFM_API_KEY ??
    ""
  ).trim();
}

function createDisplayLineName(
  mode: TransitMode,
  shortName: string,
  fallback: string,
): string {
  if (mode === "metro") {
    return `Metro ${shortName}`;
  }

  if (mode === "rer") {
    return `RER ${shortName}`;
  }

  if (mode === "tram") {
    return `Tram ${shortName}`;
  }

  if (mode === "train") {
    return `Transilien ${shortName}`;
  }

  return fallback;
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

function toTransitMode(mode: string | undefined): TransitMode | undefined {
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

  if (normalized.includes("rail") || normalized.includes("train") || normalized.includes("transilien")) {
    return "train";
  }

  return undefined;
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
