import type { LineGeometryCoordinate } from "../../../src/features/line-map/lineGeometry";
import { resolveTransitLonLat } from "../../../src/features/network-ghost/geoProjection";
import { getCoordinatesDistanceMeters } from "../../../src/services/distance";
import type { GtfsIndexedPattern, GtfsLineArtifact } from "../gtfs/types";
import type { LineTopology, TopologyPattern, TopologyStation } from "./types";

const MAX_STOP_MATCH_DISTANCE_METERS = 450;

interface StopMatch {
  topologyIndex: number;
  stopId: string;
  distanceMeters: number;
}

interface PatternAlignment {
  matches: StopMatch[];
  distanceMeters: number;
}

/**
 * Adds the SIRI stop-area identifiers already present in the precalculated
 * GTFS artifacts to NeTEx patterns. Matching is coordinate based and keeps
 * stop order, which avoids confusing the two directions of close bus stops.
 */
export function attachGtfsMonitoringRefs(
  topology: LineTopology,
  artifact: GtfsLineArtifact,
): LineTopology {
  const stations = new Map(topology.stations.map((station) => [station.id, station]));
  const gtfsPatterns = artifact.patterns.map((pattern) => ({
    ...pattern,
    projections: pattern.projections.length > 0
      ? pattern.projections
      : createEntranceProjections(pattern, artifact.entrances),
  }));

  return {
    ...topology,
    patterns: topology.patterns.map((pattern) =>
      attachPatternMonitoringRefs(pattern, stations, gtfsPatterns),
    ),
  };
}

/**
 * Some GTFS parent stations do not carry coordinates even though their
 * entrances do. The indexer consequently leaves their stop projections
 * empty. Entrance centroids still provide a stable, line-local coordinate for
 * matching those stop ids to the NeTEx sequence.
 */
function createEntranceProjections(
  pattern: GtfsIndexedPattern,
  entrances: GtfsLineArtifact["entrances"],
): GtfsIndexedPattern["projections"] {
  const coordinatesByStop = new Map<string, LineGeometryCoordinate[]>();

  for (const entrance of entrances) {
    const coordinates = coordinatesByStop.get(entrance.parentStopId) ?? [];
    coordinates.push({ lon: entrance.lon, lat: entrance.lat });
    coordinatesByStop.set(entrance.parentStopId, coordinates);
  }

  return pattern.stopIds.flatMap((stopId, index) => {
    const coordinates = coordinatesByStop.get(stopId);
    if (!coordinates || coordinates.length === 0) return [];

    const coordinate = coordinates.reduce(
      (sum, current) => ({ lon: sum.lon + current.lon, lat: sum.lat + current.lat }),
      { lon: 0, lat: 0 },
    );

    return [{
      stopId,
      shapePointIndex: index,
      segmentProgress: 0,
      distanceAlongMeters: index,
      errorMeters: 0,
      coordinate: {
        lon: coordinate.lon / coordinates.length,
        lat: coordinate.lat / coordinates.length,
      },
    }];
  });
}

function attachPatternMonitoringRefs(
  pattern: TopologyPattern,
  stations: ReadonlyMap<string, TopologyStation>,
  gtfsPatterns: readonly GtfsIndexedPattern[],
): TopologyPattern {
  const coordinates = pattern.stops.map((stationId, index) =>
    resolvePatternStopCoordinate(stations.get(stationId), pattern.quayIds?.[index]),
  );
  const alignment = gtfsPatterns
    .map((gtfsPattern) => alignStops(coordinates, gtfsPattern))
    .filter((candidate) => candidate.matches.length > 0)
    .sort(compareAlignments)[0];

  if (!alignment) return pattern;

  const monitoringRefs = Array<string | undefined>(pattern.stops.length).fill(undefined);
  for (const match of alignment.matches) {
    monitoringRefs[match.topologyIndex] = createSiriStopAreaRef(match.stopId);
  }

  return monitoringRefs.some(Boolean) ? { ...pattern, monitoringRefs } : pattern;
}

function resolvePatternStopCoordinate(
  station: TopologyStation | undefined,
  quayId: string | undefined,
): LineGeometryCoordinate | undefined {
  if (!station) return undefined;

  const quay = quayId ? station.quays?.find((candidate) => candidate.id === quayId) : undefined;
  return resolveTransitLonLat(quay ?? station);
}

function alignStops(
  topologyCoordinates: readonly (LineGeometryCoordinate | undefined)[],
  gtfsPattern: GtfsIndexedPattern,
): PatternAlignment {
  const rowCount = topologyCoordinates.length + 1;
  const columnCount = gtfsPattern.projections.length + 1;
  const table: Array<Array<PatternAlignment | undefined>> = Array.from(
    { length: rowCount },
    () => Array<PatternAlignment | undefined>(columnCount).fill(undefined),
  );
  table[0]![0] = { matches: [], distanceMeters: 0 };

  for (let topologyIndex = 0; topologyIndex < rowCount; topologyIndex += 1) {
    for (let gtfsIndex = 0; gtfsIndex < columnCount; gtfsIndex += 1) {
      const current = table[topologyIndex]?.[gtfsIndex];
      if (!current) continue;

      if (topologyIndex + 1 < rowCount) {
        keepBetterAlignment(table, topologyIndex + 1, gtfsIndex, current);
      }
      if (gtfsIndex + 1 < columnCount) {
        keepBetterAlignment(table, topologyIndex, gtfsIndex + 1, current);
      }

      const coordinate = topologyCoordinates[topologyIndex];
      const projection = gtfsPattern.projections[gtfsIndex];
      if (!coordinate || !projection) continue;

      const distanceMeters = getCoordinatesDistanceMeters(
        coordinate.lat,
        coordinate.lon,
        projection.coordinate.lat,
        projection.coordinate.lon,
      );
      if (distanceMeters > MAX_STOP_MATCH_DISTANCE_METERS) continue;

      keepBetterAlignment(table, topologyIndex + 1, gtfsIndex + 1, {
        matches: [
          ...current.matches,
          { topologyIndex, stopId: projection.stopId, distanceMeters },
        ],
        distanceMeters: current.distanceMeters + distanceMeters,
      });
    }
  }

  return table.at(-1)?.at(-1) ?? { matches: [], distanceMeters: 0 };
}

function keepBetterAlignment(
  table: Array<Array<PatternAlignment | undefined>>,
  row: number,
  column: number,
  candidate: PatternAlignment,
): void {
  const existing = table[row]?.[column];
  if (!existing || compareAlignments(candidate, existing) < 0) {
    table[row]![column] = candidate;
  }
}

function compareAlignments(left: PatternAlignment, right: PatternAlignment): number {
  return right.matches.length - left.matches.length
    || left.distanceMeters - right.distanceMeters;
}

function createSiriStopAreaRef(stopId: string): string | undefined {
  const code = stopId.match(/^IDFM:(.+)$/iu)?.[1]?.trim();
  return code ? `STIF:StopArea:SP:${code}:` : undefined;
}
