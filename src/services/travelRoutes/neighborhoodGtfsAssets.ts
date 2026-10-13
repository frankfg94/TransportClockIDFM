/** Share only in-flight public asset reads. No address results or retained
 * shard catalogue: the routing/timetable runtimes own their bounded caches. */
export function createNeighborhoodGtfsAssetReader(fetcher: typeof fetch = fetch, storage: CacheStorage | undefined = typeof caches === "undefined" ? undefined : caches) {
  const pending = new Map<string, Promise<unknown>>();
  return async function readAsset<T>(baseUrl: string, path: string, coldStart = false): Promise<T | undefined> {
    const url = new URL("/_gtfs-data/" + path.split("/").map(encodeURIComponent).join("/"), baseUrl).href;
    const key = `${coldStart}:${url}`;
    const joined = pending.get(key);
    if (joined) return await joined as T | undefined;
    const request = (async () => {
      const cache = coldStart ? undefined : await storage?.open("neighborhood-gtfs-routing-v1").catch(() => undefined);
      const cached = await cache?.match(url).catch(() => undefined);
      if (path !== "current.json" && cached) return await cached.json() as T;
      try {
        const response = await fetcher(url, { cache: coldStart ? "no-store" : path === "current.json" ? "no-cache" : "default", signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(`GTFS asset unavailable (${response.status})`);
        if (cache) void cache.put(url, response.clone()).catch(() => {});
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
