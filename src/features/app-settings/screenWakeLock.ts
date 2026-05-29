import type { WakeLockDuration } from "./appSettings";
import { getWakeLockDurationMs } from "./appSettings";

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (
    type: "release",
    listener: () => void,
    options?: AddEventListenerOptions,
  ) => void;
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

let alarmWakeLock: WakeLockSentinelLike | undefined;
let alarmWakeLockTimer: number | undefined;

export async function requestScreenWakeLock(): Promise<WakeLockSentinelLike | undefined> {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  const wakeLock = (navigator as WakeLockNavigator).wakeLock;

  if (!wakeLock) {
    return undefined;
  }

  try {
    return await wakeLock.request("screen");
  } catch (error) {
    console.warn("[wake-lock] Unable to request screen wake lock", error);
    return undefined;
  }
}

export async function requestTemporaryAlarmWakeLock(
  duration: WakeLockDuration = "1m",
): Promise<void> {
  const timeoutMs = getWakeLockDurationMs(duration);

  if (timeoutMs === 0) {
    return;
  }

  await releaseTemporaryAlarmWakeLock();
  alarmWakeLock = await requestScreenWakeLock();

  if (alarmWakeLock && typeof timeoutMs === "number") {
    alarmWakeLockTimer = window.setTimeout(() => {
      void releaseTemporaryAlarmWakeLock();
    }, timeoutMs);
  }
}

export async function releaseTemporaryAlarmWakeLock(): Promise<void> {
  if (alarmWakeLockTimer) {
    window.clearTimeout(alarmWakeLockTimer);
    alarmWakeLockTimer = undefined;
  }

  if (alarmWakeLock && !alarmWakeLock.released) {
    await alarmWakeLock.release().catch(() => undefined);
  }

  alarmWakeLock = undefined;
}
