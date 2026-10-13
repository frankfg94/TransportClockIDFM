import type { NeighborhoodJourneysRequest, NeighborhoodJourneysResponse } from "../../features/nearby-stations/neighborhoodJourneys";
import { toServerApiUrl } from "../serverApi";
import type { NeighborhoodGtfsWorkerAction, NeighborhoodGtfsWorkerRequest, NeighborhoodGtfsWorkerResponse } from "./neighborhoodGtfsWorkerProtocol";

interface Pending { resolve(payload: unknown): void; reject(error: unknown): void; cleanup(): void }
let worker: Worker | undefined, nextId = 0;
const pending = new Map<number, Pending>();
function ensureWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL("./neighborhoodGtfs.worker.ts", import.meta.url), { type: "module" });
  created.onmessage = (event: MessageEvent<NeighborhoodGtfsWorkerResponse>) => {
    const response = event.data, subscriber = pending.get(response.id);
    if (!subscriber) return;
    if (response.diagnostics && new URL(window.location.href).searchParams.has("debugGtfs")) {
      console.debug("[neighborhood-gtfs]", JSON.stringify(response.diagnostics));
    }
    pending.delete(response.id); subscriber.cleanup();
    if ("error" in response) subscriber.reject(new Error(response.error)); else subscriber.resolve(response.payload);
  };
  created.onerror = () => {
    for (const subscriber of pending.values()) { subscriber.cleanup(); subscriber.reject(new Error("GTFS browser worker failed")); }
    pending.clear(); created.terminate(); worker = undefined;
  };
  worker = created;
  return created;
}
export function canUseBrowserNeighborhoodGtfs(): boolean { return typeof window !== "undefined" && typeof Worker !== "undefined"; }
export function routeBrowserNeighborhoodGtfs(request: NeighborhoodJourneysRequest, signal: AbortSignal): Promise<NeighborhoodJourneysResponse> {
  return requestBrowserNeighborhoodGtfs({ kind: "routes", request }, signal);
}
export function requestBrowserNeighborhoodGtfs<T>(action: NeighborhoodGtfsWorkerAction, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const cancel = () => { if (pending.delete(id)) worker?.postMessage({ id, kind: "cancel" } satisfies NeighborhoodGtfsWorkerRequest); cleanup(); };
    const abort = () => { cancel(); reject(signal.reason); };
    const timer = setTimeout(() => { cancel(); reject(new Error("GTFS browser routing timed out")); }, 180_000);
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
    signal.addEventListener("abort", abort, { once: true });
    pending.set(id, { resolve: payload => resolve(payload as T), reject, cleanup });
    try {
      const baseUrl = new URL(toServerApiUrl("/"), window.location.href).href;
      // Vue reactive points cannot cross the structured-clone boundary. The
      // request is the same JSON contract accepted by the server endpoint.
      const plainAction = JSON.parse(JSON.stringify(action)) as NeighborhoodGtfsWorkerAction;
      ensureWorker().postMessage({ id, baseUrl, ...plainAction } satisfies NeighborhoodGtfsWorkerRequest);
    } catch (error) { pending.delete(id); cleanup(); reject(error); }
  });
}
