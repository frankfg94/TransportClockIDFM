import { NEIGHBORHOOD_TRANSPORT_TIMEOUT_MS } from "../../../shared/gtfs/neighborhoodTimeout";

/** Share only in-flight public asset reads. No address results or retained
 * shard catalogue: the routing/timetable runtimes own their bounded caches. */
export function createNeighborhoodGtfsAssetReader(fetcher: typeof fetch = fetch, storage: CacheStorage | undefined = typeof caches === "undefined" ? undefined : caches) {
  const pending = new Map<string, Promise<unknown>>();
  const literalPaths = new Set<string>();
  const invalidResponses = new Set<string>();
  return async function readAsset<T>(baseUrl: string, path: string, coldStart = false): Promise<T | undefined> {
    const literalPath = path.split("/").map(segment => {
      try { return encodeURIComponent(decodeURIComponent(segment)); } catch { return encodeURIComponent(segment); }
    }).join("/");
    const escapedPath = path.split("/").map(encodeURIComponent).join("/");
    const origin = new URL(baseUrl).origin;
    const url = new URL("/_gtfs-data/" + (literalPaths.has(origin) ? literalPath : escapedPath), baseUrl).href;
    const key = `${coldStart}:${url}`;
    const joined = pending.get(key);
    if (joined) return await joined as T | undefined;
    const request = (async () => {
      const isManifest = path === "current.json";
      const openCache = coldStart ? undefined : storage?.open("neighborhood-gtfs-routing-v1").catch(() => undefined);
      const cache = isManifest ? undefined : await openCache;
      const cached = await cache?.match(url).catch(() => undefined);
      if (cached) {
        try { return await cached.json() as T; }
        catch {
          await cache?.delete(url).catch(() => {});
          invalidResponses.add(url);
        }
      }
      try {
        const init: RequestInit = {
          cache: coldStart ? "no-store" : invalidResponses.has(url) ? "reload" : isManifest ? "no-cache" : "default",
          ...(isManifest ? { priority: "high" } as const : {}),
          signal: AbortSignal.timeout(NEIGHBORHOOD_TRANSPORT_TIMEOUT_MS),
        };
        let fetchedUrl = url;
        let response = await fetcher(fetchedUrl, init);
        // Cloudflare addresses encoded directory names literally; Nitro's
        // static manifest addresses their decoded names. Negotiate on 404,
        // then reuse that server convention without changing any artifact.
        const compatibleUrl = new URL("/_gtfs-data/" + literalPath, baseUrl).href;
        if (response.status === 404 && compatibleUrl !== fetchedUrl) {
          fetchedUrl = compatibleUrl;
          response = await fetcher(fetchedUrl, init);
          if (response.ok) literalPaths.add(origin);
        }
        if (!response.ok) throw new Error(`GTFS asset unavailable (${response.status})`);
        const copy = (isManifest ? openCache : cache) ? response.clone() : undefined;
        const value = await response.json().catch(cause => {
          // Bypass the separate HTTP cache after a malformed successful response.
          invalidResponses.add(url);
          void copy?.body?.cancel().catch(() => {});
          throw cause;
        }) as T;
        invalidResponses.delete(url);
        if (copy) void openCache?.then(bucket => bucket?.put(fetchedUrl, copy)).catch(() => {});
        return value;
      } catch (error) {
        if (isManifest) {
          // Only wait for disk on failure. Long timetable writes must not
          // postpone an online check for newly published service dates.
          const bucket = await openCache;
          const previous = await bucket?.match(url).catch(() => undefined);
          if (previous) {
            try { return await previous.json() as T; }
            catch { await bucket?.delete(url).catch(() => {}); }
          }
        }
        throw error;
      }
    })();
    pending.set(key, request);
    try { return await request; }
    finally { if (pending.get(key) === request) pending.delete(key); }
  };
}
