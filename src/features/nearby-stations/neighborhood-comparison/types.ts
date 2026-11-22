import type { IrisNeighborhood, IrisSourceMetadata } from "../../transport-map/iris/irisApi";
import type { ComparisonPlaceAggregation } from "./aggregate";

/** A statistical IRIS, not an address verdict or an administrative district. */
export interface ComparisonNeighborhood extends IrisNeighborhood {
  areaM2: number;
  green: { status: "pending" | "partial" | "unavailable"; areaM2?: number; sites?: number; error?: boolean; publicParkAreaM2?: number; canopy?: { areaM2: number; canopyM2: number; period: string } };
}
export type ComparisonGreen = ComparisonNeighborhood["green"];

export interface NeighborhoodComparisonGeography {
  generatedAt: string;
  commune: { code: string; name: string };
  selectedCode?: string;
  /** Multiple polygons may contain a point on a shared boundary. */
  matchingCodes: string[];
  neighborhoods: ComparisonNeighborhood[];
  irisSource: ComparisonSourceMetadata;
  greenSource?: ComparisonSourceMetadata;
}

export type ComparisonSourceMetadata = IrisSourceMetadata & {
  freshness?: { status: "fresh" | "aging" | "stale"; checkedAt: string };
};

export interface VerdictScopeData {
  originKey: string;
  loading: boolean;
  boundary?: boolean;
  geography?: NeighborhoodComparisonGeography;
  places?: ComparisonPlaceAggregation;
  placesDate?: string;
  green?: Readonly<Record<string, ComparisonGreen>>;
}

export function comparisonOriginKey(origin?: { lat: number; lon: number; code?: string }): string {
  return origin ? JSON.stringify([origin.lat, origin.lon, origin.code]) : "";
}
