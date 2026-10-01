import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.useRealTimers(); vi.resetModules(); });

describe("Navitia cooldown", () => {
  it("isolates Navitia and SIRI cooldowns in both directions", async () => {
    vi.useFakeTimers();
    const { recordNavitiaRateLimit, assertNavitiaAvailable, navitiaRetryAt, idfmRetryAt } = await import("../src/services/navitiaRateLimit");
    const now = Date.now();
    const navitia = recordNavitiaRateLimit(new Response(null, { status: 429, headers: { "retry-after": "3600" } }));
    expect(navitia.scope).toBe("navitia");
    expect(() => assertNavitiaAvailable("siri-unit")).not.toThrow();
    const siri = recordNavitiaRateLimit(new Response(null, { status: 429, headers: { "retry-after": "10" } }), "siri-unit");
    expect(siri.retryAt).toBe(now + 10_000);
    expect(navitiaRetryAt.value).toBe(now + 3_600_000);
    expect(idfmRetryAt.value).toBe(navitiaRetryAt.value);
    expect(() => assertNavitiaAvailable("siri-global")).not.toThrow();
    vi.advanceTimersByTime(10_000);
    expect(() => assertNavitiaAvailable("siri-unit")).not.toThrow();
    expect(assertNavitiaAvailable).toThrow("429");
  });

  it("does not pause Navitia after a SIRI-only rate limit", async () => {
    const { recordNavitiaRateLimit, assertNavitiaAvailable, navitiaRetryAt } = await import("../src/services/navitiaRateLimit");
    recordNavitiaRateLimit(new Response(null, { status: 429, headers: { "retry-after": "60" } }), "siri-unit");
    expect(() => assertNavitiaAvailable("siri-unit")).toThrow("429");
    expect(assertNavitiaAvailable).not.toThrow();
    expect(navitiaRetryAt.value).toBe(0);
  });

  it("honours Retry-After seconds and resumes only after the deadline", async () => {
    vi.useFakeTimers();
    const { recordNavitiaRateLimit, assertNavitiaAvailable, navitiaRetryAt } = await import("../src/services/navitiaRateLimit");
    const now = Date.now();
    const error = recordNavitiaRateLimit(new Response(null, { status: 429, headers: { "retry-after": "125" } }));
    expect(navitiaRetryAt.value).toBe(now + 125_000);
    expect(error.message).toBe(`navitia-rate-limit-429;retryAt=${now + 125_000}`);
    expect(assertNavitiaAvailable).toThrow("429");
    vi.advanceTimersByTime(124_999);
    expect(assertNavitiaAvailable).toThrow("429");
    vi.advanceTimersByTime(1);
    expect(assertNavitiaAvailable).not.toThrow();
  });

  it("accepts HTTP dates without shortening an existing pause", async () => {
    vi.useFakeTimers();
    const { recordNavitiaRateLimit, navitiaRetryAt } = await import("../src/services/navitiaRateLimit");
    const deadline = Date.now() + 120_000;
    recordNavitiaRateLimit(new Response(null, { status: 429, headers: { "retry-after": new Date(deadline).toUTCString() } }));
    const original = navitiaRetryAt.value;
    recordNavitiaRateLimit(new Response(null, { status: 429, headers: { "retry-after": "10" } }));
    expect(navitiaRetryAt.value).toBe(original);
  });

  it("formats a multi-hour retry deadline for localized countdown messages", async () => {
    const { getNavitiaRetryDelay } = await import("../src/services/navitiaRateLimit");
    const now = 1_800_000_000_000;

    expect(getNavitiaRetryDelay(now + 4 * 3_600_000 + 44 * 60_000 + 21_000, now)).toEqual({
      totalSeconds: 17_061,
      hours: 4,
      minutes: 44,
      seconds: "21",
    });
  });

  it("does not dispatch another HTTP call during a shared cooldown", async () => {
    vi.useFakeTimers();
    const { fetchNavitiaJourneys } = await import("../src/services/idfm");
    const fetcher = vi.fn(async () => new Response(null, { status: 429, headers: { "retry-after": "60" } }));
    const request = { origin: { lon: 2.3, lat: 48.8 }, destination: { lon: 2.4, lat: 48.9 } };
    await expect(fetchNavitiaJourneys(request, { fetcher })).rejects.toThrow("429");
    await expect(fetchNavitiaJourneys(request, { fetcher })).rejects.toThrow("429");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
