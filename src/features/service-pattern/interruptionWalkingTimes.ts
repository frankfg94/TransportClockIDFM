const WALKING_DISTANCE_MULTIPLIER = 1.25;
const WALKING_SPEED_KMH = 4.8;

export interface InterruptedWalkingSegment {
  edgeKeys: string[];
  kind: string;
}

export interface WalkingTimeEdge {
  distanceKm?: number;
  source: string;
  target: string;
}

export interface InterruptionWalkingTime {
  edgeKey: string;
  minutes: number;
  source: string;
  target: string;
}

export function estimateWalkingMinutes(
  distanceKm: number | undefined,
): number | undefined {
  if (
    distanceKm === undefined ||
    !Number.isFinite(distanceKm) ||
    distanceKm <= 0
  ) {
    return undefined;
  }

  return Math.max(
    1,
    Math.round(
      ((distanceKm * WALKING_DISTANCE_MULTIPLIER) / WALKING_SPEED_KMH) * 60,
    ),
  );
}

export function createInterruptionWalkingTimes(
  segments: InterruptedWalkingSegment[],
  edges: WalkingTimeEdge[],
): InterruptionWalkingTime[] {
  const interruptedEdgeKeys = new Set(
    segments
      .filter((segment) => segment.kind === "interruption")
      .flatMap((segment) => segment.edgeKeys),
  );

  return edges.flatMap((edge) => {
    const edgeKey = createWalkingTimeEdgeKey(edge.source, edge.target);

    if (!interruptedEdgeKeys.has(edgeKey)) {
      return [];
    }

    const minutes = estimateWalkingMinutes(edge.distanceKm);

    return minutes === undefined
      ? []
      : [{ edgeKey, minutes, source: edge.source, target: edge.target }];
  });
}

export function createWalkingTimeEdgeKey(source: string, target: string): string {
  return [source, target].sort().join("--");
}
