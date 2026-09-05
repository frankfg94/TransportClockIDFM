import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";
import { createNearbyDataProviders } from "../../services/nearbyDataProviders";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import type {
  NearbyJourney,
  NearbyJourneyRequest,
  NearbyJourneySection,
  TravelRoutesProvider,
} from "./nearbyHeavyTransports";
import type { PlaceDestinationSearchOptions } from "./nearbyPlaces";
import type { PlacesProvider as NearbyPlacesProvider } from "./nearbyPlaces";

export interface TravelRoute extends NearbyJourney {
  id: string;
  transitSections: NearbyJourneySection[];
}

export type TravelDestinationSearch = (
  query: string,
  signal?: AbortSignal,
) => Promise<GeocoderPoint[]>;

/**
 * Query the same normalized route provider as the visible itinerary UI,
 * without changing the composable's selected destination or route list.
 */
export interface TravelRouteProbe {
  probeJourneys(request: NearbyJourneyRequest): Promise<NearbyJourney[]>;
}

export function useTravelRoutes(options: {
  origin: Ref<GeocoderPoint | undefined>;
  travelRoutesProvider?: TravelRoutesProvider;
  placesProvider?: NearbyPlacesProvider;
  /** @deprecated Inject travelRoutesProvider instead. */
  findJourneys?: TravelRoutesProvider["findJourneys"];
  searchStations?: boolean;
  searchPlaces?: boolean;
  searchAddresses?: boolean;
  searchDestinationPoints?: TravelDestinationSearch;
}) {
  const destination = ref<GeocoderPoint>();
  const departureDateTime = ref("");
  const routes = ref<TravelRoute[]>([]);
  const selectedRouteId = ref<string>();
  const isLoading = ref(false);
  const error = ref<Error>();
  let requestToken = 0;
  const defaults = createNearbyDataProviders();
  const travelRoutesProvider = options.travelRoutesProvider
    ?? (options.findJourneys ? { findJourneys: options.findJourneys } : defaults.travelRoutes);
  const placesProvider = options.placesProvider ?? defaults.places;

  const selectedRoute = computed(() => routes.value.find((route) => route.id === selectedRouteId.value));

  async function setDestination(point: GeocoderPoint): Promise<void> {
    destination.value = point;
    await refresh();
  }

  async function setDepartureDateTime(value: string): Promise<void> {
    departureDateTime.value = value;
    if (destination.value) await refresh();
  }

  async function searchDestinations(query: string, signal?: AbortSignal): Promise<GeocoderPoint[]> {
    if (options.searchDestinationPoints) {
      return options.searchDestinationPoints(query, signal);
    }

    const searchOptions: PlaceDestinationSearchOptions = {
      includeStations: options.searchStations === true,
      includePlaces: options.searchPlaces === true,
      count: 8,
      ...(options.searchAddresses ? { includeAddresses: true } : {}),
    };
    return placesProvider.searchDestinations(query, searchOptions, signal);
  }

  async function refresh(): Promise<void> {
    const origin = options.origin.value;
    const target = destination.value;
    const token = ++requestToken;
    if (!origin || !target) {
      routes.value = [];
      selectedRouteId.value = undefined;
      return;
    }
    isLoading.value = true;
    error.value = undefined;
    try {
      const journeys = await probeJourneys({
        origin,
        destination: target,
        datetime: toNavitiaDepartureDateTime(departureDateTime.value),
        count: 8,
        includeDisruptions: true,
        includeGeoJson: true,
      });
      if (token !== requestToken) return;
      routes.value = toTravelRoutes(journeys);
      selectedRouteId.value = routes.value[0]?.id;
    } catch (cause) {
      if (token !== requestToken) return;
      routes.value = [];
      selectedRouteId.value = undefined;
      error.value = cause instanceof Error ? cause : new Error("travel-routes-unavailable");
    } finally {
      if (token === requestToken) isLoading.value = false;
    }
  }

  async function probeJourneys(request: NearbyJourneyRequest): Promise<NearbyJourney[]> {
    return travelRoutesProvider.findJourneys({
      ...request,
      datetime: toNavitiaDepartureDateTime(request.datetime),
      count: request.count ?? 8,
      includeDisruptions: request.includeDisruptions ?? true,
      includeGeoJson: request.includeGeoJson ?? true,
    });
  }

  function selectRoute(routeId: string): TravelRoute | undefined {
    selectedRouteId.value = routeId;
    return routes.value.find((route) => route.id === routeId);
  }

  function clear(): void {
    requestToken += 1;
    destination.value = undefined;
    departureDateTime.value = "";
    routes.value = [];
    selectedRouteId.value = undefined;
    error.value = undefined;
    isLoading.value = false;
  }

  watch(
    () => [options.origin.value?.lon, options.origin.value?.lat] as const,
    () => { if (destination.value) void refresh(); },
  );
  onBeforeUnmount(() => { requestToken += 1; });

  return {
    destination,
    departureDateTime,
    routes,
    selectedRouteId,
    selectedRoute,
    isLoading,
    error,
    setDestination,
    setDepartureDateTime,
    searchDestinations,
    probeJourneys,
    refresh,
    selectRoute,
    clear,
  };
}

function toTravelRoutes(journeys: readonly NearbyJourney[]): TravelRoute[] {
  const routeIdOccurrences = new Map<string, number>();
  return journeys
    .map((journey, index): TravelRoute => {
      const baseId = journey.id || `journey:${index}:${journey.durationSeconds}`;
      const occurrence = routeIdOccurrences.get(baseId) ?? 0;
      routeIdOccurrences.set(baseId, occurrence + 1);
      return {
        ...journey,
        id: occurrence === 0 ? baseId : `${baseId}:${occurrence}`,
        transitSections: journey.sections.filter((section) => Boolean(section.lineId || section.lineCode || section.lineMode)),
      };
    })
    .sort((left, right) => left.durationSeconds - right.durationSeconds || (left.transferCount ?? 0) - (right.transferCount ?? 0));
}

function toNavitiaDepartureDateTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^\d{8}T\d{6}$/u.test(value)) return value;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/u);
  if (!match) return undefined;
  return `${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}${match[6] ?? "00"}`;
}
