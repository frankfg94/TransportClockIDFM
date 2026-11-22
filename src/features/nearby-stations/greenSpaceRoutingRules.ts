export const GREEN_SPACE_ACCESS_RULES = {
  mainWalkingEntranceToleranceMeters: 15,
  duplicateWalkingEntranceMeters: 15,
  walkingArrivalToleranceMeters: 30,
  mainTransitEntranceToleranceMeters: 30,
  stationSearchMeters: 2300,
  stationBoundaryToleranceMeters: 120,
  duplicateTransitTargetMeters: 100,
  transitTargetLimit: 8,
  transitEntranceLimit: 3,
  transitStationLimit: 4,
  maxTransfers: 0,
  equivalentTransitSeconds: 120,
  terminalConnectorToleranceMeters: 1,
} as const;

const PREFERRED_WALKING_BELOW_MINUTES = 20;
const MARKER_STRENGTH: Readonly<Record<string, number>> = { "+++": 3, "++": 2, "+": 1, "−": 1, "½+": 0.5 };

export function natureFactMarkerStrength(marker: string): number {
  return MARKER_STRENGTH[marker] ?? 0;
}

export function preferNatureTransit(walkingMinutes: number | undefined, transitMinutes: number | undefined): boolean {
  return transitMinutes !== undefined && (walkingMinutes ?? Infinity) >= PREFERRED_WALKING_BELOW_MINUTES;
}

export const GARDEN_ENTRANCE_RULES = {
  registerMatchMeters: 100,
  addressToleranceMeters: 100,
  minimumNamedGateMatchLength: 4,
  namedGateToleranceMeters: 65,
  genericGateToleranceMeters: 15,
} as const;

export const GREEN_SPACE_WALKING_FALLBACK_POLICY = "gtfs-access";
