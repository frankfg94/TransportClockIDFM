/** Exclusive outcome for discrete scoring rules. Operational state belongs to the criterion registry.
 * Continuous rules should expose their own coefficients instead of inventing classes. */
export type NeighborhoodQualification =
  | { kind: "exceptional-bonus" }
  | { kind: "bonus" }
  | { kind: "half-bonus" }
  | { kind: "neutral" }
  | { kind: "penalty" }
  | { kind: "not-evaluated"; reason: "loading" | "unavailable" | "error" | "disabled" | "insufficient-data" };
