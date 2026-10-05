import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { describe, expect, it } from "vitest";

describe("IDFM coordinator in the Cloudflare runtime", () => {
  it("serializes reservations and shares scoped cooldown across clients", async () => {
    const script = await readFile(new URL("../workers/idfm-rate-gate/index.js", import.meta.url), "utf8");
    const runtime = new Miniflare({ modules: true, script, compatibilityDate: "2026-06-30",
      durableObjects: { IDFM_RATE_GATE: { className: "IdfmRateGate", useSQLite: true } },
    });
    try {
      // Miniflare's mapped Workers types need an explicit port in Nuxt's
      // DOM/Node type environment; the implementation is exercised below.
      const namespace = await runtime.getDurableObjectNamespace("IDFM_RATE_GATE") as unknown as {
        idFromName(name: string): unknown;
        get(id: unknown): { fetch(input: string, init: RequestInit): Promise<Response> };
      };
      const id = namespace.idFromName("same-key-hash");
      const a = namespace.get(id);
      const b = namespace.get(id);
      const command = async (stub: typeof a, action: string, body: Record<string, unknown>) => {
        const response = await stub.fetch(`https://gate/${action}`, { method: "POST", body: JSON.stringify(body) });
        expect(response.status).toBe(200);
        return response.json() as Promise<{ startsAt?: number; retryAfterMs?: number }>;
      };
      const reservations = await Promise.all([command(a, "reserve", { scope: "navitia" }), command(b, "reserve", { scope: "navitia" })]);
      const times = reservations.map(({ startsAt }) => startsAt!).sort();
      expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(260);
      await command(a, "cooldown", { scope: "navitia", durationMs: 60_000 });
      expect((await command(b, "reserve", { scope: "navitia" })).retryAfterMs).toBeGreaterThan(59_000);
      expect((await command(b, "reserve", { scope: "siri-unit" })).retryAfterMs).toBeUndefined();
    } finally { await runtime.dispose(); }
  }, 20_000);
});
