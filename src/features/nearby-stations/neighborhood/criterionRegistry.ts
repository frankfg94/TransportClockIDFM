import type { NeighborhoodCategoryId, NeighborhoodFact } from "./contracts";

export type NeighborhoodDatasetStatus = "ready" | "loading" | "missing" | "stale" | "error";
export type NeighborhoodCriterionStatus = "idle" | "loading" | "ready" | "degraded" | "unavailable" | "error";

export interface NeighborhoodDatasetRequirement {
  id: string;
  required: boolean;
  maxAgeMs?: number;
}

export interface NeighborhoodCriterionDefinition {
  id: NeighborhoodCategoryId;
  datasets: readonly NeighborhoodDatasetRequirement[];
}

export interface NeighborhoodCriterionState {
  id: NeighborhoodCategoryId;
  status: NeighborhoodCriterionStatus;
  score?: number;
  confidence: number;
  reasons: readonly NeighborhoodFact[];
  datasets: readonly (NeighborhoodDatasetRequirement & { status: NeighborhoodDatasetStatus })[];
}

/**
 * Declarative data contract for the progressive verdict. Loaders remain in
 * their existing composables; this registry makes their freshness and
 * optionality inspectable without coupling the score builder to transport or
 * OSM implementation details.
 */
export const NEIGHBORHOOD_CRITERION_REGISTRY: readonly NeighborhoodCriterionDefinition[] = [
  {
    id: "transport",
    datasets: [
      { id: "transport-bootstrap", required: true },
      { id: "navitia-journeys", required: false, maxAgeMs: 5 * 60_000 },
      { id: "gtfs-frequency", required: false, maxAgeMs: 24 * 60 * 60_000 },
      { id: "service-quality", required: false, maxAgeMs: 7 * 24 * 60 * 60_000 },
    ],
  },
  {
    id: "daily-life",
    datasets: [{ id: "osm-places", required: true, maxAgeMs: 24 * 60 * 60_000 }],
  },
  {
    id: "nature-leisure",
    datasets: [
      { id: "osm-places", required: true, maxAgeMs: 24 * 60 * 60_000 },
      { id: "neighborhood-green-spaces", required: false, maxAgeMs: 24 * 60 * 60_000 },
    ],
  },
  {
    id: "health",
    datasets: [
      { id: "osm-places", required: true, maxAgeMs: 24 * 60 * 60_000 },
      { id: "walking-routes", required: false, maxAgeMs: 24 * 60 * 60_000 },
    ],
  },
  {
    id: "education",
    datasets: [{ id: "osm-places", required: true, maxAgeMs: 24 * 60 * 60_000 }],
  },
  {
    id: "living-environment",
    datasets: [{ id: "iris-environment", required: false, maxAgeMs: 7 * 24 * 60 * 60_000 }],
  },
  {
    id: "security",
    datasets: [{ id: "neighborhood-verdict", required: false, maxAgeMs: 24 * 60 * 60_000 }],
  },
];
