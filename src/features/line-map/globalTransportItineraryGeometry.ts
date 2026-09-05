import { getGlobalMapPathSubpathRanges, resolveGlobalMapVertex, type GlobalMapBounds, type GlobalMapLine, type GlobalMapPath, type GlobalMapStation } from "../transport-map/contracts/manifest";
import { lonLatToWorld, worldToLonLat, type WorldPoint } from "../transport-map/geo/coordinateKernel";
import { getCoordinatesDistanceMeters } from "../../services/distance";
import { normalizeGlobalMapSearchText } from "../transport-map/search/globalMapSearch";
import { globalMapLineFamily } from "../transport-map/overlays/ghostLineDirections";
import { MAX_RELIABLE_BOUNDARY_DISTANCE_METERS } from "../nearby-stations/travelBoundary";
import {
  alignNearbyWalkingGeometryToEndpoints,
  createNearbyTravelWalkingSegments,
  type NearbyWalkingMapSegment,
} from "../nearby-stations/nearbyTravelGeometry";
import {
  isNearbyJourneyWalkingSection,
  type NearbyJourneyPoint,
  type NearbyJourneySection,
} from "../nearby-stations/nearbyHeavyTransports";

export type GlobalTransportItinerarySegmentKind = "transit" | "walking";

export interface GlobalTransportItineraryRoute {
  id: string;
  sections: readonly NearbyJourneySection[];
}

export interface GlobalTransportItinerarySegment {
  id: string;
  kind: GlobalTransportItinerarySegmentKind;
  coordinates: NearbyJourneyPoint[];
  color?: string;
  textColor?: string;
  lineId?: string;
  lineCode?: string;
  lineMode?: NearbyJourneySection["lineMode"];
}

export interface GlobalTransportItineraryGeometryOptions {
  resolveTransitGeometry?: (
    section: NearbyJourneySection,
    from: NearbyJourneyPoint,
    to: NearbyJourneyPoint,
  ) => NearbyJourneyPoint[] | undefined;
  resolveTransitExitPoint?: (
    section: NearbyJourneySection,
    target?: NearbyJourneyPoint,
  ) => NearbyJourneyPoint | undefined;
  resolveFinalTransitExitPoint?: (
    section: NearbyJourneySection,
    destination?: NearbyJourneyPoint,
  ) => NearbyJourneyPoint | undefined;
}

/**
 * Normalize a provider journey into map-ready segments. Walking links reuse
 * the same boundary and geometry rules as NearbyStationsMap; transit links
 * use the map's line geometry when supplied, with provider geometry as the
 * initial fallback while the line is loading.
 */
export function createGlobalTransportItinerarySegments(
  route: GlobalTransportItineraryRoute | undefined,
  origin: NearbyJourneyPoint | undefined,
  destination: NearbyJourneyPoint | undefined,
  options: GlobalTransportItineraryGeometryOptions = {},
): GlobalTransportItinerarySegment[] {
  if (!route || !origin || !destination) return [];

  const walkingSegments = new Map(
    createNearbyTravelWalkingSegments(route, origin, destination, {
      resolveTransitExitPoint: options.resolveTransitExitPoint,
      resolveFinalTransitExitPoint: options.resolveFinalTransitExitPoint,
    })
      .map((segment) => [segment.id, segment] as const),
  );

  return route.sections.flatMap((section, index) => {
    const kind = isNearbyJourneyWalkingSection(section) ? "walking" : "transit";
    if (kind === "transit" && !hasTransitIdentity(section)) return [];

    const walking = walkingSegments.get(`${route.id}:walk:${index}`);
    const fallbackFrom = kind === "walking" && walking
      ? walking.from
      : section.fromPoint ?? (index === 0 ? origin : route.sections[index - 1]?.toPoint);
    const fallbackTo = kind === "walking" && walking
      ? walking.to
      : section.toPoint ?? (index === route.sections.length - 1 ? destination : route.sections[index + 1]?.fromPoint);
    if (!fallbackFrom || !fallbackTo || samePoint(fallbackFrom, fallbackTo)) return [];

    const coordinates = resolveCoordinates(
      section,
      kind,
      walking,
      fallbackFrom,
      fallbackTo,
      options,
    );
    if (coordinates.length < 2) return [];

    return [{
      id: `${route.id}:${kind}:${index}`,
      kind,
      coordinates,
      ...(section.lineColor ? { color: section.lineColor } : {}),
      ...(section.lineTextColor ? { textColor: section.lineTextColor } : {}),
      ...(section.lineId ? { lineId: section.lineId } : {}),
      ...((section.lineCode ?? section.lineAliases?.[0])
        ? { lineCode: section.lineCode ?? section.lineAliases?.[0] }
        : {}),
      ...(section.lineMode ? { lineMode: section.lineMode } : {}),
    }];
  });
}

export function getGlobalTransportItineraryBounds(
  segments: readonly GlobalTransportItinerarySegment[],
  points: readonly (NearbyJourneyPoint | undefined)[] = [],
): GlobalMapBounds | undefined {
  const coordinates = [
    ...segments.flatMap((segment) => segment.coordinates),
    ...points.filter((point): point is NearbyJourneyPoint => Boolean(point)),
  ];
  if (coordinates.length === 0) return undefined;

  const worlds = coordinates.map(lonLatToWorld);
  return {
    minX: Math.min(...worlds.map((point) => point.x)),
    minY: Math.min(...worlds.map((point) => point.y)),
    maxX: Math.max(...worlds.map((point) => point.x)),
    maxY: Math.max(...worlds.map((point) => point.y)),
  };
}

function resolveCoordinates(
  section: NearbyJourneySection,
  kind: GlobalTransportItinerarySegmentKind,
  walking: NearbyWalkingMapSegment | undefined,
  from: NearbyJourneyPoint,
  to: NearbyJourneyPoint,
  options: GlobalTransportItineraryGeometryOptions,
): NearbyJourneyPoint[] {
  if (kind === "walking" && walking?.coordinates && walking.coordinates.length >= 2) {
    return alignNearbyWalkingGeometryToEndpoints(walking.coordinates, from, to);
  }
  const transitGeometry = kind === "transit"
    ? options.resolveTransitGeometry?.(section, from, to)
    : undefined;
  // Map vertices have already been resolved exactly as in the normal line
  // renderer. Do not snap them again with the walking-geometry rules.
  if (transitGeometry !== undefined) return transitGeometry;
  if (section.geometry && section.geometry.length >= 2) {
    return alignNearbyWalkingGeometryToEndpoints(section.geometry, from, to);
  }
  return [from, to];
}

export function resolveGlobalTransportItineraryLine(
  section: NearbyJourneySection,
  lines: readonly GlobalMapLine[],
): GlobalMapLine | undefined {
  if (isNearbyJourneyWalkingSection(section)) return undefined;
  const identified = section.lineId && lines.find((line) =>
    line.id === section.lineId || line.sourceLineId === section.lineId,
  );
  if (identified) return identified;

  const references = [section.lineCode, ...(section.lineAliases ?? [])]
    .filter((value): value is string => Boolean(value))
    .map(normalizeGlobalMapSearchText);
  const matches = lines.filter((line) =>
    (!section.lineMode || globalMapLineFamily(line.mode) === globalMapLineFamily(section.lineMode)) &&
    [line.code, line.label, ...line.aliases]
      .some((value) => references.includes(normalizeGlobalMapSearchText(value))),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

type ItineraryPathEdge = { to: string; points: WorldPoint[]; weight: number };

/**
 * Select the travelled portion of the normal map paths, retaining their exact
 * rendered vertices. Chunk boundaries join by coordinate; declared subpaths
 * remain disconnected. No provider selection or shape simplification here.
 */
export function clipGlobalTransportItineraryLine(
  paths: readonly GlobalMapPath[],
  line: GlobalMapLine,
  stationsById: ReadonlyMap<string, GlobalMapStation>,
  section: NearbyJourneySection,
  from: NearbyJourneyPoint,
  to: NearbyJourneyPoint,
): NearbyJourneyPoint[] | undefined {
  const linePaths = paths.filter((path) => path.lineId === line.id);
  if (linePaths.length === 0) return undefined;
  const edges = new Map<string, ItineraryPathEdge[]>();
  const stations = new Map<string, { key: string; point: NearbyJourneyPoint }>();
  for (const path of linePaths) {
    for (const range of getGlobalMapPathSubpathRanges(path)) {
      const vertices = path.vertices.slice(range.start, range.end);
      const points = vertices.map((vertex) => resolveGlobalMapVertex(
        path, vertex, vertex.stationId ? stationsById.get(vertex.stationId) : undefined, line.mode,
      ));
      // Only split at stations and tile boundaries; interior bends are retained
      // verbatim inside each edge, not turned into possible route junctions.
      const anchors = vertices.flatMap((vertex, index) => {
        if (!vertex.stationId && index !== 0 && index !== vertices.length - 1) return [];
        const point = points[index]!;
        const key = vertex.stationId ?? `${point.x.toFixed(10)},${point.y.toFixed(10)}`;
        if (vertex.stationId) stations.set(vertex.stationId, { key, point: worldToLonLat(point) });
        return [{ key, index }];
      });
      for (let index = 1; index < anchors.length; index += 1) {
        const start = anchors[index - 1]!;
        const end = anchors[index]!;
        if (start.key === end.key) continue;
        const span = points.slice(start.index, end.index + 1);
        const weight = span.slice(1).reduce((length, point, i) =>
          length + Math.hypot(point.x - span[i]!.x, point.y - span[i]!.y), 0,
        );
        edges.set(start.key, [...(edges.get(start.key) ?? []), { to: end.key, points: span, weight }]);
        edges.set(end.key, [...(edges.get(end.key) ?? []), { to: start.key, points: [...span].reverse(), weight }]);
      }
    }
  }
  const nearest = (point: NearbyJourneyPoint) => [...stations.values()]
    .map((station) => ({ ...station, distance: getCoordinatesDistanceMeters(
      point.lat, point.lon, station.point.lat, station.point.lon,
    ) }))
    .filter((station) => station.distance <= MAX_RELIABLE_BOUNDARY_DISTANCE_METERS)
    .sort((left, right) => left.distance - right.distance)[0]?.key;
  const start = nearest(from);
  const end = nearest(to);
  if (!start || !end || start === end) return undefined;

  // Served stops constrain branch choice when two branches share termini.
  const via = (section.stopNames ?? []).flatMap((name) => {
    const normalized = normalizeGlobalMapSearchText(name);
    const matching = [...stations.entries()].filter(([id]) => {
      const station = stationsById.get(id);
      return station && [station.name, ...station.aliases]
        .some((label) => normalizeGlobalMapSearchText(label) === normalized);
    });
    return matching.length === 1 ? [matching[0]![1].key] : [];
  });
  const waypoints = [start, ...via.filter((key) => key !== start && key !== end), end]
    .filter((key, index, keys) => index === 0 || key !== keys[index - 1]);
  const coordinates: NearbyJourneyPoint[] = [];
  for (let index = 1; index < waypoints.length; index += 1) {
    const span = findItineraryPath(edges, waypoints[index - 1]!, waypoints[index]!);
    // A gap in the map must not become a straight Navitia connector.
    if (!span) return [];
    coordinates.push(...(coordinates.length ? span.slice(1) : span).map(worldToLonLat));
  }
  return coordinates;
}

function findItineraryPath(
  edges: ReadonlyMap<string, ItineraryPathEdge[]>,
  from: string,
  to: string,
): WorldPoint[] | undefined {
  const distances = new Map([[from, 0]]);
  const previous = new Map<string, { from: string; points: WorldPoint[] }>();
  const pending = new Set([from]);
  while (pending.size > 0) {
    const key = [...pending].sort((left, right) => distances.get(left)! - distances.get(right)!)[0]!;
    pending.delete(key);
    if (key === to) break;
    for (const edge of edges.get(key) ?? []) {
      const distance = distances.get(key)! + edge.weight;
      if (distance >= (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) continue;
      distances.set(edge.to, distance);
      previous.set(edge.to, { from: key, points: edge.points });
      pending.add(edge.to);
    }
  }
  if (!previous.has(to)) return undefined;
  const spans: WorldPoint[][] = [];
  for (let key = to; key !== from;) {
    const edge = previous.get(key)!;
    spans.unshift(edge.points);
    key = edge.from;
  }
  return spans.flatMap((points, index) => index === 0 ? points : points.slice(1));
}

function hasTransitIdentity(section: NearbyJourneySection): boolean {
  return Boolean(section.lineId || section.lineCode || section.lineMode);
}

function samePoint(left: NearbyJourneyPoint, right: NearbyJourneyPoint): boolean {
  return left.lon === right.lon && left.lat === right.lat;
}
