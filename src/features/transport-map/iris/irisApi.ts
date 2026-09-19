import { runNetworkTask } from "../../../services/networkScheduler";
import { toServerApiUrl } from "../../../services/serverApi";

export const PUBLIC_IRIS_SCHEMA_VERSION = "1.3" as const;
export const PUBLIC_IRIS_SOURCE_ID = "insee-iris" as const;

export type IrisPolygonGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export interface IrisNeighborhood {
  id: string;
  codeIris: string;
  communeCode: string;
  communeName: string;
  departmentCode: string;
  name: string;
  type: string;
  centroid: [number, number];
  geometry: IrisPolygonGeometry;
}

export interface IrisSourceMetadata {
  id: string;
  title: string;
  producer: string;
  pageUrl: string;
  referencePeriod?: string;
  fetchedAt?: string;
  checksumSha256?: string;
  licence: { label: string; url?: string; attribution: string };
  limitations: readonly string[];
}

export interface IrisAirNoiseStatistics {
  inseeCode: string;
  name: string;
  departmentCode: string;
  population: number;
  score: number;
  airScore: number;
  noiseScore: number;
  /** Official combined class: first digit is noise, second digit is air. */
  dominantClass: string;
}

export interface IrisDataset {
  schemaVersion: typeof PUBLIC_IRIS_SCHEMA_VERSION;
  generatedAt: string;
  sourceId: typeof PUBLIC_IRIS_SOURCE_ID;
  bbox: [number, number, number, number];
  neighborhoods: IrisNeighborhood[];
  /** Official department names keyed by the codes carried by IRIS. */
  departmentNames?: Readonly<Record<string, string>>;
  source: IrisSourceMetadata;
  airNoiseSource: IrisSourceMetadata;
  airNoiseCommunes: Readonly<Record<string, IrisAirNoiseStatistics>>;
}

let cached: IrisDataset | undefined;
let pending: Promise<IrisDataset> | undefined;

export function fetchIrisDataset(signal?: AbortSignal): Promise<IrisDataset> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = runNetworkTask(async (requestSignal) => {
      const response = await fetch(toServerApiUrl("/api/iris"), { signal: requestSignal });
      if (!response.ok) throw new Error(`IRIS data unavailable (${response.status})`);
      const payload = parseIrisDataset(await response.json());
      cached = payload;
      return payload;
    }).finally(() => {
      pending = undefined;
    });
  }
  return signal ? withAbort(pending, signal) : pending;
}

function parseIrisDataset(value: unknown): IrisDataset {
  if (!isRecord(value) || value.schemaVersion !== PUBLIC_IRIS_SCHEMA_VERSION || value.sourceId !== PUBLIC_IRIS_SOURCE_ID) {
    throw new Error("Unsupported IRIS contract");
  }
  const bbox = readBbox(value.bbox);
  if (!bbox || typeof value.generatedAt !== "string" || !isRecord(value.source)) {
    throw new Error("Invalid IRIS metadata");
  }
  if (!Array.isArray(value.neighborhoods) || value.neighborhoods.length === 0) {
    throw new Error("IRIS contract has no neighborhoods");
  }
  const neighborhoods = value.neighborhoods.map(readNeighborhood);
  const departmentNames = readDepartmentNames(value.departmentNames);
  const source = readSource(value.source);
  if (!isRecord(value.airNoiseSource)) throw new Error("Invalid air/noise source metadata");
  const airNoiseSource = readSource(value.airNoiseSource);
  const airNoiseCommunes = readAirNoiseCommunes(value.airNoiseCommunes);
  return {
    schemaVersion: PUBLIC_IRIS_SCHEMA_VERSION,
    generatedAt: value.generatedAt,
    sourceId: PUBLIC_IRIS_SOURCE_ID,
    bbox,
    neighborhoods,
    departmentNames,
    source,
    airNoiseSource,
    airNoiseCommunes,
  };
}

function readDepartmentNames(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([code, name]) =>
      /^\d{2,3}$/u.test(code) && typeof name === "string" && name.trim().length > 0,
    ).map(([code, name]) => [code, (name as string).trim()]),
  );
}

function readNeighborhood(value: unknown): IrisNeighborhood {
  if (!isRecord(value)) throw new Error("Invalid IRIS neighborhood");
  const readText = (key: string): string => {
    const candidate = value[key];
    if (typeof candidate !== "string" || !candidate) throw new Error("Invalid IRIS neighborhood metadata");
    return candidate;
  };
  const id = readText("id");
  const codeIris = readText("codeIris");
  const communeCode = readText("communeCode");
  const communeName = readText("communeName");
  const departmentCode = readText("departmentCode");
  const name = readText("name");
  const type = readText("type");
  const centroid = readPoint(value.centroid);
  const geometry = readGeometry(value.geometry);
  if (!centroid || !geometry) throw new Error("Invalid IRIS neighborhood geometry");
  return {
    id,
    codeIris,
    communeCode,
    communeName,
    departmentCode,
    name,
    type,
    centroid,
    geometry,
  };
}

function readGeometry(value: unknown): IrisPolygonGeometry | undefined {
  if (!isRecord(value) || !Array.isArray(value.coordinates)) return undefined;
  if (value.type === "Polygon" && value.coordinates.length > 0 && value.coordinates.every(isRing)) {
    return { type: "Polygon", coordinates: value.coordinates };
  }
  if (value.type === "MultiPolygon" && value.coordinates.length > 0 && value.coordinates.every((polygon) => Array.isArray(polygon) && polygon.length > 0 && polygon.every(isRing))) {
    return { type: "MultiPolygon", coordinates: value.coordinates };
  }
  return undefined;
}

function isRing(value: unknown): value is number[][] {
  return Array.isArray(value) && value.length >= 4 && value.every((point) => Array.isArray(point) && point.length >= 2 && point.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)));
}

function readPoint(value: unknown): [number, number] | undefined {
  return Array.isArray(value) && value.length >= 2 && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    ? [value[0], value[1]]
    : undefined;
}

function readBbox(value: unknown): [number, number, number, number] | undefined {
  return Array.isArray(value) && value.length === 4 && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    ? [value[0], value[1], value[2], value[3]]
    : undefined;
}

function readSource(value: Record<string, unknown>): IrisSourceMetadata {
  if (typeof value.id !== "string" || typeof value.title !== "string" || typeof value.producer !== "string" || typeof value.pageUrl !== "string" || !isRecord(value.licence)) {
    throw new Error("Invalid IRIS source metadata");
  }
  return {
    id: value.id,
    title: value.title,
    producer: value.producer,
    pageUrl: value.pageUrl,
    referencePeriod: typeof value.referencePeriod === "string" ? value.referencePeriod : undefined,
    fetchedAt: typeof value.fetchedAt === "string" ? value.fetchedAt : undefined,
    checksumSha256: typeof value.checksumSha256 === "string" ? value.checksumSha256 : undefined,
    licence: {
      label: typeof value.licence.label === "string" ? value.licence.label : "",
      url: typeof value.licence.url === "string" ? value.licence.url : undefined,
      attribution: typeof value.licence.attribution === "string" ? value.licence.attribution : "",
    },
    limitations: Array.isArray(value.limitations) ? value.limitations.filter((item): item is string => typeof item === "string") : [],
  };
}

function readAirNoiseCommunes(value: unknown): Readonly<Record<string, IrisAirNoiseStatistics>> {
  if (!isRecord(value)) throw new Error("Invalid air/noise statistics");
  const entries = Object.entries(value).map(([key, raw]) => {
    if (!isRecord(raw)) throw new Error("Invalid air/noise commune");
    const inseeCode = readRequiredText(raw.inseeCode, "air/noise commune code");
    const name = readRequiredText(raw.name, "air/noise commune name");
    const departmentCode = readRequiredText(raw.departmentCode, "air/noise department code");
    const population = readFiniteNumber(raw.population, "air/noise population", 0);
    const score = readScore(raw.score);
    const airScore = readScore(raw.airScore);
    const noiseScore = readScore(raw.noiseScore);
    const dominantClass = readRequiredText(raw.dominantClass, "air/noise dominant class");
    if (!/^\d{5}$/u.test(key) || key !== inseeCode || !/^[123][123]$/u.test(dominantClass)) {
      throw new Error("Invalid air/noise commune identity");
    }
    return [key, { inseeCode, name, departmentCode, population, score, airScore, noiseScore, dominantClass }];
  });
  if (!entries.length) throw new Error("IRIS contract has no air/noise statistics");
  return Object.fromEntries(entries);
}

function readRequiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid ${label}`);
  return value;
}

function readFiniteNumber(value: unknown, label: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) throw new Error(`Invalid ${label}`);
  return value;
}

function readScore(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) {
    throw new Error("Invalid air/noise score");
  }
  return value;
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
