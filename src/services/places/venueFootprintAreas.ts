export const MARKET_FOOTPRINT_AREAS_FILE = "market-footprint-areas.json";
export const CINEMA_FOOTPRINT_AREAS_FILE = "cinema-footprint-areas.json";

const requests = new Map<string, Promise<ReadonlyMap<string, number>>>();

/** Areas calculated from closed OSM geometries during catalogue publication. */
export function loadVenueFootprintAreas(filename: typeof MARKET_FOOTPRINT_AREAS_FILE | typeof CINEMA_FOOTPRINT_AREAS_FILE): Promise<ReadonlyMap<string, number>> {
  const existing = requests.get(filename);
  if (existing) return existing;
  const request = fetch(`/data/places/${filename}`, { signal: AbortSignal.timeout(6_000) })
    .then(async response => {
      if (!response.ok) throw new Error(`Venue footprint areas HTTP ${response.status}`);
      const payload = await response.json() as { schemaVersion?: number; areas?: Record<string, unknown> };
      if (payload.schemaVersion !== 1 || !payload.areas || typeof payload.areas !== "object" || Array.isArray(payload.areas)) {
        throw new Error("Invalid venue footprint areas");
      }
      return new Map(Object.entries(payload.areas).flatMap(([id, area]) =>
        typeof area === "number" && Number.isFinite(area) && area > 0 ? [[id, area] as const] : []));
    })
    .catch(() => {
      requests.delete(filename);
      return new Map<string, number>();
    });
  requests.set(filename, request);
  return request;
}
