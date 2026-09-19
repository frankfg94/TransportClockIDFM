/** Same keyframes/easing as nearby-map-pop, sampled once, not per marker/frame. */
export const NEARBY_PLACE_POP_MS = 420;
const curve = new Float32Array(129);
for (let i = 0; i < curve.length; i++) {
  const x = i / (curve.length - 1);
  let lo = 0;
  let hi = 1;
  for (let step = 0; step < 18; step++) {
    const t = (lo + hi) / 2;
    const u = 1 - t;
    if (3 * u * u * t * .18 + 3 * u * t * t * .28 + t * t * t < x) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2;
  curve[i] = 3 * (1 - t) ** 2 * t * .8 + 3 * (1 - t) * t * t * 1.3 + t ** 3;
}
function ease(progress: number): number {
  return curve[Math.round(Math.max(0, Math.min(1, progress)) * (curve.length - 1))]!;
}

export function nearbyPlacePop(elapsed: number, leaving = false): { scale: number; y: number; opacity: number } {
  const progress = Math.max(0, Math.min(1, elapsed / NEARBY_PLACE_POP_MS));
  if (leaving) {
    if (progress < .3) return { scale: 1 + .06 * ease(progress / .3), y: 0, opacity: 1 };
    const t = ease((progress - .3) / .7);
    return { scale: 1.06 - .21 * t, y: 10 * t, opacity: Math.max(0, 1 - t) };
  }
  if (progress < .7) {
    const t = ease(progress / .7);
    return { scale: .85 + .21 * t, y: 10 * (1 - t), opacity: Math.min(1, t) };
  }
  return { scale: 1.06 - .06 * ease((progress - .7) / .3), y: 0, opacity: 1 };
}
