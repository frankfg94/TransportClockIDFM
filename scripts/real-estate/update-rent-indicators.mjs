import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const datasetUrl = "https://www.data.gouv.fr/api/1/datasets/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/";
const datasetPageUrl = "https://www.data.gouv.fr/datasets/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025";
const idfDepartments = new Set(["75", "77", "78", "91", "92", "93", "94", "95"]);
const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../public/data/dvf/v1/rent-indicators.json");

const datasetResponse = await fetch(datasetUrl, { headers: { accept: "application/json" } });
if (!datasetResponse.ok) throw new Error(`ANIL dataset metadata request failed: HTTP ${datasetResponse.status}.`);
const dataset = await datasetResponse.json();
const datasetYear = String(dataset.title ?? "").match(/\b20\d{2}\b/u)?.[0];
if (!datasetYear) throw new Error("The ANIL rent dataset title does not include its reference year.");
const resource = dataset.resources?.find((item) => new URL(item.url).pathname.endsWith("/pred-app-mef-dhup.csv"));
if (!resource?.url) throw new Error("The ANIL apartment rent resource was not found in the official dataset.");

const sourceResponse = await fetch(resource.url, { headers: { accept: "text/csv" } });
if (!sourceResponse.ok) throw new Error(`ANIL apartment rent download failed: HTTP ${sourceResponse.status}.`);
const sourceText = new TextDecoder("windows-1252").decode(await sourceResponse.arrayBuffer());
const [headerLine, ...dataLines] = sourceText.split(/\r?\n/u).filter((line) => line.length > 0);
if (!headerLine) throw new Error("The ANIL apartment rent file is empty.");

const headers = parseCsvRecord(headerLine).map((header) => header.trim());
const columnIndexes = new Map(headers.map((header, index) => [header, index]));
for (const required of ["INSEE_C", "DEP", "loypredm2", "lwr.IPm2", "upr.IPm2", "TYPPRED", "nbobs_com", "nbobs_mail", "R2_adj"]) {
  if (!columnIndexes.has(required)) throw new Error(`The ANIL apartment rent file is missing ${required}.`);
}

const citiesByCode = new Map();
for (const line of dataLines) {
  const values = parseCsvRecord(line);
  const get = (name) => values[columnIndexes.get(name)] ?? "";
  const code = get("INSEE_C").trim();
  if (!/^\d{5}$/u.test(code) || !idfDepartments.has(get("DEP").trim())) continue;
  const rentPerSquareMeter = parseFrenchNumber(get("loypredm2"));
  const intervalLow = parseFrenchNumber(get("lwr.IPm2"));
  const intervalHigh = parseFrenchNumber(get("upr.IPm2"));
  if (rentPerSquareMeter === undefined || intervalLow === undefined || intervalHigh === undefined) continue;
  citiesByCode.set(code, {
    code,
    rentPerSquareMeter,
    intervalLow,
    intervalHigh,
    predictionLevel: get("TYPPRED").trim().toLowerCase(),
    observationsInCommune: parseFrenchNumber(get("nbobs_com")) ?? 0,
    observationsInMesh: parseFrenchNumber(get("nbobs_mail")) ?? 0,
    modelR2: parseFrenchNumber(get("R2_adj")),
  });
}

if (citiesByCode.size === 0) throw new Error("The ANIL apartment rent file contains no Île-de-France estimates.");
const payload = {
  schemaVersion: 1,
  referencePeriod: `${datasetYear}-T3`,
  source: {
    pageUrl: datasetPageUrl,
    resourceUrl: resource.url,
    sourceUpdatedAt: resource.last_modified ?? "2025-12-11",
    license: "Licence Ouverte / Open Licence version 2.0",
    attribution: "Estimations ANIL, à partir des données du Groupe SeLoger et de leboncoin",
    methodology: `Estimated asking rent, including charges, for an unfurnished reference apartment listed in Q3 ${datasetYear}; not an observed mean or median rent.`,
  },
  cities: [...citiesByCode.values()].sort((left, right) => left.code.localeCompare(right.code)),
};

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.partial`;
await writeFile(temporaryPath, `${JSON.stringify(payload)}\n`, "utf8");
await rename(temporaryPath, outputPath);
console.log(`Wrote ${payload.cities.length} Île-de-France apartment rent estimates to ${outputPath}.`);

function parseCsvRecord(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ";" && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function parseFrenchNumber(value) {
  const normalized = value.trim().replace(/,/gu, ".");
  if (!normalized) return undefined;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}
