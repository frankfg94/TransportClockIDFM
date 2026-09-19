import { COORDINATE_SYSTEM } from "@deck.gl/core";
import { IconLayer } from "@deck.gl/layers";
import { h, render } from "vue";
import type { NearbyPlace } from "../../nearby-stations/nearbyPlaces";
import { isNearbyPlaceVisibleForGlobalLine, nearbyPlaceMarkerIconId, type NearbyPlaceMarkerIconId } from "../../nearby-stations/nearbyPlacePresentation";
import { PLACE_ICON_COMPONENTS } from "../../nearby-stations/useNearbyPlacePresenter";

export const NEARBY_PLACES_LAYER_ID = "transport-nearby-places";
export interface DeckNearbyPlace {
  place: NearbyPlace;
  position: [number, number];
  iconId: NearbyPlaceMarkerIconId;
}

// No camera dependency: Deck projects these geographic positions on the GPU.
export function prepareDeckNearbyPlaces(places: readonly NearbyPlace[]): DeckNearbyPlace[] {
  return places.filter(isNearbyPlaceVisibleForGlobalLine)
    .filter(place => Number.isFinite(place.lon) && Number.isFinite(place.lat))
    .map(place => ({ place, position: [place.lon, place.lat], iconId: nearbyPlaceMarkerIconId(place) }));
}

const icons = new Map<NearbyPlaceMarkerIconId, { url: string; width: number; height: number; mask: false }>();
function placeIcon(id: NearbyPlaceMarkerIconId) {
  let icon = icons.get(id);
  if (!icon) {
    // Rasterized by Deck into its shared atlas once per semantic Lucide icon,
    // rather than mounting one SVG component for each place.
    const container = document.createElement("div");
    render(h(PLACE_ICON_COMPONENTS[id], { size: 12, color: "#4b5563", "stroke-width": 2 }), container);
    const glyph = container.innerHTML;
    render(null, container);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="#e7e9ee" stroke="#64748b" stroke-opacity=".2"/><g transform="translate(8 8)">${glyph}</g></svg>`;
    icon = { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width: 64, height: 64, mask: false };
    icons.set(id, icon);
  }
  return icon;
}

export function createDeckNearbyPlacesLayer(data: readonly DeckNearbyPlace[]) {
  return new IconLayer<DeckNearbyPlace>({
    id: NEARBY_PLACES_LAYER_ID,
    data,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    getPosition: record => record.position,
    getIcon: record => placeIcon(record.iconId),
    getSize: 28,
    sizeUnits: "pixels",
    billboard: true,
    pickable: true,
    parameters: { depthCompare: "always" },
  });
}
