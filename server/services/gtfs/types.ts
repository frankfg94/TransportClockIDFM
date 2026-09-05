import type {
  LineGeometryCoordinate,
  LineGeometryEntrance,
} from "../../../src/features/line-map/lineGeometry.js";
import type { GtfsTimetableDescriptor } from "./timetableTypes.js";

export interface GtfsManifest {
  schemaVersion: 1;
  sha256: string;
  datasetVersion: string;
  sourceUpdatedAt?: string;
  installedAt: string;
  sourceEtag?: string;
  sourceLastModified?: string;
  cacheGeneration: number;
  lineCount: number;
  timetable?: GtfsTimetableDescriptor;
}

export interface GtfsLineLookupIndex {
  schemaVersion: 1;
  lineIdsByLabel: Record<string, string[]>;
}

export interface GtfsStopShapeProjection {
  stopId: string;
  shapePointIndex: number;
  segmentProgress: number;
  distanceAlongMeters: number;
  errorMeters: number;
  coordinate: LineGeometryCoordinate;
}

export interface GtfsIndexedPattern {
  id: string;
  direction?: string;
  stopIds: string[];
  shapeId: string;
  shapeDirection: "forward" | "reverse";
  projections: GtfsStopShapeProjection[];
}

export interface GtfsLineArtifact {
  schemaVersion: 1;
  lineId: string;
  routeIds: string[];
  labels: string[];
  routeTypes: string[];
  /** Normalized routes.txt route_color, including the leading '#'. */
  routeColor: string;
  /** Normalized routes.txt route_text_color, including the leading '#'. */
  routeTextColor: string;
  patterns: GtfsIndexedPattern[];
  shapes: Record<string, LineGeometryCoordinate[]>;
  entrances: LineGeometryEntrance[];
}

export interface GtfsPublicStatus {
  enabled: boolean;
  available: boolean;
  datasetVersion?: string;
  sha256?: string;
  sourceUpdatedAt?: string;
  installedAt?: string;
  ageDays?: number;
  stale: boolean;
  lineCount?: number;
  cacheGeneration?: number;
  storage: "r2" | "local" | "nitro" | "unconfigured";
}
