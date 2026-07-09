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
  target: BoardTrafficAlertTarget;
  tone: BoardTrafficAlertTone;
}

export interface BoardTrafficAlertTarget {
  alertId: string;
  lineRef: string;
  trafficTab: "current" | "upcoming";
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

interface BoardScheduledTrafficInterruption {
  disruption: TrafficLineReport["disruptions"][number];
  scheduled: ScheduledTrafficInterruption;
}

interface BoardUpcomingTrafficInterruption {
  disruption: TrafficLineReport["disruptions"][number];
  start: Date;
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
    const disruption = currentDisruptions.find(
      (item) => getDisruptionTone(item) === "red",
    );

    if (!disruption) {
      return undefined;
    }

    return {
      label: options.messages.interruption,
      target: createBoardTrafficAlertTarget(
        report.lineRef,
        disruption.id,
        "current",
      ),
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
      target: createBoardTrafficAlertTarget(
        report.lineRef,
        activeScheduledInterruption.disruption.id,
        "upcoming",
      ),
      tone: "red",
    };
  }

  const upcomingScheduledInterruption = getTodayScheduledBoardInterruption(
    report.disruptions,
    now,
    false,
  );

  if (upcomingScheduledInterruption) {
    const time = formatBoardTrafficStartTime(
      upcomingScheduledInterruption.scheduled.start,
    );

    return {
      label: hasCurrentDisruption
        ? options.messages.disruptionAndInterruptionAt(time)
        : options.messages.interruptionAt(time),
      target: createBoardTrafficAlertTarget(
        report.lineRef,
        upcomingScheduledInterruption.disruption.id,
        "upcoming",
      ),
      tone: "upcoming",
    };
  }

  if (hasCurrentDisruption) {
    const disruption = currentDisruptions[0];

    if (!disruption) {
      return undefined;
    }

    return {
      label: options.messages.disruption,
      target: createBoardTrafficAlertTarget(
        report.lineRef,
        disruption.id,
        "current",
      ),
      tone: "orange",
    };
  }

  const upcomingInterruption = getNextBoardUpcomingInterruption(
    report.disruptions,
    now,
    options.lookaheadDays,
  );

  return upcomingInterruption
    ? {
        label: formatUpcomingBoardInterruptionLabel(
          upcomingInterruption.start,
          now,
          options.messages,
        ),
        target: createBoardTrafficAlertTarget(
          report.lineRef,
          upcomingInterruption.disruption.id,
          "upcoming",
        ),
        tone: "upcoming",
      }
    : undefined;
}

function getTodayScheduledBoardInterruption(
  disruptions: TrafficLineReport["disruptions"],
  now: number,
  active: boolean,
): BoardScheduledTrafficInterruption | undefined {
  return disruptions
    .filter((disruption) => getDisruptionTone(disruption) === "red")
    .map((disruption) => {
      const scheduled = getTodayScheduledTrafficInterruption(disruption, now);

      return scheduled ? { disruption, scheduled } : undefined;
    })
    .filter(
      (
        scheduled,
      ): scheduled is BoardScheduledTrafficInterruption =>
        scheduled !== undefined && scheduled.scheduled.active === active,
    )
    .sort(
      (left, right) =>
        left.scheduled.start.getTime() - right.scheduled.start.getTime(),
    )
    .at(0);
}

function getNextBoardUpcomingInterruption(
  disruptions: TrafficLineReport["disruptions"],
  now: number,
  lookaheadDays: number,
): BoardUpcomingTrafficInterruption | undefined {
  return disruptions
    .filter((disruption) => getDisruptionTone(disruption) === "red")
    .map((disruption) => {
      const start = getUpcomingTrafficWarningStart(
        disruption,
        now,
        lookaheadDays,
      );

      return start ? { disruption, start } : undefined;
    })
    .filter(
      (
        interruption,
      ): interruption is BoardUpcomingTrafficInterruption =>
        interruption !== undefined,
    )
    .sort((left, right) => left.start.getTime() - right.start.getTime())
    .at(0);
}

function createBoardTrafficAlertTarget(
  lineRef: string,
  alertId: string,
  trafficTab: BoardTrafficAlertTarget["trafficTab"],
): BoardTrafficAlertTarget {
  return {
    alertId,
    lineRef,
    trafficTab,
  };
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
