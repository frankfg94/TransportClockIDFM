import { COORDINATE_SYSTEM, type Layer, type Position } from "@deck.gl/core";
import { GeoJsonLayer, PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { PathStyleExtension } from "@deck.gl/extensions";
import type {
  TransportMapRenderFrame,
  TransportMapServedCityZone,
} from "../contracts/renderer";
import type { GlobalIsochroneSurface } from "../isochrones/contracts";
import { globalIsochroneZoneIndex, WALKING_ISOCHRONE_ZONE_COLORS } from "../isochrones/palette";
import type {
  TransportMapEntranceRenderRecord,
  TransportMapLabelRenderRecord,
  TransportMapBinaryPathPacket,
  TransportMapPathRenderRecord,
  TransportMapQuayRenderRecord,
  TransportMapStationRenderRecord,
} from "../render/transportMapRenderModel";
import {
  resolveDeckPathColor,
  resolveDeckPathDashArray,
} from "../render/deckgl/deckPathAttributes";

type DeckBinaryPathData = {
  length: number;
  startIndices: Uint32Array;
  attributes: {
    getPath: { value: Float64Array; size: 2 };
    getColor: { value: Uint8Array; size: 4 };
    getWidth: { value: Float32Array; size: 1 };
    getDashArray?: { value: Float32Array; size: 2 };
  };
};

// TextLayer normalizes this value by the SDF radius. Keeping both values at
// 48 gives the labels a real, one-pixel-ish white edge at their 13px display
// size instead of an outline that disappears when the map is downsampled.
const TRANSPORT_LABEL_SDF_OUTLINE_WIDTH = 48;
const TRANSPORT_LABEL_OUTLINE_COLOR = [255, 255, 255, 255] as const;
const TRANSPORT_LABEL_FONT_SETTINGS = { sdf: true, fontSize: 192, buffer: 16, radius: 48, smoothing: 0.22 } as const;
const ZERO_LABEL_PIXEL_OFFSET: [number, number] = [0, 0];

// A packet normally belongs to one role, but keeping the dash variant in the
// cache makes the wrapper identity correct even when a caller reuses a packet
// for a diagnostic layer with a different PathStyleExtension configuration.
const binaryPathDataByPacket = new WeakMap<
  TransportMapBinaryPathPacket,
  Map<boolean, DeckBinaryPathData>
>();

/** Create the small, stable Deck layer set owned by the next experience. */
const isochroneGeoJsonBySurfaces = new WeakMap<readonly GlobalIsochroneSurface[], object>();
const servedCityGeoJsonByZones = new WeakMap<readonly TransportMapServedCityZone[], object>();
const servedCityBoundaryLayersByZones = new WeakMap<
  readonly TransportMapServedCityZone[],
  Map<string, Layer[]>
>();

interface AdministrativeBoundaryRecord {
  path: ReadonlyArray<readonly [number, number]>;
  color: readonly [number, number, number, number];
  haloColor?: readonly [number, number, number, number];
  boundaryEmphasis?: boolean;
}

interface AdministrativeData {
  boundaries: AdministrativeBoundaryRecord[];
  visibleBoundaries: AdministrativeBoundaryRecord[];
  emphasizedBoundaries: AdministrativeBoundaryRecord[];
  innerBoundaries: AdministrativeBoundaryRecord[];
  visibleInnerBoundaries: AdministrativeBoundaryRecord[];
  emphasizedInnerBoundaries: AdministrativeBoundaryRecord[];
  labels: TransportMapServedCityZone[];
  hasVisibleFill: boolean;
}

const DEFAULT_INNER_BOUNDARY_COLOR = [100, 116, 139, 112] as const;
const ADMINISTRATIVE_DASH_EXTENSION = new PathStyleExtension({ dash: true, highPrecisionDash: true });
const ADMINISTRATIVE_DASH_EXTENSIONS = [ADMINISTRATIVE_DASH_EXTENSION];
const INNER_BOUNDARY_DASH: [number, number] = [3, 5];
const CITY_BOUNDARY_DASH: [number, number] = [7, 5];
const WHITE_INNER_BOUNDARY_HALO = [255, 255, 255, 190] as const;
const WHITE_DETAIL_INNER_BOUNDARY_HALO = [255, 255, 255, 225] as const;
const WHITE_CITY_BOUNDARY_HALO = [255, 255, 255, 235] as const;
const DARK_INNER_BOUNDARY = [45, 55, 72, 225] as const;
const REGIONAL_INNER_BOUNDARY = [45, 55, 72, 142] as const;
const DARK_CITY_BOUNDARY = [45, 55, 72, 235] as const;

function getAdministrativePath(record: AdministrativeBoundaryRecord): Position[] {
  return record.path as Position[];
}

function getAdministrativeColor(record: AdministrativeBoundaryRecord): readonly [number, number, number, number] {
  return record.color;
}

function getAdministrativeHaloColor(record: AdministrativeBoundaryRecord): readonly [number, number, number, number] {
  return record.haloColor ?? record.color;
}

function getInnerBoundaryDashArray(): [number, number] {
  return INNER_BOUNDARY_DASH;
}

function getCityBoundaryDashArray(): [number, number] {
  return CITY_BOUNDARY_DASH;
}

function getTransportPath(record: TransportMapPathRenderRecord): Float64Array {
  return record.positions;
}

function getTransportPathColor(record: TransportMapPathRenderRecord): readonly [number, number, number, number] {
  return resolveDeckPathColor(record);
}

function getTransportPathWidth(record: TransportMapPathRenderRecord): number {
  return record?.widthCssPx ?? 1;
}

function getTransportPathDashArray(record: TransportMapPathRenderRecord): readonly [number, number] {
  return resolveDeckPathDashArray(record);
}

function getStationPosition(record: TransportMapStationRenderRecord): Position {
  return record.position as Position;
}

function getStationRadius(record: TransportMapStationRenderRecord): number {
  return record.radiusCssPx;
}

function getStationFillColor(record: TransportMapStationRenderRecord): readonly [number, number, number, number] {
  return record.fillColor;
}

function getStationLineColor(record: TransportMapStationRenderRecord): readonly [number, number, number, number] {
  return record.lineColor;
}

function getStationLineWidth(record: TransportMapStationRenderRecord): number {
  return record.lineWidthCssPx;
}

function getQuayPosition(record: TransportMapQuayRenderRecord): Position {
  return record.position as Position;
}

function getQuayRadius(record: TransportMapQuayRenderRecord): number {
  return record.radiusCssPx;
}

function getQuayLineColor(record: TransportMapQuayRenderRecord): readonly [number, number, number, number] {
  return record.color;
}

function getEntrancePosition(record: TransportMapEntranceRenderRecord): Position {
  return record.position as Position;
}

function getEntranceRadius(record: TransportMapEntranceRenderRecord): number {
  return record.radiusCssPx;
}

function getEntranceFillColor(record: TransportMapEntranceRenderRecord): readonly [number, number, number, number] {
  return record.color;
}

function getLabelPosition(record: TransportMapLabelRenderRecord): Position {
  return record.position as Position;
}

function getLabelPixelOffset(record: TransportMapLabelRenderRecord): Position {
  return (record.pixelOffsetCssPx ?? ZERO_LABEL_PIXEL_OFFSET) as Position;
}

function getLabelText(record: TransportMapLabelRenderRecord): string {
  return record.text;
}

function getLabelSize(record: TransportMapLabelRenderRecord): number {
  return record.sizeCssPx;
}

function getLabelColor(record: TransportMapLabelRenderRecord): readonly [number, number, number, number] {
  return record.color;
}

function getLabelTextAnchor(record: TransportMapLabelRenderRecord): string {
  return record.textAnchor ?? "start";
}

const QUAY_FILL_COLOR = [255, 255, 255, 255] as const;
const ENTRANCE_LINE_COLOR = [255, 255, 255, 255] as const;

function getServedCityBorderColor(zone: TransportMapServedCityZone): [number, number, number, number] {
  return withAlpha(zone.borderColor, 220);
}

function getServedCityPosition(zone: TransportMapServedCityZone): Position {
  return zone.centroid as Position;
}

function getServedCityPixelOffset(zone: TransportMapServedCityZone): Position {
  return zone.labelPixelOffset;
}

function getServedCityText(zone: TransportMapServedCityZone): string {
  return zone.name;
}

function getServedCityColor(zone: TransportMapServedCityZone): readonly [number, number, number, number] {
  return zone.labelColor;
}

const SERVED_CITY_LABEL_BACKGROUND = [255, 255, 255, 232] as const;
const SERVED_CITY_LABEL_PADDING: [number, number] = [7, 4];
const SERVED_CITY_LABEL_DEPTH = { depthTest: false } as const;
const TRANSPARENT_FILL = [0, 0, 0, 0] as const;

function getServedCityFillColor(feature: { properties?: { fillColor?: readonly [number, number, number, number] } }): readonly [number, number, number, number] {
  return feature.properties?.fillColor ?? TRANSPARENT_FILL;
}

export function deckAdministrativeBoundaryStyleBucket(zoom: number): 0 | 1 | 2 {
  return zoom < 10 ? 0 : zoom < 12 ? 1 : 2;
}

// Deck compares data by identity. A transport hover/chunk update must not
// retessellate all administrative paths or upload their attributes again.
const administrativeDataByZones = new WeakMap<readonly TransportMapServedCityZone[], AdministrativeData>();

function administrativeData(zones: readonly TransportMapServedCityZone[]): AdministrativeData {
  let prepared = administrativeDataByZones.get(zones);
  if (!prepared) {
    const data: AdministrativeData = {
      boundaries: [],
      visibleBoundaries: [],
      emphasizedBoundaries: [],
      innerBoundaries: [],
      visibleInnerBoundaries: [],
      emphasizedInnerBoundaries: [],
      labels: [],
      hasVisibleFill: false,
    };
    for (const zone of zones) {
      if (zone.fillColor[3] > 0) data.hasVisibleFill = true;
      if (zone.showLabel !== false) data.labels.push(zone);
      for (const path of zone.boundaryPaths) {
        const record: AdministrativeBoundaryRecord = {
          path,
          color: zone.borderColor,
          haloColor: withAlpha(zone.borderColor, 82),
          boundaryEmphasis: zone.boundaryEmphasis,
        };
        data.boundaries.push(record);
        (zone.boundaryEmphasis ? data.emphasizedBoundaries : data.visibleBoundaries).push(record);
      }
      for (const path of zone.innerBoundaryPaths ?? []) {
        const record: AdministrativeBoundaryRecord = {
          path,
          color: zone.innerBoundaryColor ?? DEFAULT_INNER_BOUNDARY_COLOR,
          boundaryEmphasis: zone.boundaryEmphasis,
        };
        data.innerBoundaries.push(record);
        (zone.boundaryEmphasis ? data.emphasizedInnerBoundaries : data.visibleInnerBoundaries).push(record);
      }
    }
    prepared = data;
    administrativeDataByZones.set(zones, prepared);
  }
  return prepared;
}

export function createDeckTransportLayers(
  frame: TransportMapRenderFrame,
  beforeId: string | undefined,
  stationLabelOpacity = 1,
): Layer[] {
  const model = frame.model;
  const layers: Layer[] = [];
  if (model.walkingIsochrones?.length) {
    const renderSurfaces = [...model.walkingIsochrones].sort((left, right) => right.minutes - left.minutes || left.id.localeCompare(right.id));
    let data = isochroneGeoJsonBySurfaces.get(model.walkingIsochrones);
    if (!data) {
      data = { type: "FeatureCollection", features: renderSurfaces.map((surface) => ({
        type: "Feature", id: surface.id, properties: {
          mode: surface.mode,
          minutes: surface.minutes,
          surfaceId: surface.id,
          zoneIndex: globalIsochroneZoneIndex(surface, model.walkingIsochrones!),
        }, geometry: surface.geometry,
      })) };
      isochroneGeoJsonBySurfaces.set(model.walkingIsochrones, data);
    }
    const hoveredSurfaceIds = new Set(frame.scene.hoveredIsochroneIds ?? []);
    layers.push(new GeoJsonLayer({
      id: "transport-walking-isochrones", data,
      coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
      filled: true, stroked: true, pickable: false,
      getFillColor: (feature: { properties?: { zoneIndex?: number } }) =>
        WALKING_ISOCHRONE_ZONE_COLORS[feature.properties?.zoneIndex ?? 0]?.deckFill ?? [34, 197, 94, 74],
      getLineColor: (feature: { properties?: { surfaceId?: string; zoneIndex?: number } }) => {
        const colors = WALKING_ISOCHRONE_ZONE_COLORS[feature.properties?.zoneIndex ?? 0] ?? WALKING_ISOCHRONE_ZONE_COLORS[0];
        return feature.properties?.surfaceId && hoveredSurfaceIds.has(feature.properties.surfaceId)
          ? [...colors.deckStroke.slice(0, 3), 235]
          : colors.deckStroke;
      },
      getLineWidth: hoveredSurfaceIds.size
        ? (feature: { properties?: { surfaceId?: string } }) =>
            feature.properties?.surfaceId && hoveredSurfaceIds.has(feature.properties.surfaceId) ? 2 : 1
        : 1,
      lineWidthUnits: "pixels", lineWidthMinPixels: 1,
      ...(beforeId ? { beforeId } : {}),
    } as never));
  }
  if (model.servedCityZones?.length) {
    const administrative = administrativeData(model.servedCityZones);
    if (administrative.hasVisibleFill) layers.push(createServedCityFillLayer(model.servedCityZones, beforeId));
    layers.push(...createServedCityBoundaryLayers(model.servedCityZones, beforeId, frame.camera.zoom));
  }
  if (model.basePaths.length) {
    layers.push(createPathLayer(
      "transport-base",
      model.basePaths,
      frame.binaryPackets?.base,
      beforeId,
      false,
    ));
  }
  if (model.trafficPaths.length) {
    layers.push(createPathLayer(
      "transport-traffic",
      model.trafficPaths,
      frame.binaryPackets?.traffic,
      beforeId,
      true,
    ));
  }
  if (model.highlightPaths.length) {
    layers.push(createPathLayer(
      "transport-highlight",
      model.highlightPaths,
      frame.binaryPackets?.highlight,
      beforeId,
      false,
    ));
  }
  if (model.stations.length) layers.push(createStationLayer(model.stations, beforeId));
  if (model.quays.length) layers.push(createQuayLayer(model.quays, beforeId));
  if (model.entrances.length) layers.push(createEntranceLayer(model.entrances, beforeId));
  layers.push(...createDeckTransportLabelLayers(model.labels, beforeId, stationLabelOpacity));
  // City names are deliberately last: station and entrance labels must not
  // visually cover the context the open "Villes desservies" accordion adds.
  const administrative = model.servedCityZones ? administrativeData(model.servedCityZones) : undefined;
  const labeledCityZones = administrative?.labels ?? [];
  if (labeledCityZones.length) {
    // Keep city titles above the basemap's own city-name labels.
    layers.push(createServedCityLabelLayer(labeledCityZones, undefined));
  }
  return layers;
}

export function createDeckTransportLabelLayers(
  labels: readonly TransportMapLabelRenderRecord[],
  beforeId: string | undefined,
  stationLabelOpacity = 1,
): Layer[] {
  const stationLabels = labels.filter((label) => label.id.startsWith("station-label:"));
  const entranceLabels = labels.filter((label) => label.id.startsWith("entrance-label:"));
  const opacity = Math.max(0, Math.min(1, stationLabelOpacity));
  return [
    ...(stationLabels.length
      ? [createLabelLayer(stationLabels, beforeId, "transport-labels", opacity)]
      : []),
    ...(entranceLabels.length
      ? [createLabelLayer(entranceLabels, beforeId, "transport-entrance-labels", 1)]
      : []),
  ];
}

function createServedCityFillLayer(
  zones: readonly TransportMapServedCityZone[],
  beforeId: string | undefined,
): Layer {
  let data = servedCityGeoJsonByZones.get(zones);
  if (!data) {
    data = {
      type: "FeatureCollection",
      features: zones.map((zone) => ({
        type: "Feature",
        id: zone.id,
        properties: { fillColor: zone.fillColor },
        geometry: zone.geometry,
      })),
    };
    servedCityGeoJsonByZones.set(zones, data);
  }
  return new GeoJsonLayer({
    id: "transport-served-city-zones",
    data,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    filled: true,
    stroked: false,
    pickable: false,
    getFillColor: getServedCityFillColor,
    ...(beforeId ? { beforeId } : {}),
  } as never);
}

function createServedCityBoundaryLayers(
  zones: readonly TransportMapServedCityZone[],
  beforeId: string | undefined,
  zoom: number,
): Layer[] {
  const styleBucket = deckAdministrativeBoundaryStyleBucket(zoom);
  const cacheKey = `${styleBucket}\u0000${beforeId ?? ""}`;
  let byStyleAndOrder = servedCityBoundaryLayersByZones.get(zones);
  const cached = byStyleAndOrder?.get(cacheKey);
  // Layer instances carry Deck's lifecycle state. A layer removed in another
  // zoom bucket cannot be initialized a second time; cache props/data only.
  if (cached) return cached.map((layer) => layer.clone({}));

  const administrative = administrativeData(zones);
  const { boundaries: data, innerBoundaries: innerData } = administrative;
  if (data.length === 0 && innerData.length === 0) return [];
  const { visibleBoundaries: visibleCityBoundaries, emphasizedBoundaries: emphasizedCityBoundaries,
    visibleInnerBoundaries, emphasizedInnerBoundaries } = administrative;

  const commonProps = {
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    widthUnits: "pixels" as const,
    widthMinPixels: 1,
    pickable: false,
    getPath: getAdministrativePath,
    getColor: getAdministrativeColor,
    ...(beforeId ? { beforeId } : {}),
  };

  const layers: Layer[] = [];
  if (visibleInnerBoundaries.length > 0) {
    layers.push(new PathLayer({
      ...commonProps,
      data: visibleInnerBoundaries,
      id: "transport-served-city-inner-boundaries",
      getWidth: 1,
      extensions: ADMINISTRATIVE_DASH_EXTENSIONS,
      getDashArray: getInnerBoundaryDashArray,
      dashJustified: false,
      jointRounded: true,
      capRounded: true,
    } as never));
  }
  if (emphasizedInnerBoundaries.length > 0) {
    const regionalView = zoom < 10;
    if (!regionalView) {
      layers.push(new PathLayer({
        ...commonProps,
        data: emphasizedInnerBoundaries,
        id: "transport-real-estate-city-inner-boundary-halo",
        getColor: zoom < 12 ? WHITE_INNER_BOUNDARY_HALO : WHITE_DETAIL_INNER_BOUNDARY_HALO,
        getWidth: zoom < 12 ? 2.4 : 3.2,
        jointRounded: true,
        capRounded: true,
      } as never));
    }
    layers.push(new PathLayer({
      ...commonProps,
      data: emphasizedInnerBoundaries,
      id: "transport-real-estate-city-inner-boundaries",
      getColor: regionalView ? REGIONAL_INNER_BOUNDARY : DARK_INNER_BOUNDARY,
      getWidth: regionalView ? 0.8 : zoom < 12 ? 1 : 1.25,
      jointRounded: true,
      capRounded: true,
    } as never));
  }
  if (visibleCityBoundaries.length > 0) {
    layers.push(
      new PathLayer({
        ...commonProps,
        data: visibleCityBoundaries,
        id: "transport-served-city-boundary-halo",
        getColor: getAdministrativeHaloColor,
        getWidth: 8,
        jointRounded: true,
        capRounded: true,
      } as never),
      new PathLayer({
        ...commonProps,
        data: visibleCityBoundaries,
        id: "transport-served-city-boundaries",
        getWidth: 2.5,
        extensions: ADMINISTRATIVE_DASH_EXTENSIONS,
        getDashArray: getCityBoundaryDashArray,
        dashJustified: false,
        jointRounded: true,
        capRounded: true,
      } as never),
    );
  }
  if (emphasizedCityBoundaries.length > 0) {
    layers.push(
      new PathLayer({
        ...commonProps,
        data: emphasizedCityBoundaries,
        id: "transport-real-estate-city-boundary-halo",
        getColor: WHITE_CITY_BOUNDARY_HALO,
        getWidth: zoom < 12 ? 3.5 : 4.2,
        jointRounded: true,
        capRounded: true,
      } as never),
      new PathLayer({
        ...commonProps,
        data: emphasizedCityBoundaries,
        id: "transport-real-estate-city-boundaries",
        getColor: DARK_CITY_BOUNDARY,
        getWidth: zoom < 12 ? 1.4 : 1.6,
        jointRounded: true,
        capRounded: true,
      } as never),
    );
  }
  if (!byStyleAndOrder) {
    byStyleAndOrder = new Map();
    servedCityBoundaryLayersByZones.set(zones, byStyleAndOrder);
  }
  byStyleAndOrder.set(cacheKey, layers);
  return layers.map((layer) => layer.clone({}));
}

function createServedCityLabelLayer(
  zones: readonly TransportMapServedCityZone[],
  beforeId: string | undefined,
): Layer {
  return new TextLayer<TransportMapServedCityZone>({
    id: "transport-served-city-labels",
    data: zones,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    billboard: true,
    sizeUnits: "pixels",
    pickable: false,
    background: true,
    getBackgroundColor: SERVED_CITY_LABEL_BACKGROUND,
    getBorderColor: getServedCityBorderColor,
    getBorderWidth: 1.5,
    backgroundBorderRadius: 6,
    backgroundPadding: SERVED_CITY_LABEL_PADDING,
    characterSet: "auto",
    fontFamily: "system-ui, sans-serif",
    fontWeight: 850,
    fontSettings: TRANSPORT_LABEL_FONT_SETTINGS,
    outlineWidth: TRANSPORT_LABEL_SDF_OUTLINE_WIDTH,
    outlineColor: TRANSPORT_LABEL_OUTLINE_COLOR,
    getPosition: getServedCityPosition,
    getPixelOffset: getServedCityPixelOffset,
    getText: getServedCityText,
    getSize: 18,
    getColor: getServedCityColor,
    getTextAnchor: "middle",
    getAlignmentBaseline: "center",
    // These labels are contextual annotations, so keep them visible above
    // station/route geometry even when their ground coordinates overlap.
    parameters: SERVED_CITY_LABEL_DEPTH,
    ...(beforeId ? { beforeId } : {}),
  } as never);
}

function withAlpha(
  color: readonly [number, number, number, number],
  alpha: number,
): [number, number, number, number] {
  return [color[0], color[1], color[2], alpha];
}

function createPathLayer(
  id: string,
  records: readonly TransportMapPathRenderRecord[],
  packet: TransportMapBinaryPathPacket | undefined,
  beforeId: string | undefined,
  dashed: boolean,
): Layer {
  const binaryData = packet ? getBinaryPathData(packet, dashed) : undefined;
  const props = {
    // Binary positions are XY, but Deck tessellates object paths into XYZ.
    // Matching these by the same id can retain the previous buffer stride
    // when GPU storage is reused, stretching paths throughout camera flights.
    // Keep a stable identity per format so incompatible attributes never mix.
    id: `${id}-${binaryData ? "binary" : "object"}`,
    // A ready packet is the actual Deck binary PathLayer data source. Until
    // the asynchronous packet is promoted, the same model remains available
    // through the object accessors below.
    data: binaryData ?? records,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    // `positions` is a flat [longitude, latitude, ...] array. Deck's layer
    // default is XYZ, which would consume every third value and turn the
    // network into long diagonal ribbons. Keep the prepared geometry flat,
    // but explicitly select its two-dimensional position format.
    positionFormat: "XY" as const,
    widthUnits: "pixels" as const,
    widthMinPixels: 1,
    jointRounded: true,
    capRounded: true,
    _pathType: "open" as const,
    pickable: false,
    ...(binaryData
      ? {}
      : {
          getPath: getTransportPath,
          getColor: getTransportPathColor,
          getWidth: getTransportPathWidth,
        }),
    ...(dashed
      ? {
          extensions: ADMINISTRATIVE_DASH_EXTENSIONS,
          ...(binaryData
            ? {}
            : {
                getDashArray: getTransportPathDashArray,
              }),
          // Justification can turn a short interruption fragment into one
          // solid stroke. Keep the shared CSS-pixel rhythm exact instead.
          dashJustified: false,
        }
      : {}),
    ...(beforeId ? { beforeId } : {}),
  } as unknown as ConstructorParameters<typeof PathLayer>[0];
  return new PathLayer(props);
}

function getBinaryPathData(
  packet: TransportMapBinaryPathPacket,
  dashed: boolean,
): DeckBinaryPathData {
  const variants = binaryPathDataByPacket.get(packet);
  const existing = variants?.get(dashed);
  if (existing) return existing;
  const data: DeckBinaryPathData = {
    length: packet.length,
    startIndices: packet.startIndices,
    attributes: {
      getPath: { value: packet.positions, size: 2 },
      getColor: { value: packet.colors, size: 4 },
      getWidth: { value: packet.widths, size: 1 },
      ...(dashed ? { getDashArray: { value: packet.dashArrays, size: 2 } } : {}),
    },
  };
  if (variants) {
    variants.set(dashed, data);
  } else {
    binaryPathDataByPacket.set(packet, new Map([[dashed, data]]));
  }
  return data;
}

function createStationLayer(
  data: readonly TransportMapStationRenderRecord[],
  beforeId: string | undefined,
): Layer {
  return new ScatterplotLayer<TransportMapStationRenderRecord>({
    id: "transport-stations",
    data,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    radiusUnits: "pixels",
    lineWidthUnits: "pixels",
    stroked: true,
    filled: true,
    antialiasing: true,
    pickable: false,
    getPosition: getStationPosition,
    getRadius: getStationRadius,
    getFillColor: getStationFillColor,
    getLineColor: getStationLineColor,
    getLineWidth: getStationLineWidth,
    ...(beforeId ? { beforeId } : {}),
  } as never);
}

function createQuayLayer(
  data: readonly TransportMapQuayRenderRecord[],
  beforeId: string | undefined,
): Layer {
  return new ScatterplotLayer<TransportMapQuayRenderRecord>({
    id: "transport-quays",
    data,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    radiusUnits: "pixels",
    stroked: true,
    filled: true,
    pickable: false,
    getPosition: getQuayPosition,
    getRadius: getQuayRadius,
    getFillColor: QUAY_FILL_COLOR,
    getLineColor: getQuayLineColor,
    getLineWidth: 2,
    ...(beforeId ? { beforeId } : {}),
  } as never);
}

function createEntranceLayer(
  data: readonly TransportMapEntranceRenderRecord[],
  beforeId: string | undefined,
): Layer {
  return new ScatterplotLayer<TransportMapEntranceRenderRecord>({
    id: "transport-entrances",
    data,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    radiusUnits: "pixels",
    stroked: true,
    filled: true,
    pickable: false,
    getPosition: getEntrancePosition,
    getRadius: getEntranceRadius,
    getFillColor: getEntranceFillColor,
    getLineColor: ENTRANCE_LINE_COLOR,
    getLineWidth: 1,
    ...(beforeId ? { beforeId } : {}),
  } as never);
}

function createLabelLayer(
  data: readonly TransportMapLabelRenderRecord[],
  beforeId: string | undefined,
  id: string,
  opacity: number,
): Layer {
  return new TextLayer<TransportMapLabelRenderRecord>({
    id,
    data,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    billboard: true,
    sizeUnits: "pixels",
    pickable: false,
    // The TextLayer default atlas is ASCII-only; `auto` adds accented station
    // names such as "Cité Universitaire" to the SDF glyph atlas.
    characterSet: "auto",
    fontFamily: "system-ui, sans-serif",
    fontWeight: 800,
    // TextLayer outlines require SDF fonts. Generate the atlas at a higher
    // resolution so the 13px labels keep smooth diagonals and accents after
    // MapLibre composites the shared canvas at device-pixel resolution. The
    // extra atlas buffer is intentional: it leaves enough room for the SDF
    // edge instead of clipping the outer pixels before they reach the map.
    fontSettings: TRANSPORT_LABEL_FONT_SETTINGS,
    outlineWidth: TRANSPORT_LABEL_SDF_OUTLINE_WIDTH,
    outlineColor: [
      TRANSPORT_LABEL_OUTLINE_COLOR[0],
      TRANSPORT_LABEL_OUTLINE_COLOR[1],
      TRANSPORT_LABEL_OUTLINE_COLOR[2],
      Math.round(TRANSPORT_LABEL_OUTLINE_COLOR[3] * opacity),
    ],
    getPosition: getLabelPosition,
    getPixelOffset: getLabelPixelOffset,
    getText: getLabelText,
    getSize: getLabelSize,
    getColor: opacity >= 1
      ? getLabelColor
      : (record: TransportMapLabelRenderRecord) => {
          const color = getLabelColor(record);
          return [color[0], color[1], color[2], Math.round(color[3] * opacity)];
        },
    getTextAnchor: getLabelTextAnchor,
    getAlignmentBaseline: "center",
    ...(beforeId ? { beforeId } : {}),
  } as never);
}
