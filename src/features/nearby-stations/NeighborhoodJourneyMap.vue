<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { LngLatBounds, Map as MapLibreMap, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRuntimeConfig } from "nuxt/app";
import { Scan } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import { DEFAULT_NEXT_VECTOR_STYLE_URL, applyMapLibreLabelLocale, normalizeMapLibreReferenceFilters, type MapLibreLabelStyleAdapter } from "../transport-map/next/nextMapConfig";
import type { LonLatPoint } from "../transport-map/geo/coordinateKernel";
import type { MappedPreviewJourney } from "./neighborhood/journeyPreview";

const props = defineProps<{ origin: LonLatPoint; journeys: readonly MappedPreviewJourney[]; selectedId: string }>();
const emit = defineEmits<{ select: [id: string] }>();
const { t, locale } = useI18n();
const config = useRuntimeConfig();
const prefix = "nearbyStations.neighborhoodScore.journeyPreview" as const;
const container = ref<HTMLElement>();
const status = ref<"loading" | "ready" | "unsupported">("loading");
const baseFailed = ref(false);
const pins = ref<{ id: string; label: string; x: number; y: number; labelX: number }[]>([]);
const sourceId = "verdict-journey";
let map: MapLibreMap | undefined;
let observer: ResizeObserver | undefined;
let manuallyMoved = false;
let requestedVectorStyle = false;
const streetStyle: StyleSpecification = { version: 8, sources: { streets: {
  type: "raster", tileSize: 256, maxzoom: 19, tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
} }, layers: [{ id: "streets", type: "raster", source: "streets",
  paint: { "raster-saturation": -0.8, "raster-contrast": -0.14, "raster-brightness-min": 0.12 },
}] };

function coordinates(point: LonLatPoint): [number, number] { return [point.lon, point.lat]; }
const bounds = computed(() => {
  const area = new LngLatBounds().extend(coordinates(props.origin));
  for (const { destination, row } of props.journeys) {
    if (destination) area.extend(coordinates(destination));
    for (const path of row.paths) for (const p of path.coordinates) area.extend(coordinates(p));
    for (const p of row.points) area.extend(coordinates(p));
  }
  return area;
});
const data = computed<GeoJSON.FeatureCollection>(() => ({
  type: "FeatureCollection",
  features: props.journeys.flatMap(({ row }) => [
    ...row.paths.map(path => ({
      type: "Feature" as const, properties: { kind: path.kind, color: path.color },
      geometry: { type: "LineString" as const, coordinates: path.coordinates.map(coordinates) },
    })),
    ...row.points.map(point => ({
      type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: coordinates(point) },
    })),
  ]),
}));

const markers = computed(() => [
  { id: "", label: t(`${prefix}.start`), point: props.origin },
  ...props.journeys.flatMap(({ destination, row }) => destination ? [{ id: row.id, label: row.label, point: destination }] : []),
]);
function updatePins() {
  if (!map || !container.value) return;
  const width = container.value.clientWidth;
  pins.value = markers.value.map(({ id, label, point }) => {
    const { x, y } = map!.project(coordinates(point));
    const labelX = Math.max(75, Math.min(width - 75, x)) - x;
    return { x, y, labelX, id, label };
  });
}
function fit() {
  if (!map || !container.value?.clientWidth || container.value.clientHeight < 120) return;
  map.fitBounds(bounds.value, { padding: { left: 26, right: 26, top: 52, bottom: 64 }, maxZoom: 15, duration: 0 });
  updatePins();
}
function recenter() { manuallyMoved = false; fit(); }

function localizeMap() {
  if (map) applyMapLibreLabelLocale(map as unknown as MapLibreLabelStyleAdapter, locale.value);
}
function installRoute() {
  if (!map) return;
  localizeMap();
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, { type: "geojson", data: data.value });
    map.addLayer({ id: "journey-casing", type: "line", source: sourceId,
      filter: ["==", ["geometry-type"], "LineString"], layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 7 } });
    map.addLayer({ id: "journey-transit", type: "line", source: sourceId, filter: ["==", ["get", "kind"], "transit"],
      layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 4.5 } });
    map.addLayer({ id: "journey-walk", type: "line", source: sourceId, filter: ["==", ["get", "kind"], "walk"],
      paint: { "line-color": "#45576c", "line-width": 3, "line-dasharray": [1.3, 1.2] } });
    map.addLayer({ id: "journey-stops", type: "circle", source: sourceId, filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 3, "circle-color": "#fff", "circle-stroke-color": "#45576c", "circle-stroke-width": 1.5 } });
  }
  status.value = "ready";
  updatePins();
  if (!map.getSource("streets")) baseFailed.value = false;
  // The route and street map are usable while the Optimizer's vector style downloads.
  if (!requestedVectorStyle) {
    requestedVectorStyle = true;
    const configured = config.public.nextMap?.vectorStyleUrl;
    map.setStyle(typeof configured === "string" && configured || DEFAULT_NEXT_VECTOR_STYLE_URL,
      { transformStyle: (_, style) => normalizeMapLibreReferenceFilters(style) });
  }
}
onMounted(() => {
  if (!container.value) return;
  try {
    setWorkerUrl(workerUrl);
    map = new MapLibreMap({ container: container.value, style: streetStyle, center: coordinates(props.origin), zoom: 10,
      scrollZoom: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, renderWorldCopies: false,
      attributionControl: { compact: true }, canvasContextAttributes: { contextType: "webgl2", antialias: true } });
    map.touchZoomRotate.disableRotation();
    map.on("style.load", installRoute);
    map.on("move", event => { if (event.originalEvent) manuallyMoved = true; updatePins(); });
    map.on("webglcontextlost", () => { status.value = "unsupported"; });
    map.on("webglcontextrestored", () => { status.value = "ready"; updatePins(); });
    map.on("error", event => {
      if (status.value === "unsupported") return;
      const id = "sourceId" in event && typeof event.sourceId === "string" ? event.sourceId : undefined;
      if (id === "streets") baseFailed.value = true;
      else if (id && map?.getSource(id)?.type === "vector") map.setStyle(streetStyle, { diff: false });
    });
    map.on("sourcedata", event => { if (event.sourceId === "streets" && event.sourceDataType === "content") baseFailed.value = false; });
    fit();
    observer = new ResizeObserver(() => { map?.resize(); if (!manuallyMoved) fit(); });
    observer.observe(container.value);
  } catch {
    map?.remove();
    map = undefined;
    status.value = "unsupported";
  }
});
watch(data, value => { (map?.getSource(sourceId) as GeoJSONSource | undefined)?.setData(value); });
watch([() => props.selectedId, () => props.selectedId ? props.journeys[0]?.row.selectedIndex : undefined], recenter);
watch(() => bounds.value.toString(), () => { if (!manuallyMoved) fit(); });
watch(markers, updatePins);
watch(locale, () => { if (status.value === "ready") localizeMap(); });
onBeforeUnmount(() => { observer?.disconnect(); map?.remove(); map = undefined; });
</script>

<template>
  <div class="journey-map" :data-status="status">
    <div ref="container" class="journey-map__canvas" :aria-label="selectedId ? t(`${prefix}.mapLabel`, { destination: journeys[0]?.row.label ?? '' }) : t(`${prefix}.allDestinations`)" />
    <template v-if="status !== 'unsupported'">
      <template v-for="pin of pins" :key="pin.id">
        <button v-if="!selectedId && pin.id" type="button" class="journey-map__pin journey-map__target"
          :style="{ left: pin.x + 'px', top: pin.y + 'px', '--label-x': pin.labelX + 'px' }" :aria-label="pin.label" @click="emit('select', pin.id)">
          <span>{{ pin.label }}</span>
        </button>
        <div v-else class="journey-map__pin" :class="{ 'journey-map__pin--origin': !pin.id }"
          :style="{ left: pin.x + 'px', top: pin.y + 'px', '--label-x': pin.labelX + 'px' }" aria-hidden="true">
          <span>{{ pin.label }}</span>
        </div>
      </template>
      <button type="button" class="journey-map__fit" :title="t(`${prefix}.recenter`)" :aria-label="t(`${prefix}.recenter`)" @click="recenter"><Scan :size="18" aria-hidden="true" /></button>
    </template>
    <p v-if="status !== 'ready' || baseFailed" class="journey-map__notice" role="status">{{ t(status === 'loading' ? `${prefix}.mapLoading` : `${prefix}.mapUnavailable`) }}</p>
  </div>
</template>

<style scoped>
.journey-map { position: relative; overflow: hidden; height: clamp(260px, 32vw, 340px); border: 1px solid var(--border); border-radius: 10px; background: #edf1ef; }
.journey-map__canvas { position: absolute; inset: 0; }
.journey-map__fit { position: absolute; top: 8px; right: 8px; width: 36px; height: 36px; display: grid; place-items: center; padding: 0; color: #233d4d; border: 1px solid #becacb; border-radius: 8px; background: #fff; cursor: pointer; }
.journey-map__pin { position: absolute; z-index: 1; transform: translate(-50%, -50%); width: 14px; height: 14px; box-sizing: border-box; border: 3px solid #fff; border-radius: 50%; background: #233d4d; box-shadow: 0 0 0 1.5px #233d4d; pointer-events: none; }
.journey-map__pin--origin { background: #14765d; box-shadow: 0 0 0 1.5px #14765d; }
.journey-map__pin span { position: absolute; bottom: 15px; left: calc(50% + var(--label-x)); transform: translateX(-50%); width: max-content; max-width: 140px; padding: 3px 8px; border-radius: 5px; background: #233d4d; color: white; font-weight: 650; font-size: .76rem; line-height: 1.25; text-align: center; }
.journey-map__pin--origin span { bottom: auto; top: 15px; background: #14765d; }
.journey-map__target { pointer-events: auto; min-width: 0; min-height: 0; padding: 0; cursor: pointer; }
.journey-map__target::before { content: ""; position: absolute; inset: -8px; border-radius: 50%; }
.journey-map__target span { display: none; }
.journey-map__target:is(:hover, :focus-visible) { z-index: 2; }
.journey-map__target:is(:hover, :focus-visible) span { display: block; }
.journey-map__notice { position: absolute; top: 6px; left: 8px; max-width: calc(100% - 62px); margin: 0; padding: 4px 8px; border-radius: 5px; background: var(--surface); color: var(--ink); font-size: .8rem; }
.journey-map[data-status="unsupported"] { height: auto; background: var(--surface); }
.journey-map[data-status="unsupported"] .journey-map__notice { position: relative; inset: auto; max-width: none; padding: 10px; }
</style>
