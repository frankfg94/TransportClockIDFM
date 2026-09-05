import type { NearbyNoiseZonesResponse } from "../features/nearby-stations/nearbyNoiseZones";
import { isNearbyNoiseZonesResponse } from "../features/nearby-stations/nearbyNoiseZones";
import { toServerApiUrl } from "./serverApi";

export type NearbyNoiseZonesErrorCode = "timeout" | "unavailable" | "invalid";

export class NearbyNoiseZonesError extends Error {
  constructor(
    public readonly code: NearbyNoiseZonesErrorCode,
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `nearby-noise-zones-${status}`);
    this.name = "NearbyNoiseZonesError";
  }
}

type NearbyNoiseZonesApiError = {
  statusMessage?: unknown;
};

export async function fetchNearbyNoiseZones(
  origin: { lon: number; lat: number },
  radiusMeters: number,
  signal?: AbortSignal,
): Promise<NearbyNoiseZonesResponse> {
  const query = new URLSearchParams({
    lat: String(origin.lat),
    lon: String(origin.lon),
    radius: String(Math.round(radiusMeters)),
  });
  const response = await fetch(
    `${toServerApiUrl("/api/neighborhood-verdict/noise-grid")}?${query.toString()}`,
    // The compiled snapshot can be regenerated independently of Nuxt. Do not
    // let the browser reuse a previous 5-minute response after a new snapshot
    // has been published; the in-memory composable cache still deduplicates
    // repeated toggles during the current page lifetime.
    { signal, cache: "no-store" },
  );
  const payload = await response.json().catch(() => undefined) as unknown;
  if (!response.ok) {
    const errorPayload = isRecord(payload) ? payload as NearbyNoiseZonesApiError : undefined;
    const message = typeof errorPayload?.statusMessage === "string"
      ? errorPayload.statusMessage
      : undefined;
    throw new NearbyNoiseZonesError(
      response.status === 504 ? "timeout" : "unavailable",
      response.status,
      message,
    );
  }

  if (!isNearbyNoiseZonesResponse(payload)) {
    throw new NearbyNoiseZonesError("invalid", response.status, "Invalid nearby noise zones response.");
  }
  return payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
