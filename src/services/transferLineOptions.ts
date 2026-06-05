import type { TransferLineOption, TransitFamily } from "../types/transit";
import {
  createLinePresentation,
  transitFamilyToMode,
  transitModeToFamily,
} from "./linePresentation";

export interface TransferLineOptionSource {
  code?: string;
  color?: string;
  family?: TransitFamily;
  id?: string;
  label?: string;
  longName?: string;
  mode?: string;
  name?: string;
  ref?: string;
  textColor?: string;
}

export function createTransferLineOption(
  source: TransferLineOptionSource,
): TransferLineOption {
  const family =
    source.family ??
    transitModeToFamily(source.mode) ??
    inferTransferFamily(source);
  const label = normalizeTransferLabel(
    source.code ?? source.label ?? source.name ?? source.longName ?? source.id,
  );
  const id =
    normalizeTransferLineId(source.id ?? source.ref) ??
    `transfer:${family.toLowerCase()}:${normalizeTransferKey(label)}`;
  const ref = normalizeTransferLineId(source.ref ?? source.id) ?? source.ref ?? source.id;
  const mode = source.mode ?? familyToDisplayMode(family);
  const presentation = createLinePresentation({
    code: label,
    color: source.color,
    family,
    id,
    longName: source.longName ?? source.name,
    mode: transitFamilyToMode(family),
    ref,
    shortName: label,
    textColor: source.textColor,
  });

  return {
    id,
    label,
    family,
    mode,
    ref,
    color: presentation.color,
    textColor: presentation.textColor,
    iconUrl: presentation.iconUrl,
    iconUrls: presentation.iconUrls,
  };
}

export function mergeTransferLineOptionPresentation(
  current: TransferLineOption,
  source: TransferLineOptionSource,
): TransferLineOption {
  const enriched = createTransferLineOption({
    code: source.code ?? current.label,
    color: source.color ?? current.color,
    family: source.family ?? current.family,
    id: source.id ?? current.id,
    label: source.label ?? current.label,
    longName: source.longName,
    mode: source.mode ?? current.mode,
    name: source.name,
    ref: source.ref ?? current.ref,
    textColor: source.textColor ?? current.textColor,
  });

  return {
    ...current,
    ...enriched,
    id: enriched.id || current.id,
    ref: enriched.ref ?? current.ref,
  };
}

export function dedupeTransferLineOptions(
  transfers: TransferLineOption[],
): TransferLineOption[] {
  const deduped = new Map<string, TransferLineOption>();

  transfers.forEach((transfer) => {
    const key = createTransferDedupeKey(transfer);
    const existing = deduped.get(key);

    if (!existing || scoreTransferCompleteness(transfer) > scoreTransferCompleteness(existing)) {
      deduped.set(key, transfer);
    }
  });

  return Array.from(deduped.values());
}

export function getTransferLineId(
  transfer: Pick<TransferLineOption, "id" | "ref">,
): string | undefined {
  return normalizeTransferLineId(transfer.id) ?? normalizeTransferLineId(transfer.ref);
}

function createTransferDedupeKey(transfer: TransferLineOption): string {
  return [
    normalizeText(transfer.family ?? transfer.mode ?? ""),
    normalizeTransferKey(transfer.label || transfer.id.split(":").pop() || transfer.id),
  ].join(":");
}

function scoreTransferCompleteness(transfer: TransferLineOption): number {
  let score = 0;

  if (transfer.id?.startsWith("line:IDFM:")) score += 4;
  if (transfer.color && transfer.color !== "#0064ff") score += 3;
  if (transfer.textColor && transfer.textColor !== "#ffffff") score += 2;
  if (transfer.iconUrl || transfer.iconUrls?.length) score += 1;

  return score;
}

function inferTransferFamily(source: TransferLineOptionSource): TransitFamily {
  const mode = normalizeText(
    [source.mode, source.longName, source.name, source.label, source.code].join(" "),
  );
  const label = normalizeTransferKey(source.code ?? source.label ?? source.name ?? "");

  if (mode.includes("metro")) return "METRO";
  if (mode.includes("rer") || mode.includes("rapidtransit")) return "RER";
  if (mode.includes("tram")) return "TRAM";
  if (mode.includes("localtrain") || mode.includes("train") || mode.includes("rail")) {
    return "TRANSILIEN";
  }
  if (mode.includes("cable") || mode.includes("funicular")) return "CABLE";

  return label.startsWith("n") ? "NOCTILIEN" : "BUS";
}

function familyToDisplayMode(family: TransitFamily): string {
  if (family === "METRO") return "Metro";
  if (family === "RER") return "RER";
  if (family === "TRAM") return "Tram";
  if (family === "TRANSILIEN") return "Train";
  if (family === "CABLE") return "Cable";
  if (family === "NOCTILIEN") return "Noctilien";

  return "Bus";
}

function normalizeTransferLineId(value?: string): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("line:")) {
    return trimmed;
  }

  const idfmMatch = trimmed.match(/C\d{5}/iu)?.[0];

  return idfmMatch ? `line:IDFM:${idfmMatch.toUpperCase()}` : undefined;
}

function normalizeTransferLabel(value?: string): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "?";
  }

  return trimmed
    .replace(/^ligne\s+/iu, "")
    .replace(/^m(?:etro|Ã©tro)\s+/iu, "")
    .replace(/^rer\s+/iu, "")
    .replace(/^tram(?:way)?\s+/iu, "")
    .trim();
}

function normalizeTransferKey(value: string): string {
  return normalizeText(value).replace(/\s+/gu, "");
}

function normalizeText(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[\u2019']/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
