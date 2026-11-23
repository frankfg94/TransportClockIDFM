import { computed, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from "vue";
import type { TranslationKey } from "../../i18n";
import type { NearbyPlace } from "./nearbyPlaces";
import {
  isNearbyPlaceCommerce,
  nearbyPlaceDisplayName,
  nearbyPlaceMarkerColor,
  nearbyPlaceMarkerIconId,
  nearbyPlaceTypeKey,
  resolveNearbyPlaceGroupId,
  type NearbyPlaceGroupId,
  type NearbyPlaceMarkerIconId,
} from "./nearbyPlacePresentation";
import {
  normalizeCityName,
  placeDistanceMeters,
  restoreCompiledPlaceName,
  type CompiledPlaceRecord,
  type CompiledPlacesManifest,
} from "../../services/places/compiledPlaces";
import { createCompiledPlacesProvider, type CompiledPlacesAccess } from "../../services/places/compiledPlacesProvider";
import { placesCityCode } from "./neighborhood-comparison/geometry";

export interface CityCommerceOrigin {
  lat: number;
  lon: number;
  city?: string;
  code?: string;
}

export interface CityCommercePoint {
  id: string;
  lon: number;
  lat: number;
  name: string;
  category: NearbyPlace["category"];
  groupId: NearbyPlaceGroupId;
  iconId: NearbyPlaceMarkerIconId;
  color: string;
  typeKey: TranslationKey;
}

export interface CityCommerceLegendCategory {
  /** Stable identity for one visible place type, rather than a broad category. */
  id: string;
  labelKey: TranslationKey;
  iconId: NearbyPlaceMarkerIconId;
  color: string;
  count: number;
}

export interface CityCommerceSnapshot {
  /** Canonical commune plus the exact compiled dataset generation. */
  key: string;
  commune: { code: string; name: string; bbox: readonly [number, number, number, number] };
  dataset: {
    id: string;
    version: string;
    generatedAt: string;
    schemaVersion: number;
    normalizationVersion: string;
    attribution: string;
    license: string;
  };
  /** Full, normalized inventory used by the interactive city view. */
  places: readonly Omit<NearbyPlace, "distanceMeters">[];
  /** Exactly the commerce subset shown by the city's commerce switch. */
  commerces: readonly CityCommercePoint[];
  categories: readonly CityCommerceLegendCategory[];
  recordedTotal: number;
  mappedTotal: number;
  unmappedTotal: number;
  neighborhoodCommerceCounts: Readonly<Record<string, number>>;
}

export type CityCommerceSnapshotStatus = "idle" | "loading" | "ready" | "unavailable";

const sharedProvider = createCompiledPlacesProvider();
const snapshots = new Map<string, Promise<CityCommerceSnapshot>>();
const MAX_SNAPSHOTS = 8;

/**
 * Load and normalize one compiled commune inventory. Requests are keyed by the
 * canonical commune and catalogue generation, shared between mounted views,
 * and deliberately have no view-owned AbortSignal: unmounting one consumer
 * cannot cancel another consumer's read.
 */
export async function loadCityCommerceSnapshot(
  origin: CityCommerceOrigin,
  access: Pick<CompiledPlacesAccess, "loadPlacesManifest" | "loadPlacesCity"> = sharedProvider,
): Promise<CityCommerceSnapshot> {
  const manifest = await access.loadPlacesManifest();
  const descriptor = resolveCommuneDescriptor(manifest, origin);
  if (!descriptor) throw new Error("No compiled commune covers this address.");
  const datasetVersion = [manifest.schemaVersion, manifest.datasetId, manifest.generatedAt, manifest.normalizationVersion].join(":");
  const key = `${descriptor.code}|${datasetVersion}`;
  const cached = snapshots.get(key);
  if (cached) return cached;

  const pending = (async () => {
    const cityFile = await access.loadPlacesCity({ code: descriptor.code });
    if (cityFile.city.code !== descriptor.code) throw new Error("Compiled places returned a different commune.");
    return createSnapshot(cityFile.places, cityFile.neighborhoodCommerceCounts ?? {}, descriptor, manifest, key, datasetVersion);
  })();
  snapshots.set(key, pending);
  while (snapshots.size > MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value!);
  try {
    return await pending;
  } catch (error) {
    if (snapshots.get(key) === pending) snapshots.delete(key);
    throw error;
  }
}

export function useCityCommerceSnapshot(
  origin: MaybeRefOrGetter<CityCommerceOrigin | undefined>,
  enabled: MaybeRefOrGetter<boolean> = true,
  access?: Pick<CompiledPlacesAccess, "loadPlacesManifest" | "loadPlacesCity">,
) {
  const snapshot = shallowRef<CityCommerceSnapshot>();
  const status = ref<CityCommerceSnapshotStatus>("idle");
  const error = shallowRef<unknown>();
  const point = computed(() => toValue(origin));
  watch([
    () => toValue(enabled),
    () => point.value?.lat,
    () => point.value?.lon,
    () => point.value?.code,
    () => point.value?.city,
  ], async ([activeLoad, lat, lon, code, city], _previous, onCleanup) => {
    let active = true;
    onCleanup(() => { active = false; });
    snapshot.value = undefined;
    error.value = undefined;
    if (!activeLoad || lat === undefined || lon === undefined) {
      status.value = "idle";
      return;
    }
    status.value = "loading";
    try {
      const value = await loadCityCommerceSnapshot({ lat, lon, code, city }, access);
      if (active) {
        snapshot.value = value;
        status.value = "ready";
      }
    } catch (cause) {
      if (active) {
        error.value = cause;
        status.value = "unavailable";
      }
    }
  }, { immediate: true });

  return { snapshot, status, error };
}

function resolveCommuneDescriptor(manifest: CompiledPlacesManifest, origin: CityCommerceOrigin) {
  const code = origin.code ? placesCityCode(origin.code) : undefined;
  const byCode = code ? manifest.cities.find(candidate => candidate.code === code) : undefined;
  if (byCode) return byCode;

  const normalized = origin.city ? normalizeCityName(origin.city) : "";
  const named = normalized ? manifest.cities.filter(candidate => normalizeCityName(candidate.name) === normalized) : [];
  if (named.length === 1) return named[0];
  if (named.length > 1) return nearestDescriptor(named, origin);

  const candidates = manifest.cities.filter(candidate => origin.lon >= candidate.bbox[0] && origin.lon <= candidate.bbox[2]
    && origin.lat >= candidate.bbox[1] && origin.lat <= candidate.bbox[3]);
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const nearest = nearestDescriptor(candidates, origin);
    if (nearest && candidates.filter(candidate => descriptorDistance(candidate, origin) === descriptorDistance(nearest, origin)).length === 1) return nearest;
  }
  return undefined;
}

function nearestDescriptor<T extends { centroid: [number, number] }>(candidates: readonly T[], origin: CityCommerceOrigin): T | undefined {
  return candidates.map(candidate => ({ candidate, distance: descriptorDistance(candidate, origin) }))
    .sort((left, right) => left.distance - right.distance)[0]?.candidate;
}

function descriptorDistance(candidate: { centroid: [number, number] }, origin: CityCommerceOrigin): number {
  return placeDistanceMeters(origin, { lon: candidate.centroid[0], lat: candidate.centroid[1] });
}

function validPoint(place: Pick<CompiledPlaceRecord, "lon" | "lat">): boolean {
  return Number.isFinite(place.lon) && Math.abs(place.lon) <= 180 && Number.isFinite(place.lat) && Math.abs(place.lat) <= 90;
}

export function cityCommercePointsWithinRadius(
  snapshot: CityCommerceSnapshot,
  origin: Pick<CityCommerceOrigin, "lat" | "lon">,
  radiusMeters: number,
): CityCommercePoint[] {
  return snapshot.commerces.filter(point => placeDistanceMeters(origin, point) <= radiusMeters);
}

function createSnapshot(
  sourcePlaces: readonly CompiledPlaceRecord[],
  neighborhoodCommerceCounts: Readonly<Record<string, number>>,
  descriptor: CompiledPlacesManifest["cities"][number],
  manifest: CompiledPlacesManifest,
  key: string,
  datasetVersion: string,
): CityCommerceSnapshot {
  const unique = new Map<string, CompiledPlaceRecord>();
  for (const place of sourcePlaces) {
    const identity = place.id || `${place.category}:${place.kind}:${place.name}:${place.lon}:${place.lat}`;
    if (!unique.has(identity)) unique.set(identity, place);
  }
  const normalized = [...unique.values()];
  const places = normalized.filter(validPoint).map(place => ({
    ...restoreCompiledPlaceName(place),
    cityCode: place.cityCode ?? descriptor.code,
  } satisfies Omit<NearbyPlace, "distanceMeters">));
  const placeById = new Map(places.map(place => [place.id, place]));
  const commerceRecords = normalized.filter(isNearbyPlaceCommerce);
  const commerces: CityCommercePoint[] = commerceRecords.flatMap(record => {
    const place = placeById.get(record.id);
    if (!place) return [];
    return [{
      id: place.id,
      lon: place.lon,
      lat: place.lat,
      name: nearbyPlaceDisplayName(place),
      category: place.category,
      groupId: resolveNearbyPlaceGroupId(place),
      iconId: nearbyPlaceMarkerIconId(place),
      color: nearbyPlaceMarkerColor(place.category),
      typeKey: nearbyPlaceTypeKey(place),
    }];
  });
  const categories = new Map<string, CityCommerceLegendCategory>();
  for (const point of commerces) {
    const id = `${point.typeKey}:${point.iconId}`;
    const current = categories.get(id);
    if (current) current.count += 1;
    else categories.set(id, {
      id,
      labelKey: point.typeKey,
      iconId: point.iconId,
      color: point.color,
      count: 1,
    });
  }
  const commerceRecordsWithCoords = commerceRecords.filter(validPoint).length;
  return {
    key,
    commune: { code: descriptor.code, name: descriptor.name, bbox: descriptor.bbox },
    dataset: {
      id: manifest.datasetId,
      version: datasetVersion,
      generatedAt: manifest.generatedAt,
      schemaVersion: manifest.schemaVersion,
      normalizationVersion: manifest.normalizationVersion,
      attribution: manifest.attribution,
      license: manifest.license,
    },
    places,
    commerces,
    categories: [...categories.values()].sort((left, right) => right.count - left.count || left.labelKey.localeCompare(right.labelKey)),
    recordedTotal: commerceRecords.length,
    mappedTotal: commerceRecordsWithCoords,
    unmappedTotal: commerceRecords.length - commerceRecordsWithCoords,
    neighborhoodCommerceCounts: Object.freeze({ ...neighborhoodCommerceCounts }),
  };
}
