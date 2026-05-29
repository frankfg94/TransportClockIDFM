import type { TrafficDisruption } from "./types";

export type TrafficTimingTab = "current" | "upcoming";

export function getCurrentTrafficDisruptions(
  disruptions: TrafficDisruption[],
): TrafficDisruption[] {
  return disruptions.filter(
    (disruption) => getTrafficDisruptionTiming(disruption) === "current",
  );
}

export function getUpcomingTrafficDisruptions(
  disruptions: TrafficDisruption[],
): TrafficDisruption[] {
  return disruptions.filter(
    (disruption) => getTrafficDisruptionTiming(disruption) === "upcoming",
  );
}

export function getTrafficDisruptionTiming(
  disruption: TrafficDisruption,
): TrafficTimingTab | "expired" {
  const period = disruption.applicationPeriods[0];

  if (!period) {
    return "current";
  }

  const now = Date.now();
  const begin = parseTrafficDate(period.begin)?.getTime();
  const end = parseTrafficDate(period.end)?.getTime();

  if (typeof begin === "number" && begin > now) {
    return "upcoming";
  }

  if (typeof end === "number" && end < now) {
    return "expired";
  }

  return "current";
}

export function parseTrafficDate(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const compactDate = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/u,
  );

  if (compactDate) {
    const [, year, month, day, hour, minute, second] = compactDate;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
}
