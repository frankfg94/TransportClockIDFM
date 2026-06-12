import type {
  TransferLineOption,
  TransitFamily,
} from "../../types/transit";
import { normalizePatternStationName } from "./stationKeys";

export interface CurrentLineIdentity {
  family?: TransitFamily;
  ids?: Array<string | undefined>;
  labels?: Array<string | undefined>;
}

const HIGH_SERVICE_BUS_PATTERNS = [
  /\bt\s*zen\b/u,
  /\btzen\b/u,
  /\borlyval\b/u,
  /\btvm\b/u,
  /\bbhns\b/u,
  /\bbus\s+a\s+haut\s+niveau\b/u,
  /\bbus\s+rapid\s+transit\b/u,
] as const;

export function isBusLikeTransfer(transfer: TransferLineOption): boolean {
  const family = transfer.family;

  if (family) {
    return family === "BUS" || family === "NOCTILIEN";
  }

  const mode = normalizePatternStationName(transfer.mode ?? "");

  return mode.includes("bus") || mode.includes("noctilien");
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

export function filterCurrentLineTransfers(
  transfers: TransferLineOption[],
  currentLine?: CurrentLineIdentity,
): TransferLineOption[] {
  if (!currentLine) {
    return transfers;
  }

  const currentIds = createIdentityKeys(currentLine.ids ?? []);
  const currentLabels = new Set(
    (currentLine.labels ?? [])
      .map((label) => normalizeLineLabel(label ?? ""))
      .filter(Boolean),
  );

  return transfers.filter((transfer) => {
    const transferIds = createIdentityKeys([transfer.id, transfer.ref]);

    if (
      Array.from(transferIds).some((identity) => currentIds.has(identity))
    ) {
      return false;
    }

    if (
      !currentLine.family ||
      !familiesMatch(transfer.family, currentLine.family)
    ) {
      return true;
    }

    return !currentLabels.has(normalizeLineLabel(transfer.label));
  });
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
  return Array.from(createIdentityKeys([transfer.id, transfer.ref]));
}

function createIdentityKeys(
  values: Array<string | undefined>,
): Set<string> {
  const identities = new Set<string>();

  values.forEach((value) => {
    const normalized = normalizeTransferSearchText(value ?? "");
    const idfmCode = normalized.match(/\bc\d{5}\b/u)?.[0];

    if (normalized) {
      identities.add(normalized);
    }

    if (idfmCode) {
      identities.add(idfmCode);
    }
  });

  return identities;
}

function familiesMatch(
  transferFamily: TransitFamily | undefined,
  currentFamily: TransitFamily,
): boolean {
  if (transferFamily === currentFamily) {
    return true;
  }

  return (
    (transferFamily === "BUS" || transferFamily === "NOCTILIEN") &&
    (currentFamily === "BUS" || currentFamily === "NOCTILIEN")
  );
}

function normalizeLineLabel(value: string): string {
  return normalizeTransferSearchText(value)
    .replace(
      /^(?:ligne|metro|rer|tram|tramway|train|transilien|bus|noctilien)\s+/u,
      "",
    )
    .replace(/\s+/gu, "");
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
