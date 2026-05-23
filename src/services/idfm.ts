import type {
  BoardDeparturesResult,
  Departure,
  DepartureCall,
  DepartureCallingPattern,
  DirectionDepartureGroup,
  DirectionGroupConfig,
  LastDeparture,
  LineRouteSequence,
  LineRouteStop,
  LineSearchOption,
  MonitoringPointConfig,
  StationSearchOption,
  TransferLineOption,
  TransitFamily,
  TransitFamilyOption,
  TransitBoardConfig,
} from "../types/transit";
import { createLinePresentation } from "./linePresentation";

type SiriTextValue =
  | string
  | {
  value?: string;
};

interface SiriMonitoredCall {
  StopPointName?: SiriTextValue[];
  DestinationDisplay?: SiriTextValue[];
  Order?: number;
  ExpectedDepartureTime?: string;
  ExpectedArrivalTime?: string;
  AimedDepartureTime?: string;
  DepartureStatus?: string;
  VehicleAtStop?: boolean;
  DeparturePlatformName?: SiriTextValue;
  ArrivalPlatformName?: SiriTextValue;
}

interface SiriFramedVehicleJourneyRef {
  DatedVehicleJourneyRef?: string;
}

interface SiriTrainNumbers {
  TrainNumberRef?: SiriTextValue[] | SiriTextValue;
}

interface SiriVehicleJourney {
  LineRef?: SiriTextValue;
  FramedVehicleJourneyRef?: SiriFramedVehicleJourneyRef;
  DirectionName?: SiriTextValue[];
  DestinationName?: SiriTextValue[];
  VehicleJourneyName?: SiriTextValue[];
  JourneyNote?: SiriTextValue[];
  TrainNumbers?: SiriTrainNumbers;
  MonitoredCall?: SiriMonitoredCall;
}

interface SiriVisit {
  ItemIdentifier?: string;
  MonitoringRef?: SiriTextValue;
  MonitoredVehicleJourney?: SiriVehicleJourney;
}

interface SiriDelivery {
  MonitoredStopVisit?: SiriVisit[] | SiriVisit;
}

interface SiriStopMonitoringResponse {
  Siri?: {
    ServiceDelivery?: {
      StopMonitoringDelivery?: SiriDelivery[] | SiriDelivery;
    };
  };
}

interface NavitiaDateTime {
  date_time?: string;
  base_date_time?: string;
  links?: NavitiaLink[];
}

interface NavitiaLink {
  id?: string;
  value?: string;
  type?: string;
  rel?: string;
}

interface NavitiaStopSchedule {
  stop_point?: {
    id?: string;
  };
  display_informations?: {
    direction?: string;
    headsign?: string;
  };
  date_times?: NavitiaDateTime[] | NavitiaDateTime;
  last_datetime?: NavitiaDateTime;
}

interface NavitiaStopScheduleResponse {
  stop_schedules?: NavitiaStopSchedule[];
}

interface NavitiaVehicleJourneyStopTime {
  stop_point?: {
    id?: string;
    name?: string;
    label?: string;
  };
  skipped_stop?: boolean;
}

interface NavitiaVehicleJourney {
  id?: string;
  stop_times?: NavitiaVehicleJourneyStopTime[];
}

interface NavitiaVehicleJourneyResponse {
  vehicle_journeys?: NavitiaVehicleJourney[];
}

interface UpcomingNavitiaTime {
  time: string;
  rawTime: string;
  vehicleJourneyId?: string;
}

interface NavitiaCommercialMode {
  id: string;
  name: string;
}

interface NavitiaCommercialModesResponse {
  commercial_modes?: NavitiaCommercialMode[];
}

interface NavitiaLine {
  id: string;
  name?: string;
  code?: string;
  color?: string;
  text_color?: string;
  physical_modes?: Array<{
    id?: string;
    name?: string;
  }>;
  commercial_mode?: {
    id?: string;
    name?: string;
  };
}

interface NavitiaLinesResponse {
  lines?: NavitiaLine[];
  pagination?: NavitiaPagination;
}

interface NavitiaPtObject {
  embedded_type?: string;
  line?: NavitiaLine;
  stop_area?: NavitiaStopArea;
}

interface NavitiaPtObjectsResponse {
  pt_objects?: NavitiaPtObject[];
}

interface NavitiaCode {
  type?: string;
  value?: string;
}

interface NavitiaAdministrativeRegion {
  name?: string;
}

interface NavitiaStopArea {
  id: string;
  name?: string;
  label?: string;
  codes?: NavitiaCode[];
  coord?: NavitiaCoord;
  administrative_regions?: NavitiaAdministrativeRegion[];
}

interface NavitiaStopAreasResponse {
  stop_areas?: NavitiaStopArea[];
  pagination?: NavitiaPagination;
}

interface NavitiaNearbyPlace {
  id?: string;
  name?: string;
  embedded_type?: string;
  distance?: string | number;
  stop_area?: NavitiaStopArea;
}

interface NavitiaPlacesNearbyResponse {
  places_nearby?: NavitiaNearbyPlace[];
  pagination?: NavitiaPagination;
}

interface NavitiaConnectionStopPoint {
  id?: string;
  name?: string;
  label?: string;
}

interface NavitiaConnection {
  origin?: NavitiaConnectionStopPoint;
  destination?: NavitiaConnectionStopPoint;
  duration?: number;
  display_duration?: number;
}

interface NavitiaConnectionsResponse {
  connections?: NavitiaConnection[];
  pagination?: NavitiaPagination;
}

interface NavitiaCoord {
  lon?: string;
  lat?: string;
}

interface NavitiaRoute {
  id: string;
  name?: string;
  direction?: {
    name?: string;
    stop_area?: NavitiaStopArea;
  };
}

interface NavitiaRoutesResponse {
  routes?: NavitiaRoute[];
  pagination?: NavitiaPagination;
}

interface NavitiaStopPoint {
  id: string;
  name?: string;
  label?: string;
  coord?: NavitiaCoord;
  codes?: NavitiaCode[];
  administrative_regions?: NavitiaAdministrativeRegion[];
  stop_area?: NavitiaStopArea;
}

interface NavitiaRouteScheduleRow {
  stop_point?: NavitiaStopPoint;
  date_times?: NavitiaDateTime[] | NavitiaDateTime;
}

interface NavitiaRouteSchedule {
  display_informations?: {
    direction?: string;
  };
  table?: {
    rows?: NavitiaRouteScheduleRow[];
  };
}

interface NavitiaRouteSchedulesResponse {
  route_schedules?: NavitiaRouteSchedule[];
}

interface NavitiaStopPointsResponse {
  stop_points?: NavitiaStopPoint[];
}

interface NavitiaPagination {
  start_page?: number;
  items_on_page?: number;
  items_per_page?: number;
  total_result?: number;
}

interface NavitiaServiceDayWindow {
  fromParam: string;
  cutoffParam: string;
}

interface BoardScheduleInfo {
  lastDepartures: LastDeparture[];
  scheduledDepartures: Departure[];
}

interface NavitiaRequestOptions {
  apiBase?: string;
  fetcher?: typeof fetch;
}

const API_BASE = "/api/idfm";
const NAVITIA_API_BASE = "/api/idfm/v2/navitia";

const familyMatchers: Record<TransitFamily, string[]> = {
  METRO: ["metro", "métro"],
  RER: ["rer"],
  BUS: ["bus"],
  TRAM: ["tram", "tramway"],
  NOCTILIEN: ["noctilien"],
  TRANSILIEN: ["transilien", "train"],
  CABLE: ["cable", "telepherique", "téléphérique", "funiculaire"],
};

const familyOrder: TransitFamily[] = [
  "METRO",
  "RER",
  "TRANSILIEN",
  "TRAM",
  "BUS",
  "NOCTILIEN",
  "CABLE",
];

const MAX_LINE_RESULTS = 1500;
const MAX_STATION_RESULTS = 500;
const MAX_MAP_ROUTES = 80;
const MAX_ROUTE_STOPS = 260;
const MAX_PATTERN_TRANSFER_STATIONS = 64;
const PATTERN_TRANSFER_BATCH_SIZE = 2;
const MAX_TRANSFER_CONNECTIONS = 140;
const MAX_TRANSFER_NEARBY_STOP_AREAS = 32;
const MAX_TRANSFER_STOP_AREA_LINE_LOOKUPS = 14;
const TRANSFER_NEARBY_DISTANCE_METERS = 650;
const TRANSFER_CONNECTION_MAX_DISPLAY_DURATION_SECONDS = 430;
const TRANSFER_CONNECTION_MAX_DURATION_SECONDS = 560;

const structuralTransferCache = new Map<string, Promise<TransferLineOption[]>>();
const transferStopAreaRefsCache = new Map<string, Promise<string[]>>();
const stopAreaLinesCache = new Map<string, Promise<NavitiaLine[]>>();
const vehicleJourneyStopCountCache = new Map<string, Promise<number | undefined>>();

function navitiaApiBase(options: NavitiaRequestOptions): string {
  return options.apiBase ?? NAVITIA_API_BASE;
}

function createNavitiaCacheKey(
  options: NavitiaRequestOptions,
  key: string,
): string {
  return `${navitiaApiBase(options)}:${key}`;
}

function navitiaFetch(
  input: RequestInfo | URL,
  options: NavitiaRequestOptions,
  init?: RequestInit,
): Promise<Response> {
  return (options.fetcher ?? fetch)(input, init);
}

async function navitiaFetchWithRetry(
  input: RequestInfo | URL,
  options: NavitiaRequestOptions,
  init?: RequestInit,
): Promise<Response> {
  const delays = [220, 620, 1200];

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const response = await navitiaFetch(input, options, init);

    if (response.status !== 429 || attempt === delays.length) {
      return response;
    }

    await wait(delays[attempt]);
  }

  return navitiaFetch(input, options, init);
}

export async function fetchTransitFamilyOptions(
  options: NavitiaRequestOptions = {},
): Promise<TransitFamilyOption[]> {
  const searchParams = new URLSearchParams({
    count: "100",
    disable_disruption: "true",
  });
  const response = await navitiaFetchWithRetry(
    `${navitiaApiBase(options)}/commercial_modes?${searchParams}`,
    options,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as NavitiaCommercialModesResponse;
  const familyOptions = (payload.commercial_modes ?? [])
    .map((mode) => mapCommercialModeToFamily(mode))
    .filter((option): option is TransitFamilyOption => option !== null);
  const dedupedOptions = new Map<TransitFamily, TransitFamilyOption>();

  familyOptions.forEach((option) => dedupedOptions.set(option.family, option));

  return Array.from(dedupedOptions.values()).sort((left, right) =>
    familyOrder.indexOf(left.family) - familyOrder.indexOf(right.family),
  );
}

export async function searchTransitLines(
  network: TransitFamilyOption,
  query: string,
  options: NavitiaRequestOptions = {},
): Promise<LineSearchOption[]> {
  const trimmedQuery = query.trim();
  const normalizedQuery = normalizeText(trimmedQuery);
  const primaryLines = trimmedQuery
    ? await searchLinesWithPtObjects(network, trimmedQuery, options)
    : await fetchLinesForCommercialMode(network, options);
  const primaryResults = mapSearchLines(primaryLines, network, normalizedQuery);

  if (primaryResults.length > 0 || !trimmedQuery) {
    return primaryResults;
  }

  const modeLines = await fetchLinesForCommercialMode(network, options);

  return mapSearchLines(modeLines, network, normalizedQuery);
}

function mapSearchLines(
  lines: NavitiaLine[],
  network: TransitFamilyOption,
  normalizedQuery: string,
): LineSearchOption[] {
  return dedupeLines(lines)
    .filter((line) => lineMatchesTransitFamily(line, network.family))
    .filter((line) => {
      if (!normalizedQuery) {
        return true;
      }

      return normalizeText(`${line.code ?? ""} ${line.name ?? ""}`).includes(
        normalizedQuery,
      );
    })
    .sort(compareLines)
    .map((line) => mapLineToSearchOption(line, network));
}

export async function searchLineStations(
  line: LineSearchOption,
  query: string,
  options: NavitiaRequestOptions = {},
): Promise<StationSearchOption[]> {
  const stations = await fetchLineStationsByLineId(line.navitiaId, options);
  const normalizedQuery = normalizeText(query.trim());

  return stations
    .filter((station) => {
      if (!normalizedQuery) {
        return true;
      }

      return normalizeText(`${station.label} ${station.city ?? ""}`).includes(
        normalizedQuery,
      );
    })
    .sort((left, right) => left.label.localeCompare(right.label, "fr"));
}

async function fetchLineStationsByLineId(
  lineId: string,
  options: NavitiaRequestOptions = {},
): Promise<StationSearchOption[]> {
  const searchParams = new URLSearchParams({
    count: "100",
    disable_disruption: "true",
    disable_geojson: "true",
  });
  const stopAreas = await fetchPaginatedCollection<
    NavitiaStopAreasResponse,
    NavitiaStopArea
  >(
    `${navitiaApiBase(options)}/lines/${encodeURIComponent(lineId)}/stop_areas`,
    searchParams,
    "stop_areas",
    MAX_STATION_RESULTS,
    options,
  );

  return dedupeStations(stopAreas.map(mapStopAreaToStation));
}

export async function fetchLineRouteSequences(
  line: LineSearchOption,
): Promise<LineRouteSequence[]> {
  const sequences = await fetchLineRouteSequencesByLineId(
    line.navitiaId,
    line.label,
  );

  if (sequences.length > 0) {
    return sequences;
  }

  const fallbackStations = await searchLineStations(line, "");

  if (fallbackStations.length > 1) {
    return [
      {
        id: `${line.id}:fallback`,
        label: line.label,
        direction: line.label,
        stops: fallbackStations.map((station) => ({
          id: createTopologyStationId(station.label),
          label: station.label,
          city: station.city,
          lon: undefined,
          lat: undefined,
          station: {
            ...station,
            id: createTopologyStationId(station.label),
          },
        })),
      },
    ];
  }

  return [];
}

export async function fetchLineRouteSummaries(
  lineId: string,
): Promise<Array<{ id: string; label: string; direction?: string }>> {
  const routes = await fetchLineRoutesById(lineId);

  return routes.map((route) => ({
    id: route.id,
    label: route.name ?? route.direction?.name ?? route.id,
    direction: cleanNavitiaDirection(route.direction?.name ?? route.name ?? ""),
  }));
}

export async function fetchLineStationTransferSummaries(
  line: LineSearchOption,
  limit = 18,
): Promise<Record<string, TransferLineOption[]>> {
  const stations = await searchLineStations(line, "");
  const entries = await Promise.all(
    stations.slice(0, limit).map(async (station) => [
      station.id,
      await fetchStationTransfers(station, line.id),
    ] as const),
  );

  return Object.fromEntries(entries);
}

export async function fetchStationTransfers(
  station: StationSearchOption,
  currentLineId?: string,
  options: NavitiaRequestOptions = {},
): Promise<TransferLineOption[]> {
  const stopAreaRef = station.scheduleStopAreaRef ?? station.id;
  const stopAreaRefs = await resolveTransferStopAreaRefs(
    station,
    stopAreaRef,
    options,
  );
  const lines: NavitiaLine[] = [];

  for (const ref of stopAreaRefs) {
    const stopAreaLines = await fetchLinesForStopArea(ref, options).catch(
      (): NavitiaLine[] => [],
    );

    lines.push(...stopAreaLines);
  }

  return dedupeTransferOptions(
    dedupeLines(lines)
      .filter((line) => line.id !== currentLineId)
      .map(mapLineToTransferOption),
  ).sort(compareTransferLines);
}

async function resolveTransferStopAreaRefs(
  station: StationSearchOption,
  stopAreaRef: string,
  options: NavitiaRequestOptions,
): Promise<string[]> {
  const cacheKey = createNavitiaCacheKey(
    options,
    `transfer-stop-areas:${stopAreaRef}:${station.label}`,
  );
  const cached = transferStopAreaRefsCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const request = fetchTransferStopAreaRefs(station, stopAreaRef, options).catch(
    () => [stopAreaRef],
  );

  transferStopAreaRefsCache.set(cacheKey, request);

  return request;
}

async function fetchTransferStopAreaRefs(
  station: StationSearchOption,
  stopAreaRef: string,
  options: NavitiaRequestOptions,
): Promise<string[]> {
  if (!isResolvableNavitiaStopAreaRef(stopAreaRef)) {
    return [stopAreaRef];
  }

  const refs = new Map<string, number>();

  refs.set(stopAreaRef, 0);

  const [connections, nearbyPlaces] = await Promise.all([
    fetchTransferConnections(stopAreaRef, options).catch(
      (): NavitiaConnection[] => [],
    ),
    fetchNearbyStopAreas(stopAreaRef, options).catch(
      (): NavitiaNearbyPlace[] => [],
    ),
  ]);
  const connectedNames = createConnectedTransferNames(connections);

  nearbyPlaces.forEach((place) => {
    const stopArea = place.stop_area;

    if (!stopArea?.id) {
      return;
    }

    if (
      stopArea.id === stopAreaRef ||
      stopAreaMatchesConnectedTransferNames(stopArea, connectedNames)
    ) {
      refs.set(
        stopArea.id,
        Math.min(refs.get(stopArea.id) ?? Number.POSITIVE_INFINITY, parseDistance(place.distance)),
      );
    }
  });

  if (refs.size === 1 && nearbyPlaces.length > 0) {
    addSameNamedNearbyStopAreas(station, nearbyPlaces, refs);
  }

  return Array.from(refs.entries())
    .sort((left, right) => left[1] - right[1])
    .map(([ref]) => ref)
    .slice(0, MAX_TRANSFER_STOP_AREA_LINE_LOOKUPS);
}

async function fetchLinesForStopArea(
  stopAreaRef: string,
  options: NavitiaRequestOptions = {},
): Promise<NavitiaLine[]> {
  const cacheKey = createNavitiaCacheKey(options, `stop-area-lines:${stopAreaRef}`);
  const cached = stopAreaLinesCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const searchParams = new URLSearchParams({
    count: "80",
    disable_disruption: "true",
    disable_geojson: "true",
  });
  const request = fetchPaginatedCollection<NavitiaLinesResponse, NavitiaLine>(
    `${navitiaApiBase(options)}/stop_areas/${encodeURIComponent(stopAreaRef)}/lines`,
    searchParams,
    "lines",
    120,
    options,
  ).catch((error) => {
    stopAreaLinesCache.delete(cacheKey);
    throw error;
  });

  stopAreaLinesCache.set(cacheKey, request);

  return request;
}

function fetchTransferConnections(
  stopAreaRef: string,
  options: NavitiaRequestOptions,
): Promise<NavitiaConnection[]> {
  const searchParams = new URLSearchParams({
    count: String(MAX_TRANSFER_CONNECTIONS),
    disable_disruption: "true",
    disable_geojson: "true",
  });

  return fetchPaginatedCollection<NavitiaConnectionsResponse, NavitiaConnection>(
    `${navitiaApiBase(options)}/stop_areas/${encodeURIComponent(stopAreaRef)}/connections`,
    searchParams,
    "connections",
    MAX_TRANSFER_CONNECTIONS,
    options,
  );
}

function fetchNearbyStopAreas(
  stopAreaRef: string,
  options: NavitiaRequestOptions,
): Promise<NavitiaNearbyPlace[]> {
  const searchParams = new URLSearchParams({
    count: String(MAX_TRANSFER_NEARBY_STOP_AREAS),
    disable_disruption: "true",
    disable_geojson: "true",
    distance: String(TRANSFER_NEARBY_DISTANCE_METERS),
  });

  searchParams.append("type[]", "stop_area");

  return fetchPaginatedCollection<NavitiaPlacesNearbyResponse, NavitiaNearbyPlace>(
    `${navitiaApiBase(options)}/stop_areas/${encodeURIComponent(stopAreaRef)}/places_nearby`,
    searchParams,
    "places_nearby",
    MAX_TRANSFER_NEARBY_STOP_AREAS,
    options,
  );
}

function createConnectedTransferNames(
  connections: NavitiaConnection[],
): Set<string> {
  const names = new Set<string>();

  connections
    .filter(connectionHasTransferDuration)
    .forEach((connection) => {
      [connection.origin, connection.destination].forEach((stopPoint) => {
        addTransferNameVariants(names, stopPoint?.name);
        addTransferNameVariants(names, stopPoint?.label);
      });
    });

  return names;
}

function connectionHasTransferDuration(connection: NavitiaConnection): boolean {
  const displayDuration = Number(connection.display_duration);
  const duration = Number(connection.duration);

  return (
    (Number.isFinite(displayDuration) &&
      displayDuration <= TRANSFER_CONNECTION_MAX_DISPLAY_DURATION_SECONDS) ||
    (Number.isFinite(duration) &&
      duration <= TRANSFER_CONNECTION_MAX_DURATION_SECONDS)
  );
}

function stopAreaMatchesConnectedTransferNames(
  stopArea: NavitiaStopArea,
  connectedNames: Set<string>,
): boolean {
  const candidates = createTransferNameVariants(stopArea.name)
    .concat(createTransferNameVariants(stopArea.label));

  return candidates.some((candidate) =>
    Array.from(connectedNames).some((connectedName) =>
      transferNamesAreCompatible(candidate, connectedName),
    ),
  );
}

function addSameNamedNearbyStopAreas(
  station: StationSearchOption,
  nearbyPlaces: NavitiaNearbyPlace[],
  refs: Map<string, number>,
): void {
  const stationNames = createTransferNameVariants(station.label);

  nearbyPlaces.forEach((place) => {
    const stopArea = place.stop_area;

    if (!stopArea?.id) {
      return;
    }

    const stopAreaNames = createTransferNameVariants(stopArea.name)
      .concat(createTransferNameVariants(stopArea.label));
    const matchesStationName = stopAreaNames.some((stopAreaName) =>
      stationNames.some((stationName) =>
        transferNamesAreCompatible(stopAreaName, stationName),
      ),
    );

    if (matchesStationName) {
      refs.set(
        stopArea.id,
        Math.min(refs.get(stopArea.id) ?? Number.POSITIVE_INFINITY, parseDistance(place.distance)),
      );
    }
  });
}

function addTransferNameVariants(
  names: Set<string>,
  value: string | undefined,
): void {
  createTransferNameVariants(value).forEach((name) => names.add(name));
}

function createTransferNameVariants(value: string | undefined): string[] {
  const normalized = normalizeTransferName(value);

  if (!normalized) {
    return [];
  }

  const compacted = normalized.replace(/\s+/g, "");

  return Array.from(new Set([normalized, compacted])).filter(
    (variant) => variant.length >= 3,
  );
}

function transferNamesAreCompatible(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  if (
    !left.includes(" ") &&
    !right.includes(" ") &&
    (left.includes(right) || right.includes(left))
  ) {
    return Math.min(left.length, right.length) >= 8;
  }

  const leftTokens = createTransferNameTokens(left);
  const rightTokens = createTransferNameTokens(right);
  const shortestTokenCount = Math.min(leftTokens.size, rightTokens.size);

  if (shortestTokenCount === 0) {
    return false;
  }

  const sharedTokenCount = Array.from(leftTokens).filter((token) =>
    rightTokens.has(token),
  ).length;

  return sharedTokenCount >= Math.min(shortestTokenCount, 2);
}

function createTransferNameTokens(value: string): Set<string> {
  return new Set(
    value
      .split(/\s+/u)
      .filter((token) => token.length >= 3)
      .filter((token) => !["gare", "station", "metro", "rer"].includes(token)),
  );
}

function normalizeTransferName(value: string | undefined): string {
  return normalizeText(cleanStationLabel(value ?? ""))
    .replace(/[’']/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\b(paris|metro|metropolitain)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDistance(value: string | number | undefined): number {
  const distance = Number(value);

  return Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY;
}

function isResolvableNavitiaStopAreaRef(value: string): boolean {
  return /^stop_area:IDFM:\d+$/u.test(value);
}

export async function fetchDepartureCallingPattern(
  board: TransitBoardConfig,
  departure: Departure,
): Promise<DepartureCallingPattern> {
  const patternDeparture: Departure = {
    ...departure,
    stopName: board.title || departure.stopName,
  };
  const lineId = board.schedule?.lineRef ?? navitiaLineIdFromSiriRef(board.line.ref);
  const routes = await fetchLineRoutesById(lineId);
  const lineTopologyPromise = fetchLineRouteSequencesByLineId(
    lineId,
    board.line.shortName || board.line.longName,
  )
    .then((sequences) => hydrateLineTopologyTransfers(sequences, lineId))
    .catch(() =>
      fetchLineTopologyFromRoutes(routes, board.line.shortName || board.line.longName)
        .then((sequences) => hydrateLineTopologyTransfers(sequences, lineId)),
    );
  const candidateRoutes = sortRoutesForDeparture(routes, patternDeparture);

  for (const route of candidateRoutes) {
    const schedules = await fetchRouteSchedulesForDeparture(route, patternDeparture).catch(
      () => [],
    );

    for (const schedule of schedules) {
      const pattern = mapRouteScheduleToCallingPattern(schedule, patternDeparture);

      if (pattern && patternMatchesDepartureDestination(pattern, patternDeparture)) {
        const hydratedPattern = await hydrateCallingPatternTransfers(
          pattern,
          lineId,
        );
        const lineTopology = await lineTopologyPromise;

        const mergedPattern = mergePatternWithTopologyTransfers(
          hydratedPattern,
          lineTopology,
        );

        return {
          ...applyTopologyCorridorFallback(
            mergedPattern,
            lineTopology,
            patternDeparture,
          ),
          lineTopology,
        };
      }
    }
  }

  const fallbackRoute = candidateRoutes[0] ?? routes[0];

  if (fallbackRoute) {
    const stops = await fetchOrderedRouteStops(fallbackRoute).catch(() => []);

    if (stops.length > 0) {
      const fallbackPattern = await hydrateCallingPatternTransfers(
        {
          departureId: departure.id,
          destination: departure.destination,
          serviceType: "inconnu",
          calls: mapFallbackRouteStopsToCalls(stops, patternDeparture),
        },
        lineId,
      );
      const lineTopology = await lineTopologyPromise;

      const mergedPattern = mergePatternWithTopologyTransfers(
        fallbackPattern,
        lineTopology,
      );

      return {
        ...applyTopologyCorridorFallback(
          mergedPattern,
          lineTopology,
          patternDeparture,
        ),
        lineTopology,
      };
    }
  }

  return {
    departureId: departure.id,
    destination: departure.destination,
    serviceType: "inconnu",
    calls: [],
    lineTopology: await lineTopologyPromise,
    error: "Desserte indisponible pour ce passage.",
  };
}

function applyTopologyCorridorFallback(
  pattern: DepartureCallingPattern,
  lineTopology: LineRouteSequence[],
  departure: Departure,
): DepartureCallingPattern {
  const servedCalls = pattern.calls.filter((call) => call.served);
  const currentCall = pattern.calls.find((call) => call.current);
  const currentMatchesDeparture =
    currentCall !== undefined &&
    labelsMatchStation(currentCall.label, departure.stopName);
  const servedDestination = servedCalls[servedCalls.length - 1];
  const destinationMatches =
    servedDestination !== undefined &&
    directionMatchesRule(servedDestination.label, departure.destination);

  if (
    currentMatchesDeparture &&
    destinationMatches &&
    servedCalls.length > 1
  ) {
    return pattern;
  }

  const corridorStops = findTopologyCorridorStops(lineTopology, departure);

  if (!corridorStops || corridorStops.length === 0) {
    return pattern;
  }

  const corridorKeys = new Set(corridorStops.map((stop) => stop.id));
  const callsByStationKey = new Map(
    pattern.calls.map((call) => [createTopologyTransferStationKey(call.label), call]),
  );
  const corridorCalls = corridorStops.map((stop, index) => {
    const existing = callsByStationKey.get(createTopologyTransferStationKey(stop.label));

    return {
      id: existing?.id ?? stop.id,
      label: existing?.label ?? stop.label,
      city: existing?.city ?? stop.city,
      current: index === 0,
      served: true,
      stopAreaRef: existing?.stopAreaRef ?? stop.station.scheduleStopAreaRef ?? stop.id,
      time:
        existing?.time ??
        (index === 0 ? getDepartureTimeValue(departure) : undefined),
      transferLines: existing?.transferLines ?? stop.transferLines,
    } satisfies DepartureCall;
  });
  const remainingCalls = pattern.calls
    .filter((call) => !corridorKeys.has(call.stopAreaRef ?? call.id))
    .filter(
      (call) =>
        !corridorStops.some((stop) => labelsMatchStation(stop.label, call.label)),
    )
    .map((call) => ({
      ...call,
      current: false,
      served: false,
      time: undefined,
    }));

  return {
    ...pattern,
    serviceType: getServiceType(corridorCalls.length, corridorStops.length),
    calls: [...corridorCalls, ...remainingCalls],
  };
}

function findTopologyCorridorStops(
  lineTopology: LineRouteSequence[],
  departure: Departure,
): LineRouteStop[] | undefined {
  const candidates = lineTopology
    .map((sequence) => dedupeStopSequence(sequence.stops))
    .flatMap((stops) => {
      const startIndex = stops.findIndex((stop) =>
        lineStopMatchesDepartureStation(stop, departure),
      );
      const destinationIndex = stops.findIndex((stop) =>
        directionMatchesRule(stop.label, departure.destination),
      );

      if (startIndex < 0 || destinationIndex < 0 || startIndex === destinationIndex) {
        return [];
      }

      const minIndex = Math.min(startIndex, destinationIndex);
      const maxIndex = Math.max(startIndex, destinationIndex);
      const corridor = stops.slice(minIndex, maxIndex + 1);

      return [
        {
          stops: startIndex <= destinationIndex ? corridor : corridor.reverse(),
          distance: Math.abs(destinationIndex - startIndex),
        },
      ];
    })
    .sort((left, right) => right.distance - left.distance);

  return candidates[0]?.stops;
}

function lineStopMatchesDepartureStation(
  stop: LineRouteStop,
  departure: Departure,
): boolean {
  const refs = [
    stop.id,
    stop.station.id,
    stop.station.scheduleStopAreaRef,
    departure.monitoringRef,
    departure.navitiaStopPointRef,
  ].filter(Boolean);

  if (
    refs.some((ref) =>
      refs.some((candidate) => ref !== candidate && ref === candidate),
    )
  ) {
    return true;
  }

  return labelsMatchStation(stop.label, departure.stopName);
}

function labelsMatchStation(left: string | undefined, right: string | undefined): boolean {
  const leftKey = normalizeText(left);
  const rightKey = normalizeText(right);

  return Boolean(
    leftKey &&
      rightKey &&
      (leftKey.includes(rightKey) || rightKey.includes(leftKey)),
  );
}

function mergePatternWithTopologyTransfers(
  pattern: DepartureCallingPattern,
  lineTopology: LineRouteSequence[],
): DepartureCallingPattern {
  const transfersByStationKey = new Map<string, TransferLineOption[]>();

  lineTopology.forEach((sequence) => {
    sequence.stops.forEach((stop) => {
      if (!stop.transferLines || stop.transferLines.length === 0) {
        return;
      }

      const key = createTopologyTransferStationKey(stop.label);
      transfersByStationKey.set(
        key,
        dedupeTransferOptions([
          ...(transfersByStationKey.get(key) ?? []),
          ...stop.transferLines,
        ]),
      );
    });
  });

  return {
    ...pattern,
    calls: pattern.calls.map((call) => ({
      ...call,
      transferLines: dedupeTransferOptions([
        ...(call.transferLines ?? []),
        ...(transfersByStationKey.get(createTopologyTransferStationKey(call.label)) ?? []),
      ]),
    })),
  };
}

function createTopologyTransferStationKey(label: string): string {
  return normalizeText(cleanTopologyStationLabel(label));
}

async function hydrateLineTopologyTransfers(
  sequences: LineRouteSequence[],
  currentLineId: string,
): Promise<LineRouteSequence[]> {
  const selectableStations = await fetchLineStationsByLineId(currentLineId).catch(
    () => [],
  );
  const stopsByKey = new Map<string, LineRouteStop>();

  sequences.forEach((sequence) => {
    sequence.stops.forEach((stop) => {
      const key = stop.station.scheduleStopAreaRef ?? stop.id;

      if (!stopsByKey.has(key)) {
        stopsByKey.set(key, stop);
      }
    });
  });

  const transferEntries = new Map<string, TransferLineOption[]>();
  const stops = Array.from(stopsByKey.entries()).slice(0, MAX_PATTERN_TRANSFER_STATIONS);

  for (let index = 0; index < stops.length; index += PATTERN_TRANSFER_BATCH_SIZE) {
    const batch = stops.slice(index, index + PATTERN_TRANSFER_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async ([key, stop]) => [
        key,
        await fetchTransfersForStationSelection(
          findMatchingSelectableStation(stop, selectableStations) ?? stop.station,
          currentLineId,
        ).catch(() => []),
      ] as const),
    );

    results.forEach(([key, transfers]) => {
      transferEntries.set(key, transfers);
    });
  }

  return sequences.map((sequence) => ({
    ...sequence,
    stops: sequence.stops.map((stop) => ({
      ...stop,
      transferLines:
        transferEntries.get(stop.station.scheduleStopAreaRef ?? stop.id) ??
        stop.transferLines,
    })),
  }));
}

function findMatchingSelectableStation(
  stop: LineRouteStop,
  stations: StationSearchOption[],
): StationSearchOption | undefined {
  const stopLabelKey = normalizeText(stop.label);
  const stopCityKey = normalizeText(stop.city);

  return stations.find((station) => {
    const stationLabelKey = normalizeText(station.label);
    const stationCityKey = normalizeText(station.city);

    return (
      stationLabelKey === stopLabelKey &&
      (!stopCityKey || !stationCityKey || stationCityKey === stopCityKey)
    );
  });
}

async function hydrateCallingPatternTransfers(
  pattern: DepartureCallingPattern,
  currentLineId: string,
): Promise<DepartureCallingPattern> {
  const transferTargets = dedupeDepartureCallsForTransfers(pattern.calls)
    .map(createStationFromDepartureCall)
    .filter((station): station is StationSearchOption => Boolean(station))
    .slice(0, MAX_PATTERN_TRANSFER_STATIONS);

  if (transferTargets.length === 0) {
    return pattern;
  }

  const transferEntries = new Map<string, TransferLineOption[]>();

  for (
    let index = 0;
    index < transferTargets.length;
    index += PATTERN_TRANSFER_BATCH_SIZE
  ) {
    const batch = transferTargets.slice(index, index + PATTERN_TRANSFER_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (station) => [
        createStationTransferKey(station),
        await fetchTransfersForStationSelection(station, currentLineId).catch(
          () => [],
        ),
      ] as const),
    );

    results.forEach(([stopAreaRef, transfers]) => {
      transferEntries.set(stopAreaRef, transfers);
    });
  }

  return {
    ...pattern,
    calls: pattern.calls.map((call) => ({
      ...call,
      transferLines: call.stopAreaRef
        ? transferEntries.get(call.stopAreaRef) ?? call.transferLines
        : call.transferLines,
    })),
  };
}

function dedupeDepartureCallsForTransfers(calls: DepartureCall[]): DepartureCall[] {
  const deduped = new Map<string, DepartureCall>();

  calls.forEach((call) => {
    deduped.set(createCallTransferKey(call), call);
  });

  return Array.from(deduped.values());
}

function createCallTransferKey(call: DepartureCall): string {
  return call.stopAreaRef ?? `${normalizeText(call.label)}:${normalizeText(call.city)}`;
}

function createStationFromDepartureCall(
  call: DepartureCall,
): StationSearchOption | undefined {
  if (!call.stopAreaRef) {
    return undefined;
  }

  return {
    id: call.stopAreaRef,
    label: call.label,
    city: call.city,
    monitoringRef: "",
    scheduleStopAreaRef: call.stopAreaRef,
  };
}

function fetchTransfersForStationSelection(
  station: StationSearchOption,
  currentLineId: string,
): Promise<TransferLineOption[]> {
  const cacheKey = `${currentLineId}::${createStationTransferKey(station)}`;
  const cached = structuralTransferCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const request = fetchStationTransfersWithRetry(station, currentLineId)
    .then((transfers) => transfers.slice(0, 40))
    .catch((error) => {
      structuralTransferCache.delete(cacheKey);
      throw error;
    });

  structuralTransferCache.set(cacheKey, request);

  return request;
}

async function fetchStationTransfersWithRetry(
  station: StationSearchOption,
  currentLineId: string,
): Promise<TransferLineOption[]> {
  try {
    return await fetchStationTransfers(station, currentLineId);
  } catch (error) {
    await wait(180);
    return fetchStationTransfers(station, currentLineId);
  }
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });
}

function createStationTransferKey(station: StationSearchOption): string {
  return station.scheduleStopAreaRef ?? station.id;
}

type RawLineTopologyRoute = {
  id: string;
  label: string;
  stops: LineRouteStop[];
};

interface ServerLineTopology {
  stations: Array<{
    id: string;
    name: string;
    lat?: number;
    lon?: number;
    projectedX?: number;
    projectedY?: number;
  }>;
  segments?: Array<{
    id: string;
    from: string;
    to: string;
  }>;
  patterns: Array<{
    id: string;
    terminalFrom: string;
    terminalTo: string;
    stops: string[];
  }>;
}

export function convertServerTopologyToLineRouteSequences(
  topology: ServerLineTopology,
): LineRouteSequence[] {
  const stations = new Map(topology.stations.map((station) => [station.id, station]));
  const segmentSequences = (topology.segments ?? [])
    .map<LineRouteSequence | undefined>((segment) => {
      const from = stations.get(segment.from);
      const to = stations.get(segment.to);

      if (!from || !to) {
        return undefined;
      }

      return {
        id: segment.id,
        label: `${from.name} ↔ ${to.name}`,
        direction: to.name,
        topologySource: "server",
        stops: [from, to].map((station) => createServerTopologyRouteStop(station)),
      } satisfies LineRouteSequence;
    })
    .filter((sequence): sequence is LineRouteSequence => Boolean(sequence));

  if (segmentSequences.length > 0) {
    return segmentSequences;
  }

  return topology.patterns
    .map((pattern) => {
      const stops = pattern.stops.flatMap((stationId) => {
        const station = stations.get(stationId);

        if (!station) {
          return [];
        }

        return [createServerTopologyRouteStop(station)];
      });

      return {
        id: pattern.id,
        label: `${pattern.terminalFrom} ↔ ${pattern.terminalTo}`,
        direction: pattern.terminalTo,
        topologySource: "server",
        stops,
      } satisfies LineRouteSequence;
    })
    .filter((sequence) => sequence.stops.length >= 2);
}

function createServerTopologyRouteStop(
  station: ServerLineTopology["stations"][number],
): LineRouteStop {
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

async function fetchLineRouteSequencesByLineId(
  lineId: string,
  lineLabel: string,
): Promise<LineRouteSequence[]> {
  const serverSequences = await fetchServerLineTopology(lineId).catch(() => []);

  if (serverSequences.length > 0) {
    return serverSequences;
  }

  return [];
}

async function fetchServerLineTopology(
  lineId: string,
): Promise<LineRouteSequence[]> {
  const response = await fetch(
    `/api/lines/${encodeURIComponent(lineId)}/topology`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const topology = (await response.json()) as ServerLineTopology;
  return convertServerTopologyToLineRouteSequences(topology);
}

async function fetchLineScheduleTopologyRoutes(
  lineId: string,
): Promise<RawLineTopologyRoute[]> {
  const serviceDay = getParisServiceDayWindow();
  const searchParams = new URLSearchParams({
    count: "100",
    data_freshness: "base_schedule",
    disable_disruption: "true",
    disable_geojson: "true",
    duration: "108000",
    from_datetime: serviceDay.fromParam,
    items_per_schedule: "1",
  });

  const response = await fetch(
    `${NAVITIA_API_BASE}/lines/${encodeURIComponent(lineId)}/route_schedules?${searchParams}`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as NavitiaRouteSchedulesResponse;

  return (payload.route_schedules ?? [])
    .map((schedule, index) => {
      const stops = dedupeStopSequence(
        (schedule.table?.rows ?? [])
          .map((row) => row.stop_point)
          .filter((stop): stop is NavitiaStopPoint => Boolean(stop))
          .map(mapStopPointToLineRouteStop)
          .filter((stop): stop is LineRouteStop => Boolean(stop)),
      );
      const first = stops[0]?.label ?? "";
      const last = stops[stops.length - 1]?.label ?? "";
      const label = cleanNavitiaDirection(
        schedule.display_informations?.direction ??
        (first && last ? `${first} ↔ ${last}` : `Parcours ${index + 1}`),
      );

      return {
        id: `schedule:${index}:${createStableId(`${first}-${last}-${label}`)}`,
        label,
        stops,
      };
    })
    .filter((route) => route.stops.length >= 2);
}

async function fetchLineTopologyFromRoutes(
  routes: NavitiaRoute[],
  lineLabel: string,
): Promise<LineRouteSequence[]> {
  const routeStops = await Promise.all(
    routes.map(async (route) => {
      const stops = await fetchOrderedRouteStops(route).catch(() => []);
      const sequence = dedupeStopSequence(
        stops
          .map(mapStopPointToLineRouteStop)
          .filter((stop): stop is LineRouteStop => Boolean(stop)),
      );

      return {
        id: route.id,
        label: cleanNavitiaDirection(
          route.name ?? route.direction?.name ?? lineLabel,
        ),
        stops: sequence,
      };
    }),
  );

  return buildLineTopologySequences(routeStops, lineLabel);
}

function buildLineTopologySequences(
  rawRoutes: RawLineTopologyRoute[],
  lineLabel: string,
): LineRouteSequence[] {
  const routes = dedupeRawTopologyRoutes(
    rawRoutes
      .map((route) => ({
        ...route,
        stops: dedupeStopSequence(route.stops),
      }))
      .filter((route) => route.stops.length >= 2),
  );

  if (routes.length === 0) {
    return [];
  }

  const maxLength = Math.max(...routes.map((route) => route.stops.length));
  const minimumLongRouteLength = Math.max(2, Math.floor(maxLength * 0.7));
  const longRoutes = routes.filter(
    (route) => route.stops.length >= minimumLongRouteLength,
  );
  const trunkStops = findCommonOrderedTrunk(longRoutes);

  if (trunkStops.length >= 2 && trunkStops.length < maxLength) {
    return buildTrunkAndBranchSequences(routes, trunkStops, lineLabel);
  }

  return routes
    .sort((left, right) => right.stops.length - left.stops.length)
    .slice(0, Math.min(routes.length, 12))
    .map((route, index) => ({
      id: route.id || `topology:route:${index}`,
      label: route.label || lineLabel,
      direction: route.label || lineLabel,
      stops: route.stops,
    }));
}

function findCommonOrderedTrunk(routes: RawLineTopologyRoute[]): LineRouteStop[] {
  if (routes.length === 0) {
    return [];
  }

  const [referenceRoute] = [...routes].sort(
    (left, right) => right.stops.length - left.stops.length,
  );
  const commonStopIds = new Set(referenceRoute.stops.map((stop) => stop.id));

  for (const route of routes) {
    const routeStopIds = new Set(route.stops.map((stop) => stop.id));

    for (const stopId of Array.from(commonStopIds)) {
      if (!routeStopIds.has(stopId)) {
        commonStopIds.delete(stopId);
      }
    }
  }

  const seen = new Set<string>();

  return referenceRoute.stops.filter((stop) => {
    if (!commonStopIds.has(stop.id) || seen.has(stop.id)) {
      return false;
    }

    seen.add(stop.id);
    return true;
  });
}

function buildTrunkAndBranchSequences(
  routes: RawLineTopologyRoute[],
  trunkStops: LineRouteStop[],
  lineLabel: string,
): LineRouteSequence[] {
  const trunkStopIds = new Set(trunkStops.map((stop) => stop.id));
  const branchCandidates = new Map<string, LineRouteStop[]>();

  for (const route of routes) {
    let firstTrunkIndex = -1;
    let lastTrunkIndex = -1;

    route.stops.forEach((stop, index) => {
      if (!trunkStopIds.has(stop.id)) {
        return;
      }

      if (firstTrunkIndex === -1) {
        firstTrunkIndex = index;
      }

      lastTrunkIndex = index;
    });

    if (firstTrunkIndex === -1 || lastTrunkIndex === -1) {
      continue;
    }

    const startBranch = route.stops.slice(0, firstTrunkIndex);
    const endBranch = route.stops.slice(lastTrunkIndex + 1);
    const firstTrunkStop = route.stops[firstTrunkIndex];
    const lastTrunkStop = route.stops[lastTrunkIndex];

    if (startBranch.length > 0) {
      upsertBranchCandidate(
        branchCandidates,
        [firstTrunkStop, ...startBranch.reverse()],
      );
    }

    if (endBranch.length > 0) {
      upsertBranchCandidate(
        branchCandidates,
        [lastTrunkStop, ...endBranch],
      );
    }
  }

  const sequences: LineRouteSequence[] = [
    {
      id: `topology:${createStableId(lineLabel)}:trunk`,
      label: `${lineLabel} · tronc commun`,
      direction: "Tronc commun",
      stops: trunkStops,
    },
  ];

  Array.from(branchCandidates.values())
    .sort(compareBranchSequences)
    .forEach((stops, index) => {
      const anchor = stops[0];
      const terminal = stops[stops.length - 1];

      sequences.push({
        id: `topology:${createStableId(lineLabel)}:branch:${index}:${createStableId(terminal.label)}`,
        label: `${anchor.label} ↔ ${terminal.label}`,
        direction: terminal.label,
        stops,
      });
    });

  return sequences;
}

function upsertBranchCandidate(
  branches: Map<string, LineRouteStop[]>,
  stops: LineRouteStop[],
): void {
  const cleanStops = dedupeStopSequence(stops).filter(Boolean);

  if (cleanStops.length < 2) {
    return;
  }

  const anchor = cleanStops[0];
  const terminal = cleanStops[cleanStops.length - 1];
  const key = `${anchor.id}__${terminal.id}`;
  const existing = branches.get(key);

  if (!existing || cleanStops.length > existing.length) {
    branches.set(key, cleanStops);
  }
}

function compareBranchSequences(
  left: LineRouteStop[],
  right: LineRouteStop[],
): number {
  const leftAnchor = left[0]?.label ?? "";
  const rightAnchor = right[0]?.label ?? "";
  const anchorCompare = leftAnchor.localeCompare(rightAnchor, "fr", {
    numeric: true,
    sensitivity: "base",
  });

  if (anchorCompare !== 0) {
    return anchorCompare;
  }

  return (left[left.length - 1]?.label ?? "").localeCompare(
    right[right.length - 1]?.label ?? "",
    "fr",
    {
      numeric: true,
      sensitivity: "base",
    },
  );
}

function dedupeRawTopologyRoutes(
  routes: RawLineTopologyRoute[],
): RawLineTopologyRoute[] {
  const bestByCanonicalKey = new Map<string, RawLineTopologyRoute>();

  for (const route of routes) {
    const uniqueRatio = new Set(route.stops.map((stop) => stop.id)).size / route.stops.length;

    if (uniqueRatio < 0.8) {
      continue;
    }

    const key = createCanonicalSequenceKey(route.stops.map((stop) => stop.id));
    const existing = bestByCanonicalKey.get(key);

    if (!existing || route.stops.length > existing.stops.length) {
      bestByCanonicalKey.set(key, route);
    }
  }

  return Array.from(bestByCanonicalKey.values());
}

async function fetchLinesForCommercialMode(
  network: TransitFamilyOption,
  options: NavitiaRequestOptions = {},
): Promise<NavitiaLine[]> {
  const searchParams = new URLSearchParams({
    count: "100",
    disable_disruption: "true",
    disable_geojson: "true",
  });

  return fetchPaginatedCollection<NavitiaLinesResponse, NavitiaLine>(
    `${navitiaApiBase(options)}/commercial_modes/${encodeURIComponent(network.id)}/lines`,
    searchParams,
    "lines",
    MAX_LINE_RESULTS,
    options,
  );
}

async function searchLinesWithPtObjects(
  network: TransitFamilyOption,
  query: string,
  options: NavitiaRequestOptions = {},
): Promise<NavitiaLine[]> {
  const searchParams = new URLSearchParams({
    count: "100",
    disable_disruption: "true",
    disable_geojson: "true",
    q: query,
  });

  searchParams.append("type[]", "line");

  const response = await navitiaFetchWithRetry(
    `${navitiaApiBase(options)}/pt_objects?${searchParams}`,
    options,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as NavitiaPtObjectsResponse;
  const lines = (payload.pt_objects ?? [])
    .filter((object) => object.embedded_type === "line")
    .map((object) => object.line)
    .filter((line): line is NavitiaLine => Boolean(line));

  if (lines.length > 0) {
    return lines;
  }

  return fetchLinesForCommercialMode(network);
}

async function fetchLineRoutes(line: LineSearchOption): Promise<NavitiaRoute[]> {
  return fetchLineRoutesById(line.navitiaId);
}

async function fetchLineRoutesById(lineId: string): Promise<NavitiaRoute[]> {
  const searchParams = new URLSearchParams({
    count: "100",
    disable_disruption: "true",
    disable_geojson: "true",
  });

  return fetchPaginatedCollection<NavitiaRoutesResponse, NavitiaRoute>(
    `${NAVITIA_API_BASE}/lines/${encodeURIComponent(lineId)}/routes`,
    searchParams,
    "routes",
    MAX_MAP_ROUTES,
  );
}

async function fetchOrderedRouteStops(
  route: NavitiaRoute,
): Promise<NavitiaStopPoint[]> {
  const scheduledStops = await fetchRouteScheduleStops(route).catch(() => []);

  if (scheduledStops.length > 1) {
    return scheduledStops;
  }

  return fetchRouteStopPoints(route).catch(() => scheduledStops);
}

async function fetchRouteScheduleStops(
  route: NavitiaRoute,
): Promise<NavitiaStopPoint[]> {
  const serviceDay = getParisServiceDayWindow();
  const searchParams = new URLSearchParams({
    count: "1",
    data_freshness: "base_schedule",
    disable_disruption: "true",
    disable_geojson: "true",
    duration: "108000",
    from_datetime: serviceDay.fromParam,
    items_per_schedule: "1",
  });
  const response = await fetch(
    `${NAVITIA_API_BASE}/routes/${encodeURIComponent(route.id)}/route_schedules?${searchParams}`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as NavitiaRouteSchedulesResponse;

  return (payload.route_schedules ?? [])
    .flatMap((schedule) => schedule.table?.rows ?? [])
    .map((row) => row.stop_point)
    .filter((stop): stop is NavitiaStopPoint => Boolean(stop));
}

async function fetchRouteSchedulesForDeparture(
  route: NavitiaRoute,
  departure: Departure,
): Promise<NavitiaRouteSchedule[]> {
  const targetTime = getDepartureTimestamp(departure);
  const fromDate = new Date(
    Number.isFinite(targetTime) && targetTime !== Number.MAX_SAFE_INTEGER
      ? targetTime - 45 * 60_000
      : Date.now(),
  );
  const searchParams = new URLSearchParams({
    count: "1",
    data_freshness: "base_schedule",
    disable_disruption: "true",
    disable_geojson: "true",
    duration: "10800",
    from_datetime: formatParisNavitiaDateTime(fromDate),
    items_per_schedule: "12",
  });
  const response = await fetch(
    `${NAVITIA_API_BASE}/routes/${encodeURIComponent(route.id)}/route_schedules?${searchParams}`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as NavitiaRouteSchedulesResponse;

  return payload.route_schedules ?? [];
}

function mapRouteScheduleToCallingPattern(
  schedule: NavitiaRouteSchedule,
  departure: Departure,
): DepartureCallingPattern | null {
  const rows = (schedule.table?.rows ?? []).filter(
    (row) => Boolean(row.stop_point),
  );

  if (rows.length === 0) {
    return null;
  }

  const match = findMatchingScheduleDateTime(rows, departure);

  if (!match) {
    return null;
  }

  const terminalRowIndex = findDestinationRowIndex(
    rows,
    departure,
    match.rowIndex,
  );
  const calls = rows
    .map((row, rowIndex) => {
      if (!row.stop_point) {
        return null;
      }

      const dateTime = findMatchingRowDateTime(row, match);
      const isCurrentRow = rowIndex === match.rowIndex;
      const served =
        (Boolean(dateTime?.date_time) || isCurrentRow) &&
        rowMatchesDeparturePath(
          row,
          rowIndex,
          match.rowIndex,
          terminalRowIndex,
          departure,
        );

      return mapStopPointToDepartureCall(
        row.stop_point,
        isCurrentRow ||
        (served && stopMatchesDepartureStation(row.stop_point, departure)),
        served && dateTime?.date_time
          ? parseNavitiaDateTime(dateTime.date_time)
          : isCurrentRow
            ? getDepartureTimeValue(departure)
          : undefined,
        served,
      );
    })
    .filter((call): call is DepartureCall => call !== null);

  if (calls.every((call) => !call.served)) {
    return null;
  }

  const servedCalls = calls.filter((call) => call.served);

  return {
    departureId: departure.id,
    destination:
      cleanNavitiaDirection(schedule.display_informations?.direction ?? "") ||
      departure.destination,
    serviceType: getServiceType(servedCalls.length, calls.length),
    calls,
  };
}

function findMatchingScheduleDateTime(
  rows: NavitiaRouteScheduleRow[],
  departure: Departure,
): {
  dateTimeIndex: number;
  journeyId?: string;
  rowIndex: number;
} | null {
  const targetTimestamp = getDepartureTimestamp(departure);
  const currentRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row, index }) => {
      if (row.stop_point && stopMatchesDepartureStation(row.stop_point, departure)) {
        return true;
      }

      return departure.callOrder ? index === departure.callOrder - 1 : false;
    });
  const candidates = currentRows.length > 0
    ? currentRows
    : rows.map((row, index) => ({ row, index }));
  const journeyKey = getDepartureJourneyKey(departure);

  if (journeyKey) {
    const journeyMatch = findJourneyKeyMatch(candidates, journeyKey);

    if (journeyMatch) {
      return journeyMatch;
    }
  }

  let bestMatch:
    | {
      dateTimeIndex: number;
      journeyId?: string;
      rowIndex: number;
      delta: number;
    }
    | undefined;

  for (const { row, index } of candidates) {
    asArray(row.date_times).forEach((dateTime, dateTimeIndex) => {
      const parsedTime = dateTime.date_time
        ? parseNavitiaDateTime(dateTime.date_time)
        : undefined;

      if (!parsedTime) {
        return;
      }

      const delta = Math.abs(new Date(parsedTime).getTime() - targetTimestamp);

      if (!bestMatch || delta < bestMatch.delta) {
        bestMatch = {
          dateTimeIndex,
          journeyId: getDateTimeVehicleJourneyId(dateTime),
          rowIndex: index,
          delta,
        };
      }
    });
  }

  if (!bestMatch || bestMatch.delta > 25 * 60_000) {
    if (currentRows.length > 0) {
      return {
        dateTimeIndex: 0,
        rowIndex: currentRows[0].index,
      };
    }

    return null;
  }

  return {
    dateTimeIndex: bestMatch.dateTimeIndex,
    journeyId: bestMatch.journeyId,
    rowIndex: bestMatch.rowIndex,
  };
}

function findMatchingRowDateTime(
  row: NavitiaRouteScheduleRow,
  match: {
    dateTimeIndex: number;
    journeyId?: string;
  },
): NavitiaDateTime | undefined {
  const dateTimes = asArray(row.date_times);

  if (match.journeyId) {
    const linkedDateTime = dateTimes.find(
      (dateTime) =>
        dateTime.date_time &&
        getDateTimeVehicleJourneyId(dateTime) === match.journeyId,
    );

    if (linkedDateTime) {
      return linkedDateTime;
    }

    return undefined;
  }

  return dateTimes[match.dateTimeIndex];
}

function findJourneyKeyMatch(
  candidates: Array<{ row: NavitiaRouteScheduleRow; index: number }>,
  journeyKey: string,
): {
  dateTimeIndex: number;
  journeyId?: string;
  rowIndex: number;
} | null {
  for (const { row, index } of candidates) {
    const dateTimes = asArray(row.date_times);
    const dateTimeIndex = dateTimes.findIndex((dateTime) =>
      dateTimeMatchesJourneyKey(dateTime, journeyKey),
    );

    if (dateTimeIndex >= 0) {
      return {
        dateTimeIndex,
        journeyId: getDateTimeVehicleJourneyId(dateTimes[dateTimeIndex]),
        rowIndex: index,
      };
    }
  }

  return null;
}

function dateTimeMatchesJourneyKey(
  dateTime: NavitiaDateTime,
  journeyKey: string,
): boolean {
  const vehicleJourneyId = getDateTimeVehicleJourneyId(dateTime);

  return Boolean(vehicleJourneyId && vehicleJourneyId.includes(journeyKey));
}

function getDepartureJourneyKey(departure: Departure): string | undefined {
  return departure.journeyRef?.match(
    /VehicleJourney::([^:]+):/u,
  )?.[1];
}

function getDateTimeVehicleJourneyId(dateTime: NavitiaDateTime): string | undefined {
  return dateTime.links?.find((link) =>
    normalizeText(`${link.type ?? ""} ${link.rel ?? ""} ${link.id ?? ""}`).includes(
      "vehicle_journey",
    ),
  )?.id;
}

function findDestinationRowIndex(
  rows: NavitiaRouteScheduleRow[],
  departure: Departure,
  currentRowIndex: number,
): number | undefined {
  const destinationKey = getDestinationBranchKey(departure.destination);
  const candidates = rows
    .map((row, index) => {
      const label = getStopPointDisplayLabel(row.stop_point);
      const stopKey = getDestinationBranchKey(label);
      let score = 0;

      if (destinationKey && stopKey === destinationKey) {
        score += 80;
      }

      if (directionMatchesRule(label, departure.destination)) {
        score += 60;
      }

      return {
        index,
        score,
        distance: Math.abs(index - currentRowIndex),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || right.distance - left.distance,
    );

  return candidates[0]?.index;
}

function rowMatchesDeparturePath(
  row: NavitiaRouteScheduleRow,
  rowIndex: number,
  currentRowIndex: number,
  terminalRowIndex: number | undefined,
  departure: Departure,
): boolean {
  const destinationKey = getDestinationBranchKey(departure.destination);
  const stopKey = getDestinationBranchKey(getStopPointDisplayLabel(row.stop_point));

  if (terminalRowIndex !== undefined) {
    const minIndex = Math.min(currentRowIndex, terminalRowIndex);
    const maxIndex = Math.max(currentRowIndex, terminalRowIndex);

    if (rowIndex < minIndex || rowIndex > maxIndex) {
      return false;
    }
  }

  return !(
    destinationKey &&
    stopKey &&
    !branchKeysAreCompatible(destinationKey, stopKey) &&
    rowIndex !== currentRowIndex &&
    rowIndex !== terminalRowIndex
  );
}

function branchKeysAreCompatible(destinationKey: string, stopKey: string): boolean {
  return (
    destinationKey === stopKey ||
    (destinationKey === "saint-remy" && stopKey === "massy-palaiseau")
  );
}

function getStopPointDisplayLabel(stopPoint?: NavitiaStopPoint): string {
  return cleanStationLabel(stopPoint?.label ?? stopPoint?.name ?? stopPoint?.id ?? "");
}

function mapStopPointToDepartureCall(
  stopPoint: NavitiaStopPoint,
  current: boolean,
  time?: string,
  served = true,
): DepartureCall {
  const label = getStopPointDisplayLabel(stopPoint);

  return {
    id: stopPoint.id,
    label,
    city: getStopPointCity(stopPoint, label),
    time,
    current,
    served,
    stopAreaRef: stopPoint.stop_area?.id ?? (stopPoint.id.startsWith("stop_area:") ? stopPoint.id : undefined),
  };
}

function mapFallbackRouteStopsToCalls(
  stops: NavitiaStopPoint[],
  departure: Departure,
): DepartureCall[] {
  const rows = stops.map((stop) => ({ stop_point: stop }));
  const currentRowIndex = Math.max(
    0,
    stops.findIndex((stop) => stopMatchesDepartureStation(stop, departure)),
  );
  const foundCurrent = stops.some((stop) =>
    stopMatchesDepartureStation(stop, departure),
  );
  const terminalRowIndex = findDestinationRowIndex(
    rows,
    departure,
    currentRowIndex,
  );

  return stops.map((stop, index) =>
    mapStopPointToDepartureCall(
      stop,
      foundCurrent && index === currentRowIndex,
      undefined,
      foundCurrent || terminalRowIndex !== undefined
        ? rowMatchesDeparturePath(
          rows[index],
          index,
          currentRowIndex,
          terminalRowIndex,
          departure,
        )
        : true,
    ),
  );
}

function getServiceType(
  servedStopsCount: number,
  routeStopsCount: number,
): DepartureCallingPattern["serviceType"] {
  if (servedStopsCount <= 2 && routeStopsCount > 2) {
    return "direct";
  }

  if (servedStopsCount < Math.max(2, routeStopsCount - 1)) {
    return "semi-direct";
  }

  return "omnibus";
}

async function fetchRouteStopPoints(
  route: NavitiaRoute,
): Promise<NavitiaStopPoint[]> {
  const searchParams = new URLSearchParams({
    count: "100",
    disable_disruption: "true",
    disable_geojson: "true",
  });

  return fetchPaginatedCollection<NavitiaStopPointsResponse, NavitiaStopPoint>(
    `${NAVITIA_API_BASE}/routes/${encodeURIComponent(route.id)}/stop_points`,
    searchParams,
    "stop_points",
    MAX_ROUTE_STOPS,
  );
}

async function fetchPaginatedCollection<TPayload, TItem>(
  endpoint: string,
  baseSearchParams: URLSearchParams,
  collectionKey: keyof TPayload,
  maxResults: number,
  options: NavitiaRequestOptions = {},
): Promise<TItem[]> {
  const items: TItem[] = [];
  let page = 0;
  let totalResult: number | undefined;

  while (items.length < maxResults) {
    const searchParams = new URLSearchParams(baseSearchParams);
    searchParams.set("start_page", String(page));

    const response = await navitiaFetchWithRetry(`${endpoint}?${searchParams}`, options);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = (await response.json()) as TPayload & {
      pagination?: NavitiaPagination;
    };
    const pageItems = ((payload[collectionKey] as TItem[] | undefined) ?? []);
    const pagination = payload.pagination;

    items.push(...pageItems);
    totalResult = pagination?.total_result ?? totalResult;

    const loadedCount =
      (pagination?.start_page ?? page) * (pagination?.items_per_page ?? pageItems.length) +
      (pagination?.items_on_page ?? pageItems.length);

    if (
      pageItems.length === 0 ||
      (typeof totalResult === "number" && loadedCount >= totalResult)
    ) {
      break;
    }

    page += 1;
  }

  return items.slice(0, maxResults);
}

export async function fetchDirectionGroupsForStation(
  line: LineSearchOption,
  station: StationSearchOption,
): Promise<DirectionGroupConfig[]> {
  if (!station.scheduleStopAreaRef) {
    return [createFallbackDirectionGroup(station.label)];
  }

  const serviceDay = getParisServiceDayWindow();
  const searchParams = new URLSearchParams({
    data_freshness: "base_schedule",
    from_datetime: serviceDay.fromParam,
    duration: "108000",
    items_per_schedule: "8",
  });
  const response = await fetch(
    `${NAVITIA_API_BASE}/lines/${encodeURIComponent(line.navitiaId)}/stop_areas/${encodeURIComponent(station.scheduleStopAreaRef)}/stop_schedules?${searchParams}`,
  );

  if (!response.ok) {
    return [createFallbackDirectionGroup(station.label)];
  }

  const payload = (await response.json()) as NavitiaStopScheduleResponse;
  const groups = new Map<string, DirectionGroupConfig>();

  for (const schedule of payload.stop_schedules ?? []) {
    const destination = cleanNavitiaDirection(
      schedule.display_informations?.direction ??
      schedule.display_informations?.headsign ??
      "",
    );
    if (!destination) {
      continue;
    }

    const id = createStableId(destination);

    groups.set(id, {
      id,
      label: `${destination}`,
      match: {
        destinationIncludes: [destination],
        navitiaStopPointRefs: schedule.stop_point?.id
          ? [schedule.stop_point.id]
          : undefined,
      },
    });
  }

  return groups.size > 0 ? Array.from(groups.values()) : [createFallbackDirectionGroup(station.label)];
}

export async function fetchBoardDepartures(
  board: TransitBoardConfig,
): Promise<BoardDeparturesResult> {
  const [batches, scheduleInfo] = await Promise.all([
    Promise.all(
      getEffectiveMonitoringPoints(board).map((point) =>
        fetchMonitoringPoint(board, point).catch(() => []),
      ),
    ),
    fetchBoardScheduleInfo(board).catch(() => ({
      lastDepartures: [],
      scheduledDepartures: [],
    })),
  ]);

  const uniqueDepartures = new Map<string, Departure>();

  batches
    .flat()
    .filter(isUpcomingDeparture)
    .sort(compareDepartures)
    .forEach((departure) => {
      uniqueDepartures.set(departure.id, departure);
    });

  const departures = Array.from(uniqueDepartures.values()).sort(compareDepartures);

  return buildBoardDeparturesResult(
    board,
    departures,
    scheduleInfo.lastDepartures,
    scheduleInfo.scheduledDepartures,
  );
}

function getEffectiveMonitoringPoints(
  board: TransitBoardConfig,
): MonitoringPointConfig[] {
  const monitoringPoints = new Map<string, MonitoringPointConfig>();

  board.directionGroups.forEach((group) => {
    group.match.navitiaStopPointRefs?.forEach((stopPointRef) => {
      const monitoringRef = navitiaStopPointToMonitoringRef(stopPointRef);

      if (monitoringRef && !monitoringPoints.has(monitoringRef)) {
        monitoringPoints.set(monitoringRef, {
          ref: monitoringRef,
          label: group.label,
        });
      }
    });
  });

  return monitoringPoints.size > 0
    ? Array.from(monitoringPoints.values())
    : board.monitoringPoints;
}

function navitiaStopPointToMonitoringRef(
  stopPointRef: string,
): string | undefined {
  if (stopPointRef.includes("monomodalStopPlace")) {
    return undefined;
  }

  const stopPointId = stopPointRef.match(/(\d+)$/u)?.[1];

  return stopPointId ? `STIF:StopPoint:Q:${stopPointId}:` : undefined;
}

async function fetchMonitoringPoint(
  board: TransitBoardConfig,
  point: MonitoringPointConfig,
): Promise<Departure[]> {
  const searchParams = new URLSearchParams({
    MonitoringRef: point.ref,
    LineRef: board.line.ref,
  });

  const response = await fetch(`${API_BASE}/stop-monitoring?${searchParams}`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as SiriStopMonitoringResponse;
  const deliveries = asArray(
    payload.Siri?.ServiceDelivery?.StopMonitoringDelivery,
  );
  const visits = deliveries.flatMap((delivery) =>
    asArray(delivery.MonitoredStopVisit),
  );

  return visits
    .map((visit) => mapVisitToDeparture(visit, point))
    .filter((departure): departure is Departure => departure !== null);
}

function mapVisitToDeparture(
  visit: SiriVisit,
  point: MonitoringPointConfig,
): Departure | null {
  const journey = visit.MonitoredVehicleJourney;
  const call = journey?.MonitoredCall;

  if (!journey || !call) {
    return null;
  }

  const expectedDepartureTime =
    call.ExpectedDepartureTime ?? call.ExpectedArrivalTime ?? call.AimedDepartureTime;
  const destination =
    firstValue(call.DestinationDisplay) ??
    firstValue(journey.DestinationName) ??
    "Destination inconnue";
  const stopName = firstValue(call.StopPointName) ?? "";
  const journeyName =
    firstValue(journey.VehicleJourneyName) ??
    firstValue(asArray(journey.TrainNumbers?.TrainNumberRef)) ??
    firstValue(journey.JourneyNote);
  const platform = cleanPlatformName(
    siriValue(call.DeparturePlatformName) ??
      siriValue(call.ArrivalPlatformName),
  );
  const lineRef = siriValue(journey.LineRef) ?? "";
  const monitoringRef = siriValue(visit.MonitoringRef) ?? point.ref;
  const id = [
    visit.ItemIdentifier,
    lineRef,
    destination,
    expectedDepartureTime,
    platform,
  ]
    .filter(Boolean)
    .join("|");

  return {
    id,
    lineRef,
    monitoringRef,
    stopName,
    destination,
    direction: firstValue(journey.DirectionName),
    platform,
    monitoringLabel: point.label,
    expectedDepartureTime,
    expectedArrivalTime: call.ExpectedArrivalTime,
    aimedDepartureTime: call.AimedDepartureTime,
    status: call.DepartureStatus,
    vehicleAtStop: Boolean(call.VehicleAtStop),
    journeyName,
    journeyRef: journey.FramedVehicleJourneyRef?.DatedVehicleJourneyRef,
    callOrder: call.Order,
    navitiaStopPointRef: monitoringRefToNavitiaStopPointRef(monitoringRef),
  };
}

function monitoringRefToNavitiaStopPointRef(value?: string): string | undefined {
  const stopPointId = value?.match(/StopPoint:Q:(\d+):/u)?.[1];

  return stopPointId ? `stop_point:IDFM:${stopPointId}` : undefined;
}

function cleanPlatformName(value?: string): string | undefined {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return undefined;
  }

  const normalizedValue = normalizeText(trimmedValue);

  if (
    normalizedValue === "unknown" ||
    normalizedValue === "inconnu" ||
    normalizedValue === "unknown platform"
  ) {
    return undefined;
  }

  return trimmedValue.replace(/^quai\s+/iu, "");
}

async function fetchBoardScheduleInfo(
  board: TransitBoardConfig,
): Promise<BoardScheduleInfo> {
  if (!board.schedule) {
    return {
      lastDepartures: [],
      scheduledDepartures: [],
    };
  }

  const serviceDay = getParisServiceDayWindow();
  const lineRef = encodeURIComponent(board.schedule.lineRef);
  const stopAreaRef = encodeURIComponent(board.schedule.stopAreaRef);
  const searchParams = new URLSearchParams({
    data_freshness: "base_schedule",
    from_datetime: formatParisNavitiaDateTime(new Date()),
    duration: "108000",
    items_per_schedule: "12",
  });

  const response = await fetch(
    `${NAVITIA_API_BASE}/lines/${lineRef}/stop_areas/${stopAreaRef}/stop_schedules?${searchParams}`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as NavitiaStopScheduleResponse;
  const latestByGroup = new Map<string, LastDeparture>();
  const scheduledDepartures: Departure[] = [];

  for (const schedule of payload.stop_schedules ?? []) {
    const destination =
      schedule.display_informations?.direction ??
      schedule.display_informations?.headsign ??
      "";
    const group = findDirectionGroup(board, {
      destination,
      navitiaStopPointRef: schedule.stop_point?.id,
    });
    const lastTime = findLatestNavitiaTime(schedule, serviceDay);

    if (!group) {
      continue;
    }

    if (lastTime) {
      const currentLast = latestByGroup.get(group.id);

      if (
        !currentLast ||
        new Date(lastTime).getTime() > new Date(currentLast.time).getTime()
      ) {
        latestByGroup.set(group.id, {
          groupId: group.id,
          time: lastTime,
          destination: cleanNavitiaDirection(destination),
        });
      }
    }

    scheduledDepartures.push(
      ...(await mapScheduleToDepartures(board, schedule, group, serviceDay)),
    );
  }

  return {
    lastDepartures: Array.from(latestByGroup.values()),
    scheduledDepartures: scheduledDepartures.sort(compareDepartures),
  };
}

function mapScheduleToDepartures(
  board: TransitBoardConfig,
  schedule: NavitiaStopSchedule,
  group: DirectionGroupConfig,
  serviceDay: NavitiaServiceDayWindow,
): Promise<Departure[]> {
  const destination = cleanNavitiaDirection(
    schedule.display_informations?.direction ??
    schedule.display_informations?.headsign ??
    group.label,
  );

  return Promise.all(
    findUpcomingNavitiaTimeEntries(schedule, serviceDay)
    .slice(0, board.maxDeparturesPerDirection ?? 4)
    .map(async (entry) => ({
      id: `schedule|${board.id}|${group.id}|${entry.time}`,
      lineRef: board.line.ref,
      monitoringRef: schedule.stop_point?.id ?? board.schedule?.stopAreaRef ?? "",
      stopName: board.title,
      destination,
      monitoringLabel: "Horaire IDFM",
      expectedDepartureTime: entry.time,
      aimedDepartureTime: entry.time,
      vehicleAtStop: false,
      remainingStopCount: entry.vehicleJourneyId
        ? await fetchRemainingStopCount(
            entry.vehicleJourneyId,
            schedule.stop_point?.id,
          ).catch(() => undefined)
        : undefined,
      navitiaStopPointRef: schedule.stop_point?.id,
    })),
  );
}

function buildBoardDeparturesResult(
  board: TransitBoardConfig,
  departures: Departure[],
  lastDepartures: LastDeparture[],
  scheduledDepartures: Departure[],
): BoardDeparturesResult {
  const perDirectionLimit =
    board.maxDeparturesPerDirection ??
    Math.max(3, Math.ceil(board.maxDepartures / board.directionGroups.length));
  const lastDeparturesByGroup = new Map(
    lastDepartures.map((departure) => [departure.groupId, departure]),
  );
  const visibleDepartures = new Set<string>();
  const realtimeDeparturesByGroup = new Map<string, Departure[]>();

  board.directionGroups.forEach((group) => {
    realtimeDeparturesByGroup.set(
      group.id,
      departures
        .filter((departure) => findDirectionGroup(board, departure)?.id === group.id)
        .slice(0, perDirectionLimit),
    );
  });

  const directionGroups: DirectionDepartureGroup[] = board.directionGroups.map(
    (group) => {
      const realtimeDepartures = realtimeDeparturesByGroup.get(group.id) ?? [];
      const scheduledGroupDepartures = scheduledDepartures.filter(
        (departure) => findDirectionGroup(board, departure)?.id === group.id,
      );
      const groupDepartures =
        realtimeDepartures.length > 0
          ? enrichDeparturesWithScheduledStopCounts(
              realtimeDepartures,
              scheduledGroupDepartures,
            )
          : scheduledGroupDepartures.slice(0, perDirectionLimit);

      groupDepartures.forEach((departure) => visibleDepartures.add(departure.id));

      return {
        id: group.id,
        label: group.label,
        subtitle: group.subtitle,
        departures: groupDepartures,
        lastDeparture: lastDeparturesByGroup.get(group.id),
        serviceEnded: hasServiceEnded(lastDeparturesByGroup.get(group.id)),
      };
    },
  );

  const visibleFlatDepartures = [...departures, ...scheduledDepartures].filter(
    (departure) => visibleDepartures.has(departure.id),
  );

  return {
    departures: visibleFlatDepartures,
    directionGroups,
  };
}

function enrichDeparturesWithScheduledStopCounts(
  realtimeDepartures: Departure[],
  scheduledDepartures: Departure[],
): Departure[] {
  return realtimeDepartures.map((departure) => {
    if (typeof departure.remainingStopCount === "number") {
      return departure;
    }

    const scheduledMatch = findScheduledStopCountMatch(
      departure,
      scheduledDepartures,
    );

    return typeof scheduledMatch?.remainingStopCount === "number"
      ? {
          ...departure,
          remainingStopCount: scheduledMatch.remainingStopCount,
        }
      : departure;
  });
}

function findScheduledStopCountMatch(
  departure: Departure,
  scheduledDepartures: Departure[],
): Departure | undefined {
  const departureTime = getDepartureTimestamp(departure);

  return scheduledDepartures
    .filter(
      (candidate) =>
        typeof candidate.remainingStopCount === "number" &&
        directionsAreComparable(candidate.destination, departure.destination),
    )
    .map((candidate) => ({
      departure: candidate,
      delta: Math.abs(getDepartureTimestamp(candidate) - departureTime),
    }))
    .filter(({ delta }) => delta <= 10 * 60 * 1000)
    .sort((left, right) => left.delta - right.delta)[0]?.departure;
}

function directionsAreComparable(
  left: string | undefined,
  right: string | undefined,
): boolean {
  if (!left || !right) {
    return true;
  }

  return directionMatchesRule(left, right) || directionMatchesRule(right, left);
}

function findDirectionGroup(
  board: TransitBoardConfig,
  candidate: Partial<Departure> & { navitiaStopPointRef?: string },
): DirectionGroupConfig | undefined {
  return board.directionGroups.find((group) =>
    matchesDirectionGroup(group, candidate),
  );
}

function matchesDirectionGroup(
  group: DirectionGroupConfig,
  candidate: Partial<Departure> & { navitiaStopPointRef?: string },
): boolean {
  const match = group.match;
  const label = normalizeText(candidate.monitoringLabel);
  const destinationRules = match.destinationIncludes ?? [];
  const comparableLocationChecks = [
    candidate.monitoringRef && match.monitoringRefs
      ? match.monitoringRefs.includes(candidate.monitoringRef)
      : undefined,
    candidate.monitoringLabel && match.monitoringLabels
      ? match.monitoringLabels.some((value) => normalizeText(value) === label)
      : undefined,
    candidate.platform && match.platforms
      ? match.platforms.includes(candidate.platform)
      : undefined,
    candidate.navitiaStopPointRef && match.navitiaStopPointRefs
      ? match.navitiaStopPointRefs.includes(candidate.navitiaStopPointRef)
      : undefined,
  ].filter((value): value is boolean => typeof value === "boolean");
  const matchesDestination =
    destinationRules.length === 0 ||
    destinationRules.some((value) => directionMatchesRule(candidate.destination, value));
  const matchesLocation =
    comparableLocationChecks.length === 0 ||
    comparableLocationChecks.some(Boolean);

  return matchesDestination && matchesLocation;
}

function directionMatchesRule(
  destination: string | undefined,
  rule: string,
): boolean {
  const normalizedDestination = normalizeText(destination);
  const normalizedRule = normalizeText(rule);

  if (normalizedDestination.includes(normalizedRule)) {
    return true;
  }

  const comparableDestination = normalizeDirectionName(destination);
  const comparableRule = normalizeDirectionName(rule);

  return (
    Boolean(comparableDestination) &&
    Boolean(comparableRule) &&
    (comparableDestination.includes(comparableRule) ||
      comparableRule.includes(comparableDestination))
  );
}

function findLatestNavitiaTime(
  schedule: NavitiaStopSchedule,
  serviceDay: NavitiaServiceDayWindow,
): string | undefined {
  const candidates = [
    ...asArray(schedule.date_times),
    schedule.last_datetime,
  ].flatMap((value) => [value?.date_time, value?.base_date_time]);
  const latestRawTime = candidates
    .filter(
      (value): value is string =>
        typeof value === "string" &&
        value >= serviceDay.fromParam &&
        value < serviceDay.cutoffParam,
    )
    .sort((left, right) => right.localeCompare(left))[0];

  return latestRawTime ? parseNavitiaDateTime(latestRawTime) : undefined;
}

function findUpcomingNavitiaTimes(
  schedule: NavitiaStopSchedule,
  serviceDay: NavitiaServiceDayWindow,
): string[] {
  return findUpcomingNavitiaTimeEntries(schedule, serviceDay).map(
    (entry) => entry.time,
  );
}

function findUpcomingNavitiaTimeEntries(
  schedule: NavitiaStopSchedule,
  serviceDay: NavitiaServiceDayWindow,
): UpcomingNavitiaTime[] {
  const nowRaw = formatParisNavitiaDateTime(new Date());
  const seen = new Set<string>();
  const entries: UpcomingNavitiaTime[] = [];

  asArray(schedule.date_times).forEach((value) => {
    const vehicleJourneyId = getVehicleJourneyId(value);

    [value.date_time, value.base_date_time].forEach((rawTime) => {
      if (
        typeof rawTime !== "string" ||
        rawTime < nowRaw ||
        rawTime < serviceDay.fromParam ||
        rawTime >= serviceDay.cutoffParam ||
        seen.has(rawTime)
      ) {
        return;
      }

      const time = parseNavitiaDateTime(rawTime);

      if (!time) {
        return;
      }

      seen.add(rawTime);
      entries.push({
        rawTime,
        time,
        vehicleJourneyId,
      });
    });
  });

  return entries.sort((left, right) => left.rawTime.localeCompare(right.rawTime));
}

function getVehicleJourneyId(value: NavitiaDateTime): string | undefined {
  return asArray(value.links).find((link) => {
    const comparable = normalizeText(`${link.rel ?? ""} ${link.type ?? ""}`);

    return (
      comparable.includes("vehicle") &&
      typeof link.id === "string" &&
      link.id.startsWith("vehicle_journey:")
    );
  })?.id;
}

function fetchRemainingStopCount(
  vehicleJourneyId: string,
  currentStopPointId?: string,
): Promise<number | undefined> {
  if (!currentStopPointId) {
    return Promise.resolve(undefined);
  }

  const cacheKey = `${vehicleJourneyId}::${currentStopPointId}`;
  const cached = vehicleJourneyStopCountCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const request = fetchVehicleJourneyRemainingStopCount(
    vehicleJourneyId,
    currentStopPointId,
  ).catch((error) => {
    vehicleJourneyStopCountCache.delete(cacheKey);
    throw error;
  });

  vehicleJourneyStopCountCache.set(cacheKey, request);

  return request;
}

async function fetchVehicleJourneyRemainingStopCount(
  vehicleJourneyId: string,
  currentStopPointId: string,
): Promise<number | undefined> {
  const searchParams = new URLSearchParams({
    disable_disruption: "true",
    disable_geojson: "true",
  });
  const response = await fetch(
    `${NAVITIA_API_BASE}/vehicle_journeys/${encodeURIComponent(vehicleJourneyId)}?${searchParams}`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as NavitiaVehicleJourneyResponse;
  const stopTimes = payload.vehicle_journeys?.[0]?.stop_times ?? [];
  const currentIndex = stopTimes.findIndex(
    (stopTime) => stopTime.stop_point?.id === currentStopPointId,
  );

  if (currentIndex < 0) {
    return undefined;
  }

  return stopTimes
    .slice(currentIndex + 1)
    .filter((stopTime) => !stopTime.skipped_stop).length;
}

function parseNavitiaDateTime(value: string): string | undefined {
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/,
  );

  if (!match) {
    return undefined;
  }

  const [, year, month, day, hour, minute, second] = match;

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ).toISOString();
}

function getParisServiceDayWindow(): NavitiaServiceDayWindow {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    month: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric",
  }).formatToParts(new Date());
  const partMap = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const year = Number(partMap.year);
  const month = Number(partMap.month);
  const day = Number(partMap.day);
  const hour = Number(partMap.hour);
  const serviceStart = new Date(
    Date.UTC(year, month - 1, day + (hour < 3 ? -1 : 0)),
  );
  const cutoff = new Date(
    Date.UTC(
      serviceStart.getUTCFullYear(),
      serviceStart.getUTCMonth(),
      serviceStart.getUTCDate() + 1,
    ),
  );
  const pad = (value: number) => value.toString().padStart(2, "0");
  const formatDate = (date: Date) =>
    [
      date.getUTCFullYear(),
      pad(date.getUTCMonth() + 1),
      pad(date.getUTCDate()),
    ].join("");

  return {
    fromParam: `${formatDate(serviceStart)}T000000`,
    cutoffParam: `${formatDate(cutoff)}T030000`,
  };
}

function formatParisNavitiaDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric",
  }).formatToParts(date);
  const partMap = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${partMap.year}${partMap.month}${partMap.day}T${partMap.hour}${partMap.minute}${partMap.second}`;
}

function normalizeText(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function normalizeDirectionName(value?: string): string {
  return normalizeText(cleanNavitiaDirection(value ?? ""))
    .replace(/\b(gare|paris|terminus)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanNavitiaDirection(value: string): string {
  return value.replace(/\s+\([^)]*\)$/u, "");
}

function hasServiceEnded(lastDeparture?: LastDeparture): boolean {
  if (!lastDeparture) {
    return false;
  }

  return new Date(lastDeparture.time).getTime() < Date.now() - 60_000;
}

function mapCommercialModeToFamily(
  mode: NavitiaCommercialMode,
): TransitFamilyOption | null {
  const family = familyOrder.find((item) =>
    commercialModeMatchesFamily(mode.name, item),
  );

  if (!family) {
    return null;
  }

  return {
    id: mode.id,
    label: formatFamilyLabel(family),
    family,
  };
}

function formatFamilyLabel(family: TransitFamily): string {
  if (family === "METRO") {
    return "Métro";
  }

  if (family === "TRAM") {
    return "Tramway";
  }

  if (family === "CABLE") {
    return "Câble";
  }

  return family.charAt(0) + family.slice(1).toLowerCase();
}

function commercialModeMatchesFamily(
  commercialModeName: string | undefined,
  family: TransitFamily,
): boolean {
  const normalizedName = normalizeText(commercialModeName);

  return familyMatchers[family].some((matcher) =>
    normalizedName.includes(normalizeText(matcher)),
  );
}

function lineMatchesTransitFamily(
  line: NavitiaLine,
  family: TransitFamily,
): boolean {
  const modeName = line.commercial_mode?.name;
  const modeId = line.commercial_mode?.id;

  if (!modeName && !modeId) {
    return true;
  }

  return (
    commercialModeMatchesFamily(modeName, family) ||
    commercialModeMatchesFamily(modeId, family)
  );
}

function mapLineToSearchOption(
  line: NavitiaLine,
  network: TransitFamilyOption,
): LineSearchOption {
  const label = line.code ?? line.name ?? line.id;
  const presentation = createLinePresentation({
    code: line.code ?? line.name,
    color: line.color,
    family: network.family,
    id: line.id,
    shortName: label,
    textColor: line.text_color,
  });

  return {
    family: network.family,
    id: line.id,
    navitiaId: line.id,
    label,
    ref: navitiaLineIdToSiriRef(line.id),
    commercialModeId: network.id,
    color: presentation.color,
    textColor: presentation.textColor,
    iconUrl: presentation.iconUrl,
    iconUrls: presentation.iconUrls,
    displayName:
      line.name && line.code && line.name !== line.code
        ? `${line.code} · ${line.name}`
        : label,
  };
}

function mapLineToTransferOption(line: NavitiaLine): TransferLineOption {
  const family = familyOrder.find((item) =>
    commercialModeMatchesFamily(line.commercial_mode?.name ?? line.commercial_mode?.id, item),
  );
  const presentation = createLinePresentation({
    code: line.code ?? line.name,
    color: line.color,
    family,
    id: line.id,
    mode: line.commercial_mode?.name ?? line.physical_modes?.[0]?.name,
    shortName: line.code ?? line.name ?? line.id,
    textColor: line.text_color,
  });

  return {
    id: line.id,
    label: line.code ?? line.name ?? line.id,
    family,
    mode: line.commercial_mode?.name ?? line.physical_modes?.[0]?.name,
    color: presentation.color,
    textColor: presentation.textColor,
    iconUrl: presentation.iconUrl,
    iconUrls: presentation.iconUrls,
    ref: navitiaLineIdToSiriRef(line.id),
  };
}

function mapStopPointToLineRouteStop(
  stopPoint: NavitiaStopPoint,
): LineRouteStop | null {
  const rawLabel =
    stopPoint.stop_area?.label ??
    stopPoint.stop_area?.name ??
    stopPoint.label ??
    stopPoint.name ??
    stopPoint.id;

  if (!rawLabel) {
    return null;
  }

  const label = cleanTopologyStationLabel(rawLabel);
  const city = getStopPointCity(stopPoint, label);
  const topologyId = createTopologyStationId(label);
  const coord = stopPoint.stop_area?.coord ?? stopPoint.coord;
  const lon = parseCoordinate(coord?.lon);
  const lat = parseCoordinate(coord?.lat);
  const stationFromStopArea = stopPoint.stop_area
    ? mapStopAreaToStation(stopPoint.stop_area)
    : undefined;

  return {
    id: topologyId,
    label,
    city,
    lon,
    lat,
    station: {
      id: topologyId,
      label,
      city,
      monitoringRef:
        stationFromStopArea?.monitoringRef ??
        createFallbackMonitoringRefFromStopPoint(stopPoint) ??
        "",
      scheduleStopAreaRef:
        stationFromStopArea?.scheduleStopAreaRef ?? stopPoint.stop_area?.id,
    },
  };
}

function createTopologyStationId(label: string): string {
  return `station:${createStableId(cleanTopologyStationLabel(label))}`;
}

function cleanTopologyStationLabel(value: string): string {
  return cleanStationLabel(value)
    .replace(/\s+/g, " ")
    .replace(/\s+-\s+/g, " - ")
    .replace(/[’]/gu, "'")
    .trim();
}

function createFallbackMonitoringRefFromStopPoint(
  stopPoint: NavitiaStopPoint,
): string | undefined {
  const rawId = stopPoint.stop_area?.id ?? stopPoint.id;
  const numericId = rawId.match(/(\d+)$/u)?.[1];

  return numericId ? `STIF:StopArea:SP:${numericId}:` : undefined;
}

function mapStopPointToStopArea(
  stopPoint: NavitiaStopPoint,
): NavitiaStopArea | undefined {
  if (!stopPoint.id) {
    return undefined;
  }

  return {
    id: stopPoint.id.startsWith("stop_area:")
      ? stopPoint.id
      : `stop_area:${stopPoint.id}`,
    name: stopPoint.name,
    label: stopPoint.label,
    codes: stopPoint.codes,
    coord: stopPoint.coord,
    administrative_regions: stopPoint.administrative_regions,
  };
}

function mapStopAreaToStation(stopArea: NavitiaStopArea): StationSearchOption {
  const navitiaId = stopArea.id.startsWith("stop_area:")
    ? stopArea.id
    : `stop_area:IDFM:${stopArea.id}`;
  const rawLabel = stopArea.label ?? stopArea.name ?? navitiaId;
  const stopAreaId = getStopAreaReferentialId(stopArea) ?? navitiaId.split(":").pop();
  const city = getStopAreaCity(stopArea, rawLabel);

  return {
    id: navitiaId,
    label: rawLabel.replace(/\s+\([^)]*\)$/u, ""),
    city,
    monitoringRef: `STIF:StopArea:SP:${stopAreaId ?? navitiaId}:`,
    scheduleStopAreaRef: navitiaId,
  };
}

function getStopAreaCity(
  stopArea: NavitiaStopArea,
  label: string,
): string | undefined {
  const cityMatch = label.match(/\(([^)]+)\)$/u);

  return cityMatch?.[1] ?? stopArea.administrative_regions?.[0]?.name;
}

function getStopPointCity(
  stopPoint: NavitiaStopPoint,
  label: string,
): string | undefined {
  const cityMatch = label.match(/\(([^)]+)\)$/u);

  return (
    cityMatch?.[1] ??
    stopPoint.stop_area?.administrative_regions?.[0]?.name ??
    stopPoint.administrative_regions?.[0]?.name
  );
}

function sortRoutesForDeparture(
  routes: NavitiaRoute[],
  departure: Departure,
): NavitiaRoute[] {
  return [...routes].sort(
    (left, right) =>
      getRouteDepartureScore(right, departure) -
      getRouteDepartureScore(left, departure),
  );
}

function getRouteDepartureScore(
  route: NavitiaRoute,
  departure: Departure,
): number {
  const routeValues = getRouteComparableValues(route);
  const destinationKey = getDestinationBranchKey(departure.destination);
  let score = routeMatchesDeparture(route, departure) ? 20 : 0;

  if (
    destinationKey &&
    routeValues.some((value) => getDestinationBranchKey(value) === destinationKey)
  ) {
    score += 40;
  }

  return score;
}

function routeMatchesDeparture(
  route: NavitiaRoute,
  departure: Departure,
): boolean {
  const destination = normalizeDirectionName(departure.destination);
  const routeValues = getRouteComparableValues(route).map(normalizeDirectionName);

  return routeValues.some(
    (value) =>
      Boolean(value) &&
      Boolean(destination) &&
      (value.includes(destination) || destination.includes(value)),
  );
}

function getRouteComparableValues(route: NavitiaRoute): string[] {
  return [
    route.name,
    route.direction?.name,
    route.direction?.stop_area?.name,
    route.direction?.stop_area?.label,
  ].filter((value): value is string => Boolean(value));
}

function patternMatchesDepartureDestination(
  pattern: DepartureCallingPattern,
  departure: Departure,
): boolean {
  const terminal = [...pattern.calls].reverse().find((call) => call.served)?.label;

  if (!terminal) {
    return false;
  }

  if (directionMatchesRule(terminal, departure.destination)) {
    return true;
  }

  const departureKey = getDestinationBranchKey(departure.destination);
  const terminalKey = getDestinationBranchKey(terminal);

  if (departureKey && terminalKey) {
    return departureKey === terminalKey;
  }

  return !departureKey;
}

function getDestinationBranchKey(value?: string): string | undefined {
  const normalizedValue = normalizeDirectionName(value)
    .replace(/\baeroport\b/gu, "aeroport")
    .replace(/\bcdg\b/gu, "charles de gaulle")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/g, " ");

  if (!normalizedValue) {
    return undefined;
  }

  if (normalizedValue.includes("saint remy")) {
    return "saint-remy";
  }

  if (normalizedValue.includes("massy palaiseau")) {
    return "massy-palaiseau";
  }

  if (normalizedValue.includes("robinson")) {
    return "robinson";
  }

  if (normalizedValue.includes("mitry")) {
    return "mitry";
  }

  if (
    normalizedValue.includes("charles de gaulle") ||
    normalizedValue.includes("aeroport cdg")
  ) {
    return "charles-de-gaulle";
  }

  if (normalizedValue.includes("orly")) {
    return "orly";
  }

  if (normalizedValue.includes("saint denis pleyel")) {
    return "saint-denis-pleyel";
  }

  return undefined;
}

function stopMatchesDepartureStation(
  stopPoint: NavitiaStopPoint,
  departure: Departure,
): boolean {
  if (
    departure.navitiaStopPointRef &&
    stopPoint.id === departure.navitiaStopPointRef
  ) {
    return true;
  }

  const stopAreaId = stopPoint.stop_area?.id;

  if (
    departure.navitiaStopPointRef &&
    stopAreaId &&
    stopAreaId === departure.navitiaStopPointRef
  ) {
    return true;
  }

  const stationName = normalizeText(departure.stopName);
  const stopNames = [
    stopPoint.name,
    stopPoint.label,
    stopPoint.stop_area?.name,
    stopPoint.stop_area?.label,
  ].map(normalizeText);

  return stopNames.some(
    (name) =>
      Boolean(name) &&
      Boolean(stationName) &&
      (name.includes(stationName) || stationName.includes(name)),
  );
}

function cleanStationLabel(value: string): string {
  return value.replace(/\s+\([^)]*\)$/u, "");
}

function getStopAreaReferentialId(
  stopArea: NavitiaStopArea,
): string | undefined {
  const codeCandidate = stopArea.codes?.find((code) => {
    const normalizedType = normalizeText(code.type);

    return (
      Boolean(code.value) &&
      (normalizedType.includes("source") ||
        normalizedType.includes("stif") ||
        normalizedType.includes("idfm"))
    );
  })?.value;
  const rawId = codeCandidate ?? stopArea.id;
  const stopPlaceMatch = rawId.match(
    /(?:multi|mono)modalStopPlace:(\d+)/u,
  );

  if (stopPlaceMatch?.[1]) {
    return stopPlaceMatch[1];
  }

  const numericMatch = rawId.match(/(\d+)$/u);

  return numericMatch?.[1];
}

function dedupeStopSequence(stops: LineRouteStop[]): LineRouteStop[] {
  const sequence: LineRouteStop[] = [];

  stops.forEach((stop) => {
    if (sequence[sequence.length - 1]?.id !== stop.id) {
      sequence.push(stop);
    }
  });

  return sequence;
}

function createCanonicalSequenceKey(stopIds: string[]): string {
  const directKey = stopIds.join("|");
  const reverseKey = [...stopIds].reverse().join("|");

  return directKey < reverseKey ? directKey : reverseKey;
}

function parseCoordinate(value?: string): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function dedupeLines(lines: NavitiaLine[]): NavitiaLine[] {
  const deduped = new Map<string, NavitiaLine>();

  lines.forEach((line) => deduped.set(line.id, line));

  return Array.from(deduped.values());
}

function dedupeTransferOptions(
  transfers: TransferLineOption[],
): TransferLineOption[] {
  const deduped = new Map<string, TransferLineOption>();

  transfers.forEach((transfer) => {
    const key = [
      normalizeText(transfer.mode),
      normalizeText(transfer.label || transfer.id.split(":").pop()),
    ].join("|");

    if (!deduped.has(key)) {
      deduped.set(key, transfer);
    }
  });

  return Array.from(deduped.values());
}

function dedupeStations(
  stations: StationSearchOption[],
): StationSearchOption[] {
  const deduped = new Map<string, StationSearchOption>();

  stations.forEach((station) => deduped.set(station.id, station));

  return Array.from(deduped.values());
}

function compareLines(left: NavitiaLine, right: NavitiaLine): number {
  return compareLineLabels(left.code ?? left.name ?? left.id, right.code ?? right.name ?? right.id);
}

function compareTransferLines(
  left: TransferLineOption,
  right: TransferLineOption,
): number {
  const priorityDelta =
    getTransferModePriority(left.mode) - getTransferModePriority(right.mode);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return compareLineLabels(left.label, right.label);
}

function getTransferModePriority(mode?: string): number {
  const normalizedMode = normalizeText(mode);

  if (
    normalizedMode.includes("metro") ||
    normalizedMode.includes("rer") ||
    normalizedMode.includes("train") ||
    normalizedMode.includes("tram") ||
    normalizedMode.includes("cable") ||
    normalizedMode.includes("funiculaire") ||
    normalizedMode.includes("noctilien")
  ) {
    return 0;
  }

  if (normalizedMode.includes("bus")) {
    return 2;
  }

  return 1;
}

function compareLineLabels(left: string, right: string): number {
  return left.localeCompare(right, "fr", {
    numeric: true,
    sensitivity: "base",
  });
}

function navitiaLineIdToSiriRef(id: string): string {
  const lineId = id.split(":").pop() ?? id;

  return `STIF:Line::${lineId}:`;
}

function navitiaLineIdFromSiriRef(ref: string): string {
  const lineId = ref.match(/Line::([^:]+):/u)?.[1] ?? ref.split(":").pop() ?? ref;

  return lineId.startsWith("line:") ? lineId : `line:IDFM:${lineId}`;
}

function createFallbackDirectionGroup(label: string): DirectionGroupConfig {
  return {
    id: "all-directions",
    label: "Toutes directions",
    subtitle: label,
    match: {},
  };
}

function createStableId(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function asArray<T>(value: T[] | T | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function firstValue(values?: SiriTextValue[] | SiriTextValue): string | undefined {
  return asArray(values)
    .map(siriValue)
    .find((value): value is string => Boolean(value));
}

function siriValue(value?: SiriTextValue): string | undefined {
  if (typeof value === "string") {
    return value || undefined;
  }

  return value?.value || undefined;
}

function compareDepartures(left: Departure, right: Departure): number {
  return getDepartureTimestamp(left) - getDepartureTimestamp(right);
}

function isUpcomingDeparture(departure: Departure): boolean {
  const timestamp = getDepartureTimestamp(departure);

  if (timestamp === Number.MAX_SAFE_INTEGER) {
    return true;
  }

  return timestamp >= Date.now() - 60_000;
}

function getDepartureTimestamp(departure: Departure): number {
  const value =
    departure.expectedDepartureTime ??
    departure.expectedArrivalTime ??
    departure.aimedDepartureTime;

  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function getDepartureTimeValue(departure: Departure): string | undefined {
  return (
    departure.expectedDepartureTime ??
    departure.expectedArrivalTime ??
    departure.aimedDepartureTime
  );
}

