import type { GeocoderPoint, TransportMapGeocoder } from "../../features/transport-map/contracts/geocoder";
import { toServerApiUrl } from "../serverApi";

type GeocodingResponse = { results?: GeocoderPoint[] };

export class GeocodingApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "GeocodingApiError";
  }
}

export function createIgnTransportMapGeocoder(): TransportMapGeocoder {
  return {
    autocomplete: (query, signal) => postGeocoding("/api/geocoding/autocomplete", { query }, signal),
    geocode: (query, signal) => postGeocoding("/api/geocoding/search", { query }, signal),
    reverseGeocode: (point, signal) => postGeocoding("/api/geocoding/reverse", point, signal),
  };
}

async function postGeocoding(path: string, body: unknown, signal?: AbortSignal): Promise<GeocoderPoint[]> {
  const response = await fetch(toServerApiUrl(path), {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new GeocodingApiError(response.status, `${response.status} ${response.statusText}`);
  const payload = await response.json() as GeocodingResponse;
  return Array.isArray(payload.results) ? payload.results : [];
}
