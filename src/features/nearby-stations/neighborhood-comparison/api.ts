import { toServerApiUrl } from "../../../services/serverApi";
import { createCompiledPlacesProvider } from "../../../services/places/compiledPlacesProvider";
import { placesCityCode } from "./geometry";
import type { ComparisonGreen, NeighborhoodComparisonGeography } from "./types";
import { GlobalMapAssetLoader } from "../../transport-map/data/assetLoader";

let places = createCompiledPlacesProvider();
let transportMetadata: Promise<{ generatedAt: string; gtfs?: string }> | undefined;

/** Explicit refresh drops only this feature's client-side caches. */
export function invalidateComparisonCaches(): void {
  places = createCompiledPlacesProvider();
  transportMetadata = undefined;
}

export function fetchComparisonTransportMetadata(): Promise<{ generatedAt: string; gtfs?: string }> {
  if (!transportMetadata) {
    const pending = new GlobalMapAssetLoader().loadManifest()
      .then(manifest => ({ generatedAt: manifest.generatedAt, gtfs: manifest.sourceVersions.gtfsDatasetVersion }))
      .catch(error => { if (transportMetadata === pending) transportMetadata = undefined; throw error; });
    transportMetadata = pending;
  }
  return transportMetadata;
}

export async function fetchComparisonGeography(origin: { lat: number; lon: number; code?: string }, signal: AbortSignal): Promise<NeighborhoodComparisonGeography> {
  const params = new URLSearchParams({ lat: String(origin.lat), lon: String(origin.lon) });
  if (origin.code) params.set("communeCode", origin.code);
  const response = await fetch(toServerApiUrl(`/api/neighborhood-comparison?${params}`), { signal });
  if (!response.ok) throw new Error(String(response.status));
  return await response.json() as NeighborhoodComparisonGeography;
}

export async function fetchComparisonGreen(code: string, generatedAt: string, signal: AbortSignal): Promise<Record<string, ComparisonGreen>> {
  const params = new URLSearchParams({ communeCode: code });
  const response = await fetch(toServerApiUrl(`/api/neighborhood-comparison-green?${params}`), { signal });
  if (!response.ok) throw new Error(String(response.status));
  const payload = await response.json() as { communeCode: string; generatedAt: string; neighborhoods: Record<string, ComparisonGreen> };
  if (payload.communeCode !== code || payload.generatedAt !== generatedAt) throw new Error("Comparison dataset changed");
  return payload.neighborhoods;
}

export async function fetchComparisonPlaces(communeCode: string) {
  const code = placesCityCode(communeCode);
  const [manifest, city] = await Promise.all([places.loadPlacesManifest(), places.loadPlacesCity({ code })]);
  // The provider has name/proximity fallbacks; they are not authoritative here.
  if (city.city.code !== code) throw new Error("Wrong commune asset");
  return { city, manifest };
}
