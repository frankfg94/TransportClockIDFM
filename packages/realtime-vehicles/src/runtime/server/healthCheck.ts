import type { H3Event } from "h3";
import type { HealthCheck } from "#transport-clock/plugin-server";
import { IDFM_LINE_TRACES_API_ROOT } from "./lineTraceMetrics";

export default function realtimeVehicleHealthCheck(
  _event: H3Event,
): Promise<HealthCheck> {
  return checkIdfmLineTraces();
}

export async function checkIdfmLineTraces(): Promise<HealthCheck> {
  const startedAt = Date.now();
  try {
    const url = new URL(IDFM_LINE_TRACES_API_ROOT);
    url.searchParams.set("select", "route_id");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(2_800),
    });
    return {
      id: "idfm-line-traces",
      label: "IDFM line traces",
      category: "Realtime",
      required: false,
      status: response.ok ? "ok" : "warning",
      latencyMs: Date.now() - startedAt,
      message: response.ok
        ? "The public IDFM line trace API is reachable."
        : (String(response.status) + " " + response.statusText).trim(),
      detail: response.ok
        ? "Used by the realtime vehicles plugin to project positions on track geometry."
        : "The public IDFM line trace API responded without an OK status.",
    };
  } catch (error) {
    return {
      id: "idfm-line-traces",
      label: "IDFM line traces",
      category: "Realtime",
      required: false,
      status: "warning",
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "Request failed",
      detail: "The realtime plugin will fall back to topology distances.",
    };
  }
}
