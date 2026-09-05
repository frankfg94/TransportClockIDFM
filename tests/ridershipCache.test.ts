import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearRidershipMemoryCache,
  getRidershipLine,
  getRidershipStation,
  getRidershipStatus,
} from "../server/services/ridership/ridershipCache";

const envKeys = [
  "IDFM_RIDERSHIP_CACHE_LOCAL",
  "IDFM_RIDERSHIP_CACHE_REMOTE",
  "IDFM_NETEX_CACHE_REMOTE",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
];

afterEach(() => {
  clearRidershipMemoryCache();
  vi.unstubAllGlobals();
  for (const key of envKeys) delete process.env[key];
});

describe("ridership server cache", () => {
  it("reads a version through the local current pointer", async () => {
    const root = await createFixtureDirectory();
    process.env.IDFM_RIDERSHIP_CACHE_LOCAL = root;

    const status = await getRidershipStatus();
    const line = await getRidershipLine("line:IDFM:C01371");
    const encodedLine = await getRidershipLine("line%3AIDFM%3AC01371");

    expect(status.available).toBe(true);
    expect(status.version).toBe("2024-fixture");
    expect(line.primary.value).toBe(1234);
    expect(encodedLine.primary.value).toBe(1234);
  });

  it("reads the same version from a private R2 source", async () => {
    process.env.IDFM_RIDERSHIP_CACHE_REMOTE = "r2://shared-bucket/ridership";
    process.env.R2_ACCOUNT_ID = "account";
    process.env.R2_ACCESS_KEY_ID = "access";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    const fixture = createFixturePayloads();
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/shared-bucket/ridership/current.json")) return new Response(JSON.stringify(fixture.current));
      if (url.endsWith("/shared-bucket/ridership/versions/2024-fixture/manifest.json")) return new Response(JSON.stringify(fixture.manifest));
      if (url.endsWith("/shared-bucket/ridership/versions/2024-fixture/lines/index.json")) return new Response(JSON.stringify({
        schemaVersion: 2,
        sources: [],
        lines: [{ id: fixture.line.id, label: fixture.line.label, file: "lines/line%3AIDFM%3AC01371.json", status: "official", primary: fixture.line.primary }],
      }));
      if (url.endsWith("/shared-bucket/ridership/versions/2024-fixture/lines/line%3AIDFM%3AC01371.json")) return new Response(JSON.stringify(fixture.line));
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetcher);

    const line = await getRidershipLine("line:IDFM:C01371");
    expect(line.primary.value).toBe(1234);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls.every((call) => {
      const init = call[1] as RequestInit | undefined;
      return Boolean((init?.headers as Headers)?.get("Authorization"));
    })).toBe(true);
  });

  it("resolves a station with or without an active line context", async () => {
    const root = await createFixtureDirectory();
    process.env.IDFM_RIDERSHIP_CACHE_LOCAL = root;

    const withLine = await getRidershipStation(
      "station:IDFM:100",
      "line:IDFM:C01371",
    );
    const withoutLine = await getRidershipStation("station%3AIDFM%3A100");

    expect(withLine.primary.value).toBe(500);
    expect(withLine.context).toEqual({ lineId: "line:IDFM:C01371", mode: "METRO" });
    expect(withLine.rankings.network).toMatchObject({ rank: 1, total: 1, year: 2024, metric: "annual_station_entries", unit: "entries" });
    expect(withLine.rankings.line).toMatchObject({ rank: 1, total: 1, lineId: "line:IDFM:C01371" });
    expect(withoutLine.primary.value).toBe(500);
    expect(withoutLine.context).toBeUndefined();
    expect(withoutLine.rankings.network?.total).toBe(1);
  });

  it("reads an optional station index and individual station document", async () => {
    const root = await createFixtureDirectory(true);
    process.env.IDFM_RIDERSHIP_CACHE_LOCAL = root;

    const station = await getRidershipStation("station:indexed");

    expect(station.name).toBe("Station indexée");
    expect(station.primary.value).toBe(700);
    expect(station.rankings.network).toMatchObject({ rank: 1, total: 1 });
  });

  it("prefers the automatic local cache before the NetEx-derived R2 fallback", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "vibeidfm-ridership-auto-"));
    const previousWorkingDirectory = process.cwd();
    await populateFixtureDirectory(path.join(projectRoot, "public", "data", "ridership"));
    process.env.IDFM_NETEX_CACHE_REMOTE = "r2://shared-bucket/netex";

    try {
      process.chdir(projectRoot);
      const status = await getRidershipStatus();

      expect(status.available).toBe(true);
      expect(status.source?.kind).toBe("directory");
      expect(status.source?.location).toBe(path.join(projectRoot, "public", "data", "ridership"));
    } finally {
      process.chdir(previousWorkingDirectory);
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

async function createFixtureDirectory(withStationIndex = false): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "vibeidfm-ridership-cache-"));
  await populateFixtureDirectory(root, withStationIndex);
  return root;
}

async function populateFixtureDirectory(root: string, withStationIndex = false): Promise<void> {
  const payloads = createFixturePayloads();
  if (withStationIndex) {
    (payloads.manifest.files as { lines: string; stations?: string }).stations = "stations/index.json";
  }
  const versionRoot = path.join(root, "versions", payloads.current.version);
  await mkdir(path.join(versionRoot, "lines"), { recursive: true });
  if (withStationIndex) await mkdir(path.join(versionRoot, "stations"), { recursive: true });
  await writeFile(path.join(root, "current.json"), JSON.stringify(payloads.current));
  await writeFile(path.join(versionRoot, "manifest.json"), JSON.stringify(payloads.manifest));
  await writeFile(path.join(versionRoot, "lines", "index.json"), JSON.stringify({
    schemaVersion: 2,
    sources: [],
    lines: [{ id: payloads.line.id, label: payloads.line.label, file: "lines/line%3AIDFM%3AC01371.json", status: "official", primary: payloads.line.primary }],
  }));
  await writeFile(path.join(versionRoot, "lines", "line%3AIDFM%3AC01371.json"), JSON.stringify(payloads.line));
  if (withStationIndex) {
    const indexedStation = {
      id: "station:indexed",
      name: "Station indexée",
      file: "stations/station%3Aindexed.json",
      status: "official" as const,
      primary: {
        value: 700,
        unit: "entries" as const,
        metric: "annual_station_entries" as const,
        year: 2024,
        status: "official" as const,
        sourceIds: [],
        sourceRecordIds: [],
      },
    };
    await writeFile(path.join(versionRoot, "stations", "index.json"), JSON.stringify({
      schemaVersion: 2,
      sources: [],
      stations: [indexedStation],
    }));
    await writeFile(path.join(versionRoot, "stations", "station%3Aindexed.json"), JSON.stringify({
      ...indexedStation,
      lineIds: [],
      measures: [],
    }));
  }
}

function createFixturePayloads() {
  const line = {
    id: "line:IDFM:C01371",
    code: "C01371",
    label: "1",
    mode: "METRO" as const,
    generatedAt: "2024-01-01T00:00:00.000Z",
    requestedYear: 2024,
    primary: { value: 1234, unit: "journeys" as const, metric: "annual_line_ridership" as const, year: 2024, status: "official" as const, sourceIds: [], sourceRecordIds: [] },
    measures: [],
    stations: [{
      id: "station:IDFM:100",
      name: "Station test",
      lineIds: ["line:IDFM:C01371"],
      measures: [],
      primary: { value: 500, unit: "entries" as const, metric: "annual_station_entries" as const, year: 2024, status: "official" as const, sourceIds: [], sourceRecordIds: [] },
    }],
  };
  const manifest = {
    schemaVersion: 2 as const,
    version: "2024-fixture",
    generatedAt: line.generatedAt,
    requestedYear: 2024,
    actualYears: [2024],
    files: { lines: "lines/index.json" },
    counts: { lines: 1, stations: 1, lineMeasures: 0, stationMeasures: 0, availableLines: 1, availableStations: 1 },
    sources: [],
  };
  const current = {
    schemaVersion: 2 as const,
    version: manifest.version,
    generatedAt: manifest.generatedAt,
    requestedYear: manifest.requestedYear,
    manifest: "versions/2024-fixture/manifest.json",
  };
  return { current, manifest, line };
}
