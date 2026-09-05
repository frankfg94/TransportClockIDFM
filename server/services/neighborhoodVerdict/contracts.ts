// Bump this whenever the compiled artifact or source identifiers change so
// Nitro cannot silently consume an old neighborhood snapshot.
export const VERDICT_SCHEMA_VERSION = "1.1" as const;

/** Stable logical ids; the active edition is carried by source metadata. */
export const AIR_NOISE_STATISTICS_SOURCE_ID = "air-noise-statistics" as const;
export const AIR_NOISE_GRID_SOURCE_ID = "air-noise-grid" as const;

export type VerdictCategoryId =
  | "transport"
  | "daily-life"
  | "nature-leisure"
  | "health"
  | "education"
  | "living-environment"
  | "security";

export type VerdictPolarity = "positive" | "negative" | "neutral";
export type VerdictProof = "direct" | "derived";

export interface VerdictLicence {
  id: string;
  label: string;
  url?: string;
  attribution: string;
  kind: "open" | "custom" | "service";
}

export interface VerdictFreshness {
  status: "fresh" | "aging" | "stale";
  checkedAt: string;
  ageDays: number;
  warnAfterDays: number;
  staleAfterDays: number;
}

export interface VerdictSourceMetadata {
  id: string;
  title: string;
  producer: string;
  pageUrl: string;
  resourceId?: string;
  resourceUrl?: string;
  format: string;
  encoding?: string;
  crs?: string;
  coverage: string;
  referencePeriod?: string;
  publishedAt?: string;
  updatedAt?: string;
  fetchedAt?: string;
  checksumSha256?: string;
  licence: VerdictLicence;
  freshness: VerdictFreshness;
  scorable: boolean;
  limitations: string[];
}

export interface VerdictEvidence {
  id: string;
  category: VerdictCategoryId;
  polarity: VerdictPolarity;
  family: string;
  priority: number;
  scoreImpact: number;
  label: string;
  explanation: string;
  rule: string;
  proof: VerdictProof;
  value?: number | string;
  unit?: string;
  geography?: {
    level: "point" | "commune" | "department" | "region";
    code?: string;
    name?: string;
  };
  referencePeriod?: string;
  observedAt: string;
  sourceIds: string[];
}

export interface VerdictCategorySignal {
  id: VerdictCategoryId;
  status: "available" | "unavailable" | "stale";
  score?: number;
  scoreDelta?: number;
  coverageRatio: number;
  positiveFacts: VerdictEvidence[];
  negativeFacts: VerdictEvidence[];
  neutralFacts: VerdictEvidence[];
  limitations: string[];
}

export type SecurityIndicatorId =
  | "burglary"
  | "vehicle-theft"
  | "damage"
  | "physical-violence-outside-family"
  | "violent-theft-without-weapon"
  | "nonviolent-theft";

export interface SecurityIndicatorResult {
  id: SecurityIndicatorId;
  label: string;
  weight: number;
  year: number;
  rate: number;
  unit: string;
  percentile: number;
  sourceIndicatorNames: string[];
}

export interface SecurityCommuneResult {
  inseeCode: string;
  year: number;
  localScore: number;
  availableWeight: number;
  indicators: SecurityIndicatorResult[];
}

export interface SecurityTrendResult {
  departmentCode: string;
  fromYear: number;
  toYear: number;
  deltaPercent: number;
  direction: "improving" | "stable" | "worsening";
  adjustment: number;
  scorable: true;
}

export interface PublicFutureGpeStation {
  id: string;
  name: string;
  line: string;
  lon: number;
  lat: number;
  projectStatus: "planned" | "under-construction" | "open";
  openingWindow?: string;
  verifiedAt: string;
  /** A real walking duration to the project; values above 15 min are kept
   * so the frontend can check a co-located current transport hub. */
  walkingMinutes?: number;
  hubId?: string;
}

/** Route target for a large named green space. The coordinates are the
 * nearest projected boundary point; additional transit points let Navitia
 * discover a useful entrance on a large multi-sector site. */
export interface PublicGreenSpaceRoutePoint {
  lon: number;
  lat: number;
}

export interface PublicGreenSpaceAccess {
  id: string;
  name: string;
  category?: string;
  surfaceM2?: number;
  lon: number;
  lat: number;
  distanceMeters: number;
  walkingMinutes?: number;
  estimatedWalkingMinutes: number;
  /** A few deterministic boundary/centroid targets let Navitia find the
   * useful entrance to a large multi-sector park. */
  transitPoints?: PublicGreenSpaceRoutePoint[];
}

export interface NeighborhoodVerdictResponse {
  schemaVersion: typeof VERDICT_SCHEMA_VERSION;
  generatedAt: string;
  location: {
    lat: number;
    lon: number;
    commune?: { code: string; name: string };
    departmentCode?: string;
  };
  overall: {
    score?: number;
    displayScore?: number;
    coverageRatio: number;
    availableCategoryCount: number;
    totalCategoryCount: number;
  };
  categories: VerdictCategorySignal[];
  futureProjects: PublicFutureGpeStation[];
  nearbyGreenSpaces: PublicGreenSpaceAccess[];
  security?: {
    commune?: SecurityCommuneResult;
    trend?: SecurityTrendResult;
  };
  sources: VerdictSourceMetadata[];
  warnings: string[];
}

export type VerdictPolygonGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export interface CompiledGreenSpace {
  id: string;
  name: string;
  category?: string;
  /** Source surface in square metres, used to rank named green-space sites. */
  surfaceM2?: number;
  /** Dataset that supplied the geometry and surface. Legacy snapshots default to HDS. */
  sourceId?: string;
  referencePeriod?: string;
  centroid: [number, number];
  geometry: VerdictPolygonGeometry;
}

export interface CompiledGpeStation {
  id: string;
  name: string;
  line: string;
  lon: number;
  lat: number;
  projectStatus: "planned" | "under-construction" | "open";
  openingWindow?: string;
  verifiedAt: string;
}

export interface CompiledAirNoiseCommune {
  inseeCode: string;
  name: string;
  departmentCode: string;
  population: number;
  score: number;
  airScore: number;
  noiseScore: number;
  dominantClass: string;
  classPopulation: Record<string, number>;
}

export interface CompiledAirNoiseGrid {
  sourceCrs: "EPSG:4326";
  bbox: [number, number, number, number];
  cellSizeDegrees: number;
  columns: number;
  rows: number;
  values: string[];
  classes: number[];
}

export interface CompiledNeighborhoodVerdictData {
  schemaVersion: typeof VERDICT_SCHEMA_VERSION;
  generatedAt: string;
  sources: VerdictSourceMetadata[];
  warnings: string[];
  greenSpaces: CompiledGreenSpace[];
  gpeStations: CompiledGpeStation[];
  airNoiseCommunes: Record<string, CompiledAirNoiseCommune>;
  airNoiseGrid?: CompiledAirNoiseGrid;
  security: {
    communes: Record<string, SecurityCommuneResult>;
    trends: Record<string, SecurityTrendResult>;
  };
}
