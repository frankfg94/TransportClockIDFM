import { getDisruptionTone, type TrafficTone } from "../traffic/trafficPresentation";
import { parseTrafficDate } from "../traffic/trafficTiming";
import type { TrafficDisruption, TrafficPeriod } from "../traffic/types";
import {
  analyzeTrafficImpacts,
  type PatternTrafficEdge,
  type PatternTrafficImpactAnalysis,
  type PatternTrafficStation,
} from "./trafficImpactAnalysis";

export type PatternTrafficTimelineSeverity = "low" | "medium" | "high";

export interface PatternTrafficTimelineDisruption {
  disruption: TrafficDisruption;
  period: TrafficPeriod;
  start: Date;
  end?: Date;
  impactAnalysis: PatternTrafficImpactAnalysis;
  impactedStationCount: number;
  interruptedSegmentCount: number;
  durationMinutes?: number;
  tone: TrafficTone;
}

export interface PatternTrafficTimelineItem {
  id: string;
  dateKey: string;
  start: Date;
  end?: Date;
  disruptions: PatternTrafficTimelineDisruption[];
  impactedStationCount: number;
  interruptedSegmentCount: number;
  durationMinutes?: number;
  severity: PatternTrafficTimelineSeverity;
  tone: TrafficTone;
}

const MINUTE_MS = 60 * 1000;

export function createPatternTrafficTimelineItems(
  disruptions: TrafficDisruption[],
  stations: PatternTrafficStation[],
  edges: PatternTrafficEdge[],
  now = Date.now(),
): PatternTrafficTimelineItem[] {
  const futureDisruptions = disruptions.flatMap((disruption) =>
    createFutureTimelineDisruptions(disruption, stations, edges, now),
  );
  const groups = new Map<string, PatternTrafficTimelineDisruption[]>();

  futureDisruptions.forEach((item) => {
    const key = getLocalDateKey(item.start);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  });

  return Array.from(groups.entries())
    .map(([dateKey, group]) => createTimelineItem(dateKey, group))
    .sort((left, right) => left.start.getTime() - right.start.getTime());
}

export function getDaysUntilTrafficTimelineItem(
  item: PatternTrafficTimelineItem,
  now = Date.now(),
): number {
  return Math.max(0, Math.ceil((item.start.getTime() - now) / (24 * 60 * MINUTE_MS)));
}

function createFutureTimelineDisruptions(
  disruption: TrafficDisruption,
  stations: PatternTrafficStation[],
  edges: PatternTrafficEdge[],
  now: number,
): PatternTrafficTimelineDisruption[] {
  return disruption.applicationPeriods.flatMap((period) => {
      const start = parseTrafficDate(period.begin);

      if (!start || Number.isNaN(start.getTime()) || start.getTime() <= now) {
        return [];
      }

      const end = parseTrafficDate(period.end);
      const impactAnalysis = analyzeTrafficImpacts([disruption], stations, edges);
      const impactedStationCount = getImpactedStationCount(
        disruption,
        impactAnalysis,
      );
      const interruptedSegmentCount = impactAnalysis.segments.filter(
        (segment) => segment.kind === "interruption",
      ).length;
      const durationMinutes =
        end && !Number.isNaN(end.getTime()) && end.getTime() > start.getTime()
          ? Math.round((end.getTime() - start.getTime()) / MINUTE_MS)
          : undefined;
      const item: PatternTrafficTimelineDisruption = {
        disruption,
        period,
        start,
        impactAnalysis,
        impactedStationCount,
        interruptedSegmentCount,
        tone: getDisruptionTone(disruption),
      };

      if (end && !Number.isNaN(end.getTime())) {
        item.end = end;
      }

      if (durationMinutes !== undefined) {
        item.durationMinutes = durationMinutes;
      }

      return [item];
    });
}

function createTimelineItem(
  dateKey: string,
  group: PatternTrafficTimelineDisruption[],
): PatternTrafficTimelineItem {
  const sortedGroup = [...group].sort(
    (left, right) => left.start.getTime() - right.start.getTime(),
  );
  const start = sortedGroup[0]?.start ?? new Date(0);
  const end = sortedGroup
    .map((item) => item.end)
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => right.getTime() - left.getTime())
    .at(0);
  const impactedStationKeys = new Set<string>();
  let fallbackImpactedStations = 0;

  sortedGroup.forEach((item) => {
    Object.keys(item.impactAnalysis.stationImpacts).forEach((stationKey) => {
      impactedStationKeys.add(stationKey);
    });
    fallbackImpactedStations = Math.max(
      fallbackImpactedStations,
      item.impactedStationCount,
    );
  });

  const impactedStationCount = Math.max(
    impactedStationKeys.size,
    fallbackImpactedStations,
  );
  const interruptedSegmentCount = sortedGroup.reduce(
    (sum, item) => sum + item.interruptedSegmentCount,
    0,
  );
  const durationMinutes = sortedGroup.reduce<number | undefined>(
    (maxDuration, item) =>
      item.durationMinutes === undefined
        ? maxDuration
        : Math.max(maxDuration ?? 0, item.durationMinutes),
    undefined,
  );
  const tone = sortedGroup.some((item) => item.tone === "red")
    ? "red"
    : "orange";

  const item: PatternTrafficTimelineItem = {
    id: `traffic-timeline:${dateKey}`,
    dateKey,
    start,
    disruptions: sortedGroup,
    impactedStationCount,
    interruptedSegmentCount,
    severity: getTimelineSeverity(impactedStationCount, durationMinutes),
    tone,
  };

  if (end) {
    item.end = end;
  }

  if (durationMinutes !== undefined) {
    item.durationMinutes = durationMinutes;
  }

  return item;
}

function getImpactedStationCount(
  disruption: TrafficDisruption,
  analysis: PatternTrafficImpactAnalysis,
): number {
  const stationImpactCount = Object.keys(analysis.stationImpacts).length;

  return Math.max(stationImpactCount, disruption.impactedStopNames.length);
}

function getTimelineSeverity(
  impactedStationCount: number,
  durationMinutes?: number,
): PatternTrafficTimelineSeverity {
  const durationHours = durationMinutes === undefined ? 0 : durationMinutes / 60;

  if (impactedStationCount >= 8 || durationHours >= 48) {
    return "high";
  }

  if (impactedStationCount >= 4 || durationHours >= 12) {
    return "medium";
  }

  return "low";
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
