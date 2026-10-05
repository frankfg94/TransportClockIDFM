import { createError, defineEventHandler, getQuery } from "h3";
import { loadNearbyShoppingCentres } from "../../services/places/shoppingCentres";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw createError({ statusCode: 400, statusMessage: "lat and lon must be finite numbers." });
  }
  if (lat < 48.1 || lat > 49.3 || lon < 1.4 || lon > 3.6) {
    throw createError({ statusCode: 400, statusMessage: "Shopping centre query is outside the supported bounds." });
  }
  return {
    provider: "openstreetmap-compiled",
    centres: await loadNearbyShoppingCentres(lat, lon, event),
  };
});
