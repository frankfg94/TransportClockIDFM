import type { GlobalMapMode } from "../features/transport-map/contracts/manifest";

export type AnnualRidershipRequestedYear = number | "latest";
export type AnnualRidershipStatus = "official" | "derived" | "unavailable";
export type RidershipUnit = "entries" | "journeys" | "boardings";
export type RidershipMetric =
  | "annual_station_entries"
  | "annual_station_boardings"
  | "annual_line_ridership"
  | "annual_line_boardings";

export type AnnualRidershipRankingScope = "network" | "mode" | "line";

export interface AnnualRidershipRanking {
  scope: AnnualRidershipRankingScope;
  rank: number;
  total: number;
  year: number;
  metric: RidershipMetric;
  unit: RidershipUnit;
}

export interface AnnualRidershipLineRanking extends AnnualRidershipRanking {
  scope: "mode";
  mode: GlobalMapMode;
}

export interface AnnualRidershipStationModeRanking extends AnnualRidershipRanking {
  scope: "mode";
  mode: GlobalMapMode;
}

export interface AnnualRidershipStationLineRanking extends AnnualRidershipRanking {
  scope: "line";
  lineId: string;
}

export interface AnnualRidershipStationRankings {
  network?: AnnualRidershipRanking;
  mode?: AnnualRidershipStationModeRanking;
  line?: AnnualRidershipStationLineRanking;
}

export interface AnnualRidershipSourceMetadata {
  id: string;
  label: string;
  publisher: string;
  datasetUrl: string;
  kind: "catalog" | "ridership";
  scope: "station" | "line" | "mixed";
  priority: number;
}

export interface AnnualRidershipQualifier {
  lineId?: string;
  network?: string;
  /** Stable physical-station identity supplied by a station-level source. */
  stationIdentity?: string;
}

export interface AnnualRidershipValue {
  value: number | null;
  unit?: RidershipUnit;
  metric?: RidershipMetric;
  year?: number;
  status: AnnualRidershipStatus;
  method?: string;
  sourceIds: string[];
  sourceRecordIds: string[];
  qualifier?: AnnualRidershipQualifier;
}

export interface AnnualRidershipMeasure {
  value: number;
  unit: RidershipUnit;
  metric: RidershipMetric;
  year: number;
  status: Exclude<AnnualRidershipStatus, "unavailable">;
  method: string;
  sourceIds: string[];
  sourceRecordIds: string[];
  qualifier?: AnnualRidershipQualifier;
}

export interface AnnualRidershipStationDocument {
  id: string;
  name: string;
  city?: string;
  lineIds: string[];
  measures: AnnualRidershipMeasure[];
  primary: AnnualRidershipValue;
  ranking?: AnnualRidershipRanking;
}

export interface AnnualRidershipLineStationDocument {
  id: string;
  name: string;
  city?: string;
  lineIds: string[];
  measures: AnnualRidershipMeasure[];
  primary: AnnualRidershipValue;
  rankings?: AnnualRidershipStationRankings;
}

export interface AnnualRidershipLineDocument {
  id: string;
  code: string;
  label: string;
  mode: GlobalMapMode;
  generatedAt: string;
  requestedYear: AnnualRidershipRequestedYear;
  primary: AnnualRidershipValue;
  measures: AnnualRidershipMeasure[];
  stations: AnnualRidershipLineStationDocument[];
  ranking?: AnnualRidershipLineRanking;
}

export interface AnnualRidershipLineResponse extends AnnualRidershipLineDocument {
  sources: AnnualRidershipSourceMetadata[];
  /** Compact monthly availability metadata; the full series is fetched on the detail page. */
  monthlyAvailability?: MonthlyRidershipAvailability;
}

export type MonthlyStatus = "missing" | "partial" | "complete";
export type MonthlyRidershipStatus = MonthlyStatus;
export type MonthlyRidershipAttribution = "rail-station" | "surface-line" | "surface-station";

export interface MonthlySeriesPoint {
  month: string;
  value: number | null;
  status: MonthlyStatus;
  coveredDays: number;
  censored?: boolean;
}

export type MonthlyRidershipPoint = MonthlySeriesPoint;

export interface MonthlySourcePeriod {
  start: string;
  end: string;
  granularity: "quarter" | "semester" | "year" | "unknown";
  label: string;
}

export interface MonthlySourceArtifact {
  id: string;
  datasetId: string;
  officialUrl: string;
  period: MonthlySourcePeriod;
  downloadedAt: string;
  processedAt: string;
  checksum: string;
  etag?: string;
  lastModified?: string;
  recordCount: number;
  rejectedCount: number;
  ambiguousCount: number;
  lineCount: number;
  stationCount: number;
  attribution: MonthlyRidershipAttribution;
}

export interface MonthlyRidershipCoverageSummary {
  firstObservedMonth?: string;
  lastObservedMonth?: string;
  observedMonths: number;
  completeMonths: number;
  partialMonths: number;
  missingMonths: number;
  observedDays: number;
  stationDetail: "available" | "partial" | "unavailable";
}

export interface MonthlyRidershipExcludedStation {
  id: string;
  name: string;
  city?: string;
  reason: string;
  otherActiveLineIds: string[];
}

export interface MonthlyRidershipStationDocument {
  id: string;
  name: string;
  city?: string;
  lineIds: string[];
  series: MonthlySeriesPoint[];
  coverage: MonthlyRidershipCoverageSummary;
}

export interface MonthlyRidershipMilestone {
  date: string;
  type: string;
  label: string;
  description: string;
  source: string;
  sourceUrl: string;
  confidence: "high" | "medium" | "low";
}

export interface MonthlyRidershipLineDocument {
  schemaVersion: 1;
  id: string;
  code: string;
  label: string;
  mode: GlobalMapMode;
  color: string;
  textColor: string;
  pictogram?: string | null;
  metric: "monthly_line_validations";
  unit: "entries" | "boardings";
  generatedAt: string;
  availableYears: number[];
  series: MonthlySeriesPoint[];
  trends: Record<string, unknown>;
  coverage: MonthlyRidershipCoverageSummary;
  cohort: {
    cohortGeneratedAt: string;
    includedStationIds: string[];
    excludedStations: MonthlyRidershipExcludedStation[];
  };
  stations: MonthlyRidershipStationDocument[];
  milestones: MonthlyRidershipMilestone[];
  fullObservedCohortFrom?: string;
  sources: MonthlySourceArtifact[];
  methodology: Record<string, string>;
}

export interface MonthlyRidershipAvailability {
  hasMonthlyHistory: boolean;
  historyYears: number[];
  retainedStationCount: number;
  excludedStationCount: number;
  stationDetail: "available" | "partial" | "unavailable";
}

export interface MonthlyRidershipIndexEntry extends MonthlyRidershipAvailability {
  id: string;
  label: string;
  code: string;
  mode: GlobalMapMode;
  file: string;
}

export interface MonthlyRidershipIndex {
  schemaVersion: 1;
  generatedAt: string;
  sources: MonthlySourceArtifact[];
  lines: MonthlyRidershipIndexEntry[];
}

export interface AnnualRidershipStationResponse extends AnnualRidershipStationDocument {
  sources: AnnualRidershipSourceMetadata[];
  rankings: AnnualRidershipStationRankings;
  context?: {
    lineId: string;
    mode: GlobalMapMode;
  };
}

export interface AnnualRidershipLineIndexEntry {
  id: string;
  label: string;
  code?: string;
  file: string;
  status: AnnualRidershipStatus;
  primary: AnnualRidershipValue;
}

export interface AnnualRidershipLineIndex {
  schemaVersion: 2;
  sources: AnnualRidershipSourceMetadata[];
  lines: AnnualRidershipLineIndexEntry[];
}

export interface AnnualRidershipStationIndexEntry {
  id: string;
  name: string;
  city?: string;
  lineIds?: string[];
  file?: string;
  status: AnnualRidershipStatus;
  primary: AnnualRidershipValue;
}

export interface AnnualRidershipStationIndex {
  schemaVersion: 2;
  sources: AnnualRidershipSourceMetadata[];
  stations: AnnualRidershipStationIndexEntry[];
}

export interface AnnualRidershipStatusResponse {
  available: boolean;
  version?: string;
  generatedAt?: string;
  requestedYear?: AnnualRidershipRequestedYear;
  actualYears?: number[];
  counts?: {
    lines: number;
    stations: number;
    lineMeasures: number;
    stationMeasures: number;
    availableLines: number;
    availableStations: number;
  };
  source?: {
    kind: "remote" | "directory" | "r2" | "auto";
    location: string;
  };
  warning?: string;
  message?: string;
}

export interface AnnualRidershipSourceReport {
  source: AnnualRidershipSourceMetadata;
  status: "success" | "unavailable" | "error";
  requestedYear: AnnualRidershipRequestedYear;
  actualYears: number[];
  recordCount: number;
  observationCount: number;
  catalogRecordCount: number;
  unmatchedCount: number;
  diagnostics: Array<{ code: string; message: string; sourceRecordId?: string }>;
  error?: string;
}

export interface AnnualRidershipManifest {
  schemaVersion: 2;
  version: string;
  generatedAt: string;
  requestedYear: AnnualRidershipRequestedYear;
  actualYears: number[];
  files: { lines: string; stations?: string; monthly?: string };
  counts: NonNullable<AnnualRidershipStatusResponse["counts"]>;
  sources: AnnualRidershipSourceReport[];
}

export interface AnnualRidershipCurrentPointer {
  schemaVersion: 2;
  version: string;
  generatedAt: string;
  requestedYear: AnnualRidershipRequestedYear;
  manifest: string;
}
