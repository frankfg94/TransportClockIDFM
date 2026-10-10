import { Capacitor, registerPlugin } from "@capacitor/core";
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

interface NativeScreenWakeLockPlugin {
  setEnabled(options: { enabled: boolean }): Promise<void>;
}

const NativeScreenWakeLock =
  registerPlugin<NativeScreenWakeLockPlugin>("ScreenWakeLock");

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

/**
 * Keeps a mounted fullscreen station panel awake. Android Capacitor uses the
 * native window flag; browser platforms use the Screen Wake Lock API.
 */
export function createFullscreenPanelWakeLockController(): {
  setEnabled: (enabled: boolean) => Promise<void>;
  dispose: () => Promise<void>;
} {
  let enabled = false;
  let disposed = false;
  let webWakeLock: WakeLockSentinelLike | undefined;
  let syncQueue = Promise.resolve();

  async function releaseWebWakeLock(): Promise<void> {
    if (webWakeLock && !webWakeLock.released) {
      await webWakeLock.release().catch(() => undefined);
    }

    webWakeLock = undefined;
  }

  function sync(): Promise<void> {
    const requestedEnabled = enabled;

    syncQueue = syncQueue.catch(() => undefined).then(async () => {
      const shouldKeepScreenOn =
        requestedEnabled && !disposed && document.visibilityState === "visible";

      if (Capacitor.getPlatform() === "android") {
        try {
          await NativeScreenWakeLock.setEnabled({ enabled: shouldKeepScreenOn });
          await releaseWebWakeLock();
          return;
        } catch (error) {
          console.warn("[wake-lock] Unable to use native screen wake lock", error);
        }
      }

      if (!shouldKeepScreenOn) {
        await releaseWebWakeLock();
        return;
      }

      if (!webWakeLock || webWakeLock.released) {
        webWakeLock = await requestScreenWakeLock();
      }
    });

    return syncQueue;
  }

  return {
    setEnabled(nextEnabled: boolean): Promise<void> {
      enabled = nextEnabled;
      return sync();
    },
    dispose(): Promise<void> {
      disposed = true;
      enabled = false;
      return sync();
    },
  };
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
