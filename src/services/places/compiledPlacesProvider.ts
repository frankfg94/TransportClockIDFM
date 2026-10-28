import { runNetworkTask } from "../networkScheduler";
import {
  assertCompiledPlacesCity,
  assertPlacesManifest,
  assertPlacesRanking,
  normalizeCityName,
  placeDistanceMeters,
  restoreCompiledPlaceName,
  type CompiledPlacesCityFile,
  type CompiledPlacesManifest,
  type PlacesRankingDocument,
} from "./compiledPlaces";
import {
  mergeNearbyPlaces,
  type NearbyPlace,
  type NearbyPlaceCityRef,
  type NearbyPlacesCitiesRequest,
  type NearbyPlacesRequest,
  type PlacesProvider,
} from "../../features/nearby-stations/nearbyPlaces";

const DEFAULT_BASE_PATH = "/data/places";
const MAX_CITY_CACHE_ENTRIES = 24;
const ORIGIN_GRID_CELL_METERS = 2_000;

export class CompiledPlacesUnavailableError extends Error {
  readonly code = "compiled-places-unavailable";

  constructor(message = "compiled-places-unavailable") {
    super(message);
    this.name = "CompiledPlacesUnavailableError";
  }
}

export interface CompiledPlacesAccess {
  loadPlacesManifest(signal?: AbortSignal): Promise<CompiledPlacesManifest>;
  loadPlacesCity(city: NearbyPlaceCityRef, signal?: AbortSignal): Promise<CompiledPlacesCityFile>;
  loadPlacesRanking(): Promise<PlacesRankingDocument>;
}

export type CompiledPlacesProvider = Omit<PlacesProvider, "searchNearbyCities">
  & Required<Pick<PlacesProvider, "searchNearbyCities">>
  & CompiledPlacesAccess;

export interface CompiledPlacesProviderOptions {
  fetcher?: typeof fetch;
  basePath?: string;
}

/**
 * Reads the generated public dataset lazily. The manifest is fetched once and
 * city files are kept in a bounded cache so a long line cannot grow the
 * browser heap without limit.
 */
export function createCompiledPlacesProvider(
  options: CompiledPlacesProviderOptions = {},
): CompiledPlacesProvider {
  const fetcher = options.fetcher ?? fetch;
  const basePath = (options.basePath ?? DEFAULT_BASE_PATH).replace(/\/+$/u, "");
  let manifestPromise: Promise<CompiledPlacesManifest> | undefined;
  let rankingPromise: Promise<PlacesRankingDocument> | undefined;
  const cityCache = new Map<string, Promise<CompiledPlacesCityFile>>();

  async function loadJson<T>(asset: string, validate: (value: unknown) => asserts value is T, signal?: AbortSignal): Promise<T> {
    return runNetworkTask(async (requestSignal) => {
      const response = await fetcher(assetUrl(basePath, asset), {
        headers: { accept: "application/json" }, signal: requestSignal,
      });
      if (!response.ok) throw new CompiledPlacesUnavailableError(`Places asset ${asset}: ${response.status}`);
      const payload = await response.json() as unknown;
      validate(payload);
      return payload;
    }, signal);
  }

  function loadPlacesManifest(signal?: AbortSignal): Promise<CompiledPlacesManifest> {
    if (!manifestPromise) {
      manifestPromise = loadJson("manifest.json", assertPlacesManifest, signal).catch((error) => {
        manifestPromise = undefined;
        throw error;
      });
    }
    return manifestPromise;
  }

  async function resolveCity(city: NearbyPlaceCityRef, signal?: AbortSignal): Promise<CompiledPlacesManifest["cities"][number]> {
    const manifest = await loadPlacesManifest(signal);
    if (city.code) {
      const byCode = manifest.cities.find((candidate) => candidate.code === city.code);
      if (byCode) return byCode;
    }

    const normalizedName = city.name ? normalizeCityName(city.name) : "";
    const named = normalizedName
      ? manifest.cities.filter((candidate) => normalizeCityName(candidate.name) === normalizedName)
      : [];
    if (named.length === 1) return named[0]!;
    if (named.length > 1 && Number.isFinite(city.lat) && Number.isFinite(city.lon)) {
      return nearestDescriptor(named, city)!;
    }

    if (Number.isFinite(city.lat) && Number.isFinite(city.lon)) {
      const candidates = manifest.cities.filter((candidate) => pointInBbox(city, candidate.bbox));
      if (candidates.length === 1) return candidates[0]!;
      if (candidates.length > 1) {
        const nearest = nearestDescriptor(candidates, city);
        if (nearest && candidates.filter((candidate) => distanceToCentroid(candidate, city) === distanceToCentroid(nearest, city)).length === 1) return nearest;
      }
    }

    throw new CompiledPlacesUnavailableError(`No compiled commune for ${city.name ?? city.code ?? "origin"}.`);
  }

  async function loadPlacesCity(city: NearbyPlaceCityRef, signal?: AbortSignal): Promise<CompiledPlacesCityFile> {
    const descriptor = await resolveCity(city, signal);
    const existing = cityCache.get(descriptor.code);
    if (existing) return existing;
    // Published city assets are relative to `public/data/places`. Keep
    // accepting the older nested `places/` prefix for forward-compatible
    // manifests while fetching the canonical `/data/places/{code}.json`.
    const assets = (descriptor.assetMetadata?.map((metadata) => metadata.asset)
      ?? descriptor.assets
      ?? [descriptor.asset])
      .map((asset) => asset.replace(/^places\//u, ""));
    const request = Promise.all(assets.map((asset) => loadJson(asset, assertCompiledPlacesCity, signal)))
      .then((files) => mergeCompiledPlacesCityFiles(files))
      .catch((error) => {
      cityCache.delete(descriptor.code);
      throw error;
    });
    cityCache.set(descriptor.code, request);
    while (cityCache.size > MAX_CITY_CACHE_ENTRIES) cityCache.delete(cityCache.keys().next().value as string);
    return request;
  }

  function loadPlacesRanking(): Promise<PlacesRankingDocument> {
    if (!rankingPromise) {
      rankingPromise = loadJson("places_ranking.json", assertPlacesRanking).catch((error) => {
        rankingPromise = undefined;
        throw error;
      });
    }
    return rankingPromise;
  }

  return {
    loadPlacesManifest,
    loadPlacesCity,
    loadPlacesRanking,

    async searchDestinations(): Promise<never[]> {
      return [];
    },

    async searchNearby(request: NearbyPlacesRequest, signal?: AbortSignal): Promise<NearbyPlace[]> {
      const city = await resolveCity({
        code: request.origin.code,
        name: request.origin.city,
        lat: request.origin.lat,
        lon: request.origin.lon,
      }, signal);
      const radius = clampRadius(request.radiusMeters);
      const manifest = await loadPlacesManifest(signal);
      const cities = new Map([[city.code, city], ...intersectingCities(manifest, [request.origin], radius).map((entry) => [entry.code, entry] as const)]);
      const files = await Promise.all([...cities.keys()].map((code) => loadPlacesCity({ code }, signal)));
      const grid = createOriginGrid([request.origin], radius);
      return collectNearbyPlaces(files, [request.origin], radius, signal, grid);
    },

    async searchNearbyCities(request: NearbyPlacesCitiesRequest, signal?: AbortSignal): Promise<NearbyPlace[]> {
      const cities = dedupeCityRefs(request.cities);
      if (cities.length === 0 || request.origins.length === 0) return [];
      const radius = clampRadius(request.radiusMeters);
      const manifest = await loadPlacesManifest(signal);
      const neighboringCities = intersectingCities(manifest, request.origins, radius).map((city) => ({ code: city.code }));
      const resolvedCities = await Promise.all([...cities, ...neighboringCities].map((city) => resolveCity(city, signal)));
      const cityCodes = [...new Set(resolvedCities.map((city) => city.code))];
      let completed = 0;
      request.onProgress?.(completed, cityCodes.length);
      const loadedFiles = await Promise.all(cityCodes.map(async (code) => {
        const file = await loadPlacesCity({ code }, signal);
        if (!signal?.aborted) request.onProgress?.(++completed, cityCodes.length);
        return file;
      }));
      const files = [...new Map(loadedFiles.map((file) => [file.city.code, file])).values()];
      const originGrid = createOriginGrid(request.origins, radius);
      return collectNearbyPlaces(files, request.origins, radius, signal, originGrid);
    },
  };
}

function clampRadius(radiusMeters: number): number {
  return Number.isFinite(radiusMeters) ? Math.max(0, radiusMeters) : 0;
}

function intersectingCities(
  manifest: CompiledPlacesManifest,
  origins: readonly Pick<NearbyPlace, "lon" | "lat">[],
  radius: number,
): CompiledPlacesManifest["cities"] {
  // Conservative spherical bounding boxes select assets; the final haversine
  // test below remains authoritative for membership in the displayed circle.
  const angle = radius / 6_371_000;
  const latDelta = angle * 180 / Math.PI;
  const bounds = origins.map((origin) => {
    const lonDelta = Math.asin(Math.min(1, Math.sin(angle) / Math.cos(origin.lat * Math.PI / 180))) * 180 / Math.PI;
    return [origin.lon - lonDelta, origin.lat - latDelta, origin.lon + lonDelta, origin.lat + latDelta];
  });
  return manifest.cities.filter((city) => bounds.some((box) =>
    city.bbox[0] <= box[2]! && city.bbox[2] >= box[0]!
    && city.bbox[1] <= box[3]! && city.bbox[3] >= box[1]!,
  ));
}

interface OriginGrid {
  cellSizeMeters: number;
  metersPerDegreeLat: number;
  metersPerDegreeLon: number;
  cells: Map<string, number[]>;
}

/**
 * A line can have hundreds of stations while Paris contains tens of
 * thousands of places. Indexing station origins in a small metric grid keeps
 * the static search complete without comparing every place with every stop.
 */
function createOriginGrid(
  origins: readonly Pick<NearbyPlace, "lon" | "lat">[],
  radiusMeters: number,
): OriginGrid {
  const averageLatitude = origins.length > 0
    ? origins.reduce((sum, origin) => sum + origin.lat, 0) / origins.length
    : 48.8;
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = metersPerDegreeLat * Math.max(0.2, Math.cos(averageLatitude * Math.PI / 180));
  const cellSizeMeters = Math.max(ORIGIN_GRID_CELL_METERS, radiusMeters);
  const cells = new Map<string, number[]>();
  origins.forEach((origin, index) => {
    const key = originGridKey(origin.lon, origin.lat, cellSizeMeters, metersPerDegreeLon, metersPerDegreeLat);
    const entries = cells.get(key) ?? [];
    entries.push(index);
    cells.set(key, entries);
  });
  return { cellSizeMeters, metersPerDegreeLat, metersPerDegreeLon, cells };
}

function originGridKey(
  lon: number,
  lat: number,
  cellSizeMeters: number,
  metersPerDegreeLon: number,
  metersPerDegreeLat: number,
): string {
  return `${Math.floor((lon * metersPerDegreeLon) / cellSizeMeters)}:${Math.floor((lat * metersPerDegreeLat) / cellSizeMeters)}`;
}

function nearbyOriginIndexes(
  place: Pick<NearbyPlace, "lon" | "lat">,
  grid: OriginGrid,
): number[] {
  const x = Math.floor((place.lon * grid.metersPerDegreeLon) / grid.cellSizeMeters);
  const y = Math.floor((place.lat * grid.metersPerDegreeLat) / grid.cellSizeMeters);
  const indexes: number[] = [];
  for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
    for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
      const entries = grid.cells.get(`${x + xOffset}:${y + yOffset}`);
      if (entries) indexes.push(...entries);
    }
  }
  return indexes;
}

async function collectNearbyPlaces(
  files: readonly CompiledPlacesCityFile[],
  origins: readonly Pick<NearbyPlace, "lon" | "lat">[],
  radius: number,
  signal: AbortSignal | undefined,
  grid: OriginGrid,
): Promise<NearbyPlace[]> {
  const results: NearbyPlace[][] = [];
  let sliceStarted = performance.now();
  for (const file of files) {
    results.push(await nearbyPlacesFromCity(file, origins, radius, signal, grid));
    if (performance.now() - sliceStarted >= 8) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      sliceStarted = performance.now();
    }
  }
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
  return mergeNearbyPlaces(...results);
}

async function nearbyPlacesFromCity(
  file: CompiledPlacesCityFile,
  origins: readonly Pick<NearbyPlace, "lon" | "lat">[],
  radiusMeters: number,
  signal?: AbortSignal,
  originGrid?: OriginGrid,
): Promise<NearbyPlace[]> {
  const radius = clampRadius(radiusMeters);
  const results: NearbyPlace[] = [];
  let sliceStarted = performance.now();
  let visited = 0;
  for (const place of file.places) {
    // Let pointer events, the map and cancellation run during large city scans.
    if (++visited % 128 === 0 && performance.now() - sliceStarted >= 8) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      sliceStarted = performance.now();
    }
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    let distance = Number.POSITIVE_INFINITY;
    const candidates = originGrid ? nearbyOriginIndexes(place, originGrid) : origins.map((_, index) => index);
    for (const index of candidates) {
      const origin = origins[index];
      if (origin) distance = Math.min(distance, placeDistanceMeters(origin, place));
    }
    if (distance > radius) continue;
    results.push({
      ...restoreCompiledPlaceName(place),
      cityCode: place.cityCode ?? file.city.code,
      distanceMeters: Math.round(distance),
    });
  }
  return results;
}

function mergeCompiledPlacesCityFiles(files: readonly CompiledPlacesCityFile[]): CompiledPlacesCityFile {
  const first = files[0];
  if (!first) throw new CompiledPlacesUnavailableError("Compiled commune has no asset.");
  if (files.length === 1) return first;
  const categoryCounts = files.reduce((total, file) => {
    for (const key of ["sports-leisure", "commerce", "security", "health", "culture"] as const) {
      total[key] += file.categoryCounts[key];
    }
    return total;
  }, {
    "sports-leisure": 0,
    commerce: 0,
    security: 0,
    health: 0,
    culture: 0,
  });
  const neighborhoodCommerceCounts: Record<string, number> = {};
  for (const file of files) {
    for (const [code, count] of Object.entries(file.neighborhoodCommerceCounts ?? {})) {
      neighborhoodCommerceCounts[code] = (neighborhoodCommerceCounts[code] ?? 0) + count;
    }
  }
  return {
    ...first,
    places: files.flatMap((file) => file.places),
    categoryCounts,
    ...(Object.keys(neighborhoodCommerceCounts).length > 0
      ? { neighborhoodCommerceCounts }
      : {}),
  };
}

function dedupeCityRefs(cities: readonly NearbyPlaceCityRef[]): NearbyPlaceCityRef[] {
  const seen = new Set<string>();
  return cities.filter((city) => {
    const normalizedName = normalizeCityName(city.name ?? "");
    const coordinateKey = Number.isFinite(city.lat) && Number.isFinite(city.lon)
      ? `${city.lat!.toFixed(3)}:${city.lon!.toFixed(3)}`
      : "";
    const key = city.code || `${normalizedName}:${coordinateKey}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function nearestDescriptor(
  descriptors: readonly CompiledPlacesManifest["cities"][number][],
  point: Pick<NearbyPlaceCityRef, "lat" | "lon">,
): CompiledPlacesManifest["cities"][number] | undefined {
  return descriptors
    .map((descriptor) => ({ descriptor, distance: distanceToCentroid(descriptor, point) }))
    .sort((left, right) => left.distance - right.distance || left.descriptor.code.localeCompare(right.descriptor.code))[0]?.descriptor;
}

function distanceToCentroid(
  descriptor: CompiledPlacesManifest["cities"][number],
  point: Pick<NearbyPlaceCityRef, "lat" | "lon">,
): number {
  return placeDistanceMeters(
    { lat: point.lat ?? 0, lon: point.lon ?? 0 },
    { lat: descriptor.centroid[1], lon: descriptor.centroid[0] },
  );
}

function pointInBbox(
  point: Pick<NearbyPlaceCityRef, "lat" | "lon">,
  bbox: readonly [number, number, number, number],
): boolean {
  return Number.isFinite(point.lon) && Number.isFinite(point.lat)
    && point.lon! >= bbox[0] && point.lon! <= bbox[2]
    && point.lat! >= bbox[1] && point.lat! <= bbox[3];
}

function assetUrl(basePath: string, asset: string): string {
  const safeAsset = asset.replace(/^\/+?/u, "");
  if (safeAsset.split("/").some((part) => part === ".." || part === "." || !part)) {
    throw new CompiledPlacesUnavailableError("Invalid compiled places asset path.");
  }
  return `${basePath}/${safeAsset}`;
}
