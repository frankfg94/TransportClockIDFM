import { h, render, type Component } from "vue";
import { Info, Recycle, Toilet, Trash2 } from "lucide-vue-next";
import { Popup, type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection, Geometry, Point } from "geojson";
import type { GreenBoundary, GreenPoint } from "../../../shared/natureInCity";
import type { NearbyPlace } from "./nearbyPlaces";
import type { NearbyPlacePresentation } from "./useNearbyPlacePresenter";

const sourceId = "park-equipment";
const layerId = "park-equipment-icons";
const equipmentIcons: Readonly<Record<string, Component>> = { information: Info, waste_basket: Trash2, recycling: Recycle, toilets: Toilet };
const equipmentPaths: Readonly<Record<string, string>> = {
  bench: "M5 5h14v6H5z M3 14h18v3H3z M5 11v3m14-3v3M6 17v3m12-3v3",
  picnic_table: "M7 6h10M9 6l-5 13m11-13 5 13M2 14h20M6 14h12",
  fountain: "M3 17h18c-1 3-4 4-9 4s-8-1-9-4Zm9 0V5m0 4C9 4 5 5 4 9m8 0c3-5 7-4 8 0M5 12v1m14-1v1",
};

function equipmentKind(place: NearbyPlace) {
  const kind = place.tags?.amenity ?? place.tags?.tourism ?? place.kind;
  return kind.startsWith("recycling") ? "recycling" : kind;
}

export function indexParkEquipmentBoundary(boundary: GreenBoundary) {
  const polygons = boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates;
  const indexed = polygons.filter(polygon => polygon[0]?.length).map(polygon => {
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lon, lat] of polygon[0]!) {
      if (lon === undefined || lat === undefined) continue;
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
    return { polygon, minLon, maxLon, minLat, maxLat };
  });
  return ({ lon, lat }: GreenPoint) => indexed.some(({ polygon, minLon, maxLon, minLat, maxLat }) => {
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) return false;
    let inside = false;
    for (const ring of polygon) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j] as [number, number];
      const [bx, by] = ring[i] as [number, number];
      if ((ay > lat) !== (by > lat) && lon < ax + (lat - ay) * (bx - ax) / (by - ay)) inside = !inside;
    }
    return inside;
  });
}

async function equipmentImage(kind: string, icon: Component) {
  const color = ["information", "toilets", "fountain"].includes(kind) ? "#245678" : kind === "waste_basket" ? "#4b5650" : "#176649";
  let drawing: string;
  if (Object.hasOwn(equipmentPaths, kind)) {
    drawing = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${equipmentPaths[kind]}"/></svg>`;
  } else {
    const container = document.createElement("div");
    render(h(icon, { size: 15, color }), container);
    drawing = container.firstElementChild?.outerHTML ?? "";
    render(null, container);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">
    <rect x="1" y="1" width="22" height="22" rx="7" fill="white" stroke="#b2c9ba"/>
    <g transform="translate(4.5 4.5)">${drawing}</g>
  </svg>`;
  const image = new Image();
  image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export function createParkEquipmentLayer(map: MapLibreMap) {
  let revision = 0;
  let frame: number | undefined;
  let popup: Popup | undefined;
  let displayed: readonly NearbyPlace[] | undefined;
  let requested: readonly NearbyPlace[] | undefined;
  const images = new Map<string, Promise<void>>();
  const empty: FeatureCollection<Point> = { type: "FeatureCollection", features: [] };
  map.addSource(sourceId, { type: "geojson", data: empty });
  map.addLayer({ id: layerId, type: "symbol", source: sourceId, layout: {
    "icon-image": ["get", "icon"], "icon-allow-overlap": true, "icon-ignore-placement": true,
  } });
  const clearPopup = () => { popup?.remove(); popup = undefined; };
  const showPopup = (event: { features?: { geometry: Geometry; properties?: Record<string, unknown> }[] }) => {
    const feature = event.features?.[0];
    if (feature?.geometry.type !== "Point" || typeof feature.properties?.name !== "string") return;
    const [lon, lat] = feature.geometry.coordinates;
    if (lon === undefined || lat === undefined) return;
    popup ??= new Popup({ closeButton: false, offset: 13 });
    popup.setLngLat([lon, lat]).setText(feature.properties.name).addTo(map);
  };
  map.on("mouseenter", layerId, showPopup);
  map.on("mouseleave", layerId, clearPopup);
  map.on("click", layerId, showPopup);

  function loadSprite(id: string, kind: string, icon: Component) {
    if (map.hasImage(id)) return;
    const existing = images.get(id);
    if (existing) return existing;
    const pending = equipmentImage(kind, icon).then(image => {
      if (image && map.getSource(sourceId) && !map.hasImage(id)) map.addImage(id, image, { pixelRatio: 2 });
    }).catch(() => undefined).finally(() => images.delete(id));
    images.set(id, pending);
    return pending;
  }

  return {
    async update(places: readonly NearbyPlace[], present: (place: NearbyPlace) => NearbyPlacePresentation) {
      // Keep a pending entrance animation when the selected dataset is unchanged.
      if (requested === places) return;
      requested = places;
      const version = ++revision;
      if (frame !== undefined) { cancelAnimationFrame(frame); frame = undefined; }
      clearPopup();
      if (!places.length) {
        if (displayed?.length) map.getSource<GeoJSONSource>(sourceId)?.setData(empty);
        displayed = undefined;
        return;
      }
      const loading = new Set<Promise<void>>();
      const data: FeatureCollection<Point> = { type: "FeatureCollection", features: places.map(place => {
        const kind = equipmentKind(place);
        const presentation = present(place);
        const specialized = Object.hasOwn(equipmentIcons, kind) || Object.hasOwn(equipmentPaths, kind);
        const icon = `park-equipment-${specialized ? kind : presentation.iconId}`;
        const sprite = loadSprite(icon, kind, specialized ? equipmentIcons[kind] ?? presentation.icon : presentation.icon);
        if (sprite) loading.add(sprite);
        return { type: "Feature", geometry: { type: "Point", coordinates: [place.lon, place.lat] },
          properties: { icon, name: presentation.name } };
      }) };
      if (loading.size) await Promise.all(loading);
      if (version !== revision) return;
      map.getSource<GeoJSONSource>(sourceId)?.setData(data);
      displayed = places;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      map.setPaintProperty(layerId, "icon-opacity-transition", { duration: 0 });
      map.setPaintProperty(layerId, "icon-translate-transition", { duration: 0 });
      map.setPaintProperty(layerId, "icon-opacity", 0);
      map.setPaintProperty(layerId, "icon-translate", [0, 6]);
      frame = requestAnimationFrame(() => {
        frame = undefined;
        if (version !== revision) return;
        map.setPaintProperty(layerId, "icon-opacity-transition", { duration: 180 });
        map.setPaintProperty(layerId, "icon-translate-transition", { duration: 260 });
        map.setPaintProperty(layerId, "icon-opacity", 1);
        map.setPaintProperty(layerId, "icon-translate", [0, 0]);
      });
    },
    dispose() {
      revision++;
      if (frame !== undefined) cancelAnimationFrame(frame);
      clearPopup();
      map.off("mouseenter", layerId, showPopup);
      map.off("mouseleave", layerId, clearPopup);
      map.off("click", layerId, showPopup);
    },
  };
}
