import { createError, getRequestURL, type H3Event } from "h3";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertCompiledPlacesCity, assertPlacesManifest,
  type CompiledPlacesCityFile, type CompiledPlacesManifest, type CompiledPlaceRecord,
} from "../../../src/services/places/compiledPlaces";
import { fetchBufferedWithTimeout } from "../idfm/boundedFetch";

// Store completed data only. No pending I/O from a previous Worker invocation.
const cache = new Map<string, { value: unknown; expiresAt: number }>();
const MAX_CACHE_ENTRIES = 64;

export async function readCompiledPlacesAsset<T>(event: H3Event, asset: string, validate: (value: unknown) => asserts value is T): Promise<T> {
  const safeAsset = asset.replace(/^places\//u, "");
  if (!/^[\w.-]+\.json$/u.test(safeAsset)) throw createError({ statusCode: 502, statusMessage: "Invalid compiled places asset." });
  const key = `${getRequestURL(event).origin}:${safeAsset}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  const assets = (event.context as { cloudflare?: { env?: { ASSETS?: { fetch(request: Request): Promise<Response> } } } }).cloudflare?.env?.ASSETS;
  let value: unknown;
  try {
    if (assets) {
      const response = await fetchBufferedWithTimeout(new URL(`/data/places/${safeAsset}`, getRequestURL(event)), {},
        (input, init) => assets.fetch(new Request(input, init)), 12_000);
      if (!response.ok) throw new Error(`asset-${response.status}`);
      value = await response.json();
    } else {
      value = JSON.parse(await readFile(resolve(process.cwd(), "public/data/places", safeAsset), "utf8"));
    }
    validate(value);
  } catch (cause) {
    throw createError({ statusCode: 503, statusMessage: "Compiled places dataset unavailable.", cause });
  }
  cache.set(key, { value, expiresAt: Date.now() + 60_000 });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  return value;
}

export async function loadCompiledPlacesAround(event: H3Event, lat: number, lon: number, radiusMeters: number) {
  const manifest = await readCompiledPlacesAsset<CompiledPlacesManifest>(event, "manifest.json", assertPlacesManifest);
  if (manifest.commercial) {
    const index = await readCompiledPlacesAsset(event, manifest.commercial.asset, assertCommercialIndex);
    return index.places;
  }
  const latDelta = radiusMeters / 111_000;
  const lonDelta = latDelta / Math.cos((Math.abs(lat) + latDelta) * Math.PI / 180);
  const cities = manifest.cities.filter(({ bbox: [west, south, east, north] }) =>
    west <= lon + lonDelta && east >= lon - lonDelta && south <= lat + latDelta && north >= lat - latDelta);
  if (cities.length === 0) throw createError({ statusCode: 503, statusMessage: "No compiled places coverage for this location." });
  const places = new Map<string, CompiledPlacesCityFile["places"][number]>();
  for (let index = 0; index < cities.length; index += 4) {
    const files = await Promise.all(cities.slice(index, index + 4).flatMap((city) =>
      (city.assetMetadata?.map(({ asset }) => asset) ?? city.assets ?? [city.asset]).map((asset) =>
        readCompiledPlacesAsset<CompiledPlacesCityFile>(event, asset, assertCompiledPlacesCity))));
    for (const file of files) for (const place of file.places) places.set(place.id, place);
  }
  return [...places.values()];
}

function assertCommercialIndex(value: unknown): asserts value is { places: CompiledPlaceRecord[] } {
  const index = value as { schemaVersion?: number; datasetId?: string; places?: CompiledPlaceRecord[] };
  if (!index || index.schemaVersion !== 1 || index.datasetId !== "osm-places-by-commune" || !Array.isArray(index.places)) {
    throw new Error("Invalid compiled commercial index");
  }
  if (index.places.some((place) => !place.id || typeof place.name !== "string" || !place.kind
    || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)
    || (place.areaM2 !== undefined && !(Number.isFinite(place.areaM2) && place.areaM2 > 0)))) {
    throw new Error("Invalid commercial place record");
  }
}
