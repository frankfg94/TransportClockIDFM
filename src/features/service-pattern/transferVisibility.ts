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

export function filterDuplicateBusTransfers(
  transfers: TransferLineOption[],
): TransferLineOption[] {
  const nonBusTransfers = transfers.filter(
    (transfer) => !isBusLikeTransfer(transfer),
  );

  if (nonBusTransfers.length === 0) {
    return transfers;
  }

  return transfers.filter(
    (transfer) =>
      !isBusLikeTransfer(transfer) ||
      !nonBusTransfers.some((nonBusTransfer) =>
        transfersShareIdentity(transfer, nonBusTransfer),
      ),
  );
}

function transfersShareIdentity(
  busTransfer: TransferLineOption,
  nonBusTransfer: TransferLineOption,
): boolean {
  const busIds = createTransferIdentityKeys(busTransfer);
  const nonBusIds = createTransferIdentityKeys(nonBusTransfer);

  if (busIds.some((identity) => nonBusIds.includes(identity))) {
    return true;
  }

  return (
    normalizeTransferSearchText(busTransfer.label) ===
      normalizeTransferSearchText(nonBusTransfer.label) &&
    transfersSharePresentation(busTransfer, nonBusTransfer)
  );
}

function createTransferIdentityKeys(
  transfer: TransferLineOption,
): string[] {
  return [transfer.id, transfer.ref]
    .flatMap((value) => {
      const normalized = normalizeTransferSearchText(value ?? "");
      const idfmCode = normalized.match(/\bc\d{5}\b/u)?.[0];

      return [normalized, idfmCode].filter(
        (identity): identity is string => Boolean(identity),
      );
    })
    .filter((value, index, identities) => identities.indexOf(value) === index);
}

function transfersSharePresentation(
  left: TransferLineOption,
  right: TransferLineOption,
): boolean {
  const leftIcons = [left.iconUrl, ...(left.iconUrls ?? [])].filter(Boolean);
  const rightIcons = [right.iconUrl, ...(right.iconUrls ?? [])].filter(Boolean);
  const sharesIcon = leftIcons.some((icon) => rightIcons.includes(icon));
  const leftColor = normalizeColor(left.color);
  const rightColor = normalizeColor(right.color);

  return (
    sharesIcon ||
    Boolean(
      leftColor &&
        rightColor &&
        leftColor === rightColor &&
        normalizeColor(left.textColor) === normalizeColor(right.textColor),
    )
  );
}

function normalizeColor(value?: string): string {
  return (value ?? "").replace(/^#/u, "").trim().toLowerCase();
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
