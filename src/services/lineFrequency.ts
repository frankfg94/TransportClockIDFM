import { runNetworkTask } from "./networkScheduler";
import type { GtfsLineFrequencyResponse } from "../types/lineFrequency";
import { toServerApiUrl } from "./serverApi";

const MAX_CACHE_ENTRIES = 32;
const READY_TTL_MS = 5 * 60_000;
const UNAVAILABLE_TTL_MS = 60_000;
const cache = new Map<
  string,
  { value: GtfsLineFrequencyResponse; requestDate: string; expiresAt: number }
>();
const serviceDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Paris request day for cache expiry; the backend chooses the service day. */
export function getGtfsRequestDate(now = new Date()): string {
  const parts = serviceDateFormatter.formatToParts(now);
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("");
}

/** Match the endpoint: current Paris weekday, or next Monday on weekends. */
export function getGtfsServiceDate(now = new Date()): string {
  const date = getGtfsRequestDate(now);
  const civil = new Date(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8))),
  );
  const day = civil.getUTCDay();
  if (day === 6) civil.setUTCDate(civil.getUTCDate() + 2);
  if (day === 0) civil.setUTCDate(civil.getUTCDate() + 1);
  return civil.toISOString().slice(0, 10).replaceAll("-", "");
}

/** Cache completed responses only: each caller owns its cancellation signal. */
export async function fetchGtfsLineFrequency(
  lineId: string,
  options: { signal?: AbortSignal } = {},
): Promise<GtfsLineFrequencyResponse> {
  options.signal?.throwIfAborted();
  const now = Date.now();
  const requestDate = getGtfsRequestDate(new Date(now));
  const serviceDate = getGtfsServiceDate(new Date(now));
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now || entry.requestDate !== requestDate) cache.delete(key);
  }
  const cached = cache.get(lineId);
  if (cached) {
    cache.delete(lineId);
    cache.set(lineId, cached);
    return cached.value;
  }

  const value = await runNetworkTask(async (signal) => {
    const response = await fetch(
      toServerApiUrl(`/api/lines/${encodeURIComponent(lineId)}/frequency`),
      {
        signal,
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) throw new Error(`GTFS frequency request failed: ${response.status}`);
    return (await response.json()) as GtfsLineFrequencyResponse;
  }, options.signal);
  options.signal?.throwIfAborted();
  // Reject a stale upstream service day, including requests crossing Paris
  // midnight. Weekend responses must refer to the upcoming Monday.
  if (value.serviceDate !== serviceDate || getGtfsRequestDate() !== requestDate) {
    throw new Error("GTFS frequency response has an outdated service date");
  }
  cache.delete(lineId);
  cache.set(lineId, {
    value,
    requestDate,
    expiresAt: Date.now() + (value.status === "ready" ? READY_TTL_MS : UNAVAILABLE_TTL_MS),
  });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  return value;
}

export function clearGtfsLineFrequencyCache(): void {
  cache.clear();
}
