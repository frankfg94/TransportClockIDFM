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

export interface DvfRentalEstimate {
  code: string;
  rentPerSquareMeter: number;
  intervalLow: number;
  intervalHigh: number;
  predictionLevel: string;
  observationsInCommune: number;
  observationsInMesh: number;
  modelR2?: number;
}

export interface DvfRentalIndicatorsFile {
  schemaVersion: 1;
  referencePeriod: string;
  source: {
    pageUrl: string;
    resourceUrl: string;
    sourceUpdatedAt: string;
    license: string;
    attribution: string;
    methodology: string;
  };
  cities: DvfRentalEstimate[];
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

export interface DvfMapDepartmentDescriptor {
  code: string;
  asset: string;
  bytes: number;
  checksumSha256: string;
  cityCount: number;
  cellCount: number;
}

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
  mapDepartments: DvfMapDepartmentDescriptor[];
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

/** Map-only cell with the commune identity needed for picking and tooltips. */
export interface DvfMapCell extends DvfGridCell {
  cityCode: string;
  cityName: string;
}

export interface DvfMapDepartmentFile {
  schemaVersion: typeof DVF_DATA_SCHEMA_VERSION;
  datasetId: typeof DVF_DATASET_ID;
  generatedAt: string;
  referencePeriod: string;
  departmentCode: string;
  cells: DvfMapCell[];
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

export type DvfPurchasePoint = readonly [longitude: number, latitude: number];

export interface DvfPurchasePointsFile {
  schemaVersion: 1;
  cityCode: string;
  referencePeriod: string;
  locationPrecision: "cadastral-parcel-centre-wgs84";
  points: DvfPurchasePoint[];
}

export interface DvfPurchasePropertyDetails {
  type?: string;
  builtSurfaceM2?: number;
  rooms?: number;
  landSurfaceM2?: number;
  carrezSurfaceM2?: number;
  count: number;
}

export interface DvfPurchaseSaleDetails {
  date: string;
  price?: number;
  nature?: string;
  lotCount?: number;
  properties: DvfPurchasePropertyDetails[];
}

export interface DvfPurchaseSalesLocation {
  coordinates: DvfPurchasePoint;
  sales: DvfPurchaseSaleDetails[];
}

export interface DvfPurchaseSalesFile {
  schemaVersion: 1;
  cityCode: string;
  referencePeriod: string;
  locationPrecision: "cadastral-parcel-centre-wgs84";
  locations: DvfPurchaseSalesLocation[];
}

type DvfCompactPurchaseProperty = readonly [
  type: string | null,
  builtSurfaceM2: number | null,
  rooms: number | null,
  landSurfaceM2: number | null,
  carrezSurfaceM2: number | null,
  count: number,
];

type DvfCompactPurchaseSale = readonly [
  date: string,
  price: number | null,
  nature: string | null,
  lotCount: number | null,
  properties: readonly DvfCompactPurchaseProperty[],
];

type DvfCompactPurchaseLocation = readonly [
  coordinates: DvfPurchasePoint,
  sales: readonly DvfCompactPurchaseSale[],
];

interface DvfCompactPurchaseSalesAsset {
  schemaVersion: 1;
  cityCode: string;
  referencePeriod: string;
  locationPrecision: "cadastral-parcel-centre-wgs84";
  locations: readonly DvfCompactPurchaseLocation[];
}

export interface DvfPurchaseSalesDescriptor {
  asset: string;
  bytes: number;
  checksumSha256: string;
  saleCount: number;
  locationCount: number;
}

export interface DvfPurchasePointsCityDescriptor {
  code: string;
  asset: string;
  bytes: number;
  checksumSha256: string;
  pointCount: number;
  bounds: readonly [minLongitude: number, minLatitude: number, maxLongitude: number, maxLatitude: number];
  sales?: DvfPurchaseSalesDescriptor;
}

export interface DvfPurchasePointsManifest {
  schemaVersion: 1;
  datasetId: "dvf-purchase-parcel-centres";
  generatedAt: string;
  referencePeriod: string;
  locationPrecision: "cadastral-parcel-centre-wgs84";
  privacy: string;
  source: {
    pageUrl: string;
    resourceUrl: string;
    sourceChecksumSha256: string;
    license: string;
    licenseUrl: string;
    attribution: string;
  };
  cities: DvfPurchasePointsCityDescriptor[];
  totals: {
    communes: number;
    distinctParcelCentres: number;
    geolocatedIdfRows: number;
    sourceRows: number;
  };
}

const DVF_PURCHASE_POINTS_SCHEMA_VERSION = 1 as const;
const DVF_PURCHASE_POINTS_DATASET_ID = "dvf-purchase-parcel-centres" as const;
const DVF_PURCHASE_POINTS_PRECISION = "cadastral-parcel-centre-wgs84" as const;

export function assertDvfManifest(value: unknown): asserts value is DvfManifest {
  if (!isRecord(value) || value.schemaVersion !== DVF_DATA_SCHEMA_VERSION || value.datasetId !== DVF_DATASET_ID) {
    throw new Error("DVF manifest contract is unsupported.");
  }
  if (typeof value.generatedAt !== "string" || typeof value.referencePeriod !== "string" || !Array.isArray(value.cities)) {
    throw new Error("DVF manifest metadata is incomplete.");
  }
  if (!Array.isArray(value.mapDepartments) || value.mapDepartments.length === 0) {
    throw new Error("DVF map department descriptors are missing.");
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
  const seenDepartments = new Set<string>();
  let departmentCityCount = 0;
  let departmentCellCount = 0;
  for (const candidate of value.mapDepartments) {
    if (!isRecord(candidate)
      || typeof candidate.code !== "string"
      || !/^\d{2}$/u.test(candidate.code)
      || seenDepartments.has(candidate.code)
      || typeof candidate.asset !== "string"
      || !/^map\/\d{2}-[a-f0-9]{16}\.json$/u.test(candidate.asset)
      || !isNonNegativeInteger(candidate.bytes)
      || candidate.bytes === 0
      || typeof candidate.checksumSha256 !== "string"
      || !/^[a-f0-9]{64}$/u.test(candidate.checksumSha256)
      || !isNonNegativeInteger(candidate.cityCount)
      || candidate.cityCount === 0
      || !isNonNegativeInteger(candidate.cellCount)) {
      throw new Error("DVF map department descriptor is invalid.");
    }
    seenDepartments.add(candidate.code);
    departmentCityCount += candidate.cityCount;
    departmentCellCount += candidate.cellCount;
  }
  if (departmentCityCount !== value.totals.cities
    || departmentCellCount !== value.totals.gridCellsWithEnoughSales) {
    throw new Error("DVF map department totals do not match the manifest.");
  }
}

export function assertDvfRentalIndicatorsFile(value: unknown): asserts value is DvfRentalIndicatorsFile {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || typeof value.referencePeriod !== "string"
    || !isRecord(value.source)
    || typeof value.source.pageUrl !== "string"
    || typeof value.source.resourceUrl !== "string"
    || typeof value.source.sourceUpdatedAt !== "string"
    || typeof value.source.license !== "string"
    || typeof value.source.attribution !== "string"
    || typeof value.source.methodology !== "string"
    || !Array.isArray(value.cities)) {
    throw new Error("ANIL rent-indicator asset is invalid.");
  }

  const seenCities = new Set<string>();
  for (const candidate of value.cities) {
    if (!isRecord(candidate)
      || typeof candidate.code !== "string"
      || !/^\d{5}$/u.test(candidate.code)
      || seenCities.has(candidate.code)
      || !isFiniteNumber(candidate.rentPerSquareMeter)
      || candidate.rentPerSquareMeter <= 0
      || !isFiniteNumber(candidate.intervalLow)
      || !isFiniteNumber(candidate.intervalHigh)
      || candidate.intervalLow <= 0
      || candidate.intervalHigh < candidate.intervalLow
      || typeof candidate.predictionLevel !== "string"
      || !isNonNegativeInteger(candidate.observationsInCommune)
      || !isNonNegativeInteger(candidate.observationsInMesh)
      || !isOptionalFiniteNumber(candidate.modelR2)) {
      throw new Error("ANIL rent-indicator commune is invalid.");
    }
    seenCities.add(candidate.code);
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

/** Validate only the compact fields present in a map department shard. */
export function assertDvfMapDepartmentFile(value: unknown): asserts value is DvfMapDepartmentFile {
  if (!isRecord(value)
    || value.schemaVersion !== DVF_DATA_SCHEMA_VERSION
    || value.datasetId !== DVF_DATASET_ID
    || typeof value.generatedAt !== "string"
    || typeof value.referencePeriod !== "string"
    || typeof value.departmentCode !== "string"
    || !/^\d{2}$/u.test(value.departmentCode)
    || !Array.isArray(value.cells)) {
    throw new Error("DVF map department contract is incomplete.");
  }
  for (const candidate of value.cells) {
    if (!isRecord(candidate)
      || typeof candidate.cityCode !== "string"
      || !/^\d{5}$/u.test(candidate.cityCode)
      || candidate.cityCode.slice(0, 2) !== value.departmentCode
      || typeof candidate.cityName !== "string"
      || !isFiniteNumber(candidate.lon)
      || candidate.lon < -180 || candidate.lon > 180
      || !isFiniteNumber(candidate.lat)
      || candidate.lat < -90 || candidate.lat > 90
      || !isOptionalString(candidate.codeIris)
      || !isNonNegativeInteger(candidate.transactionCount)
      || candidate.transactionCount < DVF_MIN_PUBLIC_SAMPLE_SIZE
      || !isFiniteNumber(candidate.meanPriceM2)
      || !isFiniteNumber(candidate.medianPriceM2)) {
      throw new Error("DVF map department cells are invalid.");
    }
  }
}

export function assertDvfPurchasePointsManifest(value: unknown): asserts value is DvfPurchasePointsManifest {
  if (!isRecord(value)
    || value.schemaVersion !== DVF_PURCHASE_POINTS_SCHEMA_VERSION
    || value.datasetId !== DVF_PURCHASE_POINTS_DATASET_ID
    || value.locationPrecision !== DVF_PURCHASE_POINTS_PRECISION
    || typeof value.generatedAt !== "string"
    || typeof value.referencePeriod !== "string"
    || typeof value.privacy !== "string"
    || !Array.isArray(value.cities)
    || !isRecord(value.source)
    || typeof value.source.pageUrl !== "string"
    || typeof value.source.resourceUrl !== "string"
    || typeof value.source.sourceChecksumSha256 !== "string"
    || !/^[a-f0-9]{64}$/u.test(value.source.sourceChecksumSha256)
    || typeof value.source.license !== "string"
    || typeof value.source.licenseUrl !== "string"
    || typeof value.source.attribution !== "string"
    || !isRecord(value.totals)) {
    throw new Error("DVF purchase-points manifest is invalid.");
  }

  const seenCities = new Set<string>();
  let distinctParcelCentres = 0;
  for (const city of value.cities) {
    if (!isRecord(city)
      || typeof city.code !== "string"
      || !/^\d{5}$/u.test(city.code)
      || seenCities.has(city.code)
      || typeof city.asset !== "string"
      || !/^cities\/[A-Za-z0-9_-]+\.json$/u.test(city.asset)
      || !isNonNegativeInteger(city.bytes)
      || typeof city.checksumSha256 !== "string"
      || !/^[a-f0-9]{64}$/u.test(city.checksumSha256)
      || !isNonNegativeInteger(city.pointCount)
      || city.pointCount < 1
      || !Array.isArray(city.bounds)
      || city.bounds.length !== 4
      || !isFiniteNumber(city.bounds[0]) || city.bounds[0] < -180 || city.bounds[0] > 180
      || !isFiniteNumber(city.bounds[1]) || city.bounds[1] < -90 || city.bounds[1] > 90
      || !isFiniteNumber(city.bounds[2]) || city.bounds[2] < -180 || city.bounds[2] > 180
      || !isFiniteNumber(city.bounds[3]) || city.bounds[3] < -90 || city.bounds[3] > 90
      || city.bounds[0] > city.bounds[2]
      || city.bounds[1] > city.bounds[3]
      || (city.sales !== undefined && (!isRecord(city.sales)
        || typeof city.sales.asset !== "string"
        || !/^sales\/[A-Za-z0-9_-]+\.json$/u.test(city.sales.asset)
        || !isNonNegativeInteger(city.sales.bytes)
        || typeof city.sales.checksumSha256 !== "string"
        || !/^[a-f0-9]{64}$/u.test(city.sales.checksumSha256)
        || !isNonNegativeInteger(city.sales.saleCount)
        || !isNonNegativeInteger(city.sales.locationCount)))) {
      throw new Error("DVF purchase-points city descriptor is invalid.");
    }
    seenCities.add(city.code);
    distinctParcelCentres += city.pointCount;
  }

  if (!isNonNegativeInteger(value.totals.communes)
    || value.totals.communes !== value.cities.length
    || !isNonNegativeInteger(value.totals.distinctParcelCentres)
    || value.totals.distinctParcelCentres !== distinctParcelCentres
    || !isNonNegativeInteger(value.totals.geolocatedIdfRows)
    || !isNonNegativeInteger(value.totals.sourceRows)) {
    throw new Error("DVF purchase-points manifest totals are invalid.");
  }
}

export function assertDvfPurchasePointsFile(value: unknown): asserts value is DvfPurchasePointsFile {
  if (!isRecord(value)
    || value.schemaVersion !== DVF_PURCHASE_POINTS_SCHEMA_VERSION
    || typeof value.cityCode !== "string"
    || !/^\d{5}$/u.test(value.cityCode)
    || typeof value.referencePeriod !== "string"
    || value.locationPrecision !== DVF_PURCHASE_POINTS_PRECISION
    || !Array.isArray(value.points)) {
    throw new Error("DVF purchase-points city asset is invalid.");
  }

  for (const point of value.points) {
    if (!Array.isArray(point)
      || point.length !== 2
      || !isFiniteNumber(point[0])
      || point[0] < -180 || point[0] > 180
      || !isFiniteNumber(point[1])
      || point[1] < -90 || point[1] > 90) {
      throw new Error("DVF purchase-points coordinates are invalid.");
    }
  }
}

export function assertDvfPurchaseSalesAsset(value: unknown): asserts value is DvfCompactPurchaseSalesAsset {
  if (!isRecord(value)
    || value.schemaVersion !== DVF_PURCHASE_POINTS_SCHEMA_VERSION
    || typeof value.cityCode !== "string"
    || !/^\d{5}$/u.test(value.cityCode)
    || typeof value.referencePeriod !== "string"
    || value.locationPrecision !== DVF_PURCHASE_POINTS_PRECISION
    || !Array.isArray(value.locations)) {
    throw new Error("DVF purchase-sales city asset is invalid.");
  }

  for (const location of value.locations) {
    if (!Array.isArray(location)
      || location.length !== 2
      || !Array.isArray(location[0])
      || location[0].length !== 2
      || !isFiniteNumber(location[0][0])
      || location[0][0] < -180 || location[0][0] > 180
      || !isFiniteNumber(location[0][1])
      || location[0][1] < -90 || location[0][1] > 90
      || !Array.isArray(location[1])) {
      throw new Error("DVF purchase-sales location is invalid.");
    }

    for (const sale of location[1]) {
      if (!Array.isArray(sale)
        || sale.length !== 5
        || typeof sale[0] !== "string"
        || !/^\d{4}-\d{2}-\d{2}$/u.test(sale[0])
        || (sale[1] !== null && (!isFiniteNumber(sale[1]) || sale[1] < 0))
        || (sale[2] !== null && typeof sale[2] !== "string")
        || (sale[3] !== null && !isNonNegativeInteger(sale[3]))
        || !Array.isArray(sale[4])) {
        throw new Error("DVF purchase-sale details are invalid.");
      }

      for (const property of sale[4]) {
        if (!Array.isArray(property)
          || property.length !== 6
          || (property[0] !== null && typeof property[0] !== "string")
          || (property[1] !== null && (!isFiniteNumber(property[1]) || property[1] < 0))
          || (property[2] !== null && !isNonNegativeInteger(property[2]))
          || (property[3] !== null && (!isFiniteNumber(property[3]) || property[3] < 0))
          || (property[4] !== null && (!isFiniteNumber(property[4]) || property[4] < 0))
          || !isNonNegativeInteger(property[5])
          || property[5] < 1) {
          throw new Error("DVF purchase-sale property details are invalid.");
        }
      }
    }
  }
}

function normalizeDvfPurchaseSalesAsset(asset: DvfCompactPurchaseSalesAsset): DvfPurchaseSalesFile {
  return {
    schemaVersion: asset.schemaVersion,
    cityCode: asset.cityCode,
    referencePeriod: asset.referencePeriod,
    locationPrecision: asset.locationPrecision,
    locations: asset.locations.map(([coordinates, compactSales]) => ({
      coordinates,
      sales: compactSales.map(([date, price, nature, lotCount, compactProperties]) => ({
        date,
        ...(price !== null ? { price } : {}),
        ...(nature !== null ? { nature } : {}),
        ...(lotCount !== null ? { lotCount } : {}),
        properties: compactProperties.map(([type, builtSurfaceM2, rooms, landSurfaceM2, carrezSurfaceM2, count]) => ({
          ...(type !== null ? { type } : {}),
          ...(builtSurfaceM2 !== null ? { builtSurfaceM2 } : {}),
          ...(rooms !== null ? { rooms } : {}),
          ...(landSurfaceM2 !== null ? { landSurfaceM2 } : {}),
          ...(carrezSurfaceM2 !== null ? { carrezSurfaceM2 } : {}),
          count,
        })),
      })),
    })),
  };
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
  loadRentalIndicators(signal?: AbortSignal): Promise<DvfRentalIndicatorsFile>;
  loadCity(code: string, signal?: AbortSignal): Promise<DvfCityFile>;
  loadMapDepartment(code: string, signal?: AbortSignal): Promise<DvfMapDepartmentFile>;
  loadPurchasePointsManifest(signal?: AbortSignal): Promise<DvfPurchasePointsManifest>;
  loadPurchasePoints(code: string, signal?: AbortSignal): Promise<DvfPurchasePointsFile>;
  loadPurchaseSales(code: string, signal?: AbortSignal): Promise<DvfPurchaseSalesFile>;
}

export function createDvfDataProvider(options: { fetcher?: typeof fetch; basePath?: string } = {}): DvfDataProvider {
  const fetcher = options.fetcher ?? fetch;
  const basePath = (options.basePath ?? DVF_DATASET_BASE_PATH).replace(/\/+$/u, "");
  let manifestRequest: Promise<DvfManifest> | undefined;
  let rentalIndicatorsRequest: Promise<DvfRentalIndicatorsFile> | undefined;
  let purchasePointsManifestRequest: Promise<DvfPurchasePointsManifest> | undefined;
  let citiesByCode: Map<string, DvfCityDescriptor> | undefined;
  let mapDepartmentsByCode: Map<string, DvfMapDepartmentDescriptor> | undefined;
  let purchasePointCitiesByCode: Map<string, DvfPurchasePointsCityDescriptor> | undefined;
  const cityRequests = new Map<string, Promise<DvfCityFile>>();
  const mapDepartmentRequests = new Map<string, Promise<DvfMapDepartmentFile>>();
  const purchasePointsRequests = new Map<string, Promise<DvfPurchasePointsFile>>();
  const purchaseSalesRequests = new Map<string, Promise<DvfPurchaseSalesFile>>();

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

  function loadRentalIndicators(signal?: AbortSignal): Promise<DvfRentalIndicatorsFile> {
    if (!rentalIndicatorsRequest) {
      rentalIndicatorsRequest = loadJson("rent-indicators.json", assertDvfRentalIndicatorsFile).catch((error) => {
        rentalIndicatorsRequest = undefined;
        throw error;
      });
    }
    return signal ? withAbort(rentalIndicatorsRequest, signal) : rentalIndicatorsRequest;
  }

  async function loadCity(code: string, signal?: AbortSignal): Promise<DvfCityFile> {
    const manifest = await loadManifest(signal);
    citiesByCode ??= new Map(manifest.cities.map((candidate) => [candidate.code, candidate]));
    const descriptor = citiesByCode.get(code);
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

  async function loadMapDepartment(code: string, signal?: AbortSignal): Promise<DvfMapDepartmentFile> {
    const manifest = await loadManifest(signal);
    mapDepartmentsByCode ??= new Map(manifest.mapDepartments.map((candidate) => [candidate.code, candidate]));
    const descriptor = mapDepartmentsByCode.get(code);
    if (!descriptor || !/^map\/\d{2}-[a-f0-9]{16}\.json$/u.test(descriptor.asset)) {
      throw new DvfDataUnavailableError(`No DVF map asset for department ${code}.`);
    }

    let request = mapDepartmentRequests.get(code);
    if (!request) {
      request = loadJson(descriptor.asset, assertDvfMapDepartmentFile).then((department) => {
        if (department.departmentCode !== code
          || department.referencePeriod !== manifest.referencePeriod
          || department.cells.length !== descriptor.cellCount) {
          throw new DvfDataUnavailableError("DVF map department asset does not match its manifest.");
        }
        return department;
      }).catch((error) => {
        mapDepartmentRequests.delete(code);
        throw error;
      });
      mapDepartmentRequests.set(code, request);
    }
    return signal ? withAbort(request, signal) : request;
  }

  function loadPurchasePointsManifest(signal?: AbortSignal): Promise<DvfPurchasePointsManifest> {
    if (!purchasePointsManifestRequest) {
      purchasePointsManifestRequest = loadJson("purchase-points/manifest.json", assertDvfPurchasePointsManifest).catch((error) => {
        purchasePointsManifestRequest = undefined;
        throw error;
      });
    }
    return signal ? withAbort(purchasePointsManifestRequest, signal) : purchasePointsManifestRequest;
  }

  async function loadPurchasePoints(code: string, signal?: AbortSignal): Promise<DvfPurchasePointsFile> {
    const manifest = await loadPurchasePointsManifest(signal);
    purchasePointCitiesByCode ??= new Map(manifest.cities.map((candidate) => [candidate.code, candidate]));
    const descriptor = purchasePointCitiesByCode.get(code);
    if (!descriptor) throw new DvfDataUnavailableError(`No DVF purchase-point asset for commune ${code}.`);

    let request = purchasePointsRequests.get(code);
    if (!request) {
      request = loadJson(`purchase-points/${descriptor.asset}`, assertDvfPurchasePointsFile).then((city) => {
        if (city.cityCode !== code
          || city.referencePeriod !== manifest.referencePeriod
          || city.points.length !== descriptor.pointCount) {
          throw new DvfDataUnavailableError("DVF purchase-point asset does not match its manifest.");
        }
        return city;
      }).catch((error) => {
        purchasePointsRequests.delete(code);
        throw error;
      });
      purchasePointsRequests.set(code, request);
      while (purchasePointsRequests.size > 12) purchasePointsRequests.delete(purchasePointsRequests.keys().next().value as string);
    }
    return signal ? withAbort(request, signal) : request;
  }

  async function loadPurchaseSales(code: string, signal?: AbortSignal): Promise<DvfPurchaseSalesFile> {
    const manifest = await loadPurchasePointsManifest(signal);
    purchasePointCitiesByCode ??= new Map(manifest.cities.map((candidate) => [candidate.code, candidate]));
    const descriptor = purchasePointCitiesByCode.get(code);
    if (!descriptor?.sales) throw new DvfDataUnavailableError(`No DVF purchase-sales asset for commune ${code}.`);

    let request = purchaseSalesRequests.get(code);
    if (!request) {
      request = loadJson(`purchase-points/${descriptor.sales.asset}`, assertDvfPurchaseSalesAsset).then((asset) => {
        if (asset.cityCode !== code
          || asset.referencePeriod !== manifest.referencePeriod
          || asset.locations.length !== descriptor.sales!.locationCount
          || asset.locations.reduce((count, location) => count + location[1].length, 0) !== descriptor.sales!.saleCount) {
          throw new DvfDataUnavailableError("DVF purchase-sales asset does not match its manifest.");
        }
        return normalizeDvfPurchaseSalesAsset(asset);
      }).catch((error) => {
        purchaseSalesRequests.delete(code);
        throw error;
      });
      purchaseSalesRequests.set(code, request);
      while (purchaseSalesRequests.size > 4) purchaseSalesRequests.delete(purchaseSalesRequests.keys().next().value as string);
    }
    return signal ? withAbort(request, signal) : request;
  }

  return { loadManifest, loadRentalIndicators, loadCity, loadMapDepartment, loadPurchasePointsManifest, loadPurchasePoints, loadPurchaseSales };
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
