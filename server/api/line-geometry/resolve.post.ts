import { createError, defineEventHandler, getRequestHeader, readBody, setHeader } from "h3";
import type { LineGeometryRequest } from "../../../src/features/line-map/lineGeometry";
import { resolveLineGeometry } from "../../services/lineGeometry/providers";

const MAX_STOPS = 240;
const MAX_BRANCHES = 100;
const MAX_BATCH_LINES = 12;
const MAX_BATCH_STOPS = 600;
const MAX_BODY_BYTES = 128_000;

export default defineEventHandler(async (event) => {
  const startedAt = performance.now();
  setHeader(event, "Cache-Control", "no-store");
  const declaredLength = Number(getRequestHeader(event, "content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw invalidRequest("Request body is too large.", 413);
  }

  const body = await readBody<unknown>(event);
  if (JSON.stringify(body).length > MAX_BODY_BYTES) {
    throw invalidRequest("Request body is too large.", 413);
  }
  const payload = parseResolveRequests(body);
  const results = [];
  for (const request of payload.requests) {
    results.push(await resolveLineGeometry(event, request));
  }
  setHeader(
    event,
    "Server-Timing",
    `line-geometry;dur=${(performance.now() - startedAt).toFixed(1)}`,
  );
  return payload.batched ? { results } : results[0];
});

export function parseResolveRequests(value: unknown): {
  batched: boolean;
  requests: LineGeometryRequest[];
} {
  if (isRecord(value) && Array.isArray(value.requests)) {
    if (value.requests.length === 0 || value.requests.length > MAX_BATCH_LINES) {
      throw invalidRequest(`requests must contain 1 to ${MAX_BATCH_LINES} lines.`);
    }
    const requests = value.requests.map(parseRequest);
    const stopCount = requests.reduce((total, request) => total + request.stops.length, 0);
    if (stopCount > MAX_BATCH_STOPS) {
      throw invalidRequest(`A batch cannot contain more than ${MAX_BATCH_STOPS} stops.`);
    }
    return { batched: true, requests };
  }

  return { batched: false, requests: [parseRequest(value)] };
}
export function parseRequest(value: unknown): LineGeometryRequest {
  if (!isRecord(value) || typeof value.lineId !== "string") {
    throw invalidRequest("lineId is required.");
  }
  if (!Array.isArray(value.stops) || value.stops.length < 2 || value.stops.length > MAX_STOPS) {
    throw invalidRequest(`stops must contain between 2 and ${MAX_STOPS} entries.`);
  }
  if (
    !Array.isArray(value.branches) ||
    value.branches.length < 1 ||
    value.branches.length > MAX_BRANCHES
  ) {
    throw invalidRequest(`branches must contain between 1 and ${MAX_BRANCHES} entries.`);
  }

  const stops = value.stops.map((stop) => {
    if (
      !isRecord(stop) ||
      typeof stop.id !== "string" ||
      !Number.isFinite(Number(stop.lon)) ||
      !Number.isFinite(Number(stop.lat))
    ) {
      throw invalidRequest("Every stop requires id, lon and lat.");
    }
    const lon = Number(stop.lon);
    const lat = Number(stop.lat);
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
      throw invalidRequest("Stop coordinates are outside WGS84 bounds.");
    }
    return {
      id: stop.id.slice(0, 180),
      ...(typeof stop.label === "string" ? { label: stop.label.slice(0, 240) } : {}),
      lon,
      lat,
    };
  });
  const knownStops = new Set(stops.map((stop) => stop.id));
  const branches = value.branches.map((branch) => {
    if (!isRecord(branch) || typeof branch.id !== "string" || !Array.isArray(branch.stopIds)) {
      throw invalidRequest("Every branch requires id and stopIds.");
    }
    const stopIds = branch.stopIds.filter((id): id is string => typeof id === "string");
    if (
      stopIds.length < 2 ||
      stopIds.length !== branch.stopIds.length ||
      stopIds.some((id) => !knownStops.has(id))
    ) {
      throw invalidRequest("Branch stopIds must reference submitted stops.");
    }
    return {
      id: branch.id.slice(0, 180),
      ...(typeof branch.direction === "string"
        ? { direction: branch.direction.slice(0, 240) }
        : {}),
      stopIds,
    };
  });

  return {
    lineId: value.lineId.slice(0, 180),
    ...(typeof value.lineLabel === "string" ? { lineLabel: value.lineLabel.slice(0, 120) } : {}),
    useGtfs: value.useGtfs !== false,
    stops,
    branches,
  };
}

function invalidRequest(message: string, statusCode = 400) {
  return createError({
    statusCode,
    statusMessage: message,
    data: { code: "invalid_request" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
