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
  category: string;
  required: boolean;
  status: HealthStatus;
  latencyMs?: number;
  message: string;
  detail?: string;
  quota?: HealthQuota;
}

export interface HealthResponse {
  generatedAt: string;
  checks: HealthCheck[];
}
