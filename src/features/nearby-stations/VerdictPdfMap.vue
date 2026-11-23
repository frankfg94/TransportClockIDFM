<script setup lang="ts">
import { LngLatBounds, Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import type { GreeneryMapData } from "../../../shared/natureInCity";
import { resolveGlobalMapMarkerIcon } from "../line-map/globalMapMarkerIcons";
import { fetchLineTopology } from "../../services/lineTopology";
import { getCoordinatesDistanceMeters } from "../../services/distance";
import LineIconBadge from "../../components/LineIconBadge.vue";
import { useI18n } from "../../i18n";
import { createLinePresentation, transitFamilyToMode } from "../../services/linePresentation";
import type { TransitFamily } from "../../types/transit";
import { getGreenSpaceMapData } from "./greenSpaceMapData";
import { PLACE_ICON_COMPONENTS } from "./useNearbyPlacePresenter";
import { cityCommercePointsWithinRadius, type CityCommerceLegendCategory, type CityCommercePoint } from "./cityCommerceSnapshot";
import { buildNearbyNoiseWmsUrl } from "./useNearbyNoiseWms";
import { NearbyNoiseWmsColorizer } from "./nearbyNoiseWmsColorizerClient";
import { DEFAULT_NEXT_VECTOR_STYLE_URL, normalizeMapLibreReferenceFilters } from "../transport-map/next/nextMapConfig";
import { boundsAroundPoint, boundsForGeometries, createRadiusGeometry, createVerdictPdfAreaFeatures, createVerdictPdfCommuneBoundary,
  createVerdictPdfStationFeatures, createVerdictPdfTransitFeatures, groupVerdictHeavyStations, projectVerdictPdfStation, transportLineCode, verdictPdfBusTermini, verdictPdfGreenLabelPoint,
  type VerdictPdfHeavyStation, type VerdictPdfMapPoint, type VerdictPdfMapContext, type VerdictPdfMapKind, type VerdictPdfTransitLegendEntry } from "./verdictPdfMaps";
import { worldToLonLat } from "../transport-map/geo/coordinateKernel";
import type { GlobalMapBounds, GlobalMapLine, GlobalMapMode, GlobalMapStation } from "../transport-map/contracts/manifest";
import { groupGlobalMapStations } from "../transport-map/search/globalMapSearch";
import type { VerdictPdfOptions, VerdictPdfPage } from "./verdictPdfReport";

const props = defineProps<{ kind: VerdictPdfMapKind; page: Extract<VerdictPdfPage, { kind: "map" | "legend" }>; context: VerdictPdfMapContext; options: VerdictPdfOptions }>();
const { t, n } = useI18n();
const host = ref<HTMLElement>();
const captionContent = ref<HTMLElement>();
const measuredCaptionHeight = ref<number>();
const imageUrl = ref("");
const ready = ref(false);
const unavailableMessage = ref("");
const map = shallowRef<MapLibreMap>();
const localAbort = new AbortController();
const noiseColorizer = new NearbyNoiseWmsColorizer();
let noiseImageUrl: string | undefined;
let readyTimer: ReturnType<typeof setTimeout> | undefined;
let resolveReady!: () => void;
const readyPromise = new Promise<void>(resolve => { resolveReady = resolve; });
const originPoint = computed(() => props.context.origin);
const title = computed(() => props.page.title);
interface MapLabelPosition {
  label: VerdictPdfMapPoint;
  anchor: VerdictPdfMapPoint;
  leaderLength: number;
  leaderAngle: number;
}
type NamedGreenSpace = GreeneryMapData & { name: string };
const targetPositions = ref<(MapLabelPosition & { outside: boolean; angle: number; access: VerdictPdfHeavyStation })[]>([]);
const busPositions = ref<(MapLabelPosition & { name: string; entries: VerdictPdfTransitLegendEntry[] })[]>([]);
const busDirections = shallowRef(new Map<string, readonly string[]>());
const parkPositions = ref<(MapLabelPosition & { name: string })[]>([]);
const commercePositions = ref<{ key: string; x: number; y: number; count: number; icons: { id: CityCommercePoint["iconId"]; color: string }[] }[]>([]);
const commerceSnapshot = computed(() => props.context.commerce?.snapshot);
const commercePoints = computed(() => {
  const snapshot = commerceSnapshot.value;
  if (!snapshot) return [];
  return props.page.localCommerceFocus && originPoint.value
    ? cityCommercePointsWithinRadius(snapshot, originPoint.value, props.options.maps.commerceFocusRadiusMeters)
    : [...snapshot.commerces];
});
const commerceTotal = computed(() => commercePoints.value.length);
const commerceSummary = computed(() => {
  const snapshot = commerceSnapshot.value;
  if (!snapshot) return t("nearbyStations.neighborhoodScore.pdfReport.commerceUnavailable");
  if (props.page.localCommerceFocus) return t("nearbyStations.neighborhoodScore.pdfReport.commerceNearbyCount", {
    count: n(commerceTotal.value), radius: n(props.options.maps.commerceFocusRadiusMeters / 1_000), cityCount: n(snapshot.recordedTotal),
  });
  return t("nearbyStations.neighborhoodScore.pdfReport.commerceTotal", { count: n(snapshot.recordedTotal) });
});
const allCommerceLegend = computed<CityCommerceLegendCategory[]>(() => {
  const categories = new Map<string, CityCommerceLegendCategory>();
  for (const point of commercePoints.value) {
    const id = `${point.typeKey}:${point.iconId}`;
    const current = categories.get(id);
    if (current) current.count += 1;
    else categories.set(id, { id, labelKey: point.typeKey, iconId: point.iconId, color: point.color, count: 1 });
  }
  return [...categories.values()].sort((left, right) => right.count - left.count || left.labelKey.localeCompare(right.labelKey));
});
const legendOnly = computed(() => props.page.kind === "legend");
const commerceLegend = computed(() => {
  if (!legendOnly.value || props.page.kind !== "legend") return allCommerceLegend.value;
  const pageCount = Math.max(1, props.page.commerceLegendPageCount ?? 1);
  const pageSize = Math.max(1, Math.ceil(allCommerceLegend.value.length / pageCount));
  const start = props.page.commerceLegendOffset ?? ((Math.max(1, props.page.commerceLegendPage ?? 1) - 1) * pageSize);
  return allCommerceLegend.value.slice(start, start + pageSize);
});
const separateLegend = computed(() => props.page.kind === "map" && Boolean(props.page.separateLegend));
const heavyTargets = computed(() => props.page.transitGroup === "rail" ? props.context.heavyAccess ?? [] : []);
const markerPosition = ref({ x: 50, y: 50 });
const originIcon = computed(() => resolveGlobalMapMarkerIcon(props.context.originIcon ?? "pin"));
const isLocalBus = computed(() => props.page.transitGroup === "bus" || props.page.transitGroup === "night");
const localMapRadius = computed(() => isLocalBus.value ? props.options.transit.busNearbyRadiusMeters : 1_000);
function includedMode(mode: string): boolean {
  if (props.page.transitGroup === "bus") return mode === "BUS";
  if (props.page.transitGroup === "night") return mode === "NOCTILIEN";
  return mode !== "BUS" && mode !== "NOCTILIEN";
}
function legendEntry(line: GlobalMapLine): VerdictPdfTransitLegendEntry | undefined {
  if (line.mode === "BIKE") return undefined;
  return { mode: line.mode, line, count: 1, code: transportLineCode(line) };
}
const localStops = computed(() => {
  const stops = new Map<string, { station: GlobalMapStation; distance: number }>();
  const { origin, network } = props.context;
  if (!isLocalBus.value || !origin || !network) return stops;
  const radius = props.options.transit.busNearbyRadiusMeters;
  const stations = new Map([...network.stations, ...(props.context.transit?.["neighborhood-transit"]?.stations ?? [])]
    .map(station => [station.id, station]));
  const candidates = [...stations.values()].filter(station =>
    getCoordinatesDistanceMeters(origin.lat, origin.lon, station.lat, station.lon) <= radius);
  const grouped = groupGlobalMapStations(candidates, [...network.linesById.values()], {
    sameNameMergeMaxDistanceM: props.options.transit.stationGroupingDistanceMeters,
  });
  for (const group of grouped) {
    const members = group.memberStationIds.map(id => stations.get(id)).filter((station): station is GlobalMapStation => Boolean(station));
    for (const id of group.lineIds) {
      const line = network.linesById.get(id);
      if (!line || !includedMode(line.mode)) continue;
      const member = members.filter(station => station.lineIds.includes(id))
        .map(station => ({ station, distance: getCoordinatesDistanceMeters(origin.lat, origin.lon, station.lat, station.lon) }))
        .filter(entry => entry.distance <= radius)
        .sort((left, right) => left.distance - right.distance)[0];
      if (!member || member.distance >= (stops.get(id)?.distance ?? Infinity)) continue;
      stops.set(id, { station: group, distance: member.distance });
    }
  }
  return stops;
});
const routeFeatures = computed(() => {
  const { network, transit } = props.context;
  const kind = props.kind;
  const viewport = kind === "city-transit" || kind === "neighborhood-transit" ? transit?.[kind] : undefined;
  const visible = createVerdictPdfTransitFeatures(network, viewport?.paths, reportBounds()).features;
  const ids = new Set(visible.map(feature => feature.properties.lineId));
  for (const access of heavyTargets.value) for (const line of access.lines) ids.add(line.id);
  // The report camera and the source query use different aspect ratios.
  // Let MapLibre clip detailed rail fragments at the actual map edges.
  const bounds = reportBounds();
  const detailPaths = props.page.transitGroup === "rail"
    ? (transit?.detailedRailPaths ?? []).filter(path => ids.has(path.lineId)
      && (!bounds || path.maxX >= bounds.minX && path.minX <= bounds.maxX && path.maxY >= bounds.minY && path.minY <= bounds.maxY))
    : [];
  const drawable = detailPaths.length
    ? [...visible, ...createVerdictPdfTransitFeatures(network, detailPaths).features] : visible;
  return drawable.filter(feature => includedMode(feature.properties.mode)
    && (!isLocalBus.value || localStops.value.has(feature.properties.lineId)));
});
const transitLegend = computed(() => {
  const network = props.context.network;
  const lines = new Map<string, GlobalMapLine>();
  for (const feature of routeFeatures.value) {
    const line = network?.linesById.get(feature.properties.lineId);
    if (line) lines.set(line.id, line);
  }
  for (const access of heavyTargets.value) for (const line of access.lines) lines.set(line.id, line);
  for (const id of localStops.value.keys()) {
    const line = network?.linesById.get(id);
    if (line) lines.set(line.id, line);
  }
  if (props.page.transitGroup === "night") {
    const codes = new Set(props.context.nightAccess?.map(access => access.code));
    for (const line of network?.linesById.values() ?? []) {
      if (line.mode === "NOCTILIEN" && codes.has(transportLineCode(line))) lines.set(line.id, line);
    }
  }
  return [...lines.values()].flatMap(line => legendEntry(line) ?? [])
    .sort((a, b) => (isLocalBus.value ? busMinutes(a) - busMinutes(b) : 0)
      || a.code.localeCompare(b.code, undefined, { numeric: true }));
});
const heavyStations = computed(() => groupVerdictHeavyStations(heavyTargets.value));
const mapCallouts = computed(() => {
  const origin = originPoint.value;
  return [...heavyStations.value].sort((left, right) => {
    const leftDistance = origin ? getCoordinatesDistanceMeters(origin.lat, origin.lon, left.station.lat, left.station.lon) : Infinity;
    const rightDistance = origin ? getCoordinatesDistanceMeters(origin.lat, origin.lon, right.station.lat, right.station.lon) : Infinity;
    return Number(leftDistance > 1_000) - Number(rightDistance > 1_000)
      || left.minMinutes - right.minMinutes || leftDistance - rightDistance;
  }).slice(0, Math.max(0, Math.floor(props.options.transit.stationCalloutLimit)));
});
const heavyLegend = computed(() => {
  const local: VerdictPdfHeavyStation[] = [];
  const nearby: VerdictPdfHeavyStation[] = [];
  const origin = originPoint.value;
  for (const group of heavyStations.value) {
    const { lat, lon } = group.station;
    const distance = origin ? getCoordinatesDistanceMeters(origin.lat, origin.lon, lat, lon) : Infinity;
    (distance <= 1_000 ? local : nearby).push(group);
  }
  return [
    { title: t("nearbyStations.neighborhoodScore.pdfReport.railLegendNeighborhood"), stations: local, local: true },
    { title: t("nearbyStations.neighborhoodScore.pdfReport.railLegendNearby"), stations: nearby, local: false },
  ];
});
const modeSummary = computed(() => [...new Set(transitLegend.value.map(entry => entry.mode))].map(mode => {
  const count = transitLegend.value.filter(entry => entry.mode === mode).length;
  return `${transportModeLabel(mode)} · ${count === 1
    ? t("nearbyStations.neighborhoodScore.pdfReport.transportLineCountOne")
    : t("nearbyStations.neighborhoodScore.pdfReport.transportLineCountOther", { count })}`;
}).join(" · "));
const legendColumns = computed(() => props.page.transitGroup === "rail" ? 2
  : transitLegend.value.length > 32 ? 4 : transitLegend.value.length > 16 ? 3 : 2);
const captionHeight = computed(() => {
  if (legendOnly.value) return 0;
  if (measuredCaptionHeight.value !== undefined) return measuredCaptionHeight.value;
  if (props.kind === "commerce" && separateLegend.value) return 56;
  if (props.page.transitGroup === "bus" && separateLegend.value) return 48;
  if (props.kind === "commerce") return 62 + Math.ceil(commerceLegend.value.length / 3) * 25
    + (commerceSnapshot.value?.unmappedTotal ? 15 : 0);
  if (props.page.transitGroup === "rail") {
    return 35 + heavyLegend.value.reduce((height, block) => {
      const rows: number[] = [];
      block.stations.forEach((group, index) => {
        const row = Math.floor(index / 2);
        const routeHeight = group.routes.reduce((total, route) =>
          total + Math.max(24, Math.ceil(route.lines.length / 4) * 22), 0);
        rows[row] = Math.max(rows[row] ?? 0, 20 + routeHeight);
      });
      return height + 22 + (rows.length ? rows.reduce((sum, row) => sum + row + 4, 0) : 17);
    }, 0);
  }
  const count = transitLegend.value.length;
  return count ? 35 + Math.ceil(count / legendColumns.value) * 44 : 68;
});
function formatAccess(minutes: number, station: string, via?: string, estimated = false): string {
  const label = via
    ? t("nearbyStations.neighborhoodScore.pdfReport.stationAccessVia", { minutes, via, station })
    : t("nearbyStations.neighborhoodScore.pdfReport.stationAccessWalk", { minutes, station });
  return estimated ? `≈ ${label}` : label;
}
function busWalk(entry: VerdictPdfTransitLegendEntry) {
  const stop = localStops.value.get(entry.line.id);
  const night = props.context.nightAccess?.find(access => entry.code === access.code
    && (!stop || access.station === stop.station.name));
  return {
    station: stop?.station.name ?? night?.station,
    minutes: night?.minutes ?? (stop ? Math.max(1, Math.ceil(stop.distance * 1.3 / 80)) : Infinity),
    estimated: !night,
  };
}
function busMinutes(entry: VerdictPdfTransitLegendEntry): number {
  return busWalk(entry).minutes;
}
function busWalkLabel(entry: VerdictPdfTransitLegendEntry): string {
  const { minutes, estimated } = busWalk(entry);
  return Number.isFinite(minutes)
    ? formatAccess(minutes, "", undefined, estimated).replace(/ · $/u, "")
    : t("nearbyStations.neighborhoodScore.pdfReport.stationAccessUnavailable");
}
async function loadBusDirections(): Promise<void> {
  if (!isLocalBus.value) return;
  const signal = AbortSignal.any([localAbort.signal, AbortSignal.timeout(15_000)]);
  const directions = await Promise.all(transitLegend.value.map(async entry => {
    const stop = localStops.value.get(entry.line.id);
    if (!stop) return [entry.line.id, []] as const;
    const topology = await fetchLineTopology(entry.line.id, signal).catch(() => undefined);
    return [entry.line.id, topology ? verdictPdfBusTermini(topology, stop.station) : []] as const;
  }));
  busDirections.value = new Map<string, readonly string[]>(directions);
}
const ariaLabel = computed(() => {
  if (props.kind === "commerce") {
    const snapshot = commerceSnapshot.value;
    return [title.value, props.page.localCommerceFocus ? undefined : snapshot?.commune.name,
      snapshot ? commerceSummary.value : undefined]
      .filter(Boolean).join(". ");
  }
  const modes = transitLegend.value.map(entry => `${transportModeLabel(entry.mode)} ${entry.count}`).join(", ");
  return [title.value, props.page.subtitle, modes].filter(Boolean).join(". ");
});

const LINE_FAMILY_BY_MODE: Record<Exclude<GlobalMapMode, "BIKE">, TransitFamily> = {
  BUS: "BUS",
  METRO: "METRO",
  RER: "RER",
  TRAIN: "TRANSILIEN",
  TRANSILIEN: "TRANSILIEN",
  TRAM: "TRAM",
  CABLE: "CABLE",
  NOCTILIEN: "NOCTILIEN",
};

function transportModeLabel(mode: Exclude<GlobalMapMode, "BIKE">): string {
  switch (mode) {
    case "BUS": return t("nearbyStations.modes.bus");
    case "METRO": return t("nearbyStations.modes.metro");
    case "RER": return t("nearbyStations.modes.rer");
    case "TRAIN": return t("nearbyStations.modes.train");
    case "TRANSILIEN": return t("nearbyStations.modes.transilien");
    case "TRAM": return t("nearbyStations.modes.tram");
    case "CABLE": return t("nearbyStations.modes.cable");
    case "NOCTILIEN": return t("nearbyStations.modes.noctilien");
  }
}

function transitLineIcon(entry: VerdictPdfTransitLegendEntry) {
  const { line } = entry;
  const family = LINE_FAMILY_BY_MODE[entry.mode];
  const mode = transitFamilyToMode(family);
  const ref = line.sourceLineId ?? line.id;
  const presentation = createLinePresentation({
    code: entry.code,
    color: line.color,
    family,
    id: line.id,
    longName: line.label,
    mode,
    ref,
    shortName: entry.code,
    textColor: line.textColor,
  });
  return {
    family,
    id: line.id,
    mode,
    ref,
    label: entry.code,
    shortName: entry.code,
    longName: line.label,
    color: presentation.color,
    textColor: presentation.textColor,
    iconUrl: line.pictogram ?? presentation.iconUrl,
    iconUrls: presentation.iconUrls,
  };
}


function geojson(geometry?: Geometry): FeatureCollection {
  return { type: "FeatureCollection", features: geometry ? [{ type: "Feature", properties: {}, geometry }] : [] };
}

function reportBounds(): GlobalMapBounds | undefined {
  if (props.kind === "commerce") {
    if (props.page.localCommerceFocus && originPoint.value) {
      return boundsAroundPoint(originPoint.value, props.options.maps.commerceFocusRadiusMeters);
    }
    return boundsForGeometries(props.context.areas.map(area => area.geometry))
      ?? (originPoint.value ? boundsAroundPoint(originPoint.value, 4_000) : undefined);
  }
  if (props.kind === "city-transit") {
    return boundsForGeometries(props.context.areas.map(area => area.geometry)) ?? props.context.network?.bounds;
  }
  if ((props.kind === "neighborhood-transit" || props.kind === "noise") && originPoint.value) {
    return boundsAroundPoint(originPoint.value, localMapRadius.value);
  }
  return boundsForGeometries(props.context.areas.map(area => area.geometry))
    ?? (originPoint.value ? boundsAroundPoint(originPoint.value, 2_500) : props.context.network?.bounds);
}

function toLngLatBounds(bounds: GlobalMapBounds): LngLatBounds {
  const northWest = worldToLonLat({ x: bounds.minX, y: bounds.minY });
  const southEast = worldToLonLat({ x: bounds.maxX, y: bounds.maxY });
  return new LngLatBounds([northWest.lon, southEast.lat], [southEast.lon, northWest.lat]);
}

function areaGeojson(): FeatureCollection {
  return createVerdictPdfAreaFeatures(props.context.areas, props.context.selectedCodes);
}

async function loadGreenSpaces(): Promise<NamedGreenSpace[]> {
  const references = props.context.greenReferences;
  const results = await Promise.allSettled(references.map(async ({ reference, name }) => {
    const geometry = await getGreenSpaceMapData(reference, props.context.origin, localAbort.signal);
    return geometry ? { ...geometry, name: name || geometry.name || "" } : undefined;
  }));
  return results.flatMap(result => result.status === "fulfilled" && result.value ? [result.value] : []);
}

async function loadNoiseImage(): Promise<{ href: string; bounds: GlobalMapBounds } | undefined> {
  const origin = props.context.origin;
  if (!origin) {
    unavailableMessage.value = t("nearbyStations.neighborhoodScore.pdfReport.mapLocationUnavailable");
    return;
  }
  const bounds = boundsAroundPoint(origin, 1_000);
  const url = buildNearbyNoiseWmsUrl(bounds, 2_048, 2_048);
  const response = await fetch(url, { mode: "cors", cache: "force-cache", signal: localAbort.signal });
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/png")) {
    throw new Error(`Bruitparif WMS returned HTTP ${response.status}.`);
  }
  const colored = await noiseColorizer.recolor(await response.blob(), localAbort.signal);
  noiseImageUrl = colored.href;
  return { href: colored.href, bounds };
}

function greenGeojson(spaces: readonly GreeneryMapData[]): FeatureCollection {
  const features: Feature[] = [];
  for (const space of spaces) {
    const boundary = space.mainBoundary ?? space.boundary;
    features.push({ type: "Feature", properties: { layer: "boundary" }, geometry: boundary });
    if (space.canopy) features.push({ type: "Feature", properties: { layer: "canopy" }, geometry: space.canopy });
  }
  return { type: "FeatureCollection", features };
}

function addSourceAndLayers(instance: MapLibreMap, greenSpaces: readonly GreeneryMapData[], noise?: { href: string; bounds: GlobalMapBounds }): void {
  if (props.kind === "commerce") {
    if (!props.context.areas.length) {
      unavailableMessage.value = t("nearbyStations.neighborhoodScore.pdfReport.cityScopeUnavailable");
      return;
    }
    instance.addSource("verdict-commune-boundary", { type: "geojson", data: createVerdictPdfCommuneBoundary(props.context.areas) });
    instance.addLayer({ id: "verdict-commune-boundary", type: "line", source: "verdict-commune-boundary",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#26364a", "line-width": 2.4, "line-opacity": 0.92 } });
    return;
  }
  const bounds = reportBounds();
  const transitPage = props.kind === "city-transit" || props.kind === "neighborhood-transit";
  const viewport = transitPage ? props.context.transit?.[props.kind] : undefined;
  const transitRoutes = { type: "FeatureCollection" as const, features: routeFeatures.value };
  const transitStations = transitPage
    ? createVerdictPdfStationFeatures(props.context.network, bounds, viewport?.stations)
    : { type: "FeatureCollection" as const, features: [] };
  if (transitPage && !transitRoutes.features.length && !transitLegend.value.length) {
    unavailableMessage.value = t("nearbyStations.neighborhoodScore.pdfReport.transitUnavailable");
  }
  if (props.kind === "city-transit" && !props.context.areas.length) {
    unavailableMessage.value ||= t("nearbyStations.neighborhoodScore.pdfReport.cityScopeUnavailable");
  }
  transitStations.features = transitStations.features.filter(feature => includedMode(feature.properties.mode)
    && (!isLocalBus.value || localStops.value.has(feature.properties.lineId)));
  const areaData = areaGeojson();
  const radius = props.context.origin && (props.kind === "neighborhood-transit" || props.kind === "noise")
    ? createRadiusGeometry(props.context.origin, localMapRadius.value)
    : undefined;
  instance.addSource("verdict-areas", { type: "geojson", data: areaData });
  instance.addSource("verdict-green-spaces", { type: "geojson", data: greenGeojson(greenSpaces) });
  instance.addSource("verdict-transit-routes", { type: "geojson", data: transitRoutes });
  instance.addSource("verdict-transit-stations", { type: "geojson", data: transitStations });
  instance.addSource("verdict-origin", { type: "geojson", data: geojson(props.context.origin ? {
    type: "Point", coordinates: [props.context.origin.lon, props.context.origin.lat],
  } : undefined) });
  instance.addSource("verdict-radius", { type: "geojson", data: geojson(radius) });
  if (noise) {
    const northWest = worldToLonLat({ x: noise.bounds.minX, y: noise.bounds.minY });
    const southEast = worldToLonLat({ x: noise.bounds.maxX, y: noise.bounds.maxY });
    instance.addSource("verdict-noise-image", {
      type: "image",
      url: noise.href,
      coordinates: [[northWest.lon, northWest.lat], [southEast.lon, northWest.lat],
        [southEast.lon, southEast.lat], [northWest.lon, southEast.lat]],
    });
    instance.addLayer({ id: "verdict-noise-image", type: "raster", source: "verdict-noise-image", paint: { "raster-opacity": 1, "raster-fade-duration": 0 } });
  }
  instance.addLayer({ id: "verdict-area-fill", type: "fill", source: "verdict-areas", paint: {
    "fill-color": props.kind === "city-transit" ? ["case", ["get", "selected"], "#7461d5", "#8a94a4"] : "#8a94a4",
    "fill-opacity": props.kind === "city-transit" ? ["case", ["get", "selected"], 0.13, 0.035] : 0,
  } });
  instance.addLayer({ id: "verdict-green-fill", type: "fill", source: "verdict-green-spaces", filter: ["==", ["get", "layer"], "boundary"],
    paint: { "fill-color": "#22a362", "fill-opacity": 0.48 } });
  instance.addLayer({ id: "verdict-green-canopy", type: "fill", source: "verdict-green-spaces", filter: ["==", ["get", "layer"], "canopy"],
    paint: { "fill-color": "#137a46", "fill-opacity": 0.65 } });
  instance.addLayer({ id: "verdict-area-outline", type: "line", source: "verdict-areas", paint: {
    "line-color": props.kind === "city-transit" ? ["case", ["get", "selected"], "#6747ca", "#9199a6"] : "#9ba2ad",
    "line-width": props.kind === "city-transit" ? ["case", ["get", "selected"], 2.4, 0.8] : 0.6,
    "line-opacity": 0.8,
  } });
  instance.addLayer({ id: "verdict-green-outline", type: "line", source: "verdict-green-spaces", filter: ["==", ["get", "layer"], "boundary"],
    paint: { "line-color": "#17603e", "line-width": 1.8 } });
  instance.addLayer({ id: "verdict-radius-fill", type: "fill", source: "verdict-radius", paint: { "fill-color": "#6d5bcc", "fill-opacity": 0.035 } });
  instance.addLayer({ id: "verdict-radius-outline", type: "line", source: "verdict-radius", paint: {
    "line-color": "#5b45bd", "line-width": 1.6, "line-dasharray": [2, 1.5], "line-opacity": 0.9,
  } });
  instance.addLayer({ id: "verdict-transit-casing", type: "line", source: "verdict-transit-routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.3, 15, 5.2], "line-opacity": 0.94 } });
  instance.addLayer({ id: "verdict-transit-routes", type: "line", source: "verdict-transit-routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.9, 15, 3.4], "line-opacity": 0.94 } });
  instance.addLayer({ id: "verdict-transit-station-dots", type: "circle", source: "verdict-transit-stations",
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.2, 15, 4],
      "circle-color": ["get", "color"], "circle-stroke-width": 1.2, "circle-stroke-color": "#fff" } });
  instance.addLayer({ id: "verdict-transit-station-labels", type: "symbol", source: "verdict-transit-stations", minzoom: 12.3,
    layout: { visibility: isLocalBus.value ? "none" : "visible", "text-field": ["get", "code"], "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 12, 9, 15, 11], "text-offset": [0, 1.05],
      "text-anchor": "top", "text-allow-overlap": false, "text-ignore-placement": false, "symbol-sort-key": 1 },
    paint: { "text-color": ["get", "color"], "text-halo-color": "#fff", "text-halo-width": 2.2, "text-halo-blur": 0.4 } });
  instance.addLayer({ id: "verdict-origin-point", type: "circle", source: "verdict-origin", paint: {
    "circle-radius": 0, "circle-color": "#bd3c2f", "circle-stroke-width": 3, "circle-stroke-color": "#fff",
  } });
}

function fitMap(instance: MapLibreMap, greenSpaces: readonly GreeneryMapData[] = []): void {
  if (props.kind === "city-transit" || props.kind === "commerce" || props.kind === "greenery") {
    const localCommerceBounds = props.kind === "commerce" && props.page.localCommerceFocus && originPoint.value
      ? boundsAroundPoint(originPoint.value, props.options.maps.commerceFocusRadiusMeters)
      : undefined;
    const geometries: (Polygon | MultiPolygon)[] = props.kind === "greenery"
      ? greenSpaces.map(space => space.mainBoundary ?? space.boundary)
      : props.context.areas.map(area => area.geometry);
    if (props.kind === "greenery" && originPoint.value && geometries.length) {
      geometries.push(createRadiusGeometry(originPoint.value, 100));
    }
    const bounds = localCommerceBounds ?? boundsForGeometries(geometries)
      ?? (originPoint.value ? boundsAroundPoint(originPoint.value, props.kind === "greenery" ? 1_000 : 4_000) : props.context.network?.bounds);
    if (bounds) instance.fitBounds(toLngLatBounds(bounds), {
      padding: props.kind === "commerce" ? 24 : props.kind === "greenery" ? 32 : 30,
      maxZoom: props.kind === "commerce" ? props.options.maps.commerceMaxZoom : props.kind === "city-transit" ? 13 : 15.5, duration: 0,
    });
    else if (originPoint.value) instance.setCenter([originPoint.value.lon, originPoint.value.lat]);
    return;
  }
  if (originPoint.value) {
    const bounds = boundsAroundPoint(originPoint.value, localMapRadius.value);
    instance.fitBounds(toLngLatBounds(bounds), { padding: 26, maxZoom: props.kind === "noise" ? 16.5 : 16, duration: 0 });
  }
}

function finishReady(): void {
  if (ready.value) return;
  ready.value = true;
  if (readyTimer) clearTimeout(readyTimer);
  resolveReady();
}

async function waitUntilReady(): Promise<void> {
  await readyPromise;
  await nextTick();
  if (typeof requestAnimationFrame === "function") {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }
  await nextTick();
  const image = host.value?.parentElement?.querySelector<HTMLImageElement>(".vr-map-image");
  if (image && typeof image.decode === "function") {
    try { await image.decode(); } catch { /* The map notice explains a failed image capture. */ }
  }
}

async function waitForSource(instance: MapLibreMap, sourceId: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!instance.isSourceLoaded(sourceId) && Date.now() < deadline && !localAbort.signal.aborted) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return instance.isSourceLoaded(sourceId);
}

async function waitForPaint(instance: MapLibreMap): Promise<void> {
  await new Promise<void>(resolve => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    };
    const timer = setTimeout(finish, 2_000);
    instance.once("render", finish);
    instance.triggerRepaint();
  });
}

async function renderMap(): Promise<void> {
  if (!host.value) return finishReady();
  readyTimer = setTimeout(() => {
    unavailableMessage.value ||= t("nearbyStations.neighborhoodScore.pdfReport.mapUnavailable");
    localAbort.abort();
    finishReady();
  }, 60_000);

  try {
    setWorkerUrl(workerUrl);
    const instance = new MapLibreMap({
      container: host.value,
      center: originPoint.value ? [originPoint.value.lon, originPoint.value.lat] : [2.35, 48.86],
      zoom: 12,
      interactive: false,
      attributionControl: false,
      canvasContextAttributes: { contextType: "webgl2", antialias: true, preserveDrawingBuffer: true },
    });
    if (!instance.getCanvas().getContext("webgl2")) throw new Error("WebGL2 unavailable");
    map.value = instance;
    const greenPromise = props.kind === "greenery" ? loadGreenSpaces() : Promise.resolve([] as NamedGreenSpace[]);
    const directionsPromise = loadBusDirections();
    await new Promise<void>((resolve, reject) => {
      const onStyleLoad = () => resolve();
      instance.once("style.load", onStyleLoad);
      instance.setStyle(DEFAULT_NEXT_VECTOR_STYLE_URL, { transformStyle: (_previous, style) => normalizeMapLibreReferenceFilters(style) });
      localAbort.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    const noisePromise = props.kind === "noise" ? loadNoiseImage().catch(() => undefined) : Promise.resolve(undefined);
    const [greenSpaces, noise] = await Promise.all([greenPromise, noisePromise, directionsPromise]);
    if (localAbort.signal.aborted) return finishReady();
    if (props.kind === "greenery" && !greenSpaces.length) {
      unavailableMessage.value = t("nearbyStations.neighborhoodScore.pdfReport.greeneryUnavailable");
    }
    if (props.kind === "noise" && !noise) {
      unavailableMessage.value = t("nearbyStations.neighborhoodScore.pdfReport.noiseUnavailable");
    }
    if (props.kind === "commerce") {
      const commerce = props.context.commerce;
      if (!commerce || commerce.status === "unavailable") {
        unavailableMessage.value = t("nearbyStations.neighborhoodScore.pdfReport.commerceUnavailable");
      } else if (commerce.snapshot?.recordedTotal === 0) {
        unavailableMessage.value = t("nearbyStations.neighborhoodScore.pdfReport.commerceEmpty");
      } else if (commerce.snapshot?.unmappedTotal) {
        unavailableMessage.value = t("nearbyStations.neighborhoodScore.pdfReport.commercePartial", { count: commerce.snapshot.unmappedTotal });
      }
    }
    if (props.page.transitGroup) {
      await nextTick();
      if (captionContent.value?.offsetHeight) measuredCaptionHeight.value = captionContent.value.offsetHeight + 17;
      await nextTick();
    }
    instance.resize();
    fitMap(instance, greenSpaces);
    addSourceAndLayers(instance, greenSpaces, noise);
    const idle = await new Promise<boolean>(resolve => {
      const abort = () => finish(false);
      const idleTimer = setTimeout(abort, 30_000);
      function finish(loaded: boolean): void {
        clearTimeout(idleTimer);
        localAbort.signal.removeEventListener("abort", abort);
        resolve(loaded);
      }
      localAbort.signal.addEventListener("abort", abort, { once: true });
      instance.once("idle", () => finish(true));
      instance.triggerRepaint();
    });
    if (localAbort.signal.aborted) return;
    if (!idle) unavailableMessage.value ||= t("nearbyStations.neighborhoodScore.pdfReport.mapUnavailable");
    if (noise && !(await waitForSource(instance, "verdict-noise-image", 15_000))) {
      unavailableMessage.value ||= t("nearbyStations.neighborhoodScore.pdfReport.noiseUnavailable");
    }
    await waitForPaint(instance);
    if (localAbort.signal.aborted) return;
    imageUrl.value = instance.getCanvas().toDataURL("image/png");
    positionMapLabels(instance, greenSpaces);
    if (props.kind === "commerce") positionCommerceMarkers(instance);
  } catch {
    if (!localAbort.signal.aborted) unavailableMessage.value = t("nearbyStations.neighborhoodScore.pdfReport.mapUnavailable");
  } finally {
    map.value?.remove();
    map.value = undefined;
    finishReady();
  }
}

function positionMapLabels(instance: MapLibreMap, greenSpaces: readonly NamedGreenSpace[]): void {
  const { clientWidth: width, clientHeight: height } = instance.getCanvas();
  if (!width || !height) return;
  const origin = originPoint.value ? instance.project([originPoint.value.lon, originPoint.value.lat]) : { x: width / 2, y: height / 2 };
  const percent = (point: VerdictPdfMapPoint) => ({ x: 100 * point.x / width, y: 100 * point.y / height });
  markerPosition.value = percent(origin);
  const occupied = [{ ...origin, halfWidth: 23, halfHeight: 23 }];
  const placeLabel = (anchor: VerdictPdfMapPoint, preferred: VerdictPdfMapPoint, halfWidth: number, halfHeight: number): MapLabelPosition | undefined => {
    const clamp = (point: VerdictPdfMapPoint) => ({
      x: Math.max(halfWidth + 3, Math.min(width - halfWidth - 3, point.x)),
      y: Math.max(halfHeight + 3, Math.min(height - halfHeight - 3, point.y)),
    });
    const offsets = Array.from({ length: 17 }, (_, index) => index - 8);
    const seen = new Set<string>();
    const options = offsets.flatMap(x => offsets.map(y => clamp({
      x: preferred.x + x * (halfWidth + 8),
      y: preferred.y + y * (halfHeight + 7),
    }))).filter(point => {
      const key = `${point.x}:${point.y}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y));
    const label = options.find(point => occupied.every(other => Math.abs(point.x - other.x) >= halfWidth + other.halfWidth + 5
      || Math.abs(point.y - other.y) >= halfHeight + other.halfHeight + 5));
    if (!label) return undefined;
    occupied.push({ ...label, halfWidth, halfHeight });
    return {
      label: percent(label), anchor: percent(anchor),
      leaderLength: Math.hypot(label.x - anchor.x, label.y - anchor.y),
      leaderAngle: Math.atan2(label.y - anchor.y, label.x - anchor.x) * 180 / Math.PI,
    };
  };
  targetPositions.value = mapCallouts.value.flatMap(access => {
    const station = instance.project([access.station.lon, access.station.lat]);
    const projected = projectVerdictPdfStation(station, origin, width, height);
    const { anchor } = projected;
    const preferred = { x: anchor.x, y: anchor.y + (anchor.y > height * 0.8 ? -38 : 38) };
    const position = placeLabel(anchor, preferred, 81, 31);
    return position ? [{ ...position, outside: projected.outside, angle: projected.angle, access }] : [];
  });
  const badgesByStop = new Map<string, { station: GlobalMapStation; entries: VerdictPdfTransitLegendEntry[] }>();
  for (const entry of isLocalBus.value ? transitLegend.value : []) {
    const station = localStops.value.get(entry.line.id)?.station;
    if (!station) continue;
    const stop = badgesByStop.get(station.id) ?? { station, entries: [] };
    stop.entries.push(entry);
    badgesByStop.set(station.id, stop);
  }
  busPositions.value = [...badgesByStop.values()].flatMap(({ station, entries }) => {
    const point = instance.project([station.lon, station.lat]);
    const { anchor } = projectVerdictPdfStation(point, origin, width, height);
    const halfWidth = Math.min(3, entries.length) * 18 + 4;
    const halfHeight = Math.ceil(entries.length / 3) * 12 + 4;
    const position = placeLabel(anchor, { x: anchor.x, y: anchor.y - halfHeight - 9 }, halfWidth, halfHeight);
    return position ? [{ ...position, name: station.name, entries }] : [];
  });
  parkPositions.value = greenSpaces.flatMap(space => {
    const point = space.name && verdictPdfGreenLabelPoint(space.mainBoundary ?? space.boundary);
    if (!point) return [];
    const anchor = instance.project([point.lon, point.lat]);
    const position = placeLabel(anchor, anchor, 77, 22);
    return position ? [{ ...position, name: space.name }] : [];
  });
}

function positionCommerceMarkers(instance: MapLibreMap): void {
  const { clientWidth: width, clientHeight: height } = instance.getCanvas();
  const points = commercePoints.value;
  if (!commerceSnapshot.value || !width || !height) {
    commercePositions.value = [];
    return;
  }
  type ScreenPlace = { x: number; y: number; point: typeof points[number] };
  const cells = new Map<string, ScreenPlace[]>();
  const cellSize = points.length >= props.options.maps.commerceClusterVeryDensePointThreshold
    ? props.options.maps.commerceClusterVeryDenseCellPx
    : points.length >= props.options.maps.commerceClusterDensePointThreshold
      ? props.options.maps.commerceClusterDenseCellPx : props.options.maps.commerceClusterCellPx;
  for (const point of points) {
    const projected = instance.project([point.lon, point.lat]);
    if (projected.x < 0 || projected.y < 0 || projected.x > width || projected.y > height) continue;
    const cellKey = `${Math.floor(projected.x / cellSize)}:${Math.floor(projected.y / cellSize)}`;
    const cell = cells.get(cellKey) ?? [];
    cell.push({ x: projected.x, y: projected.y, point });
    cells.set(cellKey, cell);
  }
  commercePositions.value = [...cells].map(([key, cell]) => {
    const icons = new Map<string, { id: CityCommercePoint["iconId"]; color: string; count: number }>();
    for (const { point } of cell) {
      const iconKey = `${point.iconId}:${point.color}`;
      const current = icons.get(iconKey);
      if (current) current.count += 1;
      else icons.set(iconKey, { id: point.iconId, color: point.color, count: 1 });
    }
    const allIcons = [...icons.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
    return {
      key,
      x: 100 * cell.reduce((sum, entry) => sum + entry.x, 0) / cell.length / width,
      y: 100 * cell.reduce((sum, entry) => sum + entry.y, 0) / cell.length / height,
      count: cell.length,
      icons: allIcons.slice(0, 1),
    };
  });
}

onMounted(() => {
  if (legendOnly.value) {
    if (isLocalBus.value) void loadBusDirections().finally(finishReady);
    else finishReady();
  } else void renderMap();
});
onBeforeUnmount(() => {
  localAbort.abort();
  finishReady();
  noiseColorizer.dispose();
  if (noiseImageUrl?.startsWith("blob:")) URL.revokeObjectURL(noiseImageUrl);
  map.value?.remove();
  map.value = undefined;
});

defineExpose({ waitUntilReady });
</script>

<template>
  <figure class="vr-map-figure" :class="{ 'vr-map-figure--legend': legendOnly, 'vr-map-figure--full-map': separateLegend }"
    role="img" :aria-label="ariaLabel" :data-verdict-map="kind"
    :style="{ '--caption-height': `${captionHeight}px`, '--legend-columns': legendColumns }">
    <div v-if="!legendOnly" ref="host" class="vr-map-canvas" aria-hidden="true" />
    <img v-if="imageUrl && !legendOnly" class="vr-map-image" :src="imageUrl" alt="" />
    <div v-if="imageUrl && !legendOnly" class="vr-map-marker-area" aria-hidden="true">
      <template v-if="kind === 'commerce'">
        <span v-for="marker in commercePositions" :key="marker.key" class="vr-map-commerce-marker"
          :class="{ 'vr-map-commerce-marker--group': marker.count > 1 }"
          :style="{ left: `${marker.x}%`, top: `${marker.y}%` }">
          <span class="vr-map-commerce-marker__icons">
            <component v-for="icon in marker.icons" :key="`${icon.id}:${icon.color}`"
              :is="PLACE_ICON_COMPONENTS[icon.id]" :size="marker.count === 1 ? 13 : 9" :color="icon.color" :stroke-width="2.2" />
          </span>
          <b v-if="marker.count > 1">{{ n(marker.count) }}</b>
        </span>
      </template>
      <template v-for="target in targetPositions" :key="`${target.access.station.name}:${target.access.minMinutes}`">
        <i class="vr-map-leader" :style="{ left: `${target.anchor.x}%`, top: `${target.anchor.y}%`,
          width: `${target.leaderLength}px`, transform: `rotate(${target.leaderAngle}deg)` }" />
        <b class="vr-map-target-pin" :class="{ 'vr-map-target-arrow': target.outside }"
          :style="{ left: `${target.anchor.x}%`, top: `${target.anchor.y}%`, transform: `translate(-50%, -50%) rotate(${target.angle}deg)` }">{{ target.outside ? "➜" : "•" }}</b>
        <span class="vr-map-target" :style="{ left: `${target.label.x}%`, top: `${target.label.y}%` }">
          <span class="vr-map-badges">
            <template v-for="line in target.access.lines" :key="line.id">
              <LineIconBadge v-if="legendEntry(line)" :line="transitLineIcon(legendEntry(line)!)"
                :class="{ 'vr-map-line-badge--wide': legendEntry(line)!.code.length >= 7 }" compact eager />
            </template>
          </span>
          <span>{{ target.access.station.name }}<small>{{ target.access.minMinutes }}<template v-if="target.access.maxMinutes !== target.access.minMinutes">–{{ target.access.maxMinutes }}</template> min</small></span>
        </span>
      </template>
      <template v-for="stop in busPositions" :key="stop.entries[0]?.line.id">
        <i class="vr-map-leader vr-map-leader--bus" :style="{ left: `${stop.anchor.x}%`, top: `${stop.anchor.y}%`,
          width: `${stop.leaderLength}px`, transform: `rotate(${stop.leaderAngle}deg)` }" />
        <span class="vr-map-bus-marker" :style="{ left: `${stop.label.x}%`, top: `${stop.label.y}%` }" :title="stop.name">
          <LineIconBadge v-for="entry in stop.entries" :key="entry.line.id" :data-bus-map-line="entry.line.id"
            :line="transitLineIcon(entry)" compact eager />
        </span>
      </template>
      <template v-for="(park, index) in parkPositions" :key="index">
        <i v-if="park.leaderLength > 5" class="vr-map-leader vr-map-leader--park" :style="{ left: `${park.anchor.x}%`, top: `${park.anchor.y}%`,
          width: `${park.leaderLength}px`, transform: `rotate(${park.leaderAngle}deg)` }" />
        <span class="vr-map-park-name" :style="{ left: `${park.label.x}%`, top: `${park.label.y}%` }">{{ park.name }}</span>
      </template>
      <span v-if="context.origin" class="vr-map-origin" :style="{ left: `${markerPosition.x}%`, top: `${markerPosition.y}%` }"><component :is="originIcon" :size="22" /></span>
    </div>
    <div v-else-if="!legendOnly && !ready" class="vr-map-loading">{{ t("nearbyStations.neighborhoodScore.pdfReport.mapPreparing") }}</div>
    <div v-if="unavailableMessage && !legendOnly" class="vr-map-notice">{{ unavailableMessage }}</div>
    <figcaption class="vr-map-caption">
      <div ref="captionContent" class="vr-map-caption-content">
      <span class="vr-map-attribution">{{ t("nearbyStations.neighborhoodScore.pdfReport.mapAttribution") }}<span v-if="kind === 'noise'"> · {{ t("nearbyStations.neighborhoodScore.pdfReport.noiseAttribution") }}</span></span>
      <div v-if="kind === 'commerce'" class="vr-map-commerce-legend">
        <strong>{{ commerceSummary }}</strong>
        <p v-if="separateLegend && !legendOnly" class="vr-map-legend-hint">{{ t("nearbyStations.neighborhoodScore.pdfReport.commerceLegendOnNextPage") }}</p>
        <div v-if="commerceSnapshot && options.sections.commerceLegend && !separateLegend" class="vr-map-commerce-legend__items">
          <span v-for="category in commerceLegend" :key="category.id" class="vr-map-commerce-legend__item">
            <component :is="PLACE_ICON_COMPONENTS[category.iconId]" :size="14" :color="category.color" :stroke-width="2.2" />
            <span>{{ t(category.labelKey) }}</span><b>{{ n(category.count) }}</b>
          </span>
        </div>
        <small v-if="commerceSnapshot?.unmappedTotal && !props.page.localCommerceFocus">{{ t("nearbyStations.neighborhoodScore.pdfReport.commercePartial", { count: commerceSnapshot.unmappedTotal }) }}</small>
        <small v-if="commerceSnapshot">{{ commerceSnapshot.dataset.attribution }} · {{ commerceSnapshot.dataset.license }}</small>
      </div>
      <span v-if="kind === 'greenery'" class="vr-map-legend"><i class="vr-map-legend__green" />{{ t("nearbyStations.neighborhoodScore.pdfReport.greeneryLegend") }}</span>
      <span v-else-if="kind === 'noise'" class="vr-map-legend">
        <i class="vr-map-legend__low" />{{ t("nearbyStations.noiseZonesLevel1") }}
        <i class="vr-map-legend__medium" />{{ t("nearbyStations.noiseZonesLevel2") }}
        <i class="vr-map-legend__high" />{{ t("nearbyStations.noiseZonesLevel3") }}
      </span>
      <div v-else-if="page.transitGroup === 'rail'" class="vr-map-legend vr-map-legend--rail">
        <span v-if="modeSummary" class="vr-map-mode-summary">{{ modeSummary }}</span>
        <section v-for="block in heavyLegend" :key="block.title" class="vr-map-rail-block" :class="{ 'vr-map-rail-block--local': block.local }">
          <h3>{{ block.title }}</h3>
          <p v-if="!block.stations.length" class="vr-map-rail-empty">{{ t("nearbyStations.neighborhoodScore.pdfReport.railLegendEmpty") }}</p>
          <div v-else class="vr-map-rail-grid">
            <div v-for="group in block.stations" :key="`${group.station.name}:${group.minMinutes}`" class="vr-map-rail-station">
              <strong>{{ group.station.name }}</strong>
              <div v-for="(route, index) in group.routes" :key="index" class="vr-map-rail-route">
                <span class="vr-map-badges">
                  <template v-for="line in route.lines" :key="line.id">
                    <LineIconBadge v-if="legendEntry(line)" :line="transitLineIcon(legendEntry(line)!)"
                      :class="{ 'vr-map-line-badge--wide': legendEntry(line)!.code.length >= 7 }" compact eager />
                  </template>
                </span>
                <small>{{ formatAccess(route.minutes, "", route.via, route.estimated).replace(/ · $/u, "") }}</small>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div v-else-if="page.transitGroup === 'bus' && separateLegend && !legendOnly" class="vr-map-legend-hint">
        <span v-if="modeSummary" class="vr-map-mode-summary vr-map-legend-hint__summary">{{ modeSummary }}</span>
        <span>{{ t("nearbyStations.neighborhoodScore.pdfReport.localBusLegendOnNextPage") }}</span>
      </div>
      <div v-else-if="options.sections.transitLegend && transitLegend.length" class="vr-map-legend vr-map-legend--transit">
        <span class="vr-map-mode-summary">{{ modeSummary }}</span>
        <div v-for="entry in transitLegend" :key="entry.line.id" class="vr-map-bus-row" :data-walking-minutes="busMinutes(entry)">
          <LineIconBadge :line="transitLineIcon(entry)" compact eager />
          <div class="vr-map-bus-details">
            <strong>{{ busWalk(entry).station || entry.code }}</strong>
            <span class="vr-map-bus-walk">{{ busWalkLabel(entry) }}</span>
            <span v-if="busDirections.get(entry.line.id)?.length" class="vr-map-bus-termini">
              {{ t("nearbyStations.neighborhoodScore.pdfReport.busDirection", { stops: busDirections.get(entry.line.id)!.join(" · ") }) }}
            </span>
            <span v-else class="vr-map-bus-termini">{{ t("nearbyStations.neighborhoodScore.pdfReport.busDirectionUnavailable") }}</span>
          </div>
        </div>
      </div>
      </div>
    </figcaption>
  </figure>
</template>

<style scoped>
.vr-map-figure { position: relative; display: flex; flex: 1 1 auto; flex-direction: column; min-height: 280px; margin: 0; overflow: hidden; border: 1px solid #d6dbe3; border-radius: 10px; background: #edf0f3; }
.vr-map-figure--full-map .vr-map-caption { justify-content: space-between; height: var(--caption-height); }
.vr-map-figure--legend { background: #fff; }
.vr-map-figure--legend .vr-map-caption { position: static; flex: 1 1 auto; height: auto; min-height: 0; align-content: flex-start; align-items: flex-start; overflow: hidden; padding: 14px 18px; }
.vr-map-figure--legend .vr-map-caption-content { display: grid; flex: 1 1 auto; grid-template-rows: auto minmax(0, 1fr); align-items: start; gap: 10px; min-height: 0; }
.vr-map-canvas, .vr-map-image { position: absolute; inset: 0 0 var(--caption-height); width: 100%; height: calc(100% - var(--caption-height)); }
.vr-map-canvas { visibility: hidden; pointer-events: none; }
.vr-map-image { display: block; object-fit: cover; }
.vr-map-loading { position: absolute; inset: 0 0 var(--caption-height); display: grid; place-items: center; color: #4f5573; font-size: 12px; font-weight: 700; }
.vr-map-caption { position: absolute; right: 0; bottom: 0; left: 0; display: flex; height: var(--caption-height); flex-wrap: wrap; align-content: center; align-items: center; justify-content: flex-start; gap: 3px 8px; padding: 8px 12px; border-top: 1px solid #e1e4e9; background: #fff; color: #4f5573; font-size: 9px; line-height: 1.2; }
.vr-map-caption-content { display: flex; flex-wrap: wrap; align-items: center; width: 100%; gap: 4px 8px; }
.vr-map-attribution { white-space: nowrap; color: #586378; }
.vr-map-commerce-legend { display: grid; width: 100%; gap: 4px; color: #30364a; }
.vr-map-commerce-legend > strong { font-size: 10px; }
.vr-map-commerce-legend__items { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3px 8px; }
.vr-map-commerce-legend__item { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: center; gap: 4px; min-width: 0; }
.vr-map-commerce-legend__item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vr-map-commerce-legend__item b { font-variant-numeric: tabular-nums; }
.vr-map-commerce-legend small { color: #6a5262; }
.vr-map-legend-hint { color: #372991; font-size: 11px; font-weight: 700; }
.vr-map-legend-hint__summary { color: #30364a; }
.vr-map-figure:not(.vr-map-figure--legend) .vr-map-legend-hint { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
.vr-map-figure--legend .vr-map-commerce-legend { align-content: start; gap: 10px; }
.vr-map-figure--legend .vr-map-commerce-legend > strong { font-size: 15px; }
.vr-map-figure--legend .vr-map-commerce-legend__items { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 16px; }
.vr-map-figure--legend .vr-map-commerce-legend__item { grid-template-columns: 22px minmax(0, 1fr) auto; gap: 7px; padding: 5px 7px; border: 1px solid #e5e7eb; border-radius: 7px; background: #fafbfc; font-size: 11px; }
.vr-map-figure--legend .vr-map-commerce-legend__item span { white-space: normal; }
.vr-map-legend { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; font-weight: 700; }
.vr-map-legend--transit { width: 100%; display: grid; grid-template-columns: repeat(var(--legend-columns), minmax(0, 1fr)); gap: 4px 8px; }
.vr-map-figure--legend .vr-map-legend--transit { align-content: start; align-items: start; gap: 8px 12px; }
.vr-map-figure--legend .vr-map-bus-row { min-height: 43px; padding: 6px 8px; border: 1px solid #e1e6ed; background: #f8fafc; }
.vr-map-bus-row { display: flex; align-items: flex-start; gap: 8px; min-width: 0; padding: 7px 8px; border-radius: 6px; background: #f1f4f8; }
.vr-map-bus-row :deep(.line-icon-badge) { height: 24px; width: 44px; min-width: 44px; justify-content: center; }
.vr-map-bus-row :deep(img) { width: 42px; height: 23px; object-fit: contain; }
.vr-map-bus-details { display: grid; align-content: start; gap: 2px; min-width: 0; }
.vr-map-bus-details strong { font-size: 12px; color: #14213d; }
.vr-map-bus-walk { font-size: 11px; font-weight: 700; color: #372991; }
.vr-map-bus-termini { font-size: 10.5px; font-weight: 500; line-height: 1.25; overflow-wrap: anywhere; }
.vr-map-legend i { display: inline-block; width: 12px; height: 7px; border-radius: 3px; }
.vr-map-legend__green { background: #22a362; }
.vr-map-legend__low { background: #22c55e; }
.vr-map-legend__medium { background: #facc15; }
.vr-map-legend__high { background: #ef4444; }
.vr-map-notice { position: absolute; z-index: 2; top: 12px; left: 50%; max-width: calc(100% - 24px); padding: 7px 10px; transform: translateX(-50%); border: 1px solid #f2d6a8; border-radius: 7px; background: #fff8ea; color: #633d1c; box-shadow: 0 2px 9px #28233a20; font-size: 10px; font-weight: 650; text-align: center; }
@media (max-width: 520px) {
  .vr-map-figure { min-height: 235px; border-radius: 7px; }
  .vr-map-caption { justify-content: flex-start; font-size: 8px; }
  .vr-map-attribution { white-space: normal; }
}
.vr-map-legend--rail { display: grid; width: 100%; gap: 7px; }
.vr-map-rail-block { padding: 6px 10px 8px; background: #f2f4f8; border-radius: 7px; }
.vr-map-rail-block--local { background: #ebe8fa; }
.vr-map-rail-block h3 { margin: 0 0 5px; color: #191b40; font-size: 19px; font-weight: 800; line-height: 1.15; letter-spacing: -0.025em; }
.vr-map-rail-empty { margin: 3px 0 0; font-size: 10px; font-weight: 400; }
.vr-map-rail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 12px; }
.vr-map-rail-station { min-width: 0; padding: 4px 7px; border-radius: 4px; background: #fff; }
.vr-map-rail-station strong { display: block; font-size: 11px; line-height: 15px; }
.vr-map-rail-route { display: flex; align-items: center; gap: 6px; min-height: 21px; }
.vr-map-rail-route small { font-size: 10px; line-height: 1.2; font-weight: 400; }
.vr-map-rail-route .vr-map-badges { max-width: 128px; }
.vr-map-rail-route :deep(.line-icon-badge) { min-width: 32px; width: 32px; height: 20px; justify-content: center; }
.vr-map-rail-route :deep(img) { width: 30px; height: 19px; object-fit: contain; }
.vr-map-rail-route :deep(.line-icon-badge__fallback) { max-width: 32px; height: 18px; }
.vr-map-rail-route :deep(.line-icon-badge__label) { font-size: 10px; padding: 0 2px; }
.vr-map-mode-summary { grid-column: 1 / -1; font-size: 9px; }
.vr-map-bus-marker { position: absolute; z-index: 2; transform: translate(-50%, -50%); display: grid; grid-template-columns: repeat(3, max-content); grid-auto-flow: row; gap: 2px; padding: 3px; background: #fff; border: 1px solid #a2afc1; border-radius: 5px; }
.vr-map-bus-marker :deep(.line-icon-badge) { width: 33px; min-width: 33px; height: 21px; justify-content: center; }
.vr-map-bus-marker :deep(img) { width: 32px; height: 20px; object-fit: contain; }
.vr-map-bus-marker :deep(.line-icon-badge__fallback) { max-width: 33px; height: 18px; }
.vr-map-bus-marker :deep(.line-icon-badge__label) { font-size: 10px; padding: 0 2px; }
.vr-map-leader--bus { background-color: #3f526a; }
.vr-map-marker-area { position: absolute; inset: 0 0 var(--caption-height); pointer-events: none; }
.vr-map-origin { position: absolute; z-index: 3; transform: translate(-50%, -50%); display: grid; place-items: center; width: 34px; height: 34px; color: #fff; background: #bd3c2f; border: 3px solid #fff; border-radius: 50%; box-shadow: 0 2px 5px #0004; }
.vr-map-commerce-marker { position: absolute; z-index: 2; transform: translate(-50%, -50%); display: flex; align-items: center; justify-content: center; min-width: 23px; min-height: 23px; padding: 2px; border: 1px solid #fff; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px #15223555; }
.vr-map-commerce-marker--group { gap: 2px; min-width: 30px; min-height: 24px; padding: 2px 4px; border-color: #334155; border-radius: 10px; }
.vr-map-commerce-marker__icons { display: flex; align-items: center; justify-content: center; gap: 1px; }
.vr-map-commerce-marker b { position: absolute; top: -7px; right: -8px; min-width: 13px; height: 13px; padding-inline: 2px; border-radius: 8px; color: #fff; background: #26364a; font-size: 7px; line-height: 13px; text-align: center; font-variant-numeric: tabular-nums; }
.vr-map-target { position: absolute; z-index: 1; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 4px; padding: 4px 6px; width: 160px; max-width: 160px; box-sizing: border-box; background: #fff; border: 1px solid #5146ff; border-radius: 7px; box-shadow: 0 2px 6px #0003; font-size: 10px; color: #202342; }
.vr-map-target > span { min-width: 0; overflow-wrap: break-word; }
.vr-map-target small { display: block; font-size: 9px; }
.vr-map-target :deep(.line-icon-badge) { flex: 0 0 32px; min-width: 32px; height: 26px; }
.vr-map-target :deep(img) { width: 30px; height: 24px; object-fit: contain; }
.vr-map-target :deep(.line-icon-badge.vr-map-line-badge--wide),
.vr-map-rail-route :deep(.line-icon-badge.vr-map-line-badge--wide) { flex-basis: 72px; min-width: 72px; width: 72px; }
.vr-map-target :deep(.line-icon-badge.vr-map-line-badge--wide img),
.vr-map-rail-route :deep(.line-icon-badge.vr-map-line-badge--wide img) { width: 70px; max-width: 70px; }
.vr-map-target :deep(.line-icon-badge.vr-map-line-badge--wide .line-icon-badge__fallback),
.vr-map-rail-route :deep(.line-icon-badge.vr-map-line-badge--wide .line-icon-badge__fallback) { max-width: 72px; }
.vr-map-target :deep(.line-icon-badge.vr-map-line-badge--wide .line-icon-badge__label),
.vr-map-rail-route :deep(.line-icon-badge.vr-map-line-badge--wide .line-icon-badge__label) { font-size: 9px; min-width: 66px; padding: 0 3px; }
.vr-map-badges { display: inline-flex; flex-wrap: wrap; align-items: center; flex: 0 0 auto; max-width: 150px; }
.vr-map-target .vr-map-badges { max-width: 76px; }
.vr-map-target-pin { position: absolute; z-index: 2; display: grid; place-items: center; width: 17px; height: 17px; line-height: 1; border: 1px solid #5146ff; border-radius: 50%; color: #5146ff; background: #fff; font-size: 16px; }
.vr-map-target-arrow { width: 21px; height: 21px; font-size: 15px; }
.vr-map-leader { position: absolute; height: 1px; background-color: #5146ff; transform-origin: 0 50%; }
.vr-map-leader--park { background-color: #17603e; }
.vr-map-park-name { position: absolute; z-index: 1; transform: translate(-50%, -50%); box-sizing: border-box; max-width: 150px; padding: 4px 6px; border: 1px solid #87ae99; border-radius: 4px; color: #104a31; background: #f4fff8; font-size: 11px; line-height: 1.2; font-weight: 800; text-align: center; }

</style>
