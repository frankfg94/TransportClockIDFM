export interface PersonalJourneyThresholds {
  positiveBelowMinutes: number;
  neutralThroughMinutes: number;
}
export const DEFAULT_PERSONAL_JOURNEY_THRESHOLDS: Readonly<PersonalJourneyThresholds> = {
  positiveBelowMinutes: 40,
  neutralThroughMinutes: 60,
};
export interface PersonalJourneyPreference extends PersonalJourneyThresholds {
  destinationId: string;
  disabled?: boolean;
}

export function validPersonalJourneyThresholds(value: PersonalJourneyThresholds): boolean {
  return Number.isFinite(value.positiveBelowMinutes) && value.positiveBelowMinutes > 0
    && Number.isFinite(value.neutralThroughMinutes)
    && value.neutralThroughMinutes >= value.positiveBelowMinutes;
}

export function normalizePersonalJourneyPreferences(value: unknown): PersonalJourneyPreference[] {
  if (!Array.isArray(value)) return [];
  const entries = new Map<string, PersonalJourneyPreference>();
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof item.destinationId !== "string" || !item.destinationId.trim()) continue;
    const thresholds = validPersonalJourneyThresholds(item) ? item : DEFAULT_PERSONAL_JOURNEY_THRESHOLDS;
    entries.set(item.destinationId, {
      destinationId: item.destinationId,
      positiveBelowMinutes: thresholds.positiveBelowMinutes,
      neutralThroughMinutes: thresholds.neutralThroughMinutes,
      ...(item.disabled === true ? { disabled: true } : {}),
    });
  }
  return [...entries.values()];
}
