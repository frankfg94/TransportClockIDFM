import type { H3Event } from "h3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const event = { context: { cloudflare: { env: { ORS_API_KEY: "fixture-token" } } } } as unknown as H3Event;
const origin = { lon: 2.3, lat: 48.8 };
const destination = { id: "first", lon: 2.31, lat: 48.81 };
beforeEach(() => vi.resetModules());
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("ORS quota and matrix cache", () => {
  it("identifies quota exhaustion, suspends new attempts and leaves cached routes usable", async () => {
    const fetcher = vi.fn(async (_url: unknown) => Response.json({ durations: [[120]], distances: [[160]] }));
    vi.stubGlobal("fetch", fetcher);
    const ors = await import("../server/services/walking/openRouteService");
    const cached = await ors.matrixWalkingWithOpenRouteService(event, origin, [destination]);
    expect(cached[0]?.provider).toBe("openrouteservice");
    fetcher.mockImplementationOnce(async () => Response.json({ error: "Quota exceeded" }, { status: 403 }));
    const failed = await ors.matrixWalkingWithOpenRouteService(event, origin, [{ ...destination, lon: 2.32 }]);
    expect(failed[0]).toMatchObject({ fallback: true, unavailabilityReason: "quota-exceeded" });
    const blocked = await ors.routeWalkingWithOpenRouteService(event, origin, { lon: 2.33, lat: 48.82 });
    expect(blocked.unavailabilityReason).toBe("quota-exceeded");
    const renamed = await ors.matrixWalkingWithOpenRouteService(event, origin, [{ ...destination, id: "another-subscriber" }]);
    expect(renamed[0]).toMatchObject({ id: "another-subscriber", provider: "openrouteservice", durationSeconds: 120 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([url]) => String(url).startsWith("https://api.openrouteservice.org/"))).toBe(true);
  });
  it("accepts a zero-length matrix journey without inventing an unavailable route", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ durations: [[0]], distances: [[0]] })));
    const ors = await import("../server/services/walking/openRouteService");
    const routes = await ors.matrixWalkingWithOpenRouteService(event, origin, [{ ...origin, id: "same-point" }]);
    expect(routes[0]).toMatchObject({ durationSeconds: 0, distanceMeters: 0, provider: "openrouteservice" });
    expect(routes[0]?.fallback).toBeUndefined();
  });
});
