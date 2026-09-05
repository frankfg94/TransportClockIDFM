import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import type { NearbyHeavyTransportCandidate } from "./nearbyHeavyTransports";
import type { NearbyPlace } from "./nearbyPlaces";
import type { NeighborhoodWalkingMetrics } from "./neighborhoodScore";

// v2 invalidates access snapshots produced before the initial-wait policy and
// real station walking probes were introduced.
const SNAPSHOT_STORAGE_KEY = "transport-clock.nearby-neighborhood-score.v3";
const SNAPSHOT_TTL_MS = 10 * 60_000;

export interface NearbyNeighborhoodScoreSnapshot {
  version: 2;
  savedAt: number;
  origin: Pick<GeocoderPoint, "lon" | "lat"> & Pick<GeocoderPoint, "label" | "city">;
  places: NearbyPlace[];
  placesLoaded: boolean;
  walkingRoutes: Record<string, NeighborhoodWalkingMetrics | undefined>;
  heavyCandidates: NearbyHeavyTransportCandidate[];
}

let memorySnapshot: NearbyNeighborhoodScoreSnapshot | undefined;

export function saveNearbyNeighborhoodScoreSnapshot(
  snapshot: Omit<NearbyNeighborhoodScoreSnapshot, "version" | "savedAt">,
): void {
  const next: NearbyNeighborhoodScoreSnapshot = {
    ...snapshot,
    version: 2,
    savedAt: Date.now(),
  };
  memorySnapshot = cloneSnapshot(next);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(next));
    // The score opens in a separate page/tab. localStorage is the fallback
    // handoff when the browser does not clone sessionStorage to a noopener tab.
    window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The page can fall back to its normal providers when storage is blocked.
  }
}

export function readNearbyNeighborhoodScoreSnapshot(
  origin?: Pick<GeocoderPoint, "lon" | "lat">,
): NearbyNeighborhoodScoreSnapshot | undefined {
  const stored = memorySnapshot ?? readStoredSnapshot();
  if (!stored || Date.now() - stored.savedAt > SNAPSHOT_TTL_MS) return undefined;
  if (origin && snapshotOriginKey(origin) !== snapshotOriginKey(stored.origin)) return undefined;
  return cloneSnapshot(stored);
}

function readStoredSnapshot(): NearbyNeighborhoodScoreSnapshot | undefined {
  if (typeof window === "undefined") return undefined;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const raw = storage.getItem(SNAPSHOT_STORAGE_KEY);
      if (!raw) continue;
      const value: unknown = JSON.parse(raw);
      if (!isSnapshot(value)) continue;
      memorySnapshot = value;
      if (storage === window.localStorage) storage.removeItem(SNAPSHOT_STORAGE_KEY);
      return value;
    } catch {
      // Try the other browser storage, then let the normal provider run.
    }
  }
  return undefined;
}

function isSnapshot(value: unknown): value is NearbyNeighborhoodScoreSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NearbyNeighborhoodScoreSnapshot>;
  return candidate.version === 2
    && typeof candidate.savedAt === "number"
    && Number.isFinite(candidate.savedAt)
    && isPoint(candidate.origin)
    && Array.isArray(candidate.places)
    && typeof candidate.placesLoaded === "boolean"
    && !!candidate.walkingRoutes
    && typeof candidate.walkingRoutes === "object"
    && Array.isArray(candidate.heavyCandidates);
}

function isPoint(value: unknown): value is Pick<GeocoderPoint, "lon" | "lat"> {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<GeocoderPoint>;
  return typeof point.lon === "number"
    && Number.isFinite(point.lon)
    && typeof point.lat === "number"
    && Number.isFinite(point.lat);
}

function snapshotOriginKey(origin: Pick<GeocoderPoint, "lon" | "lat">): string {
  return `${origin.lat.toFixed(5)}:${origin.lon.toFixed(5)}`;
}

function cloneSnapshot(snapshot: NearbyNeighborhoodScoreSnapshot): NearbyNeighborhoodScoreSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as NearbyNeighborhoodScoreSnapshot;
}
