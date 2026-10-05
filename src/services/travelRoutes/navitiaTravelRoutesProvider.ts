import { fetchNavitiaJourneys } from "../idfm";
import { runNetworkTask } from "../networkScheduler";
import type { NearbyJourney, NearbyJourneyRequest, TravelRoutesProvider } from "../../features/nearby-stations/nearbyHeavyTransports";

interface CachedJourney { expiresAt: number; journeys: NearbyJourney[] }
interface PendingJourney { controller: AbortController; promise: Promise<NearbyJourney[]>; users: number }
const cache = new Map<string, CachedJourney>();
const pending = new Map<string, PendingJourney>();
const STORAGE_KEY = "transport-clock:navitia-journeys:v1";
const MAX_ENTRIES = 80;
let loadedStorage: Storage | undefined;

function storage(): Storage | undefined {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; }
}

function loadCache(): void {
  const target = storage();
  if (!target || target === loadedStorage) return;
  loadedStorage = target;
  try {
    const entries = JSON.parse(target.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(entries)) return;
    for (const item of entries.slice(-MAX_ENTRIES)) {
      if (!Array.isArray(item) || item.length !== 2) continue;
      const [key, entry] = item;
      if (typeof key === "string" && entry?.expiresAt > Date.now() && Array.isArray(entry.journeys)) cache.set(key, entry);
    }
  } catch { /* Unavailable or malformed local storage does not prevent routing. */ }
}

function saveCache(): void {
  for (const [key, entry] of cache) if (entry.expiresAt <= Date.now()) cache.delete(key);
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify([...cache])); } catch { /* Memory cache remains usable if storage is full. */ }
}

function subscribe(entry: PendingJourney, signal?: AbortSignal): Promise<NearbyJourney[]> {
  entry.users++;
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = () => {
      if (finished) return false;
      finished = true;
      signal?.removeEventListener("abort", abort);
      entry.users--;
      return true;
    };
    const abort = () => {
      if (!finish()) return;
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
      if (!entry.users) entry.controller.abort();
    };
    signal?.addEventListener("abort", abort, { once: true });
    entry.promise.then((journeys) => { if (finish()) resolve(structuredClone(journeys)); }, (cause) => { if (finish()) reject(cause); });
    if (signal?.aborted) abort();
  });
}

/** Shared requests with independent cancellation; only successful responses are cached. */
export function createNavitiaTravelRoutesProvider(): TravelRoutesProvider {
  return {
    findJourneys(request: NearbyJourneyRequest, signal?: AbortSignal) {
      if (signal?.aborted) return Promise.reject(signal.reason);
      loadCache();
      const key = JSON.stringify({
        origin: [request.origin.lon, request.origin.lat],
        destination: [request.destination.lon, request.destination.lat],
        destinationRef: request.destinationRef ?? (request.destination.id?.startsWith("stop_area:") ? request.destination.id : ""),
        datetime: request.datetime ?? "now",
        count: request.count ?? 16,
        includeDisruptions: request.includeDisruptions ?? false,
        includeGeoJson: request.includeGeoJson ?? false,
        allowedModes: request.allowedModes ? [...request.allowedModes].sort() : undefined,
      });
      const cached = cache.get(key);
      if (cached && cached.expiresAt > Date.now()) return Promise.resolve(structuredClone(cached.journeys));
      const storeJourneys = (journeys: NearbyJourney[]) => {
        cache.set(key, { journeys: structuredClone(journeys), expiresAt: Date.now() + (request.datetime ? 15 * 60_000 : 60_000) });
        saveCache();
        return journeys;
      };
      // An orchestrated source already owns a slot and deadline. Replacing its
      // signal with an independent shared-request controller would queue the
      // actual HTTP behind its parent, deadlocking when all four slots are used.
      if (signal && runNetworkTask.ownsSignal(signal)) {
        return fetchNavitiaJourneys(request, { signal }).then((journeys) => {
          signal.throwIfAborted();
          return storeJourneys(journeys);
        });
      }
      let entry = pending.get(key);
      if (!entry || entry.controller.signal.aborted) {
        const controller = new AbortController();
        const promise = fetchNavitiaJourneys(request, { signal: controller.signal }).then((journeys) => {
          controller.signal.throwIfAborted();
          return storeJourneys(journeys);
        });
        entry = { controller, promise, users: 0 };
        pending.set(key, entry);
        const cleanup = () => { if (pending.get(key)?.promise === promise) pending.delete(key); };
        void promise.then(cleanup, cleanup);
      }
      return subscribe(entry, signal);
    },
  };
}
