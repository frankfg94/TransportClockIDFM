import { projectLonLat, projectMercatorPointToViewport } from "../network-ghost/geoProjection";
import type { LineSearchOption } from "../../types/transit";
import type { LineGeometryRequest, LineGeometryResolution } from "./lineGeometry";
import { alignLineGeometrySegmentEndpoints, buildLineGeometryRenderPlan } from "./lineGeometry";
import type { LineMapBranchView, LineMapStopView, LineMapViewModel } from "./types";

export function createLineGeometryRequest(
  map: LineMapViewModel,
  useGtfs: boolean,
): LineGeometryRequest | undefined {
  return createLineGeometryRequestFromParts(
    { id: map.lineId, label: map.lineLabel },
    map.stops,
    map.branches,
    useGtfs,
  );
}

export function createLineGeometryRequestFromParts(
  line: Pick<LineSearchOption, "id" | "label">,
  stops: LineMapStopView[],
  branches: LineMapBranchView[],
  useGtfs: boolean,
): LineGeometryRequest | undefined {
  const coordinateStops = stops.flatMap((stop) =>
    typeof stop.lon === "number" && typeof stop.lat === "number"
      ? [{ id: stop.id, label: stop.label, lon: stop.lon, lat: stop.lat }]
      : [],
  );
  if (coordinateStops.length !== stops.length || coordinateStops.length < 2) {
    return undefined;
  }

  return {
    lineId: line.id,
    lineLabel: line.label,
    useGtfs,
    stops: coordinateStops,
    branches: branches.map((branch) => ({
      id: branch.id,
      direction: branch.direction,
      stopIds: branch.stopIds,
    })),
  };
}

export function applyResolvedLineGeometry(
  map: LineMapViewModel,
  resolution: LineGeometryResolution,
): LineMapViewModel {
  if (!map.viewport) return map;
  const renderPlan = buildLineGeometryRenderPlan(
    resolution,
    (coordinate) =>
      projectMercatorPointToViewport(projectLonLat(coordinate.lon, coordinate.lat), map.viewport!),
    {
      minimumPointDistance: 0.00001,
      minimumCornerSegmentLength: 0.003,
      maximumCornerRadius: 0.007,
    },
  );
  const alignmentOptions = {
    minimumPointDistance: 0.00001,
    minimumCornerSegmentLength: 0.003,
    maximumCornerRadius: 0.007,
    maximumEndpointSnapDistance: 0.004,
  };
  const aligned = alignLineGeometrySegmentEndpoints(
    renderPlan.segments,
    new Map(map.stops.map((stop) => [stop.id, { x: stop.x, y: stop.y }])),
    alignmentOptions,
  );
  const geometryByEdge = new Map(aligned.segments.map((segment) => [segment.id, segment]));
  const providerSegments = aligned.segments.map((segment) => ({
    id: segment.id,
    fromStopId: segment.fromStopId,
    toStopId: segment.toStopId,
    polyline: segment.points,
  }));

  return {
    ...map,
    geometrySource: renderPlan.source,
    geometryAttempts: renderPlan.attempts,
    geometryDatasetVersion: renderPlan.datasetVersion,
    stops: map.stops.map((stop) => {
      const point = aligned.stopPoints.get(stop.id);
      return point ? { ...stop, x: point.x, y: point.y } : stop;
    }),
    segments:
      renderPlan.topology === "provider"
        ? providerSegments
        : map.segments.map((segment) => {
            const geometry = geometryByEdge.get(segment.id);
            if (!geometry) return segment;

            return {
              ...segment,
              polyline: geometry.points,
            };
          }),
    entrances: renderPlan.entrances.map((entrance) => ({
      ...entrance,
      parentStopId: findEntranceParentStopId(entrance, map.stops),
      ...projectMercatorPointToViewport(projectLonLat(entrance.lon, entrance.lat), map.viewport!),
    })),
  };
}

function findEntranceParentStopId(
  entrance: LineGeometryResolution["entrances"][number],
  stops: LineMapStopView[],
): string {
  const referenced = stops.find((stop) => areSameStopReferences(entrance.parentStopId, stop.id));
  return referenced?.id ?? entrance.parentStopId;
}

function areSameStopReferences(left: string, right: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/gu, "");
  return normalize(left) === normalize(right);
}
