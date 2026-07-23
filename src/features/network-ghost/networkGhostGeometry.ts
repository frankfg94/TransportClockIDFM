import { getTransferLineId } from "../../services/transferLineOptions";
import type { TransferLineOption } from "../../types/transit";
import {
  alignLineGeometrySegmentEndpoints,
  buildLineGeometryRenderPlan,
  createUndirectedEdgeKey,
  type LineGeometryRequest,
  type LineGeometryResolution,
} from "../line-map/lineGeometry";
import {
  projectLonLat,
  projectMercatorPointToViewport,
  type GeographicViewport,
} from "./geoProjection";
import type { NetworkGhostLineView } from "./types";

export function createNetworkGhostGeometryRequest(
  line: NetworkGhostLineView,
  transfer: TransferLineOption,
  useGtfs: boolean,
): LineGeometryRequest | undefined {
  const stops = line.stations.flatMap((station) =>
    station.lon !== undefined && station.lat !== undefined
      ? [{ id: station.id, label: station.label, lon: station.lon, lat: station.lat }]
      : [],
  );
  if (stops.length !== line.stations.length || stops.length < 2 || line.segments.length === 0) {
    return undefined;
  }

  return {
    lineId: getTransferLineId(transfer) ?? line.id,
    lineLabel: line.label,
    useGtfs,
    stops,
    branches: line.branches?.length
      ? line.branches
      : line.segments.map((segment) => ({
          id: segment.id,
          stopIds: [segment.fromStationId, segment.toStationId],
        })),
  };
}

export function applyNetworkGhostGeometry(
  line: NetworkGhostLineView,
  resolution: LineGeometryResolution,
  viewport: GeographicViewport,
): NetworkGhostLineView {
  const alignmentOptions = {
    minimumPointDistance: 0.00001,
    minimumCornerSegmentLength: 0.003,
    maximumCornerRadius: 0.007,
    maximumEndpointSnapDistance: 0.004,
  };
  const plan = buildLineGeometryRenderPlan(
    resolution,
    (coordinate) =>
      projectMercatorPointToViewport(projectLonLat(coordinate.lon, coordinate.lat), viewport),
    alignmentOptions,
  );
  const aligned = alignLineGeometrySegmentEndpoints(
    plan.segments,
    new Map(line.stations.map((station) => [station.id, { x: station.x, y: station.y }])),
    alignmentOptions,
  );
  const geometryByEdge = new Map(
    aligned.segments.map((segment) => [
      createUndirectedEdgeKey(segment.fromStopId, segment.toStopId),
      segment.points,
    ]),
  );
  const providerSegments = aligned.segments.flatMap((segment, index) => {
    const from = segment.points[0];
    const to = segment.points.at(-1);
    if (!from || !to) return [];

    return [
      {
        id: segment.id,
        fromStationId: segment.fromStopId,
        toStationId: segment.toStopId,
        fromX: from.x,
        fromY: from.y,
        toX: to.x,
        toY: to.y,
        polyline: segment.points,
        level: index,
      },
    ];
  });
  const stations = line.stations.map((station) => {
    const point = aligned.stopPoints.get(station.id);
    return point ? { ...station, x: point.x, y: point.y } : station;
  });
  const anchor = stations.find((station) => station.id === line.anchorStationId);

  return {
    ...line,
    ...(anchor ? { anchorX: anchor.x, anchorY: anchor.y } : {}),
    stations,
    geometrySource: plan.source,
    geometryAttempts: plan.attempts,
    segments:
      plan.topology === "provider"
        ? providerSegments
        : line.segments.map((segment) => ({
            ...segment,
            ...(aligned.stopPoints.get(segment.fromStationId)
              ? {
                  fromX: aligned.stopPoints.get(segment.fromStationId)!.x,
                  fromY: aligned.stopPoints.get(segment.fromStationId)!.y,
                }
              : {}),
            ...(aligned.stopPoints.get(segment.toStationId)
              ? {
                  toX: aligned.stopPoints.get(segment.toStationId)!.x,
                  toY: aligned.stopPoints.get(segment.toStationId)!.y,
                }
              : {}),
            polyline:
              geometryByEdge.get(
                createUndirectedEdgeKey(segment.fromStationId, segment.toStationId),
              ) ?? segment.polyline,
          })),
    entrances: plan.entrances.map((entrance) => ({
      ...entrance,
      parentStationId: findEntranceParentStationId(entrance, stations),
      ...projectMercatorPointToViewport(projectLonLat(entrance.lon, entrance.lat), viewport),
    })),
  };
}

function findEntranceParentStationId(
  entrance: LineGeometryResolution["entrances"][number],
  stations: NetworkGhostLineView["stations"],
): string {
  const referenced = stations.find((station) =>
    areSameStopReferences(entrance.parentStopId, station.id),
  );
  return referenced?.id ?? entrance.parentStopId;
}

function areSameStopReferences(left: string, right: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/gu, "");
  return normalize(left) === normalize(right);
}
