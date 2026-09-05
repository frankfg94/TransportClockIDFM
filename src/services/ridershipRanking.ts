import type { AnnualRidershipRanking } from "../types/ridership";

export type RidershipRankingLevel = "very-high" | "high" | "average" | "low";

export interface RidershipRankingPresentation {
  rank: number;
  total: number;
  topPercent: number;
  percentile: number;
  level: RidershipRankingLevel;
}

export function presentRidershipRanking(
  ranking: AnnualRidershipRanking | undefined,
): RidershipRankingPresentation | undefined {
  if (!ranking || ranking.rank < 1 || ranking.total < 1 || ranking.rank > ranking.total) {
    return undefined;
  }

  const topRatio = ranking.rank / ranking.total;
  const topPercent = Math.min(100, Math.max(1, Math.ceil(topRatio * 100)));
  const percentile = ranking.total === 1
    ? 100
    : Math.min(100, Math.max(0, 100 - ((ranking.rank - 1) / (ranking.total - 1)) * 100));

  return {
    rank: ranking.rank,
    total: ranking.total,
    topPercent,
    percentile: Number(percentile.toFixed(1)),
    level: topRatio <= 0.25
      ? "very-high"
      : topRatio <= 0.5
        ? "high"
        : topRatio <= 0.75
          ? "average"
          : "low",
  };
}
