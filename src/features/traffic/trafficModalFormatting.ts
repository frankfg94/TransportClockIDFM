import {
  getTrafficDisruptionTextDateSets,
  getTrafficTitleWithoutLinePrefix,
} from "./trafficTiming";
import { normalizeTrafficText } from "./trafficPresentation";
import type { TrafficDisruption } from "./types";

export interface TrafficModalClockTime {
  hour: number;
  minute: number;
}

export interface TrafficModalTimeWindow {
  start: TrafficModalClockTime;
  end?: TrafficModalClockTime;
  untilEndOfService?: boolean;
}

export interface TrafficModalDateTilePeriod {
  start?: Date;
  end?: Date;
  endLabel?: string;
}

export interface TrafficModalDateTile {
  id: string;
  title: string;
  start?: Date;
  end?: Date;
  endLabel?: string;
  periods: TrafficModalDateTilePeriod[];
  evening: boolean;
  replacementBus: boolean;
  timeWindows: TrafficModalTimeWindow[];
}

export function extractTrafficModalDateTiles(
  disruption: TrafficDisruption,
  fallbackTitle?: string,
): TrafficModalDateTile[] {
  const normalizedFallbackTitle = fallbackTitle
    ? getTrafficTitleWithoutLinePrefix(fallbackTitle)
    : undefined;
  const fallbackTileTitle = getFallbackTileTitle(disruption, normalizedFallbackTitle);
  const endOnlyTileTitle = normalizedFallbackTitle || fallbackTileTitle;

  const candidates = getTrafficDisruptionTextDateSets(disruption).map((dateSet) => {
    const start = dateSet.explicitStart ? dateSet.start : undefined;
    const title =
      dateSet.titleHint ??
      (dateSet.kind === "range" ? fallbackTileTitle : endOnlyTileTitle);

    return {
      mergeKey: dateSet.titleHint ? normalizeTrafficText(title) : undefined,
      tile: {
        id: dateSet.id,
        title,
        start,
        end: dateSet.end,
        endLabel: dateSet.endLabel,
        periods: [
          {
            start,
            end: dateSet.end,
            endLabel: dateSet.endLabel,
          },
        ],
        evening: dateSet.evening,
        replacementBus: hasReplacementBus(dateSet.sourceText),
        timeWindows: dateSet.explicitStart
          ? extractTrafficModalTimeWindows(dateSet.sourceText)
          : [],
      } satisfies TrafficModalDateTile,
    };
  });

  return mergeEquivalentTrafficModalDateTiles(candidates);
}

function mergeEquivalentTrafficModalDateTiles(
  candidates: Array<{
    mergeKey?: string;
    tile: TrafficModalDateTile;
  }>,
): TrafficModalDateTile[] {
  const merged: Array<{
    mergeKey?: string;
    tile: TrafficModalDateTile;
  }> = [];

  candidates.forEach((candidate) => {
    const existing = candidate.mergeKey
      ? merged.find(
          (entry) =>
            entry.mergeKey === candidate.mergeKey &&
            entry.tile.evening === candidate.tile.evening &&
            entry.tile.replacementBus === candidate.tile.replacementBus,
        )
      : undefined;

    if (!existing) {
      merged.push({
        mergeKey: candidate.mergeKey,
        tile: {
          ...candidate.tile,
          periods: [...candidate.tile.periods],
          timeWindows: [...candidate.tile.timeWindows],
        },
      });
      return;
    }

    candidate.tile.periods.forEach((period) => {
      const duplicate = existing.tile.periods.some(
        (current) =>
          current.start?.getTime() === period.start?.getTime() &&
          current.end?.getTime() === period.end?.getTime() &&
          current.endLabel === period.endLabel,
      );
      if (!duplicate) existing.tile.periods.push(period);
    });
    candidate.tile.timeWindows.forEach((window) =>
      pushTrafficModalTimeWindow(existing.tile.timeWindows, window),
    );
    existing.tile.id += "|" + candidate.tile.id;
  });

  return merged.map((entry) => entry.tile);
}
function getFallbackTileTitle(disruption: TrafficDisruption, fallbackTitle?: string): string {
  const rawTitle = getTrafficTitleWithoutLinePrefix(disruption.title);
  const normalizedTitle = normalizeTrafficText(rawTitle);
  const normalizedFallbackTitle = fallbackTitle
    ? normalizeTrafficText(fallbackTitle)
    : undefined;
  const isRawTitleStatusVariant = Boolean(
    normalizedFallbackTitle && normalizedTitle.startsWith(normalizedFallbackTitle + " - "),
  );
  const isGenericTitle =
    /^(?:information trafic|trafic (?:interrompu|perturbe|ralenti)|travaux)$/u.test(
      normalizedTitle,
    );

  return !isGenericTitle && !isRawTitleStatusVariant && rawTitle.length <= 100
    ? rawTitle
    : fallbackTitle || rawTitle;
}

function hasReplacementBus(value: string): boolean {
  return /\b(?:bus|navette)s?\s+(?:de\s+)?remplacement\b/iu.test(value);
}

function extractTrafficModalTimeWindows(value: string): TrafficModalTimeWindow[] {
  const normalized = normalizeTrafficText(value);
  const windows: TrafficModalTimeWindow[] = [];
  const rangePattern =
    /\b(?:de|entre)\s+(\d{1,2})\s*h\s*(\d{0,2})\s*(?:a|et|[-–])\s*(?:(\d{1,2})\s*h\s*(\d{0,2})|fin\s+de\s+service)\b/gu;

  for (const match of normalized.matchAll(rangePattern)) {
    const start = createClockTime(match[1], match[2]);
    if (!start) continue;

    const end = match[3] ? createClockTime(match[3], match[4]) : undefined;
    pushTrafficModalTimeWindow(windows, {
      start,
      end,
      untilEndOfService: !match[3],
    });
  }

  const fromPattern = /\b(?:a\s+partir\s+de|des)\s+(\d{1,2})\s*h\s*(\d{0,2})\b/gu;
  for (const match of normalized.matchAll(fromPattern)) {
    const start = createClockTime(match[1], match[2]);
    if (!start || windows.some((window) => sameClock(window.start, start))) {
      continue;
    }

    pushTrafficModalTimeWindow(windows, { start });
  }

  return windows;
}

function pushTrafficModalTimeWindow(
  windows: TrafficModalTimeWindow[],
  candidate: TrafficModalTimeWindow,
): void {
  const duplicate = windows.some(
    (window) =>
      sameClock(window.start, candidate.start) &&
      ((!window.end && !candidate.end) ||
        (window.end && candidate.end && sameClock(window.end, candidate.end))) &&
      Boolean(window.untilEndOfService) === Boolean(candidate.untilEndOfService),
  );

  if (!duplicate) {
    windows.push(candidate);
  }
}
function createClockTime(hourText: string, minuteText = ""): TrafficModalClockTime | undefined {
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText || "0", 10);

  return Number.isFinite(hour) &&
    Number.isFinite(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
    ? { hour, minute }
    : undefined;
}

function sameClock(left: TrafficModalClockTime, right: TrafficModalClockTime): boolean {
  return left.hour === right.hour && left.minute === right.minute;
}
