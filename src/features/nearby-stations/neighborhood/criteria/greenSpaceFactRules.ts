import type { NeighborhoodGreenSpaceJourney } from "../contracts";

export const WOODLAND_ACCESS_RULE = {
  strongWalkingBelowMinutes: 10,
  walkingMaxMinutes: 15,
  largeMainAreaM2: 1_000_000,
  largeAccessMaxMinutes: 20,
} as const;

export const SMALL_GREEN_SPACE_FACT_RULE = {
  surfaceBelowM2: 30_000,
  accessOverSeconds: 20 * 60,
} as const;

export function shouldHideSmallGreenSpaceFact(result: NeighborhoodGreenSpaceJourney): boolean {
  const { surfaceM2, walkingMinutes } = result.greenSpace;
  const transitSeconds = result.fastestTransitSeconds;
  const { surfaceBelowM2, accessOverSeconds } = SMALL_GREEN_SPACE_FACT_RULE;
  return surfaceM2 !== undefined && surfaceM2 > 0 && surfaceM2 < surfaceBelowM2
    && walkingMinutes !== undefined && Number.isFinite(walkingMinutes) && walkingMinutes * 60 > accessOverSeconds
    && result.transitComplete === true && transitSeconds !== undefined && Number.isFinite(transitSeconds)
    && transitSeconds > accessOverSeconds;
}

export const REMARKABLE_GARDEN_RULE = { accessBelowSeconds: 20 * 60 } as const;

export function remarkableGardenLevel(garden: NeighborhoodGreenSpaceJourney["garden"]) {
  const time = garden?.entranceWalkSeconds;
  if (garden?.publicAccess !== "open" || time === undefined || !Number.isFinite(time) || time < 0) return 0;
  return time < REMARKABLE_GARDEN_RULE.accessBelowSeconds ? 1 : 0;
}

export const NATURE_LEISURE_SCORE_RULES = { base: 4, target: 3, maximumBonus: 6, factsOnlyBase: 7, factsMaximum: 2 } as const;
export const PARK_FACT_POINTS = { standard: 1, significant: 1.5, exceptional: 2 } as const;

export type NeighborhoodExceptionalGreenSpaceAccess = "walking" | "transit";

export const NEIGHBORHOOD_EXCEPTIONAL_GREEN_SPACE_RULES = [
  { access: "walking", minSurfaceM2: 100_000, maxMinutesExclusive: 10 },
  { access: "walking", minSurfaceM2: 200_000, maxMinutesExclusive: 15 },
  { access: "transit", minSurfaceM2: 200_000, maxMinutesExclusive: 15 },
  { access: "walking", minSurfaceM2: 50_000, maxMinutesExclusive: 5 },
  { access: "walking", minSurfaceM2: 30_000, maxMinutesExclusive: 5 },
] as const;

export function findExceptionalGreenSpaceRule(surfaceM2: number | undefined, minutes: number, access: NeighborhoodExceptionalGreenSpaceAccess) {
  if (surfaceM2 === undefined || !Number.isFinite(surfaceM2) || surfaceM2 <= 0 || !Number.isFinite(minutes)) return;
  return NEIGHBORHOOD_EXCEPTIONAL_GREEN_SPACE_RULES.find(rule =>
    rule.access === access && surfaceM2 >= rule.minSurfaceM2 && minutes < rule.maxMinutesExclusive);
}

export const PARK_WALKING_RULE = {
  accessMinutes: 20, minLoopMeters: 400, accessSnapMeters: 55,
  significant: { meters: 1500, loops: 2, longestLoopMeters: 1200 },
  exceptional: { meters: 3000, loops: 3, longestLoopMeters: 1800 },
  rich: { meters: 2000, loops: 2, longestLoopMeters: 1200, kinds: 3, featuresPerHectare: .25 },
} as const;

export function classifyParkWalking(profile: import("../../parkWalkingProfile").ParkWalkingProfile): number {
  const { significant, exceptional, rich } = PARK_WALKING_RULE;
  if ((profile.meters >= exceptional.meters && profile.loops >= exceptional.loops && profile.longestLoopMeters >= exceptional.longestLoopMeters)
    || (profile.meters >= rich.meters && profile.loops >= rich.loops
      && profile.longestLoopMeters >= rich.longestLoopMeters
      && profile.featureKinds >= rich.kinds && profile.featuresPerHectare >= rich.featuresPerHectare)) return 3;
  return profile.meters >= significant.meters && profile.loops >= significant.loops
    && profile.longestLoopMeters >= significant.longestLoopMeters ? 2 : 0;
}
