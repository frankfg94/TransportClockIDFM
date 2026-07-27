import { getPatternTrafficSummaryCopy } from "../service-pattern/trafficCalendarSummary";
import { extractTrafficModalDateTiles } from "./trafficModalFormatting";
import { normalizeTrafficText } from "./trafficPresentation";
import type { TrafficDisruption, TrafficPeriod } from "./types";

export function mergeEquivalentTrafficDisruptions(
  disruptions: TrafficDisruption[],
): TrafficDisruption[] {
  const merged = new Map<string, TrafficDisruption>();

  disruptions.forEach((disruption, index) => {
    const identity = getTrafficDisruptionPresentationIdentity(disruption);
    const key = identity ?? `unique:${disruption.id}:${index}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, disruption);
      return;
    }

    merged.set(key, mergeTrafficDisruption(existing, disruption));
  });

  return Array.from(merged.values());
}

function getTrafficDisruptionPresentationIdentity(
  disruption: TrafficDisruption,
): string | undefined {
  const summary = getPatternTrafficSummaryCopy(disruption);
  const alertTitle = normalizeIdentityPart(summary.title ?? disruption.title);
  const tiles = extractTrafficModalDateTiles(disruption, summary.title);
  const eventNames = Array.from(
    new Set(tiles.map((tile) => normalizeIdentityPart(tile.title)).filter(Boolean)),
  ).sort();
  const periods = Array.from(
    new Set(
      tiles.flatMap((tile) =>
        tile.periods.map((period) =>
          [
            period.start?.getTime() ?? "",
            period.end?.getTime() ?? "",
            normalizeIdentityPart(period.endLabel ?? ""),
          ].join(":"),
        ),
      ),
    ),
  ).sort();

  if (!alertTitle || eventNames.length === 0 || periods.length === 0) {
    return undefined;
  }

  return [alertTitle, eventNames.join(","), periods.join(",")].join("|");
}

function mergeTrafficDisruption(
  left: TrafficDisruption,
  right: TrafficDisruption,
): TrafficDisruption {
  return {
    ...left,
    title: pickRicherText(left.title, right.title) ?? left.title,
    message: pickRicherText(left.message, right.message),
    motif: pickRicherText(left.motif, right.motif),
    cause: pickRicherText(left.cause, right.cause),
    severity: pickRicherText(left.severity, right.severity),
    status: pickRicherText(left.status, right.status),
    updatedAt: pickLatestTimestamp(left.updatedAt, right.updatedAt),
    applicationPeriods: mergeTrafficPeriods(
      left.applicationPeriods,
      right.applicationPeriods,
    ),
    impactedLineRefs: mergeStrings(
      left.impactedLineRefs,
      right.impactedLineRefs,
    ),
    impactedStopNames: mergeStrings(
      left.impactedStopNames,
      right.impactedStopNames,
    ),
  };
}

function normalizeIdentityPart(value: string): string {
  return normalizeTrafficText(value)
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function pickRicherText(
  left?: string,
  right?: string,
): string | undefined {
  if (!left) return right;
  if (!right) return left;

  return normalizeTrafficText(right).length > normalizeTrafficText(left).length
    ? right
    : left;
}

function pickLatestTimestamp(
  left?: string,
  right?: string,
): string | undefined {
  if (!left) return right;
  if (!right) return left;

  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return pickRicherText(left, right);
  }

  return rightTime > leftTime ? right : left;
}

function mergeTrafficPeriods(
  left: TrafficPeriod[],
  right: TrafficPeriod[],
): TrafficPeriod[] {
  const periods = new Map<string, TrafficPeriod>();

  [...left, ...right].forEach((period) => {
    periods.set(`${period.begin}|${period.end}`, period);
  });

  return Array.from(periods.values());
}

function mergeStrings(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right]));
}
