import { createError } from "h3";
import type { NearbyPlace, NearbyPlaceCategory } from "../../../src/features/nearby-stations/nearbyPlaces";

export const OVERPASS_API_ROOT = "https://overpass-api.de/api";
const REQUEST_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 120;
const MAX_NEARBY_PLACES = 160;
const USER_AGENT = "TransportClockGPT/0.1 (nearby places; OpenStreetMap Overpass)";

type OverpassElement = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const query = buildNearbyPlacesQuery(lat, lon, radius);

  try {
    const response = await fetch(`${OVERPASS_API_ROOT}/interpreter`, {
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
      throw createError({
        statusCode: response.status === 429 ? 429 : 502,
        statusMessage: response.status === 429
          ? "Overpass API rate limit reached."
          : `Overpass API failed: ${response.status} ${response.statusText}`,
      });
    }
    const payload = await response.json() as OverpassResponse;
    return normalizeOverpassPlaces(payload.elements ?? [], { lat, lon }).slice(0, MAX_NEARBY_PLACES);
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
    nwr${around}["name"]["place"~"^(square|park)$"];
    nwr${around}["name"]["sport"];
    nwr${around}["name"]["club"~"^(sport|sports|tennis)$"];
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
    const tags = element.tags ?? {};
    const name = firstTagValue(tags.name, tags.brand, tags.operator);
    const lat = finiteCoordinate(element.lat ?? element.center?.lat);
    const lon = finiteCoordinate(element.lon ?? element.center?.lon);
    if (!name || lat === undefined || lon === undefined || element.id === undefined) return [];
    const kind = normalizePlaceKind(firstTagValue(
      tags.shop,
      tags.amenity,
      tags.tourism,
      tags.sport,
      tags.leisure,
      tags.place,
      tags.club,
      tags.office,
      tags.craft,
      tags.healthcare,
    )) ?? "place";
    return [{
      id: `${element.type ?? "element"}:${element.id}`,
      name,
      brand: firstTagValue(tags.brand) || undefined,
      operator: firstTagValue(tags.operator) || undefined,
      lat,
      lon,
      category: placeCategory(tags),
      kind,
      distanceMeters: Math.round(haversineMeters(origin, { lat, lon })),
      address: formatAddress(tags) || undefined,
      city: tags["addr:city"]?.trim() || undefined,
    }];
  });

  const unique = new Map<string, NearbyPlace>();
  for (const place of places.sort((left, right) => left.distanceMeters - right.distanceMeters)) {
    const key = `${normalizeName(place.name)}:${place.lat.toFixed(5)}:${place.lon.toFixed(5)}`;
    if (!unique.has(key)) unique.set(key, place);
  }
  return [...unique.values()];
}

function firstTagValue(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function normalizePlaceKind(value: string | undefined): string | undefined {
  return value?.split(/[;,]/u, 1)[0]?.trim() || undefined;
}

function placeCategory(tags: Record<string, string>): NearbyPlaceCategory {
  if (tags.shop) return "shop";
  if (["restaurant", "cafe", "bar", "fast_food", "marketplace"].includes(tags.amenity ?? "")) return "food";
  if (["cinema", "theatre", "library", "arts_centre", "community_centre", "social_centre"].includes(tags.amenity ?? "") || ["museum", "gallery"].includes(tags.tourism ?? "")) return "culture";
  if (tags.tourism || tags.leisure || tags.sport || tags.club || tags.place === "square" || tags.place === "park") return "attraction";
  return "service";
}

function formatAddress(tags: Record<string, string>): string {
  return [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:city"],
  ].filter(Boolean).join(", ");
}

function finiteCoordinate(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function haversineMeters(left: { lat: number; lon: number }, right: { lat: number; lon: number }): number {
  const toRadians = (value: number) => value * Math.PI / 180;
  const earthRadius = 6_371_000;
  const deltaLat = toRadians(right.lat - left.lat);
  const deltaLon = toRadians(right.lon - left.lon);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(left.lat)) * Math.cos(toRadians(right.lat)) * Math.sin(deltaLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
