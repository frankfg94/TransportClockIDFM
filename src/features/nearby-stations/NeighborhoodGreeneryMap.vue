<script setup lang="ts">
import { LngLatBounds, Map as MapLibreMap, Marker, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { createCompiledPlacesProvider } from "../../services/places/compiledPlacesProvider";
import { createParkEquipmentLayer, indexParkEquipmentBoundary } from "./parkEquipmentLayer";
import { useNearbyPlacePresenter } from "./useNearbyPlacePresenter";
import { haversineMeters } from "./nearbyWalkingRoutes";
import { Footprints, TrainFront } from "lucide-vue-next";
import { computed, onMounted, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { locateAtGreenBoundary, normalizeGreenSpaceName } from "../../../shared/greenSpaceBoundary";
import type { GreenMapReference, GreenPoint, GreeneryMapData } from "../../../shared/natureInCity";
import { useI18n } from "../../i18n";
import LineIconBadge from "../../components/LineIconBadge.vue";
import { culturalPlacesWithinGreenSpace, getGreenSpaceMapData, greenSpaceTransitTarget } from "./greenSpaceMapData";
import { routeToGreenSpace, type GreenSpaceWalk } from "./greenSpaceWalking";
import { DEFAULT_NEXT_VECTOR_STYLE_URL, normalizeMapLibreReferenceFilters } from "../transport-map/next/nextMapConfig";
import type { NearbyPlace } from "./nearbyPlaces";
import type { NearbyWalkingRoute } from "./nearbyWalkingRoutes";
import { useGreenSpaceTransit, type GreenSpaceTransitOptions } from "./useGreenSpaceTransit";

const props = defineProps<{
  reference: GreenMapReference;
  expanded?: boolean;
  mapLabel?: string;
  origin?: GreenPoint;
  places?: readonly NearbyPlace[];
  transit?: GreenSpaceTransitOptions;
}>();
const emit = defineEmits<{ "transit-duration": [reference: GreenMapReference, minutes: number]; "walk-duration": [reference: GreenMapReference, minutes: number] }>();
const { n, t } = useI18n();
const messages = "nearbyStations.neighborhoodScore.natureMap" as const;
const host = ref<HTMLElement>();
const data = shallowRef<GreeneryMapData>();
const state = ref<"loading" | "ready" | "unavailable">("loading");
const mapUnavailable = ref(false);
const styleReady = ref(false);
const route = shallowRef<NearbyWalkingRoute>();
const access = ref<GreenSpaceWalk["access"]>();
const gardenWalk = computed(() => props.reference.scope === "park" ? props.transit?.gardenWalks?.get(props.reference.id) : undefined);
const park = computed(() => props.reference.scope === "park" || props.reference.scope === "woodland");
const origin = computed(() => {
  if (props.origin) return props.origin;
  const reference = props.reference;
  return "lat" in reference && reference.lat !== undefined && reference.lon !== undefined
    ? { lat: reference.lat, lon: reference.lon } : undefined;
});
const transitMode = ref(false);
const hasTransit = computed(() => Boolean(props.transit));
const transitTarget = computed(() => {
  const reference = props.reference;
  const point = origin.value;
  const selection = data.value;
  if (!props.expanded || !hasTransit.value || (reference.scope !== "park" && reference.scope !== "woodland")
    || state.value !== "ready" || !point || !selection) return;
  return greenSpaceTransitTarget(reference, point, selection);
});
const showTransit = computed(() => transitMode.value && Boolean(transitTarget.value));
const { status: transitStatus, row: transitRow } = useGreenSpaceTransit(
  () => showTransit.value ? transitTarget.value : undefined, () => props.transit,
  () => props.transit?.journeys?.get(transitTarget.value?.id ?? ""),
);
const area = computed(() => {
  const surface = data.value?.surfaceM2;
  if (!surface || surface <= 0) return undefined;
  return surface >= 10_000
    ? `${n(surface / 10_000, { maximumFractionDigits: 1 })} ha`
    : `${n(Math.round(surface))} mÂ²`;
});
const openingHours = computed(() => {
  if (data.value?.openingHours) return data.value.openingHours;
  const boundary = data.value?.boundary;
  if (!boundary || !park.value) return undefined;
  const reference = props.reference;
  const name = normalizeGreenSpaceName(props.mapLabel ?? "");
  const hours = props.places?.find(place => (place.kind === "park" || place.kind === "garden")
    && place.tags?.opening_hours
    && (("id" in reference && reference.id === place.id) || (name && normalizeGreenSpaceName(place.name) === name
      && locateAtGreenBoundary(place, boundary).inside)));
  return hours?.tags?.opening_hours;
});
const selectedSubsite = ref<string>();
const subsites = computed(() => {
  const selection = data.value;
  if (!park.value || !selection) return [];
  const sites = new Map<string, Geometry>((selection.subsites ?? []).map(subsite => [subsite.name, subsite.boundary]));
  const nearby = culturalPlacesWithinGreenSpace(props.places ?? [], selection.boundary);
  for (const place of nearby) {
    if (!sites.has(place.name)) sites.set(place.name, { type: "Point", coordinates: [place.lon, place.lat] });
  }
  return [...sites].map(([name, geometry]) => ({ name, geometry }));
});
const focusedSubsite = computed(() => subsites.value.find(site => site.name === selectedSubsite.value));

let request: AbortController | undefined;
let observer: ResizeObserver | undefined;
const { presentPlace } = useNearbyPlacePresenter();
const placesProvider = createCompiledPlacesProvider();
const showEquipment = ref(false);
const currentParkPlaces = shallowRef<readonly NearbyPlace[]>([]);
const parkEquipmentCache = new WeakMap<GreeneryMapData["boundary"], readonly NearbyPlace[]>();
const cameraReady = ref(false);
let cameraRevision = 0;
let equipmentLayer: ReturnType<typeof createParkEquipmentLayer> | undefined;
const placesBoundary = computed(() => {
  if (!showEquipment.value || !props.expanded || !park.value || !data.value) return;
  const subsite = focusedSubsite.value?.geometry;
  return subsite?.type === "Point" ? undefined : subsite ?? data.value.boundary;
});

watch(placesBoundary, (boundary, _, onCleanup) => {
  currentParkPlaces.value = [];
  if (!boundary || (boundary.type !== "Polygon" && boundary.type !== "MultiPolygon")) return;
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  const bounds = new LngLatBounds();
  const polygons = boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates;
  for (const polygon of polygons) for (const [lon, lat] of polygon[0] ?? []) {
    if (lon !== undefined && lat !== undefined) bounds.extend([lon, lat]);
  }
  const inside = indexParkEquipmentBoundary(boundary);
  const nearby = (props.places ?? []).filter(inside);
  const mergePlaces = (places: readonly NearbyPlace[]) =>
    [...new Map([...nearby, ...places].map(place => [place.id, place])).values()];
  const cached = parkEquipmentCache.get(boundary);
  currentParkPlaces.value = cached ? mergePlaces(cached) : nearby;
  if (cached) return;
  if (bounds.isEmpty() || !bounds.getCenter) return;
  const { lng, lat } = bounds.getCenter();
  const origin = { lon: lng, lat };
  const radiusMeters = Math.max(...[bounds.getNorthEast(), bounds.getSouthWest()]
    .map(corner => haversineMeters(origin, { lon: corner.lng, lat: corner.lat }))) + 1;
  void placesProvider.searchNearby({ origin, radiusMeters }, controller.signal).then(places => {
    if (!controller.signal.aborted) {
      const selected = places.filter(inside);
      parkEquipmentCache.set(boundary, selected);
      currentParkPlaces.value = mergePlaces(selected);
    }
  }).catch(() => undefined);
});

watch([cameraReady, currentParkPlaces, showEquipment, styleReady], ([ready, places, enabled]) => {
  if (ready || !enabled) void equipmentLayer?.update(enabled ? places : [], presentPlace);
});

let map: MapLibreMap | undefined;
let homeMarker: Marker | undefined;
let lineMarker: Marker | undefined;
const lineMarkerHost = shallowRef<HTMLElement>();
let homeElement: HTMLElement | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let bounds: LngLatBounds | undefined;
let positioned = false;

function dispose() {
  observer?.disconnect();
  if (timer) clearTimeout(timer);
  equipmentLayer?.dispose();
  equipmentLayer = undefined;
  homeMarker?.remove();
  lineMarker?.remove();
  lineMarkerHost.value = undefined;
  map?.remove();
  map = undefined;
}

function failMap() {
  mapUnavailable.value = true;
  dispose();
}

function geojson(geometry?: Geometry): FeatureCollection {
  return { type: "FeatureCollection", features: geometry ? [{ type: "Feature", properties: {}, geometry }] : [] };
}

function drawRoute() {
  const row = showTransit.value ? transitRow.value : undefined;
  updateLineMarker(row?.paths.find(path => path.kind === "transit")?.coordinates);
  const transit: Feature[] = [];
  const walking: Feature[] = [];
  for (const path of row?.paths ?? []) {
    const feature: Feature = { type: "Feature", properties: { color: path.color },
      geometry: { type: "LineString", coordinates: path.coordinates.map(point => [point.lon, point.lat]) } };
    (path.kind === "transit" ? transit : walking).push(feature);
  }
  for (const point of row?.points ?? []) {
    transit.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [point.lon, point.lat] } });
  }
  if (!showTransit.value && route.value) {
    walking.push(...geojson({ type: "LineString", coordinates: route.value.coordinates.map(point => [point.lon, point.lat]) }).features);
  }
  map?.getSource<GeoJSONSource>("transit")?.setData({ type: "FeatureCollection", features: transit });
  map?.getSource<GeoJSONSource>("walk")?.setData({ type: "FeatureCollection", features: walking });
}

function updateLineMarker(points?: readonly GreenPoint[]) {
  if (!map || !points || points.length < 2) {
    lineMarker?.remove();
    lineMarker = undefined;
    lineMarkerHost.value = undefined;
    return;
  }
  const scale = Math.cos(points[0]!.lat * Math.PI / 180);
  const lengths = points.slice(1).map((point, index) =>
    Math.hypot((point.lon - points[index]!.lon) * scale, point.lat - points[index]!.lat));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (const [index, length] of lengths.entries()) {
    if (remaining > length) { remaining -= length; continue; }
    const from = points[index]!, to = points[index + 1]!;
    const ratio = length ? remaining / length : 0;
    if (!lineMarker) {
      const element = document.createElement("div");
      element.style.pointerEvents = "none";
      lineMarkerHost.value = element;
      lineMarker = new Marker({ element, anchor: "bottom", offset: [0, -8] });
      lineMarker.setLngLat([from.lon, from.lat]).addTo(map);
    }
    lineMarker.setLngLat([from.lon + ratio * (to.lon - from.lon), from.lat + ratio * (to.lat - from.lat)]);
    break;
  }
}

function updateHome() {
  if (!props.expanded || !map) return;
  const from = origin.value;
  if (!from) {
    homeMarker?.remove();
    return;
  }
  if (!homeMarker) {
    homeElement = document.createElement("span");
    homeElement.className = "greenery-home-marker";
    homeElement.setAttribute("role", "img");
    homeMarker = new Marker({ element: homeElement });
  }
  homeElement?.setAttribute("aria-label", t(`${messages}.home`));
  homeMarker.setLngLat([from.lon, from.lat]).addTo(map);
}

function drawSelection() {
  if (!map || !styleReady.value) return;
  const selection = data.value;
  map.getSource<GeoJSONSource>("scope")?.setData(geojson(selection?.boundary));
  map.getSource<GeoJSONSource>("canopy")?.setData(geojson(selection?.canopy));
  map.getSource<GeoJSONSource>("subsite")?.setData(geojson(focusedSubsite.value?.geometry));
  map.setPaintProperty("scope-fill", "fill-opacity", selection?.canopy ? 0.1 : 0.45);
  drawRoute();
  fitSelection();
}

function fitSelection() {
  if (!map || !styleReady.value) return;
  const selection = data.value;
  if (!selection) return;
  const next = new LngLatBounds();
  const subsite = focusedSubsite.value;
  const geometry = subsite?.geometry ?? selection.boundary;
  if (geometry.type === "Point") next.extend([geometry.coordinates[0]!, geometry.coordinates[1]!]);
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) for (const point of polygon[0] ?? []) next.extend([point[0]!, point[1]!]);
  }
  if (next.isEmpty()) return;
  if (!subsite && props.expanded && park.value && origin.value) next.extend([origin.value.lon, origin.value.lat]);
  if (!subsite && showTransit.value && transitRow.value) {
    for (const path of transitRow.value.paths) for (const point of path.coordinates) next.extend([point.lon, point.lat]);
    for (const point of transitRow.value.points) next.extend([point.lon, point.lat]);
  }
  const extent = next.toArray?.();
  const previousExtent = bounds?.toArray?.();
  if (extent?.every((corner, index) => corner.every((value, axis) => value === previousExtent?.[index]?.[axis]))) {
    if (map.isMoving?.()) {
      const revision = cameraRevision;
      map.once("moveend", () => { if (revision === cameraRevision) cameraReady.value = true; });
    } else cameraReady.value = true;
    return;
  }
  bounds = next;
  const padding = props.expanded && park.value
    ? { top: 36, bottom: Math.min(124, (host.value?.clientHeight ?? 0) * .24), left: 38, right: 38 }
    : props.expanded ? 42 : 13;
  const revision = ++cameraRevision;
  cameraReady.value = false;
  map.fitBounds(bounds, {
    padding,
    maxZoom: 17,
    linear: true,
    duration: positioned && props.expanded ? 750 : 0,
    easing: progress => (1 - Math.cos(progress * Math.PI)) / 2,
  });
  const reveal = () => { if (revision === cameraRevision && state.value !== "unavailable") cameraReady.value = true; };
  if (map.isMoving?.()) map.once("moveend", reveal);
  else reveal();
  positioned = true;
}

async function selectLayer() {
  request?.abort();
  cameraRevision++;
  cameraReady.value = false;
  const controller = new AbortController();
  request = controller;
  const { signal } = controller;
  const reference = props.reference;
  selectedSubsite.value = undefined;
  if (reference.scope !== "woodland" && reference.scope !== "park") transitMode.value = false;
  const point = origin.value;
  const from = point && { lon: point.lon, lat: point.lat };
  state.value = "loading";
  route.value = undefined;
  access.value = undefined;
  drawRoute();
  updateHome();
  try {
    const next = await getGreenSpaceMapData(reference, props.expanded ? from : undefined, signal);
    if (signal.aborted) return;
    data.value = next;
    if (!next || (next.boundary.type !== "Polygon" && next.boundary.type !== "MultiPolygon")) throw new Error("Missing boundary");
    drawSelection();
    state.value = "ready";
    if (props.expanded && park.value && from) {
      if (gardenWalk.value) {
        access.value = "entrance";
        route.value = gardenWalk.value;
        drawRoute();
        return;
      }
      void routeToGreenSpace(next, reference, from, props.mapLabel, signal).then(result => {
        if (signal.aborted || gardenWalk.value) return;
        access.value = result.access;
        route.value = result.route;
        if (result.route || result.access === "inside") emit("walk-duration", reference, (result.route?.durationSeconds ?? 0) / 60);
        drawRoute();
      }).catch(() => {
        if (!signal.aborted) access.value = "unavailable";
      });
    }
  } catch {
    if (signal.aborted) return;
    data.value = undefined;
    drawSelection();
    state.value = "unavailable";
    currentParkPlaces.value = [];
    cameraReady.value = true;
  }
}

onMounted(() => {
  if (!host.value) return;
  try {
    const from = origin.value;
    setWorkerUrl(workerUrl);
    map = new MapLibreMap({
      container: host.value,
      center: from ? [from.lon, from.lat] : [2.35, 48.86],
      zoom: 12,
      interactive: props.expanded,
      attributionControl: { compact: true },
      canvasContextAttributes: { contextType: "webgl2", antialias: true },
    });
    if (!map.getCanvas().getContext("webgl2")) return failMap();
    map.getCanvas().addEventListener("webglcontextlost", failMap, { once: true });
    timer = setTimeout(failMap, 8000);
    map.once("style.load", () => {
      if (!map) return;
      if (timer) clearTimeout(timer);
      for (const id of ["scope", "canopy", "walk", "transit", "subsite"]) map.addSource(id, { type: "geojson", data: geojson() });
      map.addLayer({ id: "scope-fill", type: "fill", source: "scope", paint: { "fill-color": "#22a362", "fill-opacity": 0.45 } });
      map.addLayer({ id: "canopy-fill", type: "fill", source: "canopy", paint: { "fill-color": "#137a46", "fill-opacity": 0.65 } });
      map.addLayer({ id: "scope-outline", type: "line", source: "scope", paint: { "line-color": "#225668", "line-width": 2 } });
      map.addLayer({ id: "green-space-subsite", type: "fill", source: "subsite",
        filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#087849", "fill-opacity": 0.48, "fill-outline-color": "#075937" } });
      map.addLayer({ id: "green-space-subsite-point", type: "circle", source: "subsite",
        filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#087849", "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#fff" } });
      map.addLayer({ id: "green-space-transit-casing", type: "line", source: "transit",
        filter: ["==", ["geometry-type"], "LineString"], layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#fff", "line-width": 7 } });
      map.addLayer({ id: "green-space-transit-route", type: "line", source: "transit",
        filter: ["==", ["geometry-type"], "LineString"], layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["coalesce", ["get", "color"], "#174ac2"], "line-width": 4.5 } });
      map.addLayer({ id: "walking-route", type: "line", source: "walk", layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#174ac2", "line-width": 3, "line-dasharray": [1, 2] } });
      map.addLayer({ id: "green-space-transit-stops", type: "circle", source: "transit", filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-color": "#174ac2", "circle-radius": 4, "circle-stroke-width": 2, "circle-stroke-color": "#fff" } });
      if (props.expanded) equipmentLayer = createParkEquipmentLayer(map);
      styleReady.value = true;
      drawSelection();
      observer = new ResizeObserver(() => {
        map?.resize();
        if (!props.expanded && bounds) map?.fitBounds(bounds, { padding: 13, maxZoom: 17, animate: false });
      });
      if (host.value) observer.observe(host.value);
    });
    map.setStyle(DEFAULT_NEXT_VECTOR_STYLE_URL, { transformStyle: (_, style) => normalizeMapLibreReferenceFilters(style) });
  } catch {
    failMap();
  }
  void selectLayer();
});

const selectionKey = computed(() => {
  const reference = props.reference;
  return JSON.stringify([reference.scope, "id" in reference ? reference.id : undefined,
    "code" in reference ? reference.code : undefined, reference.version,
    "lon" in reference ? reference.lon : undefined, "lat" in reference ? reference.lat : undefined,
    reference.scope === "woodland" ? reference.mainAccess : undefined, props.origin?.lon, props.origin?.lat]);
});
watch(selectionKey, selectLayer);
watch(gardenWalk, walk => {
  if (walk && state.value === "ready" && props.expanded) {
    access.value = "entrance";
    route.value = walk;
    drawRoute();
  }
});
watch(focusedSubsite, () => {
  if (state.value === "ready") drawSelection();
});
watch([showTransit, transitRow], ([enabled, row]) => {
  if (enabled && row?.summary) emit("transit-duration", props.reference, row.summary.elapsedMinutes);
  drawRoute();
  if (state.value === "ready" && (!enabled || row)) fitSelection();
});
onBeforeUnmount(() => { request?.abort(); dispose(); });
</script>

<template>
  <div class="greenery-preview" :class="{ 'greenery-preview--expanded': expanded }">
    <div v-show="!mapUnavailable && (expanded || state !== 'unavailable')" ref="host" class="greenery-preview__map"
      :role="expanded ? 'region' : 'img'" :aria-label="mapLabel ?? t('nearbyStations.neighborhoodScore.canopyLevels.map')"
      :aria-busy="state === 'loading' || !styleReady" data-testid="greenery-webgl-map" />
    <button v-if="expanded && park && !mapUnavailable && state === 'ready'" type="button"
      class="greenery-equipment-switch" role="switch" :aria-checked="showEquipment" @click="showEquipment = !showEquipment">
      <span class="greenery-equipment-switch__track" aria-hidden="true" />
      {{ t(`${messages}.equipment`) }}
    </button>
    <p v-if="expanded && !mapUnavailable && (state === 'loading' || (!styleReady && state === 'ready'))"
      class="greenery-preview__status" role="status">{{ t(`${messages}.loading`) }}</p>
    <p v-if="mapUnavailable || state === 'unavailable'" :class="{ 'greenery-preview__status': expanded }"
      role="status" :tabindex="expanded ? 0 : undefined">
      {{ t('nearbyStations.neighborhoodScore.canopyLevels.mapUnavailable') }}
    </p>
    <aside v-if="expanded && park && state === 'ready' && (area || openingHours || access || transitTarget || subsites.length)"
      class="greenery-preview__details" :aria-label="mapLabel">
      <div class="greenery-preview__heading">
        <strong v-if="mapLabel">{{ mapLabel }}</strong>
        <div v-if="transitTarget" class="greenery-preview__mode" role="group" :aria-label="t(`${messages}.travelMode`)">
          <button type="button" :aria-label="t(`${messages}.walk`)" :title="t(`${messages}.walk`)"
            :aria-pressed="!showTransit" @click="transitMode = false">
            <Footprints :size="17" aria-hidden="true" />
          </button>
          <button type="button" :aria-label="t(`${messages}.transitToggle`)" :title="t(`${messages}.transitToggle`)"
            :aria-pressed="showTransit" @click="transitMode = true">
            <TrainFront :size="17" aria-hidden="true" />
          </button>
        </div>
      </div>
      <dl v-if="area || openingHours">
        <div v-if="area"><dt>{{ t(`${messages}.area`) }}</dt><dd>{{ area }}</dd></div>
        <div v-if="openingHours"><dt>{{ t(`${messages}.openingHours`) }}</dt><dd>{{ openingHours }}</dd></div>
      </dl>
      <details v-if="subsites.length" class="greenery-preview__subsites">
        <summary>{{ t(`${messages}.subsites`) }}</summary>
        <ul><li v-for="site in subsites" :key="site.name">
          <button type="button" :disabled="mapUnavailable" :aria-pressed="selectedSubsite === site.name"
            @click="selectedSubsite = selectedSubsite === site.name ? undefined : site.name">{{ site.name }}</button>
        </li></ul>
      </details>
      <div v-if="showTransit" aria-live="polite" class="greenery-preview__transit-result">
        <template v-if="transitRow?.summary">
          <p class="greenery-preview__transit-metrics">
            <LineIconBadge v-if="!lineMarkerHost && transitRow.legs[0]" :line="transitRow.legs[0].badge" compact eager fallback-until-loaded />
            <strong>{{ t(`${messages}.transitMinutes`, { minutes: transitRow.summary.elapsedMinutes }) }}</strong>
          </p>
          <small v-if="transitRow.status === 'missingGeometry' || transitRow.status === 'partialGeometry'">
            {{ t(`nearbyStations.neighborhoodScore.journeyPreview.${transitRow.status}`) }}
          </small>
        </template>
        <p v-else>{{ t(`${messages}.${transitStatus === 'unavailable' ? 'transitUnavailable' : transitStatus === 'error' ? 'transitError' : 'transitLoading'}`) }}</p>
      </div>
      <p v-else-if="access === 'inside' || access === 'unavailable'">{{ t(`${messages}.${access}`) }}</p>
      <p v-else-if="route && (access === 'entrance' || access === 'edge' || access === 'main')" class="greenery-preview__route">
        <span aria-hidden="true" />
        {{ t(`${messages}.${access}`, { minutes: Math.ceil(route.durationSeconds / 60) }) }}
      </p>
    </aside>
    <Teleport v-if="lineMarkerHost && transitRow?.legs[0]" :to="lineMarkerHost">
      <div class="greenery-preview__line-label">
        <LineIconBadge :line="transitRow.legs[0].badge" compact eager fallback-until-loaded />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.greenery-equipment-switch { position: absolute; z-index: 2; inset: 12px auto auto 12px; display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 4px 10px; border: 1px solid #d4ddd7; border-radius: 8px; background: #fff; color: #23352e; box-shadow: 0 1px 4px #0002; font: inherit; font-size: .8rem; cursor: pointer; }
.greenery-equipment-switch__track { box-sizing: border-box; display: grid; align-items: center; width: 27px; height: 16px; padding: 2px; border-radius: 9px; background: #697771; }
.greenery-equipment-switch__track::before { content: ""; width: 12px; height: 12px; border-radius: 50%; background: #fff; }
.greenery-equipment-switch[aria-checked="true"] .greenery-equipment-switch__track { background: #176649; }
.greenery-equipment-switch[aria-checked="true"] .greenery-equipment-switch__track::before { justify-self: end; }
.greenery-equipment-switch:focus-visible { outline: 2px solid #174ac2; outline-offset: 2px; }
.greenery-preview { margin-top: .6rem; width: min(340px, calc(100vw - 84px)); }
.greenery-preview__map { height: 168px; border-radius: 7px; overflow: hidden; background: var(--surface-soft); }
.greenery-preview p { margin: 0; font-size: .76rem; }
.greenery-preview--expanded { position: relative; margin: 0; width: 100%; height: 100%; }
.greenery-preview--expanded .greenery-preview__map { height: 100%; min-height: 12rem; border-radius: 0; }
.greenery-preview .greenery-preview__status {
  position: absolute;
  inset-block-start: .75rem;
  inset-inline-start: .75rem;
  padding: .55rem .7rem;
  background: var(--surface);
  color: var(--ink);
  font-size: .875rem;
}
.greenery-preview__details {
  position: absolute;
  inset-inline-end: .75rem;
  inset-block-end: 2rem;
  box-sizing: border-box;
  max-width: min(20rem, calc(100% - 1.5rem));
  max-height: 45%;
  overflow: auto;
  padding: .7rem .8rem;
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  font-size: .85rem;
}
.greenery-preview__details dl { display: grid; gap: .25rem; margin: .35rem 0 0; }
.greenery-preview__details dl div { display: grid; grid-template-columns: 5rem 1fr; gap: .45rem; }
.greenery-preview__details dt { color: var(--muted); }
.greenery-preview__details dd { margin: 0; overflow-wrap: anywhere; }
.greenery-preview__details p { margin-top: .35rem; }
.greenery-preview__subsites { margin-top: .4rem; }
.greenery-preview__subsites summary { cursor: pointer; }
.greenery-preview__subsites ul { margin-block: .25rem; padding-inline-start: 1.2rem; }
.greenery-preview__subsites button { border: 0; padding: .3rem; background: transparent; color: inherit; cursor: pointer; text-align: left; }
.greenery-preview__subsites button[aria-pressed="true"] { font-weight: 750; text-decoration: underline; }
.greenery-preview__heading { display: flex; align-items: center; justify-content: space-between; gap: .45rem; }
.greenery-preview__mode {
  display: flex;
  flex: 0 0 auto;
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}
.greenery-preview__mode button {
  display: grid;
  place-items: center;
  width: 2.5rem;
  min-height: 2.75rem;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}
.greenery-preview__mode button[aria-pressed="true"] { background: #174ac2; color: #fff; }
.greenery-preview__mode button:focus-visible { outline: 2px solid #174ac2; outline-offset: 2px; }
.greenery-preview__transit-metrics { display: flex; align-items: center; gap: .4rem; flex-wrap: wrap; }
.greenery-preview__transit-result small { display: block; margin-top: .2rem; color: var(--muted); }
.greenery-preview__route { display: flex; align-items: center; gap: .4rem; }
.greenery-preview__route span { width: 1.15rem; flex: 0 0 auto; border-top: 2px dashed #174ac2; }
.greenery-preview__map :deep(.greenery-home-marker) {
  width: 32px;
  height: 32px;
  border: 2px solid white;
  border-radius: 50%;
  background: #174ac2 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 21v-7h6v7'/%3E%3C/svg%3E") center / 18px no-repeat;
  box-shadow: 0 1px 4px #10233f55;
}
</style>
