import { App } from "@capacitor/app";
import {
  Capacitor,
  type PermissionState,
  type PluginListenerHandle,
} from "@capacitor/core";
import {
  LocalNotifications,
  type DeliveredNotificationSchema,
  type PendingLocalNotificationSchema,
} from "@capacitor/local-notifications";
import type { DepartureAlarm } from "../types/transit";

/**
 * Unique runtime entry point for departure alarms.
 *
 * This file owns platform detection, permissions, scheduling, cancellation,
 * reconciliation, native listeners, Web notifications, Web timers and Web
 * audio. UI state and persisted alarm data intentionally remain outside it.
 */
export const DEPARTURE_ALARM_CHANNEL_ID =
  "transport-departure-alarms-v1";
export const DEPARTURE_ALARM_SOUND_FILE =
  "transport_departure_alarm.wav";

export interface DepartureAlarmNotificationCopy {
  title: string;
  body: string;
}

export interface DepartureAlarmCapability {
  display: PermissionState;
  exactAlarm: PermissionState;
  ready: boolean;
}

export interface DepartureAlarmRuntimeHandlers {
  onAlarmDelivered: (
    alarmId: string,
  ) => boolean | void | Promise<boolean | void>;
  onAlarmAction: (alarmId: string) => void | Promise<void>;
  onResume: () => void | Promise<void>;
}

export interface DepartureAlarmSyncResult {
  expiredAlarmIds: string[];
  deliveredAlarmIds: string[];
}

const listenerHandles: PluginListenerHandle[] = [];
const webAlarmTimers = new Map<string, number>();
let runtimeHandlers: DepartureAlarmRuntimeHandlers | undefined;
let activeWebAlarmAudio:
  | {
      audioContext: AudioContext;
      closeTimer?: number;
    }
  | undefined;

export function isNativeDepartureAlarmPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function getDepartureAlarmCapability(): Promise<DepartureAlarmCapability> {
  if (!isNativeDepartureAlarmPlatform()) {
    return {
      display: getWebNotificationPermission(),
      exactAlarm: "granted",
      ready: true,
    };
  }

  const [notificationPermission, exactAlarmPermission] = await Promise.all([
    LocalNotifications.checkPermissions(),
    LocalNotifications.checkExactNotificationSetting(),
  ]);

  return {
    display: notificationPermission.display,
    exactAlarm: exactAlarmPermission.exact_alarm,
    ready:
      notificationPermission.display === "granted" &&
      exactAlarmPermission.exact_alarm === "granted",
  };
}

export async function requestDepartureAlarmPermissions(): Promise<DepartureAlarmCapability> {
  if (!isNativeDepartureAlarmPlatform()) {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      await Notification.requestPermission();
    }

    return getDepartureAlarmCapability();
  }

  const currentNotificationPermission =
    await LocalNotifications.checkPermissions();

  if (currentNotificationPermission.display !== "granted") {
    await LocalNotifications.requestPermissions();
  }

  const currentExactAlarmPermission =
    await LocalNotifications.checkExactNotificationSetting();

  if (currentExactAlarmPermission.exact_alarm !== "granted") {
    await LocalNotifications.changeExactNotificationSetting();
  }

  return getDepartureAlarmCapability();
}

export async function initializeDepartureAlarmRuntime(
  handlers: DepartureAlarmRuntimeHandlers,
): Promise<() => Promise<void>> {
  await disposeNativeDepartureAlarmListeners();
  runtimeHandlers = handlers;

  if (!isNativeDepartureAlarmPlatform()) {
    return disposeDepartureAlarmRuntime;
  }

  listenerHandles.push(
    await LocalNotifications.addListener(
      "localNotificationReceived",
      async (notification) => {
        const alarmId = readAlarmId(notification.extra);

        if (alarmId) {
          await handlers.onAlarmDelivered(alarmId);
        }
      },
    ),
    await LocalNotifications.addListener(
      "localNotificationActionPerformed",
      async ({ notification }) => {
        await LocalNotifications.removeDeliveredNotifications({
          notifications: [
            {
              id: notification.id,
              title: notification.title,
              body: notification.body,
            },
          ],
        });

        const alarmId = readAlarmId(notification.extra);
        if (alarmId) {
          await handlers.onAlarmAction(alarmId);
        }
      },
    ),
    await App.addListener("appStateChange", async ({ isActive }) => {
      if (isActive) {
        await handlers.onResume();
      }
    }),
  );

  return disposeDepartureAlarmRuntime;
}

export async function scheduleDepartureAlarm(
  alarm: DepartureAlarm,
  copy: DepartureAlarmNotificationCopy,
): Promise<void> {
  const alarmDate = new Date(alarm.alarmTime);
  if (!Number.isFinite(alarmDate.getTime()) || alarmDate.getTime() <= Date.now()) {
    throw new Error("departure-alarm-time-passed");
  }

  if (!isNativeDepartureAlarmPlatform()) {
    return;
  }

  const capability = await getDepartureAlarmCapability();
  if (!capability.ready) {
    throw new Error("departure-alarm-permission-required");
  }

  await LocalNotifications.schedule({
    notifications: [
      {
        id: alarm.nativeNotificationId,
        title: copy.title,
        body: copy.body,
        largeBody: copy.body,
        channelId: DEPARTURE_ALARM_CHANNEL_ID,
        sound: DEPARTURE_ALARM_SOUND_FILE,
        autoCancel: true,
        schedule: {
          at: alarmDate,
          allowWhileIdle: true,
        },
        extra: {
          alarmId: alarm.id,
          boardId: alarm.boardId,
          departureId: alarm.departureId,
        },
      },
    ],
  });
}

export async function cancelDepartureAlarm(
  alarm: DepartureAlarm,
): Promise<void> {
  if (!isNativeDepartureAlarmPlatform()) {
    const timer = webAlarmTimers.get(alarm.id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      webAlarmTimers.delete(alarm.id);
    }
    return;
  }

  const notification = { id: alarm.nativeNotificationId };
  await LocalNotifications.cancel({ notifications: [notification] });
  await LocalNotifications.removeDeliveredNotifications({
    notifications: [deliveredNotificationDescriptor(notification.id)],
  });
}

export async function removeDepartureAlarmNotification(
  alarm: DepartureAlarm,
): Promise<void> {
  if (!isNativeDepartureAlarmPlatform()) {
    return;
  }

  await LocalNotifications.removeDeliveredNotifications({
    notifications: [deliveredNotificationDescriptor(alarm.nativeNotificationId)],
  });
}

export async function synchronizeDepartureAlarms(
  alarms: DepartureAlarm[],
  getCopy: (alarm: DepartureAlarm) => DepartureAlarmNotificationCopy,
): Promise<DepartureAlarmSyncResult> {
  if (!isNativeDepartureAlarmPlatform()) {
    synchronizeWebDepartureAlarms(alarms, getCopy);
    return { expiredAlarmIds: [], deliveredAlarmIds: [] };
  }

  const [pendingResult, deliveredResult] = await Promise.all([
    LocalNotifications.getPending(),
    LocalNotifications.getDeliveredNotifications(),
  ]);
  const alarmByNotificationId = new Map(
    alarms.map((alarm) => [alarm.nativeNotificationId, alarm]),
  );
  const deliveredIds = new Set(
    deliveredResult.notifications.map((notification) => notification.id),
  );
  const now = Date.now();
  const deliveredAlarmIds = alarms
    .filter((alarm) => !alarm.notified && deliveredIds.has(alarm.nativeNotificationId))
    .map((alarm) => alarm.id);
  const expiredAlarmIds = alarms
    .filter(
      (alarm) =>
        !alarm.notified &&
        !deliveredIds.has(alarm.nativeNotificationId) &&
        new Date(alarm.alarmTime).getTime() <= now,
    )
    .map((alarm) => alarm.id);
  const schedulableAlarms = alarms.filter(
    (alarm) =>
      !alarm.notified &&
      !deliveredIds.has(alarm.nativeNotificationId) &&
      new Date(alarm.alarmTime).getTime() > now,
  );
  const schedulableIds = new Set(
    schedulableAlarms.map((alarm) => alarm.nativeNotificationId),
  );

  const pendingToCancel = pendingResult.notifications.filter(
    (notification) => !schedulableIds.has(notification.id),
  );
  if (pendingToCancel.length > 0) {
    await LocalNotifications.cancel({
      notifications: pendingToCancel.map(({ id }) => ({ id })),
    });
  }

  const orphanDelivered = deliveredResult.notifications.filter(
    (notification) => !alarmByNotificationId.has(notification.id),
  );
  if (orphanDelivered.length > 0) {
    await LocalNotifications.removeDeliveredNotifications({
      notifications: orphanDelivered,
    });
  }

  const pendingById = new Map(
    pendingResult.notifications.map((notification) => [notification.id, notification]),
  );

  for (const alarm of schedulableAlarms) {
    const pending = pendingById.get(alarm.nativeNotificationId);
    if (pending && isPendingAtAlarmTime(pending, alarm)) {
      continue;
    }

    if (pending) {
      await LocalNotifications.cancel({
        notifications: [{ id: pending.id }],
      });
    }

    await scheduleDepartureAlarm(alarm, getCopy(alarm));
  }

  return { expiredAlarmIds, deliveredAlarmIds };
}

export async function disposeDepartureAlarmRuntime(): Promise<void> {
  clearWebAlarmTimers();
  stopDepartureAlarmSound();
  runtimeHandlers = undefined;
  await disposeNativeDepartureAlarmListeners();
}

async function disposeNativeDepartureAlarmListeners(): Promise<void> {
  const handles = listenerHandles.splice(0);
  await Promise.all(handles.map((handle) => handle.remove()));
}

function synchronizeWebDepartureAlarms(
  alarms: DepartureAlarm[],
  getCopy: (alarm: DepartureAlarm) => DepartureAlarmNotificationCopy,
): void {
  clearWebAlarmTimers();

  alarms
    .filter((alarm) => !alarm.notified)
    .forEach((alarm) => scheduleWebDepartureAlarm(alarm, getCopy));
}

function scheduleWebDepartureAlarm(
  alarm: DepartureAlarm,
  getCopy: (alarm: DepartureAlarm) => DepartureAlarmNotificationCopy,
): void {
  const delay = new Date(alarm.alarmTime).getTime() - Date.now();
  const maximumDelay = 2_147_483_647;

  const timer = window.setTimeout(
    () => {
      webAlarmTimers.delete(alarm.id);

      if (delay > maximumDelay) {
        scheduleWebDepartureAlarm(alarm, getCopy);
        return;
      }

      void deliverWebDepartureAlarm(alarm, getCopy(alarm));
    },
    Math.max(0, Math.min(delay, maximumDelay)),
  );

  webAlarmTimers.set(alarm.id, timer);
}

async function deliverWebDepartureAlarm(
  alarm: DepartureAlarm,
  copy: DepartureAlarmNotificationCopy,
): Promise<void> {
  const delivered = await runtimeHandlers?.onAlarmDelivered(alarm.id);
  if (delivered === false) {
    return;
  }

  showWebDepartureAlarmNotification(alarm, copy);
  if (alarm.soundEnabled) {
    playWebDepartureAlarmSound();
  }
}

function showWebDepartureAlarmNotification(
  alarm: DepartureAlarm,
  copy: DepartureAlarmNotificationCopy,
): void {
  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  new Notification(copy.title, {
    body: copy.body,
    tag: alarm.id,
  });
}

function playWebDepartureAlarmSound(): void {
  stopDepartureAlarmSound();

  const AudioContextClass =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  const audioContext = new AudioContextClass();
  const masterGain = audioContext.createGain();
  const alarmVolume = 0.6;
  const durationSeconds = 30;
  const patternDuration = 1.2;

  masterGain.gain.setValueAtTime(alarmVolume, audioContext.currentTime);
  masterGain.connect(audioContext.destination);
  activeWebAlarmAudio = { audioContext };

  const notes = [
    { frequency: 523.25, offset: 0 },
    { frequency: 659.25, offset: 0.18 },
    { frequency: 783.99, offset: 0.36 },
  ];
  const now = audioContext.currentTime;

  for (let time = 0; time < durationSeconds; time += patternDuration) {
    for (const note of notes) {
      const startTime = now + time + note.offset;
      if (startTime >= now + durationSeconds) {
        continue;
      }

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.frequency, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(1, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.28);
      oscillator.connect(gain);
      gain.connect(masterGain);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.35);
    }
  }

  masterGain.gain.setValueAtTime(alarmVolume, now);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);
  activeWebAlarmAudio.closeTimer = window.setTimeout(
    stopDepartureAlarmSound,
    (durationSeconds + 1) * 1000,
  );
}

export function stopDepartureAlarmSound(): void {
  if (!activeWebAlarmAudio) {
    return;
  }

  if (activeWebAlarmAudio.closeTimer !== undefined) {
    window.clearTimeout(activeWebAlarmAudio.closeTimer);
  }

  const { audioContext } = activeWebAlarmAudio;
  activeWebAlarmAudio = undefined;

  if (audioContext.state !== "closed") {
    void audioContext.close().catch(() => undefined);
  }
}

function clearWebAlarmTimers(): void {
  webAlarmTimers.forEach((timer) => window.clearTimeout(timer));
  webAlarmTimers.clear();
}

function getWebNotificationPermission(): PermissionState {
  if (typeof Notification === "undefined") {
    return "denied";
  }

  return Notification.permission === "default"
    ? "prompt"
    : Notification.permission;
}

function deliveredNotificationDescriptor(
  id: number,
): DeliveredNotificationSchema {
  return {
    id,
    title: "",
    body: "",
  };
}

function isPendingAtAlarmTime(
  pending: PendingLocalNotificationSchema,
  alarm: DepartureAlarm,
): boolean {
  const scheduledAt = pending.schedule?.at;
  const scheduledTime =
    scheduledAt instanceof Date
      ? scheduledAt.getTime()
      : new Date(scheduledAt as unknown as string).getTime();

  return (
    Number.isFinite(scheduledTime) &&
    Math.abs(scheduledTime - new Date(alarm.alarmTime).getTime()) < 1_000 &&
    readAlarmId(pending.extra) === alarm.id
  );
}

function readAlarmId(extra: unknown): string | undefined {
  if (!extra || typeof extra !== "object") {
    return undefined;
  }

  const alarmId = (extra as { alarmId?: unknown }).alarmId;
  return typeof alarmId === "string" ? alarmId : undefined;
}
