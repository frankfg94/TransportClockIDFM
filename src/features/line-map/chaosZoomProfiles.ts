export type ChaosZoomProfileId = "standard" | "extreme";

export type ChaosZoomExtremePhase =
  | "activate-all"
  | "lod-11-thrash"
  | "dense-paris"
  | "lod-14-thrash"
  | "lod-17-thrash"
  | "center-drift"
  | "mixed-chaos"
  | "recovery";

export interface ChaosZoomProfileDefinition {
  readonly id: ChaosZoomProfileId;
  readonly version: number;
  readonly seed: number;
  readonly minimumZoom: number;
  readonly maximumZoom: number;
}

export interface ChaosZoomExtremeAction {
  index: number;
  phase: Exclude<ChaosZoomExtremePhase, "activate-all" | "recovery">;
  kind: "zoom" | "pan" | "combined";
  targetZoom?: number;
  targetCenter?: { lon: number; lat: number };
  targetDistanceKm?: number;
  durationMs: number;
  eventCount: number;
  pauseMs: number;
  commitPause: boolean;
  anchorRatioX: number;
  anchorRatioY: number;
  panFromRatioX?: number;
  panFromRatioY?: number;
  panToRatioX?: number;
  panToRatioY?: number;
}

export const STANDARD_CHAOS_ZOOM_PROFILE: ChaosZoomProfileDefinition = Object.freeze({
  id: "standard",
  version: 1,
  seed: 0,
  minimumZoom: 12.1,
  maximumZoom: 16.7,
});

export const EXTREME_CHAOS_ZOOM_PROFILE = Object.freeze({
  id: "extreme",
  version: 2,
  seed: 0x5eed2026,
  minimumZoom: 8.5,
  maximumZoom: 18,
  center: Object.freeze({ lon: 2.347, lat: 48.858 }),
  maximumCenterDistanceKm: 1.5,
  activationPauseMs: 180,
  recoveryTimeoutMs: 3_000,
  commitTimeoutMs: 700,
  spikeThresholdMs: 33.4,
  maximumSpikeCount: 24,
});

export const CHAOS_ZOOM_PROFILES = Object.freeze({
  standard: STANDARD_CHAOS_ZOOM_PROFILE,
  extreme: EXTREME_CHAOS_ZOOM_PROFILE,
});

/** Creates the complete, versioned workload before execution for exact replay. */
export function createExtremeChaosZoomTrace(): ChaosZoomExtremeAction[] {
  const random = createSeededRandom(EXTREME_CHAOS_ZOOM_PROFILE.seed);
  const actions: ChaosZoomExtremeAction[] = [];
  let actionIndex = 0;

  const push = (
    phase: ChaosZoomExtremeAction["phase"],
    kind: ChaosZoomExtremeAction["kind"],
    targetZoom?: number,
    target?: { center: { lon: number; lat: number }; distanceKm: number },
  ) => {
    const index = actionIndex++;
    const commitPause = (index + 1) % 3 === 0;
    const panMagnitude = randomBetween(random, 0.002, 0.008);
    const panAngle = randomBetween(random, 0, Math.PI * 2);
    const fromX = randomBetween(random, 0.25, 0.75);
    const fromY = randomBetween(random, 0.25, 0.75);
    actions.push({
      index,
      phase,
      kind,
      targetZoom,
      targetCenter: target?.center,
      targetDistanceKm: target?.distanceKm,
      durationMs: Math.round(randomBetween(random, 520, 900)),
      eventCount: Math.round(randomBetween(random, 10, 28)),
      pauseMs: Math.round(randomBetween(random, commitPause ? 400 : 80, commitPause ? 700 : 250)),
      commitPause,
      anchorRatioX: randomBetween(random, 0.48, 0.52),
      anchorRatioY: randomBetween(random, 0.48, 0.52),
      panFromRatioX: kind !== "zoom" ? fromX : undefined,
      panFromRatioY: kind !== "zoom" ? fromY : undefined,
      panToRatioX: kind !== "zoom" ? clampRatio(fromX + Math.cos(panAngle) * panMagnitude) : undefined,
      panToRatioY: kind !== "zoom" ? clampRatio(fromY + Math.sin(panAngle) * panMagnitude) : undefined,
    });
  };

  for (let index = 0; index < 6; index += 1) {
    push("lod-11-thrash", "zoom", index % 2 === 0 ? 10.6 : 11.4);
  }
  for (let index = 0; index < 8; index += 1) {
    push(
      "dense-paris",
      index % 2 === 0 ? "zoom" : "pan",
      index % 2 === 0 ? randomBetween(random, 13.2, 15.8) : undefined,
    );
  }
  for (let index = 0; index < 6; index += 1) {
    push("lod-14-thrash", "zoom", index % 2 === 0 ? 13.6 : 14.4);
  }
  for (let index = 0; index < 6; index += 1) {
    push("lod-17-thrash", "zoom", index % 2 === 0 ? 16.6 : 17.4);
  }
  for (let index = 0; index < 8; index += 1) {
    const distanceKm = randomBetween(random, 0.15, 1.2);
    const angle = randomBetween(random, 0, Math.PI * 2);
    push(
      "center-drift",
      "combined",
      index % 2 === 0
        ? randomBetween(random, 9, 11)
        : randomBetween(random, 15.5, 17.5),
      {
        distanceKm,
        center: radialTarget(EXTREME_CHAOS_ZOOM_PROFILE.center, distanceKm, angle),
      },
    );
  }
  for (let index = 0; index < 12; index += 1) {
    const distanceKm = randomBetween(random, 0.1, 1.2);
    const angle = randomBetween(random, 0, Math.PI * 2);
    push(
      "mixed-chaos",
      "combined",
      index % 2 === 0
        ? randomBetween(random, 8.5, 10.5)
        : randomBetween(random, 16.5, 18),
      {
        distanceKm,
        center: radialTarget(EXTREME_CHAOS_ZOOM_PROFILE.center, distanceKm, angle),
      },
    );
  }
  return actions;
}

function radialTarget(
  center: { lon: number; lat: number },
  distanceKm: number,
  angleRadians: number,
): { lon: number; lat: number } {
  const latDelta = (distanceKm / 111.32) * Math.sin(angleRadians);
  const lonDelta =
    (distanceKm / (111.32 * Math.cos((center.lat * Math.PI) / 180))) * Math.cos(angleRadians);
  return { lon: center.lon + lonDelta, lat: center.lat + latDelta };
}

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomBetween(random: () => number, minimum: number, maximum: number): number {
  return minimum + random() * (maximum - minimum);
}

function clampRatio(value: number): number {
  return Math.max(0.08, Math.min(0.92, value));
}
