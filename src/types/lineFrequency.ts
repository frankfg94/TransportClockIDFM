export interface FrequencyValues {
  peakMinutes?: number;
  offPeakMinutes?: number;
  nightMinutes?: number;
}

export interface FrequencyDirection extends FrequencyValues {
  id: string;
  from?: string;
  to?: string;
  stationCount: number;
}

export interface FrequencySection {
  id: string;
  kind: "central" | "branch" | "shared";
  from: { id: string; name: string };
  to: { id: string; name: string };
  stationIds: string[];
  average: FrequencyValues;
  directions: FrequencyDirection[];
}

export interface FrequencyStation {
  id: string;
  average: FrequencyValues;
  directions: FrequencyDirection[];
}

export interface GtfsLineFrequencyResponse {
  lineId: string;
  serviceDate: string;
  source: "gtfs";
  status: "ready" | "disabled" | "missing" | "out-of-coverage" | "line-missing" | "insufficient";
  datasetVersion?: string;
  sourceUpdatedAt?: string;
  coverage?: { startDate: string; endDate: string };
  topologyAvailable: boolean;
  branched: boolean;
  average: FrequencyValues;
  directions: FrequencyDirection[];
  sections: FrequencySection[];
  /** Local station summaries used when a nearby score has a station target. */
  stations?: FrequencyStation[];
  stationCount: number;
  sampledStationCount: number;
}
