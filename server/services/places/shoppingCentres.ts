import type { H3Event } from "h3";
import { placeDistanceMeters, type CompiledPlaceRecord } from "../../../src/services/places/compiledPlaces";
import type { NearbyMajorShoppingCentre } from "../../../src/features/nearby-stations/neighborhood/shoppingCentres";
import type { NearbySupermarketFootprint } from "../../../src/features/nearby-stations/neighborhood/supermarkets";
import { loadCompiledPlacesAround } from "./compiledDataset";
export { elementAreaSquareMeters } from "../../../src/services/places/placeSurface";

export function shoppingCentresFromPlaces(places: readonly CompiledPlaceRecord[], lat: number, lon: number): NearbyMajorShoppingCentre[] {
  const candidates = places.filter((place) => ["mall", "shopping_centre"].includes(place.tags?.shop ?? place.kind) && place.name.trim())
    .map((place) => ({ id: place.id, name: place.name, lat: place.lat, lon: place.lon,
      distanceMeters: Math.round(placeDistanceMeters({ lat, lon }, place)),
      ...(validSurface(place.areaM2) ? { areaM2: place.areaM2 } : {}),
    })).filter((place) => place.distanceMeters <= 5_000);
  const unique: NearbyMajorShoppingCentre[] = [];
  for (const centre of candidates.sort((left, right) => (right.areaM2 ?? 0) - (left.areaM2 ?? 0) || left.distanceMeters - right.distanceMeters)) {
    if (!unique.some((existing) => normalizeName(existing.name) === normalizeName(centre.name)
      && placeDistanceMeters(existing, centre) <= 300)) unique.push(centre);
  }
  return unique.sort((left, right) => left.distanceMeters - right.distanceMeters || left.name.localeCompare(right.name, "fr-FR")).slice(0, 10);
}

export function supermarketFootprintsFromPlaces(places: readonly CompiledPlaceRecord[], lat: number, lon: number): NearbySupermarketFootprint[] {
  return places.filter((place) => ["supermarket", "hypermarket"].includes(place.tags?.shop ?? place.kind)
    && validSurface(place.areaM2) && placeDistanceMeters({ lat, lon }, place) <= 2_000)
    .map((place) => ({ placeId: place.id, surfaceM2: Math.round(place.areaM2!) }));
}

export async function loadNearbyShoppingCentres(lat: number, lon: number, event: H3Event) {
  return shoppingCentresFromPlaces(await loadCompiledPlacesAround(event, lat, lon, 5_000), lat, lon);
}
export async function loadNearbySupermarketFootprints(lat: number, lon: number, event: H3Event) {
  return supermarketFootprintsFromPlaces(await loadCompiledPlacesAround(event, lat, lon, 2_000), lat, lon);
}
function validSurface(area: number | undefined): boolean { return area !== undefined && Number.isFinite(area) && area > 0; }
function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr-FR")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ").trim();
}
