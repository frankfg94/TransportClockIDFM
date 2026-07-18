import { normalizeTrafficText } from "./trafficPresentation";
import type { TrafficDisruption } from "./types";

export interface TrafficClockTime {
  hour: number;
  minute: number;
  label: string;
}
export function getTrafficClockMinuteOfDay(clock: TrafficClockTime): number {
  return clock.hour * 60 + clock.minute;
}


export function getTrafficDisruptionStartClockTime(
  disruption: TrafficDisruption,
): TrafficClockTime | undefined {
  const text = normalizeTrafficText(
    `${disruption.title} ${disruption.message ?? ""}`,
  );
  const match = text.match(
    /\b(?:a partir de|des|de)\s+(\d{1,2})\s*h\s*(\d{2})?\b/u,
  );

  return match ? createTrafficClockTime(match[1], match[2]) : undefined;
}

export function getTrafficDisruptionRestartClockTime(
  disruption: TrafficDisruption,
): TrafficClockTime | undefined {
  const text = normalizeTrafficText(
    `${disruption.title} ${disruption.message ?? ""} ${disruption.severity ?? ""}`,
  );
  const match = text.match(
    /(?:(?:reprise|retablissement|retour a la normale|fin)\s+(?:estimee|prevue)?\s*(?::|a|vers|pour)?\s*|jusqu(?:['?]\s*|\s*)a\s+)(minuit|midi|\d{1,2}(?::|h)\d{2}|\d{1,2}h)\b/u,
  );

  if (!match) return undefined;
  if (match[1] === "minuit") return createTrafficClockTime("0", "0");
  if (match[1] === "midi") return createTrafficClockTime("12", "0");

  const [hour, minute] = match[1].replace("h", ":").split(":");
  return createTrafficClockTime(hour, minute);
}

function createTrafficClockTime(
  hourText: string,
  minuteText = "0",
): TrafficClockTime | undefined {
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText || "0", 10);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return undefined;
  }

  return {
    hour,
    minute,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}
