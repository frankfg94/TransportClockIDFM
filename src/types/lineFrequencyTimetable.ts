export type GtfsLineTimetableStatus =
  "ready" | "disabled" | "missing" | "out-of-coverage" | "line-missing";

export interface GtfsLineTimetableStop {
  id: string;
  parentId?: string;
  name: string;
  /** Physical NeTEx station id used by frequency sections, when resolved. */
  topologyId?: string;
}

export interface GtfsLineTimetableCall {
  stopId: string;
  sequence: number;
  arrival: number | null;
  departure: number | null;
  pickupType: number;
  dropOffType: number;
}

export interface GtfsLineTimetableTrip {
  id: string;
  serviceDate: string;
  directionId?: string;
  headsign?: string;
  calls: GtfsLineTimetableCall[];
}

export interface GtfsLineTimetableResponse {
  lineId: string;
  serviceDate: string;
  source: "gtfs";
  status: GtfsLineTimetableStatus;
  datasetVersion?: string;
  sourceUpdatedAt?: string;
  coverage?: { startDate: string; endDate: string };
  stops: GtfsLineTimetableStop[];
  trips: GtfsLineTimetableTrip[];
}
