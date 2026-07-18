import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DepartureAlarm } from "../src/types/transit";

const mocks = vi.hoisted(() => ({
  nativePlatform: true,
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  checkExactNotificationSetting: vi.fn(),
  changeExactNotificationSetting: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
  getPending: vi.fn(),
  getDeliveredNotifications: vi.fn(),
  removeDeliveredNotifications: vi.fn(),
  addListener: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => mocks.nativePlatform,
    getPlatform: () => (mocks.nativePlatform ? "android" : "web"),
  },
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}));

vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: mocks,
}));

import {
  DEPARTURE_ALARM_CHANNEL_ID,
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
  mocks.schedule.mockResolvedValue({ notifications: [] });
  mocks.cancel.mockResolvedValue(undefined);
  mocks.getPending.mockResolvedValue({ notifications: [] });
  mocks.getDeliveredNotifications.mockResolvedValue({ notifications: [] });
  mocks.removeDeliveredNotifications.mockResolvedValue(undefined);
});

afterEach(async () => {
  await disposeDepartureAlarmRuntime();
  vi.unstubAllGlobals();
});

describe("departure alarm runtime", () => {
  it("schedules an exact allow-while-idle notification on the alarm channel", async () => {
    await scheduleDepartureAlarm(alarm, {
      title: "Alarm title",
      body: "Alarm body",
    });

    expect(mocks.schedule).toHaveBeenCalledOnce();
    const notification = mocks.schedule.mock.calls[0]?.[0].notifications[0];
    expect(notification).toMatchObject({
      id: alarm.nativeNotificationId,
      channelId: DEPARTURE_ALARM_CHANNEL_ID,
      sound: "transport_departure_alarm.wav",
      autoCancel: true,
      extra: {
        alarmId: alarm.id,
        boardId: alarm.boardId,
        departureId: alarm.departureId,
      },
    });
    expect(notification.schedule.allowWhileIdle).toBe(true);
    expect(notification.schedule.at.toISOString()).toBe(alarm.alarmTime);
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
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("awaits pending cancellation and delivered notification removal", async () => {
    await cancelDepartureAlarm(alarm);

    expect(mocks.cancel).toHaveBeenCalledWith({
      notifications: [{ id: alarm.nativeNotificationId }],
    });
    expect(mocks.removeDeliveredNotifications).toHaveBeenCalledWith({
      notifications: [
        {
          id: alarm.nativeNotificationId,
          title: "",
          body: "",
        },
      ],
    });
    expect(
      mocks.cancel.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.removeDeliveredNotifications.mock.invocationCallOrder[0]);
  });

  it("reschedules the same native id when realtime changes the alarm time", async () => {
    mocks.getPending.mockResolvedValue({
      notifications: [
        {
          id: alarm.nativeNotificationId,
          title: "Alarm title",
          body: "Alarm body",
          schedule: { at: new Date("2026-07-18T12:10:00.000Z") },
          extra: { alarmId: alarm.id },
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
    expect(mocks.cancel).toHaveBeenCalledWith({
      notifications: [{ id: alarm.nativeNotificationId }],
    });
    expect(mocks.schedule).toHaveBeenCalledOnce();
    expect(
      mocks.schedule.mock.calls[0]?.[0].notifications[0].id,
    ).toBe(alarm.nativeNotificationId);
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
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

});
