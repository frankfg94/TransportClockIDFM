export const REGIONAL_GREEN_SPACE_RULES = {
  parkWalkSearchMeters: 4000,
  inventorySearchMeters: 6000,
  parkAccessVerificationBudget: 24,
  woodlandEntrySampleSpacingMeters: 100,
  mainWoodlandTargetLimit: 10,
  mainParkEntranceToleranceMeters: 15,
  parkGroupLongitudeGap: .006,
  parkGroupLatitudeGap: .004,
  maxParkDistanceMeters: 3000,
  minParkAreaM2: 10_000,
  minWoodlandAreaM2: 200_000,
} as const;

export const WOODLAND_FRAGMENTATION_RULES = {
  motorwayClass: "Autoroute",
  nationalRoadClass: "Nationale",
  motorwayMinHalfWidthMeters: 12,
  nationalMinHalfWidthMeters: 7,
  maximumHalfWidthMeters: 25,
  roadMarginMeters: 3,
  envelopeMarginMeters: 25,
  minimumSectorAreaM2: 100,
  interiorProbeMeters: 45,
  minimumInteriorDepthMeters: 20,
} as const;
