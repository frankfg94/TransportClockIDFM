import { cp, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = resolve(projectRoot, ".data/gtfs");
const outputParent = resolve(projectRoot, ".nuxt-data-update");
const outputDir = resolve(outputParent, "gtfs-pages-assets");
const stagingDir = resolve(outputParent, `gtfs-pages-assets-staging-${process.pid}`);

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
  sources.push({ relativePath: timetablePath, destinationPath: timetablePath });
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
    await cp(sourcePath, destination, { recursive: true, force: true });
  }

  await cp(resolve(sourceRoot, "current.json"), resolve(stagingDir, "current.json"));
  await rm(outputDir, { recursive: true, force: true });
  await rename(stagingDir, outputDir);
} catch (error) {
  await rm(stagingDir, { recursive: true, force: true });
  throw error;
}

console.info(
  `[gtfs-pages-assets] staged active geometry ${manifest.sha256}` +
    (manifest.timetable ? ` and timetable ${manifest.timetable.path}` : ""),
);

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
