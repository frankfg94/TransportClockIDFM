import { getNeighborhoodVerdictSource, loadCompiledNeighborhoodVerdictData } from "../server/services/neighborhoodVerdict/dataStore";
import {
  AIR_NOISE_GRID_SOURCE_ID,
  AIR_NOISE_STATISTICS_SOURCE_ID,
  IRIS_SOURCE_ID,
} from "../server/services/neighborhoodVerdict/contracts";
import { openIsochroneSource } from "../server/services/isochrones/rangeSource";
import { IndexedIsochroneArchive } from "../server/services/isochrones/indexedArchive";
import { config as loadDotenv } from "dotenv";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { getRidershipStatus } from "../server/services/ridership/ridershipCache";
import {
  getNetexCacheStatus,
  getNetexRuntimeEnv,
} from "../server/services/topology/netexCache";
import type { GtfsManifest } from "../server/services/gtfs/types";
import type { GlobalMapManifest } from "../src/features/transport-map/contracts/manifest";
import {
  assertCompiledPlacesCity,
  assertPlacesManifest,
  assertPlacesRanking,
  countPlaceCategories,
  MAX_PLACES_ASSET_BYTES,
  type PlaceCategoryCounts,
} from "../src/services/places/compiledPlaces";

loadDotenv({ path: ".env.local", quiet: true });
loadDotenv({ path: ".env", quiet: true });

type DataMode =
  | "Not configured"
  | "Local"
  | "Online (Cloudflare R2)"
  | "Online (HTTP)";

type DataCheckRow = {
  Data: string;
  Configured: "Yes" | "Auto" | "Partial" | "No";
  Installed: "Yes" | "No" | "Partial" | "Disabled";
  Mode: DataMode;
  Location: string;
  Details: string;
};

type R2ClientConfig = {
  client: S3Client;
  bucket: string;
  endpoint: string;
  missing: string[];
};

type R2ObjectConfig = R2ClientConfig & {
  configured: boolean;
};

async function main(): Promise<void> {
  const rows = await Promise.all([
    checkNetex(),
    checkGtfs(),
    checkBikeNetworkData(),
    checkRidership(),
    checkR2Credentials(),
    checkNeighborhoodVerdict(),
    checkIrisNeighborhoods(),
    checkAirQuality(),
    checkSoundQuality(),
    checkServiceQuality(),
    checkIsochrones(),
    checkGlobalMap(),
    checkPlaces(),
  ]);

  console.log("\nTransport data configuration\n");
  console.table(rows);
  printRecommendations(rows);
}

export async function checkNeighborhoodVerdict(): Promise<DataCheckRow> {
  const env = getNetexRuntimeEnv();
  const source = getNeighborhoodVerdictSource(env);
  const row: DataCheckRow = { Data: "Neighborhood verdict", Configured: source.kind === "directory" ? "Auto" : "Yes", Installed: "No", Mode: modeFromSource(source.kind, false), Location: source.location, Details: "" };
  try {
    const data = await loadCompiledNeighborhoodVerdictData(env);
    return { ...row, Installed: "Yes", Details: `${data.greenSpaces.length} green spaces · ${data.gpeStations.length} GPE stations · ${data.iris.neighborhoods.length} IRIS neighborhoods · ${data.sources.length} sources · air/noise grid ${data.airNoiseGrid ? "loaded" : "absent (optional)"} · service quality ${data.serviceQuality.lines.length} lines · generated ${data.generatedAt}` };
  } catch (error) { return { ...row, Details: String(error) }; }
}

async function checkIrisNeighborhoods(): Promise<DataCheckRow> {
  const env = getNetexRuntimeEnv();
  const source = getNeighborhoodVerdictSource(env);
  const row: DataCheckRow = {
    Data: "IRIS neighborhoods",
    Configured: source.kind === "directory" ? "Auto" : "Yes",
    Installed: "No",
    Mode: modeFromSource(source.kind, false),
    Location: source.location,
    Details: "",
  };
  try {
    const data = await loadCompiledNeighborhoodVerdictData(env);
    const sourceMetadata = data.sources.find((candidate) => candidate.id === IRIS_SOURCE_ID);
    if (!sourceMetadata || data.iris.sourceId !== IRIS_SOURCE_ID || data.iris.neighborhoods.length === 0) {
      throw new Error("IRIS neighborhoods are absent from the compiled artifact.");
    }
    return {
      ...row,
      Installed: "Yes",
      Details: `${data.iris.neighborhoods.length} polygons · bbox ${data.iris.bbox.join(",")} · ${sourceMetadata.licence.label} · generated ${data.generatedAt}`,
    };
  } catch (error) {
    return { ...row, Details: String(error) };
  }
}

export function checkAirQuality(): Promise<DataCheckRow> {
  return checkAirNoiseComponent("air");
}

export function checkSoundQuality(): Promise<DataCheckRow> {
  return checkAirNoiseComponent("sound");
}

async function checkAirNoiseComponent(component: "air" | "sound"): Promise<DataCheckRow> {
  const env = getNetexRuntimeEnv();
  const source = getNeighborhoodVerdictSource(env);
  const row: DataCheckRow = {
    Data: component === "air" ? "Air quality" : "Sound quality",
    Configured: source.kind === "directory" ? "Auto" : "Yes",
    Installed: "No",
    Mode: modeFromSource(source.kind, false),
    Location: source.location,
    Details: "",
  };
  try {
    const data = await loadCompiledNeighborhoodVerdictData(env);
    const statisticsSource = data.sources.find((candidate) => candidate.id === AIR_NOISE_STATISTICS_SOURCE_ID);
    const gridSource = data.sources.find((candidate) => candidate.id === AIR_NOISE_GRID_SOURCE_ID);
    const grid = data.airNoiseGrid;
    const communeCount = Object.keys(data.airNoiseCommunes).length;
    if (!statisticsSource || communeCount === 0) {
      throw new Error("Air/noise communal data is absent from the compiled artifact.");
    }
    if (!gridSource || !grid) {
      throw new Error("Compiled air/noise grid is absent from the compiled artifact.");
    }
    const cellCount = grid.columns * grid.rows;
    if (grid.classes.length !== cellCount || grid.values.length === 0) {
      throw new Error("Compiled air/noise grid has no complete cells.");
    }
    return {
      ...row,
      Installed: "Yes",
      Details: `${communeCount} communes · ${grid.columns}×${grid.rows} cells · generated ${data.generatedAt}`,
    };
  } catch (error) {
    return { ...row, Details: String(error) };
  }
}

export async function checkServiceQuality(): Promise<DataCheckRow> {
  const env = getNetexRuntimeEnv();
  const source = getNeighborhoodVerdictSource(env);
  const row: DataCheckRow = {
    Data: "IDFM service quality",
    Configured: source.kind === "directory" ? "Auto" : "Yes",
    Installed: "No",
    Mode: modeFromSource(source.kind, false),
    Location: source.location,
    Details: "",
  };
  try {
    const data = await loadCompiledNeighborhoodVerdictData(env);
    const years = data.serviceQuality.availableYears;
    return {
      ...row,
      Installed: "Yes",
      Details: `${data.serviceQuality.lines.length} lines · ${years[0] ?? "?"}–${years.at(-1) ?? "?"} · artifact ${source.kind} · generated ${data.serviceQuality.generatedAt}`,
    };
  } catch (error) {
    return { ...row, Details: String(error) };
  }
}

export async function checkIsochrones(): Promise<DataCheckRow> {
  const env = getNetexRuntimeEnv();
  const remote = env.IDFM_MAP_ISOCHRONES_REMOTE?.trim();
  const row: DataCheckRow = { Data: "Walking isochrones", Configured: remote ? "Yes" : "Auto", Installed: "No", Mode: remote ? modeFromSource(remote.startsWith("r2://") ? "r2" : "remote", false) : "Local", Location: remote || env.IDFM_MAP_ISOCHRONES_LOCAL || "../idfm-node-backend/public/data/isochrones/walking-isochrones.zip", Details: "" };
  try {
    const source = await openIsochroneSource(env);
    try {
      const archive = await IndexedIsochroneArchive.open(source);
      return { ...row, Installed: "Yes", Details: `${Object.keys(archive.index.scopes).length} scopes · ZIP directory and index validated` };
    } finally { await source.close(); }
  } catch (error) { return { ...row, Details: String(error) }; }
}

export async function checkGlobalMap(): Promise<DataCheckRow> {
  const root = resolve(process.env.GLOBAL_MAP_OUTPUT_DIR?.trim() || "public/data/global-map/v1");
  const row: DataCheckRow = { Data: "Global map", Configured: "Auto", Installed: "No", Mode: "Local", Location: root, Details: "" };
  try {
    const manifest = JSON.parse(await fs.readFile(resolve(root, "manifest.json"), "utf8")) as GlobalMapManifest;
    if (!manifest.dataVersion || !manifest.files?.bootstrap || !manifest.files.catalog || !Array.isArray(manifest.files.chunks)) throw new Error("Invalid global map manifest");
    const assets = [manifest.files.bootstrap, manifest.files.catalog, manifest.files.regional, manifest.files.regionalBus, manifest.files.regionalBike, manifest.files.linePalette, ...manifest.files.chunks].filter(Boolean);
    for (const asset of assets) {
      const bytes = await fs.readFile(resolveContainedPath(root, asset!.asset));
      if (bytes.length !== asset!.bytes) throw new Error(`Invalid size: ${asset!.asset}`);
      JSON.parse(bytes.toString("utf8"));
    }
    return { ...row, Installed: "Yes", Details: `${assets.length} assets read · version ${manifest.dataVersion}` };
  } catch (error) { return { ...row, Details: String(error) }; }
}

export async function checkPlaces(): Promise<DataCheckRow> {
  const root = resolve(process.env.PLACES_DATA_DIR?.trim() || "public/data/places");
  const row: DataCheckRow = {
    Data: "Compiled OSM places",
    Configured: process.env.PLACES_DATA_DIR?.trim() ? "Yes" : "Auto",
    Installed: "No",
    Mode: "Local",
    Location: root,
    Details: "",
  };
  try {
    const manifest = JSON.parse(await fs.readFile(resolveContainedPath(root, "manifest.json"), "utf8")) as unknown;
    assertPlacesManifest(manifest);
    const totals = emptyPlaceCounts();
    let places = 0;
    for (const descriptor of manifest.cities) {
      const assets = descriptor.assetMetadata?.length
        ? descriptor.assetMetadata
        : (descriptor.assets ?? [descriptor.asset]).map((asset, index, all) => ({
            asset,
            ...(index === 0 ? { bytes: descriptor.bytes, checksumSha256: descriptor.checksumSha256 } : {}),
            ...(all.length === 1 ? { placeCount: descriptor.placeCount } : {}),
          }));
      let cityPlaceCount = 0;
      const cityCounts = emptyPlaceCounts();
      let cityBytes = 0;
      for (const asset of assets) {
        const bytes = await fs.readFile(resolveContainedPath(root, asset.asset));
        if ((asset.bytes !== undefined && bytes.length !== asset.bytes) || (asset.checksumSha256 !== undefined && sha256(bytes) !== asset.checksumSha256)) throw new Error(`Invalid checksum or size: ${asset.asset}`);
        if (bytes.length > MAX_PLACES_ASSET_BYTES) throw new Error(`City asset exceeds Pages limit: ${asset.asset}`);
        cityBytes += bytes.length;
        const city = JSON.parse(bytes.toString("utf8")) as unknown;
        assertCompiledPlacesCity(city);
        if (city.city.code !== descriptor.code) throw new Error(`Invalid city descriptor: ${descriptor.code}`);
        if (asset.placeCount !== undefined && city.places.length !== asset.placeCount) throw new Error(`Invalid city chunk count: ${asset.asset}`);
        const counts = countPlaceCategories(city.places);
        for (const category of Object.keys(cityCounts) as Array<keyof PlaceCategoryCounts>) {
          if (counts[category] !== city.categoryCounts[category]) throw new Error(`Invalid chunk category count: ${asset.asset}/${category}`);
          cityCounts[category] += counts[category];
        }
        cityPlaceCount += city.places.length;
      }
      if (cityPlaceCount !== descriptor.placeCount || descriptor.totalBytes !== undefined && descriptor.totalBytes !== cityBytes) throw new Error(`Invalid city descriptor: ${descriptor.code}`);
      for (const category of Object.keys(totals) as Array<keyof PlaceCategoryCounts>) {
        if (cityCounts[category] !== descriptor.categoryCounts[category]) throw new Error(`Invalid category count: ${descriptor.code}/${category}`);
        totals[category] += cityCounts[category];
      }
      places += cityPlaceCount;
    }
    const rankingBytes = await fs.readFile(resolveContainedPath(root, manifest.ranking.asset));
    if (manifest.ranking.bytes !== undefined && rankingBytes.length !== manifest.ranking.bytes) throw new Error("Invalid places ranking size.");
    if (manifest.ranking.checksumSha256 && sha256(rankingBytes) !== manifest.ranking.checksumSha256) throw new Error("Invalid places ranking checksum.");
    const ranking = JSON.parse(rankingBytes.toString("utf8")) as unknown;
    assertPlacesRanking(ranking);
    if (ranking.cityCount !== manifest.ranking.cityCount) throw new Error("Places ranking city count mismatch.");
    const unassignedBytes = await fs.readFile(resolveContainedPath(root, manifest.unassigned.asset));
    if (unassignedBytes.length !== manifest.unassigned.bytes || sha256(unassignedBytes) !== manifest.unassigned.checksumSha256) throw new Error("Invalid unassigned places checksum or size.");
    const unassigned = JSON.parse(unassignedBytes.toString("utf8")) as { places?: unknown[]; scope?: string; schemaVersion?: number; datasetId?: string };
    if (unassigned.scope !== manifest.scope || unassigned.schemaVersion !== manifest.schemaVersion || unassigned.datasetId !== manifest.datasetId || !Array.isArray(unassigned.places) || unassigned.places.length !== manifest.unassigned.count) throw new Error("Invalid unassigned places document.");
    if (manifest.totals.places !== places || manifest.totals.cities !== manifest.cities.length || manifest.totals.unassigned !== unassigned.places.length) throw new Error("Invalid places manifest totals.");
    for (const category of Object.keys(totals) as Array<keyof PlaceCategoryCounts>) {
      if (manifest.totals.categoryCounts[category] !== totals[category]) throw new Error(`Invalid places total: ${category}`);
    }
    return {
      ...row,
      Installed: manifest.unassigned.count > 0 ? "Partial" : "Yes",
      Details: `${manifest.totals.cities} communes · ${manifest.totals.places} lieux · ${manifest.totals.categoryCounts.commerce} commerces · ranking ${ranking.cityCount} communes IDF · ${manifest.unassigned.count} non affecté(s) · ${manifest.scope}`,
    };
  } catch (error) {
    return { ...row, Details: error instanceof Error ? error.message : String(error) };
  }
}

function emptyPlaceCounts(): PlaceCategoryCounts {
  return { "sports-leisure": 0, commerce: 0, security: 0, health: 0, culture: 0 };
}

function sha256(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

type BikeNetworkManifest = {
  schemaVersion: number;
  datasetId: string;
  datasetTitle: string;
  license: string;
  sourceUrl: string;
  sourceSha256: string;
  sourceUpdatedAt: string;
  fetchedAt: string;
  asset: string;
  featureCount: number;
  pathCount: number;
  vertexCount: number;
};

async function checkBikeNetworkData(): Promise<DataCheckRow> {
  const localRoot = resolve(
    process.env.IDFM_BIKE_NETWORK_DATA_DIR?.trim() || "../idfm-node-backend/public/data/bikes-network-data",
  );
  const globalMapRoot = resolve(
    process.env.GLOBAL_MAP_OUTPUT_DIR?.trim() || "public/data/global-map/v1",
  );

  let manifest: BikeNetworkManifest;
  try {
    manifest = JSON.parse(
      await fs.readFile(resolve(localRoot, "current.json"), "utf8"),
    ) as BikeNetworkManifest;
    assertBikeNetworkManifestShape(manifest);
    const assetPath = resolveContainedPath(localRoot, manifest.asset);
    JSON.parse(await fs.readFile(assetPath, "utf8"));
  } catch (error) {
    return {
      Data: "PRIM bike network",
      Configured: "No",
      Installed: "No",
      Mode: "Not configured",
      Location: localRoot,
      Details: error instanceof Error ? error.message : "Dataset manifest not found.",
    };
  }

  try {
    const globalMapManifest = JSON.parse(
      await fs.readFile(resolve(globalMapRoot, "manifest.json"), "utf8"),
    ) as GlobalMapManifest;
    const bikeAsset = globalMapManifest.files?.regionalBike?.asset;
    const bikeAssetPresent = Boolean(bikeAsset) && await fileExists(resolveContainedPath(globalMapRoot, bikeAsset!));
    const sourceMatches = globalMapManifest.sourceVersions?.bikeNetworkSha256 === manifest.sourceSha256;
    const available = globalMapManifest.modes?.includes("BIKE") &&
      bikeAssetPresent &&
      (globalMapManifest.counts?.bikes ?? 0) > 0 &&
      sourceMatches;

    return {
      Data: "PRIM bike network",
      Configured: "Yes",
      Installed: available ? "Yes" : "Partial",
      Mode: "Local",
      Location: localRoot,
      Details: available
        ? `${manifest.featureCount} aménagements · ${manifest.vertexCount} sommets · pack BIKE disponible`
        : `${manifest.featureCount} aménagements · dataset présent, pack global BIKE à recompiler`,
    };
  } catch (error) {
    return {
      Data: "PRIM bike network",
      Configured: "Yes",
      Installed: "Partial",
      Mode: "Local",
      Location: localRoot,
      Details: `Dataset présent, global map indisponible · ${error instanceof Error ? error.message : "manifest absent"}`,
    };
  }
}

function assertBikeNetworkManifestShape(manifest: BikeNetworkManifest): void {
  if (
    manifest.datasetId !== "amenagements-velo-en-ile-de-france" ||
    manifest.license !== "ODbL" ||
    !manifest.sourceUrl ||
    !/^[a-f0-9]{64}$/u.test(manifest.sourceSha256) ||
    !manifest.asset ||
    !Number.isInteger(manifest.featureCount) || manifest.featureCount <= 0 ||
    !Number.isInteger(manifest.pathCount) || manifest.pathCount <= 0 ||
    !Number.isInteger(manifest.vertexCount) || manifest.vertexCount < manifest.pathCount * 2
  ) {
    throw new Error("Invalid PRIM bike network manifest.");
  }
}

function resolveContainedPath(root: string, relativePath: string): string {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(root, relativePath);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${pathSeparator()}`)) {
    throw new Error("Dataset asset escapes its data directory.");
  }
  return resolvedPath;
}

function pathSeparator(): string {
  return process.platform === "win32" ? "\\" : "/";
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function checkNetex(): Promise<DataCheckRow> {
  const status = await getNetexCacheStatus(getNetexRuntimeEnv());
  const configured = status.source?.kind === "auto"
    ? status.available ? "Auto" : "No"
    : "Yes";

  return {
    Data: "NeTEx",
    Configured: configured,
    Installed: status.available ? "Yes" : "No",
    Mode: modeFromSource(status.source?.kind, status.available),
    Location: status.source?.location ?? "-",
    Details: status.available
      ? `${status.lineCount ?? 0} lines loaded${status.generatedAt ? ` · generated ${formatDate(status.generatedAt)}` : ""}`
      : status.message ?? "Cache unavailable",
  };
}

async function checkRidership(): Promise<DataCheckRow> {
  const status = await getRidershipStatus(getNetexRuntimeEnv());
  const configured = status.source?.kind === "auto"
    ? status.available ? "Auto" : "No"
    : "Yes";

  return {
    Data: "Annual ridership",
    Configured: configured,
    Installed: status.available ? "Yes" : "No",
    Mode: modeFromSource(status.source?.kind, status.available),
    Location: status.source?.location ?? "-",
    Details: status.available
      ? `${status.counts?.availableLines ?? 0}/${status.counts?.lines ?? 0} lines · ${status.counts?.availableStations ?? 0}/${status.counts?.stations ?? 0} stations · version ${status.version ?? "unknown"}`
      : status.message ?? "Cache unavailable",
  };
}

async function checkGtfs(): Promise<DataCheckRow> {
  const enabled = !["0", "false", "no", "off"].includes(
    (process.env.GTFS_ENABLED ?? "").trim().toLowerCase(),
  );
  if (!enabled) {
    return {
      Data: "GTFS geometry",
      Configured: "No",
      Installed: "Disabled",
      Mode: "Not configured",
      Location: "-",
      Details: "GTFS_ENABLED disables the dataset.",
    };
  }

  const r2 = createR2ObjectConfig("GTFS_R2_BUCKET");
  let remoteError = "";
  if (r2.configured) {
    try {
      const manifest = await readR2Json<GtfsManifest>(r2, "gtfs/current.json");
      return gtfsRow("Yes", "Yes", "Online (Cloudflare R2)", `r2://${r2.bucket}/gtfs`, manifest);
    } catch (error) {
      remoteError = error instanceof Error ? error.message : String(error);
    }
  }

  const localRoot = resolve(process.env.GTFS_OUTPUT_DIR?.trim() || ".data/gtfs");
  try {
    const manifest = JSON.parse(
      await fs.readFile(resolve(localRoot, "current.json"), "utf8"),
    ) as GtfsManifest;
    return gtfsRow(
      r2.missing.length ? "Partial" : "Auto",
      "Yes",
      "Local",
      localRoot,
      manifest,
      remoteError ? `R2 unavailable; local fallback used · ${remoteError}` : undefined,
    );
  } catch (error) {
    return {
      Data: "GTFS geometry",
      Configured: r2.configured ? "Yes" : r2.missing.length ? "Partial" : "No",
      Installed: "No",
      Mode: r2.configured || r2.missing.length ? "Online (Cloudflare R2)" : "Not configured",
      Location: r2.configured
        ? `r2://${r2.bucket}/gtfs`
        : r2.missing.length ? `R2 missing ${r2.missing.join(", ")}` : localRoot,
      Details: remoteError || (error instanceof Error ? error.message : "GTFS manifest not found."),
    };
  }
}

function gtfsRow(
  configured: DataCheckRow["Configured"],
  installed: DataCheckRow["Installed"],
  mode: DataMode,
  location: string,
  manifest: GtfsManifest,
  extraDetail?: string,
): DataCheckRow {
  return {
    Data: "GTFS geometry",
    Configured: configured,
    Installed: installed,
    Mode: mode,
    Location: location,
    Details: [
      `${manifest.lineCount} lines · version ${manifest.datasetVersion}`,
      extraDetail,
    ].filter(Boolean).join(" · "),
  };
}

async function checkR2Credentials(): Promise<DataCheckRow> {
  const config = createR2ClientConfig();
  const configured = config.missing.length === 0;
  return {
    Data: "Cloudflare R2 credentials",
    Configured: configured ? "Yes" : config.missing.length === 3 ? "No" : "Partial",
    Installed: configured ? "Yes" : "No",
    Mode: configured ? "Online (Cloudflare R2)" : "Not configured",
    Location: configured ? "Cloudflare R2 endpoint" : `missing ${config.missing.join(", ")}`,
    Details: configured
      ? "Credentials are present (values are not displayed)."
      : "R2 credentials are required for remote cache checks.",
  };
}

function createR2ObjectConfig(bucketVariable: string): R2ObjectConfig {
  const base = createR2ClientConfig(process.env[bucketVariable]?.trim());
  return {
    ...base,
    configured: Boolean(base.bucket) && base.missing.length === 0,
  };
}

function createR2ClientConfig(bucket = ""): R2ClientConfig {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const endpoint = process.env.R2_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  const missing: string[] = [
    ["R2_ACCOUNT_ID", accountId],
    ["R2_ACCESS_KEY_ID", accessKeyId],
    ["R2_SECRET_ACCESS_KEY", secretAccessKey],
  ].filter(([, value]) => !value).map(([name]) => name as string);

  return {
    bucket,
    endpoint,
    missing,
    client: new S3Client({
      region: "auto",
      endpoint: endpoint || undefined,
      credentials: accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
    }),
  };
}

async function readR2Json<T>(config: R2ObjectConfig, key: string): Promise<T> {
  const response = await config.client.send(new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  }));
  if (!response.Body) throw new Error(`R2 object ${key} has no body.`);
  return JSON.parse(await response.Body.transformToString()) as T;
}

function modeFromSource(kind: string | undefined, available: boolean): DataMode {
  if (kind === "directory") return "Local";
  if (kind === "r2") return "Online (Cloudflare R2)";
  if (kind === "remote") return "Online (HTTP)";
  return available ? "Local" : "Not configured";
}

function printRecommendations(rows: DataCheckRow[]): void {
  const recommendations: string[] = [];
  const byData = new Map(rows.map((row) => [row.Data, row]));

  if (byData.get("NeTEx")?.Installed !== "Yes") {
    recommendations.push(
      "NeTEx : générer le cache avec `npm run generate-netex-cache`, puis configurer IDFM_NETEX_CACHE_LOCAL ou IDFM_NETEX_CACHE_REMOTE.",
    );
  }
  if (byData.get("GTFS geometry")?.Installed !== "Yes") {
    recommendations.push(
      "GTFS : lancer `npm run gtfs:update`; pour R2, définir GTFS_R2_BUCKET, R2_ENDPOINT et les identifiants R2.",
    );
  }
  if (byData.get("PRIM bike network")?.Installed !== "Yes") {
    recommendations.push(
      "Vélo : lancer `npm --prefix ../idfm-node-backend run update:all:bikes-network-data` pour télécharger PRIM et reconstruire le pack global.",
    );
  }
  if (byData.get("Annual ridership")?.Installed !== "Yes") {
    recommendations.push(
      "Fréquentation : lancer `npm --prefix ../idfm-node-backend run generate-annual-ridership -- --year 2024`, puis configurer le cache local ou r2://.../ridership.",
    );
  }
  if (byData.get("Cloudflare R2 credentials")?.Configured !== "Yes") {
    recommendations.push(
      "R2 : définir R2_ACCOUNT_ID, R2_ACCESS_KEY_ID et R2_SECRET_ACCESS_KEY sans les afficher dans les logs.",
    );
  }

  for (const name of ["Neighborhood verdict", "IRIS neighborhoods", "Air quality", "Sound quality", "IDFM service quality", "Walking isochrones", "Global map", "Compiled OSM places"]) {
    if (byData.get(name)?.Installed !== "Yes") recommendations.push(`${name}: vérifier la source indiquée et régénérer/publier les données manquantes.`);
  }
  console.log("\nRecommendations");
  if (recommendations.length === 0) {
    console.log("- None. All configured datasets are readable.");
    return;
  }
  for (const recommendation of recommendations) console.log(`- ${recommendation}`);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

export { checkBikeNetworkData, checkGtfs, checkIrisNeighborhoods, checkNetex, checkRidership, checkR2Credentials, main };
