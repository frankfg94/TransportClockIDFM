/** Shared, runtime-independent freshness contract. Thresholds are inclusive, in UTC days. */
export interface DatasetFreshness {
  status: "fresh" | "aging" | "stale" | "unknown";
  ageDays?: number;
  observedAt?: string;
  referenceDateApproximate?: boolean;
  warnAfterDays?: number;
  staleAfterDays?: number;
}
export const DATASET_FRESHNESS_POLICIES = {
  netex: { warnAfterDays: 180, staleAfterDays: 365 },
  gtfs: { warnAfterDays: 14, staleAfterDays: 20 },
  "bike-network": { warnAfterDays: 365, staleAfterDays: 730 },
  ridership: { warnAfterDays: 730, staleAfterDays: 1095 },
  "neighborhood-verdict": { warnAfterDays: 30, staleAfterDays: 90 },
  "walking-isochrones": { warnAfterDays: 90, staleAfterDays: 180 },
  "global-map": { warnAfterDays: 30, staleAfterDays: 90 },
  places: { warnAfterDays: 30, staleAfterDays: 90 },
  "dvf-property-market": { warnAfterDays: 365, staleAfterDays: 730 },
} as const;
export type DatasetPolicyId = keyof typeof DATASET_FRESHNESS_POLICIES;
export function freshnessFromDate(value: string | undefined, warnAfterDays: number, staleAfterDays: number, now = Date.now()): DatasetFreshness {
  const timestamp = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(timestamp) || !Number.isFinite(now)) return { status: "unknown", warnAfterDays, staleAfterDays };
  const ageDays = Math.max(0, Math.floor((now - timestamp) / 86_400_000));
  return { status: ageDays >= staleAfterDays ? "stale" : ageDays >= warnAfterDays ? "aging" : "fresh", ageDays, observedAt: new Date(timestamp).toISOString(), warnAfterDays, staleAfterDays };
}
export function datasetFreshness(id: DatasetPolicyId, metadata: { sourceUpdatedAt?: string; generatedAt?: string; source?: unknown }, now = Date.now()): DatasetFreshness {
  const policy = DATASET_FRESHNESS_POLICIES[id];
  // Transit/source datasets must never become fresh through installation or recompilation.
  const sourceOnly = id === "netex" || id === "gtfs" || id === "bike-network" || id === "dvf-property-market";
  const nestedDate = metadata.source && typeof metadata.source === "object" && "sourceUpdatedAt" in metadata.source && typeof metadata.source.sourceUpdatedAt === "string"
    ? metadata.source.sourceUpdatedAt : undefined;
  const date = metadata.sourceUpdatedAt ?? nestedDate ?? (sourceOnly ? undefined : metadata.generatedAt);
  return freshnessFromDate(date, policy.warnAfterDays, policy.staleAfterDays, now);
}
/** A compiled source snapshot records age at checkedAt, not the source date itself. */
export function sourceSnapshotFreshness(snapshot: { checkedAt: string; ageDays: number; warnAfterDays: number; staleAfterDays: number }, now = Date.now()): DatasetFreshness {
  const timestamp = Number.isFinite(snapshot.ageDays) && snapshot.ageDays >= 0
    ? Date.parse(snapshot.checkedAt) - snapshot.ageDays * 86_400_000
    : NaN;
  return { ...freshnessFromDate(Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined, snapshot.warnAfterDays, snapshot.staleAfterDays, now), referenceDateApproximate: true };
}
