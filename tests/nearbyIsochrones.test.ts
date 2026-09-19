import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8 } from "fflate";
import { walkingArchiveFixture, walkingPolygon } from "./fixtures/walkingIsochrones";
import type { H3Event } from "h3";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NEARBY_ISOCHRONES_NOT_CONFIGURED_CODE,
  isNearbyIsochronesResponse,
  normalizeNearbyIsochronePayload,
  type NearbyIsochroneGeometry,
  type NearbyIsochroneRing,
} from "../src/features/nearby-stations/nearbyIsochrones";
import {
  NEARBY_ISOCHRONE_MINUTES,
  NEARBY_WALKING_MINUTES,
  walkingMinutesToSeconds,
  type NearbyWalkingMinutes,
} from "../src/features/nearby-stations/nearbyWalkingMinutes";
import { NEARBY_DIRECTORY_WALKING_MINUTES } from "../src/features/nearby-stations/nearbyPlacePresentation";
import { fetchNearbyIsochrones } from "../src/services/nearbyIsochrones";
import { getNearbyIsochronesWithOpenRouteService } from "../server/services/walking/openRouteService";
import isochroneHandler from "../server/api/walking/isochrones.post";

type TestEvent = {
  context: {
    cloudflare: {
      env: Record<string, string>;
    };
  };
};

const origin = { lon: 2.35, lat: 48.85 };

function event(env: Record<string, string>): TestEvent {
  return { context: { cloudflare: { env } } };
}

function requestEvent(body: unknown, env: Record<string, string>): H3Event {
  const request = new EventEmitter() as EventEmitter & {
    headers: Record<string, string>;
    method: string;
  };
  request.method = "POST";
  const serialized = JSON.stringify(body);
  request.headers = {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(serialized)),
  };
  queueMicrotask(() => {
    request.emit("data", Buffer.from(serialized));
    request.emit("end");
  });
  return {
    method: "POST",
    context: { cloudflare: { env: { IDFM_MAP_ISOCHRONES_LOCAL: join(tmpdir(), "absent-test-isochrones.zip"), IDFM_MAP_ISOCHRONES_REMOTE: "", ...env } } },
    node: { req: request, res: { setHeader: vi.fn(), getHeader: vi.fn() } },
  } as unknown as H3Event;
}

function ring(offset = 0): NearbyIsochroneRing {
  return [
    [2.34 + offset, 48.84 + offset],
    [2.36 + offset, 48.84 + offset],
    [2.36 + offset, 48.86 + offset],
    [2.34 + offset, 48.86 + offset],
    [2.34 + offset, 48.84 + offset],
  ];
}

function holeRing(offset = 0): NearbyIsochroneRing {
  return [
    [2.345 + offset, 48.845 + offset],
    [2.355 + offset, 48.845 + offset],
    [2.355 + offset, 48.855 + offset],
    [2.345 + offset, 48.855 + offset],
    [2.345 + offset, 48.845 + offset],
  ];
}

function polygon(offset = 0, hole = false): NearbyIsochroneGeometry {
  return {
    type: "Polygon",
    coordinates: [
      ring(offset),
      ...(hole ? [holeRing(offset)] : []),
    ],
  };
}

function feature(seconds: number, geometry: NearbyIsochroneGeometry) {
  return {
    type: "Feature",
    properties: { value: seconds },
    geometry,
  };
}

function payload(overrides: Record<number, NearbyIsochroneGeometry> = {}) {
  return {
    type: "FeatureCollection",
    features: [...NEARBY_WALKING_MINUTES]
      .reverse()
      .map((minutes) => feature(walkingMinutesToSeconds(minutes), overrides[minutes] ?? polygon(minutes / 1_000))),
  };
}

function payloadFor(
  minutes: readonly NearbyWalkingMinutes[],
  overrides: Record<number, NearbyIsochroneGeometry> = {},
) {
  return {
    type: "FeatureCollection",
    features: [...minutes]
      .reverse()
      .map((minutesValue) => feature(walkingMinutesToSeconds(minutesValue), overrides[minutesValue] ?? polygon(minutesValue / 1_000))),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("nearby walking isochrones", () => {
  it("keeps the shared minute thresholds and converts them to ORS seconds", () => {
    expect(NEARBY_WALKING_MINUTES).toEqual([5, 10, 15]);
    expect(NEARBY_DIRECTORY_WALKING_MINUTES).toBe(NEARBY_WALKING_MINUTES);
    expect(NEARBY_WALKING_MINUTES.map(walkingMinutesToSeconds)).toEqual([300, 600, 900]);
  });

  it("normalizes and sorts ORS polygons while preserving holes", () => {
    const polygonWithHole = polygon(0.01, true);
    const normalized = normalizeNearbyIsochronePayload(
      payload({ 10: polygonWithHole }),
      origin,
    );

    expect(normalized?.origin).toEqual(origin);
    expect(normalized?.zones.map((zone) => zone.minutes)).toEqual([5, 10, 15]);
    expect(normalized?.zones[1]?.geometry).toEqual(polygonWithHole);
    expect(isNearbyIsochronesResponse(normalized)).toBe(true);
  });

  it("normalizes the longer prepared thresholds when a panel requests them", () => {
    const requested = [20, 30] as const;
    const normalized = normalizeNearbyIsochronePayload(payloadFor(requested), origin, requested);

    expect(NEARBY_ISOCHRONE_MINUTES).toEqual([5, 10, 15, 20, 25, 30]);
    expect(normalized?.zones.map((zone) => zone.minutes)).toEqual(requested);
    expect(isNearbyIsochronesResponse(normalized, requested)).toBe(true);
  });

  it("accepts MultiPolygon geometries", () => {
    const multiPolygon: NearbyIsochroneGeometry = {
      type: "MultiPolygon",
      coordinates: [
        [ring(0.01)],
        [ring(0.02)],
      ],
    };
    const normalized = normalizeNearbyIsochronePayload(
      payload({ 15: multiPolygon }),
      origin,
    );

    expect(normalized?.zones[2]?.geometry).toEqual(multiPolygon);
  });

  it("rejects incomplete, duplicate, or unsupported geometries", () => {
    const invalidRing = {
      type: "Polygon",
      coordinates: [[[2.34, 48.84], [2.36, 48.84], [2.36, 48.86]]],
    } as unknown as NearbyIsochroneGeometry;
    expect(normalizeNearbyIsochronePayload(payload({ 5: invalidRing }), origin)).toBeUndefined();

    const duplicateRanges = {
      type: "FeatureCollection",
      features: [
        feature(300, polygon()),
        feature(300, polygon(0.01)),
        feature(900, polygon(0.02)),
      ],
    };
    expect(normalizeNearbyIsochronePayload(duplicateRanges, origin)).toBeUndefined();

    const unsupported = payload();
    unsupported.features[0]!.geometry = { type: "LineString", coordinates: [] } as never;
    expect(normalizeNearbyIsochronePayload(unsupported, origin)).toBeUndefined();
  });

  it("fails explicitly when ORS is not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getNearbyIsochronesWithOpenRouteService(
        event({ NUXT_ORS_API_KEY: "", NUXT_ORS_API_URL: "https://ors.test" }) as never,
        { lon: 2.351, lat: 48.851 },
      ),
    ).rejects.toThrow("openrouteservice-isochrones-not-configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps invalid input, missing configuration, and upstream failures to explicit API errors", async () => {
    const configuredEnv = {
      NUXT_ORS_API_KEY: "ors-test",
      NUXT_ORS_API_URL: "https://ors-handler.test",
    };

    await expect(
      isochroneHandler(requestEvent({ origin: { lon: "invalid", lat: 48.85 } }, configuredEnv)),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      isochroneHandler(requestEvent({ origin }, { NUXT_ORS_API_KEY: "", NUXT_ORS_API_URL: configuredEnv.NUXT_ORS_API_URL })),
    ).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: "An OpenRouteService API key is required to display walking zones.",
      data: { code: NEARBY_ISOCHRONES_NOT_CONFIGURED_CODE },
    });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream failure", { status: 502 })));
    await expect(
      isochroneHandler(requestEvent({ origin: { lon: 2.355, lat: 48.855 } }, configuredEnv)),
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it("preserves the backend missing-key code for the map UI", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      statusCode: 503,
      statusMessage: "An OpenRouteService API key is required to display walking zones.",
      data: { code: NEARBY_ISOCHRONES_NOT_CONFIGURED_CODE },
    }), { status: 503, headers: { "content-type": "application/json" } })));

    await expect(fetchNearbyIsochrones(origin)).rejects.toMatchObject({
      code: "not-configured",
      status: 503,
    });
  });

  it("serves an archived station without an ORS key or network request", async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), "station-isochrone-test-"));
    try {
      const fixture = walkingArchiveFixture();
      const asset = `origins/${encodeURIComponent("2.35000,48.85000")}.json`;
      fixture.index.stationOrigins = { s1: { asset, ...origin } };
      fixture.entries[asset] = strToU8(JSON.stringify({ 5: walkingPolygon(), 10: walkingPolygon(), 15: walkingPolygon() }));
      const archivePath = join(dir, "walking.zip");
      await fs.writeFile(archivePath, fixture.bytes());
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const result = await isochroneHandler(requestEvent({ origin }, {
        IDFM_MAP_ISOCHRONES_LOCAL: archivePath, IDFM_MAP_ISOCHRONES_REMOTE: "", NUXT_ORS_API_KEY: "",
      }));
      expect(result.zones.map((zone) => zone.minutes)).toEqual([5, 10, 15]);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("serves only the requested longer thresholds from the prepared archive", async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), "station-isochrone-long-test-"));
    try {
      const fixture = walkingArchiveFixture();
      const asset = `origins/${encodeURIComponent("2.35000,48.85000")}.json`;
      fixture.index.stationOrigins = { s1: { asset, ...origin } };
      fixture.entries[asset] = strToU8(JSON.stringify(Object.fromEntries(
        NEARBY_ISOCHRONE_MINUTES.map((minutes) => [minutes, walkingPolygon()]),
      )));
      const archivePath = join(dir, "walking.zip");
      await fs.writeFile(archivePath, fixture.bytes());
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const requested = [20, 30] as const;
      const result = await isochroneHandler(requestEvent({ origin, minutes: requested }, {
        IDFM_MAP_ISOCHRONES_LOCAL: archivePath, IDFM_MAP_ISOCHRONES_REMOTE: "", NUXT_ORS_API_KEY: "",
      }));
      expect(result.zones.map((zone) => zone.minutes)).toEqual(requested);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("uses the ORS fallback with exactly the thresholds requested by the panel", async () => {
    const requested = [20, 30] as const;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(payloadFor(requested)), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await isochroneHandler(requestEvent({ origin, minutes: requested }, {
      IDFM_MAP_ISOCHRONES_LOCAL: join(tmpdir(), "absent-fallback-isochrones.zip"),
      IDFM_MAP_ISOCHRONES_REMOTE: "",
      NUXT_ORS_API_KEY: "ors-test",
      NUXT_ORS_API_URL: "https://ors-fallback.test",
    }));
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body));
    expect(body.range).toEqual([1_200, 1_800]);
    expect(result.zones.map((zone) => zone.minutes)).toEqual(requested);
  });

  it("surfaces ORS errors and invalid payloads without an approximate fallback", async () => {
    const errorFetch = vi.fn(async () => new Response("upstream failure", { status: 503 }));
    vi.stubGlobal("fetch", errorFetch);
    await expect(
      getNearbyIsochronesWithOpenRouteService(
        event({ NUXT_ORS_API_KEY: "ors-test", NUXT_ORS_API_URL: "https://ors-error.test" }) as never,
        { lon: 2.352, lat: 48.852 },
      ),
    ).rejects.toThrow("openrouteservice-isochrones-503");

    const invalidFetch = vi.fn(async () => new Response(JSON.stringify(payload({
      10: {
        type: "Polygon",
        coordinates: [[[2.34, 48.84], [2.36, 48.84], [2.36, 48.86]]],
      } as unknown as NearbyIsochroneGeometry,
    })), { status: 200 }));
    vi.stubGlobal("fetch", invalidFetch);
    await expect(
      getNearbyIsochronesWithOpenRouteService(
        event({ NUXT_ORS_API_KEY: "ors-test", NUXT_ORS_API_URL: "https://ors-invalid.test" }) as never,
        { lon: 2.353, lat: 48.853 },
      ),
    ).rejects.toThrow("openrouteservice-isochrones-invalid");
  });

  it("requests 300/600/900 seconds and caches the normalized response", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(JSON.stringify(payload()), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const requestOrigin = { lon: 2.354, lat: 48.854 };
    const configuredEvent = event({
      NUXT_ORS_API_KEY: "ors-test",
      NUXT_ORS_API_URL: "https://ors-cache.test",
    });

    const first = await getNearbyIsochronesWithOpenRouteService(configuredEvent as never, requestOrigin);
    const second = await getNearbyIsochronesWithOpenRouteService(configuredEvent as never, requestOrigin);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body));

    expect(body.range).toEqual([300, 600, 900]);
    expect(body.range).toEqual(NEARBY_WALKING_MINUTES.map(walkingMinutesToSeconds));
    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the selected thresholds in the ORS cache key", async () => {
    const requested = [20, 30] as const;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(payloadFor(requested)), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const requestOrigin = { lon: 2.359, lat: 48.859 };
    const configuredEvent = event({
      NUXT_ORS_API_KEY: "ors-test",
      NUXT_ORS_API_URL: "https://ors-selected-thresholds.test",
    });

    await getNearbyIsochronesWithOpenRouteService(configuredEvent as never, requestOrigin, requested);
    await getNearbyIsochronesWithOpenRouteService(configuredEvent as never, requestOrigin, requested);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body));

    expect(body.range).toEqual([1_200, 1_800]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
