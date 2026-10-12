import type { NeighborhoodJourneysRequest, NeighborhoodJourneysResponse } from "../../features/nearby-stations/neighborhoodJourneys";
import { toServerApiUrl } from "../serverApi";
import type { NeighborhoodGtfsWorkerRequest, NeighborhoodGtfsWorkerResponse } from "./neighborhoodGtfsWorkerProtocol";

interface Pending { resolve(payload: NeighborhoodJourneysResponse): void; reject(error: unknown): void; cleanup(): void }
let worker: Worker | undefined, nextId = 0;
const pending = new Map<number, Pending>();
function ensureWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL("./neighborhoodGtfs.worker.ts", import.meta.url), { type: "module" });
  created.onmessage = (event: MessageEvent<NeighborhoodGtfsWorkerResponse>) => {
    const response = event.data, subscriber = pending.get(response.id);
    if (!subscriber) return;
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
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const abort = () => { pending.delete(id); cleanup(); reject(signal.reason); };
    const timer = setTimeout(() => { pending.delete(id); cleanup(); reject(new Error("GTFS browser routing timed out")); }, 180_000);
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
    signal.addEventListener("abort", abort, { once: true });
    pending.set(id, { resolve, reject, cleanup });
    try {
      const baseUrl = new URL(toServerApiUrl("/"), window.location.href).href;
      // Vue reactive points cannot cross the structured-clone boundary. The
      // request is the same JSON contract accepted by the server endpoint.
      const plainRequest = JSON.parse(JSON.stringify(request)) as NeighborhoodJourneysRequest;
      ensureWorker().postMessage({ id, baseUrl, request: plainRequest } satisfies NeighborhoodGtfsWorkerRequest);
    } catch (error) { pending.delete(id); cleanup(); reject(error); }
  });
}
