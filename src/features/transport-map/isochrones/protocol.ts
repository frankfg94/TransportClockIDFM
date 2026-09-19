import { GLOBAL_MAP_MODE_ORDER, type GlobalMapMode } from "../contracts/manifest";
import { normalizeWalkingIsochroneGeometry } from "../../../shared/walkingIsochroneGeometry";
import {
  GLOBAL_ISOCHRONE_MINUTES,
  GlobalIsochroneError,
  globalIsochroneZoneAsset,
  isGlobalIsochroneMinutes,
  type GlobalIsochroneRequest,
  type GlobalIsochroneResult,
} from "./contracts";
export { GlobalIsochroneError } from "./contracts";
export const GLOBAL_ISOCHRONE_API = "/api/map/isochrones";
export const GLOBAL_ISOCHRONE_RESPONSE_LIMIT = 64 * 1024 * 1024;

export function parseGlobalIsochroneQuery(query: Record<string, unknown>): { scopes: GlobalIsochroneRequest[]; mapVersion: string; reload: boolean } {
  if (typeof query.mapVersion !== "string" || !/^[a-zA-Z0-9._-]{1,128}$/u.test(query.mapVersion) ||
    typeof query.scopes !== "string" || query.scopes.length > 4096) throw new GlobalIsochroneError("invalid");
  let scopes: unknown;
  try { scopes = JSON.parse(query.scopes); } catch { throw new GlobalIsochroneError("invalid"); }
  if (!Array.isArray(scopes) || !scopes.length || scopes.length > GLOBAL_MAP_MODE_ORDER.length * GLOBAL_ISOCHRONE_MINUTES.length) throw new GlobalIsochroneError("invalid");
  const keys = new Set<string>();
  for (const scope of scopes) {
    if (!isRecord(scope) || typeof scope.key !== "string" || scope.key.length > 180 ||
      !GLOBAL_MAP_MODE_ORDER.includes(scope.mode as GlobalMapMode) || !isGlobalIsochroneMinutes(scope.minutes) ||
      !(scope.key === `mode:${scope.mode}` || /^line:[a-zA-Z0-9:_-]+$/u.test(scope.key)) || keys.has(`${scope.key}:${scope.minutes}`)) throw new GlobalIsochroneError("invalid");
    keys.add(`${scope.key}:${scope.minutes}`);
  }
  return { scopes: scopes as GlobalIsochroneRequest[], mapVersion: query.mapVersion, reload: query.retry !== undefined };
}

export function parseGlobalIsochroneResponse(value: unknown, mapVersion: string, requests: GlobalIsochroneRequest[]): GlobalIsochroneResult {
  if (!isRecord(value)) throw new GlobalIsochroneError("invalid");
  if (value.schemaVersion !== 1 || value.mapDataVersion !== mapVersion) throw new GlobalIsochroneError("incompatible");
  const result = value.result;
  if (!isRecord(result) || !Array.isArray(result.surfaces) || result.surfaces.length > requests.length ||
    !isRecord(result.coverage) || typeof result.attribution !== "string" || result.attribution.length > 1000 ||
    typeof result.generatedAt !== "string" || !Number.isFinite(Date.parse(result.generatedAt))) throw new GlobalIsochroneError("invalid");
  const coverage = result.coverage;
  if (![coverage.total, coverage.available, coverage.missing].every((n) => Number.isSafeInteger(n) && Number(n) >= 0) ||
    Number(coverage.total) !== Number(coverage.available) + Number(coverage.missing) || !Array.isArray(coverage.missingScopes) ||
    coverage.missingScopes.some((key) => !requests.some((r) => r.key === key))) throw new GlobalIsochroneError("invalid");
  const ids = new Set<string>();
  for (const surface of result.surfaces) {
    const request = isRecord(surface)
      ? requests.find((candidate) => candidate.mode === surface.mode && candidate.minutes === surface.minutes && globalIsochroneZoneAsset(candidate.key, candidate.minutes) === surface.id)
      : undefined;
    if (!isRecord(surface) || typeof surface.id !== "string" || ids.has(surface.id) || !request ||
      (surface.scopeKey !== undefined && surface.scopeKey !== request.key)) throw new GlobalIsochroneError("invalid");
    const geometry = normalizeWalkingIsochroneGeometry(surface.geometry);
    if (!geometry) throw new GlobalIsochroneError("invalid");
    surface.geometry = geometry;
    surface.scopeKey = request.key;
    ids.add(surface.id);
  }
  return result as unknown as GlobalIsochroneResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
