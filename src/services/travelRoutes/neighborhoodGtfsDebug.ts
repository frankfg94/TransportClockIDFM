/** Opt-in measurement only: never clear or overwrite the user's caches. */
export function isNeighborhoodGtfsColdStart(): boolean {
  return typeof window !== "undefined"
    && new URL(window.location.href).searchParams.get("debugCold") === "1";
}
