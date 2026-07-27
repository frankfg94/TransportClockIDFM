import { createError, defineEventHandler, getRequestHeader, readBody } from "h3";
import {
  getGtfsManifest,
  isGtfsEnabled,
  loadCompiledGtfsLineArtifact,
} from "../../services/gtfs/runtime";

const MAX_PRELOAD_LINES = 24;
const MAX_BODY_BYTES = 12_000;

export default defineEventHandler(async (event) => {
  const declaredLength = Number(getRequestHeader(event, "content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw invalidPreload("Request body is too large.", 413);
  }

  const body = await readBody<unknown>(event);
  if (JSON.stringify(body).length > MAX_BODY_BYTES) {
    throw invalidPreload("Request body is too large.", 413);
  }
  const lineIds = parsePreloadLineIds(body);
  if (!isGtfsEnabled(event)) {
    return { enabled: false, availableLineIds: [], missingLineIds: lineIds };
  }

  const manifest = await getGtfsManifest(event);
  if (!manifest) {
    return { enabled: true, availableLineIds: [], missingLineIds: lineIds };
  }

  const artifacts = await Promise.all(
    lineIds.map((lineId) => loadCompiledGtfsLineArtifact(event, lineId)),
  );
  const availableLineIds = lineIds.filter((_lineId, index) => artifacts[index]);

  return {
    enabled: true,
    datasetVersion: manifest.datasetVersion,
    availableLineIds,
    missingLineIds: lineIds.filter((lineId) => !availableLineIds.includes(lineId)),
  };
});

export function parsePreloadLineIds(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.lineIds)) {
    throw invalidPreload("lineIds is required.");
  }

  const lineIds = [...new Set(value.lineIds)].filter(
    (lineId): lineId is string =>
      typeof lineId === "string" && lineId.trim().length > 0 && lineId.length <= 180,
  );
  if (
    lineIds.length === 0 ||
    lineIds.length > MAX_PRELOAD_LINES ||
    lineIds.length !== value.lineIds.length
  ) {
    throw invalidPreload(`lineIds must contain 1 to ${MAX_PRELOAD_LINES} unique values.`);
  }

  return lineIds;
}

function invalidPreload(message: string, statusCode = 400) {
  return createError({
    statusCode,
    statusMessage: message,
    data: { code: "invalid_request" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
