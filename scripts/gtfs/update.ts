import { createHash } from "node:crypto";
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
import { basename, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Unzip, UnzipInflate } from "fflate";
import type {
  GtfsLineArtifact,
  GtfsManifest,
  GtfsStopShapeProjection,
} from "../../server/services/gtfs/types";
import { projectStopsMonotonically } from "../../server/services/lineGeometry/traceProjection";

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

type CsvRow = Record<string, string>;
const MAX_ROUTE_COUNT = 20_000;
type RouteRow = {
  routeId: string;
  shortName: string;
  longName: string;
  routeType: string;
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

const outputDir = resolve(process.env.GTFS_OUTPUT_DIR || ".data/gtfs");
const resetRequested = process.argv.includes("--reset");
const forceRequested = process.argv.includes("--force");
const r2 = createR2Client();
let lastProgressAt = 0;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

async function main(): Promise<void> {
  report("checking", "Checking the installed GTFS version.");
  try {
    if (resetRequested) {
      const current = await loadCurrentManifest();
      if (!current) throw new Error("No installed GTFS manifest to reset.");
      await publishManifest({ ...current, cacheGeneration: current.cacheGeneration + 1 });
      report("completed", "Geometry cache generation reset.");
      return;
    }

    const previous = await loadCurrentManifest();
    const installedAt = previous ? Date.parse(previous.installedAt) : Number.NaN;
    if (
      !forceRequested &&
      Number.isFinite(installedAt) &&
      Date.now() - installedAt < 12 * 60 * 60_000
    ) {
      report("unchanged", "The 12-hour update cooldown is active.");
      return;
    }

    const tempRoot = await fs.mkdtemp(join(tmpdir(), "transport-clock-gtfs-"));
    try {
      const archivePath = join(tempRoot, "idfm-gtfs.zip");
      const downloaded = await downloadArchive(archivePath, previous);
      if (downloaded.status === "unchanged" || previous?.sha256 === downloaded.sha256) {
        report("unchanged", "The installed GTFS archive is already current.");
        return;
      }

      report("validating", "Validating and extracting the archive.");
      const extractedDir = join(tempRoot, "extracted");
      await fs.mkdir(extractedDir, { recursive: true });
      await extractRequiredFiles(archivePath, extractedDir);

      report("indexing", "Building compact per-line indexes.");
      const versionDir = join(outputDir, "versions", downloaded.sha256);
      const lineCount = await buildLineArtifacts(extractedDir, versionDir);
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
      };

      report("publishing", `Publishing ${lineCount} line indexes.`);
      await publishVersion(versionDir, downloaded.sha256);
      await publishManifest(manifest);
      report("completed", `${lineCount} lines published.`);
    } finally {
      if (tempRoot.startsWith(resolve(tmpdir()))) {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }
  } catch (error) {
    report("failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}
async function downloadArchive(
  archivePath: string,
  previous?: GtfsManifest,
): Promise<
  | { status: "unchanged" }
  | { status: "downloaded"; sha256: string; etag?: string; lastModified?: string }
> {
  const headers = new Headers({ Accept: "application/zip" });
  if (previous?.sourceEtag) headers.set("If-None-Match", previous.sourceEtag);
  if (previous?.sourceLastModified) {
    headers.set("If-Modified-Since", previous.sourceLastModified);
  }

  const response = await fetch(GTFS_SOURCE_URL, { headers, redirect: "follow" });
  if (response.status === 304) return { status: "unchanged" };
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
  const activeServices = await loadActiveServices(
    join(inputDir, "calendar.txt"),
    join(inputDir, "calendar_dates.txt"),
  );
  const trips = await loadTrips(join(inputDir, "trips.txt"), activeServices);
  const patterns = await loadPatterns(join(inputDir, "stop_times.txt"), trips, stops);
  const selectedPatterns = selectPatterns(patterns);
  const wantedShapeIds = new Set(
    [...selectedPatterns.values()].flatMap((items) => items.map((pattern) => pattern.shapeId)),
  );
  const shapes = await loadShapes(join(inputDir, "shapes.txt"), wantedShapeIds);
  const linesDir = join(versionDir, "lines");
  await fs.mkdir(linesDir, { recursive: true });
  let lineCount = 0;

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
    lineCount += 1;

    if (lineCount % 100 === 0) reportProgress("indexing", lineCount, selectedPatterns.size, true);
  }
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
    });
  });
  return result;
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

async function loadTrips(path: string, activeServices: Set<string>): Promise<Map<string, TripRow>> {
  const result = new Map<string, TripRow>();
  await readCsv(path, (row) => {
    if (!row.trip_id || !row.route_id || !row.shape_id) return;
    if (activeServices.size && !activeServices.has(row.service_id)) return;
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

async function loadActiveServices(
  calendarPath: string,
  exceptionsPath: string,
): Promise<Set<string>> {
  const active = new Set<string>();
  const dates = Array.from({ length: 31 }, (_, offset) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offset);
    return date;
  });
  await readCsv(calendarPath, (row) => {
    const start = parseGtfsDate(row.start_date);
    const end = parseGtfsDate(row.end_date);
    if (!row.service_id || !start || !end) return;
    if (dates.some((date) => date >= start && date <= end && row[weekdayKey(date)] === "1"))
      active.add(row.service_id);
  });
  await readCsv(exceptionsPath, (row) => {
    const date = parseGtfsDate(row.date);
    if (!row.service_id || !date || !dates.some((item) => sameUtcDay(item, date))) return;
    if (row.exception_type === "1") active.add(row.service_id);
    if (row.exception_type === "2") active.delete(row.service_id);
  });
  return active;
}

async function readCsv(path: string, onRow: (row: CsvRow) => void): Promise<void> {
  const input = createReadStream(path, { encoding: "utf8" });
  let headers: string[] | undefined;
  let buffered = "";

  for await (const chunk of input) {
    buffered += chunk;
    let newline = buffered.indexOf("\n");
    while (newline >= 0) {
      const line = buffered.slice(0, newline).replace(/\r$/u, "");
      buffered = buffered.slice(newline + 1);
      const fields = parseCsvLine(line);
      if (!headers) headers = fields.map((field) => field.replace(/^\uFEFF/u, "").trim());
      else if (fields.some(Boolean)) {
        onRow(Object.fromEntries(headers.map((header, index) => [header, fields[index] || ""])));
      }
      newline = buffered.indexOf("\n");
    }
  }
  if (buffered.trim() && headers) {
    const fields = parseCsvLine(buffered.replace(/\r$/u, ""));
    onRow(Object.fromEntries(headers.map((header, index) => [header, fields[index] || ""])));
  }
}

export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      fields.push(field);
      field = "";
    } else field += char;
  }
  fields.push(field);
  return fields;
}

async function loadCurrentManifest(): Promise<GtfsManifest | undefined> {
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

async function publishVersion(versionDir: string, sha256: string): Promise<void> {
  if (!r2) return;
  const linesDir = join(versionDir, "lines");
  const files = await fs.readdir(linesDir);
  let uploaded = 0;
  for (const filename of files) {
    await r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: `gtfs/versions/${sha256}/lines/${filename}`,
        Body: createReadStream(join(linesDir, filename)),
        ContentType: "application/json",
      }),
    );
    uploaded += 1;
    if (uploaded % 50 === 0) reportProgress("publishing", uploaded, files.length, true);
  }
}

async function publishManifest(manifest: GtfsManifest): Promise<void> {
  const body = JSON.stringify(manifest, null, 2);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(join(outputDir, "current.json"), body);
  if (r2) {
    await r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: "gtfs/current.json",
        Body: body,
        ContentType: "application/json",
        CacheControl: "no-cache",
      }),
    );
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

function weekdayKey(date: Date): string {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
    date.getUTCDay()
  ];
}

function sameUtcDay(left: Date, right: Date): boolean {
  return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
}
