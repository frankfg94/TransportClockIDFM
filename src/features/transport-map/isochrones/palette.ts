import type { GlobalIsochroneSurface } from "./contracts";

export const WALKING_ISOCHRONE_ZONE_COLORS = [
  {
    fill: "rgba(34, 197, 94, .29)",
    stroke: "rgba(22, 130, 70, .70)",
    deckFill: [34, 197, 94, 74] as const,
    deckStroke: [22, 130, 70, 179] as const,
  },
  {
    fill: "rgba(134, 239, 172, .27)",
    stroke: "rgba(62, 160, 93, .62)",
    deckFill: [134, 239, 172, 69] as const,
    deckStroke: [62, 160, 93, 158] as const,
  },
  {
    fill: "rgba(250, 204, 21, .24)",
    stroke: "rgba(180, 137, 0, .62)",
    deckFill: [250, 204, 21, 61] as const,
    deckStroke: [180, 137, 0, 158] as const,
  },
] as const;

export function globalIsochroneZoneIndex(
  surface: Pick<GlobalIsochroneSurface, "id" | "mode" | "minutes" | "scopeKey">,
  surfaces: readonly GlobalIsochroneSurface[],
): number {
  const scope = surface.scopeKey ?? `mode:${surface.mode}`;
  const matching = surfaces
    .filter((candidate) => (candidate.scopeKey ?? `mode:${candidate.mode}`) === scope)
    .sort((left, right) => left.minutes - right.minutes || left.id.localeCompare(right.id));
  const index = matching.findIndex((candidate) => candidate.id === surface.id);
  return Math.max(0, Math.min(WALKING_ISOCHRONE_ZONE_COLORS.length - 1, index));
}
