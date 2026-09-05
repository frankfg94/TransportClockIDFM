import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import type { GlobalMapMode } from "../transport-map/contracts/manifest";
import type { NearbyStationSelection } from "./nearbyStations";

export interface NearbyStationsDraft {
  query: string;
  selectedPlace?: GeocoderPoint;
  radius: number;
  clusterGroupingDistanceMeters?: number;
  activeModes: GlobalMapMode[];
  selections: NearbyStationSelection[];
}

let routeDraft: NearbyStationsDraft | undefined;

export function saveNearbyStationsDraft(draft: NearbyStationsDraft): void {
  routeDraft = structuredClone(draft);
}

export function readNearbyStationsDraft(): NearbyStationsDraft | undefined {
  return routeDraft ? structuredClone(routeDraft) : undefined;
}

export function clearNearbyStationsDraft(): void {
  routeDraft = undefined;
}
