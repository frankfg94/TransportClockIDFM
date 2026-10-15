import { NEIGHBORHOOD_TRANSPORT_TIMEOUT_MS } from "../../../shared/gtfs/neighborhoodTimeout";

/** Share only in-flight public asset reads. No address results or retained
 * shard catalogue: the routing/timetable runtimes own their bounded caches. */
export function createNeighborhoodGtfsAssetReader(fetcher: typeof fetch = fetch, storage: CacheStorage | undefined = typeof caches === "undefined" ? undefined : caches) {
  const pending = new Map<string, Promise<unknown>>();
  const literalPaths = new Set<string>();
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
      const cache = coldStart ? undefined : await storage?.open("neighborhood-gtfs-routing-v1").catch(() => undefined);
      const cached = await cache?.match(url).catch(() => undefined);
      if (path !== "current.json" && cached) return await cached.json() as T;
      try {
        const init: RequestInit = { cache: coldStart ? "no-store" : path === "current.json" ? "no-cache" : "default", signal: AbortSignal.timeout(NEIGHBORHOOD_TRANSPORT_TIMEOUT_MS) };
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
        if (cache) void cache.put(fetchedUrl, response.clone()).catch(() => {});
        return await response.json() as T;
      } catch (error) {
        if (cached) return await cached.json() as T;
        throw error;
      }
    })();
    pending.set(key, request);
    try { return await request; }
    finally { if (pending.get(key) === request) pending.delete(key); }
  };
}
