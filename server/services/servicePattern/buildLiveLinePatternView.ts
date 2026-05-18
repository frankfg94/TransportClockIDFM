import type { LinePatternViewResponse } from "../../../src/types/transit";
import { buildLineTopologyFromFixture } from "../topology/buildLineTopology";
import type { RawLineFixture, RawPattern, RawStation } from "../topology/types";
import {
  buildLinePatternViewFromTopology,
  resolveHumanLineId,
} from "./buildLinePatternView";

const IDFM_MARKETPLACE_BASE =
  "https://prim.iledefrance-mobilites.fr/marketplace";

interface BuildLiveLinePatternViewParams {
  transportType: string;
  lineId: string;
  directionId?: string;
  startStationId?: string;
  startStationCandidates?: string[];
  apiKey: string;
  fetcher?: typeof fetch;
}

interface NavitiaLine {
  id: string;
  name?: string;
  code?: string;
  color?: string;
  text_color?: string;
  commercial_mode?: {
    name?: string;
  };
  routes?: NavitiaRoute[];
}

interface NavitiaRoute {
  id: string;
  name?: string;
  direction?: {
    name?: string;
  };
}

interface NavitiaPtObject {
  embedded_type?: string;
  line?: NavitiaLine;
}

interface NavitiaPtObjectsPayload {
  pt_objects?: NavitiaPtObject[];
}

interface NavitiaRoutesPayload {
  routes?: NavitiaRoute[];
}

interface NavitiaStopPoint {
  id?: string;
  name?: string;
  label?: string;
  coord?: {
    lat?: string;
    lon?: string;
  };
  stop_area?: {
    id?: string;
    name?: string;
    label?: string;
    coord?: {
      lat?: string;
      lon?: string;
    };
  };
}

interface NavitiaRouteSchedule {
  display_informations?: {
    direction?: string;
  };
  table?: {
    rows?: Array<{
      stop_point?: NavitiaStopPoint;
    }>;
  };
}

interface NavitiaRouteSchedulesPayload {
  route_schedules?: NavitiaRouteSchedule[];
}

export async function buildLiveLinePatternView(
  params: BuildLiveLinePatternViewParams,
): Promise<LinePatternViewResponse> {
  const fetcher = params.fetcher ?? fetch;
  const line = await resolveLiveLine(params, fetcher);
  const routes = line.routes?.length
    ? line.routes
    : await fetchLiveRoutes(line.id, params.apiKey, fetcher);
  const patterns = await fetchLivePatterns(routes, params.apiKey, fetcher);
  const raw = createRawLineFixture(params, line, patterns);
  const topology = buildLineTopologyFromFixture(raw);

  return buildLinePatternViewFromTopology(params, topology);
}

async function resolveLiveLine(
  params: BuildLiveLinePatternViewParams,
  fetcher: typeof fetch,
): Promise<NavitiaLine> {
  if (params.lineId.startsWith("line:")) {
    return {
      id: params.lineId,
      code: params.lineId,
      name: params.lineId,
    };
  }

  const requestedLine = decodeURIComponent(params.lineId);
  const requestedSlug = normalizeId(requestedLine);
  const resolvedFixtureSlug = resolveHumanLineId(
    params.transportType,
    requestedLine,
  );
  const url = navitiaUrl("/v2/navitia/pt_objects", {
    count: "100",
    disable_disruption: "true",
    disable_geojson: "true",
    q: requestedLine,
  });

  url.searchParams.append("type[]", "line");

  const payload = await fetchJson<NavitiaPtObjectsPayload>(
    url,
    params.apiKey,
    fetcher,
  );
  const lines = (payload.pt_objects ?? [])
    .filter((object) => object.embedded_type === "line")
    .map((object) => object.line)
    .filter((line): line is NavitiaLine => Boolean(line));
  const exact =
    lines.find((line) =>
      [line.code, line.name, line.id]
        .map(normalizeId)
        .some(
          (value) =>
            value === requestedSlug ||
            value === resolvedFixtureSlug ||
            value === normalizeId(`${params.transportType}-${requestedLine}`),
        ),
    ) ?? lines[0];

  if (!exact) {
    throw new Error(`Live line not found: ${params.transportType}/${params.lineId}`);
  }

  return exact;
}

async function fetchLiveRoutes(
  lineId: string,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<NavitiaRoute[]> {
  const payload = await fetchJson<NavitiaRoutesPayload>(
    navitiaUrl(`/v2/navitia/lines/${encodeURIComponent(lineId)}/routes`, {
      count: "100",
      disable_disruption: "true",
      disable_geojson: "true",
    }),
    apiKey,
    fetcher,
  );

  return payload.routes ?? [];
}

async function fetchLivePatterns(
  routes: NavitiaRoute[],
  apiKey: string,
  fetcher: typeof fetch,
): Promise<Array<{ route: NavitiaRoute; stops: RawStation[] }>> {
  const patterns = await Promise.all(
    routes.slice(0, 24).map(async (route) => {
      const payload = await fetchJson<NavitiaRouteSchedulesPayload>(
        navitiaUrl(
          `/v2/navitia/routes/${encodeURIComponent(route.id)}/route_schedules`,
          {
            count: "1",
            data_freshness: "base_schedule",
            disable_disruption: "true",
            disable_geojson: "true",
            items_per_schedule: "1",
          },
        ),
        apiKey,
        fetcher,
      ).catch(() => undefined);
      const stops = dedupeStops(
        (payload?.route_schedules ?? [])
          .flatMap((schedule) => schedule.table?.rows ?? [])
          .map((row) => row.stop_point)
          .filter((stop): stop is NavitiaStopPoint => Boolean(stop))
          .map(mapStopPointToRawStation)
          .filter((station): station is RawStation => Boolean(station)),
      );

      return stops.length > 1 ? { route, stops } : undefined;
    }),
  );

  return patterns.filter(
    (pattern): pattern is { route: NavitiaRoute; stops: RawStation[] } =>
      Boolean(pattern),
  );
}

function createRawLineFixture(
  params: BuildLiveLinePatternViewParams,
  line: NavitiaLine,
  livePatterns: Array<{ route: NavitiaRoute; stops: RawStation[] }>,
): RawLineFixture {
  if (livePatterns.length === 0) {
    throw new Error(`No live route schedule for ${line.id}`);
  }

  const stationsById = new Map<string, RawStation>();
  const patternsBySequence = new Map<string, RawPattern>();

  for (const livePattern of livePatterns) {
    for (const stop of livePattern.stops) {
      stationsById.set(stop.id, stop);
    }

    const stops = livePattern.stops.map((stop) => stop.id);
    const sequenceKey = stops.join(">");
    const existing = patternsBySequence.get(sequenceKey);

    if (existing) {
      existing.tripCount += 1;
      continue;
    }

    const first = livePattern.stops[0];
    const last = livePattern.stops[livePattern.stops.length - 1];
    const direction = livePattern.route.direction?.name ?? livePattern.route.name;

    patternsBySequence.set(sequenceKey, {
      id: createStableId(`${line.id}-${sequenceKey}`),
      terminalFrom: first.name,
      terminalTo: direction ?? last.name,
      stops,
      tripCount: 1,
    });
  }

  const shortName = line.code ?? line.name ?? params.lineId;

  return {
    line: {
      id: line.id,
      aliases: [
        params.lineId,
        shortName,
        resolveHumanLineId(params.transportType, params.lineId),
      ],
      name: line.name ?? shortName,
      shortName,
      mode: line.commercial_mode?.name ?? params.transportType,
    },
    stations: [...stationsById.values()],
    patterns: [...patternsBySequence.values()],
  };
}

function mapStopPointToRawStation(stopPoint: NavitiaStopPoint): RawStation | undefined {
  const stopArea = stopPoint.stop_area;
  const id = stopArea?.id ?? stopPoint.id;
  const name = stopArea?.name ?? stopArea?.label ?? stopPoint.name ?? stopPoint.label;

  if (!id || !name) {
    return undefined;
  }

  return {
    id,
    name,
    lat: parseNumber(stopArea?.coord?.lat ?? stopPoint.coord?.lat),
    lon: parseNumber(stopArea?.coord?.lon ?? stopPoint.coord?.lon),
    aliases: [stopArea?.label, stopPoint.name, stopPoint.label].filter(
      (value): value is string => Boolean(value),
    ),
  };
}

function dedupeStops(stops: RawStation[]): RawStation[] {
  return stops.filter((stop, index) => index === 0 || stop.id !== stops[index - 1].id);
}

async function fetchJson<T>(
  url: URL,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<T> {
  const response = await fetcher(url, {
    headers: apiKey
      ? {
          apikey: apiKey,
        }
      : undefined,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

function navitiaUrl(path: string, params: Record<string, string>): URL {
  const url = new URL(`${IDFM_MARKETPLACE_BASE}${path}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function createStableId(value: string): string {
  return normalizeId(value);
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
