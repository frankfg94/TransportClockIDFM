import { getNearbyWalkingRouteMatrix } from "../../../services/nearbyWalkingRoutes";
import { placeDistanceMeters } from "../../../services/places/compiledPlaces";
import { CINEMA_FOOTPRINT_AREAS_FILE, loadVenueFootprintAreas, MARKET_FOOTPRINT_AREAS_FILE } from "../../../services/places/venueFootprintAreas";
import type { GeocoderPoint } from "../../transport-map/contracts/geocoder";
import type { NearbyJourney } from "../nearbyHeavyTransports";
import { directNearbyJourneySection, hasEstimatedNearbyJourney } from "../nearbyJourneyTiming";
import type { NearbyPlace, PlacesProvider } from "../nearbyPlaces";
import type { NearbyWalkingRoute } from "../nearbyWalkingRoutes";
import { FOOD_MARKET_RULES, foodMarketCandidates, isRegularMarket, type FoodMarketAccess, type FoodMarketCandidate, type FoodMarketTransit } from "./criteria/foodMarkets";
import { assessCinema, fastestCinemaTransit, isCinema, type CinemaAccess } from "./criteria/cinemas";
import { loadMunicipalMarkets } from "./municipalMarketInventory";

const MARKET_SEARCH_RADIUS_METERS = 4_000;
const MARKET_WALK_RADIUS_METERS = FOOD_MARKET_RULES.contextMinutes * 95;
type VenueJourneyProbe = (place: NearbyPlace, signal: AbortSignal) => Promise<NearbyJourney[]>;

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

export async function loadFoodMarketCandidates(origin: GeocoderPoint, provider: PlacesProvider, signal: AbortSignal) {
  const [nearby, inventory, footprints] = await Promise.all([
    provider.searchNearby({ origin, radiusMeters: MARKET_SEARCH_RADIUS_METERS }, signal),
    loadMunicipalMarkets(),
    loadVenueFootprintAreas(MARKET_FOOTPRINT_AREAS_FILE),
  ]);
  signal.throwIfAborted();
  const municipalMarkets = inventory.map(place => ({ place, distanceMeters: placeDistanceMeters(origin, place) }))
    .filter(({ distanceMeters }) => distanceMeters <= MARKET_SEARCH_RADIUS_METERS);
  return foodMarketCandidates(nearby, municipalMarkets, footprints).filter(isRegularMarket);
}

export async function analyzeFoodMarkets(origin: GeocoderPoint, markets: readonly FoodMarketCandidate[],
  signal: AbortSignal): Promise<VenueAnalysis<FoodMarketAccess>> {
  const source = "OSM · municipal inventories · pedestrian routing";
  const walkCandidates = markets.filter(item => item.place.distanceMeters <= MARKET_WALK_RADIUS_METERS);
  const walks = await documentedWalks(origin, walkCandidates.map(item => item.place), signal);
  const items = markets.map(item => {
    const walk = walks.get(item.place.id);
    return { ...item, walkSeconds: walk?.durationSeconds, walkProvider: walk?.provider };
  });
  const measured = walks.size > 0;
  const error = walkCandidates.some(item => !walks.has(item.place.id)) ? "market-walking-unavailable" : undefined;
  // An empty OSM inventory is not proof that a commune has no market.
  return { items, source, status: measured ? "ready" : error ? "error" : "missing", error };
}

export async function analyzeFoodMarketTransit(markets: readonly FoodMarketCandidate[],
  probe: VenueJourneyProbe, signal: AbortSignal): Promise<FoodMarketTransit[]> {
  const isVerifiedAdvantage = (journey: NearbyJourney) =>
    journey.durationSeconds <= FOOD_MARKET_RULES.advantageMinutes * 60 && !hasEstimatedNearbyJourney(journey);
  const outcomes = await Promise.allSettled(markets.map(async market => {
    const journeys = await probe(market.place, signal);
    const journey = journeys.filter(candidate => candidate.durationSeconds > 0
      && candidate.durationSeconds < FOOD_MARKET_RULES.contextMinutes * 60
      && directNearbyJourneySection(candidate))
      .sort((a, b) => Number(isVerifiedAdvantage(b)) - Number(isVerifiedAdvantage(a))
        || a.durationSeconds - b.durationSeconds)[0];
    return journey ? { market, journey } : undefined;
  }));
  signal.throwIfAborted();
  const failures = outcomes.filter(outcome => outcome.status === "rejected");
  if (failures.length > 0 && failures.length === outcomes.length) throw failures[0]!.reason;
  return outcomes.flatMap(outcome => outcome.status === "fulfilled" && outcome.value ? [outcome.value] : []);
}

export async function analyzeCinemas(origin: GeocoderPoint, nearby: readonly NearbyPlace[],
  probe: VenueJourneyProbe,
  signal: AbortSignal): Promise<VenueAnalysis<CinemaAccess>> {
  const source = "OSM · pedestrian routing · public transport journeys";
  const candidates = nearby.filter(isCinema);
  if (!candidates.length) return { items: [], source, status: "missing" };
  const transit = Promise.all(candidates.map(async (place): Promise<CinemaAccess> => {
    try {
      return { place, transit: fastestCinemaTransit(await probe(place, signal)) };
    } catch {
      signal.throwIfAborted();
      return { place, transitUnavailable: true };
    }
  }));
  const [walks, footprints, journeys] = await Promise.all([
    documentedWalks(origin, candidates, signal),
    loadVenueFootprintAreas(CINEMA_FOOTPRINT_AREAS_FILE),
    transit,
  ]);
  signal.throwIfAborted();
  const results = journeys.map(access => {
    const walk = walks.get(access.place.id);
    return { ...access, walkSeconds: walk?.durationSeconds, walkProvider: walk?.provider, footprintAreaM2: footprints.get(access.place.id) };
  });
  const error = results.some(item => item.transitUnavailable) ? "cinema-transit-unavailable"
    : results.some(item => item.walkSeconds === undefined && !item.transit) ? "cinema-walking-unavailable" : undefined;
  const measured = results.some(item => assessCinema(item).qualification.kind !== "not-evaluated");
  return { items: results, source, status: measured ? "ready" : error ? "error" : "missing", error };
}
