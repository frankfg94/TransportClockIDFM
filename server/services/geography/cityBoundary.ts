import { parseCityBoundary, type CityBoundary } from "../../../src/features/transport-map/contracts/cityBoundary";
import { administrativeInteriorPoint } from "../../../src/features/transport-map/iris/administrativeGeometry";

const cache = new Map<string, { expiresAt: number; value: CityBoundary }>();
const pending = new Map<string, Promise<CityBoundary>>();

export async function resolveCityBoundary(lat: number, lon: number): Promise<CityBoundary> {
  // Keep exact station coordinates: rounding can cross a commune boundary.
  const key = `${lat},${lon}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const request = (async () => {
    const url = new URL("https://geo.api.gouv.fr/communes");
    url.search = new URLSearchParams({ lat: String(lat), lon: String(lon),
      fields: "code,nom", format: "geojson", geometry: "contour" }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`API Géo returned HTTP ${response.status}`);
    const payload = await response.json();
    const features = payload?.features;
    if (!Array.isArray(features) || features.length !== 1) throw new Error("Commune boundary is absent or ambiguous");
    const feature = features[0];
    const value = parseCityBoundary({ code: feature.properties?.code, name: feature.properties?.nom,
      centroid: [lon, lat], geometry: feature.geometry });
    const rings = value.geometry.type === "Polygon" ? value.geometry.coordinates : value.geometry.coordinates.flat();
    value.centroid = administrativeInteriorPoint(rings.flatMap((ring) => ring.slice(1).map((point, index) => ({
      from: ring[index]! as [number, number], to: point as [number, number],
    }))), [lon, lat]);
    if (cache.size >= 2_000) cache.delete(cache.keys().next().value!);
    cache.set(key, { value, expiresAt: Date.now() + 7 * 86_400_000 });
    return value;
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}
