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
const salesByCommune = new Map();
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
      ["id_mutation"],
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
  if (rowCount % 2_000_000 === 0) console.log(`Processed ${rowCount.toLocaleString("en-US")} source rows; ${geolocatedIdfRows.toLocaleString("en-US")} geolocated rows retained.`);
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

  const key = `${longitude},${latitude}`;
  if (!locations.has(key)) locations.set(key, [longitude, latitude]);

  const mutationId = field(row, headers, ["id_mutation"]);
  const saleDate = formatMutationDate(date);
  if (!mutationId || !saleDate) continue;

  let citySales = salesByCommune.get(communeCode);
  if (!citySales) {
    citySales = new Map();
    salesByCommune.set(communeCode, citySales);
  }
  let salesAtLocation = citySales.get(key);
  if (!salesAtLocation) {
    salesAtLocation = new Map();
    citySales.set(key, salesAtLocation);
  }

  let sale = salesAtLocation.get(mutationId);
  if (!sale) {
    sale = {
      date: saleDate,
      price: parseDvfNumber(field(row, headers, ["valeur_fonciere"])),
      nature: field(row, headers, ["nature_mutation"]),
      lotCount: parseDvfInteger(field(row, headers, ["nombre_lots"])),
      properties: new Map(),
    };
    salesAtLocation.set(mutationId, sale);
  } else {
    sale.price ??= parseDvfNumber(field(row, headers, ["valeur_fonciere"]));
    sale.nature ??= field(row, headers, ["nature_mutation"]);
    sale.lotCount = Math.max(sale.lotCount ?? 0, parseDvfInteger(field(row, headers, ["nombre_lots"])) ?? 0) || undefined;
  }

  const property = {
    type: field(row, headers, ["type_local"]) || field(row, headers, ["nature_culture"]),
    builtSurfaceM2: parseDvfNumber(field(row, headers, ["surface_reelle_bati"])),
    rooms: parseDvfInteger(field(row, headers, ["nombre_pieces_principales"])),
    landSurfaceM2: parseDvfNumber(field(row, headers, ["surface_terrain"])),
    carrezSurfaceM2: sumDvfNumbers(row, headers, [
      "lot1_surface_carrez",
      "lot2_surface_carrez",
      "lot3_surface_carrez",
      "lot4_surface_carrez",
      "lot5_surface_carrez",
    ]),
  };
  if (Object.values(property).some((value) => value !== undefined)) {
    const propertyKey = JSON.stringify([
      property.type,
      property.builtSurfaceM2,
      property.rooms,
      property.landSurfaceM2,
      property.carrezSurfaceM2,
    ]);
    const matchingProperty = sale.properties.get(propertyKey);
    if (matchingProperty) matchingProperty.count += 1;
    else sale.properties.set(propertyKey, { ...property, count: 1 });
  }
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
const salesOutputRoot = join(outputRoot, "sales");
await Promise.all([mkdir(cityOutputRoot, { recursive: true }), mkdir(salesOutputRoot, { recursive: true })]);
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

  const citySales = salesByCommune.get(cityCode) ?? new Map();
  const saleLocations = [...citySales].map(([locationKey, salesAtLocation]) => [
    locationMap.get(locationKey),
    [...salesAtLocation.values()]
      .sort((left, right) => right.date.localeCompare(left.date))
      .map((record) => [
        record.date,
        record.price ?? null,
        record.nature ?? null,
        record.lotCount ?? null,
        [...record.properties.values()].map((property) => [
          property.type ?? null,
          property.builtSurfaceM2 ?? null,
          property.rooms ?? null,
          property.landSurfaceM2 ?? null,
          property.carrezSurfaceM2 ?? null,
          property.count,
        ]),
      ]),
  ]).filter((location) => location[0] && location[1].length > 0);
  const salesPayload = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    cityCode,
    referencePeriod: baseManifest.referencePeriod,
    locationPrecision: "cadastral-parcel-centre-wgs84",
    locations: saleLocations,
  }));
  const salesChecksumSha256 = createHash("sha256").update(salesPayload).digest("hex");
  const salesAsset = `sales/${cityCode}-${salesChecksumSha256.slice(0, 16)}.json`;
  await writeFile(join(salesOutputRoot, basename(salesAsset)), salesPayload);
  const saleCount = saleLocations.reduce((total, location) => total + location[1].length, 0);

  cities.push({
    code: cityCode,
    asset,
    bytes: payload.byteLength,
    checksumSha256,
    pointCount: points.length,
    bounds,
    sales: {
      asset: salesAsset,
      bytes: salesPayload.byteLength,
      checksumSha256: salesChecksumSha256,
      saleCount,
      locationCount: saleLocations.length,
    },
  });
}

const outputManifest = {
  schemaVersion: 1,
  datasetId: "dvf-purchase-parcel-centres",
  generatedAt: new Date().toISOString(),
  referencePeriod: baseManifest.referencePeriod,
  locationPrecision: "cadastral-parcel-centre-wgs84",
  privacy: "Sale details are requested only after a user selects a parcel-centre marker at zoom 17 or higher. Assets omit mutation identifiers, addresses, and parcel numbers.",
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
console.log(`Sale details: ${cities.reduce((total, city) => total + city.sales.saleCount, 0)} mutations at ${cities.reduce((total, city) => total + city.sales.locationCount, 0)} locations`);
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
  const counts = new Map([[",", 0], [";", 0], ["|", 0]]);
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"') {
      if (quoted && value[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && counts.has(value[index])) counts.set(value[index], counts.get(value[index]) + 1);
  }
  return [...counts].sort((left, right) => right[1] - left[1])[0][0];
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

function formatMutationDate(value) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) return trimmed;
  const european = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(trimmed);
  if (european) return `${european[3]}-${european[2]}-${european[1]}`;
  const yearFirst = /^(\d{4})\/(\d{2})\/(\d{2})$/u.exec(trimmed);
  if (yearFirst) return `${yearFirst[1]}-${yearFirst[2]}-${yearFirst[3]}`;
  return undefined;
}

function parseDvfNumber(value) {
  if (!value) return undefined;
  const normalized = value.trim().replace(/[\s\u00a0\u202f]/gu, "").replace(",", ".");
  if (!normalized) return undefined;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function parseDvfInteger(value) {
  const number = parseDvfNumber(value);
  return number !== undefined && Number.isInteger(number) ? number : undefined;
}

function sumDvfNumbers(row, headerValues, aliases) {
  const values = aliases.map((alias) => parseDvfNumber(field(row, headerValues, [alias])))
    .filter((value) => value !== undefined);
  if (!values.length) return undefined;
  return values.reduce((total, value) => total + value, 0);
}
