import { getNearbyWalkingRouteMatrix } from "../../../services/nearbyWalkingRoutes";
import { placeDistanceMeters } from "../../../services/places/compiledPlaces";
import type { GeocoderPoint } from "../../transport-map/contracts/geocoder";
import type { NearbyJourney } from "../nearbyHeavyTransports";
import { mergeNearbyPlaces, type NearbyPlace, type PlacesProvider } from "../nearbyPlaces";
import type { NearbyWalkingRoute } from "../nearbyWalkingRoutes";
import { assessFoodMarket, foodMarketCandidates, isMarketPlace, type FoodMarketAccess } from "./criteria/foodMarkets";
import { assessCinema, CINEMA_RULES, fastestCinemaTransit, isCinema, type CinemaAccess } from "./criteria/cinemas";

export interface VenueAnalysis<T> {
  items: T[];
  source: string;
  status: "ready" | "missing" | "error";
  error?: string;
}

async function documentedWalks(origin: GeocoderPoint, places: readonly NearbyPlace[], signal: AbortSignal) {
  const walks = new Map<string, NearbyWalkingRoute>();
  for (let offset = 0; offset < places.length; offset += 64) {
    const destinations = places.slice(offset, offset + 64).map(({ id, lon, lat }) => ({ id, lon, lat }));
    // This existing policy allows IGN's pedestrian network while rejecting
    // straight-line estimates for any score contribution.
    const routes = await getNearbyWalkingRouteMatrix(origin, destinations, signal, "gtfs-access");
    signal.throwIfAborted();
    for (const route of routes) {
      if (route.id && !route.fallback && route.provider !== "straight-line"
        && Number.isFinite(route.durationSeconds) && route.durationSeconds >= 0) walks.set(route.id, route);
    }
  }
  return walks;
}

export async function analyzeFoodMarkets(origin: GeocoderPoint, nearby: readonly NearbyPlace[], provider: PlacesProvider,
  signal: AbortSignal): Promise<VenueAnalysis<FoodMarketAccess>> {
  const source = "OSM · municipal inventories · pedestrian routing";
  let cityMarkets: NearbyPlace[] = [];
  let inventoryError: string | undefined;
  if (provider.loadPlacesCity && (origin.city || origin.code)) {
    try {
      const city = await provider.loadPlacesCity({ name: origin.city, code: origin.code, lat: origin.lat, lon: origin.lon }, signal);
      cityMarkets = city.places.filter(isMarketPlace).map(place => ({ ...place, city: city.city.name,
        distanceMeters: placeDistanceMeters(origin, place) }));
    } catch (error) {
      signal.throwIfAborted();
      inventoryError = error instanceof Error ? error.message : "market-inventory-unavailable";
    }
  }
  const candidates = foodMarketCandidates(mergeNearbyPlaces(cityMarkets, nearby.filter(isMarketPlace)));
  const walks = await documentedWalks(origin, candidates.filter(item => item.food).map(item => item.place), signal);
  const items = candidates.map(item => {
    const walk = walks.get(item.place.id);
    return { ...item, walkSeconds: walk?.durationSeconds, walkProvider: walk?.provider };
  });
  const measured = items.some(item => assessFoodMarket(item).qualification.kind !== "not-evaluated");
  const error = inventoryError ?? (items.some(item => item.food && item.walkSeconds === undefined) ? "market-walking-unavailable" : undefined);
  // An empty OSM inventory is not proof that a commune has no market.
  return { items, source, status: measured ? "ready" : error ? "error" : "missing", error };
}

export async function analyzeCinemas(origin: GeocoderPoint, nearby: readonly NearbyPlace[],
  probe: (place: NearbyPlace, signal: AbortSignal) => Promise<NearbyJourney[]>,
  signal: AbortSignal): Promise<VenueAnalysis<CinemaAccess>> {
  const source = "OSM · pedestrian routing · public transport journeys";
  const candidates = nearby.filter(isCinema);
  const walks = await documentedWalks(origin, candidates, signal);
  const results = await Promise.all(candidates.map(async (place): Promise<CinemaAccess> => {
    const walk = walks.get(place.id);
    const walking = { walkSeconds: walk?.durationSeconds, walkProvider: walk?.provider };
    const { walkSeconds } = walking;
    // Once the walk qualifies, a second mode cannot increase the bonus.
    if (walkSeconds !== undefined && walkSeconds <= CINEMA_RULES.walkingMinutes * 60) return { place, ...walking };
    try {
      return { place, ...walking, transit: fastestCinemaTransit(await probe(place, signal)) };
    } catch {
      signal.throwIfAborted();
      return { place, ...walking, transitUnavailable: true };
    }
  }));
  const error = results.some(item => item.transitUnavailable) ? "cinema-transit-unavailable"
    : results.some(item => item.walkSeconds === undefined && !item.transit) ? "cinema-walking-unavailable" : undefined;
  const measured = results.some(item => assessCinema(item).qualification.kind !== "not-evaluated");
  return { items: results, source, status: measured ? "ready" : error ? "error" : "missing", error };
}
