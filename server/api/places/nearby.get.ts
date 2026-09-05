import { createError, defineEventHandler, getQuery } from "h3";
import { currentNearbyPlacesProvider } from "../../services/places/providers";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  const radius = Number(query.radius ?? 600);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radius)) {
    throw createError({ statusCode: 400, statusMessage: "lat, lon and radius must be finite numbers." });
  }
  if (lat < 48.1 || lat > 49.3 || lon < 1.4 || lon > 3.6 || radius < 100 || radius > 2_000) {
    throw createError({ statusCode: 400, statusMessage: "Nearby place query is outside the supported bounds." });
  }
  return {
    provider: currentNearbyPlacesProvider.id,
    places: await currentNearbyPlacesProvider.searchNearby({ lat, lon, radiusMeters: radius }),
  };
});
