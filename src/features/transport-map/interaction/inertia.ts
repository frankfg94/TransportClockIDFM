export interface InertiaState {
  velocityX: number;
  velocityY: number;
  active: boolean;
}

// Velocities are expressed in CSS pixels per millisecond. At 60 Hz this
// caps a fling at roughly 20 CSS pixels per frame and keeps a sparse pointer
// event from turning into an unbounded camera jump.
export const MAX_INERTIA_SPEED_PX_PER_MS = 1.25;

export function clampInertiaVelocity(
  velocityX: number,
  velocityY: number,
  maximum = MAX_INERTIA_SPEED_PX_PER_MS,
): { x: number; y: number } {
  const x = Number.isFinite(velocityX) ? velocityX : 0;
  const y = Number.isFinite(velocityY) ? velocityY : 0;
  const magnitude = Math.hypot(x, y);
  if (!Number.isFinite(maximum) || maximum <= 0 || magnitude <= maximum) {
    return { x, y };
  }
  const factor = maximum / magnitude;
  return { x: x * factor, y: y * factor };
}

export function createInertiaState(): InertiaState {
  return { velocityX: 0, velocityY: 0, active: false };
}

export function startInertia(
  state: InertiaState,
  velocityX: number,
  velocityY: number,
): InertiaState {
  const velocity = clampInertiaVelocity(velocityX, velocityY);
  return { velocityX: velocity.x, velocityY: velocity.y, active: Math.hypot(velocity.x, velocity.y) > 0.01 };
}

export function stepInertia(
  state: InertiaState,
  elapsedMs: number,
  frictionPerSecond = 0.0018,
): { state: InertiaState; deltaX: number; deltaY: number } {
  if (!state.active) return { state, deltaX: 0, deltaY: 0 };
  const elapsed = Math.max(0, Math.min(100, elapsedMs));
  const deltaX = state.velocityX * elapsed;
  const deltaY = state.velocityY * elapsed;
  const decay = Math.exp(-frictionPerSecond * elapsed);
  const nextVelocityX = state.velocityX * decay;
  const nextVelocityY = state.velocityY * decay;
  return {
    deltaX,
    deltaY,
    state: {
      velocityX: nextVelocityX,
      velocityY: nextVelocityY,
      active: Math.hypot(nextVelocityX, nextVelocityY) > 0.01,
    },
  };
}
