import { projectLonLat, projectMercatorPointToViewport } from "../network-ghost/geoProjection";
import type { LineSearchOption } from "../../types/transit";
import type { LineGeometryRequest, LineGeometryResolution } from "./lineGeometry";
import {
  alignLineGeometrySegmentEndpoints,
  buildLineGeometryRenderPlan,
  projectPointOntoLineGeometry,
} from "./lineGeometry";
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
    Boolean(map.selectedDirectionId),
  );
}

export function createLineGeometryRequestFromParts(
  line: Pick<LineSearchOption, "id" | "label">,
  stops: LineMapStopView[],
  branches: LineMapBranchView[],
  useGtfs: boolean,
  preserveCompleteBranches = false,
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
    // NeTEx can contain timetable variants that no single current GTFS trip
    // covers end-to-end. Resolve physical edges independently so each edge can
    // use the matching indexed shape without falling back for the whole bus.
    branches: preserveCompleteBranches
      ? branches.map((branch) => ({
          id: branch.id,
          direction: branch.direction,
          stopIds: branch.stopIds,
        }))
      : createPhysicalEdgeBranches(branches),
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
  const providerPolylines = providerSegments.map((segment) => segment.polyline);
  const resolvedStops = map.stops.map((stop) => {
    if (renderPlan.topology === "provider") {
      const point = projectPointOntoLineGeometry(stop, providerPolylines);
      return { ...stop, x: point.x, y: point.y };
    }
    const point = aligned.stopPoints.get(stop.id);
    return point ? { ...stop, x: point.x, y: point.y } : stop;
  });
  const resolvedStopPoints = new Map(
    resolvedStops.map((stop) => [stop.id, { x: stop.x, y: stop.y }]),
  );

  return {
    ...map,
    geometrySource: renderPlan.source,
    geometryAttempts: renderPlan.attempts,
    geometryDatasetVersion: renderPlan.datasetVersion,
    stops: resolvedStops,
    // Geometry providers may return raw traces, but the station graph remains
    // the single source of truth for continuity and traffic impact matching.
    segments: map.segments.map((segment) => {
      const geometry = geometryByEdge.get(segment.id);
      if (geometry) {
        return {
          ...segment,
          polyline: geometry.points,
        };
      }

      if (renderPlan.topology !== "provider") return segment;
      const from = resolvedStopPoints.get(segment.fromStopId);
      const to = resolvedStopPoints.get(segment.toStopId);
      return from && to ? { ...segment, polyline: [from, to] } : segment;
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

function createPhysicalEdgeBranches(
  branches: LineMapBranchView[],
): LineGeometryRequest["branches"] {
  const edges = new Map<string, LineGeometryRequest["branches"][number]>();

  branches.forEach((branch) => {
    branch.stopIds.slice(0, -1).forEach((fromStopId, index) => {
      const toStopId = branch.stopIds[index + 1];
      if (fromStopId === toStopId) return;

      const id = [fromStopId, toStopId].sort().join("--");
      if (!edges.has(id)) {
        edges.set(id, { id, stopIds: [fromStopId, toStopId] });
      }
    });
  });

  return [...edges.values()];
}
