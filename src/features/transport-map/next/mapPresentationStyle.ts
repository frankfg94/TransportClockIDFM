import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { ESRI_SATELLITE_TILE_URL } from "../basemap/tileMath";

export const imageryId = "transport-satellite";
export const buildingsId = "transport-buildings-3d";

export function addMapPresentationLayers(style: StyleSpecification, satellite: boolean, perspective: boolean): StyleSpecification {
  const overlays: LayerSpecification[] = [{
    id: imageryId, type: "raster", source: imageryId,
    layout: { visibility: satellite ? "visible" : "none" },
  }];
  const buildings = style.layers.find(layer => "source-layer" in layer && layer["source-layer"] === "building");
  if (buildings && "source" in buildings) overlays.push({
    id: buildingsId, type: "fill-extrusion", source: buildings.source, "source-layer": "building",
    minzoom: 13, layout: { visibility: perspective ? "visible" : "none" },
    paint: {
      "fill-extrusion-height": ["to-number", ["get", "render_height"], 8],
      "fill-extrusion-base": ["to-number", ["get", "render_min_height"], 0],
      "fill-extrusion-color": "#bac8d3",
      "fill-extrusion-opacity": 0.55,
    },
  });
  const layers = [...style.layers];
  const labels = layers.findIndex(layer => layer.type === "symbol");
  layers.splice(labels < 0 ? layers.length : labels, 0, ...overlays);
  return {
    ...style, layers,
    sources: { ...style.sources, [imageryId]: {
      type: "raster", tiles: [`${ESRI_SATELLITE_TILE_URL}/{z}/{y}/{x}`], tileSize: 256,
      maxzoom: 19, attribution: "Esri World Imagery",
    } },
  };
}
