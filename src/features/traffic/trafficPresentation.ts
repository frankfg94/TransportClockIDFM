import type { TrafficDisruption } from "./types";

export type TrafficTone = "orange" | "red";
export type TrafficAlertSymbol = "!" | "x";

export interface TrafficAlertPresentation {
  label: "Perturbation" | "Interruption";
  symbol: TrafficAlertSymbol;
  tone: TrafficTone;
}

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
  "non desservi",
  "pas desservi",
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

export function getTrafficDisruptionsTone(
  disruptions: TrafficDisruption[],
): TrafficTone | undefined {
  if (disruptions.length === 0) {
    return undefined;
  }

  return disruptions.some((disruption) => getDisruptionTone(disruption) === "red")
    ? "red"
    : "orange";
}

export function getTrafficAlertPresentation(
  disruptions: TrafficDisruption[],
): TrafficAlertPresentation | undefined {
  const tone = getTrafficDisruptionsTone(disruptions);

  if (!tone) {
    return undefined;
  }

  return tone === "red"
    ? { label: "Interruption", symbol: "x", tone }
    : { label: "Perturbation", symbol: "!", tone };
}

export function normalizeTrafficText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
