import type { NearbyJourney, NearbyJourneyRequest, TravelRoutesProvider } from "../../features/nearby-stations/nearbyHeavyTransports";
import { getNearbyParisJourneyDateTime } from "../../features/nearby-stations/nearbyHeavyTransports";
import type { NeighborhoodJourneysResponse } from "../../features/nearby-stations/neighborhoodJourneys";
import { toServerApiUrl } from "../serverApi";

interface Subscriber { request: NearbyJourneyRequest; resolve: (journeys: NearbyJourney[]) => void; reject: (cause: unknown) => void; signal?: AbortSignal; abort: () => void; done: boolean }
/** Page-scoped provider: no live fallback, including on coverage or HTTP failure. */
export function createGtfsNeighborhoodTravelRoutesProvider(): TravelRoutesProvider {
  const groups = new Map<string, Subscriber[]>();
  const pending = new Map<string, Promise<NearbyJourney[]>>();
  const cache = new Map<string, { expires: number; journeys: NearbyJourney[] }>();
  let artifactVersion: string | undefined;
  const requestKey = (request: NearbyJourneyRequest) => JSON.stringify([artifactVersion, request.origin.lon, request.origin.lat, request.destination.lon, request.destination.lat, request.destinationRef, request.arrivalAtPlatform, request.datetime, [...(request.allowedModes ?? [])].sort()]);
  function flush(groupKey: string) {
    const subscribers = (groups.get(groupKey) ?? []).filter(s => !s.done);
    groups.delete(groupKey);
    if (!subscribers.length) return;
    const first = subscribers[0]!.request;
    const unique: Subscriber[] = [], destinationIds = new Map<string, string>();
    for (const subscriber of subscribers) {
      const key = requestKey(subscriber.request);
      if (!destinationIds.has(key)) { destinationIds.set(key, String(unique.length)); unique.push(subscriber); }
    }
    const subscriberIds = subscribers.map(s => destinationIds.get(requestKey(s.request))!);
    const controller = new AbortController();
    for (const subscriber of subscribers) {
      subscriber.signal?.removeEventListener("abort", subscriber.abort);
      subscriber.abort = () => {
        if (subscriber.done) return;
        subscriber.done = true; subscriber.reject(subscriber.signal?.reason);
        if (subscribers.every(s => s.done)) controller.abort();
      };
      subscriber.signal?.addEventListener("abort", subscriber.abort, { once: true });
    }
    void (async () => {
      const response = await fetch(toServerApiUrl("/api/neighborhood-journeys"), {
        method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]),
        body: JSON.stringify({ origin: first.origin, datetime: first.datetime ?? getNearbyParisJourneyDateTime(9), allowedModes: first.allowedModes,
          destinations: unique.map((s, i) => ({ ...s.request.destination, id: String(i), destinationRef: s.request.destinationRef, arrivalAtPlatform: s.request.arrivalAtPlatform })) }),
      });
      if (!response.ok) throw new Error(`GTFS neighborhood routing unavailable (${response.status})`);
      const payload = await response.json() as NeighborhoodJourneysResponse;
      if (payload.source !== "gtfs" || !Array.isArray(payload.destinations)) throw new Error("Unsupported GTFS routing contract");
      const nextVersion = payload.routingPath ?? payload.datasetVersion;
      if (nextVersion !== artifactVersion) { cache.clear(); artifactVersion = nextVersion; }
      subscribers.forEach((s, i) => {
        if (s.done) return;
        const result = payload.destinations.find(d => d.id === subscriberIds[i]);
        if (!result || result.status === "missing" || result.status === "out-of-coverage") { s.done = true; s.reject(new Error(`GTFS neighborhood routing ${result?.status ?? "missing"}`)); return; }
        s.done = true;
        cache.set(requestKey(s.request), { expires: Date.now() + 60_000, journeys: result.journeys });
        while (cache.size > 256) cache.delete(cache.keys().next().value!);
        s.resolve(result.journeys);
      });
    })().catch(cause => subscribers.forEach(s => { if (!s.done) { s.done = true; s.reject(cause); } }))
      .finally(() => subscribers.forEach(s => s.signal?.removeEventListener("abort", s.abort)));
  }
  return { findJourneys(request, signal) {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const key = requestKey(request), cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.journeys);
    if (!signal && pending.has(key)) return pending.get(key)!;
    const groupKey = JSON.stringify([request.origin.lon, request.origin.lat, request.datetime, [...(request.allowedModes ?? [])].sort()]);
    const promise = new Promise<NearbyJourney[]>((resolve, reject) => {
      const subscriber: Subscriber = { request, resolve, reject, signal, done: false, abort: () => {} };
      subscriber.abort = () => { subscriber.done = true; reject(signal?.reason); };
      signal?.addEventListener("abort", subscriber.abort, { once: true });
      const group = groups.get(groupKey);
      if (group && group.length < 64) group.push(subscriber);
      else { if (group) flush(groupKey); groups.set(groupKey, [subscriber]); setTimeout(() => flush(groupKey), 0); }
    });
    if (!signal) { pending.set(key, promise); void promise.finally(() => { if (pending.get(key) === promise) pending.delete(key); }).catch(() => {}); }
    return promise;
  } };
}
