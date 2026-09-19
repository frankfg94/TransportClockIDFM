import { NEIGHBORHOOD_MAX_SCORE } from "./contracts";

export function clamp(value: number, minimum = 0, maximum = NEIGHBORHOOD_MAX_SCORE): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function saturatingNeighborhoodBonus(count: number, target: number, maximum: number): number {
  if (count <= 0 || target <= 0 || maximum <= 0) return 0;
  return maximum * Math.min(1, count / target);
}

export function getNeighborhoodScoreDisplay(score: number | undefined): number | undefined {
  return score === undefined || !Number.isFinite(score)
    ? undefined
    : Math.round(clamp(score));
}

export function normalizeScoreText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr-FR");
}

export function finitePositive(value: number | undefined): number | undefined {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value : undefined;
}

export function finiteNonNegative(value: number | undefined): number | undefined {
  return Number.isFinite(value) && (value ?? -1) >= 0 ? value : undefined;
}

export function weightedAverage(parts: readonly { value: number; weight: number }[]): number {
  const available = parts.filter((part) => Number.isFinite(part.value) && part.weight > 0);
  const totalWeight = available.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight <= 0) return 0;
  return clamp(available.reduce((sum, part) => sum + part.value * part.weight, 0) / totalWeight);
}
