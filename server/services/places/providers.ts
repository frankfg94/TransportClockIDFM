import { loadNearbyPlaces } from "./overpass";
import type { ServerNearbyPlacesProvider } from "./provider";

/** Current server adapter. A Google Places implementation can replace this wiring. */
export const currentNearbyPlacesProvider: ServerNearbyPlacesProvider = {
  id: "openstreetmap-overpass",
  searchNearby: ({ lat, lon, radiusMeters }) => loadNearbyPlaces(lat, lon, radiusMeters),
};
