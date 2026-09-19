import type { TranslationKey, TranslationParams } from "../../i18n";

export type HealthStatus = "ok" | "warning" | "error" | "not_configured";

export interface HealthQuota {
  limit?: string;
  remaining?: string;
  reset?: string;
  exposed: boolean;
}

export interface HealthCheck {
  id: string;
  label: string;
  labelKey?: TranslationKey;
  category: string;
  categoryKey?: TranslationKey;
  required: boolean;
  status: HealthStatus;
  latencyMs?: number;
  message: string;
  messageKey?: TranslationKey;
  messageParams?: TranslationParams;
  detail?: string;
  detailKey?: TranslationKey;
  detailParams?: TranslationParams;
  quota?: HealthQuota;
}

export interface HealthResponse {
  generatedAt: string;
  checks: HealthCheck[];
}

export type DatasetState = "available" | "partial" | "missing" | "disabled" | "error";

export type DatasetStorage =
  | "local"
  | "cloudflare-r2"
  | "http"
  | "embedded"
  | "unconfigured";

export type DatasetFreshnessStatus = "fresh" | "aging" | "stale" | "unknown";

export type DatasetSizeScope = "dataset" | "archive" | "manifest" | "component" | "embedded";

export interface DatasetLicense {
  label: string;
  url?: string;
}

export interface DatasetFreshness {
  status: DatasetFreshnessStatus;
  ageDays?: number;
  observedAt?: string;
  warnAfterDays?: number;
  staleAfterDays?: number;
}

export interface DatasetMetric {
  label: string;
  value: string;
}

export interface DatasetInfo {
  id: string;
  title: string;
  description: string;
  state: DatasetState;
  storage: DatasetStorage;
  format: string;
  sizeBytes?: number;
  sizeScope?: DatasetSizeScope;
  sourceUrl?: string;
  resourceUrl?: string;
  license: DatasetLicense;
  referencePeriod?: string;
  updatedAt?: string;
  generatedAt?: string;
  installedAt?: string;
  fetchedAt?: string;
  freshness: DatasetFreshness;
  metrics?: DatasetMetric[];
  details?: string;
}

export interface DatasetManagerResponse {
  schemaVersion: number;
  generatedAt: string;
  datasets: DatasetInfo[];
  warnings: string[];
}
