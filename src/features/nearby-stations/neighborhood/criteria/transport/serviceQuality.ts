import type { GlobalMapLine, GlobalMapMode } from "../../../../transport-map/contracts/manifest";
import type { PublicServiceQuality, ServiceQualityLineReliability, ServiceQualityMode } from "../../../serviceQualityApi";
import type { NeighborhoodFact, NeighborhoodFactPolarity, NeighborhoodFactTransportReliabilityLine, NeighborhoodScoreInput } from "../../contracts";
import { HEAVY_SCORE_MODES } from "../../contracts";
import { makeFact } from "../../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../../i18nKeys";
import { normalizeScoreText } from "../../primitives";

interface NearbyServiceQualitySummary {
  lines: ServiceQualityLineReliability[];
  score: number;
  latestValue?: number;
  weightedValue?: number;
  trendDelta: number;
  yearsUsed: number[];
}

export function summarizeNearbyServiceQuality(
  input: NeighborhoodScoreInput,
  nearbyLines: readonly GlobalMapLine[],
): NearbyServiceQualitySummary | undefined {
  const dataset = input.serviceQuality;
  if (!dataset) return undefined;
  const matched = new Map<string, ServiceQualityLineReliability>();
  for (const line of nearbyLines) {
    if (!HEAVY_SCORE_MODES.has(line.mode)) continue;
    const mode = serviceQualityMode(line.mode);
    if (!mode) continue;
    const tokens = new Set([
      line.code,
      line.label,
      line.sourceLineId ?? "",
      ...line.aliases,
    ].flatMap(qualityLineTokens));
    const candidate = dataset.lines.find((qualityLine) =>
      qualityLine.mode === mode && qualityLine.aliases.some((alias) => tokens.has(alias)),
    );
    if (candidate) matched.set(candidate.lineId, candidate);
  }
  const lines = [...matched.values()];
  if (!lines.length) return undefined;
  return {
    lines,
    score: average(lines.map((line) => line.reliabilityScore)),
    latestValue: averageOptional(lines.map((line) => line.latestValue)),
    weightedValue: averageOptional(lines.map((line) => line.weightedValue)),
    trendDelta: average(lines.map((line) => line.trendDelta)),
    yearsUsed: [...new Set(lines.flatMap((line) => line.yearsUsed))].sort((left, right) => left - right),
  };
}

export function makeServiceQualityFact(
  summary: NearbyServiceQualitySummary,
  dataset: PublicServiceQuality,
): NeighborhoodFact {
  const polarity: NeighborhoodFactPolarity = summary.score >= 80
    ? "positive"
    : summary.score < 70
      ? "negative"
      : "neutral";
  const source = dataset.sources[0];
  const transportReliabilityLines: NeighborhoodFactTransportReliabilityLine[] = [...summary.lines]
    .sort(compareNearbyServiceQualityLines)
    .map((line) => ({
      lineId: line.lineId,
      lineName: line.lineName,
      mode: line.mode,
      reliabilityScore: line.reliabilityScore,
      labelKey: line.labelKey,
    }));
  const fact = makeFact({
    id: "transport-service-quality",
    kind: "transportServiceQuality",
    category: "transport",
    polarity,
    family: "transport-service-quality",
    priority: 12,
    values: {
      score: Math.round(summary.score),
      lines: summary.lines.length,
      latest: summary.latestValue === undefined ? "—" : Math.round(summary.latestValue * 10) / 10,
      weighted: summary.weightedValue === undefined ? "—" : Math.round(summary.weightedValue * 10) / 10,
      trend: summary.trendDelta > 0.25 ? "improving" : summary.trendDelta < -0.25 ? "declining" : "stable",
    },
    sourceKey: SOURCE_KEYS.serviceQuality,
    proof: "derived",
    ruleKey: RULE_KEYS.serviceQuality,
    ruleValues: { weight: 15 },
    transportReliabilityLines,
    action: {
      labelKey: "nearbyStations.neighborhoodScore.facts.transportServiceQuality.openRanking",
      href: "/lines-ranking",
    },
  });
  fact.evidence.sourceName = source?.title;
  fact.evidence.sourceUrl = source?.pageUrl;
  fact.evidence.licence = source?.licence.label;
  fact.evidence.value = Math.round(summary.score * 100) / 100;
  fact.evidence.unit = "/100";
  fact.evidence.referencePeriod = summary.yearsUsed.length
    ? `${summary.yearsUsed[0]}–${summary.yearsUsed.at(-1)}`
    : undefined;
  return fact;
}

const SERVICE_QUALITY_MODE_ORDER: Record<ServiceQualityMode, number> = {
  METRO: 0,
  RER: 1,
  TRAIN: 2,
  TRAM: 3,
};

function compareNearbyServiceQualityLines(
  left: ServiceQualityLineReliability,
  right: ServiceQualityLineReliability,
): number {
  const scoreDelta = right.reliabilityScore - left.reliabilityScore;
  if (Math.abs(scoreDelta) > 0.0001) return scoreDelta;
  const modeDelta = SERVICE_QUALITY_MODE_ORDER[left.mode] - SERVICE_QUALITY_MODE_ORDER[right.mode];
  if (modeDelta !== 0) return modeDelta;
  return left.lineName.localeCompare(right.lineName, "fr", { numeric: true, sensitivity: "base" });
}

function serviceQualityMode(mode: GlobalMapMode): ServiceQualityMode | undefined {
  if (mode === "METRO") return "METRO";
  if (mode === "RER") return "RER";
  if (mode === "TRAIN" || mode === "TRANSILIEN") return "TRAIN";
  if (mode === "TRAM") return "TRAM";
  return undefined;
}

function qualityLineTokens(value: string): string[] {
  const normalized = normalizeScoreText(value);
  if (!normalized) return [];
  return normalized
    .split(/\s+(?:et|and)\s+|[&,/;]/u)
    .map((token) => token.replace(/\bbis\b/gu, "b").replace(/[^a-z0-9]/gu, "").toUpperCase())
    .filter(Boolean);
}

function average(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function averageOptional(values: readonly (number | undefined)[]): number | undefined {
  const available = values.filter((value): value is number => Number.isFinite(value));
  return available.length ? average(available) : undefined;
}
