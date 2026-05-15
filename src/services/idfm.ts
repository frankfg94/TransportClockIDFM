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

interface SiriTextValue {
  value?: string;
}

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
const MAX_MAP_ROUTES = 24;
const MAX_ROUTE_STOPS = 260;

export async function fetchTransitFamilyOptions(): Promise<TransitFamilyOption[]> {
  const searchParams = new URLSearchParams({
    count: "100",
    disable_disruption: "true",
  });
  const response = await fetch(
    `${NAVITIA_API_BASE}/commercial_modes?${searchParams}`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as NavitiaCommercialModesResponse;
  const options = (payload.commercial_modes ?? [])
    .map((mode) => mapCommercialModeToFamily(mode))
    .filter((option): option is TransitFamilyOption => option !== null);
  const dedupedOptions = new Map<TransitFamily, TransitFamilyOption>();

  options.forEach((option) => dedupedOptions.set(option.family, option));

  return Array.from(dedupedOptions.values()).sort((left, right) =>
    familyOrder.indexOf(left.family) - familyOrder.indexOf(right.family),
  );
}

export async function searchTransitLines(
  network: TransitFamilyOption,
  query: string,
): Promise<LineSearchOption[]> {
  const trimmedQuery = query.trim();
  const normalizedQuery = normalizeText(trimmedQuery);
  const lines = trimmedQuery
    ? await searchLinesWithPtObjects(network, trimmedQuery)
    : await fetchLinesForCommercialMode(network);

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
    `${NAVITIA_API_BASE}/lines/${encodeURIComponent(line.navitiaId)}/stop_areas`,
    searchParams,
    "stop_areas",
    MAX_STATION_RESULTS,
  );

  const normalizedQuery = normalizeText(query.trim());
  const stations = stopAreas
    .map(mapStopAreaToStation)
    .filter((station) => {
      if (!normalizedQuery) {
        return true;
      }

      return normalizeText(`${station.label} ${station.city ?? ""}`).includes(
        normalizedQuery,
      );
    })
    .sort((left, right) => left.label.localeCompare(right.label, "fr"));

  return dedupeStations(stations);
}

export async function fetchLineRouteSequences(
  line: LineSearchOption,
): Promise<LineRouteSequence[]> {
  const routes = await fetchLineRoutes(line);
  const routeStops = await Promise.all(
    routes.map(async (route) => ({
      route,
      stops: await fetchOrderedRouteStops(route),
    })),
  );
  const sequences: LineRouteSequence[] = [];
  const seenBranchKeys = new Set<string>();

  routeStops.forEach(({ route, stops }) => {
    const sequence = dedupeStopSequence(
      stops
        .map(mapStopPointToLineRouteStop)
        .filter((stop): stop is LineRouteStop => Boolean(stop)),
    );

    if (sequence.length < 2) {
      return;
    }

    const stopIds = sequence.map((stop) => stop.id);
    const branchKey = createCanonicalSequenceKey(stopIds);

    if (seenBranchKeys.has(branchKey)) {
      return;
    }

    seenBranchKeys.add(branchKey);

    sequences.push({
      id: route.id,
      label: route.name ?? route.direction?.name ?? line.label,
      direction: cleanNavitiaDirection(
        route.direction?.name ?? route.name ?? line.label,
      ),
      stops: sequence,
    });
  });

  if (sequences.length === 0) {
    const fallbackStations = await searchLineStations(line, "");

    if (fallbackStations.length > 1) {
      sequences.push({
        id: `${line.id}:fallback`,
        label: line.label,
        stops: fallbackStations.map((station) => ({
          id: station.id,
          label: station.label,
          city: station.city,
          lon: undefined,
          lat: undefined,
          station,
        })),
      });
    }
  }

  return sequences;
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
): Promise<TransferLineOption[]> {
  const stopAreaRef = station.scheduleStopAreaRef ?? station.id;
  const searchParams = new URLSearchParams({
    count: "80",
    disable_disruption: "true",
    disable_geojson: "true",
  });
  const lines = await fetchPaginatedCollection<NavitiaLinesResponse, NavitiaLine>(
    `${NAVITIA_API_BASE}/stop_areas/${encodeURIComponent(stopAreaRef)}/lines`,
    searchParams,
    "lines",
    120,
  );

  return dedupeTransferOptions(
    dedupeLines(lines)
      .filter((line) => line.id !== currentLineId)
      .map(mapLineToTransferOption),
  ).sort(compareTransferLines);
}

export async function fetchDepartureCallingPattern(
  board: TransitBoardConfig,
  departure: Departure,
): Promise<DepartureCallingPattern> {
  const lineId = board.schedule?.lineRef ?? navitiaLineIdFromSiriRef(board.line.ref);
  const routes = await fetchLineRoutesById(lineId);
  const candidateRoutes = sortRoutesForDeparture(routes, departure);

  for (const route of candidateRoutes) {
    const schedules = await fetchRouteSchedulesForDeparture(route, departure).catch(
      () => [],
    );

    for (const schedule of schedules) {
      const pattern = mapRouteScheduleToCallingPattern(schedule, departure);

      if (pattern && patternMatchesDepartureDestination(pattern, departure)) {
        return pattern;
      }
    }
  }

  const fallbackRoute = candidateRoutes[0] ?? routes[0];

  if (fallbackRoute) {
    const stops = await fetchOrderedRouteStops(fallbackRoute).catch(() => []);

    if (stops.length > 0) {
      return {
        departureId: departure.id,
        destination: departure.destination,
        serviceType: "inconnu",
        calls: stops.map((stop) =>
          mapStopPointToDepartureCall(
            stop,
            stopMatchesDepartureStation(stop, departure),
          ),
        ),
      };
    }
  }

  return {
    departureId: departure.id,
    destination: departure.destination,
    serviceType: "inconnu",
    calls: [],
    error: "Desserte indisponible pour ce passage.",
  };
}

async function fetchLinesForCommercialMode(
  network: TransitFamilyOption,
): Promise<NavitiaLine[]> {
  const searchParams = new URLSearchParams({
    count: "100",
    disable_disruption: "true",
    disable_geojson: "true",
  });

  return fetchPaginatedCollection<NavitiaLinesResponse, NavitiaLine>(
    `${NAVITIA_API_BASE}/commercial_modes/${encodeURIComponent(network.id)}/lines`,
    searchParams,
    "lines",
    MAX_LINE_RESULTS,
  );
}

async function searchLinesWithPtObjects(
  network: TransitFamilyOption,
  query: string,
): Promise<NavitiaLine[]> {
  const searchParams = new URLSearchParams({
    count: "100",
    disable_disruption: "true",
    disable_geojson: "true",
    q: query,
  });

  searchParams.append("type[]", "line");

  const response = await fetch(`${NAVITIA_API_BASE}/pt_objects?${searchParams}`);

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
  const searchParams = new URLSearchParams({
    count: "1",
    disable_disruption: "true",
    disable_geojson: "true",
    duration: "1",
    from_datetime: formatParisNavitiaDateTime(new Date()),
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

  const calls = rows
    .map((row, rowIndex) => {
      const dateTime = findMatchingRowDateTime(row, match);

      if (!dateTime?.date_time || !row.stop_point) {
        return null;
      }

      return mapStopPointToDepartureCall(
        row.stop_point,
        rowIndex === match.rowIndex,
        parseNavitiaDateTime(dateTime.date_time),
      );
    })
    .filter((call): call is DepartureCall => call !== null);

  if (calls.length === 0) {
    return null;
  }

  return {
    departureId: departure.id,
    destination:
      cleanNavitiaDirection(schedule.display_informations?.direction ?? "") ||
      departure.destination,
    serviceType: getServiceType(calls.length, rows.length),
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

function mapStopPointToDepartureCall(
  stopPoint: NavitiaStopPoint,
  current: boolean,
  time?: string,
): DepartureCall {
  const label = cleanStationLabel(stopPoint.label ?? stopPoint.name ?? stopPoint.id);

  return {
    id: stopPoint.id,
    label,
    city: getStopPointCity(stopPoint, label),
    time,
    current,
  };
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
): Promise<TItem[]> {
  const items: TItem[] = [];
  let page = 0;
  let totalResult: number | undefined;

  while (items.length < maxResults) {
    const searchParams = new URLSearchParams(baseSearchParams);
    searchParams.set("start_page", String(page));

    const response = await fetch(`${endpoint}?${searchParams}`);

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
    call.DeparturePlatformName?.value ?? call.ArrivalPlatformName?.value,
  );
  const id = [
    visit.ItemIdentifier,
    journey.LineRef?.value,
    destination,
    expectedDepartureTime,
    platform,
  ]
    .filter(Boolean)
    .join("|");

  return {
    id,
    lineRef: journey.LineRef?.value ?? "",
    monitoringRef: visit.MonitoringRef?.value ?? point.ref,
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
    navitiaStopPointRef: monitoringRefToNavitiaStopPointRef(
      visit.MonitoringRef?.value ?? point.ref,
    ),
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
      ...mapScheduleToDepartures(board, schedule, group, serviceDay),
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
): Departure[] {
  const destination = cleanNavitiaDirection(
    schedule.display_informations?.direction ??
      schedule.display_informations?.headsign ??
      group.label,
  );

  return findUpcomingNavitiaTimes(schedule, serviceDay)
    .slice(0, board.maxDeparturesPerDirection ?? 4)
    .map((time) => ({
      id: `schedule|${board.id}|${group.id}|${time}`,
      lineRef: board.line.ref,
      monitoringRef: schedule.stop_point?.id ?? board.schedule?.stopAreaRef ?? "",
      stopName: board.title,
      destination,
      monitoringLabel: "Horaire IDFM",
      expectedDepartureTime: time,
      aimedDepartureTime: time,
      vehicleAtStop: false,
      navitiaStopPointRef: schedule.stop_point?.id,
    }));
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
      const groupDepartures =
        realtimeDepartures.length > 0
          ? realtimeDepartures
          : scheduledDepartures
              .filter((departure) => findDirectionGroup(board, departure)?.id === group.id)
              .slice(0, perDirectionLimit);

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
  const nowRaw = formatParisNavitiaDateTime(new Date());
  const seen = new Set<string>();

  return asArray(schedule.date_times)
    .flatMap((value) => [value.date_time, value.base_date_time])
    .filter(
      (value): value is string =>
        typeof value === "string" &&
        value >= nowRaw &&
        value >= serviceDay.fromParam &&
        value < serviceDay.cutoffParam,
    )
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    })
    .sort((left, right) => left.localeCompare(right))
    .map(parseNavitiaDateTime)
    .filter((value): value is string => Boolean(value));
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
  const iconUrls = createRatpLineIconUrls(line, network.family);

  return {
    family: network.family,
    id: line.id,
    navitiaId: line.id,
    label,
    ref: navitiaLineIdToSiriRef(line.id),
    commercialModeId: network.id,
    color: line.color ? `#${line.color}` : undefined,
    textColor: line.text_color ? `#${line.text_color}` : undefined,
    iconUrl: iconUrls[0],
    iconUrls,
    displayName:
      line.name && line.code && line.name !== line.code
        ? `${line.code} · ${line.name}`
        : label,
  };
}

function createRatpLineIconUrls(
  line: NavitiaLine,
  family: TransitFamily,
): string[] {
  const lineCode = line.id.split(":").pop();

  if (!lineCode) {
    return [];
  }

  const modePathByFamily: Partial<Record<TransitFamily, string>> = {
    METRO: "metro",
    RER: "rer",
    TRAM: "tramway",
    NOCTILIEN: "noctilien",
  };
  const modePath = modePathByFamily[family];

  if (!modePath) {
    return [];
  }

  const urls = [
    `https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/${modePath}/picto-ligne-LIGIDFM${lineCode}.svg`,
  ];

  if (family === "TRAM") {
    urls.push(
      `https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/tramway/picto-ligne-${line.code ?? line.name ?? lineCode}.svg`,
      `https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/tram/picto-ligne-LIGIDFM${lineCode}.svg`,
      `https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/tram/picto-ligne-${line.code ?? line.name ?? lineCode}.svg`,
    );
  }

  return urls;
}

function mapLineToTransferOption(line: NavitiaLine): TransferLineOption {
  return {
    id: line.id,
    label: line.code ?? line.name ?? line.id,
    mode: line.commercial_mode?.name ?? line.physical_modes?.[0]?.name,
    color: line.color ? `#${line.color}` : undefined,
    textColor: line.text_color ? `#${line.text_color}` : undefined,
  };
}

function mapStopPointToLineRouteStop(
  stopPoint: NavitiaStopPoint,
): LineRouteStop | null {
  const stopArea = stopPoint.stop_area ?? mapStopPointToStopArea(stopPoint);

  if (!stopArea) {
    return null;
  }

  const station = mapStopAreaToStation(stopArea);
  const coord = stopArea.coord ?? stopPoint.coord;
  const lon = parseCoordinate(coord?.lon);
  const lat = parseCoordinate(coord?.lat);

  return {
    id: station.id,
    label: station.label,
    city: station.city,
    lon,
    lat,
    station,
  };
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
  const terminal = pattern.calls[pattern.calls.length - 1]?.label;

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

function firstValue(values?: SiriTextValue[]): string | undefined {
  return values?.find((item) => item.value)?.value;
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
