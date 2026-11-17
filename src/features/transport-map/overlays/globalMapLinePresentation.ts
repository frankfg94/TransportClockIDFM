import type { GlobalMapLine } from "../contracts/manifest";

export function globalMapLineDisplayLabel(line: GlobalMapLine): string {
  return line.mode === "TRAIN" && line.label.trim().toUpperCase() === "TER"
    ? line.commercialNetworkLabel || line.label || line.code
    : line.label || line.code;
}

export function globalMapCommercialDate(line: GlobalMapLine): string | undefined {
  const raw = line.commercialServiceDate;
  return raw && /^\d{8}$/u.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : undefined;
}
