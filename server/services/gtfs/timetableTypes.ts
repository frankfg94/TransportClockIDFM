import type { GtfsManifest } from "./types.js";

export const GTFS_TIMETABLE_SCHEMA_VERSION = 1;
export const GTFS_TIMETABLE_MAX_FILE_BYTES = 4 * 1024 * 1024;

export interface GtfsTimetableDescriptor {
  schemaVersion: 1;
  path: string;
  startDate: string;
  endDate: string;
  lineCount: number;
  tripCount: number;
  fileCount: number;
  bytes: number;
}

export interface GtfsTimetableStop {
  id: string;
  parentId?: string;
  name: string;
  lat?: number;
  lon?: number;
}

export interface GtfsTimetableService {
  id: string;
  startDate?: string;
  endDate?: string;
  /** Bit 0 is Monday, bit 6 is Sunday. */
  weekdays: number;
  exceptions: Record<string, 1 | 2>;
}

/** Seconds from service-day midnight; null preserves unspecified times. */
export type GtfsTimetableCall = [
  stop: number,
  sequence: number,
  arrival: number | null,
  departure: number | null,
  pickup: number,
  dropOff: number,
];

export interface GtfsTimetableTrip {
  id: string;
  serviceId: string;
  directionId?: string;
  headsign?: string;
  calls: GtfsTimetableCall[];
}

export interface GtfsTimetableChunk {
  schemaVersion: 1;
  trips: GtfsTimetableTrip[];
}

export interface GtfsTimetableLineIndex {
  schemaVersion: 1;
  lineId: string;
  stops: GtfsTimetableStop[];
  services: GtfsTimetableService[];
  chunks: Array<{ file: string; serviceIds: string[]; bytes: number; tripCount: number }>;
  startDate: string;
  endDate: string;
  maxTimeSeconds: number;
  tripCount: number;
}

export interface ActiveGtfsTimetableTrip {
  id: string;
  serviceDate: string;
  directionId?: string;
  headsign?: string;
  calls: Array<{
    stopId: string;
    sequence: number;
    /** Seconds relative to the requested civil day; may be negative or >= 86400. */
    arrival: number | null;
    departure: number | null;
    pickupType: number;
    dropOffType: number;
  }>;
}

export interface GtfsTimetableLoadResult {
  status: "ready" | "disabled" | "missing" | "out-of-coverage" | "line-missing";
  manifest?: GtfsManifest;
  index?: GtfsTimetableLineIndex;
  trips: ActiveGtfsTimetableTrip[];
}
