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

interface AdministrativeBoundaryRecord {
  path: ReadonlyArray<readonly [number, number]>;
  color: readonly [number, number, number, number];
}

// Deck compares data by identity. A transport hover/chunk update must not
// retessellate all administrative paths or upload their attributes again.
const administrativeDataByZones = new WeakMap<readonly TransportMapServedCityZone[], {
  boundaries: AdministrativeBoundaryRecord[];
  innerBoundaries: AdministrativeBoundaryRecord[];
  labels: TransportMapServedCityZone[];
}>();

function administrativeData(zones: readonly TransportMapServedCityZone[]) {
  let prepared = administrativeDataByZones.get(zones);
  if (!prepared) {
    prepared = {
      boundaries: zones.flatMap((zone) => zone.boundaryPaths.map((path) => ({ path, color: zone.borderColor }))),
      innerBoundaries: zones.flatMap((zone) => (zone.innerBoundaryPaths ?? []).map((path) => ({
        path, color: zone.innerBoundaryColor ?? [100, 116, 139, 112],
      }))),
      labels: zones.filter((zone) => zone.showLabel !== false),
    };
    administrativeDataByZones.set(zones, prepared);
  }
  return prepared;
}

export function createDeckTransportLayers(
  frame: TransportMapRenderFrame,
  beforeId: string | undefined,
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
    layers.push(createServedCityFillLayer(model.servedCityZones, beforeId));
    layers.push(...createServedCityBoundaryLayers(model.servedCityZones, beforeId));
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
  if (model.labels.length) layers.push(createLabelLayer(model.labels, beforeId));
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
    getFillColor: (feature: { properties?: { fillColor?: readonly [number, number, number, number] } }) =>
      feature.properties?.fillColor ?? [0, 0, 0, 0],
    ...(beforeId ? { beforeId } : {}),
  } as never);
}

function createServedCityBoundaryLayers(
  zones: readonly TransportMapServedCityZone[],
  beforeId: string | undefined,
): Layer[] {
  const { boundaries: data, innerBoundaries: innerData } = administrativeData(zones);
  if (data.length === 0 && innerData.length === 0) return [];

  const commonProps = {
    data,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    widthUnits: "pixels" as const,
    widthMinPixels: 1,
    pickable: false,
    getPath: (record: AdministrativeBoundaryRecord) => record.path as Position[],
    getColor: (record: AdministrativeBoundaryRecord) => record.color,
    ...(beforeId ? { beforeId } : {}),
  };

  const layers: Layer[] = [];
  if (innerData.length > 0) {
    layers.push(new PathLayer({
      ...commonProps,
      data: innerData,
      id: "transport-served-city-inner-boundaries",
      getWidth: () => 1,
      extensions: [new PathStyleExtension({ dash: true, highPrecisionDash: true })],
      getDashArray: () => [3, 5],
      dashJustified: false,
      jointRounded: true,
      capRounded: true,
    } as never));
  }
  if (data.length > 0) {
    layers.push(
      new PathLayer({
      ...commonProps,
      id: "transport-served-city-boundary-halo",
      getColor: (record: AdministrativeBoundaryRecord) => withAlpha(record.color, 82),
      getWidth: () => 8,
      jointRounded: true,
      capRounded: true,
      } as never),
      new PathLayer({
        ...commonProps,
        id: "transport-served-city-boundaries",
        getWidth: () => 2.5,
        extensions: [new PathStyleExtension({ dash: true, highPrecisionDash: true })],
        getDashArray: () => [7, 5],
        dashJustified: false,
        jointRounded: true,
        capRounded: true,
      } as never),
    );
  }
  return layers;
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
    getBackgroundColor: () => [255, 255, 255, 232],
    getBorderColor: (zone: TransportMapServedCityZone) => withAlpha(zone.borderColor, 220),
    getBorderWidth: () => 1.5,
    backgroundBorderRadius: 6,
    backgroundPadding: [7, 4],
    characterSet: "auto",
    fontFamily: "system-ui, sans-serif",
    fontWeight: 850,
    fontSettings: { sdf: true, fontSize: 192, buffer: 16, radius: 48, smoothing: 0.22 },
    outlineWidth: TRANSPORT_LABEL_SDF_OUTLINE_WIDTH,
    outlineColor: TRANSPORT_LABEL_OUTLINE_COLOR,
    getPosition: (zone: TransportMapServedCityZone) => zone.centroid as Position,
    getPixelOffset: (zone: TransportMapServedCityZone) => zone.labelPixelOffset,
    getText: (zone: TransportMapServedCityZone) => zone.name,
    getSize: () => 18,
    getColor: (zone: TransportMapServedCityZone) => zone.labelColor,
    getTextAnchor: () => "middle",
    getAlignmentBaseline: () => "center",
    // These labels are contextual annotations, so keep them visible above
    // station/route geometry even when their ground coordinates overlap.
    parameters: { depthTest: false },
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
          getPath: (record: TransportMapPathRenderRecord) => record?.positions ?? [],
          getColor: (record: TransportMapPathRenderRecord) => resolveDeckPathColor(record),
          getWidth: (record: TransportMapPathRenderRecord) => record?.widthCssPx ?? 1,
        }),
    ...(dashed
      ? {
          extensions: [new PathStyleExtension({
            dash: true,
            // Keep the dash phase accurate along multi-vertex interruption
            // spans, especially when several vertices occupy only a few
            // screen pixels after zooming out.
            highPrecisionDash: true,
          })],
          ...(binaryData
            ? {}
            : {
                getDashArray: (record: TransportMapPathRenderRecord) => resolveDeckPathDashArray(record),
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
    getPosition: (record: TransportMapStationRenderRecord) => record.position as Position,
    getRadius: (record: TransportMapStationRenderRecord) => record.radiusCssPx,
    getFillColor: (record: TransportMapStationRenderRecord) => record.fillColor,
    getLineColor: (record: TransportMapStationRenderRecord) => record.lineColor,
    getLineWidth: (record: TransportMapStationRenderRecord) => record.lineWidthCssPx,
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
    getPosition: (record: TransportMapQuayRenderRecord) => record.position as Position,
    getRadius: (record: TransportMapQuayRenderRecord) => record.radiusCssPx,
    getFillColor: () => [255, 255, 255, 255],
    getLineColor: (record: TransportMapQuayRenderRecord) => record.color,
    getLineWidth: () => 2,
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
    getPosition: (record: TransportMapEntranceRenderRecord) => record.position as Position,
    getRadius: (record: TransportMapEntranceRenderRecord) => record.radiusCssPx,
    getFillColor: (record: TransportMapEntranceRenderRecord) => record.color,
    getLineColor: () => [255, 255, 255, 255],
    getLineWidth: () => 1,
    ...(beforeId ? { beforeId } : {}),
  } as never);
}

function createLabelLayer(
  data: readonly TransportMapLabelRenderRecord[],
  beforeId: string | undefined,
): Layer {
  return new TextLayer<TransportMapLabelRenderRecord>({
    id: "transport-labels",
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
    fontSettings: { sdf: true, fontSize: 192, buffer: 16, radius: 48, smoothing: 0.22 },
    outlineWidth: TRANSPORT_LABEL_SDF_OUTLINE_WIDTH,
    outlineColor: TRANSPORT_LABEL_OUTLINE_COLOR,
    getPosition: (record: TransportMapLabelRenderRecord) => record.position as Position,
    getPixelOffset: (record: TransportMapLabelRenderRecord) =>
      (record.pixelOffsetCssPx ?? [0, 0]) as Position,
    getText: (record: TransportMapLabelRenderRecord) => record.text,
    getSize: (record: TransportMapLabelRenderRecord) => record.sizeCssPx,
    getColor: (record: TransportMapLabelRenderRecord) => record.color,
    getTextAnchor: (record: TransportMapLabelRenderRecord) => record.textAnchor ?? "start",
    getAlignmentBaseline: () => "center",
    ...(beforeId ? { beforeId } : {}),
  } as never);
}
