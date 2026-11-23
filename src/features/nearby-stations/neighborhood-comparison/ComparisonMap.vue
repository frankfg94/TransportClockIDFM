<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Map as MapLibreMap, setWorkerUrl, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import { useRuntimeConfig } from "nuxt/app";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { useI18n } from "../../../i18n";
import { boundarySegmentsForIrisNeighborhoods } from "../../transport-map/iris/irisGeometry";
import { joinAdministrativeBoundarySegments } from "../../transport-map/iris/administrativeGeometry";
import { DEFAULT_NEXT_VECTOR_STYLE_URL } from "../../transport-map/next/nextMapConfig";
import type { ComparisonNeighborhood } from "./types";

const props = defineProps<{
  neighborhoods: readonly ComparisonNeighborhood[];
  selectedCode?: string;
  canopy?: boolean;
  metric?: { label: string; unit: string; max: number; values: Readonly<Record<string, number | undefined>> };
}>();
const emit = defineEmits<{ select: [code: string] }>();
const { t, n } = useI18n();
const runtimeConfig = useRuntimeConfig();
const element = ref<HTMLElement>();
const status = ref<"loading" | "ready" | "unsupported">("loading");
let map: MapLibreMap | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let observer: ResizeObserver | undefined;
const usingFallback = ref(false);

function features(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: props.neighborhoods.map(item => {
    const metricValue = props.metric?.values[item.codeIris];
    return {
      type: "Feature", properties: {
        code: item.codeIris,
        selected: item.codeIris === props.selectedCode,
        hasCanopy: Boolean(item.green.canopy && item.green.canopy.areaM2 > 0 && Number.isFinite(item.green.canopy.canopyM2)),
        canopyPercent: item.green.canopy && item.green.canopy.areaM2 > 0 ? 100 * item.green.canopy.canopyM2 / item.green.canopy.areaM2 : 0,
        hasMetric: metricValue !== undefined && Number.isFinite(metricValue),
        metricRatio: props.metric && metricValue !== undefined && props.metric.max > 0
          ? Math.max(0, Math.min(1, metricValue / props.metric.max)) : 0,
      }, geometry: item.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
    };
  }) };
}
function boundary(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: joinAdministrativeBoundarySegments(boundarySegmentsForIrisNeighborhoods(props.neighborhoods)).map(path => ({
    type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: path },
  })) };
}
function update(): void {
  // A GeoJSON source can be updated while MapLibre is still loading tiles.
  // Waiting for isStyleLoaded() drops selections made during an in-flight update.
  if (!map) return;
  const source = map.getSource("comparison-neighborhoods") as GeoJSONSource | undefined;
  if (source) source.setData(features());
}
function setup(): void {
  // style.load fires after the style JSON is installed, before every sprite and
  // tile has finished loading. addSource/addLayer are already legal here.
  if (!map) return;
  if (timer) clearTimeout(timer);
  if (!map.getSource("comparison-neighborhoods")) {
    map.addSource("comparison-neighborhoods", { type: "geojson", data: features() });
    map.addSource("comparison-boundary", { type: "geojson", data: boundary() });
    map.addLayer({ id: "comparison-fill", type: "fill", source: "comparison-neighborhoods", paint: {
      "fill-color": props.metric
        ? ["case", ["get", "hasMetric"], ["step", ["get", "metricRatio"], "#eff7e8", .2, "#d4ebc2", .4, "#addb99", .6, "#77c66e", .8, "#3b9e50", .95, "#176b3c"], "#d4d9dc"]
        : props.canopy
          ? ["case", ["get", "hasCanopy"], ["step", ["get", "canopyPercent"], "#eff7e8", 5, "#d4ebc2", 10, "#addb99", 20, "#77c66e", 30, "#3b9e50", 45, "#176b3c"], "#d4d9dc"]
        : ["case", ["get", "selected"], "#5146d9", "#46a0b7"],
      "fill-opacity": props.metric || props.canopy ? 0.88 : ["case", ["get", "selected"], 0.62, 0.28],
    } });
    map.addLayer({ id: "comparison-outlines", type: "line", source: "comparison-neighborhoods", paint: { "line-color": "#16566c", "line-width": 1.5 } });
    map.addLayer({ id: "comparison-boundary", type: "line", source: "comparison-boundary", paint: { "line-color": "#153745", "line-width": 3 } });
    map.addLayer({ id: "comparison-selected", type: "line", source: "comparison-neighborhoods", filter: ["==", ["get", "selected"], true], paint: { "line-color": "#251277", "line-width": 4 } });
  }
  update();
  status.value = "ready";
}
function selectAtPoint(event: MapMouseEvent): void {
  if (!map?.getLayer("comparison-fill")) return;
  const code = map.queryRenderedFeatures(event.point, { layers: ["comparison-fill"] })[0]?.properties?.code;
  if (typeof code === "string") emit("select", code);
}
onMounted(() => {
  if (!element.value) return;
  try {
    setWorkerUrl(workerUrl);
    const configuredStyle = runtimeConfig.public.nextMap?.vectorStyleUrl;
    map = new MapLibreMap({ container: element.value, style: typeof configuredStyle === "string" && configuredStyle ? configuredStyle : DEFAULT_NEXT_VECTOR_STYLE_URL,
      center: props.neighborhoods[0]?.centroid ?? [2.35, 48.85], zoom: 11,
      ...(props.metric && { dragPan: false, scrollZoom: false, touchZoomRotate: false, doubleClickZoom: false }),
      canvasContextAttributes: { contextType: "webgl2", antialias: true } });
    if (!map.getCanvas().getContext("webgl2")) throw new Error("WebGL2 unavailable");
    map.on("style.load", setup);
    map.on("click", selectAtPoint);
    map.on("webglcontextlost", () => { status.value = "unsupported"; });
    const coordinates = props.neighborhoods.flatMap(item => {
      const polygons = item.geometry.type === "Polygon" ? [item.geometry.coordinates] : item.geometry.coordinates;
      return polygons.flatMap(polygon => polygon.flat());
    });
    if (coordinates.length) {
      const limits = coordinates.reduce((acc, item) => [Math.min(acc[0]!, item[0]!), Math.min(acc[1]!, item[1]!), Math.max(acc[2]!, item[0]!), Math.max(acc[3]!, item[1]!)], [Infinity, Infinity, -Infinity, -Infinity]);
      map.fitBounds([[limits[0]!, limits[1]!], [limits[2]!, limits[3]!]], { padding: 30, duration: 0, maxZoom: 15 });
    }
    // The comparison polygons still work when the optional vector basemap fails.
    timer = setTimeout(() => {
      if (!map || status.value === "ready" || usingFallback.value) return;
      usingFallback.value = true;
      map.setStyle({ version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#eef3f3" } }] });
    }, 8000);
    if (typeof ResizeObserver !== "undefined") { observer = new ResizeObserver(() => map?.resize()); observer.observe(element.value); }
  } catch {
    map?.remove(); map = undefined; status.value = "unsupported";
  }
});
watch(() => [props.selectedCode, props.canopy, props.metric, props.neighborhoods] as const, update);
onBeforeUnmount(() => { if (timer) clearTimeout(timer); observer?.disconnect(); map?.remove(); });
</script>

<template>
  <div class="comparison-map-wrap">
    <div ref="element" class="comparison-map" data-testid="comparison-map" :data-status="status" :aria-label="t('nearbyStations.comparison.mapLabel')" />
    <aside v-if="metric || canopy" class="comparison-map__legend" :aria-label="metric?.label ?? t('nearbyStations.comparison.canopyLegend')">
      <strong>{{ metric?.label ?? t('nearbyStations.comparison.canopyLegend') }}</strong>
      <div class="comparison-map__gradient"><span>0</span><i></i><span>{{ metric ? `${n(metric.max, { maximumFractionDigits: 1 })} ${metric.unit}` : '45%+' }}</span></div>
      <small><i class="comparison-map__no-data" />{{ t('nearbyStations.comparison.canopyNoData') }}</small>
    </aside>
    <p v-if="status !== 'ready'" class="comparison-map__status" role="status">{{ t(status === 'loading' ? 'nearbyStations.comparison.mapLoading' : 'nearbyStations.comparison.mapUnavailable') }}</p>
    <p v-else-if="usingFallback" class="comparison-map__fallback" role="status">{{ t('nearbyStations.comparison.mapFallback') }}</p>
  </div>
</template>

<style scoped>
.comparison-map-wrap { position: relative; min-width: 0; min-height: 340px; border-radius: 14px; overflow: hidden; background: #eaf1f2; }
.comparison-map { position: absolute; inset: 0; }
.comparison-map__status { position: absolute; inset: 0; display: grid; place-items: center; padding: 20px; text-align: center; background: #f0f5f6; color: #304857; }
.comparison-map__fallback { position: absolute; top: 8px; left: 8px; right: 8px; margin: 0; padding: 6px 8px; border-radius: 6px; background: #fff; color: #304857; font-size: .75rem; }
.comparison-map__legend { position: absolute; right: 9px; bottom: 9px; display: grid; gap: 5px; max-width: min(220px, calc(100% - 18px)); padding: 8px 10px; border-radius: 9px; background: #fffffff2; box-shadow: 0 1px 6px #15223533; font-size: .73rem; }
.comparison-map__gradient { display: grid; grid-template-columns: auto minmax(60px, 1fr) auto; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
.comparison-map__gradient i { height: 10px; border: 1px solid #889499; border-radius: 5px; background: linear-gradient(90deg,#eff7e8,#d4ebc2,#addb99,#77c66e,#3b9e50,#176b3c); }
.comparison-map__legend small { display: flex; align-items: center; gap: 5px; }
.comparison-map__no-data { width: 11px; height: 11px; border: 1px solid #929a9f; background: #d4d9dc; }
</style>
