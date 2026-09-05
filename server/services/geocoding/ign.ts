import { createError } from "h3";
import type { GeocoderPoint } from "../../../src/features/transport-map/contracts/geocoder";

export const IGN_GEOCODING_ROOT = "https://data.geopf.fr/geocodage";
const REQUEST_TIMEOUT_MS = 4_500;
const USER_AGENT = "TransportClockGPT/0.1 (nearby station address search)";

type IgnFeatureCollection = {
  features?: Array<{
    geometry?: { coordinates?: unknown[] };
    properties?: Record<string, unknown>;
  }>;
};

type IgnCompletionResponse = {
  results?: Array<Record<string, unknown>>;
};

export async function autocompleteIgnAddress(query: string): Promise<GeocoderPoint[]> {
  const params = new URLSearchParams({
    text: query,
    maximumResponses: "5",
    type: "StreetAddress",
    bbox: "1.4,48.1,3.6,49.3",
  });
  const payload = await fetchIgnJson<IgnCompletionResponse>(`${IGN_GEOCODING_ROOT}/completion/?${params}`);
  return (payload.results ?? [])
    .map(normalizeCompletionResult)
    .filter(isGeocoderPoint)
    .filter(isWithinIleDeFrance);
}

export async function searchIgnAddress(query: string): Promise<GeocoderPoint[]> {
  const params = new URLSearchParams({
    q: query,
    limit: "5",
    autocomplete: "0",
  });
  const payload = await fetchIgnJson<IgnFeatureCollection>(`${IGN_GEOCODING_ROOT}/search/?${params}`);
  return normalizeFeatures(payload).filter(isWithinIleDeFrance);
}

export async function reverseIgnAddress(lon: number, lat: number): Promise<GeocoderPoint[]> {
  const params = new URLSearchParams({ lon: String(lon), lat: String(lat), limit: "1" });
  const payload = await fetchIgnJson<IgnFeatureCollection>(`${IGN_GEOCODING_ROOT}/reverse/?${params}`);
  return normalizeFeatures(payload);
}

async function fetchIgnJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "accept-language": "fr-FR,fr;q=0.9", "user-agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw createError({
        statusCode: response.status === 429 ? 429 : 502,
        statusMessage: response.status === 429
          ? "IGN geocoding rate limit reached."
          : `IGN geocoding failed: ${response.status} ${response.statusText}`,
      });
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw createError({ statusCode: 504, statusMessage: "IGN geocoding timed out." });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCompletionResult(result: Record<string, unknown>): GeocoderPoint | undefined {
  const lon = asFiniteNumber(result.x);
  const lat = asFiniteNumber(result.y);
  if (lon === undefined || lat === undefined) return undefined;
  return {
    id: asString(result.poi) || `${lon}:${lat}`,
    lon,
    lat,
    label: asString(result.fulltext) || asString(result.street) || asString(result.city),
    provider: "ign-geoplateforme",
    city: asString(result.city),
    postcode: asString(result.zipcode),
    type: normalizeType(result.kind),
  };
}

function normalizeFeatures(payload: IgnFeatureCollection): GeocoderPoint[] {
  return (payload.features ?? []).map((feature): GeocoderPoint | undefined => {
    const coordinates = feature.geometry?.coordinates;
    const properties = feature.properties ?? {};
    const lon = asFiniteNumber(coordinates?.[0]);
    const lat = asFiniteNumber(coordinates?.[1]);
    if (lon === undefined || lat === undefined) return undefined;
    return {
      id: asString(properties.id) || `${lon}:${lat}`,
      lon,
      lat,
      label: asString(properties.label) || asString(properties.name),
      provider: "ign-geoplateforme",
      city: asString(properties.city),
      postcode: asString(properties.postcode),
      type: normalizeType(properties.type),
    };
  }).filter(isGeocoderPoint);
}

function normalizeType(value: unknown): GeocoderPoint["type"] {
  const type = asString(value).toLowerCase();
  if (type.includes("address") || type === "housenumber") return "address";
  if (type.includes("street")) return "street";
  if (type.includes("municip") || type === "city") return "municipality";
  if (type.includes("local")) return "locality";
  return "unknown";
}

function asFiniteNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isGeocoderPoint(value: GeocoderPoint | undefined): value is GeocoderPoint {
  return Boolean(value && Number.isFinite(value.lon) && Number.isFinite(value.lat));
}

function isWithinIleDeFrance(point: GeocoderPoint): boolean {
  return point.lon >= 1.4 && point.lon <= 3.6 && point.lat >= 48.1 && point.lat <= 49.3;
}
