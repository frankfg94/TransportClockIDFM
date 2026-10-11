import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkSatelliteTiles,
  checkNavitiaJourneys,
  checkNearbyNoiseWms,
  getNetexDatasetFreshness,
  parsePrimGlobalRequestAvailability,
  runPluginHealthCheck,
} from "../server/api/health.get";
import { checkIdfmLineTraces } from "../packages/realtime-vehicles/src/runtime/server/healthCheck";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const now = new Date("2026-06-18T12:00:00.000Z");

describe("getNetexDatasetFreshness", () => {
  it("keeps fresh NeTEx datasets quiet", () => {
    expect(
      getNetexDatasetFreshness("2026-01-18T12:00:00.000Z", now),
    ).toBeUndefined();
  });

  it("recommends an update after six months", () => {
    expect(
      getNetexDatasetFreshness("2025-12-17T12:00:00.000Z", now),
    ).toEqual({
      status: "warning",
      message: "update recommended",
      detail: "NeTEx dataset is over six months old; updating it is recommended.",
    });
  });

  it("marks datasets older than one year as outdated", () => {
    expect(
      getNetexDatasetFreshness("2025-06-17T12:00:00.000Z", now),
    ).toEqual({
      status: "error",
      message: "dataset outdated",
      detail: "NeTEx dataset is over one year old and must be regenerated.",
    });
  });

  it("ignores invalid generation dates", () => {
    expect(getNetexDatasetFreshness("not-a-date", now)).toBeUndefined();
  });
});

describe("checkNavitiaJourneys", () => {
  it("exposes a dedicated required health check without leaking a key", async () => {
    vi.stubEnv("IDFM_API_KEY", "");
    vi.stubEnv("NUXT_IDFM_API_KEY", "");
    const check = await checkNavitiaJourneys({ context: {} } as never);

    expect(check).toMatchObject({
      id: "navitia-journeys",
      labelKey: "health.checks.navitiaJourneys",
      category: "Realtime",
      required: true,
      status: "error",
      messageKey: "health.messages.missingApiKey",
    });
  });
});

describe("runPluginHealthCheck", () => {
  it("isolates synchronous and asynchronous plugin failures", async () => {
    const event = { context: {} } as never;
    const checks = await Promise.all([
      runPluginHealthCheck(
        () => {
          throw new Error("plugin exploded");
        },
        event,
        0,
      ),
      runPluginHealthCheck(
        async () => {
          throw new Error("async plugin exploded");
        },
        event,
        1,
      ),
      runPluginHealthCheck(
        async () => ({
          id: "healthy-plugin",
          label: "Healthy plugin",
          category: "Plugin",
          required: false,
          status: "ok" as const,
          message: "Available",
        }),
        event,
        2,
      ),
    ]);

    expect(checks[0]).toMatchObject({
      id: "plugin-health-1",
      category: "Plugin",
      required: false,
      status: "error",
      messageKey: "health.messages.serviceUnreachable",
      detail: "plugin exploded",
    });
    expect(checks[1]).toMatchObject({
      id: "plugin-health-2",
      status: "error",
      detail: "async plugin exploded",
    });
    expect(checks[2]).toMatchObject({
      id: "healthy-plugin",
      status: "ok",
    });
  });
});

describe("parsePrimGlobalRequestAvailability", () => {
  it("extracts the current global-request availability from the official section", () => {
    expect(
      parsePrimGlobalRequestAvailability(`
        <section>
          <h2>Prochains passages – requête arrêt</h2>
          <p>Disponibilité actuelle 83 %</p>
        </section>
        <section>
          <h2>Prochains passages – requête globale</h2>
          <p>Disponibilité actuelle&nbsp;99,87 %</p>
        </section>
      `),
    ).toBe(99.87);
  });

  it("returns undefined when the official page structure cannot be identified", () => {
    expect(
      parsePrimGlobalRequestAvailability(
        "<h2>Service inconnu</h2><p>Disponibilité actuelle 100 %</p>",
      ),
    ).toBeUndefined();
  });
});

describe("checkIdfmLineTraces", () => {
  it("reports the public GTFS geometry API without requiring a key", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(JSON.stringify({ results: [{ route_id: "IDFM:C01383" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkIdfmLineTraces()).resolves.toMatchObject({
      id: "idfm-line-traces",
      category: "Realtime",
      required: false,
      status: "ok",
      message: "The public IDFM line trace API is reachable.",
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "select=route_id",
    );
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("apikey");
  });
});

describe("checkSatelliteTiles", () => {
  it("reports the Esri World Imagery tile endpoint", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(new Uint8Array([0]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkSatelliteTiles()).resolves.toMatchObject({
      id: "satellite-tiles",
      category: "Map",
      required: false,
      status: "ok",
      message: "Satellite imagery reachable",
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "World_Imagery/MapServer/tile/12/1408/2074",
    );
  });
});

describe("checkNearbyNoiseWms", () => {
  it("checks the detailed Bruitparif layer and exposes returned quota headers", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: {
          "content-type": "image/png",
          "ratelimit-limit": "100",
          "ratelimit-remaining": "97",
          "ratelimit-reset": "60",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkNearbyNoiseWms()).resolves.toMatchObject({
      id: "nearby-noise-wms",
      labelKey: "health.checks.nearbyNoiseWms",
      category: "Map",
      required: false,
      status: "ok",
      quota: { exposed: true, limit: "100", remaining: "97", reset: "60" },
    });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin).toBe("https://raster.bruitparif.fr");
    expect(url.pathname).toBe("/mapproxy/service");
    expect(url.searchParams.get("SERVICE")).toBe("WMS");
    expect(url.searchParams.get("REQUEST")).toBe("GetMap");
    expect(url.searchParams.get("LAYERS")).toBe("CSAB_2024_wCSAB_cl_idf");
    expect(url.searchParams.get("WIDTH")).toBe("32");
    expect(url.searchParams.get("HEIGHT")).toBe("32");
  });

  it("reports rate limiting and uses Retry-After when the quota is otherwise hidden", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response("", {
        status: 429,
        headers: { "retry-after": "30" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkNearbyNoiseWms()).resolves.toMatchObject({
      id: "nearby-noise-wms",
      status: "warning",
      messageKey: "health.messages.bruitparifWmsRateLimited",
      quota: { exposed: true, reset: "30" },
    });
  });
});
