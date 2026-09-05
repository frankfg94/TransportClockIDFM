import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
import {
  clearGtfsRuntimeCaches,
  createCommittedGtfsAssetPath,
  getGtfsManifest,
  getGtfsPublicStatus,
  isGtfsEnabled,
  loadGtfsLineArtifact,
  loadGtfsLineArtifactsByLabel,
  normalizeLineArtifactKey,
} from "../server/services/gtfs/runtime";
import type {
  GtfsLineArtifact,
  GtfsLineLookupIndex,
  GtfsManifest,
} from "../server/services/gtfs/types";

const originalEnabled = process.env.GTFS_ENABLED;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-23T12:00:00.000Z"));
  process.env.GTFS_ENABLED = "true";
  clearGtfsRuntimeCaches();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearGtfsRuntimeCaches();
  restoreEnvironment("GTFS_ENABLED", originalEnabled);
});

describe("GTFS runtime status", () => {
  it.each(["0", "false", "no", "off"])("treats %s as disabled", (value) => {
    process.env.GTFS_ENABLED = value;
    expect(isGtfsEnabled()).toBe(false);
  });

  it("returns public metadata with a shortened hash", async () => {
    stubManifest(createManifest("2026-07-23T00:00:00.000Z"));
    const status = await getGtfsPublicStatus();

    expect(status).toMatchObject({
      enabled: true,
      available: true,
      sha256: "aaaaaaaaaaaa",
      datasetVersion: "2026-07-23",
      storage: "local",
    });
    expect(status).not.toHaveProperty("sourceEtag");
    expect(status).not.toHaveProperty("sourceLastModified");
  });

  it("keeps installed metadata visible when the provider is disabled", async () => {
    process.env.GTFS_ENABLED = "false";
    stubManifest(createManifest("2026-07-23T00:00:00.000Z"));
    await expect(getGtfsPublicStatus()).resolves.toMatchObject({
      enabled: false,
      available: true,
      datasetVersion: "2026-07-23",
    });
  });

  it("marks data stale only after the 20-day boundary", async () => {
    stubManifest(createManifest("2026-07-03T12:00:00.000Z"));
    await expect(getGtfsPublicStatus()).resolves.toMatchObject({ stale: false, ageDays: 20 });

    vi.setSystemTime(new Date("2026-07-23T12:00:00.001Z"));
    clearGtfsRuntimeCaches();
    await expect(getGtfsPublicStatus()).resolves.toMatchObject({ stale: true, ageDays: 20 });
  });

  it("normalizes line identifiers into safe immutable artifact keys", () => {
    expect(normalizeLineArtifactKey("line:IDFM:C01384")).toBe("IDFM%3AC01384");
    expect(normalizeLineArtifactKey(" IDFM:BUS 57 ")).toBe("IDFM%3ABUS%2057");
  });

  it("loads every GTFS artifact sharing a normalized commercial label", async () => {
    const manifest = createManifest("2026-07-23T00:00:00.000Z");
    const lookup: GtfsLineLookupIndex = {
      schemaVersion: 1,
      lineIdsByLabel: {
        t1: ["IDFM:C01389", "IDFM:C02404"],
      },
    };
    const artifacts = new Map([
      ["IDFM%3AC01389", createLineArtifact("IDFM:C01389")],
      ["IDFM%3AC02404", createLineArtifact("IDFM:C02404")],
    ]);
    vi.stubGlobal("useStorage", () => ({
      getItem: vi.fn(async (key: string) => {
        if (key === "current.json") return manifest;
        if (key.endsWith("/line-index.json")) return lookup;
        const artifactKey = /\/lines\/(.+)\.json$/u.exec(key)?.[1];
        return artifactKey ? artifacts.get(artifactKey) ?? null : null;
      }),
    }));

    await expect(loadGtfsLineArtifactsByLabel(undefined, " T1 ")).resolves.toEqual([
      expect.objectContaining({ lineId: "IDFM:C01389" }),
      expect.objectContaining({ lineId: "IDFM:C02404" }),
    ]);
  });

  it("encodes committed artifact filenames without turning their percent escapes into paths", () => {
    expect(
      createCommittedGtfsAssetPath(
        "versions/abc/lines/IDFM%3AC01743.json",
      ),
    ).toBe("/_gtfs-data/versions/abc/lines/IDFM%253AC01743.json");
  });

  it("loads committed GTFS assets when neither R2 nor local Nitro storage has data", async () => {
    const manifest = createManifest("2026-07-23T00:00:00.000Z");
    const artifact = createLineArtifact("IDFM:C01743");
    vi.stubGlobal("useStorage", () => ({
      getItem: vi.fn(async () => null),
    }));
    const assetFetchMock = vi.fn(async (request: Request) => {
      const url = request.url;
      return new Response(
        JSON.stringify(url.endsWith("/current.json") ? manifest : artifact),
        { headers: { "content-type": "application/json" } },
      );
    });
    const globalFetchMock = vi.fn();
    vi.stubGlobal("fetch", globalFetchMock);
    const event = createTestEvent({
      ASSETS: {
        fetch: assetFetchMock,
      },
    });

    await expect(
      loadGtfsLineArtifact(event, "line:IDFM:C01743"),
    ).resolves.toMatchObject({ lineId: "IDFM:C01743" });
    await expect(getGtfsPublicStatus(event)).resolves.toMatchObject({
      available: true,
      storage: "local",
    });
    expect(assetFetchMock.mock.calls.map(([request]) => request.url)).toEqual([
      "https://transportclockidfm.pages.dev/_gtfs-data/current.json",
      `https://transportclockidfm.pages.dev/_gtfs-data/versions/${manifest.sha256}/lines/IDFM%253AC01743.json`,
    ]);
    expect(globalFetchMock).not.toHaveBeenCalled();
  });

  it("keeps R2 ahead of committed local assets", async () => {
    const manifest = createManifest("2026-07-23T00:00:00.000Z");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("useStorage", () => ({
      getItem: vi.fn(async () => {
        throw new Error("local storage should not be read");
      }),
    }));

    await expect(
      getGtfsPublicStatus(
        createTestEvent({
          GTFS_DATA_BUCKET: {
            get: vi.fn(async () => ({
              text: async () => JSON.stringify(manifest),
            })),
          },
        }),
      ),
    ).resolves.toMatchObject({
      available: true,
      storage: "r2",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches the manifest until runtime caches are explicitly cleared", async () => {
    const getItem = vi.fn(async () => createManifest("2026-07-23T00:00:00.000Z"));
    vi.stubGlobal("useStorage", () => ({ getItem }));

    await getGtfsManifest();
    await getGtfsManifest();
    expect(getItem).toHaveBeenCalledTimes(1);

    clearGtfsRuntimeCaches();
    await getGtfsManifest();
    expect(getItem).toHaveBeenCalledTimes(2);
  });

  it("reports an unavailable store without exposing an internal error", async () => {
    vi.stubGlobal("useStorage", () => {
      throw new Error("private storage failure");
    });

    await expect(getGtfsPublicStatus()).resolves.toMatchObject({
      available: false,
      stale: false,
      storage: "unconfigured",
    });
  });
});

function stubManifest(manifest: GtfsManifest): void {
  vi.stubGlobal("useStorage", () => ({
    getItem: vi.fn(async (key: string) => (key === "current.json" ? manifest : null)),
  }));
}

function createManifest(installedAt: string): GtfsManifest {
  return {
    schemaVersion: 1,
    sha256: "a".repeat(64),
    datasetVersion: "2026-07-23",
    sourceUpdatedAt: installedAt,
    installedAt,
    sourceEtag: "private-etag",
    sourceLastModified: "private-validator",
    cacheGeneration: 1,
    lineCount: 1200,
  };
}

function createLineArtifact(lineId: string): GtfsLineArtifact {
  return {
    schemaVersion: 1,
    lineId,
    routeIds: [lineId],
    labels: ["B"],
    routeTypes: ["2"],
    routeColor: "#123456",
    routeTextColor: "#ffffff",
    patterns: [],
    shapes: {},
    entrances: [],
  };
}

function createTestEvent(cloudflareEnv: Record<string, unknown> = {}): H3Event {
  return {
    context: {
      cloudflare: {
        env: cloudflareEnv,
      },
    },
    node: {
      req: {
        headers: {
          host: "transportclockidfm.pages.dev",
          "x-forwarded-proto": "https",
        },
        originalUrl: "/api/gtfs/status",
      },
    },
    path: "/api/gtfs/status",
  } as unknown as H3Event;
}

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
