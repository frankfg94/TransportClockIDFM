import {
  fetchIdfmMarketplaceWithRetry,
  IDFM_MARKETPLACE_BASE_URL,
} from "#transport-clock/plugin-server";

const LINE_STOP_POINTS_CACHE_TTL_MS = 6 * 60 * 60_000;
const LINE_STOP_POINTS_FAILURE_TTL_MS = 60_000;

type JsonRecord = Record<string, unknown>;

export interface IdfmLineStopPoint {
  id: string;
  name: string;
  references: string[];
}

export interface IdfmLineStopPointResult {
  available: boolean;
  stopPoints: IdfmLineStopPoint[];
  upstreamStatus?: number;
}

export interface LoadIdfmLineStopPointsOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  lineId: string;
  nowMs?: number;
}

interface CacheEntry {
  expiresAt: number;
  result: IdfmLineStopPointResult;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<IdfmLineStopPointResult>>();

export function clearIdfmLineStopPointCache(): void {
  cache.clear();
  inFlight.clear();
}

export async function loadIdfmLineStopPoints(
  options: LoadIdfmLineStopPointsOptions,
): Promise<IdfmLineStopPointResult> {
  const nowMs = options.nowMs ?? Date.now();
  const cached = cache.get(options.lineId);

  if (cached && cached.expiresAt > nowMs) {
    return cached.result;
  }

  const pending = inFlight.get(options.lineId);

  if (pending) {
    return pending;
  }

  const request = fetchLineStopPoints(options).catch(() => ({
    available: false,
    stopPoints: [],
  }));
  inFlight.set(options.lineId, request);

  try {
    const result = await request;
    cache.set(options.lineId, {
      expiresAt:
        nowMs +
        (result.available
          ? LINE_STOP_POINTS_CACHE_TTL_MS
          : LINE_STOP_POINTS_FAILURE_TTL_MS),
      result,
    });

    return result;
  } finally {
    if (inFlight.get(options.lineId) === request) {
      inFlight.delete(options.lineId);
    }
  }
}

async function fetchLineStopPoints(
  options: LoadIdfmLineStopPointsOptions,
): Promise<IdfmLineStopPointResult> {
  const upstreamUrl = new URL(
    `${IDFM_MARKETPLACE_BASE_URL}/v2/navitia/lines/${encodeURIComponent(
      options.lineId,
    )}/stop_points`,
  );
  upstreamUrl.searchParams.set("count", "1000");
  upstreamUrl.searchParams.set("disable_geojson", "true");

  const response = await fetchIdfmMarketplaceWithRetry(
    upstreamUrl,
    {
      headers: {
        Accept: "application/json",
        apikey: options.apiKey,
      },
      method: "GET",
      redirect: "follow",
    },
    { fetchImpl: options.fetchImpl },
  );

  if (!response.ok) {
    return {
      available: false,
      stopPoints: [],
      upstreamStatus: response.status,
    };
  }

  const payload = (await response.json()) as JsonRecord;

  return {
    available: true,
    stopPoints: asRecords(payload.stop_points)
      .map(mapStopPoint)
      .filter((stopPoint): stopPoint is IdfmLineStopPoint => Boolean(stopPoint)),
  };
}

function mapStopPoint(value: JsonRecord): IdfmLineStopPoint | undefined {
  const id = textValue(value.id);
  const name = textValue(value.name) ?? textValue(value.label);

  if (!id || !name) {
    return undefined;
  }

  const sourceReferences = [
    id,
    ...asRecords(value.codes).map((code) => textValue(code.value)),
  ].filter((reference): reference is string => Boolean(reference));
  const references = sourceReferences.flatMap((reference) => [
    reference,
    ...createSiriStopAreaAliases(reference),
  ]);

  return {
    id,
    name,
    references: [...new Set(references)],
  };
}

function createSiriStopAreaAliases(reference: string): string[] {
  const monomodalStopPlaceCode = reference.match(
    /(?:^|:)monomodalStopPlace:(\d+)(?::|$)/iu,
  )?.[1];

  return monomodalStopPlaceCode
    ? [`STIF:StopArea:SP:${monomodalStopPlaceCode}:`]
    : [];
}

function asRecords(value: unknown): JsonRecord[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];

  return values.filter(
    (item): item is JsonRecord =>
      typeof item === "object" && item !== null && !Array.isArray(item),
  );
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  if (typeof value === "object" && value !== null && "value" in value) {
    return textValue((value as JsonRecord).value);
  }

  return undefined;
}
