import type { Departure, TransitMode } from "../../types/transit";

const UNKNOWN_DESTINATION_LABELS = new Set([
  "destination inconnue",
  "destination non precisee",
  "unknown destination",
  "unspecified destination",
]);

export function shouldShowUnconfirmedServiceFallback(
  mode: TransitMode,
  departure: Pick<Departure, "destination" | "serviceTypeStatus">,
): boolean {
  if (departure.serviceTypeStatus !== "unavailable") {
    return false;
  }

  if (mode !== "metro") {
    return true;
  }

  const destination = (departure.destination ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, " ");

  return !destination || UNKNOWN_DESTINATION_LABELS.has(destination);
}
