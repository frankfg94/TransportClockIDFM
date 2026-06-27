import {
  getTrafficDisruptionDisplayPeriod,
  parseTrafficDate,
} from "./trafficTiming";
import type { TrafficDisruption } from "./types";

export type TrafficTone = "orange" | "red";

const RED_TRAFFIC_KEYWORDS = [
  "interrompu",
  "interruption",
  "aucun train",
  "aucune circulation",
  "ne circule pas",
  "ne circulent pas",
  "trafic suspendu",
  "service suspendu",
  "fermeture",
  "no service",
  "no-service",
  "bloquant",
  "bloquante",
  "blocked",
];

export function getDisruptionTone(
  disruption: TrafficDisruption,
): TrafficTone {
  const { title, message, severity, cause, status } = disruption;
  const searchable = normalizeTrafficText(
    `${title} ${message ?? ""} ${severity ?? ""} ${cause ?? ""} ${status ?? ""}`,
  );

  return RED_TRAFFIC_KEYWORDS.some((needle) => searchable.includes(needle))
    ? "red"
    : "orange";
}

export function getDisruptionIcon(disruption: TrafficDisruption): string {
  return getDisruptionTone(disruption) === "red" ? "x" : "!";
}

export function formatTrafficDisruptionPeriod(
  disruption: TrafficDisruption,
): string {
  const period = getTrafficDisruptionDisplayPeriod(disruption);

  if (!period) {
    return "";
  }

  const begin = formatTrafficDate(period.begin);
  const end = formatTrafficDate(period.end);

  if (begin && end) {
    return `${begin} -> ${end}`;
  }

  return begin ? `A partir du ${begin}` : `Jusqu'au ${end}`;
}

export function formatTrafficDate(value?: string): string {
  if (!value) {
    return "";
  }

  const date = parseTrafficDate(value);

  return !date || Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function normalizeTrafficText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
