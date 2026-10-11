import { shallowRef } from "vue";
import type { ColdRefreshRecorder } from "./coldRefreshRecorder";

export const COLD_REFRESH_REQUEST_KEY = "transport-map.cold-refresh.request.v1";
const REPORT_KEY = "transport-map.cold-refresh.report.v1";
export const coldRefreshRunning = shallowRef(false);
export const coldRefreshReportJson = shallowRef("");
let recorder: ColdRefreshRecorder | undefined;

export function getColdRefreshRecorder(): ColdRefreshRecorder | undefined { return recorder; }
export function attachColdRefreshRecorder(value: ColdRefreshRecorder): void {
  recorder = value;
  coldRefreshRunning.value = true;
}
export function publishColdRefreshReport(report: unknown): void {
  coldRefreshRunning.value = false;
  recorder = undefined;
  const json = JSON.stringify(report, null, 2);
  coldRefreshReportJson.value = json;
  try { sessionStorage.setItem(REPORT_KEY, json); } catch { /* The visible/exportable result survives storage failure. */ }
}
export function restoreColdRefreshReport(): void {
  try { coldRefreshReportJson.value = sessionStorage.getItem(REPORT_KEY) ?? ""; } catch { /* Storage may be unavailable. */ }
}
export function requestColdRefresh(options: { prepareDeckShaders?: boolean; isolateShaderCache?: boolean } = {}): void {
  // A new document resets Vue, data sources, workers and the WebGL context.
  // Browser HTTP/driver caches cannot be cleared by a website: report that limit.
  sessionStorage.setItem(COLD_REFRESH_REQUEST_KEY, JSON.stringify({ requestedAt: Date.now(), prepareDeckShaders: options.prepareDeckShaders !== false, isolateShaderCache: options.isolateShaderCache === true }));
  sessionStorage.removeItem(REPORT_KEY);
  window.location.reload();
}
export function downloadColdRefreshReport(): void {
  if (!coldRefreshReportJson.value) return;
  const url = URL.createObjectURL(new Blob([coldRefreshReportJson.value], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `global-map-cold-refresh-${Date.now()}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
