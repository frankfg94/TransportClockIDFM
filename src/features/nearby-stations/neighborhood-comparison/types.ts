import type { IrisNeighborhood, IrisSourceMetadata } from "../../transport-map/iris/irisApi";

/** A statistical IRIS, not an address verdict or an administrative district. */
export interface ComparisonNeighborhood extends IrisNeighborhood {
  areaM2: number;
  green: { status: "pending" | "partial" | "unavailable"; areaM2?: number; sites?: number; error?: boolean };
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
