import type {
  GeocoderPlaceCategory,
  GeocoderPoint,
} from "../../features/transport-map/contracts/geocoder.js";

export const PLACES_DATA_SCHEMA_VERSION = 1 as const;
export const PLACES_DATASET_ID = "osm-places-by-commune" as const;
export const PLACES_DATA_ATTRIBUTION = "© OpenStreetMap contributors" as const;
export const PLACES_DATA_LICENSE = "ODbL" as const;
/** Cloudflare Pages' maximum uncompressed size for one static asset. */
export const MAX_PLACES_ASSET_BYTES = 25 * 1024 * 1024;
/** Leave headroom for Pages/proxy limits and split a city before this size. */
export const TARGET_PLACES_ASSET_BYTES = 24 * 1024 * 1024;

export const PLACES_RANKING_CATEGORY_IDS = [
  "sports-leisure",
  "commerce",
  "security",
  "health",
  "culture",
] as const;

export type PlacesRankingCategory = typeof PLACES_RANKING_CATEGORY_IDS[number];
export type PlacesDatasetScope = "idf" | "france";

export type CompiledPlaceGenericNameKey =
  | "nearbyStations.genericPlaceNames.tennisCourt"
  | "nearbyStations.genericPlaceNames.sportsField"
  | "nearbyStations.genericPlaceNames.sportsCentre"
  | "nearbyStations.genericPlaceNames.sportsClub"
  | "nearbyStations.genericPlaceNames.sportsFacility";

export type OverpassElement = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

export const OSM_PLACE_TAG_FAMILIES = {
  shop: "shop",
  amenity: "amenity",
  tourism: "tourism",
  leisure: "leisure",
  sport: "sport",
  club: "club",
  office: "office",
  craft: "craft",
  healthcare: "healthcare",
  place: "place",
} as const;

// Keep the raw classification and presentation tags that are useful to the
// nearby-place UI. Name and address metadata are promoted to first-class
// fields below, so repeating them in every `tags` object would waste most of
// the static asset budget. Opening hours and websites remain raw because they
// are useful place details.
export const OSM_PRESERVED_TAG_KEYS = new Set([
  "brand",
  "operator",
  "shop",
  "amenity",
  "tourism",
  "leisure",
  "sport",
  "place",
  "club",
  "office",
  "craft",
  "healthcare",
  "healthcare:speciality",
  "cuisine",
  "website",
  "opening_hours",
  "wheelchair",
]);

/**
 * OSM amenities that represent a commercial food venue. Keep this list next
 * to the compiler classification so every consumer can use the same rule,
 * including legacy records whose rankingCategory was not persisted.
 */
const OSM_COMMERCE_AMENITIES: ReadonlySet<string> = new Set([
  "restaurant",
  "cafe",
  "bar",
  "pub",
  "fast_food",
  "food_court",
  "ice_cream",
  "marketplace",
]);

export interface CompiledPlaceRecord {
  id: string;
  name: string;
  genericNameKey?: CompiledPlaceGenericNameKey;
  brand?: string;
  operator?: string;
  lon: number;
  lat: number;
  category: GeocoderPlaceCategory;
  kind: string;
  rankingCategory?: PlacesRankingCategory;
  address?: string;
  city?: string;
  cityCode?: string;
  tags?: Record<string, string>;
}

export type PlaceCategoryCounts = Record<PlacesRankingCategory, number>;

export interface PlaceCityDescriptor {
  code: string;
  name: string;
  departmentCode: string;
  bbox: [number, number, number, number];
  centroid: [number, number];
  asset: string;
  /** All assets for the commune; `asset` remains the first/legacy asset. */
  assets?: string[];
  /** Per-file checksums and counts, present for newly compiled datasets. */
  assetMetadata?: PlaceAssetMetadata[];
  bytes: number;
  checksumSha256: string;
  /** Total bytes across all chunks when a commune is split. */
  totalBytes?: number;
  placeCount: number;
  categoryCounts: PlaceCategoryCounts;
  neighborhoodCommerceCount: number;
}

export interface PlaceAssetMetadata {
  asset: string;
  bytes: number;
  checksumSha256: string;
  placeCount: number;
}

export interface CompiledPlacesCityFile {
  schemaVersion: typeof PLACES_DATA_SCHEMA_VERSION;
  datasetId: typeof PLACES_DATASET_ID;
  generatedAt: string;
  scope: PlacesDatasetScope;
  city: Omit<PlaceCityDescriptor, "asset" | "assets" | "assetMetadata" | "bytes" | "checksumSha256" | "totalBytes" | "placeCount" | "categoryCounts" | "neighborhoodCommerceCount">;
  places: CompiledPlaceRecord[];
  categoryCounts: PlaceCategoryCounts;
  neighborhoodCommerceCounts?: Record<string, number>;
}

export interface PlacesManifestUnassigned {
  asset: string;
  count: number;
  checksumSha256: string;
  bytes: number;
}

export interface CompiledPlacesManifest {
  schemaVersion: typeof PLACES_DATA_SCHEMA_VERSION;
  datasetId: typeof PLACES_DATASET_ID;
  generatedAt: string;
  scope: PlacesDatasetScope;
  attribution: typeof PLACES_DATA_ATTRIBUTION;
  license: typeof PLACES_DATA_LICENSE;
  normalizationVersion: string;
  source: {
    provider: "OpenStreetMap";
    overpassEndpoint: string;
    overpassImage: string;
    boundaryUrl: string;
    boundarySha256: string;
  };
  cities: PlaceCityDescriptor[];
  ranking: {
    asset: "places_ranking.json";
    scope: "idf";
    cityCount: number;
    categories: readonly PlacesRankingCategory[];
    bytes?: number;
    checksumSha256?: string;
  };
  unassigned: PlacesManifestUnassigned;
  totals: {
    cities: number;
    places: number;
    unassigned: number;
    categoryCounts: PlaceCategoryCounts;
  };
}

export interface PlacesRankingBucket {
  count: number;
  rank: number;
  topPercent: number;
  scorePercent: number;
  /** Position among the communes in the same department. */
  departmentRank?: number;
  departmentCityCount?: number;
  departmentTopPercent?: number;
  /** Position in the local comparison zone (petite couronne or Paris). */
  regionalScope?: "petite-couronne" | "paris-intramuros";
  regionalRank?: number;
  regionalCityCount?: number;
  regionalTopPercent?: number;
}

export interface PlacesDepartmentLeaderboardEntry {
  departmentCode: string;
  cityCount: number;
  placeCount: number;
  rank: number;
  topPercent: number;
}

export interface PlacesRankingCity {
  code: string;
  name: string;
  departmentCode: string;
  categories: Record<PlacesRankingCategory, PlacesRankingBucket>;
}

export interface PlacesRankingDocument {
  schemaVersion: typeof PLACES_DATA_SCHEMA_VERSION;
  datasetId: typeof PLACES_DATASET_ID;
  generatedAt: string;
  scope: "idf";
  categories: readonly PlacesRankingCategory[];
  cityCount: number;
  cities: PlacesRankingCity[];
  /** Department totals used by the modal's hover leaderboard. */
  departmentLeaderboards?: Record<PlacesRankingCategory, PlacesDepartmentLeaderboardEntry[]>;
}

export function emptyPlaceCategoryCounts(): PlaceCategoryCounts {
  return {
    "sports-leisure": 0,
    commerce: 0,
    security: 0,
    health: 0,
    culture: 0,
  };
}

export function countPlaceCategories(places: readonly Pick<CompiledPlaceRecord, "rankingCategory">[]): PlaceCategoryCounts {
  const counts = emptyPlaceCategoryCounts();
  for (const place of places) {
    if (place.rankingCategory) counts[place.rankingCategory] += 1;
  }
  return counts;
}

export function normalizePlaceKind(tags: Record<string, string>): string {
  for (const key of ["shop", "amenity", "tourism", "sport", "leisure", "place", "club", "office", "craft", "healthcare"]) {
    const value = firstTagValue(tags[key]);
    if (value) return value;
  }
  return "place";
}

export function classifyPlaceCategory(tags: Record<string, string>): GeocoderPlaceCategory {
  const amenity = firstTagValue(tags.amenity);
  const tourism = firstTagValue(tags.tourism);
  if (firstTagValue(tags.shop)) return "shop";
  if (OSM_COMMERCE_AMENITIES.has(amenity ?? "")) {
    return "food";
  }
  if (
    ["cinema", "theatre", "library", "public_bookcase", "arts_centre", "community_centre", "social_centre", "events_venue", "conference_centre"].includes(amenity ?? "")
    || ["museum", "gallery"].includes(tourism ?? "")
  ) {
    return "culture";
  }
  if (tourism || tags.leisure || tags.sport || tags.club || tags.place === "square" || tags.place === "park") {
    return "attraction";
  }
  return "service";
}

export function classifyPlacesRankingCategory(tags: Record<string, string>): PlacesRankingCategory | undefined {
  const amenity = firstTagValue(tags.amenity);
  const tourism = firstTagValue(tags.tourism);
  if (firstTagValue(tags.shop) || firstTagValue(tags.craft) || OSM_COMMERCE_AMENITIES.has(amenity ?? "")) return "commerce";
  if (
    tags.sport || tags.leisure || tags.club
    || ["zoo", "aquarium", "theme_park", "amusement_park", "picnic_site"].includes(tourism ?? "")
  ) return "sports-leisure";
  if (["police", "fire_station"].includes(amenity ?? "")) return "security";
  if (
    tags.healthcare
    || ["pharmacy", "chemist", "doctors", "dentist", "clinic", "hospital", "physiotherapist"].includes(amenity ?? "")
  ) return "health";
  if (
    ["cinema", "theatre", "library", "public_bookcase", "arts_centre", "community_centre", "social_centre", "events_venue", "conference_centre"].includes(amenity ?? "")
    || ["museum", "gallery", "artwork"].includes(tourism ?? "")
  ) return "culture";
  return undefined;
}

export function genericPlaceNameKey(
  tags: Record<string, string>,
): CompiledPlaceGenericNameKey | undefined {
  const sport = normalizePlaceKindFromValue(tags.sport);
  const leisure = normalizePlaceKindFromValue(tags.leisure);
  const club = normalizePlaceKindFromValue(tags.club);
  if (sport === "tennis" || leisure === "tennis" || club === "tennis") return "nearbyStations.genericPlaceNames.tennisCourt";
  if (leisure === "pitch") return "nearbyStations.genericPlaceNames.sportsField";
  if (leisure === "sports_centre" || leisure === "sports_hall") return "nearbyStations.genericPlaceNames.sportsCentre";
  if (club === "sport" || club === "sports") return "nearbyStations.genericPlaceNames.sportsClub";
  if (sport || club || [
    "pitch",
    "sports_centre",
    "sports_hall",
    "stadium",
    "fitness_centre",
    "swimming_pool",
    "track",
    "golf_course",
    "miniature_golf",
    "disc_golf",
    "ice_rink",
    "horse_riding",
    "recreation_ground",
    "playground",
    "water_park",
  ].includes(leisure ?? "")) return "nearbyStations.genericPlaceNames.sportsFacility";
  return undefined;
}

export function normalizeCompiledPlace(
  element: OverpassElement,
  cityCode?: string,
): CompiledPlaceRecord | undefined {
  if (element.id === undefined) return undefined;
  const lat = finiteCoordinate(element.lat ?? element.center?.lat);
  const lon = finiteCoordinate(element.lon ?? element.center?.lon);
  if (lat === undefined || lon === undefined) return undefined;
  const tags = element.tags ?? {};
  const kind = normalizePlaceKind(tags);
  const name = firstTagValue(tags.name, tags.brand, tags.operator) ?? "";
  const genericNameKey = genericPlaceNameKey(tags);
  const rankingCategory = classifyPlacesRankingCategory(tags);
  const preservedTags = Object.fromEntries(
    Object.entries(tags).filter(([key, value]) => OSM_PRESERVED_TAG_KEYS.has(key) && typeof value === "string"),
  );
  const address = formatAddress(tags);
  return {
    id: `${element.type ?? "element"}:${element.id}`,
    name,
    ...(genericNameKey ? { genericNameKey } : {}),
    ...(firstTagValue(tags.brand) ? { brand: firstTagValue(tags.brand) } : {}),
    ...(firstTagValue(tags.operator) ? { operator: firstTagValue(tags.operator) } : {}),
    lon,
    lat,
    category: classifyPlaceCategory(tags),
    kind,
    ...(rankingCategory ? { rankingCategory } : {}),
    ...(address ? { address } : {}),
    ...(firstTagValue(tags["addr:city"]) ? { city: firstTagValue(tags["addr:city"]) } : {}),
    ...(cityCode ? { cityCode } : {}),
    tags: preservedTags,
  };
}

/**
 * Repairs records produced by an older publisher which kept the OSM name in
 * `tags.name` (or exposed it as `label`) instead of the promoted `name`
 * field. New files already contain `name`, so this is a zero-copy fast path.
 */
export function restoreCompiledPlaceName(place: CompiledPlaceRecord): CompiledPlaceRecord {
  const candidate = place as CompiledPlaceRecord & { label?: unknown };
  const tags = place.tags ?? {};
  const name = firstTagValue(
    candidate.name,
    candidate.label,
    tags.name,
    place.brand,
    tags.brand,
    place.operator,
    tags.operator,
  ) ?? "";
  return name === place.name ? place : { ...place, name };
}

export function buildOverpassBboxQuery(
  bbox: readonly [number, number, number, number],
  timeoutSeconds = 180,
): string {
  const [west, south, east, north] = bbox;
  const queryBbox = `${south},${west},${north},${east}`;
  return `[out:json][timeout:${Math.max(30, Math.round(timeoutSeconds))}];(
    nwr["shop"](${queryBbox});
    nwr["amenity"](${queryBbox});
    nwr["tourism"](${queryBbox});
    nwr["leisure"](${queryBbox});
    nwr["sport"](${queryBbox});
    nwr["club"](${queryBbox});
    nwr["office"](${queryBbox});
    nwr["craft"](${queryBbox});
    nwr["healthcare"](${queryBbox});
    nwr["place"~"^(square|park)$"](${queryBbox});
  );out center tags qt;`;
}

export function normalizeCityName(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr-FR").replace(/[^\p{Letter}\p{Number}]+/gu, " ").trim();
}

export function placeDistanceMeters(
  left: Pick<GeocoderPoint, "lat" | "lon">,
  right: Pick<GeocoderPoint, "lat" | "lon">,
): number {
  const toRadians = (value: number) => value * Math.PI / 180;
  const earthRadius = 6_371_000;
  const deltaLat = toRadians(right.lat - left.lat);
  const deltaLon = toRadians(right.lon - left.lon);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(left.lat)) * Math.cos(toRadians(right.lat)) * Math.sin(deltaLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function firstTagValue(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function normalizePlaceKindFromValue(value: string | undefined): string | undefined {
  return firstTagValue(value)?.split(/[;,]/u, 1)[0]?.trim() || undefined;
}

function finiteCoordinate(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatAddress(tags: Record<string, string>): string {
  return [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:city"],
  ].filter(Boolean).join(", ");
}

export function assertPlacesManifest(value: unknown): asserts value is CompiledPlacesManifest {
  if (!value || typeof value !== "object") throw new Error("Places manifest is not an object.");
  const manifest = value as Partial<CompiledPlacesManifest>;
  if (manifest.schemaVersion !== PLACES_DATA_SCHEMA_VERSION || manifest.datasetId !== PLACES_DATASET_ID) {
    throw new Error("Unsupported places dataset schema.");
  }
  if (!manifest.generatedAt || (manifest.scope !== "idf" && manifest.scope !== "france") || !Array.isArray(manifest.cities)) {
    throw new Error("Places manifest metadata is incomplete.");
  }
  if (manifest.ranking?.asset !== "places_ranking.json" || manifest.ranking.scope !== "idf") {
    throw new Error("Places ranking metadata is invalid.");
  }
  if (!manifest.unassigned || typeof manifest.unassigned.count !== "number" || !manifest.unassigned.asset) {
    throw new Error("Places unassigned metadata is invalid.");
  }
  for (const city of manifest.cities) assertCityDescriptor(city);
}

export function assertCompiledPlacesCity(value: unknown): asserts value is CompiledPlacesCityFile {
  if (!value || typeof value !== "object") throw new Error("Compiled city places file is not an object.");
  const city = value as Partial<CompiledPlacesCityFile>;
  if (city.schemaVersion !== PLACES_DATA_SCHEMA_VERSION || city.datasetId !== PLACES_DATASET_ID || !city.generatedAt || !city.city?.code || !Array.isArray(city.places)) {
    throw new Error("Compiled city places metadata is incomplete.");
  }
  if (!city.categoryCounts || !isFiniteCategoryCounts(city.categoryCounts)) throw new Error(`Invalid category counts for ${city.city.code}.`);
  for (const place of city.places) {
    const legacyPlace = place as CompiledPlaceRecord & { label?: unknown };
    const hasRecoverableName = firstTagValue(
      legacyPlace.name,
      legacyPlace.label,
      legacyPlace.tags?.name,
      legacyPlace.brand,
      legacyPlace.tags?.brand,
      legacyPlace.operator,
      legacyPlace.tags?.operator,
    ) !== undefined;
    if (!place.id || (typeof place.name !== "string" && !hasRecoverableName) || !Number.isFinite(place.lat) || !Number.isFinite(place.lon) || !place.kind || (place.cityCode !== undefined && place.cityCode !== city.city.code) || !place.tags) {
      throw new Error(`Invalid place record in ${city.city.code}.`);
    }
  }
}

export function assertPlacesRanking(value: unknown): asserts value is PlacesRankingDocument {
  if (!value || typeof value !== "object") throw new Error("Places ranking is not an object.");
  const ranking = value as Partial<PlacesRankingDocument>;
  if (ranking.schemaVersion !== PLACES_DATA_SCHEMA_VERSION || ranking.datasetId !== PLACES_DATASET_ID || ranking.scope !== "idf" || !Array.isArray(ranking.cities) || ranking.cityCount !== ranking.cities.length) {
    throw new Error("Places ranking metadata is invalid.");
  }
  for (const city of ranking.cities) {
    if (!city.code || !city.name || !city.categories) throw new Error("Places ranking city is incomplete.");
    for (const category of PLACES_RANKING_CATEGORY_IDS) {
      const bucket = city.categories[category];
      if (!bucket || !Number.isInteger(bucket.count) || bucket.count < 0 || !Number.isInteger(bucket.rank) || bucket.rank < 1 || !Number.isInteger(bucket.topPercent) || bucket.topPercent < 1 || bucket.topPercent > 100 || !Number.isFinite(bucket.scorePercent)) {
        throw new Error(`Invalid ${category} ranking for ${city.code}.`);
      }
      if (bucket.departmentRank !== undefined || bucket.departmentCityCount !== undefined || bucket.departmentTopPercent !== undefined) {
        if (!isValidRankingPosition(bucket.departmentRank, bucket.departmentCityCount, bucket.departmentTopPercent)) {
          throw new Error(`Invalid department ${category} ranking for ${city.code}.`);
        }
      }
      if (bucket.regionalScope !== undefined || bucket.regionalRank !== undefined || bucket.regionalCityCount !== undefined || bucket.regionalTopPercent !== undefined) {
        if (bucket.regionalScope !== "petite-couronne" && bucket.regionalScope !== "paris-intramuros") {
          throw new Error(`Invalid regional ${category} ranking for ${city.code}.`);
        }
        if (!isValidRankingPosition(bucket.regionalRank, bucket.regionalCityCount, bucket.regionalTopPercent)) {
          throw new Error(`Invalid regional ${category} ranking for ${city.code}.`);
        }
      }
    }
  }
  if (ranking.departmentLeaderboards !== undefined) {
    for (const category of PLACES_RANKING_CATEGORY_IDS) {
      const entries = ranking.departmentLeaderboards[category];
      if (!Array.isArray(entries)) throw new Error(`Invalid ${category} department leaderboard.`);
      for (const entry of entries) {
        if (!entry || !/^\d{2,3}$/u.test(entry.departmentCode) || !Number.isInteger(entry.cityCount) || entry.cityCount < 1 || !Number.isInteger(entry.placeCount) || entry.placeCount < 0 || !Number.isInteger(entry.rank) || entry.rank < 1 || !Number.isInteger(entry.topPercent) || entry.topPercent < 1 || entry.topPercent > 100) {
          throw new Error(`Invalid ${category} department leaderboard entry.`);
        }
      }
    }
  }
}

function isValidRankingPosition(rank: unknown, denominator: unknown, topPercent: unknown): boolean {
  return Number.isInteger(rank) && (rank as number) >= 1
    && Number.isInteger(denominator) && (denominator as number) >= 1
    && Number.isInteger(topPercent) && (topPercent as number) >= 1 && (topPercent as number) <= 100
    && (rank as number) <= (denominator as number);
}

function assertCityDescriptor(value: unknown): asserts value is PlaceCityDescriptor {
  if (!value || typeof value !== "object") throw new Error("Places city descriptor is invalid.");
  const city = value as Partial<PlaceCityDescriptor>;
  if (!city.code || !city.name || !city.asset || !/^[A-Za-z0-9_-]+\.json$/u.test(city.asset.split("/").at(-1) ?? "") || typeof city.placeCount !== "number" || !Number.isInteger(city.placeCount) || city.placeCount < 0 || !isFiniteCategoryCounts(city.categoryCounts)) {
    throw new Error(`Invalid places city descriptor ${city.code ?? "unknown"}.`);
  }
  const assets = city.assets ?? [city.asset];
  if (!Array.isArray(assets) || assets.length === 0 || assets.some((asset) => typeof asset !== "string" || !isSafeAssetName(asset))) {
    throw new Error(`Invalid places city assets ${city.code}.`);
  }
  if (city.assetMetadata !== undefined) {
    if (!Array.isArray(city.assetMetadata) || city.assetMetadata.length !== assets.length) {
      throw new Error(`Invalid places city asset metadata ${city.code}.`);
    }
    for (const metadata of city.assetMetadata) {
      if (!metadata || !isSafeAssetName(metadata.asset) || !Number.isInteger(metadata.bytes) || metadata.bytes < 0 || !/^[a-f0-9]{64}$/u.test(metadata.checksumSha256) || !Number.isInteger(metadata.placeCount) || metadata.placeCount < 0) {
        throw new Error(`Invalid places city asset metadata ${city.code}.`);
      }
    }
  }
  if (city.totalBytes !== undefined && (!Number.isInteger(city.totalBytes) || city.totalBytes < 0)) {
    throw new Error(`Invalid places city total bytes ${city.code}.`);
  }
}

function isSafeAssetName(asset: string): boolean {
  return /^[A-Za-z0-9_-]+\.json$/u.test(asset.split("/").at(-1) ?? "")
    && !asset.split("/").some((part) => part === ".." || part === "." || part.length === 0);
}

function isFiniteCategoryCounts(value: unknown): value is PlaceCategoryCounts {
  if (!value || typeof value !== "object") return false;
  return PLACES_RANKING_CATEGORY_IDS.every((category) => {
    const count = (value as Record<string, unknown>)[category];
    return Number.isInteger(count) && (count as number) >= 0;
  });
}
