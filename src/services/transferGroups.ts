import type { TransferLineOption } from "../types/transit";

export const TRANSFER_GROUP_ORDER = [
  "METRO",
  "RER",
  "TRANSILIEN",
  "TRAM",
  "BUS",
  "OTHER",
] as const;

export type TransferGroupKey = (typeof TRANSFER_GROUP_ORDER)[number];

export interface TransferGroup {
  key: TransferGroupKey;
  label: string;
  countLabel: string;
  iconLabel: string;
  transfers: TransferLineOption[];
}

const TRANSFER_GROUP_METADATA: Record<
  TransferGroupKey,
  { label: string; iconLabel: string }
> = {
  METRO: { label: "Metro", iconLabel: "M" },
  RER: { label: "RER", iconLabel: "RER" },
  TRANSILIEN: { label: "Train", iconLabel: "TER" },
  TRAM: { label: "Tram", iconLabel: "T" },
  BUS: { label: "Bus", iconLabel: "BUS" },
  OTHER: { label: "Other transfers", iconLabel: "+" },
};

export function createTransferGroups(
  transfers: TransferLineOption[],
): TransferGroup[] {
  const groups = new Map<TransferGroupKey, TransferLineOption[]>();

  transfers.forEach((transfer) => {
    const key = getTransferFamilyKey(transfer);
    const group = groups.get(key) ?? [];

    group.push(transfer);
    groups.set(key, group);
  });

  return TRANSFER_GROUP_ORDER.flatMap((key) => {
    const groupTransfers = groups.get(key);

    if (!groupTransfers?.length) {
      return [];
    }

    const metadata = TRANSFER_GROUP_METADATA[key];

    return [
      {
        key,
        label: metadata.label,
        countLabel:
          groupTransfers.length > 1
            ? `${groupTransfers.length} lines`
            : "1 line",
        iconLabel: metadata.iconLabel,
        transfers: groupTransfers,
      },
    ];
  });
}

export function getTransferFamilyKey(
  transfer: TransferLineOption,
): TransferGroupKey {
  if (transfer.family === "METRO") return "METRO";
  if (transfer.family === "RER") return "RER";
  if (transfer.family === "TRANSILIEN") return "TRANSILIEN";
  if (transfer.family === "TRAM") return "TRAM";
  if (transfer.family === "BUS" || transfer.family === "NOCTILIEN") {
    return "BUS";
  }

  const mode = normalizeText(transfer.mode ?? "");

  if (mode.includes("metro")) return "METRO";
  if (mode.includes("rer")) return "RER";
  if (mode.includes("tram")) return "TRAM";
  if (mode.includes("bus") || mode.includes("noctilien")) return "BUS";
  if (mode.includes("train") || mode.includes("rail")) return "TRANSILIEN";

  return "OTHER";
}

export function getTransferDetailTitle(
  transfer: TransferLineOption,
): string {
  const metadata = TRANSFER_GROUP_METADATA[getTransferFamilyKey(transfer)];

  return `${metadata.label} ${transfer.label}`.trim();
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
