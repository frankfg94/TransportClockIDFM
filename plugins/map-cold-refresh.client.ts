import { COLD_REFRESH_REQUEST_KEY, attachColdRefreshRecorder, publishColdRefreshReport, restoreColdRefreshReport } from "../src/features/transport-map/performance/coldRefreshState";

export default defineNuxtPlugin(async () => {
  if (!window.location.pathname.startsWith("/map")) return;
  restoreColdRefreshReport();
  let request: string | null = null;
  try {
    request = sessionStorage.getItem(COLD_REFRESH_REQUEST_KEY);
    sessionStorage.removeItem(COLD_REFRESH_REQUEST_KEY);
  } catch { return; }
  if (!request) return;
  try {
    const parsed = JSON.parse(request) as { requestedAt?: number; prepareDeckShaders?: boolean; isolateShaderCache?: boolean };
    if (!parsed.requestedAt || Date.now() - parsed.requestedAt > 60_000) return;
    const { ColdRefreshRecorder } = await import("../src/features/transport-map/performance/coldRefreshRecorder");
    attachColdRefreshRecorder(new ColdRefreshRecorder(publishColdRefreshReport, parsed.prepareDeckShaders !== false, parsed.isolateShaderCache === true));
  } catch (error) {
    publishColdRefreshReport({ schemaVersion: 1, scenario: "cold-refresh", status: "failed", error: String(error) });
  }
});
