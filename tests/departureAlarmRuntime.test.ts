import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DepartureAlarm } from "../src/types/transit";

const mocks = vi.hoisted(() => ({
  nativePlatform: true,
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  checkExactNotificationSetting: vi.fn(),
  changeExactNotificationSetting: vi.fn(),
  localCancel: vi.fn(),
  localGetPending: vi.fn(),
  localGetDelivered: vi.fn(),
  localRemoveDelivered: vi.fn(),
  ensureNativeChannels: vi.fn(),
  nativeSchedule: vi.fn(),
  nativeCancel: vi.fn(),
  nativeRemoveDelivered: vi.fn(),
  nativeGetPending: vi.fn(),
  nativeGetDelivered: vi.fn(),
  nativeAddListener: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => mocks.nativePlatform,
    getPlatform: () => (mocks.nativePlatform ? "android" : "web"),
  },
  registerPlugin: () => ({
    ensureChannels: mocks.ensureNativeChannels,
    schedule: mocks.nativeSchedule,
    cancel: mocks.nativeCancel,
    removeDelivered: mocks.nativeRemoveDelivered,
    getPending: mocks.nativeGetPending,
    getDelivered: mocks.nativeGetDelivered,
    addListener: mocks.nativeAddListener,
  }),
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}));

vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
    checkExactNotificationSetting: mocks.checkExactNotificationSetting,
    changeExactNotificationSetting: mocks.changeExactNotificationSetting,
    cancel: mocks.localCancel,
    getPending: mocks.localGetPending,
    getDeliveredNotifications: mocks.localGetDelivered,
    removeDeliveredNotifications: mocks.localRemoveDelivered,
  },
}));

import {
  cancelDepartureAlarm,
  disposeDepartureAlarmRuntime,
  initializeDepartureAlarmRuntime,
  scheduleDepartureAlarm,
  synchronizeDepartureAlarms,
} from "../src/services/departureAlarmRuntime";

const alarm: DepartureAlarm = {
  id: "alarm-1",
  nativeNotificationId: 902_010,
  boardId: "board-1",
  boardTitle: "Denfert-Rochereau",
  lineLabel: "B",
  lineColor: "#4b92db",
  destination: "Aeroport CDG 2",
  monitoringLabel: "Voie 2",
  departureId: "departure-1",
  scheduledDepartureTime: "2026-07-18T12:20:00.000Z",
  alarmTime: "2026-07-18T12:15:00.000Z",
  minutesBefore: 5,
  soundEnabled: true,
  notified: false,
  createdAt: "2026-07-18T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nativePlatform = true;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));
  mocks.checkPermissions.mockResolvedValue({ display: "granted" });
  mocks.checkExactNotificationSetting.mockResolvedValue({
    exact_alarm: "granted",
  });
  mocks.ensureNativeChannels.mockResolvedValue(undefined);
  mocks.nativeSchedule.mockResolvedValue(undefined);
  mocks.nativeCancel.mockResolvedValue(undefined);
  mocks.nativeRemoveDelivered.mockResolvedValue(undefined);
  mocks.nativeGetPending.mockResolvedValue({ alarms: [] });
  mocks.nativeGetDelivered.mockResolvedValue({ alarms: [] });
  mocks.nativeAddListener.mockResolvedValue({ remove: vi.fn() });
  mocks.localCancel.mockResolvedValue(undefined);
  mocks.localGetPending.mockResolvedValue({ notifications: [] });
  mocks.localGetDelivered.mockResolvedValue({ notifications: [] });
  mocks.localRemoveDelivered.mockResolvedValue(undefined);
});

afterEach(async () => {
  await disposeDepartureAlarmRuntime();
  vi.unstubAllGlobals();
});

describe("departure alarm runtime", () => {
  it("schedules the native alarm service with the exact alarm time", async () => {
    await scheduleDepartureAlarm(alarm, {
      title: "Alarm title",
      body: "Alarm body",
    });

    expect(mocks.nativeSchedule).toHaveBeenCalledWith({
      id: alarm.nativeNotificationId,
      alarmId: alarm.id,
      at: Date.parse(alarm.alarmTime),
      title: "Alarm title",
      body: "Alarm body",
      soundEnabled: true,
    });
  });

  it("does not schedule when Android capabilities are missing", async () => {
    mocks.checkExactNotificationSetting.mockResolvedValue({
      exact_alarm: "denied",
    });

    await expect(
      scheduleDepartureAlarm(alarm, {
        title: "Alarm title",
        body: "Alarm body",
      }),
    ).rejects.toThrow("departure-alarm-permission-required");
    expect(mocks.nativeSchedule).not.toHaveBeenCalled();
  });

  it("awaits native cancellation", async () => {
    await cancelDepartureAlarm(alarm);

    expect(mocks.nativeCancel).toHaveBeenCalledWith({
      id: alarm.nativeNotificationId,
    });
  });

  it("reschedules the same native id when realtime changes the alarm time", async () => {
    mocks.nativeGetPending.mockResolvedValue({
      alarms: [
        {
          id: alarm.nativeNotificationId,
          alarmId: alarm.id,
          at: Date.parse("2026-07-18T12:10:00.000Z"),
        },
      ],
    });

    const result = await synchronizeDepartureAlarms(
      [alarm],
      () => ({ title: "Alarm title", body: "Alarm body" }),
    );

    expect(result).toEqual({
      expiredAlarmIds: [],
      deliveredAlarmIds: [],
    });
    expect(mocks.nativeCancel).toHaveBeenCalledWith({
      id: alarm.nativeNotificationId,
    });
    expect(mocks.nativeSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        id: alarm.nativeNotificationId,
        alarmId: alarm.id,
        at: Date.parse(alarm.alarmTime),
      }),
    );
  });

  it("migrates pending notifications from the former native implementation", async () => {
    mocks.localGetPending.mockResolvedValue({
      notifications: [
        {
          id: alarm.nativeNotificationId,
          title: "Old alarm",
          body: "Old body",
          extra: { alarmId: alarm.id },
        },
      ],
    });

    await scheduleDepartureAlarm(alarm, {
      title: "Alarm title",
      body: "Alarm body",
    });

    expect(mocks.localCancel).toHaveBeenCalledWith({
      notifications: [{ id: alarm.nativeNotificationId }],
    });
    expect(mocks.nativeSchedule).toHaveBeenCalledOnce();
  });

  it("uses the same runtime to schedule and deliver a Web alarm", async () => {
    mocks.nativePlatform = false;
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      AudioContext: undefined,
      webkitAudioContext: undefined,
    });
    const onAlarmDelivered = vi.fn(async () => true);

    await initializeDepartureAlarmRuntime({
      onAlarmDelivered,
      onAlarmAction: vi.fn(),
      onResume: vi.fn(),
    });
    await synchronizeDepartureAlarms(
      [alarm],
      () => ({ title: "Web alarm", body: "Web body" }),
    );

    await vi.advanceTimersByTimeAsync(15 * 60 * 1_000);

    expect(onAlarmDelivered).toHaveBeenCalledWith(alarm.id);
    expect(mocks.nativeSchedule).not.toHaveBeenCalled();
  });
});
