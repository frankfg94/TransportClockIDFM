import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  needsTimetableMigration,
  parseUpdateOptions,
  publishManifest,
  runGtfsUpdate,
  shouldRefresh,
} from "../scripts/gtfs/update";
import { GTFS_TIMETABLE_SCHEMA_VERSION } from "../server/services/gtfs/timetableTypes";
import type { GtfsManifest } from "../server/services/gtfs/types";

const roots: string[] = [];
const now = Date.parse("2026-08-31T12:00:00Z");
const lineKey = encodeURIComponent("IDFM:TEST");

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network request")));
  for (const key of ["R2_ENDPOINT", "GTFS_R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
    vi.stubEnv(key, "");
  }
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

function manifest(overrides: Partial<GtfsManifest> = {}): GtfsManifest {
  return {
    schemaVersion: 1,
    sha256: "a".repeat(64),
    datasetVersion: "2026-08-31",
    installedAt: new Date().toISOString(),
    sourceEtag: '"same-source"',
    sourceLastModified: "Mon, 31 Aug 2026 00:00:00 GMT",
    cacheGeneration: 4,
    lineCount: 1,
    timetable: {
      schemaVersion: GTFS_TIMETABLE_SCHEMA_VERSION,
      path: `timetables/v1/${"a".repeat(64)}/previous-run`,
      startDate: "20260101",
      endDate: "20991231",
      lineCount: 1,
      tripCount: 1,
      fileCount: 2,
      bytes: 512,
    },
    ...overrides,
  };
}

async function fixture(invalidTimetable = false) {
  const root = await fs.mkdtemp(join(tmpdir(), "gtfs-update-test-"));
  roots.push(root);
  const outputDir = join(root, "output");
  await fs.mkdir(outputDir);
  const files = {
    "routes.txt":
      "route_id,route_short_name,route_long_name,route_type,route_color,route_text_color\nIDFM:TEST,42,Test line,3,123456,FFFFFF\n",
    "trips.txt":
      "route_id,service_id,trip_id,direction_id,trip_headsign,shape_id\nIDFM:TEST,S,T,0,Station B,SHAPE\n",
    "stops.txt":
      "stop_id,stop_name,stop_lat,stop_lon\nA,Station A,48.8,2.3\nB,Station B,48.81,2.31\n",
    "stop_times.txt": `trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type\nT,${invalidTimetable ? "broken" : "25:00:00"},25:00:00,A,1,0,1\nT,25:10:00,25:10:00,B,2,1,0\n`,
    "shapes.txt":
      "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nSHAPE,48.8,2.3,1\nSHAPE,48.81,2.31,2\n",
    "calendar.txt":
      "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nS,1,1,1,1,1,0,0,20260101,20991231\n",
    "calendar_dates.txt": "service_id,date,exception_type\nS,20260831,2\nS,20260905,1\n",
  };
  const archive = zipSync(
    Object.fromEntries(Object.entries(files).map(([name, value]) => [name, strToU8(value)])),
  );
  const sha256 = createHash("sha256").update(archive).digest("hex");
  const fetchArchive = () =>
    vi
      .mocked(fetch)
      .mockImplementation(
        async () =>
          new Response(new Uint8Array(archive).buffer, {
            headers: { etag: '"same-source"', "last-modified": "Mon, 31 Aug 2026 00:00:00 GMT" },
          }),
      );
  return { root, outputDir, archive, sha256, fetchArchive };
}

async function seed(outputDir: string, current: GtfsManifest, geometry = false): Promise<string> {
  const body = JSON.stringify(current, null, 2);
  await fs.writeFile(join(outputDir, "current.json"), body);
  if (geometry) {
    const directory = join(outputDir, "versions", current.sha256);
    await fs.mkdir(join(directory, "lines"), { recursive: true });
    await fs.writeFile(
      join(directory, "line-index.json"),
      JSON.stringify({ schemaVersion: 1, lineIdsByLabel: { "42": ["IDFM:TEST"] } }),
    );
    await fs.writeFile(
      join(directory, "lines", `${lineKey}.json`),
      '{"immutable":"original geometry"}',
    );
  }
  return body;
}

async function readManifest(outputDir: string): Promise<GtfsManifest> {
  return JSON.parse(await fs.readFile(join(outputDir, "current.json"), "utf8"));
}

function fakeR2(previous?: GtfsManifest, reject?: (key: string) => boolean) {
  vi.stubEnv("R2_ENDPOINT", "https://r2.invalid");
  vi.stubEnv("GTFS_R2_BUCKET", "test-bucket");
  vi.stubEnv("R2_ACCESS_KEY_ID", "test-id");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-secret");
  const objects = new Map<string, string>();
  if (previous) objects.set("gtfs/current.json", JSON.stringify(previous));
  const writes: string[] = [];
  const send = vi.spyOn(S3Client.prototype, "send").mockImplementation(async (command) => {
    if (command instanceof GetObjectCommand) {
      const body = objects.get(command.input.Key!);
      if (body === undefined) throw Object.assign(new Error("Missing"), { name: "NoSuchKey" });
      return { Body: { transformToString: async () => body } } as never;
    }
    if (!(command instanceof PutObjectCommand)) throw new Error("Unexpected R2 command");
    const key = command.input.Key!;
    writes.push(key);
    let body = "";
    if (typeof command.input.Body === "string") body = command.input.Body;
    else
      for await (const chunk of command.input.Body as AsyncIterable<Buffer>)
        body += chunk.toString();
    if (reject?.(key)) throw new Error(`Upload failed: ${key}`);
    if (command.input.IfNoneMatch === "*" && objects.has(key)) {
      throw Object.assign(new Error("Already installed"), {
        name: "PreconditionFailed",
        $metadata: { httpStatusCode: 412 },
      });
    }
    objects.set(key, body);
    return {} as never;
  });
  return { objects, writes, send };
}

describe("GTFS update migration decisions", () => {
  it("retains the cooldown only when the timetable schema is current", () => {
    const recent = manifest({ installedAt: new Date(now - 60_000).toISOString() });
    expect(shouldRefresh(recent, {}, now)).toBe(false);
    expect(shouldRefresh({ ...recent, timetable: undefined }, {}, now)).toBe(true);
    expect(shouldRefresh(recent, { force: true }, now)).toBe(true);
    expect(shouldRefresh(recent, { reindex: true }, now)).toBe(true);
    expect(shouldRefresh(undefined, {}, now)).toBe(true);
    expect(shouldRefresh({ ...recent, installedAt: "invalid" }, {}, now)).toBe(true);
    expect(
      shouldRefresh(
        { ...recent, installedAt: new Date(now - 12 * 60 * 60_000).toISOString() },
        {},
        now,
      ),
    ).toBe(true);
  });

  it("detects missing, incompatible, and incomplete timetable descriptors", () => {
    const current = manifest();
    expect(needsTimetableMigration(undefined)).toBe(false);
    expect(needsTimetableMigration(current)).toBe(false);
    expect(needsTimetableMigration({ ...current, timetable: undefined })).toBe(true);
    expect(
      needsTimetableMigration({ ...current, timetable: { ...current.timetable!, path: "" } }),
    ).toBe(true);
    const old = JSON.parse(JSON.stringify(current)) as GtfsManifest;
    Object.assign(old.timetable!, { schemaVersion: 0 });
    expect(needsTimetableMigration(old)).toBe(true);
  });

  it("parses local regeneration and reset flags independently", () => {
    expect(
      parseUpdateOptions(["--local", "--reindex", "--force", "--keep-source"], {
        GTFS_OUTPUT_DIR: "fixture-output",
      }),
    ).toEqual({
      outputDir: resolve("fixture-output"),
      local: true,
      reindex: true,
      force: true,
      reset: false,
      keepSource: true,
    });
    expect(parseUpdateOptions(["--local", "--reset"])).toMatchObject({
      local: true,
      reset: true,
      reindex: false,
    });
  });
});

describe("GTFS update publication", () => {
  it.each([false, true])(
    "retains and logs the absolute source directory with --keep-source (failure=%s)",
    async (failure) => {
      const setup = await fixture(failure);
      setup.fetchArchive();
      const update = runGtfsUpdate({ outputDir: setup.outputDir, local: true, keepSource: true });
      if (failure) await expect(update).rejects.toThrow("Invalid GTFS time");
      else await update;
      const message = vi
        .mocked(console.info)
        .mock.calls.flat()
        .find(
          (value) =>
            typeof value === "string" && value.includes("Source files retained for diagnostics: "),
        ) as string;
      expect(message).toBeDefined();
      const source = message.split("Source files retained for diagnostics: ")[1];
      roots.push(source);
      expect(source).toBe(resolve(source));
      expect(await fs.readFile(join(source, "idfm-gtfs.zip"))).toEqual(Buffer.from(setup.archive));
      expect(await fs.readdir(join(source, "extracted"))).toHaveLength(7);
    },
  );

  it.each(["missing", "old-version"])(
    "upgrades a %s timetable for identical ZIP bytes without touching existing geometry",
    async (kind) => {
      const setup = await fixture();
      const previous = manifest({
        sha256: setup.sha256,
        timetable: kind === "missing" ? undefined : manifest().timetable,
      });
      if (previous.timetable) Object.assign(previous.timetable, { schemaVersion: 0 });
      await seed(setup.outputDir, previous, true);
      setup.fetchArchive();
      await runGtfsUpdate({ outputDir: setup.outputDir, local: true });
      const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
      expect(headers.has("if-none-match")).toBe(false);
      expect(headers.has("if-modified-since")).toBe(false);
      const current = await readManifest(setup.outputDir);
      expect(current.sha256).toBe(previous.sha256);
      expect(current.cacheGeneration).toBe(previous.cacheGeneration + 1);
      expect(current.timetable).toMatchObject({
        schemaVersion: 1,
        lineCount: 1,
        tripCount: 1,
        fileCount: 2,
      });
      expect(current.timetable!.path).toMatch(
        new RegExp(`^timetables/v1/${setup.sha256}/[a-f0-9-]+$`),
      );
      expect(
        await fs.readFile(
          join(setup.outputDir, "versions", setup.sha256, "lines", `${lineKey}.json`),
          "utf8",
        ),
      ).toBe('{"immutable":"original geometry"}');
      const directory = join(setup.outputDir, current.timetable!.path, lineKey);
      const index = JSON.parse(await fs.readFile(join(directory, "index.json"), "utf8"));
      expect(index.services[0].exceptions).toEqual({ "20260831": 2, "20260905": 1 });
      const chunk = JSON.parse(await fs.readFile(join(directory, index.chunks[0].file), "utf8"));
      expect(chunk.trips[0].calls[0].slice(2)).toEqual([90000, 90000, 0, 1]);
      const sizes = await Promise.all(
        ["index.json", ...index.chunks.map((item: { file: string }) => item.file)].map(
          async (name) => (await fs.stat(join(directory, name))).size,
        ),
      );
      expect(current.timetable!.bytes).toBe(sizes.reduce((sum, size) => sum + size, 0));
    },
  );

  it("reindexes into a fresh timetable directory even when the source and schema are unchanged", async () => {
    const setup = await fixture();
    setup.fetchArchive();
    await runGtfsUpdate({ outputDir: setup.outputDir, local: true });
    const first = await readManifest(setup.outputDir);
    const firstIndex = await fs.readFile(
      join(setup.outputDir, first.timetable!.path, lineKey, "index.json"),
      "utf8",
    );
    const geometryPath = join(
      setup.outputDir,
      "versions",
      setup.sha256,
      "lines",
      `${lineKey}.json`,
    );
    const geometryBefore = await fs.stat(geometryPath);
    await runGtfsUpdate({ outputDir: setup.outputDir, local: true, reindex: true });
    const second = await readManifest(setup.outputDir);
    expect(second.timetable!.path).not.toBe(first.timetable!.path);
    expect(
      await fs.readFile(
        join(setup.outputDir, first.timetable!.path, lineKey, "index.json"),
        "utf8",
      ),
    ).toBe(firstIndex);
    expect((await fs.stat(geometryPath)).mtimeMs).toBe(geometryBefore.mtimeMs);
  });

  it.each(["cooldown", "304", "sha"])("keeps the normal unchanged %s fast path", async (reason) => {
    const setup = await fixture();
    const current = manifest({ sha256: setup.sha256 });
    const original = await seed(setup.outputDir, current);
    if (reason === "304") vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 304 }));
    if (reason === "sha") setup.fetchArchive();
    await runGtfsUpdate({ outputDir: setup.outputDir, local: true, force: reason !== "cooldown" });
    expect(await fs.readFile(join(setup.outputDir, "current.json"), "utf8")).toBe(original);
    expect(await fs.readdir(setup.outputDir)).toEqual(["current.json"]);
    expect(fetch).toHaveBeenCalledTimes(reason === "cooldown" ? 0 : 1);
    if (reason !== "cooldown") {
      const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
      expect(headers.get("if-none-match")).toBe(current.sourceEtag);
      expect(headers.get("if-modified-since")).toBe(current.sourceLastModified);
    }
  });

  it("uses only the local manifest for regeneration and reset despite configured R2 credentials", async () => {
    const setup = await fixture();
    const r2 = fakeR2(manifest());
    await seed(setup.outputDir, manifest({ sha256: setup.sha256, timetable: undefined }), true);
    setup.fetchArchive();
    await runGtfsUpdate({ outputDir: setup.outputDir, local: true });
    const regenerated = await readManifest(setup.outputDir);
    await runGtfsUpdate({ outputDir: setup.outputDir, local: true, reset: true });
    expect((await readManifest(setup.outputDir)).cacheGeneration).toBe(
      regenerated.cacheGeneration + 1,
    );
    expect(r2.send).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uploads all nested timetable and geometry files before switching R2 current", async () => {
    const setup = await fixture();
    const previous = manifest();
    const r2 = fakeR2(previous);
    await seed(setup.outputDir, previous);
    setup.fetchArchive();
    await runGtfsUpdate({ outputDir: setup.outputDir, force: true });
    const current = await readManifest(setup.outputDir);
    expect(JSON.parse(r2.objects.get("gtfs/current.json")!)).toEqual(current);
    expect(r2.writes.at(-1)).toBe("gtfs/current.json");
    expect(r2.writes).toContain(`gtfs/versions/${setup.sha256}/line-index.json`);
    expect(r2.writes).toContain(`gtfs/versions/${setup.sha256}/lines/${lineKey}.json`);
    expect(
      r2.writes.filter((key) => key.startsWith(`gtfs/${current.timetable!.path}/`)),
    ).toHaveLength(current.timetable!.fileCount);
    expect(r2.writes).toContain(`gtfs/${current.timetable!.path}/${lineKey}/index.json`);
    expect(r2.writes).toContain(`gtfs/${current.timetable!.path}/${lineKey}/0000.json`);
  });

  it("does not rewrite active R2 geometry for a timetable-only migration", async () => {
    const setup = await fixture();
    const previous = manifest({ sha256: setup.sha256, timetable: undefined });
    const r2 = fakeR2(previous);
    await seed(setup.outputDir, previous, true);
    setup.fetchArchive();
    await runGtfsUpdate({ outputDir: setup.outputDir });
    expect(r2.writes.some((key) => key.startsWith("gtfs/versions/"))).toBe(false);
    expect(r2.writes.at(-1)).toBe("gtfs/current.json");
  });

  it("preserves immutable geometry objects already uploaded by an earlier interrupted run", async () => {
    const setup = await fixture();
    const previous = manifest();
    const r2 = fakeR2(previous);
    const key = `gtfs/versions/${setup.sha256}/lines/${lineKey}.json`;
    r2.objects.set(key, '{"immutable":"previous upload"}');
    await seed(setup.outputDir, previous);
    setup.fetchArchive();
    await runGtfsUpdate({ outputDir: setup.outputDir, force: true });
    expect(r2.objects.get(key)).toBe('{"immutable":"previous upload"}');
    expect((await readManifest(setup.outputDir)).sha256).toBe(setup.sha256);
    expect(r2.writes.at(-1)).toBe("gtfs/current.json");
  });

  it.each(["geometry", "timetable", "manifest"])(
    "keeps both current manifests when the %s upload fails",
    async (phase) => {
      const setup = await fixture();
      const previous = manifest();
      const original = await seed(setup.outputDir, previous);
      const r2 = fakeR2(previous, (key) =>
        phase === "manifest"
          ? key === "gtfs/current.json"
          : key.startsWith(`gtfs/${phase === "geometry" ? "versions" : "timetables"}/`),
      );
      const remoteOriginal = r2.objects.get("gtfs/current.json");
      setup.fetchArchive();
      await expect(runGtfsUpdate({ outputDir: setup.outputDir, force: true })).rejects.toThrow(
        "Upload failed",
      );
      expect(await fs.readFile(join(setup.outputDir, "current.json"), "utf8")).toBe(original);
      expect(r2.objects.get("gtfs/current.json")).toBe(remoteOriginal);
      if (phase !== "manifest") expect(r2.writes).not.toContain("gtfs/current.json");
      expect(
        (await fs.readdir(setup.outputDir)).some(
          (name) => name.startsWith(".current-") || name.startsWith(".staging-"),
        ),
      ).toBe(false);
    },
  );

  it("keeps the installed version and publishes nothing when timetable generation fails", async () => {
    const setup = await fixture(true);
    const previous = manifest({ timetable: undefined });
    const original = await seed(setup.outputDir, previous, true);
    const r2 = fakeR2(previous);
    setup.fetchArchive();
    await expect(runGtfsUpdate({ outputDir: setup.outputDir })).rejects.toThrow(
      "Invalid GTFS time",
    );
    expect(await fs.readFile(join(setup.outputDir, "current.json"), "utf8")).toBe(original);
    expect(r2.writes).toEqual([]);
    expect(await fs.readdir(join(setup.outputDir, "versions"))).toEqual([previous.sha256]);
  });

  it("fails a migration if the source incorrectly returns 304", async () => {
    const setup = await fixture();
    const original = await seed(setup.outputDir, manifest({ timetable: undefined }));
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 304 }));
    await expect(runGtfsUpdate({ outputDir: setup.outputDir, local: true })).rejects.toThrow(
      "requires a full archive",
    );
    expect(await fs.readFile(join(setup.outputDir, "current.json"), "utf8")).toBe(original);
  });

  it.each(["../stops.txt", "/stops.txt", "nested/stops.txt"])(
    "rejects unsafe or duplicate source entries (%s) before publication",
    async (entry) => {
      const setup = await fixture();
      const original = await seed(setup.outputDir, manifest({ timetable: undefined }));
      const archive = zipSync({
        "stops.txt": strToU8("stop_id\nA\n"),
        [entry]: strToU8("stop_id\nB\n"),
      });
      vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array(archive).buffer));
      await expect(runGtfsUpdate({ outputDir: setup.outputDir, local: true })).rejects.toThrow(
        /Unsafe ZIP path|Duplicate/u,
      );
      expect(await fs.readFile(join(setup.outputDir, "current.json"), "utf8")).toBe(original);
      expect(await fs.readdir(setup.outputDir)).toEqual(["current.json"]);
    },
  );

  it("writes the local manifest to a sibling temporary file and atomically renames it", async () => {
    const setup = await fixture();
    const original = await seed(setup.outputDir, manifest());
    const target = join(setup.outputDir, "current.json");
    const next = manifest({ cacheGeneration: 5 });
    const rename = fs.rename.bind(fs);
    const spy = vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      expect(String(from)).toMatch(/\.current-[a-f0-9-]+\.json\.tmp$/u);
      expect(to).toBe(target);
      expect(await fs.readFile(target, "utf8")).toBe(original);
      expect(JSON.parse(await fs.readFile(from, "utf8"))).toEqual(next);
      await rename(from, to);
    });
    await publishManifest(next, setup.outputDir);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await readManifest(setup.outputDir)).toEqual(next);
    expect(await fs.readdir(setup.outputDir)).toEqual(["current.json"]);
  });

  it("preserves local current and removes the temporary file if rename fails", async () => {
    const setup = await fixture();
    const original = await seed(setup.outputDir, manifest());
    vi.spyOn(fs, "rename").mockRejectedValue(new Error("Rename failed"));
    await expect(
      publishManifest(manifest({ cacheGeneration: 5 }), setup.outputDir),
    ).rejects.toThrow("Rename failed");
    expect(await fs.readFile(join(setup.outputDir, "current.json"), "utf8")).toBe(original);
    expect(await fs.readdir(setup.outputDir)).toEqual(["current.json"]);
  });
});
