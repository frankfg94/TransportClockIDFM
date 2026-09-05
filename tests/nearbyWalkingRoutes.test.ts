import { describe, expect, it } from "vitest";
import {
  matrixWalkingWithOpenRouteService,
  matrixWalkingWithPreferredProvider,
  routeWalkingWithPreferredProvider,
} from "../server/services/walking/openRouteService";

type TestEvent = {
  context: {
    cloudflare: {
      env: Record<string, string>;
    };
  };
};

function event(env: Record<string, string>): TestEvent {
  return { context: { cloudflare: { env } } };
}

const origin = { lon: 2.3001, lat: 48.8101 };

describe("nearby walking route providers", () => {
  it("uses the IDFM/Navitia walking geometry before any ORS fallback", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({
        journeys: [{
          type: "non_pt_walk",
          duration: 180,
          sections: [{
            type: "street_network",
            mode: "walking",
            duration: 180,
            length: 240,
            geojson: {
              type: "LineString",
              coordinates: [[2.3001, 48.8101], [2.3012, 48.8114], [2.3027, 48.8121]],
            },
          }],
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    try {
      const route = await routeWalkingWithPreferredProvider(
        event({ NUXT_IDFM_API_KEY: "prim-test", NUXT_ORS_API_KEY: "" }) as never,
        origin,
        { lon: 2.3027, lat: 48.8121 },
        "prim-place",
      );

      expect(route.provider).toBe("idfm-navitia");
      expect(route.coordinates).toHaveLength(3);
      expect(route.distanceMeters).toBe(240);
      expect(route.durationSeconds).toBe(180);
      expect(requests).toHaveLength(1);
      const requestUrl = new URL(requests[0]!.url);
      expect(requestUrl.pathname).toContain("/v2/navitia/journeys");
      expect(requestUrl.searchParams.get("direct_path")).toBe("only");
      expect(requestUrl.searchParams.get("disable_geojson")).toBe("false");
      expect((requests[0]!.init?.headers as Record<string, string>).apikey).toBe("prim-test");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("connects provider geometry to the requested walking endpoints", async () => {
    const originalFetch = globalThis.fetch;
    const requestedOrigin = { lon: 2.3401, lat: 48.8501 };
    const requestedDestination = { lon: 2.3434, lat: 48.8534 };
    globalThis.fetch = (async () => new Response(JSON.stringify({
      journeys: [{
        type: "non_pt_walk",
        duration: 240,
        sections: [{
          type: "street_network",
          mode: "walking",
          duration: 240,
          length: 320,
          geojson: {
            type: "LineString",
            coordinates: [[2.3403, 48.8503], [2.3418, 48.8518], [2.3431, 48.8531]],
          },
        }],
      }],
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

    try {
      const route = await routeWalkingWithPreferredProvider(
        event({ NUXT_IDFM_API_KEY: "prim-endpoints-test", NUXT_ORS_API_KEY: "" }) as never,
        requestedOrigin,
        requestedDestination,
        "snapped-poi",
      );

      expect(route.provider).toBe("idfm-navitia");
      expect(route.coordinates.at(0)).toEqual(requestedOrigin);
      expect(route.coordinates.at(-1)).toEqual(requestedDestination);
      expect(route.coordinates).toHaveLength(5);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("removes a malformed Navitia geometry tail before connecting a POI", async () => {
    const originalFetch = globalThis.fetch;
    const requestedOrigin = { lon: 2.196075, lat: 48.956025 };
    const requestedDestination = { lon: 2.1894734, lat: 48.9549714 };
    const arrival = { lon: 2.189347, lat: 48.954752 };
    const malformedTail = { lon: 2.1893, lat: 48.956064 };
    globalThis.fetch = (async () => new Response(JSON.stringify({
      journeys: [{
        type: "non_pt_walk",
        duration: 703,
        sections: [{
          type: "street_network",
          mode: "walking",
          duration: 703,
          length: 754,
          geojson: {
            type: "LineString",
            coordinates: [
              [requestedOrigin.lon, requestedOrigin.lat],
              [2.190302, 48.9547],
              [arrival.lon, arrival.lat],
              [malformedTail.lon, malformedTail.lat],
            ],
          },
          path: [{
            length: 0,
            duration: 0,
            instruction: "Votre destination est sur la droite.",
            instruction_start_coordinate: arrival,
          }],
        }],
      }],
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

    try {
      const route = await routeWalkingWithPreferredProvider(
        event({ NUXT_IDFM_API_KEY: "prim-malformed-tail-test", NUXT_ORS_API_KEY: "" }) as never,
        requestedOrigin,
        requestedDestination,
        "grand-frais",
      );

      expect(route.provider).toBe("idfm-navitia");
      expect(route.coordinates).not.toContainEqual(malformedTail);
      expect(route.coordinates.at(-2)).toEqual(arrival);
      expect(route.coordinates.at(-1)).toEqual(requestedDestination);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to ORS when PRIM is not configured", async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify({
        features: [{
          geometry: { type: "LineString", coordinates: [[2.31, 48.82], [2.311, 48.821], [2.312, 48.822]] },
          properties: { summary: { distance: 410, duration: 295 } },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    try {
      const route = await routeWalkingWithPreferredProvider(
        event({
          NUXT_IDFM_API_KEY: "",
          NUXT_ORS_API_KEY: "ors-test",
          NUXT_ORS_API_URL: "https://ors.test",
        }) as never,
        { lon: 2.31, lat: 48.82 },
        { lon: 2.312, lat: 48.822 },
        "ors-place",
      );

      expect(route.provider).toBe("openrouteservice");
      expect(route.coordinates).toHaveLength(3);
      expect(route.distanceMeters).toBe(410);
      expect(route.durationSeconds).toBe(295);
      expect(requests[0]).toContain("https://ors.test/v2/directions/foot-walking/geojson");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps distinct ORS matrix metrics for each destination", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      durations: [[120, 300]],
      distances: [[160, 500]],
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

    try {
      const routes = await matrixWalkingWithOpenRouteService(
        event({
          NUXT_IDFM_API_KEY: "",
          NUXT_ORS_API_KEY: "ors-matrix-test",
          NUXT_ORS_API_URL: "https://ors-matrix.test",
        }) as never,
        { lon: 2.32, lat: 48.83 },
        [
          { id: "matrix-a", lon: 2.321, lat: 48.831 },
          { id: "matrix-b", lon: 2.322, lat: 48.832 },
        ],
      );

      expect(routes.map((route) => [route.id, route.distanceMeters, route.durationSeconds])).toEqual([
        ["matrix-a", 160, 120],
        ["matrix-b", 500, 300],
      ]);
      expect(routes.every((route) => route.provider === "openrouteservice")).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("preloads each destination through the preferred detailed provider when PRIM is configured", async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify({
        journeys: [{
          type: "non_pt_walk",
          duration: 420,
          sections: [{
            type: "street_network",
            mode: "walking",
            duration: 420,
            length: 560,
            geojson: {
              type: "LineString",
              coordinates: [[2.34, 48.84], [2.341, 48.841], [2.342, 48.842]],
            },
          }],
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    try {
      const routes = await matrixWalkingWithPreferredProvider(
        event({ NUXT_IDFM_API_KEY: "prim-batch-test", NUXT_ORS_API_KEY: "" }) as never,
        { lon: 2.34, lat: 48.84 },
        [
          { id: "preload-a", lon: 2.341, lat: 48.841 },
          { id: "preload-b", lon: 2.342, lat: 48.842 },
        ],
      );

      expect(routes.map((route) => [route.id, route.provider, route.durationSeconds])).toEqual([
        ["preload-a", "idfm-navitia", 420],
        ["preload-b", "idfm-navitia", 420],
      ]);
      expect(requests).toHaveLength(2);
      expect(requests.every((url) => url.includes("/v2/navitia/journeys"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
