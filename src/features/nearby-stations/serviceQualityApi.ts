import { runNetworkTask } from "../../services/networkScheduler";
import { toServerApiUrl } from "../../services/serverApi";
import type { PublicVerdictSource } from "./neighborhoodVerdictApi";

export const PUBLIC_SERVICE_QUALITY_SCHEMA_VERSION = "1.2" as const;

export type ServiceQualityMode = "METRO" | "RER" | "TRAIN" | "TRAM";
export type ReliabilityTrend = "improving" | "stable" | "declining";
export type ReliabilityLabel = "very-reliable" | "reliable" | "fairly-reliable" | "unreliable" | "very-unreliable";
export type ServiceQualityScoreMethod = "threshold" | "peer-comparison" | "metro-combined";

export interface ServiceQualityYearValue {
  year: number;
  value: number;
}

export interface ServiceQualityIndicatorResult {
  id: string;
  label: string;
  source?: string;
  weight: number;
  latestValue?: number;
  weightedValue?: number;
  threshold?: number;
  marginToThreshold?: number;
  reliabilityScore: number;
  labelKey: ReliabilityLabel;
  scoreMethod: Exclude<ServiceQualityScoreMethod, "metro-combined">;
  trend: ReliabilityTrend;
  trendDelta: number;
  trendMessage?: string;
  yearsUsed: readonly number[];
  values: readonly ServiceQualityYearValue[];
}

export interface ServiceQualityLineReliability {
  lineId: string;
  lineName: string;
  mode: ServiceQualityMode;
  aliases: readonly string[];
  latestValue?: number;
  weightedValue?: number;
  threshold?: number;
  marginToThreshold?: number;
  reliabilityScore: number;
  labelKey: ReliabilityLabel;
  scoreMethod: ServiceQualityScoreMethod;
  trend: ReliabilityTrend;
  trendDelta: number;
  trendMessage?: string;
  yearsUsed: readonly number[];
  indicators: readonly ServiceQualityIndicatorResult[];
}

export interface PublicServiceQuality {
  schemaVersion: typeof PUBLIC_SERVICE_QUALITY_SCHEMA_VERSION;
  generatedAt: string;
  availableYears: readonly number[];
  lines: readonly ServiceQualityLineReliability[];
  sources: readonly PublicVerdictSource[];
  warnings: readonly string[];
}

export async function fetchServiceQuality(signal?: AbortSignal): Promise<PublicServiceQuality> {
  return runNetworkTask(async (requestSignal) => {
    const response = await fetch(toServerApiUrl("/api/service-quality"), { signal: requestSignal });
    if (!response.ok) throw new Error(`Service quality unavailable (${response.status})`);
    const payload = await response.json() as PublicServiceQuality;
    if (
      payload.schemaVersion !== PUBLIC_SERVICE_QUALITY_SCHEMA_VERSION ||
      typeof payload.generatedAt !== "string" ||
      !Array.isArray(payload.availableYears) ||
      !Array.isArray(payload.lines) ||
      !Array.isArray(payload.sources) ||
      !Array.isArray(payload.warnings) ||
      !payload.lines.every((line) =>
        typeof line.lineId === "string" &&
        typeof line.lineName === "string" &&
        typeof line.reliabilityScore === "number" &&
        Number.isFinite(line.reliabilityScore),
      )
    ) throw new Error("Unsupported service-quality contract");
    return payload;
  }, signal);
}
