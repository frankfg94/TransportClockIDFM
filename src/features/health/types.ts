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
