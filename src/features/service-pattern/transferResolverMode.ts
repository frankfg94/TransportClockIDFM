export type TransferResolverMode = "auto" | "nearby";
export type EffectiveTransferResolverMode = "nearby";

export const transferResolverModeOptions = [
  {
    id: "auto",
    label: "Auto",
  },
  {
    id: "nearby",
    label: "Nearby",
  },
] as const;

export function isTransferResolverMode(
  value: unknown,
): value is TransferResolverMode {
  return value === "auto" || value === "nearby";
}

export function resolveEffectiveTransferResolverMode(
  requestedMode: TransferResolverMode,
  _lineMode?: string,
): EffectiveTransferResolverMode {
  return requestedMode === "nearby" ? "nearby" : "nearby";
}
