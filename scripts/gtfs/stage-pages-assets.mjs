import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = resolve(projectRoot, ".data/gtfs");
const outputParent = resolve(projectRoot, ".nuxt-data-update");
const outputDir = resolve(outputParent, "gtfs-pages-assets");
const stagingDir = resolve(outputParent, `gtfs-pages-assets-staging-${process.pid}`);
const maxTimetableBundleBytes = 4 * 1024 * 1024;

assertWithin(outputParent, outputDir);
assertWithin(outputParent, stagingDir);

const manifest = JSON.parse(await readFile(resolve(sourceRoot, "current.json"), "utf8"));
if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{64}$/iu.test(manifest.sha256 ?? "")) {
  throw new Error("The current GTFS manifest is invalid; Pages assets were not staged.");
}

const geometryPath = `versions/${manifest.sha256}`;
const sources = [
  { relativePath: geometryPath, destinationPath: geometryPath },
];

if (manifest.timetable !== undefined) {
  const timetablePath = validateRelativeGtfsPath(manifest.timetable?.path);
  sources.push({ relativePath: timetablePath, destinationPath: timetablePath, packTimetableChunks: true });
}
if (manifest.routing !== undefined) {
  const routingPath = manifest.routing.path;
  if (typeof routingPath !== "string" || !/^routing\/v1\/[a-f0-9]{64}\/[a-zA-Z0-9-]+$/u.test(routingPath)) {
    throw new Error("The current GTFS routing path is invalid.");
  }
  sources.push({ relativePath: routingPath, destinationPath: routingPath });
}

await rm(stagingDir, { recursive: true, force: true });
await mkdir(stagingDir, { recursive: true });

let bundledTimetableChunks = 0;
let timetableBundleFiles = 0;
try {
  for (const source of sources) {
    const sourcePath = resolveGtfsPath(source.relativePath);
    const info = await stat(sourcePath);
    if (!info.isDirectory()) {
      throw new Error(`Expected a GTFS asset directory: ${source.relativePath}`);
    }
    const destination = resolve(stagingDir, ...source.destinationPath.split("/"));
    assertWithin(stagingDir, destination);
    await mkdir(dirname(destination), { recursive: true });
    if (source.packTimetableChunks) {
      const packed = await stageTimetableDirectory(sourcePath, destination);
      bundledTimetableChunks += packed.chunkCount;
      timetableBundleFiles += packed.bundleCount;
    } else {
      await cp(sourcePath, destination, { recursive: true, force: true });
    }
  }

  await cp(resolve(sourceRoot, "current.json"), resolve(stagingDir, "current.json"));
  await rm(outputDir, { recursive: true, force: true });
  try {
    await rename(stagingDir, outputDir);
  } catch (error) {
    if (error?.code !== "EPERM") throw error;
    await cp(stagingDir, outputDir, { recursive: true, force: true });
    await rm(stagingDir, { recursive: true, force: true });
  }
} catch (error) {
  await rm(stagingDir, { recursive: true, force: true });
  throw error;
}

console.info(
  `[gtfs-pages-assets] staged active geometry ${manifest.sha256}` +
    (manifest.timetable
      ? ` and timetable ${manifest.timetable.path}; bundled ${bundledTimetableChunks} chunks into ${timetableBundleFiles} assets`
      : ""),
);

async function stageTimetableDirectory(source, destination) {
  const entries = await readdir(source, { withFileTypes: true });
  let chunkCount = 0;
  let bundleCount = 0;

  for (const entry of entries) {
    const sourcePath = resolve(source, entry.name);
    const destinationPath = resolve(destination, entry.name);
    assertWithin(source, sourcePath);
    assertWithin(destination, destinationPath);
    if (!entry.isDirectory()) {
      await cp(sourcePath, destinationPath, { force: true });
      continue;
    }

    const lineEntries = await readdir(sourcePath, { withFileTypes: true });
    const sourceIndexPath = resolve(sourcePath, "index.json");
    const indexEntry = lineEntries.find((lineEntry) => lineEntry.name === "index.json" && lineEntry.isFile());
    if (!indexEntry) {
      await cp(sourcePath, destinationPath, { recursive: true, force: true });
      continue;
    }

    await mkdir(destinationPath, { recursive: true });
    const index = JSON.parse(await readFile(sourceIndexPath, "utf8"));
    if (!Array.isArray(index.chunks)) {
      throw new Error(`Invalid GTFS timetable chunk index: ${relative(source, sourceIndexPath)}`);
    }

    const pagesChunkBundles = {};
    let bundleIndex = 0;
    let bundleEntries = [];
    let bundleBytes = 2; // JSON object braces.

    const flushBundle = async () => {
      if (!bundleEntries.length) return;
      const filename = `chunks-pages-${String(bundleIndex++).padStart(4, "0")}.json`;
      const content = `{${bundleEntries.join(",")}}`;
      const outputPath = resolve(destinationPath, filename);
      assertWithin(destinationPath, outputPath);
      if (Buffer.byteLength(content) > maxTimetableBundleBytes) {
        throw new Error(`GTFS timetable bundle exceeds ${maxTimetableBundleBytes} bytes: ${filename}`);
      }
      await writeFile(outputPath, content);
      bundleEntries = [];
      bundleBytes = 2;
      bundleCount += 1;
    };

    for (const chunk of index.chunks) {
      if (typeof chunk?.file !== "string" || !/^\d+\.json$/u.test(chunk.file)) {
        throw new Error(`Invalid GTFS timetable chunk filename in ${relative(source, sourceIndexPath)}`);
      }
      const chunkPath = resolve(sourcePath, chunk.file);
      assertWithin(sourcePath, chunkPath);
      const rawChunk = await readFile(chunkPath, "utf8");
      const serializedChunk = JSON.stringify(JSON.parse(rawChunk));
      const key = JSON.stringify(chunk.file);
      const entry = `${key}:${serializedChunk}`;
      const entryBytes = Buffer.byteLength(entry) + (bundleEntries.length ? 1 : 0);

      if (bundleEntries.length && bundleBytes + entryBytes > maxTimetableBundleBytes) {
        await flushBundle();
      }

      if (bundleBytes + Buffer.byteLength(entry) > maxTimetableBundleBytes) {
        // Keep an unusually large single chunk as its original static asset.
        await cp(chunkPath, resolve(destinationPath, chunk.file), { force: true });
        continue;
      }

      const filename = `chunks-pages-${String(bundleIndex).padStart(4, "0")}.json`;
      pagesChunkBundles[chunk.file] = filename;
      bundleEntries.push(entry);
      bundleBytes += Buffer.byteLength(entry) + (bundleEntries.length > 1 ? 1 : 0);
      chunkCount += 1;
    }

    await flushBundle();
    if (Object.keys(pagesChunkBundles).length) {
      index.pagesChunkBundles = pagesChunkBundles;
    } else {
      delete index.pagesChunkBundles;
    }
    await writeFile(resolve(destinationPath, "index.json"), JSON.stringify(index));

    for (const lineEntry of lineEntries) {
      if (lineEntry.name === "index.json" || /^\d+\.json$/u.test(lineEntry.name)) continue;
      const extraPath = resolve(sourcePath, lineEntry.name);
      const extraDestination = resolve(destinationPath, lineEntry.name);
      assertWithin(sourcePath, extraPath);
      assertWithin(destinationPath, extraDestination);
      await cp(extraPath, extraDestination, { recursive: true, force: true });
    }
  }

  return { chunkCount, bundleCount };
}

function validateRelativeGtfsPath(value) {
  if (typeof value !== "string" || !value.startsWith("timetables/")) {
    throw new Error("The current GTFS timetable path is invalid.");
  }

  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("The current GTFS timetable path is invalid.");
  }

  resolveGtfsPath(value);
  return value;
}

function resolveGtfsPath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.includes("\\")) {
    throw new Error("A GTFS asset path is invalid.");
  }

  const segments = relativePath.split("/");
  if (
    !relativePath ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("A GTFS asset path is invalid.");
  }

  const path = resolve(sourceRoot, ...segments);
  assertWithin(sourceRoot, path);
  return path;
}

function assertWithin(parent, child) {
  const childPath = relative(parent, child);
  if (!childPath || childPath === ".." || childPath.startsWith(`..${sep}`) || isAbsolute(childPath)) {
    throw new Error(`Refusing to access a path outside the expected directory: ${child}`);
  }
}
