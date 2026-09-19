import { GLOBAL_MAP_MODE_ORDER, type GlobalMapMode } from "../contracts/manifest.js";
import type { WalkingIsochroneGeometry } from "../../../shared/walkingIsochroneGeometry.js";

export const GLOBAL_ISOCHRONE_SCHEMA_VERSION = 1;
export const GLOBAL_ISOCHRONE_MINUTES = [5, 10, 15, 20, 25, 30] as const;
export type GlobalIsochroneMinutes = typeof GLOBAL_ISOCHRONE_MINUTES[number];
export const GLOBAL_ISOCHRONE_PRESETS = {
  standard: [5, 10, 15],
  extended: [10, 20, 25],
} as const satisfies Record<string, readonly GlobalIsochroneMinutes[]>;
export const GLOBAL_ISOCHRONE_PRESET_ORDER = ["standard", "extended"] as const;
export type GlobalIsochronePresetId = typeof GLOBAL_ISOCHRONE_PRESET_ORDER[number];
export const GLOBAL_ISOCHRONE_DEFAULT_PRESET: Record<GlobalMapMode, GlobalIsochronePresetId> = {
  METRO: "standard",
  RER: "standard",
  TRAIN: "standard",
  TRANSILIEN: "standard",
  TRAM: "standard",
  CABLE: "standard",
  BUS: "extended",
  NOCTILIEN: "extended",
  BIKE: "standard",
};
export const GLOBAL_ISOCHRONE_ASSET = "/data/global-map/v1/walking-isochrones.zip";
export const GLOBAL_ISOCHRONE_ATTRIBUTION = "© openrouteservice · © OpenStreetMap contributors";
export const GLOBAL_ISOCHRONE_PARAMETERS = {
  profile: "foot-walking",
  locationType: "destination",
  smoothing: 0.25,
  coordinatePrecision: 5,
  minutes: GLOBAL_ISOCHRONE_MINUTES,
} as const;

export type GlobalIsochroneModeSetting = { enabled: boolean; preset: GlobalIsochronePresetId };
export type GlobalIsochroneSettings = Record<GlobalMapMode, GlobalIsochroneModeSetting>;
export type GlobalIsochroneStatus = "idle" | "loading" | "ready" | "partial" | "missing" | "incompatible" | "error";
export type GlobalIsochroneErrorCode = "missing" | "incompatible" | "invalid" | "unavailable";

export class GlobalIsochroneError extends Error {
  constructor(public readonly code: GlobalIsochroneErrorCode) {
    super(`global-isochrones-${code}`);
    this.name = "GlobalIsochroneError";
  }
}

export interface GlobalIsochroneScope {
  kind: "mode" | "line";
  id: string;
  mode: GlobalMapMode;
  stationIds: string[];
  coveredStationIds: string[];
  zones: Partial<Record<GlobalIsochroneMinutes, { asset: string; bytes: number }>>;
}

export interface GlobalIsochroneIndex {
  schemaVersion: typeof GLOBAL_ISOCHRONE_SCHEMA_VERSION;
  mapDataVersion: string;
  /** Fingerprint of the ORS endpoint and calculation parameters (no credentials). */
  calculationKey: string;
  /** OSM/engine/config fingerprint, supplied by the IDFM generator. */
  sourceRevision?: string;
  generatedAt: string;
  parameters: typeof GLOBAL_ISOCHRONE_PARAMETERS;
  attribution: string;
  scopes: Record<string, GlobalIsochroneScope>;
  /** Per-station access to shared, coordinate-deduplicated contours. Optional in legacy archives. */
  stationOrigins?: Record<string, { asset: string; lon: number; lat: number }>;
}

export interface GlobalIsochroneRequest {
  key: string;
  mode: GlobalMapMode;
  minutes: GlobalIsochroneMinutes;
}

/** Immutable WGS84 geometry; never tied to the camera or hit-testing. */
export interface GlobalIsochroneSurface {
  id: string;
  mode: GlobalMapMode;
  minutes: GlobalIsochroneMinutes;
  /** Scope key such as mode:METRO or line:line:METRO:1, when provided by the archive response. */
  scopeKey?: string;
  geometry: WalkingIsochroneGeometry;
}

export interface GlobalIsochroneCoverage {
  total: number;
  available: number;
  missing: number;
  missingScopes: string[];
}

export interface GlobalIsochroneResult {
  surfaces: GlobalIsochroneSurface[];
  coverage: GlobalIsochroneCoverage;
  generatedAt: string;
  attribution: string;
}

export function isGlobalIsochroneMinutes(value: unknown): value is GlobalIsochroneMinutes {
  return GLOBAL_ISOCHRONE_MINUTES.includes(value as GlobalIsochroneMinutes);
}

export function isGlobalIsochronePresetId(value: unknown): value is GlobalIsochronePresetId {
  return GLOBAL_ISOCHRONE_PRESET_ORDER.includes(value as GlobalIsochronePresetId);
}

export function globalIsochronePresetMinutes(preset: GlobalIsochronePresetId): readonly GlobalIsochroneMinutes[] {
  return GLOBAL_ISOCHRONE_PRESETS[preset];
}

export function createGlobalIsochroneSettings(): GlobalIsochroneSettings {
  return Object.fromEntries(GLOBAL_MAP_MODE_ORDER.map((mode) => [mode, {
    enabled: true, preset: GLOBAL_ISOCHRONE_DEFAULT_PRESET[mode],
  }])) as GlobalIsochroneSettings;
}

export function globalIsochroneScopeKey(kind: "mode" | "line", id: string): string {
  return `${kind}:${id}`;
}

export function globalIsochroneZoneAsset(key: string, minutes: GlobalIsochroneMinutes): string {
  return `zones/${encodeURIComponent(key)}/${minutes}.json`;
}

export function emptyGlobalIsochroneCoverage(): GlobalIsochroneCoverage {
  return { total: 0, available: 0, missing: 0, missingScopes: [] };
}

export function assertGlobalIsochroneIndex(value: unknown, mapDataVersion?: string): asserts value is GlobalIsochroneIndex {
  if (!isRecord(value)) throw new GlobalIsochroneError("invalid");
  if (value.schemaVersion !== GLOBAL_ISOCHRONE_SCHEMA_VERSION ||
    typeof value.mapDataVersion !== "string" ||
    (mapDataVersion !== undefined && value.mapDataVersion !== mapDataVersion)) {
    throw new GlobalIsochroneError("incompatible");
  }
  const p = value.parameters;
  if (!isRecord(p) || p.profile !== "foot-walking" || p.locationType !== "destination" ||
    p.smoothing !== GLOBAL_ISOCHRONE_PARAMETERS.smoothing || p.coordinatePrecision !== 5 ||
    JSON.stringify(p.minutes) !== JSON.stringify(GLOBAL_ISOCHRONE_MINUTES)) {
    throw new GlobalIsochroneError("incompatible");
  }
  if (typeof value.calculationKey !== "string" || !/^[a-f0-9]{24}$/u.test(value.calculationKey) ||
    !isRecord(value.scopes) || typeof value.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.generatedAt)) || typeof value.attribution !== "string") {
    throw new GlobalIsochroneError("invalid");
  }
  for (const [key, scope] of Object.entries(value.scopes)) {
    if (!isRecord(scope) || (scope.kind !== "mode" && scope.kind !== "line") ||
      typeof scope.id !== "string" || key !== globalIsochroneScopeKey(scope.kind, scope.id) ||
      !GLOBAL_MAP_MODE_ORDER.includes(scope.mode as GlobalMapMode) ||
      (scope.kind === "mode" && scope.id !== scope.mode) ||
      !stringList(scope.stationIds) || !stringList(scope.coveredStationIds) || !isRecord(scope.zones)) {
      throw new GlobalIsochroneError("invalid");
    }
  const stations = new Set(scope.stationIds);
    if (stations.size !== scope.stationIds.length || new Set(scope.coveredStationIds).size !== scope.coveredStationIds.length ||
      scope.coveredStationIds.some((id) => !stations.has(id))) throw new GlobalIsochroneError("invalid");
    for (const minutes of GLOBAL_ISOCHRONE_MINUTES) {
      const zone = scope.zones[minutes];
      if (!scope.coveredStationIds.length && zone === undefined) continue;
      if (!isRecord(zone) || zone.asset !== globalIsochroneZoneAsset(key, minutes) ||
        !Number.isSafeInteger(zone.bytes) || Number(zone.bytes) <= 0) throw new GlobalIsochroneError("invalid");
    }
  }
  if (value.stationOrigins !== undefined) {
    if (!isRecord(value.stationOrigins)) throw new GlobalIsochroneError("invalid");
    for (const entry of Object.values(value.stationOrigins)) {
      if (!isRecord(entry) || typeof entry.lon !== "number" || typeof entry.lat !== "number"
        || !Number.isFinite(entry.lon) || !Number.isFinite(entry.lat)
        || Math.abs(entry.lon) > 180 || Math.abs(entry.lat) > 90
        || entry.asset !== `origins/${encodeURIComponent(`${entry.lon.toFixed(5)},${entry.lat.toFixed(5)}`)}.json`) {
        throw new GlobalIsochroneError("invalid");
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === "string" && id.length > 0);
}
