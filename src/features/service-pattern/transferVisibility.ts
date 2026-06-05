import type { TransferLineOption } from "../../types/transit";
import { normalizePatternStationName } from "./stationKeys";

const HIGH_SERVICE_BUS_PATTERNS = [
  /\bt\s*zen\b/u,
  /\btzen\b/u,
  /\btvm\b/u,
  /\bbhns\b/u,
  /\bbus\s+a\s+haut\s+niveau\b/u,
  /\bbus\s+rapid\s+transit\b/u,
] as const;

export function isBusLikeTransfer(transfer: TransferLineOption): boolean {
  const family = transfer.family;
  const mode = normalizePatternStationName(transfer.mode ?? "");

  return (
    family === "BUS" ||
    family === "NOCTILIEN" ||
    mode.includes("bus") ||
    mode.includes("noctilien")
  );
}

export function isHighServiceBusTransfer(
  transfer: TransferLineOption,
): boolean {
  if (!isBusLikeTransfer(transfer)) {
    return false;
  }

  const searchable = [
    transfer.label,
    transfer.id,
    transfer.ref,
    transfer.mode,
  ]
    .map((value) => normalizeTransferSearchText(value ?? ""))
    .filter(Boolean)
    .join(" ");

  return HIGH_SERVICE_BUS_PATTERNS.some((pattern) => pattern.test(searchable));
}

export function isVisiblePatternPlanTransfer(
  transfer: TransferLineOption,
): boolean {
  return !isBusLikeTransfer(transfer) || isHighServiceBusTransfer(transfer);
}

function normalizeTransferSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
