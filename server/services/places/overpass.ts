import { createError } from "h3";
import type { NearbyPlace } from "../../../src/features/nearby-stations/nearbyPlaces";
import {
  normalizeCompiledPlace,
  placeDistanceMeters,
  type OverpassElement,
} from "../../../src/services/places/compiledPlaces";

export const OVERPASS_API_ROOT = "https://overpass-api.de/api";
const OVERPASS_FALLBACK_ROOT = "https://overpass.private.coffee/api";
const REQUEST_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 120;
const USER_AGENT = "TransportClockGPT/0.1 (nearby places; OpenStreetMap Overpass)";

type OverpassResponse = { elements?: OverpassElement[] };
type CacheEntry = { expiresAt: number; request: Promise<NearbyPlace[]> };
const cache = new Map<string, CacheEntry>();

export async function loadNearbyPlaces(lat: number, lon: number, radiusMeters: number): Promise<NearbyPlace[]> {
  const radius = Math.max(100, Math.min(2_000, Math.round(radiusMeters)));
  const cacheKey = `${lat.toFixed(4)}:${lon.toFixed(4)}:${Math.round(radius / 50) * 50}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.request;

  const request = fetchOverpassPlaces(lat, lon, radius).catch((error) => {
    cache.delete(cacheKey);
    throw error;
  });
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, request });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
  return request;
}

async function fetchOverpassPlaces(lat: number, lon: number, radius: number): Promise<NearbyPlace[]> {
  try {
    return await fetchOverpassEndpoint(OVERPASS_API_ROOT, lat, lon, radius);
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode;
    if (status && status < 500 && status !== 429) throw error;
    return fetchOverpassEndpoint(OVERPASS_FALLBACK_ROOT, lat, lon, radius);
  }
}

async function fetchOverpassEndpoint(root: string, lat: number, lon: number, radius: number): Promise<NearbyPlace[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const query = buildNearbyPlacesQuery(lat, lon, radius);

  try {
    const response = await fetch(`${root}/interpreter`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": USER_AGENT,
      },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw createError({
        statusCode: response.status === 429 ? 429 : 502,
        statusMessage: response.status === 429
          ? "Overpass API rate limit reached."
          : `Overpass API failed: ${response.status} ${response.statusText}`,
      });
    }
    const payload = await response.json() as OverpassResponse;
    // Overpass can return HTTP 200 with only a runtime-error remark.
    if (!Array.isArray(payload.elements) || (payload as { remark?: string }).remark) {
      throw createError({ statusCode: 502, statusMessage: "Overpass API returned incomplete results." });
    }
    return normalizeOverpassPlaces(payload.elements, { lat, lon });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw createError({ statusCode: 504, statusMessage: "Overpass API timed out." });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function buildNearbyPlacesQuery(lat: number, lon: number, radius: number): string {
  const around = `(around:${radius},${lat},${lon})`;
  return `[out:json][timeout:20];(
    nwr${around}["name"]["shop"];
    nwr${around}["brand"]["shop"];
    nwr${around}["operator"]["shop"];
    nwr${around}["name"]["amenity"~"^(restaurant|cafe|bar|pub|fast_food|food_court|ice_cream|marketplace|pharmacy|chemist|doctors|dentist|clinic|hospital|physiotherapist|bank|post_office|post_box|parcel_locker|police|fire_station|cinema|theatre|library|public_bookcase|arts_centre|community_centre|social_centre|events_venue|conference_centre|fuel|car_wash|charging_station|car_rental|bicycle_rental|internet_cafe|sauna|public_bath|school|kindergarten|nursery|childcare|college|university|language_school|music_school|driving_school)$"];
    nwr${around}["name"]["tourism"~"^(museum|attraction|gallery|viewpoint|artwork|zoo|aquarium|theme_park|amusement_park|picnic_site)$"];
    nwr${around}["name"]["leisure"~"^(sports_centre|sports_hall|pitch|stadium|fitness_centre|swimming_pool|track|golf_course|miniature_golf|disc_golf|ice_rink|horse_riding|recreation_ground|playground|park|garden|nature_reserve|dog_park|water_park|sauna|picnic_table)$"];
    nwr${around}["leisure"~"^(sports_centre|sports_hall|pitch|stadium|fitness_centre|swimming_pool|track|golf_course|miniature_golf|disc_golf|ice_rink|horse_riding|recreation_ground)$"];
    nwr${around}["name"]["place"~"^(square|park)$"];
    nwr${around}["sport"];
    nwr${around}["club"~"^(sport|sports|tennis)$"];
    nwr${around}["name"]["office"~"^(estate_agent|lawyer|notary|accountant|insurance|travel_agent|employment_agency|educational_institution|government|association|charity|ngo|research|coworking)$"];
    nwr${around}["name"]["craft"~"^(locksmith|shoemaker|tailor|dressmaker|computer_repair|photographer|key_cutter|carpenter|electrician|plumber|pottery|jeweller|upholsterer|beekeeper)$"];
    nwr${around}["name"]["healthcare"];
  );out center tags qt;`;
}

export function normalizeOverpassPlaces(
  elements: readonly OverpassElement[],
  origin: { lat: number; lon: number },
): NearbyPlace[] {
  const places = elements.flatMap((element): NearbyPlace[] => {
    const normalized = normalizeCompiledPlace(element);
    if (!normalized) return [];
    return [{
      ...normalized,
      distanceMeters: Math.round(placeDistanceMeters(origin, normalized)),
    }];
  });

  const unique = new Map<string, NearbyPlace>();
  for (const place of places.sort((left, right) => left.distanceMeters - right.distanceMeters)) {
    const key = `${normalizeName(place.name)}:${place.lat.toFixed(5)}:${place.lon.toFixed(5)}`;
    if (!unique.has(key)) unique.set(key, place);
  }
  return [...unique.values()];
}

function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}
