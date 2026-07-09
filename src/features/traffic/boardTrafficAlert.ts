import { getDisruptionTone } from "./trafficPresentation";
import {
  getCurrentTrafficDisruptions,
  getUpcomingTrafficWarningStart,
} from "./trafficTiming";
import {
  getTodayScheduledTrafficInterruption,
  type ScheduledTrafficInterruption,
} from "./trafficScheduledWarnings";
import type { TrafficLineReport } from "./types";

export type BoardTrafficAlertTone = "orange" | "red" | "upcoming";

export interface BoardTrafficAlert {
  label: string;
  tone: BoardTrafficAlertTone;
}

export interface BoardTrafficAlertMessages {
  disruption: string;
  disruptionAndInterruptionAt: (time: string) => string;
  interruption: string;
  interruptionAt: (time: string) => string;
  interruptionInDay: (count: number) => string;
  interruptionInDays: (count: number) => string;
  interruptionToday: string;
}

export interface BoardTrafficAlertOptions {
  lookaheadDays: number;
  messages: BoardTrafficAlertMessages;
  now?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function getBoardTrafficAlertForReport(
  report: TrafficLineReport,
  options: BoardTrafficAlertOptions,
): BoardTrafficAlert | undefined {
  if (["unknown", "error"].includes(report.status)) {
    return undefined;
  }

  const now = options.now ?? Date.now();
  const currentDisruptions = getCurrentTrafficDisruptions(
    report.disruptions,
    now,
  );
  const hasCurrentDisruption =
    currentDisruptions.length > 0 && report.status !== "normal";

  if (
    currentDisruptions.some((disruption) => getDisruptionTone(disruption) === "red")
  ) {
    return {
      label: options.messages.interruption,
      tone: "red",
    };
  }

  const activeScheduledInterruption = getTodayScheduledBoardInterruption(
    report.disruptions,
    now,
    true,
  );

  if (activeScheduledInterruption) {
    return {
      label: options.messages.interruption,
      tone: "red",
    };
  }

  const upcomingScheduledInterruption = getTodayScheduledBoardInterruption(
    report.disruptions,
    now,
    false,
  );

  if (upcomingScheduledInterruption) {
    const time = formatBoardTrafficStartTime(upcomingScheduledInterruption.start);

    return {
      label: hasCurrentDisruption
        ? options.messages.disruptionAndInterruptionAt(time)
        : options.messages.interruptionAt(time),
      tone: "upcoming",
    };
  }

  if (hasCurrentDisruption) {
    return {
      label: options.messages.disruption,
      tone: "orange",
    };
  }

  const upcomingInterruptionStart = getNextBoardUpcomingInterruptionStart(
    report.disruptions,
    now,
    options.lookaheadDays,
  );

  return upcomingInterruptionStart
    ? {
        label: formatUpcomingBoardInterruptionLabel(
          upcomingInterruptionStart,
          now,
          options.messages,
        ),
        tone: "upcoming",
      }
    : undefined;
}

function getTodayScheduledBoardInterruption(
  disruptions: TrafficLineReport["disruptions"],
  now: number,
  active: boolean,
): ScheduledTrafficInterruption | undefined {
  return disruptions
    .filter((disruption) => getDisruptionTone(disruption) === "red")
    .map((disruption) => getTodayScheduledTrafficInterruption(disruption, now))
    .filter(
      (scheduled): scheduled is ScheduledTrafficInterruption =>
        scheduled !== undefined && scheduled.active === active,
    )
    .sort((left, right) => left.start.getTime() - right.start.getTime())
    .at(0);
}

function getNextBoardUpcomingInterruptionStart(
  disruptions: TrafficLineReport["disruptions"],
  now: number,
  lookaheadDays: number,
): Date | undefined {
  return disruptions
    .filter((disruption) => getDisruptionTone(disruption) === "red")
    .map((disruption) =>
      getUpcomingTrafficWarningStart(disruption, now, lookaheadDays),
    )
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => left.getTime() - right.getTime())
    .at(0);
}

function formatUpcomingBoardInterruptionLabel(
  start: Date,
  now: number,
  messages: BoardTrafficAlertMessages,
): string {
  const days = Math.max(0, Math.ceil((start.getTime() - now) / DAY_MS));

  if (days <= 0) {
    return messages.interruptionToday;
  }

  return days > 1
    ? messages.interruptionInDays(days)
    : messages.interruptionInDay(days);
}

function formatBoardTrafficStartTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${hours}h${minutes}`;
}
