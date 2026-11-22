export const CANOPY_RADIUS_METERS = 500;
export const PARK_WALK_LIMIT_SECONDS = 30 * 60;

export function canopyBonus(percentage: number): number {
  return percentage >= 50 ? 3 : percentage >= 40 ? 2 : percentage >= 30 ? 1 : 0;
}

export const PARK_WALK_PENALTY = -1;
export const CANOPY_LABEL_THRESHOLDS = { mineralBelowPercent: 10, lowBelowPercent: 20 } as const;
export const MAX_UNCOVERED_AREA_M2 = 10;
export const MAPPED_PARK_ENTRANCE_TOLERANCE_METERS = 40;

export function classifyParkWalks(durations: readonly (number | undefined)[], complete: boolean) {
  if (durations.some(value => value !== undefined && value >= 0 && value < PARK_WALK_LIMIT_SECONDS)) return "within";
  if (complete && durations.every(value => value !== undefined && Number.isFinite(value) && value >= PARK_WALK_LIMIT_SECONDS)) return "beyond";
  return "unknown";
}
