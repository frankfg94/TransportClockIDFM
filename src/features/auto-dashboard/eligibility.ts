import type { GlobalMapMode } from "../transport-map/contracts/manifest";

/** The displayed limits are inclusive and apply to each line's own mode. */
export function autoDashboardLimitSeconds(mode: GlobalMapMode): number | undefined {
  if (mode === "BUS" || mode === "NOCTILIEN") return 5 * 60;
  if (mode === "TRAM") return 10 * 60;
  if (mode === "RER") return 15 * 60;
  return undefined;
}

export function isAutoDashboardEligible(mode: GlobalMapMode, seconds: number | undefined): boolean {
  const limit = autoDashboardLimitSeconds(mode);
  return limit !== undefined && seconds !== undefined && Number.isFinite(seconds)
    && seconds >= 0 && seconds <= limit;
}

/**
 * Require two successive successful scans before changing an existing result.
 * This is temporal hysteresis: it does not alter the walking-time limits.
 * Missing routes are deliberately not treated as an out-of-range measurement.
 */
export class AutoDashboardStabilizer {
  private included = new Set<string>();
  private pending = new Map<string, { eligible: boolean; count: number }>();
  private initialized = false;

  get hasPending(): boolean { return this.pending.size > 0; }

  update(observations: ReadonlyMap<string, boolean | undefined>): ReadonlySet<string> {
    const keys = new Set([...this.included, ...this.pending.keys(), ...observations.keys()]);
    for (const key of keys) {
      const eligible = observations.has(key) ? observations.get(key) : false;
      if (eligible === undefined) {
        this.pending.delete(key);
        continue;
      }
      const current = this.included.has(key);
      if (eligible === current) {
        this.pending.delete(key);
        continue;
      }
      if (!this.initialized) {
        if (eligible) this.included.add(key);
        continue;
      }
      const previous = this.pending.get(key);
      const count = previous?.eligible === eligible ? previous.count + 1 : 1;
      if (count >= 2) {
        if (eligible) this.included.add(key);
        else this.included.delete(key);
        this.pending.delete(key);
      } else {
        this.pending.set(key, { eligible, count });
      }
    }
    this.initialized = true;
    return new Set(this.included);
  }

  clear(): void {
    this.included.clear();
    this.pending.clear();
    this.initialized = false;
  }
}
