import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearGtfsRuntimeCaches,
  getGtfsManifest,
  getGtfsPublicStatus,
  isGtfsEnabled,
  normalizeLineArtifactKey,
} from "../server/services/gtfs/runtime";
import type { GtfsManifest } from "../server/services/gtfs/types";

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
      storage: "nitro",
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

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
