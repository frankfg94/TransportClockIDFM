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
  source: "prim-line-reports";
  configured: boolean;
  lines: TrafficLineReport[];
}

export interface ActiveTrafficLine {
  boardIds: string[];
  boardTitles: string[];
  family?: TransitFamily;
  line: LineConfig;
  navitiaLineRef: string;
}
