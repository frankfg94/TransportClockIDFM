import type { GlobalMapMode } from "../../src/features/transport-map/contracts/manifest";
import type { GtfsTimetableService, GtfsTimetableStop } from "../../server/services/gtfs/timetableTypes";

export const GTFS_ROUTING_SCHEMA_VERSION = 1;
export interface GtfsRoutingDescriptor {
  schemaVersion: 1;
  path: string;
  startDate: string;
  endDate: string;
  connectionCount: number;
  fileCount: number;
  bytes: number;
}
export interface RoutingLine {
  id: string;
  code: string;
  mode: GlobalMapMode;
  color?: string;
}
export interface GtfsRoutingIndex {
  schemaVersion: 1;
  /** Final line access only. Never substitute this graph for scan transfer rules. */
  pedestrianGraphVersion?: 1;
  pathways?: GtfsRoutingPathway[];
  stops: GtfsTimetableStop[];
  services: GtfsTimetableService[];
  lines: RoutingLine[];
  /** Directed footpaths: from, to, duration; -1 means forbidden. */
  transfers: Array<[number, number, number]>;
  /** Rows originating in pathways.txt are traversal times, not transfer minima. */
  pathwayTransferIndices?: number[];
  scopedTransfers: Array<{ from: number; to: number; seconds: number; fromRoute?: string; toRoute?: string; fromTrip?: string; toTrip?: string }>;
  boardingStops: number[];
  hasConditionalService: boolean;
  hours: Record<string, string[]>;
  maxTimeSeconds: number;
}
export interface GtfsRoutingPathway {
  id: string;
  from: number;
  to: number;
  mode: number;
  bidirectional: boolean;
  seconds?: number;
  lengthMeters?: number;
}
/** Eight uint32 columns: from, to, departure, arrival, trip, service, line, flags. */
export const CONNECTION_COLUMNS = 8;
export interface GtfsRoutingShard {
  schemaVersion: 1;
  encoding: "gzip-base64-u32le";
  count: number;
  data: string;
  trips: Array<[number, string, string | undefined]>;
}
