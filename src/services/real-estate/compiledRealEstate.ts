import { runNetworkTask } from "../networkScheduler.js";

export const DVF_DATASET_ID = "dvf-property-market-by-commune" as const;
export const DVF_DATA_SCHEMA_VERSION = 1 as const;
export const DVF_DATASET_BASE_PATH = "/data/dvf/v1";
export const DVF_SOURCE_PAGE_URL = "https://www.data.gouv.fr/datasets/demandes-de-valeurs-foncieres-geolocalisees";
export const DVF_MIN_PUBLIC_SAMPLE_SIZE = 5;
export const DVF_GRID_CELL_SIZE_METERS = 250;

export const DVF_MARKET_SCOPES = [
  "paris-intramuros",
  "petite-couronne",
  "grande-couronne",
  "idf",
] as const;

export type DvfMarketScope = typeof DVF_MARKET_SCOPES[number];
export type DvfComparisonScope = "city" | DvfMarketScope;

export interface DvfMarketPercentiles {
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface DvfMarketBenchmark {
  meanPriceM2?: number;
  medianPriceM2?: number;
  transactionCount?: number;
  cityCount: number;
  citySalesPercentiles: DvfMarketPercentiles;
  neighborhoodSalesPercentiles: DvfMarketPercentiles;
  cellSalesPercentiles: DvfMarketPercentiles;
}

export interface DvfCityRank {
  rank: number;
  cityCount: number;
}

/** Annual aggregate used to describe price movements without exposing sales. */
export interface DvfYearlyPrice {
  year: number;
  meanPriceM2: number;
  medianPriceM2: number;
  transactionCount: number;
}

export interface DvfCityDescriptor {
  code: string;
  name: string;
  departmentCode: string;
  asset: string;
  bytes: number;
  checksumSha256: string;
  meanPriceM2?: number;
  medianPriceM2?: number;
  transactionCount?: number;
  yearlyPrices?: DvfYearlyPrice[];
  referencePeriod: string;
  rankByScope: Partial<Record<DvfMarketScope, DvfCityRank>>;
  neighborhoodSalesPercentiles: DvfMarketPercentiles;
  cellSalesPercentiles: DvfMarketPercentiles;
};

export interface DvfManifest {
  schemaVersion: typeof DVF_DATA_SCHEMA_VERSION;
  datasetId: typeof DVF_DATASET_ID;
  generatedAt: string;
  referencePeriod: string;
  cellSizeMeters: typeof DVF_GRID_CELL_SIZE_METERS;
  minimumPublicSampleSize: typeof DVF_MIN_PUBLIC_SAMPLE_SIZE;
  source: {
    pageUrl: string;
    resourceUrl: string;
    producer: string;
    license: string;
    licenseUrl: string;
    attribution: string;
    sourceUpdatedAt?: string;
    sourceChecksumSha256: string;
    geolocation: string;
    privacy: string;
  };
  cities: DvfCityDescriptor[];
  marketBenchmarks: Record<DvfMarketScope, DvfMarketBenchmark>;
  totals: {
    cities: number;
    neighborhoodsWithEnoughSales: number;
    gridCellsWithEnoughSales: number;
  };
}

export interface DvfNeighborhoodMetric {
  codeIris: string;
  name: string;
  hasEnoughSales: boolean;
  meanPriceM2?: number;
  medianPriceM2?: number;
  transactionCount?: number;
  yearlyPrices?: DvfYearlyPrice[];
}

export interface DvfGridCell {
  lon: number;
  lat: number;
  /** Set when the transactions in this cell belong to one IRIS neighborhood. */
  codeIris?: string;
  transactionCount: number;
  meanPriceM2: number;
  medianPriceM2: number;
}

export interface DvfCityFile {
  schemaVersion: typeof DVF_DATA_SCHEMA_VERSION;
  datasetId: typeof DVF_DATASET_ID;
  generatedAt: string;
  referencePeriod: string;
  city: Pick<DvfCityDescriptor, "code" | "name" | "departmentCode">;
  summary: {
    meanPriceM2?: number;
    medianPriceM2?: number;
    transactionCount?: number;
    yearlyPrices?: DvfYearlyPrice[];
  };
  neighborhoods: DvfNeighborhoodMetric[];
  cells: DvfGridCell[];
}

export function assertDvfManifest(value: unknown): asserts value is DvfManifest {
  if (!isRecord(value) || value.schemaVersion !== DVF_DATA_SCHEMA_VERSION || value.datasetId !== DVF_DATASET_ID) {
    throw new Error("DVF manifest contract is unsupported.");
  }
  if (typeof value.generatedAt !== "string" || typeof value.referencePeriod !== "string" || !Array.isArray(value.cities)) {
    throw new Error("DVF manifest metadata is incomplete.");
  }
  if (!isRecord(value.source)
    || typeof value.source.pageUrl !== "string"
    || typeof value.source.resourceUrl !== "string"
    || typeof value.source.license !== "string"
    || typeof value.source.licenseUrl !== "string"
    || typeof value.source.sourceChecksumSha256 !== "string") {
    throw new Error("DVF manifest source is incomplete.");
  }
  if (!isRecord(value.marketBenchmarks) || !isRecord(value.totals)) {
    throw new Error("DVF manifest benchmarks are missing.");
  }
  for (const scope of DVF_MARKET_SCOPES) {
    const benchmark = value.marketBenchmarks[scope];
    if (!isRecord(benchmark)
      || !isNonNegativeInteger(benchmark.cityCount)
      || !isPercentiles(benchmark.citySalesPercentiles)
      || !isPercentiles(benchmark.neighborhoodSalesPercentiles)
      || !isPercentiles(benchmark.cellSalesPercentiles)
      || !isOptionalFiniteNumber(benchmark.meanPriceM2)
      || !isOptionalFiniteNumber(benchmark.medianPriceM2)
      || !isOptionalNonNegativeInteger(benchmark.transactionCount)) {
      throw new Error(`DVF market benchmark ${scope} is invalid.`);
    }
  }
  if (!isNonNegativeInteger(value.totals.cities)
    || !isNonNegativeInteger(value.totals.neighborhoodsWithEnoughSales)
    || !isNonNegativeInteger(value.totals.gridCellsWithEnoughSales)
    || value.totals.cities !== value.cities.length
    || !isNonNegativeInteger(value.cellSizeMeters)
    || !isNonNegativeInteger(value.minimumPublicSampleSize)) {
    throw new Error("DVF manifest totals are invalid.");
  }
  const seenCities = new Set<string>();
  for (const candidate of value.cities) {
    if (!isRecord(candidate)
      || typeof candidate.code !== "string"
      || !/^\d{5}$/u.test(candidate.code)
      || seenCities.has(candidate.code)
      || typeof candidate.name !== "string"
      || typeof candidate.departmentCode !== "string"
      || !/^\d{2}$/u.test(candidate.departmentCode)
      || typeof candidate.asset !== "string"
      || !/^cities\/[A-Za-z0-9_-]+\.json$/u.test(candidate.asset)
      || !isNonNegativeInteger(candidate.bytes)
      || typeof candidate.checksumSha256 !== "string"
      || !/^[a-f0-9]{64}$/u.test(candidate.checksumSha256)
      || !isOptionalFiniteNumber(candidate.meanPriceM2)
      || !isOptionalFiniteNumber(candidate.medianPriceM2)
      || !isOptionalNonNegativeInteger(candidate.transactionCount)
      || !isOptionalYearlyPrices(candidate.yearlyPrices)
      || !isRecord(candidate.rankByScope)
      || !isPercentiles(candidate.neighborhoodSalesPercentiles)
      || !isPercentiles(candidate.cellSalesPercentiles)) {
      throw new Error("DVF city descriptor is invalid.");
    }
    seenCities.add(candidate.code);
    for (const scope of DVF_MARKET_SCOPES) {
      const rank = candidate.rankByScope[scope];
      if (rank === undefined) continue;
      if (!isRecord(rank) || !isNonNegativeInteger(rank.rank) || rank.rank < 1 || !isNonNegativeInteger(rank.cityCount) || rank.rank > rank.cityCount) {
        throw new Error(`DVF city rank ${candidate.code}/${scope} is invalid.`);
      }
    }
  }
}

export function assertDvfCityFile(value: unknown): asserts value is DvfCityFile {
  if (!isRecord(value) || value.schemaVersion !== DVF_DATA_SCHEMA_VERSION || value.datasetId !== DVF_DATASET_ID) {
    throw new Error("DVF city contract is unsupported.");
  }
  if (!isRecord(value.city)
    || typeof value.city.code !== "string"
    || typeof value.city.name !== "string"
    || typeof value.city.departmentCode !== "string"
    || !isRecord(value.summary)
    || !isOptionalFiniteNumber(value.summary.meanPriceM2)
    || !isOptionalFiniteNumber(value.summary.medianPriceM2)
    || !isOptionalNonNegativeInteger(value.summary.transactionCount)
    || !isOptionalYearlyPrices(value.summary.yearlyPrices)
    || !Array.isArray(value.neighborhoods)
    || !Array.isArray(value.cells)) {
    throw new Error("DVF city asset is incomplete.");
  }
  for (const candidate of value.neighborhoods) {
    if (!isRecord(candidate)
      || typeof candidate.codeIris !== "string"
      || typeof candidate.name !== "string"
      || typeof candidate.hasEnoughSales !== "boolean"
      || !isOptionalFiniteNumber(candidate.meanPriceM2)
      || !isOptionalFiniteNumber(candidate.medianPriceM2)
      || !isOptionalNonNegativeInteger(candidate.transactionCount)
      || !isOptionalYearlyPrices(candidate.yearlyPrices)
      || (candidate.hasEnoughSales && (!isNonNegativeInteger(candidate.transactionCount) || candidate.transactionCount < DVF_MIN_PUBLIC_SAMPLE_SIZE))) {
      throw new Error("DVF neighborhood metrics are invalid.");
    }
  }
  for (const candidate of value.cells) {
    if (!isRecord(candidate)
      || !isFiniteNumber(candidate.lon)
      || candidate.lon < -180 || candidate.lon > 180
      || !isFiniteNumber(candidate.lat)
      || candidate.lat < -90 || candidate.lat > 90
      || !isOptionalString(candidate.codeIris)
      || !isNonNegativeInteger(candidate.transactionCount)
      || candidate.transactionCount < DVF_MIN_PUBLIC_SAMPLE_SIZE
      || !isFiniteNumber(candidate.meanPriceM2)
      || !isFiniteNumber(candidate.medianPriceM2)) {
      throw new Error("DVF map cells are invalid.");
    }
  }
}

export class DvfDataUnavailableError extends Error {
  readonly code = "dvf-data-unavailable";

  constructor(message = "dvf-data-unavailable") {
    super(message);
    this.name = "DvfDataUnavailableError";
  }
}

export interface DvfDataProvider {
  loadManifest(signal?: AbortSignal): Promise<DvfManifest>;
  loadCity(code: string, signal?: AbortSignal): Promise<DvfCityFile>;
}

export function createDvfDataProvider(options: { fetcher?: typeof fetch; basePath?: string } = {}): DvfDataProvider {
  const fetcher = options.fetcher ?? fetch;
  const basePath = (options.basePath ?? DVF_DATASET_BASE_PATH).replace(/\/+$/u, "");
  let manifestRequest: Promise<DvfManifest> | undefined;
  const cityRequests = new Map<string, Promise<DvfCityFile>>();

  async function loadJson<T>(asset: string, validate: (value: unknown) => asserts value is T, signal?: AbortSignal): Promise<T> {
    const response = await runNetworkTask((requestSignal) => fetcher(`${basePath}/${asset}`, {
      headers: { accept: "application/json" },
      signal: requestSignal,
    }), signal);
    if (!response.ok) throw new DvfDataUnavailableError(`DVF asset ${asset}: ${response.status}`);
    const payload: unknown = await response.json();
    validate(payload);
    return payload;
  }

  function loadManifest(signal?: AbortSignal): Promise<DvfManifest> {
    if (!manifestRequest) {
      manifestRequest = loadJson("manifest.json", assertDvfManifest).catch((error) => {
        manifestRequest = undefined;
        throw error;
      });
    }
    return signal ? withAbort(manifestRequest, signal) : manifestRequest;
  }

  async function loadCity(code: string, signal?: AbortSignal): Promise<DvfCityFile> {
    const descriptor = (await loadManifest(signal)).cities.find((candidate) => candidate.code === code);
    if (!descriptor || !/^cities\/[A-Za-z0-9_-]+\.json$/u.test(descriptor.asset)) {
      throw new DvfDataUnavailableError(`No DVF asset for commune ${code}.`);
    }
    let request = cityRequests.get(code);
    if (!request) {
      request = loadJson(descriptor.asset, assertDvfCityFile).then((city) => {
        if (city.city.code !== code) throw new DvfDataUnavailableError("DVF city code does not match its manifest.");
        return city;
      }).catch((error) => {
        cityRequests.delete(code);
        throw error;
      });
      cityRequests.set(code, request);
      while (cityRequests.size > 24) cityRequests.delete(cityRequests.keys().next().value as string);
    }
    return signal ? withAbort(request, signal) : request;
  }

  return { loadManifest, loadCity };
}

let sharedProvider: DvfDataProvider | undefined;

export function getDvfDataProvider(): DvfDataProvider {
  sharedProvider ??= createDvfDataProvider();
  return sharedProvider;
}

export function priceForScope(manifest: DvfManifest, city: DvfCityDescriptor, scope: DvfComparisonScope, measure: "mean" | "median"): number | undefined {
  if (scope === "city") return measure === "mean" ? city.meanPriceM2 : city.medianPriceM2;
  const benchmark = manifest.marketBenchmarks[scope];
  return measure === "mean" ? benchmark.meanPriceM2 : benchmark.medianPriceM2;
}

export function liquidityBand(count: number | undefined, percentiles: DvfMarketPercentiles): "low" | "typical" | "high" | "very-high" | undefined {
  if (typeof count !== "number" || !Number.isFinite(count)) return undefined;
  if (count >= percentiles.p90) return "very-high";
  if (count >= percentiles.p75) return "high";
  if (count < percentiles.p25) return "low";
  return "typical";
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
  return new Promise((resolve, reject) => {
    const abort = (): void => reject(new DOMException("The operation was aborted.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function isOptionalNonNegativeInteger(value: unknown): boolean {
  return value === undefined || isNonNegativeInteger(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalYearlyPrices(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  let previousYear = 0;
  return value.every((point) => {
    if (!isRecord(point)
      || !isNonNegativeInteger(point.year)
      || point.year <= previousYear
      || !isFiniteNumber(point.meanPriceM2)
      || point.meanPriceM2 <= 0
      || !isFiniteNumber(point.medianPriceM2)
      || point.medianPriceM2 <= 0
      || !isNonNegativeInteger(point.transactionCount)
      || point.transactionCount < DVF_MIN_PUBLIC_SAMPLE_SIZE) return false;
    previousYear = point.year;
    return true;
  });
}

function isPercentiles(value: unknown): value is DvfMarketPercentiles {
  return isRecord(value)
    && isNonNegativeInteger(value.p25)
    && isNonNegativeInteger(value.p50)
    && isNonNegativeInteger(value.p75)
    && isNonNegativeInteger(value.p90);
}
