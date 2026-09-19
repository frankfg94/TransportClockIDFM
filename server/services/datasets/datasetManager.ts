import type { H3Event } from "h3";
import { getRequestURL } from "h3";
import { promises as fs } from "node:fs";
import { relative, resolve } from "node:path";
import type {
  DatasetFreshness,
  DatasetInfo,
  DatasetManagerResponse,
  DatasetSizeScope,
  DatasetState,
  DatasetStorage,
} from "../../../src/features/health/types";
import {
  getGtfsManifest,
  getGtfsPublicStatus,
} from "../gtfs/runtime";
import type { GtfsManifest } from "../gtfs/types";
import { IndexedIsochroneArchive } from "../isochrones/indexedArchive";
import { openIsochroneSource } from "../isochrones/rangeSource";
import {
  getCompiledNeighborhoodVerdictData,
  getNeighborhoodVerdictSource,
  loadCompiledNeighborhoodVerdictData,
} from "../neighborhoodVerdict/dataStore";
import type { VerdictSourceMetadata } from "../neighborhoodVerdict/contracts";
import { getRidershipStatus } from "../ridership/ridershipCache";
import {
  getNetexCacheStatus,
  getNetexRuntimeEnv,
} from "../topology/netexCache";
import type { GlobalMapManifest } from "../../../src/features/transport-map/contracts/manifest";
import {
  assertPlacesManifest,
  type CompiledPlacesManifest,
} from "../../../src/services/places/compiledPlaces";

const IDFM_DATA_URL = "https://data.iledefrance-mobilites.fr/";
const GTFS_SOURCE_URL = "https://eu.ftp.opendatasoft.com/stif/GTFS/IDFM-gtfs.zip";
const BIKE_SOURCE_URL = "https://www.data.gouv.fr/datasets/amenagements-cyclables-en-ile-de-france";
const GEOFABRIK_FRANCE_URL = "https://download.geofabrik.de/europe/france.html";
const ODBL_URL = "https://opendatacommons.org/licenses/odbl/1-0/";
const OPEN_LICENSE_URL = "https://www.etalab.gouv.fr/licence-ouverte-open-licence/";
const DATASET_MANAGER_SCHEMA_VERSION = 1 as const;

type CoreDatasetId =
  | "netex"
  | "gtfs"
  | "bike-network"
  | "ridership"
  | "neighborhood-verdict"
  | "walking-isochrones"
  | "global-map"
  | "places";

type DatasetDefinition = {
  id: CoreDatasetId;
  title: string;
  description: string;
  format: string;
  sourceUrl?: string;
  license: DatasetInfo["license"];
  warnAfterDays: number;
  staleAfterDays: number;
};

type SizeMeasurement = {
  bytes: number;
  scope: DatasetSizeScope;
};

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

const CORE_DATASETS: Record<CoreDatasetId, DatasetDefinition> = {
  netex: {
    id: "netex",
    title: "Cache NeTEx IDFM",
    description: "Topologie des lignes et stations utilisée par les vues détaillées du réseau.",
    format: "JSON indexé (cache NeTEx)",
    sourceUrl: IDFM_DATA_URL,
    license: { label: "Open Database License (ODbL)", url: ODBL_URL },
    warnAfterDays: 180,
    staleAfterDays: 365,
  },
  gtfs: {
    id: "gtfs",
    title: "Géométrie et horaires GTFS",
    description: "Artefacts GTFS indexés par ligne, avec formes, arrêts et horaires théoriques.",
    format: "JSON indexé (dérivé GTFS)",
    sourceUrl: GTFS_SOURCE_URL,
    license: { label: "Open Database License (ODbL)", url: ODBL_URL },
    warnAfterDays: 14,
    staleAfterDays: 20,
  },
  "bike-network": {
    id: "bike-network",
    title: "Réseau vélo PRIM",
    description: "Aménagements cyclables franciliens utilisés pour le mode vélo de la carte globale.",
    format: "JSON géospatial indexé",
    sourceUrl: BIKE_SOURCE_URL,
    license: { label: "ODbL", url: ODBL_URL },
    warnAfterDays: 365,
    staleAfterDays: 730,
  },
  ridership: {
    id: "ridership",
    title: "Fréquentation annuelle",
    description: "Classements de fréquentation des stations et lignes, conservant l’année réellement disponible.",
    format: "JSON indexé",
    sourceUrl: IDFM_DATA_URL,
    license: { label: "Licence Ouverte / Open Licence", url: OPEN_LICENSE_URL },
    warnAfterDays: 730,
    staleAfterDays: 1095,
  },
  "neighborhood-verdict": {
    id: "neighborhood-verdict",
    title: "Verdict de quartier compilé",
    description: "Artefact compilé qui rassemble les géométries, indicateurs et métadonnées des sources du score de quartier.",
    format: "JSON compilé (schéma versionné)",
    sourceUrl: IDFM_DATA_URL,
    license: { label: "Licences mixtes des sources détaillées" },
    warnAfterDays: 30,
    staleAfterDays: 90,
  },
  "walking-isochrones": {
    id: "walking-isochrones",
    title: "Isochrones piétonnes",
    description: "Archive compressée de surfaces piétonnes indexées par mode, ligne et durée d’accès.",
    format: "ZIP (index JSON + GeoJSON)",
    sourceUrl: GEOFABRIK_FRANCE_URL,
    license: { label: "Open Database License (ODbL)", url: ODBL_URL },
    warnAfterDays: 90,
    staleAfterDays: 180,
  },
  "global-map": {
    id: "global-map",
    title: "Pack de carte globale",
    description: "Pack statique chargé progressivement pour afficher les lignes, stations, chemins et modes du réseau.",
    format: "JSON packé (manifest + blocs)",
    sourceUrl: IDFM_DATA_URL,
    license: { label: "Licences mixtes IDFM, NeTEx, GTFS et OSM" },
    warnAfterDays: 30,
    staleAfterDays: 90,
  },
  places: {
    id: "places",
    title: "Lieux OSM compilés",
    description: "Dataset statique par commune, chargé au besoin pour les lieux proches et la comparaison commerciale.",
    format: "JSON communal (manifeste + fichiers lazy)",
    sourceUrl: "https://www.openstreetmap.org/",
    license: { label: "Open Database License (ODbL)", url: ODBL_URL },
    warnAfterDays: 30,
    staleAfterDays: 90,
  },
};

export async function getDatasetManagerResponse(
  event?: H3Event,
): Promise<DatasetManagerResponse> {
  const runtimeEnv = getNetexRuntimeEnv(event);
  const [netex, gtfs, bike, ridership, verdict, isochrones, globalMap, places] = await Promise.all([
    safeBuildDataset(CORE_DATASETS.netex, "unconfigured", () => buildNetexDataset(runtimeEnv)),
    safeBuildDataset(CORE_DATASETS.gtfs, "local", () => buildGtfsDataset(event)),
    safeBuildDataset(CORE_DATASETS["bike-network"], "local", () => buildBikeNetworkDataset(runtimeEnv)),
    safeBuildDataset(CORE_DATASETS.ridership, "unconfigured", () => buildRidershipDataset(runtimeEnv)),
    safeBuildDataset(CORE_DATASETS["neighborhood-verdict"], "unconfigured", () => buildNeighborhoodVerdictDataset(event)),
    safeBuildDataset(CORE_DATASETS["walking-isochrones"], "local", () => buildWalkingIsochronesDataset(runtimeEnv)),
    safeBuildDataset(CORE_DATASETS["global-map"], "local", () => buildGlobalMapDataset(event)),
    safeBuildDataset(CORE_DATASETS.places, "local", () => buildPlacesDataset(event)),
  ]);

  const verdictSources = verdict.sources ?? [];
  const datasets = [
    netex,
    gtfs,
    bike,
    ridership,
    verdict,
    isochrones,
    globalMap,
    places,
    ...verdictSources.map((source) => toSourceDataset(source)),
  ];

  return {
    schemaVersion: DATASET_MANAGER_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    datasets,
    warnings: datasets
      .filter((dataset) => dataset.state !== "available" || ["aging", "stale", "unknown"].includes(dataset.freshness.status))
      .map((dataset) => dataset.id),
  };
}

async function buildNetexDataset(runtimeEnv: ReturnType<typeof getNetexRuntimeEnv>): Promise<DatasetInfo> {
  const definition = CORE_DATASETS.netex;
  const status = await getNetexCacheStatus(runtimeEnv);
  const storage = storageFromKind(status.source?.kind);
  if (!status.available) {
    return unavailableDataset(definition, storage, status.message ? safeErrorMessage(status.message) : undefined);
  }

  const measurement = await measureSource(status.source?.location, status.source?.kind, "index.json");
  return {
    ...definition,
    state: "available",
    storage,
    ...(measurement ? { sizeBytes: measurement.bytes, sizeScope: measurement.scope } : {}),
    generatedAt: status.generatedAt,
    freshness: freshnessFromDate(status.generatedAt, definition.warnAfterDays, definition.staleAfterDays),
    metrics: [
      { label: "Lignes", value: String(status.lineCount ?? 0) },
    ],
    details: status.warning,
  };
}

async function buildGtfsDataset(event?: H3Event): Promise<DatasetInfo> {
  const definition = CORE_DATASETS.gtfs;
  const status = await getGtfsPublicStatus(event);
  const storage = storageFromGtfsStorage(status.storage);
  if (!status.enabled) {
    return unavailableDataset(definition, "unconfigured", "GTFS_ENABLED désactive ce dataset.", "disabled");
  }
  if (!status.available) {
    return unavailableDataset(definition, storage, "Le manifeste GTFS est introuvable.");
  }

  const manifest = await getGtfsManifest(event);
  const localRoot = resolve(process.env.GTFS_OUTPUT_DIR?.trim() || ".data/gtfs");
  const measurement = storage === "local"
    ? await measureLocalPath(localRoot, "dataset")
    : manifest?.timetable?.bytes
      ? { bytes: manifest.timetable.bytes, scope: "component" as const }
      : undefined;
  const sourceDate = status.sourceUpdatedAt ?? status.installedAt;

  return {
    ...definition,
    state: "available",
    storage,
    ...(measurement ? { sizeBytes: measurement.bytes, sizeScope: measurement.scope } : {}),
    updatedAt: status.sourceUpdatedAt,
    installedAt: status.installedAt,
    freshness: freshnessFromDate(sourceDate, definition.warnAfterDays, definition.staleAfterDays),
    metrics: [
      { label: "Lignes", value: String(status.lineCount ?? 0) },
      ...(status.datasetVersion ? [{ label: "Version", value: status.datasetVersion }] : []),
      ...(manifest?.timetable ? [{ label: "Courses horaires", value: String(manifest.timetable.tripCount) }] : []),
    ],
    details: measurement?.scope === "component"
      ? "La taille affichée correspond au composant horaires exposé par le manifeste distant."
      : undefined,
  };
}

async function buildBikeNetworkDataset(
  runtimeEnv: ReturnType<typeof getNetexRuntimeEnv>,
): Promise<DatasetInfo> {
  const definition = CORE_DATASETS["bike-network"];
  const root = resolve(runtimeEnv.IDFM_BIKE_NETWORK_DATA_DIR?.trim() || "../idfm-node-backend/public/data/bikes-network-data");
  try {
    const manifest = JSON.parse(await fs.readFile(resolve(root, "current.json"), "utf8")) as BikeNetworkManifest;
    if (
      manifest.datasetId !== "amenagements-velo-en-ile-de-france" ||
      !manifest.asset ||
      !manifest.sourceSha256 ||
      !manifest.sourceUpdatedAt
    ) {
      throw new Error("Le manifeste du réseau vélo est invalide.");
    }
    const assetPath = resolveContainedPath(root, manifest.asset);
    const assetInfo = await fs.stat(assetPath);
    const rootSize = await measureLocalPath(root, "dataset");
    return {
      ...definition,
      title: manifest.datasetTitle || definition.title,
      sourceUrl: manifest.sourceUrl || definition.sourceUrl,
      license: { label: manifest.license || definition.license.label, url: ODBL_URL },
      state: "available",
      storage: "local",
      ...(rootSize ? { sizeBytes: rootSize.bytes, sizeScope: rootSize.scope } : { sizeBytes: assetInfo.size, sizeScope: "component" }),
      updatedAt: manifest.sourceUpdatedAt,
      fetchedAt: manifest.fetchedAt,
      freshness: freshnessFromDate(manifest.sourceUpdatedAt, definition.warnAfterDays, definition.staleAfterDays),
      metrics: [
        { label: "Aménagements", value: String(manifest.featureCount) },
        { label: "Sommets", value: String(manifest.vertexCount) },
      ],
    };
  } catch (error) {
    return unavailableDataset(definition, "unconfigured", safeErrorMessage(error));
  }
}

async function buildRidershipDataset(
  runtimeEnv: ReturnType<typeof getNetexRuntimeEnv>,
): Promise<DatasetInfo> {
  const definition = CORE_DATASETS.ridership;
  const status = await getRidershipStatus(runtimeEnv);
  const storage = storageFromKind(status.source?.kind);
  if (!status.available) {
    return unavailableDataset(definition, storage, status.message ? safeErrorMessage(status.message) : undefined);
  }

  const measurement = await measureSource(status.source?.location, status.source?.kind, "current.json");
  return {
    ...definition,
    state: "available",
    storage,
    ...(measurement ? { sizeBytes: measurement.bytes, sizeScope: measurement.scope } : {}),
    generatedAt: status.generatedAt,
    freshness: freshnessFromDate(status.generatedAt, definition.warnAfterDays, definition.staleAfterDays),
    metrics: [
      ...(status.actualYears?.length ? [{ label: "Années", value: status.actualYears.join("–") }] : []),
      ...(status.counts ? [{ label: "Lignes", value: String(status.counts.lines) }] : []),
      ...(status.counts ? [{ label: "Stations", value: String(status.counts.stations) }] : []),
    ],
    details: status.warning,
  };
}

async function buildNeighborhoodVerdictDataset(event?: H3Event): Promise<DatasetInfo & { sources?: VerdictSourceMetadata[] }> {
  const definition = CORE_DATASETS["neighborhood-verdict"];
  const runtimeEnv = getNetexRuntimeEnv(event);
  const source = getNeighborhoodVerdictSource(runtimeEnv);
  try {
    const data = event
      ? await getCompiledNeighborhoodVerdictData(event)
      : await loadCompiledNeighborhoodVerdictData(runtimeEnv);
    const measurement = await measureSource(source.location, source.kind, "compiled.json");
    return {
      ...definition,
      state: "available",
      storage: storageFromKind(source.kind),
      ...(measurement ? { sizeBytes: measurement.bytes, sizeScope: measurement.scope } : {}),
      generatedAt: data.generatedAt,
      freshness: freshnessFromDate(data.generatedAt, definition.warnAfterDays, definition.staleAfterDays),
      metrics: [
        { label: "Sources", value: String(data.sources.length) },
        { label: "Espaces verts", value: String(data.greenSpaces.length) },
        { label: "Quartiers IRIS", value: String(data.iris.neighborhoods.length) },
      ],
      details: [
        `Schéma ${data.schemaVersion}`,
        data.warnings.length ? `${data.warnings.length} avertissement(s)` : undefined,
      ].filter(Boolean).join(" · "),
      sources: data.sources,
    };
  } catch (error) {
    return { ...unavailableDataset(definition, storageFromKind(source.kind), safeErrorMessage(error)), sources: [] };
  }
}

async function buildWalkingIsochronesDataset(
  runtimeEnv: ReturnType<typeof getNetexRuntimeEnv>,
): Promise<DatasetInfo> {
  const definition = CORE_DATASETS["walking-isochrones"];
  const remote = runtimeEnv.IDFM_MAP_ISOCHRONES_REMOTE?.trim();
  try {
    const source = await openIsochroneSource(runtimeEnv);
    try {
      const archive = await IndexedIsochroneArchive.open(source);
      return {
        ...definition,
        state: "available",
        storage: remote ? storageFromKind(remote.startsWith("r2://") ? "r2" : "remote") : "local",
        sizeBytes: source.size,
        sizeScope: "archive",
        generatedAt: archive.index.generatedAt,
        freshness: freshnessFromDate(archive.index.generatedAt, definition.warnAfterDays, definition.staleAfterDays),
        metrics: [
          { label: "Périmètres", value: String(Object.keys(archive.index.scopes).length) },
          ...(archive.index.sourceRevision ? [{ label: "Révision source", value: archive.index.sourceRevision }] : []),
        ],
        details: archive.index.attribution,
      };
    } finally {
      await source.close();
    }
  } catch (error) {
    return unavailableDataset(definition, remote ? storageFromKind(remote.startsWith("r2://") ? "r2" : "remote") : "local", safeErrorMessage(error));
  }
}

async function buildGlobalMapDataset(event?: H3Event): Promise<DatasetInfo> {
  const definition = CORE_DATASETS["global-map"];
  const root = resolve(process.env.GLOBAL_MAP_OUTPUT_DIR?.trim() || "public/data/global-map/v1");
  try {
    const loaded = await readGlobalMapManifest(event, root);
    const measurement = loaded.storage === "local"
      ? await measureLocalPath(root, "dataset")
      : undefined;
    const manifestSize = sumGlobalMapManifestBytes(loaded.manifest);
    const size = measurement ?? (manifestSize ? { bytes: manifestSize, scope: "manifest" as const } : undefined);
    return {
      ...definition,
      state: "available",
      storage: loaded.storage,
      ...(size ? { sizeBytes: size.bytes, sizeScope: size.scope } : {}),
      generatedAt: loaded.manifest.generatedAt,
      freshness: freshnessFromDate(loaded.manifest.generatedAt, definition.warnAfterDays, definition.staleAfterDays),
      metrics: [
        { label: "Lignes", value: String(loaded.manifest.counts?.lines ?? 0) },
        { label: "Stations", value: String(loaded.manifest.counts?.stations ?? 0) },
        { label: "Blocs", value: String(loaded.manifest.counts?.chunks ?? 0) },
      ],
      details: `Version ${loaded.manifest.dataVersion}`,
    };
  } catch (error) {
    return unavailableDataset(definition, "local", safeErrorMessage(error));
  }
}

async function buildPlacesDataset(event?: H3Event): Promise<DatasetInfo> {
  const definition = CORE_DATASETS.places;
  const root = resolve(process.env.PLACES_DATA_DIR?.trim() || "public/data/places");
  try {
    const loaded = await readPlacesManifest(event, root);
    const measurement = loaded.storage === "local"
      ? await measureLocalPath(root, "dataset")
      : undefined;
    const state = loaded.manifest.unassigned.count > 0 ? "partial" : "available";
    return {
      ...definition,
      state,
      storage: loaded.storage,
      ...(measurement ? { sizeBytes: measurement.bytes, sizeScope: measurement.scope } : {}),
      generatedAt: loaded.manifest.generatedAt,
      freshness: freshnessFromDate(loaded.manifest.generatedAt, definition.warnAfterDays, definition.staleAfterDays),
      metrics: [
        { label: "Communes", value: String(loaded.manifest.totals.cities) },
        { label: "Lieux", value: String(loaded.manifest.totals.places) },
        { label: "Commerces", value: String(loaded.manifest.totals.categoryCounts.commerce) },
        { label: "Non affectés", value: String(loaded.manifest.unassigned.count) },
      ],
      details: `Portée ${loaded.manifest.scope.toUpperCase()} · schéma ${loaded.manifest.schemaVersion} · ODbL${loaded.manifest.unassigned.count > 0 ? " · éléments non affectés conservés" : ""}`,
    };
  } catch (error) {
    return unavailableDataset(definition, "local", safeErrorMessage(error));
  }
}

function toSourceDataset(source: VerdictSourceMetadata): DatasetInfo {
  return {
    id: `source:${source.id}`,
    title: source.title,
    description: [source.producer, source.coverage].filter(Boolean).join(" · "),
    state: "available",
    storage: "embedded",
    format: source.format,
    sizeScope: "embedded",
    sourceUrl: source.pageUrl,
    resourceUrl: source.resourceUrl,
    license: { label: source.licence.label, url: source.licence.url },
    referencePeriod: source.referencePeriod,
    updatedAt: source.updatedAt ?? source.publishedAt,
    fetchedAt: source.fetchedAt,
    freshness: {
      status: source.freshness.status,
      ageDays: source.freshness.ageDays,
      observedAt: source.freshness.checkedAt,
      warnAfterDays: source.freshness.warnAfterDays,
      staleAfterDays: source.freshness.staleAfterDays,
    },
    metrics: [
      { label: "Producteur", value: source.producer },
      { label: "Couverture", value: source.coverage },
    ].filter((metric) => metric.value),
    details: source.limitations.length ? source.limitations.join(" · ") : undefined,
  };
}

function unavailableDataset(
  definition: DatasetDefinition,
  storage: DatasetStorage,
  details?: string,
  state: DatasetState = "missing",
): DatasetInfo {
  return {
    ...definition,
    state,
    storage,
    freshness: { status: "unknown" },
    ...(details ? { details } : {}),
  };
}

async function safeBuildDataset<T extends DatasetInfo>(
  definition: DatasetDefinition,
  fallbackStorage: DatasetStorage,
  builder: () => Promise<T>,
): Promise<T> {
  try {
    return await builder();
  } catch (error) {
    return unavailableDataset(definition, fallbackStorage, safeErrorMessage(error), "error") as T;
  }
}

function storageFromKind(kind?: string): DatasetStorage {
  if (kind === "directory") return "local";
  if (kind === "r2") return "cloudflare-r2";
  if (kind === "remote") return "http";
  return "unconfigured";
}

function storageFromGtfsStorage(storage?: string): DatasetStorage {
  if (storage === "r2") return "cloudflare-r2";
  if (storage === "local" || storage === "nitro") return "local";
  return "unconfigured";
}

export function freshnessFromDate(
  value: string | undefined,
  warnAfterDays: number,
  staleAfterDays: number,
  now = Date.now(),
): DatasetFreshness {
  if (!value) return { status: "unknown", warnAfterDays, staleAfterDays };
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return { status: "unknown", warnAfterDays, staleAfterDays };
  const ageDays = Math.max(0, Math.floor((now - timestamp) / 86_400_000));
  return {
    status: ageDays >= staleAfterDays ? "stale" : ageDays >= warnAfterDays ? "aging" : "fresh",
    ageDays,
    observedAt: new Date(timestamp).toISOString(),
    warnAfterDays,
    staleAfterDays,
  };
}

async function measureSource(
  location: string | undefined,
  kind: string | undefined,
  remoteFile: string,
): Promise<SizeMeasurement | undefined> {
  if (!location) return undefined;
  if (kind === "directory") return measureLocalPath(location, "dataset");
  if (kind === "remote") {
    const bytes = await headRemoteSize(location, remoteFile);
    return bytes === undefined ? undefined : { bytes, scope: "manifest" };
  }
  return undefined;
}

async function measureLocalPath(location: string, scope: DatasetSizeScope): Promise<SizeMeasurement | undefined> {
  try {
    return { bytes: await measurePath(location), scope };
  } catch {
    return undefined;
  }
}

async function measurePath(location: string): Promise<number> {
  const info = await fs.stat(location);
  if (info.isFile()) return info.size;
  if (!info.isDirectory()) return 0;
  const entries = await fs.readdir(location, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    if (entry.isFile()) total += (await fs.stat(resolve(location, entry.name))).size;
    else if (entry.isDirectory()) total += await measurePath(resolve(location, entry.name));
  }
  return total;
}

async function headRemoteSize(location: string, fileName: string): Promise<number | undefined> {
  try {
    const base = location.replace(/\/+$/u, "");
    const url = new URL(`${base}/${fileName}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return undefined;
    const value = Number(response.headers.get("content-length"));
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

async function readGlobalMapManifest(
  event: H3Event | undefined,
  root: string,
): Promise<{ manifest: GlobalMapManifest; storage: DatasetStorage }> {
  try {
    const manifest = JSON.parse(await fs.readFile(resolve(root, "manifest.json"), "utf8")) as GlobalMapManifest;
    assertGlobalMapManifest(manifest);
    return { manifest, storage: "local" };
  } catch (localError) {
    if (!event) throw localError;
    const url = new URL("/data/global-map/v1/manifest.json", getRequestURL(event));
    const cloudflareAssets = (event.context as { cloudflare?: { env?: { ASSETS?: { fetch(request: Request): Promise<Response> } } } } | undefined)?.cloudflare?.env?.ASSETS;
    const response = cloudflareAssets
      ? await cloudflareAssets.fetch(new Request(url))
      : await fetch(url);
    if (!response.ok) throw localError;
    const manifest = await response.json() as GlobalMapManifest;
    assertGlobalMapManifest(manifest);
    return { manifest, storage: "local" };
  }
}

async function readPlacesManifest(
  event: H3Event | undefined,
  root: string,
): Promise<{ manifest: CompiledPlacesManifest; storage: DatasetStorage }> {
  try {
    const manifest = JSON.parse(await fs.readFile(resolve(root, "manifest.json"), "utf8")) as unknown;
    assertPlacesManifest(manifest);
    return { manifest, storage: "local" };
  } catch (localError) {
    if (!event) throw localError;
    const url = new URL("/data/places/manifest.json", getRequestURL(event));
    const cloudflareAssets = (event.context as { cloudflare?: { env?: { ASSETS?: { fetch(request: Request): Promise<Response> } } } } | undefined)?.cloudflare?.env?.ASSETS;
    const response = cloudflareAssets
      ? await cloudflareAssets.fetch(new Request(url))
      : await fetch(url);
    if (!response.ok) throw localError;
    const manifest = await response.json() as unknown;
    assertPlacesManifest(manifest);
    return { manifest, storage: "local" };
  }
}

function assertGlobalMapManifest(manifest: GlobalMapManifest): void {
  if (!manifest.dataVersion || !manifest.generatedAt || !manifest.files?.bootstrap || !manifest.files?.catalog || !Array.isArray(manifest.files.chunks)) {
    throw new Error("Le manifeste de la carte globale est invalide.");
  }
}

function sumGlobalMapManifestBytes(manifest: GlobalMapManifest): number {
  const descriptors = [
    manifest.files.bootstrap,
    manifest.files.catalog,
    manifest.files.regional,
    manifest.files.regionalBus,
    manifest.files.regionalBike,
    manifest.files.linePalette,
    manifest.files.stationIndex,
    manifest.files.pathIndex,
    ...manifest.files.chunks,
  ];
  const sizes = new Map<string, number>();
  for (const descriptor of descriptors) {
    if (!descriptor || !("bytes" in descriptor) || typeof descriptor.bytes !== "number" || !Number.isFinite(descriptor.bytes) || typeof descriptor.asset !== "string") continue;
    sizes.set(descriptor.asset, descriptor.bytes);
  }
  return [...sizes.values()]
    .reduce((sum, bytes) => sum + bytes, 0);
}

function resolveContainedPath(root: string, child: string): string {
  const resolvedRoot = resolve(root);
  const resolvedChild = resolve(root, child);
  const escaped = relative(resolvedRoot, resolvedChild).startsWith("..") || relative(resolvedRoot, resolvedChild).includes("..\\");
  if (escaped) throw new Error("Le fichier du dataset sort de son dossier.");
  return resolvedChild;
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Le dataset n’a pas pu être chargé.";
  return error.message
    .replace(/[A-Za-z]:\\[^\n·]+/gu, "[chemin local]")
    .replace(/(?:^|\s)\/[^\s·]+/gu, " [chemin local]")
    .trim();
}
