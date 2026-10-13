import type { NeighborhoodJourneysRequest, NeighborhoodJourneysResponse } from "../../features/nearby-stations/neighborhoodJourneys";
import { toServerApiUrl } from "../serverApi";
import type { NeighborhoodGtfsWorkerAction, NeighborhoodGtfsWorkerRequest, NeighborhoodGtfsWorkerResponse } from "./neighborhoodGtfsWorkerProtocol";

interface Pending { worker: Worker; resolve(payload: unknown): void; reject(error: unknown): void; cleanup(): void }
type WorkerGroup = "routes" | "timetable";
const workers = new Map<WorkerGroup, Worker>();
let nextId = 0;
const pending = new Map<number, Pending>();
function ensureWorker(group: WorkerGroup): Worker {
  const existing = workers.get(group);
  if (existing) return existing;
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
    for (const [id, subscriber] of pending) {
      if (subscriber.worker !== created) continue;
      pending.delete(id); subscriber.cleanup(); subscriber.reject(new Error("GTFS browser worker failed"));
    }
    created.terminate(); if (workers.get(group) === created) workers.delete(group);
  };
  workers.set(group, created);
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
    const cancel = () => {
      const subscriber = pending.get(id);
      if (pending.delete(id)) subscriber?.worker.postMessage({ id, kind: "cancel" } satisfies NeighborhoodGtfsWorkerRequest);
      cleanup();
    };
    const abort = () => { cancel(); reject(signal.reason); };
    const timer = setTimeout(() => { cancel(); reject(new Error("GTFS browser routing timed out")); }, 180_000);
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
    signal.addEventListener("abort", abort, { once: true });
    try {
      const baseUrl = new URL(toServerApiUrl("/"), window.location.href).href;
      // Vue reactive points cannot cross the structured-clone boundary. The
      // request is the same JSON contract accepted by the server endpoint.
      const plainAction = JSON.parse(JSON.stringify(action)) as NeighborhoodGtfsWorkerAction;
      // Street-routing HTTP waits must not block the independently scheduled
      // frequency/last-departure pair. Each worker retains only its own data.
      const target = ensureWorker(action.kind === "routes" ? "routes" : "timetable");
      pending.set(id, { worker: target, resolve: payload => resolve(payload as T), reject, cleanup });
      target.postMessage({ id, baseUrl, ...plainAction } satisfies NeighborhoodGtfsWorkerRequest);
    } catch (error) { pending.delete(id); cleanup(); reject(error); }
  });
}
