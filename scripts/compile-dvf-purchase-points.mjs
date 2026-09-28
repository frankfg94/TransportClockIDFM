import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { basename, join, resolve } from "node:path";
import { createGunzip } from "node:zlib";

const [sourcePathArg, datasetRootArg] = process.argv.slice(2);
if (!sourcePathArg || !datasetRootArg) {
  throw new Error("Usage: node scripts/compile-dvf-purchase-points.mjs <dvf.csv.gz> <public/data/dvf/v1>");
}

const sourcePath = resolve(sourcePathArg);
const datasetRoot = resolve(datasetRootArg);
const baseManifest = JSON.parse(await readFile(join(datasetRoot, "manifest.json"), "utf8"));
const yearMatch = /^(\d{4})\D+(\d{4})$/u.exec(baseManifest.referencePeriod ?? "");
if (!yearMatch) throw new Error("The DVF manifest must provide a year range in referencePeriod.");
const firstYear = Number(yearMatch[1]);
const lastYear = Number(yearMatch[2]);
const expectedChecksum = baseManifest.source?.sourceChecksumSha256;
if (typeof expectedChecksum !== "string" || !/^[a-f0-9]{64}$/u.test(expectedChecksum)) {
  throw new Error("The DVF manifest does not contain the expected source checksum.");
}

const communeCodes = new Set(baseManifest.cities.map((city) => city.code));
const pointsByCommune = new Map();
const sourceHash = createHash("sha256");
const source = createReadStream(sourcePath);
source.on("data", (chunk) => sourceHash.update(chunk));
const csv = createInterface({ input: source.pipe(createGunzip()), crlfDelay: Infinity });

let headers;
let delimiter;
let record = "";
let unescapedQuoteCount = 0;
let rowCount = 0;
let geolocatedIdfRows = 0;

for await (const physicalLine of csv) {
  record = record ? `${record}\n${physicalLine}` : physicalLine;
  unescapedQuoteCount += countUnescapedQuotes(physicalLine);
  if (unescapedQuoteCount % 2 !== 0) continue;

  if (!headers) delimiter = detectDelimiter(record);
  const row = parseCsvRecord(record, delimiter);
  record = "";
  unescapedQuoteCount = 0;
  if (!headers) {
    headers = row.map(normalizeHeader);
    const requiredColumns = [
      ["code_commune", "code_commune_insee", "code_insee_commune"],
      ["date_mutation"],
      ["longitude", "lon"],
      ["latitude", "lat"],
    ];
    if (requiredColumns.some((aliases) => !aliases.some((alias) => headers.includes(alias)))) {
      throw new Error(`Unexpected DVF source columns: ${headers.join(", ")}`);
    }
    continue;
  }

  rowCount += 1;
  const communeCode = field(row, headers, ["code_commune", "code_commune_insee", "code_insee_commune"]);
  if (!communeCode || !communeCodes.has(communeCode)) continue;

  const date = field(row, headers, ["date_mutation"]);
  const year = getYear(date);
  if (!year || year < firstYear || year > lastYear) continue;

  const longitude = parseCoordinate(field(row, headers, ["longitude", "lon"]), -180, 180);
  const latitude = parseCoordinate(field(row, headers, ["latitude", "lat"]), -90, 90);
  if (longitude === undefined || latitude === undefined) continue;

  geolocatedIdfRows += 1;
  let locations = pointsByCommune.get(communeCode);
  if (!locations) {
    locations = new Map();
    pointsByCommune.set(communeCode, locations);
  }

  // Keep one dot per distinct parcel-centre location. No sale ID, price,
  // date, address, parcel number, or other transaction detail is published.
  const key = `${longitude},${latitude}`;
  if (!locations.has(key)) locations.set(key, [longitude, latitude]);
}

if (record) throw new Error("The source CSV ended with an incomplete quoted record.");
const actualChecksum = sourceHash.digest("hex");
if (actualChecksum !== expectedChecksum) {
  throw new Error(`DVF source checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}.`);
}
if (!headers || rowCount === 0 || geolocatedIdfRows === 0) {
  throw new Error("The DVF source has no geolocated records matching the current dataset period and communes.");
}

const outputRoot = join(datasetRoot, "purchase-points");
const cityOutputRoot = join(outputRoot, "cities");
await mkdir(cityOutputRoot, { recursive: true });
const cities = [];
for (const [cityCode, locationMap] of [...pointsByCommune].sort(([left], [right]) => left.localeCompare(right))) {
  const points = [...locationMap.values()];
  const bounds = points.reduce((current, [longitude, latitude]) => [
    Math.min(current[0], longitude),
    Math.min(current[1], latitude),
    Math.max(current[2], longitude),
    Math.max(current[3], latitude),
  ], [Infinity, Infinity, -Infinity, -Infinity]);
  const payload = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    cityCode,
    referencePeriod: baseManifest.referencePeriod,
    locationPrecision: "cadastral-parcel-centre-wgs84",
    points,
  }));
  const checksumSha256 = createHash("sha256").update(payload).digest("hex");
  const asset = `cities/${cityCode}-${checksumSha256.slice(0, 16)}.json`;
  const assetPath = join(cityOutputRoot, basename(asset));
  await writeFile(assetPath, payload);
  cities.push({
    code: cityCode,
    asset,
    bytes: payload.byteLength,
    checksumSha256,
    pointCount: points.length,
    bounds,
  });
}

const outputManifest = {
  schemaVersion: 1,
  datasetId: "dvf-purchase-parcel-centres",
  generatedAt: new Date().toISOString(),
  referencePeriod: baseManifest.referencePeriod,
  locationPrecision: "cadastral-parcel-centre-wgs84",
  privacy: "Coordinates only: no sale ID, date, price, address, or parcel number. Points are parcel centres and are loaded by the map at zoom 17 or higher.",
  source: {
    pageUrl: baseManifest.source.pageUrl,
    resourceUrl: baseManifest.source.resourceUrl,
    sourceChecksumSha256: actualChecksum,
    license: baseManifest.source.license,
    licenseUrl: baseManifest.source.licenseUrl,
    attribution: baseManifest.source.attribution,
  },
  cities,
  totals: {
    communes: cities.length,
    distinctParcelCentres: cities.reduce((total, city) => total + city.pointCount, 0),
    geolocatedIdfRows: geolocatedIdfRows,
    sourceRows: rowCount,
  },
};
await writeFile(join(outputRoot, "manifest.json"), `${JSON.stringify(outputManifest)}\n`);

console.log(`Source: ${basename(sourcePath)} (${actualChecksum})`);
console.log(`Reference period: ${baseManifest.referencePeriod}`);
console.log(`IDF rows with coordinates: ${geolocatedIdfRows}`);
console.log(`Distinct parcel-centre points: ${outputManifest.totals.distinctParcelCentres} across ${cities.length} communes`);
console.log(`Generated manifest: ${join(outputRoot, "manifest.json")}`);

function countUnescapedQuotes(value) {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '"') continue;
    if (value[index + 1] === '"') index += 1;
    else count += 1;
  }
  return count;
}

function parseCsvRecord(value, separator) {
  const detectedSeparator = separator ?? detectDelimiter(value);
  const fields = [];
  let fieldValue = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        fieldValue += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === detectedSeparator && !quoted) {
      fields.push(fieldValue);
      fieldValue = "";
    } else {
      fieldValue += character;
    }
  }
  fields.push(fieldValue);
  return fields;
}

function detectDelimiter(value) {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"') {
      if (quoted && value[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && value[index] === ",") commas += 1;
    else if (!quoted && value[index] === ";") semicolons += 1;
  }
  return semicolons > commas ? ";" : ",";
}

function normalizeHeader(value) {
  return value.replace(/^\uFEFF/u, "").trim().toLocaleLowerCase("fr-FR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function field(row, headerValues, aliases) {
  const index = aliases.map((alias) => headerValues.indexOf(alias)).find((candidate) => candidate >= 0);
  return index === undefined ? undefined : row[index]?.trim();
}

function getYear(value) {
  if (!value) return undefined;
  const match = /(?:^|\/)(\d{4})$/u.exec(value) ?? /^(\d{4})[-/]/u.exec(value);
  return match ? Number(match[1]) : undefined;
}

function parseCoordinate(value, min, max) {
  if (!value) return undefined;
  const coordinate = Number(value.trim().replace(",", "."));
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max
    ? coordinate
    : undefined;
}
