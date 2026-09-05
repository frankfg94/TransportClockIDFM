import type { GlobalMapMode } from "../transport-map/contracts/manifest";

export type GlobalTransportPlanPreset = "ALL" | GlobalMapMode;

/**
 * Quick presets deliberately follow the visual order of the left panel.
 * BIKE is a quick preset when the optional PRIM network is present. It stays
 * out of the initial default selection through `useTransportMapFilters`.
 */
export const GLOBAL_TRANSPORT_PLAN_PRESET_MODES = [
  "METRO",
  "RER",
  "TRAIN",
  "TRANSILIEN",
  "TRAM",
  "CABLE",
  "BUS",
  "NOCTILIEN",
  "BIKE",
] as const satisfies readonly GlobalMapMode[];

export const GLOBAL_TRANSPORT_PLAN_PANEL_MODES = [
  ...GLOBAL_TRANSPORT_PLAN_PRESET_MODES,
] as const satisfies readonly GlobalMapMode[];

export function deriveGlobalTransportPlanPreset(
  availableModes: readonly GlobalMapMode[],
  selectedModes: readonly GlobalMapMode[],
): GlobalTransportPlanPreset | undefined {
  const available = new Set(availableModes);
  const selected = new Set(selectedModes);

  if (
    available.size > 0 &&
    selected.size === available.size &&
    [...available].every((mode) => selected.has(mode))
  ) {
    return "ALL";
  }

  if (selected.size !== 1) return undefined;
  const mode = selected.values().next().value as GlobalMapMode | undefined;
  if (!mode || !available.has(mode)) return undefined;

  return GLOBAL_TRANSPORT_PLAN_PRESET_MODES.some((candidate) => candidate === mode)
    ? mode
    : undefined;
}
