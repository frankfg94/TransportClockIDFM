import type {
  NearbyIsochronesResponse,
} from "../features/nearby-stations/nearbyIsochrones";
import {
  NEARBY_ISOCHRONES_NOT_CONFIGURED_CODE,
  isNearbyIsochronesResponse,
} from "../features/nearby-stations/nearbyIsochrones";
import {
  normalizeNearbyWalkingMinutes,
  NEARBY_WALKING_MINUTES,
  type NearbyWalkingMinutes,
} from "../features/nearby-stations/nearbyWalkingMinutes";
import { toServerApiUrl } from "./serverApi";

export type NearbyIsochronesErrorCode = "quota" | "not-configured" | "timeout" | "unavailable" | "invalid";

export class NearbyIsochronesError extends Error {
  constructor(
    public readonly code: NearbyIsochronesErrorCode,
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `nearby-isochrones-${status}`);
    this.name = "NearbyIsochronesError";
  }
}

type NearbyIsochronesApiError = {
  statusMessage?: unknown;
  data?: { code?: unknown };
};

export async function fetchNearbyIsochrones(
  origin: { lon: number; lat: number },
  signal?: AbortSignal,
  requestedMinutes: readonly NearbyWalkingMinutes[] = NEARBY_WALKING_MINUTES,
): Promise<NearbyIsochronesResponse> {
  const minutes = normalizeNearbyWalkingMinutes(requestedMinutes);
  const response = await fetch(toServerApiUrl("/api/walking/isochrones"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ origin, minutes }),
    signal,
  });
  const payload = await response.json().catch(() => undefined) as unknown;
  if (!response.ok) {
    const errorPayload = isRecord(payload) ? payload as NearbyIsochronesApiError : undefined;
    const statusMessage = typeof errorPayload?.statusMessage === "string"
      ? errorPayload.statusMessage
      : undefined;
    const errorCode = errorPayload?.data?.code === NEARBY_ISOCHRONES_NOT_CONFIGURED_CODE
      || /openrouteservice.*(?:key|configured)|not configured/iu.test(statusMessage ?? "")
      ? "not-configured"
      : response.status === 429
        ? "quota"
      : response.status === 504
        ? "timeout"
        : "unavailable";
    throw new NearbyIsochronesError(errorCode, response.status, statusMessage);
  }

  if (!isNearbyIsochronesResponse(payload, minutes)) {
    throw new NearbyIsochronesError("invalid", response.status, "Invalid walking isochrones response.");
  }
  return payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
