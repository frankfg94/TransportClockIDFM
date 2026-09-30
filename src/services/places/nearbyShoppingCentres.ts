import type { NearbyMajorShoppingCentre } from "../../features/nearby-stations/neighborhood/shoppingCentres";
import type { NearbySupermarketFootprint } from "../../features/nearby-stations/neighborhood/supermarkets";
import type { GeocoderPoint } from "../../features/transport-map/contracts/geocoder";
import { toServerApiUrl } from "../serverApi";

export async function fetchNearbyShoppingCentres(
  origin: Pick<GeocoderPoint, "lat" | "lon">,
  signal?: AbortSignal,
): Promise<NearbyMajorShoppingCentre[]> {
  const query = new URLSearchParams({ lat: String(origin.lat), lon: String(origin.lon) });
  const response = await fetch(toServerApiUrl(`/api/places/shopping-centres?${query.toString()}`), { signal });
  if (!response.ok) throw new Error(`shopping-centres-${response.status}`);
  const payload = await response.json() as { centres?: unknown };
  if (!Array.isArray(payload.centres)) throw new Error("shopping-centres-incomplete-response");
  return payload.centres.filter(isNearbyMajorShoppingCentre);
}

export async function fetchNearbySupermarketFootprints(
  origin: Pick<GeocoderPoint, "lat" | "lon">,
  signal?: AbortSignal,
): Promise<NearbySupermarketFootprint[]> {
  const query = new URLSearchParams({ lat: String(origin.lat), lon: String(origin.lon) });
  const response = await fetch(toServerApiUrl(`/api/places/supermarket-footprints?${query.toString()}`), { signal });
  if (!response.ok) throw new Error(`supermarket-footprints-${response.status}`);
  const payload = await response.json() as { supermarketFootprints?: unknown };
  if (!Array.isArray(payload.supermarketFootprints)) throw new Error("supermarket-footprints-incomplete-response");
  return payload.supermarketFootprints.filter(isNearbySupermarketFootprint);
}

function isNearbyMajorShoppingCentre(value: unknown): value is NearbyMajorShoppingCentre {
  if (!value || typeof value !== "object") return false;
  const centre = value as Partial<NearbyMajorShoppingCentre>;
  return typeof centre.id === "string"
    && typeof centre.name === "string"
    && Number.isFinite(centre.lat)
    && Number.isFinite(centre.lon)
    && Number.isFinite(centre.distanceMeters);
}

function isNearbySupermarketFootprint(value: unknown): value is NearbySupermarketFootprint {
  if (!value || typeof value !== "object") return false;
  const footprint = value as Partial<NearbySupermarketFootprint>;
  return typeof footprint.placeId === "string"
    && Number.isFinite(footprint.surfaceM2)
    && (footprint.surfaceM2 ?? 0) > 0;
}
