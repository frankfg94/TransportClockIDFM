export interface PatternVehicleGeometryPoint {
  x: number;
  y: number;
}

export interface PatternVehicleLayoutPoint extends PatternVehicleGeometryPoint {
  angleDegrees: number;
}

export interface PatternVehicleGeometryOptions {
  sourceId: string;
  targetId: string;
  progress: number;
  positions: Map<string, PatternVehicleGeometryPoint>;
  rounded: boolean;
  curvature?: number;
}

export function getPatternVehicleLayoutPoint({
  sourceId,
  targetId,
  progress,
  positions,
  rounded,
  curvature = 0.32,
}: PatternVehicleGeometryOptions): PatternVehicleLayoutPoint | undefined {
  const businessSource = positions.get(sourceId);
  const businessTarget = positions.get(targetId);

  if (!businessSource || !businessTarget) {
    return undefined;
  }

  if (sourceId === targetId || pointsAreEqual(businessSource, businessTarget)) {
    return {
      x: businessSource.x,
      y: businessSource.y,
      angleDegrees: 0,
    };
  }

  const reversed = shouldReverseVisualDirection(businessSource, businessTarget);
  const source = reversed ? businessTarget : businessSource;
  const target = reversed ? businessSource : businessTarget;
  const visualProgress = reversed
    ? 1 - clampProgress(progress)
    : clampProgress(progress);

  const sample = rounded
    ? sampleBezier(source, target, visualProgress, curvature)
    : sampleLine(source, target, visualProgress);
  const direction = reversed ? -1 : 1;

  return {
    x: sample.x,
    y: sample.y,
    angleDegrees: radiansToDegrees(
      Math.atan2(sample.dy * direction, sample.dx * direction),
    ),
  };
}

function sampleLine(
  source: PatternVehicleGeometryPoint,
  target: PatternVehicleGeometryPoint,
  progress: number,
): PatternVehicleGeometryPoint & { dx: number; dy: number } {
  return {
    x: source.x + (target.x - source.x) * progress,
    y: source.y + (target.y - source.y) * progress,
    dx: target.x - source.x,
    dy: target.y - source.y,
  };
}

function sampleBezier(
  source: PatternVehicleGeometryPoint,
  target: PatternVehicleGeometryPoint,
  progress: number,
  curvature: number,
): PatternVehicleGeometryPoint & { dx: number; dy: number } {
  const sourceControl = getHorizontalControlPoint(
    source,
    target,
    "source",
    curvature,
  );
  const targetControl = getHorizontalControlPoint(
    target,
    source,
    "target",
    curvature,
  );
  const inverse = 1 - progress;
  const x =
    inverse ** 3 * source.x +
    3 * inverse ** 2 * progress * sourceControl.x +
    3 * inverse * progress ** 2 * targetControl.x +
    progress ** 3 * target.x;
  const y =
    inverse ** 3 * source.y +
    3 * inverse ** 2 * progress * sourceControl.y +
    3 * inverse * progress ** 2 * targetControl.y +
    progress ** 3 * target.y;
  const dx =
    3 * inverse ** 2 * (sourceControl.x - source.x) +
    6 * inverse * progress * (targetControl.x - sourceControl.x) +
    3 * progress ** 2 * (target.x - targetControl.x);
  const dy =
    3 * inverse ** 2 * (sourceControl.y - source.y) +
    6 * inverse * progress * (targetControl.y - sourceControl.y) +
    3 * progress ** 2 * (target.y - targetControl.y);

  return { x, y, dx, dy };
}

function getHorizontalControlPoint(
  point: PatternVehicleGeometryPoint,
  other: PatternVehicleGeometryPoint,
  role: "source" | "target",
  curvature: number,
): PatternVehicleGeometryPoint {
  const distance = Math.abs(other.x - point.x);
  const offset =
    distance > 0
      ? distance * 0.5
      : curvature * 25 * Math.sqrt(Math.abs(other.y - point.y));

  return {
    x: role === "source" ? point.x + offset : point.x - offset,
    y: point.y,
  };
}

function shouldReverseVisualDirection(
  source: PatternVehicleGeometryPoint,
  target: PatternVehicleGeometryPoint,
): boolean {
  return (
    source.x > target.x ||
    (source.x === target.x && source.y > target.y)
  );
}

function pointsAreEqual(
  left: PatternVehicleGeometryPoint,
  right: PatternVehicleGeometryPoint,
): boolean {
  return left.x === right.x && left.y === right.y;
}

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function radiansToDegrees(value: number): number {
  const degrees = (value * 180) / Math.PI;

  return (degrees + 360) % 360;
}
