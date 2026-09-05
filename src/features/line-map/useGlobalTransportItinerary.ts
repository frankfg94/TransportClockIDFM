import { ref, type Ref } from "vue";
import { useTravelRoutes } from "../nearby-stations/useTravelRoutes";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import type { TravelRoutesProvider } from "../nearby-stations/nearbyHeavyTransports";
import type { PlacesProvider } from "../nearby-stations/nearbyPlaces";

export function useGlobalTransportItinerary(options: {
  placesProvider: PlacesProvider;
  travelRoutesProvider: TravelRoutesProvider;
  getDefaultOrigin?: () => GeocoderPoint | undefined;
  searchAddresses?: boolean;
}): {
  origin: Ref<GeocoderPoint | undefined>;
  open: Ref<boolean>;
  travelRoutes: ReturnType<typeof useTravelRoutes>;
  openTo: (destination: GeocoderPoint) => Promise<void>;
  setOrigin: (origin: GeocoderPoint) => Promise<void>;
  close: () => void;
} {
  const origin = ref<GeocoderPoint>();
  const open = ref(false);
  const travelRoutes = useTravelRoutes({
    origin,
    placesProvider: options.placesProvider,
    travelRoutesProvider: options.travelRoutesProvider,
    searchStations: true,
    searchPlaces: true,
    searchAddresses: options.searchAddresses ?? true,
  });

  async function openTo(destination: GeocoderPoint): Promise<void> {
    if (!origin.value) {
      const defaultOrigin = options.getDefaultOrigin?.();
      if (defaultOrigin) origin.value = defaultOrigin;
    }
    open.value = true;
    await travelRoutes.setDestination(destination);
  }

  async function setOrigin(nextOrigin: GeocoderPoint): Promise<void> {
    origin.value = nextOrigin;
    if (travelRoutes.destination.value) await travelRoutes.refresh();
  }

  function close(): void {
    open.value = false;
  }

  return { origin, open, travelRoutes, openTo, setOrigin, close };
}
