import type { LineConfig, TransitFamily } from "../../types/transit";

export type TrafficDisruptionKind =
  | "incident"
  | "works"
  | "information"
  | "unknown";

export type TrafficLineStatus =
  | "normal"
  | "information"
  | "planned"
  | "disrupted"
  | "unknown"
  | "error";

export type TrafficCacheState =
  | "hit"
  | "miss"
  | "stale"
  | "refreshing"
  | "rate-limited"
  | "error";

export interface TrafficCacheMetadata {
  state: TrafficCacheState;
  refreshedAt?: string;
  nextRefreshAt?: string;
  refreshIntervalMs: number;
  detailRefreshAfterMs: number;
  ageMs?: number;
  refreshing: boolean;
  lastError?: string;
  retryAt?: string;
  storage?: "memory" | "persistent";
}

export type TrafficAlertTone = "orange" | "red" | "upcoming";

export type TrafficCalendarImpactScope =
  | "interruptions-only"
  | "all-impacts";

export interface TrafficPeriod {
  begin?: string;
  end?: string;
}

export interface TrafficDisruption {
  id: string;
  title: string;
  message?: string;
  kind: TrafficDisruptionKind;
  severity?: string;
  cause?: string;
  motif?: string;
  status?: string;
  updatedAt?: string;
  applicationPeriods: TrafficPeriod[];
  impactedLineRefs: string[];
  impactedStopNames: string[];
}

export interface TrafficAlertModalData {
  label: string;
  message?: string;
  tone: TrafficAlertTone;
  title?: string;
  disruption?: TrafficDisruption;
  disruptions?: TrafficDisruption[];
}

export interface TrafficLineReport {
  lineRef: string;
  status: TrafficLineStatus;
  disruptions: TrafficDisruption[];
  error?: string;
}

export interface TrafficResponse {
  generatedAt: string;
  source: "prim-line-reports" | "prim-disruptions-bulk" | "mixed-cache";
  configured: boolean;
  lines: TrafficLineReport[];
  cache?: TrafficCacheMetadata;
}

export interface ActiveTrafficLine {
  boardIds: string[];
  boardTitles: string[];
  family?: TransitFamily;
  line: LineConfig;
  navitiaLineRef: string;
}
