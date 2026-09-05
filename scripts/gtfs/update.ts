import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  createReadStream,
  createWriteStream,
  openSync,
  promises as fs,
  writeSync,
} from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Unzip, UnzipInflate } from "fflate";
import type {
  GtfsLineArtifact,
  GtfsLineLookupIndex,
  GtfsManifest,
  GtfsStopShapeProjection,
} from "../../server/services/gtfs/types";
import { normalizeGtfsLineLabel } from "../../server/services/gtfs/labels";
import { projectStopsMonotonically } from "../../server/services/lineGeometry/traceProjection";
import { GTFS_TIMETABLE_SCHEMA_VERSION } from "../../server/services/gtfs/timetableTypes";
import { readCsv } from "./csv";
import { buildTimetableArtifacts } from "./timetableIndexer";

export { parseCsvLine } from "./csv";

const GTFS_SOURCE_URL = "https://eu.ftp.opendatasoft.com/stif/GTFS/IDFM-gtfs.zip";
const REQUIRED_FILES = new Set([
  "routes.txt",
  "trips.txt",
  "stop_times.txt",
  "stops.txt",
  "shapes.txt",
  "calendar.txt",
  "calendar_dates.txt",
]);
const MAX_COMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 3 * 1024 * 1024 * 1024;
const MAX_PATTERNS_PER_ROUTE = 80;

const MAX_ROUTE_COUNT = 20_000;
type RouteRow = {
  routeId: string;
  shortName: string;
  longName: string;
  routeType: string;
  routeColor: string;
  routeTextColor: string;
};
type StopRow = {
  id: string;
  name: string;
  lat?: number;
  lon?: number;
  parentId?: string;
  locationType: string;
  code?: string;
};
type TripRow = {
  routeId: string;
  serviceId: string;
  shapeId: string;
  direction?: string;
};
type Pattern = {
  id: string;
  shapeId: string;
  direction?: string;
  stopIds: string[];
  tripCount: number;
};

export interface GtfsUpdateOptions {
  outputDir: string;
  local?: boolean;
  reset?: boolean;
  force?: boolean;
  reindex?: boolean;
  keepSource?: boolean;
}

type R2Target = { client: S3Client; bucket: string };
let lastProgressAt = 0;

export function parseUpdateOptions(
  args = process.argv.slice(2),
  env = process.env,
): GtfsUpdateOptions {
  return {
    outputDir: resolve(env.GTFS_OUTPUT_DIR || ".data/gtfs"),
    local: args.includes("--local"),
    reset: args.includes("--reset"),
    force: args.includes("--force"),
    reindex: args.includes("--reindex"),
    keepSource: args.includes("--keep-source"),
  };
}

export function needsTimetableMigration(previous?: GtfsManifest): boolean {
  return Boolean(previous && (
    previous.timetable?.schemaVersion !== GTFS_TIMETABLE_SCHEMA_VERSION ||
    !previous.timetable.path
  ));
}

export function shouldRefresh(
  previous?: GtfsManifest,
  options: Pick<GtfsUpdateOptions, "force" | "reindex"> = {},
  now = Date.now(),
): boolean {
  if (!previous || options.force || options.reindex || needsTimetableMigration(previous)) return true;
  const installedAt = Date.parse(previous.installedAt);
  return !Number.isFinite(installedAt) || now - installedAt >= 12 * 60 * 60_000;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runGtfsUpdate(parseUpdateOptions());
}

export async function runGtfsUpdate(options: GtfsUpdateOptions): Promise<void> {
  const outputDir = resolve(options.outputDir);
  // Decide this before constructing a client or loading any remote manifest.
  const r2 = options.local ? undefined : createR2Client();
  report("checking", "Checking the installed GTFS version.");
  try {
    if (options.reset) {
      const current = await loadCurrentManifest(outputDir, r2);
      if (!current) throw new Error("No installed GTFS manifest to reset.");
      await publishManifest({ ...current, cacheGeneration: current.cacheGeneration + 1 }, outputDir, r2);
      report("completed", "Geometry cache generation reset.");
      return;
    }

    const previous = await loadCurrentManifest(outputDir, r2);
    if (!shouldRefresh(previous, options)) {
      report("unchanged", "The 12-hour update cooldown is active.");
      return;
    }

    const tempRoot = await fs.mkdtemp(join(tmpdir(), "transport-clock-gtfs-"));
    let stagingDir: string | undefined;
    try {
      const archivePath = join(tempRoot, "idfm-gtfs.zip");
      const reindex = Boolean(options.reindex || needsTimetableMigration(previous));
      const downloaded = await downloadArchive(archivePath, previous, reindex);
      if (
        downloaded.status === "unchanged" ||
        (!reindex && previous?.sha256 === downloaded.sha256)
      ) {
        report("unchanged", "The installed GTFS archive is already current.");
        return;
      }

      report("validating", "Validating and extracting the archive.");
      const extractedDir = join(tempRoot, "extracted");
      await fs.mkdir(extractedDir, { recursive: true });
      await extractRequiredFiles(archivePath, extractedDir);

      await fs.mkdir(outputDir, { recursive: true });
      stagingDir = await fs.mkdtemp(join(outputDir, ".staging-"));
      const versionDir = join(outputDir, "versions", downloaded.sha256);
      const existingLineCount = await getExistingGeometryLineCount(versionDir);
      const stagedGeometry = join(stagingDir, "geometry");
      report("indexing", existingLineCount === undefined
        ? "Building compact per-line geometry indexes."
        : "Reusing immutable geometry for this archive SHA-256.");
      const lineCount = existingLineCount ?? await buildLineArtifacts(extractedDir, stagedGeometry);
      if (!lineCount) throw new Error("GTFS geometry is empty; keep the installed version.");

      report("indexing", "Building calendar-aware timetable indexes.");
      const timetablePath = `timetables/v${GTFS_TIMETABLE_SCHEMA_VERSION}/${downloaded.sha256}/${randomUUID()}`;
      const stagedTimetable = join(stagingDir, "timetable");
      const timetable = {
        ...await buildTimetableArtifacts(extractedDir, stagedTimetable, {
          progress: (lines, total) => reportProgress("indexing", lines, total),
        }),
        path: timetablePath,
      };
      const sourceUpdatedAt = parseHttpDate(downloaded.lastModified) ?? new Date().toISOString();
      const manifest: GtfsManifest = {
        schemaVersion: 1,
        sha256: downloaded.sha256,
        datasetVersion: sourceUpdatedAt.slice(0, 10),
        sourceUpdatedAt,
        installedAt: new Date().toISOString(),
        sourceEtag: downloaded.etag,
        sourceLastModified: downloaded.lastModified,
        cacheGeneration: (previous?.cacheGeneration ?? 0) + 1,
        lineCount,
        timetable,
      };

      // Install only complete builds. Never rebuild inside an immutable version.
      if (existingLineCount === undefined) {
        await fs.mkdir(dirname(versionDir), { recursive: true });
        await fs.rename(stagedGeometry, versionDir);
      }
      const timetableDir = join(outputDir, timetablePath);
      await fs.mkdir(dirname(timetableDir), { recursive: true });
      await fs.rename(stagedTimetable, timetableDir);

      report("publishing", `Publishing ${lineCount} geometry lines and ${timetable.fileCount} timetable files.`);
      // The active remote geometry is already complete and must not be rewritten.
      if (r2 && previous?.sha256 !== downloaded.sha256) {
        await publishDirectory(versionDir, `versions/${downloaded.sha256}`, r2, true);
      }
      if (r2) await publishDirectory(timetableDir, timetablePath, r2);
      await publishManifest(manifest, outputDir, r2);
      report("completed", `${lineCount} geometry lines and ${timetable.tripCount} timetable trips published.`);
    } finally {
      if (stagingDir && resolve(stagingDir).startsWith(outputDir + sep)) {
        await fs.rm(stagingDir, { recursive: true, force: true });
      }
      if (options.keepSource) {
        report("checking", `Source files retained for diagnostics: ${resolve(tempRoot)}`);
      } else if (resolve(tempRoot).startsWith(resolve(tmpdir()) + sep)) {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }
  } catch (error) {
    report("failed", error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    r2?.client.destroy();
  }
}
async function downloadArchive(
  archivePath: string,
  previous?: GtfsManifest,
  reindex = false,
): Promise<
  | { status: "unchanged" }
  | { status: "downloaded"; sha256: string; etag?: string; lastModified?: string }
> {
  const headers = new Headers({ Accept: "application/zip" });
  if (!reindex && previous?.sourceEtag) {
    headers.set("If-None-Match", previous.sourceEtag);
  }
  if (!reindex && previous?.sourceLastModified) {
    headers.set("If-Modified-Since", previous.sourceLastModified);
  }

  const response = await fetch(GTFS_SOURCE_URL, { headers, redirect: "follow" });
  if (response.status === 304) {
    if (reindex) throw new Error("GTFS reindex requires a full archive, but the source returned 304.");
    return { status: "unchanged" };
  }
  if (!response.ok || !response.body) {
    throw new Error(`GTFS download failed (${response.status}).`);
  }

  const advertisedSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(advertisedSize) && advertisedSize > MAX_COMPRESSED_BYTES) {
    throw new Error("GTFS archive exceeds the compressed size limit.");
  }

  const output = createWriteStream(archivePath, { flags: "wx" });
  const hash = createHash("sha256");
  let downloadedBytes = 0;
  let signature = Buffer.alloc(0);

  for await (const chunk of Readable.fromWeb(response.body as never)) {
    const buffer = Buffer.from(chunk as Uint8Array);
    downloadedBytes += buffer.length;
    if (downloadedBytes > MAX_COMPRESSED_BYTES) {
      output.destroy();
      throw new Error("GTFS archive exceeds the compressed size limit.");
    }
    if (signature.length < 4) signature = Buffer.concat([signature, buffer]).subarray(0, 4);
    hash.update(buffer);
    if (!output.write(buffer)) await once(output, "drain");

    reportProgress(
      "downloading",
      downloadedBytes,
      Number.isFinite(advertisedSize) ? advertisedSize : undefined,
    );
  }
  output.end();
  await once(output, "close");

  if (signature.toString("hex") !== "504b0304") {
    throw new Error("Downloaded GTFS file is not a valid ZIP archive.");
  }

  return {
    status: "downloaded",
    sha256: hash.digest("hex"),
    etag: response.headers.get("etag") ?? undefined,
    lastModified: response.headers.get("last-modified") ?? undefined,
  };
}

export async function extractRequiredFiles(zipPath: string, destination: string): Promise<void> {
  const found = new Set<string>();
  const openFiles = new Set<number>();
  let uncompressedBytes = 0;
  let extractionError: Error | undefined;

  const unzip = new Unzip((file) => {
    const name = file.name.replace(/\\/gu, "/");
    if (name.startsWith("/") || name.split("/").includes("..")) {
      extractionError = new Error(`Unsafe ZIP path: ${name}`);
      return;
    }
    const filename = basename(name);
    if (!REQUIRED_FILES.has(filename)) return;
    if (found.has(filename)) {
      extractionError = new Error(`Duplicate GTFS file in archive: ${filename}`);
      return;
    }
    found.add(filename);

    const descriptor = openSync(join(destination, filename), "wx");
    openFiles.add(descriptor);
    file.ondata = (error, data, final) => {
      if (error) {
        extractionError = error;
        return;
      }
      uncompressedBytes += data.length;
      if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
        extractionError = new Error("GTFS archive exceeds the uncompressed size limit.");
        return;
      }
      try {
        let offset = 0;
        while (offset < data.length) {
          offset += writeSync(descriptor, data, offset);
        }
      } catch (writeError) {
        extractionError = writeError instanceof Error ? writeError : new Error(String(writeError));
      }
      if (final) {
        closeSync(descriptor);
        openFiles.delete(descriptor);
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);

  try {
    for await (const chunk of createReadStream(zipPath)) {
      unzip.push(new Uint8Array(chunk as Buffer), false);
      if (extractionError) throw extractionError;
    }
    unzip.push(new Uint8Array(), true);
    if (extractionError) throw extractionError;
  } finally {
    for (const descriptor of openFiles) closeSync(descriptor);
  }

  const missing = [...REQUIRED_FILES].filter((file) => !found.has(file));
  if (missing.length) throw new Error(`GTFS archive is missing: ${missing.join(", ")}`);
}
export async function buildLineArtifacts(inputDir: string, versionDir: string): Promise<number> {
  const stops = await loadStops(join(inputDir, "stops.txt"));
  const routes = await loadRoutes(join(inputDir, "routes.txt"));
  if (routes.size === 0 || routes.size > MAX_ROUTE_COUNT) {
    throw new Error(`GTFS route count is outside the accepted range: ${routes.size}.`);
  }
  const geometryServices = await loadGeometryServices(
    join(inputDir, "calendar.txt"),
    join(inputDir, "calendar_dates.txt"),
  );
  const trips = await loadTrips(join(inputDir, "trips.txt"), geometryServices);
  const patterns = await loadPatterns(join(inputDir, "stop_times.txt"), trips, stops);
  const selectedPatterns = selectPatterns(patterns);
  const wantedShapeIds = new Set(
    [...selectedPatterns.values()].flatMap((items) => items.map((pattern) => pattern.shapeId)),
  );
  const shapes = await loadShapes(join(inputDir, "shapes.txt"), wantedShapeIds);
  const linesDir = join(versionDir, "lines");
  await fs.mkdir(linesDir, { recursive: true });
  let lineCount = 0;
  const lineIdsByLabel = new Map<string, Set<string>>();

  for (const [routeId, routePatterns] of selectedPatterns) {
    const route = routes.get(routeId);
    if (!route) continue;
    const usablePatterns = routePatterns.filter((pattern) => shapes.has(pattern.shapeId));
    if (!usablePatterns.length) continue;

    const parentIds = new Set(usablePatterns.flatMap((pattern) => pattern.stopIds));
    const entrances = [...stops.values()].flatMap((stop) =>
      stop.locationType === "2" &&
      stop.parentId &&
      parentIds.has(stop.parentId) &&
      stop.lat !== undefined &&
      stop.lon !== undefined
        ? [
            {
              id: stop.id,
              parentStopId: stop.parentId,
              name: stop.name,
              code: stop.code,
              lat: stop.lat,
              lon: stop.lon,
            },
          ]
        : [],
    );
    const artifact: GtfsLineArtifact = {
      schemaVersion: 1,
      lineId: routeId,
      routeIds: [routeId],
      labels: [route.shortName, route.longName].filter(Boolean),
      routeTypes: [route.routeType],
      routeColor: route.routeColor,
      routeTextColor: route.routeTextColor,
      patterns: usablePatterns.map(({ tripCount: _tripCount, ...pattern }) => {
        const projection = buildMonotonicShapeProjection(
          pattern.stopIds,
          stops,
          shapes.get(pattern.shapeId) ?? [],
        );
        return {
          ...pattern,
          shapeDirection: projection?.direction ?? "forward",
          projections: projection?.projections ?? [],
        };
      }),
      shapes: Object.fromEntries(
        [...new Set(usablePatterns.map((pattern) => pattern.shapeId))].flatMap((shapeId) => {
          const points = shapes.get(shapeId);
          return points ? [[shapeId, points] as const] : [];
        }),
      ),
      entrances,
    };
    await fs.writeFile(
      join(linesDir, `${normalizeLineKey(routeId)}.json`),
      JSON.stringify(artifact),
    );
    for (const label of artifact.labels) {
      const normalizedLabel = normalizeGtfsLineLabel(label);
      if (!normalizedLabel) continue;
      const lineIds = lineIdsByLabel.get(normalizedLabel) ?? new Set<string>();
      lineIds.add(routeId);
      lineIdsByLabel.set(normalizedLabel, lineIds);
    }
    lineCount += 1;

    if (lineCount % 100 === 0) reportProgress("indexing", lineCount, selectedPatterns.size, true);
  }
  const lookup: GtfsLineLookupIndex = {
    schemaVersion: 1,
    lineIdsByLabel: Object.fromEntries(
      [...lineIdsByLabel]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([label, lineIds]) => [label, [...lineIds].sort()]),
    ),
  };
  await fs.writeFile(join(versionDir, "line-index.json"), JSON.stringify(lookup));
  return lineCount;
}

function buildMonotonicShapeProjection(
  stopIds: string[],
  stops: Map<string, StopRow>,
  shape: Array<{ lon: number; lat: number }>,
): { direction: "forward" | "reverse"; projections: GtfsStopShapeProjection[] } | undefined {
  const coordinates = stopIds.flatMap((stopId) => {
    const stop = stops.get(stopId);
    return stop?.lon !== undefined && stop.lat !== undefined
      ? [{ lon: stop.lon, lat: stop.lat }]
      : [];
  });
  if (coordinates.length !== stopIds.length) return undefined;

  const projected = projectStopsMonotonically(coordinates, [shape]);
  if (!projected) return undefined;
  return {
    direction: projected.reversed ? "reverse" : "forward",
    projections: projected.projections.map((projection, index) => ({
      stopId: stopIds[index],
      shapePointIndex: projection.segmentIndex,
      segmentProgress: projection.progress,
      distanceAlongMeters: projection.along,
      errorMeters: projection.errorMeters,
      coordinate: projection.point,
    })),
  };
}
async function loadRoutes(path: string): Promise<Map<string, RouteRow>> {
  const result = new Map<string, RouteRow>();
  await readCsv(path, (row) => {
    if (!row.route_id) return;
    result.set(row.route_id, {
      routeId: row.route_id,
      shortName: row.route_short_name || "",
      longName: row.route_long_name || "",
      routeType: row.route_type || "",
      routeColor: normalizeGtfsColor(row.route_color, row.route_id, "route_color"),
      routeTextColor: normalizeGtfsColor(row.route_text_color, row.route_id, "route_text_color"),
    });
  });
  return result;
}

function normalizeGtfsColor(
  value: string | undefined,
  routeId: string,
  field: "route_color" | "route_text_color",
): string {
  const normalized = value?.trim().replace(/^#/u, "").toLowerCase();
  if (!normalized || !/^[0-9a-f]{6}$/u.test(normalized)) {
    throw new Error(`GTFS ${field} is missing or invalid for route ${routeId}.`);
  }
  return `#${normalized}`;
}

async function loadStops(path: string): Promise<Map<string, StopRow>> {
  const result = new Map<string, StopRow>();
  await readCsv(path, (row) => {
    const lat = finiteNumber(row.stop_lat);
    const lon = finiteNumber(row.stop_lon);
    if (
      (lat !== undefined || lon !== undefined) &&
      (lat === undefined || lon === undefined || !isWgs84(lon, lat))
    ) {
      throw new Error(`Invalid WGS84 stop coordinate for ${row.stop_id}.`);
    }
    if (!row.stop_id) return;
    result.set(row.stop_id, {
      id: row.stop_id,
      name: row.stop_name || row.stop_id,
      lat,
      lon,
      parentId: row.parent_station || undefined,
      locationType: row.location_type || "0",
      code: row.stop_code || extractEntranceCode(row.stop_name),
    });
  });
  return result;
}

async function loadTrips(
  path: string,
  geometryServices: Set<string>,
): Promise<Map<string, TripRow>> {
  const result = new Map<string, TripRow>();
  await readCsv(path, (row) => {
    if (!row.trip_id || !row.route_id || !row.shape_id) return;
    if (geometryServices.size && !geometryServices.has(row.service_id)) return;
    result.set(row.trip_id, {
      routeId: row.route_id,
      serviceId: row.service_id,
      shapeId: row.shape_id,
      direction: row.direction_id || row.trip_headsign || undefined,
    });
  });
  return result;
}

async function loadPatterns(
  path: string,
  trips: Map<string, TripRow>,
  stops: Map<string, StopRow>,
): Promise<Map<string, Map<string, Pattern>>> {
  const result = new Map<string, Map<string, Pattern>>();
  let currentTripId = "";
  let currentStopIds: string[] = [];

  const flush = () => {
    const trip = trips.get(currentTripId);
    const stopIds = dedupe(currentStopIds);
    if (!trip || stopIds.length < 2) return;
    const key = `${trip.shapeId}|${trip.direction || ""}|${stopIds.join("|")}`;
    const routePatterns = result.get(trip.routeId) ?? new Map<string, Pattern>();
    const existing = routePatterns.get(key);
    if (existing) existing.tripCount += 1;
    else {
      routePatterns.set(key, {
        id: createPatternId(key),
        shapeId: trip.shapeId,
        direction: trip.direction,
        stopIds,
        tripCount: 1,
      });
    }
    result.set(trip.routeId, routePatterns);
  };

  await readCsv(path, (row) => {
    if (!row.trip_id || !row.stop_id) return;
    if (row.trip_id !== currentTripId) {
      if (currentTripId) flush();
      currentTripId = row.trip_id;
      currentStopIds = [];
    }
    const stop = stops.get(row.stop_id);
    currentStopIds.push(stop?.parentId || stop?.id || row.stop_id);
  });
  if (currentTripId) flush();
  return result;
}

function selectPatterns(patterns: Map<string, Map<string, Pattern>>): Map<string, Pattern[]> {
  return new Map(
    [...patterns].map(([routeId, candidates]) => [
      routeId,
      [...candidates.values()]
        .sort(
          (left, right) =>
            right.stopIds.length - left.stopIds.length || right.tripCount - left.tripCount,
        )
        .slice(0, MAX_PATTERNS_PER_ROUTE),
    ]),
  );
}

async function loadShapes(
  path: string,
  wanted: Set<string>,
): Promise<Map<string, Array<{ lon: number; lat: number }>>> {
  const points = new Map<string, Array<{ lon: number; lat: number; sequence: number }>>();
  await readCsv(path, (row) => {
    if (!wanted.has(row.shape_id)) return;
    const lat = finiteNumber(row.shape_pt_lat);
    const lon = finiteNumber(row.shape_pt_lon);
    const sequence = finiteNumber(row.shape_pt_sequence);
    if (lat === undefined || lon === undefined || sequence === undefined) return;
    const list = points.get(row.shape_id) ?? [];
    list.push({ lat, lon, sequence });
    points.set(row.shape_id, list);
    if (!isWgs84(lon, lat)) {
      throw new Error(`Invalid WGS84 shape coordinate for ${row.shape_id}.`);
    }
  });

  return new Map(
    [...points].map(([shapeId, shapePoints]) => [
      shapeId,
      shapePoints
        .sort((left, right) => left.sequence - right.sequence)
        .map(({ lat, lon }) => ({ lat, lon })),
    ]),
  );
}

/**
 * Geometry must survive long planned interruptions. Keep every service that
 * has not permanently expired, including regular trips scheduled to resume
 * beyond the next 31 days. Date-specific removals affect timetables, not the
 * physical line shape.
 */
async function loadGeometryServices(
  calendarPath: string,
  exceptionsPath: string,
): Promise<Set<string>> {
  const services = new Set<string>();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  await readCsv(calendarPath, (row) => {
    const end = parseGtfsDate(row.end_date);
    if (!row.service_id || !end || end < today) return;
    if (
      [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ].some((day) => row[day] === "1")
    ) {
      services.add(row.service_id);
    }
  });
  await readCsv(exceptionsPath, (row) => {
    const date = parseGtfsDate(row.date);
    if (!row.service_id || !date || date < today) return;
    if (row.exception_type === "1") services.add(row.service_id);
  });
  return services;
}

async function loadCurrentManifest(outputDir: string, r2?: R2Target): Promise<GtfsManifest | undefined> {
  if (r2) {
    try {
      const response = await r2.client.send(
        new GetObjectCommand({ Bucket: r2.bucket, Key: "gtfs/current.json" }),
      );
      return JSON.parse(await response.Body!.transformToString()) as GtfsManifest;
    } catch (error) {
      if ((error as { name?: string }).name !== "NoSuchKey") throw error;
      return undefined;
    }
  }
  try {
    return JSON.parse(await fs.readFile(join(outputDir, "current.json"), "utf8")) as GtfsManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return undefined;
  }
}

/** Existing geometry belongs to its SHA forever, including during --reindex. */
async function getExistingGeometryLineCount(versionDir: string): Promise<number | undefined> {
  try {
    await fs.stat(versionDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const lookup = JSON.parse(await fs.readFile(join(versionDir, "line-index.json"), "utf8")) as GtfsLineLookupIndex;
  const files = await fs.readdir(join(versionDir, "lines"), { withFileTypes: true });
  const lineFiles = new Set(files.filter((file) => file.isFile() && file.name.endsWith(".json")).map((file) => file.name));
  if (lookup.schemaVersion !== 1 || !lookup.lineIdsByLabel || !lineFiles.size ||
    Object.values(lookup.lineIdsByLabel).some((ids) =>
      !Array.isArray(ids) || ids.some((id) => !lineFiles.has(`${normalizeLineKey(id)}.json`)))) {
    throw new Error(`Existing immutable GTFS geometry is incomplete: ${versionDir}`);
  }
  return lineFiles.size;
}

async function publishDirectory(
  directory: string,
  prefix: string,
  r2: R2Target,
  reuseExisting = false,
  progress = { uploaded: 0 },
): Promise<void> {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const key = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await publishDirectory(path, key, r2, reuseExisting, progress);
      continue;
    }
    if (!entry.isFile()) throw new Error(`Unexpected GTFS artifact: ${path}`);
    const body = createReadStream(path);
    try {
      await r2.client.send(new PutObjectCommand({
        Bucket: r2.bucket,
        Key: `gtfs/${key}`,
        Body: body,
        ContentType: "application/json",
        IfNoneMatch: "*",
      }));
    } catch (error) {
      // A previous run may already have installed this immutable geometry.
      // Timetable directories are unique per run: a collision there must fail.
      const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (!reuseExisting || (failure.name !== "PreconditionFailed" && failure.$metadata?.httpStatusCode !== 412)) throw error;
    } finally {
      body.destroy();
    }
    progress.uploaded += 1;
    reportProgress("publishing", progress.uploaded);
  }
}

export async function publishManifest(manifest: GtfsManifest, outputDir: string, r2?: R2Target): Promise<void> {
  const body = JSON.stringify(manifest, null, 2);
  await fs.mkdir(outputDir, { recursive: true });
  const temporaryPath = join(outputDir, `.current-${randomUUID()}.json.tmp`);
  try {
    const handle = await fs.open(temporaryPath, "wx");
    try {
      await handle.writeFile(body);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (r2) {
      await r2.client.send(new PutObjectCommand({
          Bucket: r2.bucket,
          Key: "gtfs/current.json",
          Body: body,
          ContentType: "application/json",
          CacheControl: "no-cache",
        }));
    }
    await fs.rename(temporaryPath, join(outputDir, "current.json"));
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

type ProgressPhase =
  | "checking"
  | "downloading"
  | "validating"
  | "indexing"
  | "publishing"
  | "completed"
  | "unchanged"
  | "failed";

function report(phase: ProgressPhase, message: string): void {
  console.info(`[gtfs-update] phase=${phase} ${message}`);
}

function reportProgress(
  phase: "downloading" | "indexing" | "publishing",
  current: number,
  total?: number,
  force = false,
): void {
  if (!force && Date.now() - lastProgressAt < 5_000) return;
  lastProgressAt = Date.now();
  const percent = total ? ` (${Math.round((current / total) * 100)}%)` : "";
  report(phase, `${current}${total ? `/${total}` : ""}${percent}`);
}
function createR2Client(): { client: S3Client; bucket: string } | undefined {
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.GTFS_R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return undefined;
  return {
    bucket,
    client: new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

function normalizeLineKey(value: string): string {
  return encodeURIComponent(value.trim().replace(/^line:/iu, ""));
}

function finiteNumber(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isWgs84(lon: number, lat: number): boolean {
  return Math.abs(lon) <= 180 && Math.abs(lat) <= 90;
}
function dedupe(values: string[]): string[] {
  return values.filter((value, index) => index === 0 || value !== values[index - 1]);
}

function createPatternId(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function extractEntranceCode(name: string | undefined): string | undefined {
  return /^\s*(\d+[A-Za-z]?)\b/u.exec(name || "")?.[1];
}

function parseHttpDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function parseGtfsDate(value: string | undefined): Date | undefined {
  if (!/^\d{8}$/u.test(value || "")) return undefined;
  return new Date(
    Date.UTC(
      Number(value!.slice(0, 4)),
      Number(value!.slice(4, 6)) - 1,
      Number(value!.slice(6, 8)),
    ),
  );
}
