import { strFromU8, unzipSync } from "fflate";
import type {
  LineRouteSequence,
  LineRouteStop,
  LineSearchOption,
  StationSearchOption,
} from "../types/transit";

const DEFAULT_GTFS_ZIP_URL = "/api/idfm/gtfs.zip";
const MIN_PATTERN_TRIP_COUNT = 1;
const MAX_REPRESENTATIVE_PATTERNS = 80;

type CsvRow = Record<string, string>;

type GtfsRoute = {
  route_id: string;
  route_short_name?: string;
  route_long_name?: string;
  route_type?: string;
  route_color?: string;
  route_text_color?: string;
};

type GtfsTrip = {
  route_id: string;
  service_id?: string;
  trip_id: string;
  trip_headsign?: string;
  direction_id?: string;
  shape_id?: string;
};

type GtfsStopTime = {
  trip_id: string;
  stop_id: string;
  stop_sequence: string;
};

type GtfsStop = {
  stop_id: string;
  stop_name?: string;
  stop_lat?: string;
  stop_lon?: string;
  parent_station?: string;
  location_type?: string;
};

type CanonicalStation = LineRouteStop;

type GtfsIndex = {
  routes: GtfsRoute[];
  tripsByRouteId: Map<string, GtfsTrip[]>;
  stopTimesByTripId: Map<string, GtfsStopTime[]>;
  stopsById: Map<string, GtfsStop>;
};

type PatternCandidate = {
  key: string;
  terminalKey: string;
  tripCount: number;
  stops: CanonicalStation[];
  labels: Set<string>;
};

let gtfsIndexPromise: Promise<GtfsIndex> | undefined;

export async function fetchGtfsLineRouteSequences(
  line: LineSearchOption,
): Promise<LineRouteSequence[]> {
  const index = await getGtfsIndex();
  const routes = findMatchingRoutes(index.routes, line);

  if (routes.length === 0) {
    return [];
  }

  const routeIds = new Set(routes.map((route) => route.route_id));
  const trips = [...routeIds].flatMap(
    (routeId) => index.tripsByRouteId.get(routeId) ?? [],
  );

  if (trips.length === 0) {
    return [];
  }

  const patterns = buildRepresentativePatterns(trips, index);

  return patterns.map((pattern, index) => {
    const first = pattern.stops[0];
    const last = pattern.stops[pattern.stops.length - 1];
    const label = `${first.label} ↔ ${last.label}`;

    return {
      id: `gtfs-pattern:${index + 1}:${pattern.key}`,
      label,
      direction: label,
      stops: pattern.stops,
    } satisfies LineRouteSequence;
  });
}

export function clearGtfsTopologyCache(): void {
  gtfsIndexPromise = undefined;
}

async function getGtfsIndex(): Promise<GtfsIndex> {
  gtfsIndexPromise ??= loadGtfsIndex();

  return gtfsIndexPromise;
}

async function loadGtfsIndex(): Promise<GtfsIndex> {
  const gtfsUrl =
    import.meta.env.VITE_IDFM_GTFS_ZIP_URL ?? DEFAULT_GTFS_ZIP_URL;
  const response = await fetch(gtfsUrl);

  if (!response.ok) {
    throw new Error(`GTFS HTTP ${response.status}`);
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  const zip = unzipSync(buffer);

  const routes = readGtfsCsv<GtfsRoute>(zip, "routes.txt");
  const trips = readGtfsCsv<GtfsTrip>(zip, "trips.txt");
  const stopTimes = readGtfsCsv<GtfsStopTime>(zip, "stop_times.txt");
  const stops = readGtfsCsv<GtfsStop>(zip, "stops.txt");

  const tripsByRouteId = new Map<string, GtfsTrip[]>();
  const stopTimesByTripId = new Map<string, GtfsStopTime[]>();
  const stopsById = new Map<string, GtfsStop>();

  for (const trip of trips) {
    const list = tripsByRouteId.get(trip.route_id) ?? [];
    list.push(trip);
    tripsByRouteId.set(trip.route_id, list);
  }

  for (const stopTime of stopTimes) {
    const list = stopTimesByTripId.get(stopTime.trip_id) ?? [];
    list.push(stopTime);
    stopTimesByTripId.set(stopTime.trip_id, list);
  }

  for (const stop of stops) {
    stopsById.set(stop.stop_id, stop);
  }

  return {
    routes,
    tripsByRouteId,
    stopTimesByTripId,
    stopsById,
  };
}

function readGtfsCsv<T extends CsvRow>(
  zip: Record<string, Uint8Array>,
  filename: string,
): T[] {
  const file = zip[filename];

  if (!file) {
    throw new Error(`Fichier GTFS manquant: ${filename}`);
  }

  return parseCsv(strFromU8(file)) as T[];
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...values] = rows;

  if (!headers) {
    return [];
  }

  return values
    .filter((valueRow) => valueRow.some((value) => value.trim()))
    .map((valueRow) =>
      Object.fromEntries(
        headers.map((header, index) => [header.trim(), valueRow[index] ?? ""]),
      ),
    );
}

function findMatchingRoutes(
  routes: GtfsRoute[],
  line: LineSearchOption,
): GtfsRoute[] {
  const wantedIds = new Set(
    [line.id, line.navitiaId, line.ref]
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => [
        normalizeComparableId(value),
        normalizeComparableId(extractLineCode(value)),
      ]),
  );
  const wantedLabel = normalizeLineLabel(line.label);

  const directMatches = routes.filter((route) => {
    const routeIds = [
      route.route_id,
      extractLineCode(route.route_id),
      route.route_short_name,
      route.route_long_name,
    ].map(normalizeComparableId);

    return routeIds.some((value) => wantedIds.has(value));
  });

  if (directMatches.length > 0) {
    return directMatches;
  }

  return routes.filter((route) => {
    const labels = [route.route_short_name, route.route_long_name].map(
      normalizeLineLabel,
    );

    return labels.includes(wantedLabel);
  });
}

function buildRepresentativePatterns(
  trips: GtfsTrip[],
  index: GtfsIndex,
): PatternCandidate[] {
  const patternsBySequence = new Map<string, PatternCandidate>();

  for (const trip of trips) {
    const stopTimes = index.stopTimesByTripId.get(trip.trip_id) ?? [];
    const stops = stopTimes
      .slice()
      .sort((left, right) => Number(left.stop_sequence) - Number(right.stop_sequence))
      .map((stopTime) => getCanonicalStation(stopTime.stop_id, index.stopsById))
      .filter((stop): stop is CanonicalStation => Boolean(stop));
    const sequence = dedupeConsecutiveStops(stops);

    if (sequence.length < 2) {
      continue;
    }

    const key = createCanonicalSequenceKey(sequence.map((stop) => stop.id));
    const terminalKey = createTerminalPairKey(sequence);
    const existing = patternsBySequence.get(key);

    if (existing) {
      existing.tripCount += 1;
      if (trip.trip_headsign) {
        existing.labels.add(trip.trip_headsign);
      }
    } else {
      patternsBySequence.set(key, {
        key,
        terminalKey,
        tripCount: 1,
        stops: sequence,
        labels: new Set(trip.trip_headsign ? [trip.trip_headsign] : []),
      });
    }
  }

  const bestByTerminalPair = new Map<string, PatternCandidate>();

  for (const pattern of patternsBySequence.values()) {
    if (pattern.tripCount < MIN_PATTERN_TRIP_COUNT) {
      continue;
    }

    const existing = bestByTerminalPair.get(pattern.terminalKey);

    if (!existing || isBetterRepresentativePattern(pattern, existing)) {
      bestByTerminalPair.set(pattern.terminalKey, pattern);
    }
  }

  return [...bestByTerminalPair.values()]
    .sort(
      (left, right) =>
        right.stops.length - left.stops.length || right.tripCount - left.tripCount,
    )
    .slice(0, MAX_REPRESENTATIVE_PATTERNS)
    .sort(comparePatternsForDisplay);
}

function isBetterRepresentativePattern(
  candidate: PatternCandidate,
  existing: PatternCandidate,
): boolean {
  if (candidate.stops.length !== existing.stops.length) {
    return candidate.stops.length > existing.stops.length;
  }

  return candidate.tripCount > existing.tripCount;
}

function getCanonicalStation(
  stopId: string,
  stopsById: Map<string, GtfsStop>,
): CanonicalStation | undefined {
  const rawStop = stopsById.get(stopId);

  if (!rawStop) {
    return undefined;
  }

  const parentStop = rawStop.parent_station
    ? stopsById.get(rawStop.parent_station)
    : undefined;
  const displayStop = parentStop ?? rawStop;
  const rawLabel = displayStop.stop_name ?? rawStop.stop_name ?? stopId;
  const label = cleanStationLabel(rawLabel);
  const id = createTopologyStationId(displayStop.stop_id ?? rawStop.stop_id ?? label);
  const lat = parseCoordinate(displayStop.stop_lat ?? rawStop.stop_lat);
  const lon = parseCoordinate(displayStop.stop_lon ?? rawStop.stop_lon);
  const station: StationSearchOption = {
    id,
    label,
    monitoringRef: createStopAreaMonitoringRef(displayStop.stop_id),
    scheduleStopAreaRef: createNavitiaStopAreaRef(displayStop.stop_id),
  };

  return {
    id,
    label,
    lat,
    lon,
    station,
  };
}

function dedupeConsecutiveStops(stops: CanonicalStation[]): CanonicalStation[] {
  const sequence: CanonicalStation[] = [];

  for (const stop of stops) {
    if (sequence[sequence.length - 1]?.id !== stop.id) {
      sequence.push(stop);
    }
  }

  return sequence;
}

function createCanonicalSequenceKey(stopIds: string[]): string {
  const direct = stopIds.join("|");
  const reverse = [...stopIds].reverse().join("|");

  return direct < reverse ? direct : reverse;
}

function createTerminalPairKey(stops: CanonicalStation[]): string {
  const first = stops[0]?.id ?? "";
  const last = stops[stops.length - 1]?.id ?? "";

  return [first, last].sort().join("<>");
}

function comparePatternsForDisplay(
  left: PatternCandidate,
  right: PatternCandidate,
): number {
  const leftFirst = left.stops[0]?.label ?? "";
  const rightFirst = right.stops[0]?.label ?? "";
  const firstCompare = leftFirst.localeCompare(rightFirst, "fr", {
    numeric: true,
    sensitivity: "base",
  });

  if (firstCompare !== 0) {
    return firstCompare;
  }

  return (left.stops[left.stops.length - 1]?.label ?? "").localeCompare(
    right.stops[right.stops.length - 1]?.label ?? "",
    "fr",
    {
      numeric: true,
      sensitivity: "base",
    },
  );
}

function extractLineCode(value?: string): string {
  if (!value) {
    return "";
  }

  return value.match(/C\d+/u)?.[0] ?? value.split(":").filter(Boolean).at(-1) ?? value;
}

function normalizeComparableId(value?: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/gu, "");
}

function normalizeLineLabel(value?: string): string {
  return normalizeText(value).replace(/^rer\s+/u, "").replace(/^metro\s+/u, "").trim();
}

function createTopologyStationId(value: string): string {
  return `station:${createStableId(value)}`;
}

function cleanStationLabel(value: string): string {
  return value
    .replace(/\s+\([^)]*\)$/u, "")
    .replace(/\s+/g, " ")
    .replace(/[’]/gu, "'")
    .trim();
}

function createStopAreaMonitoringRef(stopId: string): string | undefined {
  const numericId = stopId.match(/(\d+)$/u)?.[1];

  return numericId ? `STIF:StopArea:SP:${numericId}:` : undefined;
}

function createNavitiaStopAreaRef(stopId: string): string | undefined {
  const numericId = stopId.match(/(\d+)$/u)?.[1];

  return numericId ? `stop_area:IDFM:${numericId}` : undefined;
}

function parseCoordinate(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeText(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function createStableId(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
