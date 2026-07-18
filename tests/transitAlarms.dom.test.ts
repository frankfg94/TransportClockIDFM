import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDepartureAlarm,
  findActiveAlarmForDeparture,
  findDepartureAlarmById,
  loadDepartureAlarms,
  reconcileBoardAlarms,
  removeDepartureAlarmById,
  saveDepartureAlarms,
} from "../src/storage/transitAlarms";
import type {
  Departure,
  DepartureAlarm,
  TransitBoardConfig,
} from "../src/types/transit";

const board: TransitBoardConfig = {
  id: "board-rer-b",
  title: "Denfert-Rochereau",
  city: "Paris",
  line: {
    ref: "line-b",
    shortName: "B",
    longName: "RER B",
    mode: "rer",
    color: "#4b92db",
    textColor: "#ffffff",
  },
  monitoringPoints: [],
  directionGroups: [],
  maxDepartures: 4,
};

const departure: Departure = {
  id: "departure-1",
  lineRef: "line-b",
  monitoringRef: "stop-1",
  stopName: "Denfert-Rochereau",
  destination: "Aeroport CDG 2",
  platform: "2",
  monitoringLabel: "Voie 2",
  expectedDepartureTime: "2026-07-18T12:20:00.000Z",
  vehicleAtStop: false,
  journeyName: "journey-1",
};

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));
});

describe("departure alarm storage", () => {
  it("creates, finds and removes one active alarm", () => {
    const alarm = createDepartureAlarm(
      board,
      departure,
      { minutesBefore: 5, soundEnabled: true },
      [],
    );

    expect(alarm.nativeNotificationId).toBeGreaterThan(0);
    expect(
      findActiveAlarmForDeparture(board.id, departure, [alarm]),
    ).toEqual(alarm);
    expect(findDepartureAlarmById(alarm.id, [alarm])).toEqual(alarm);
    expect(removeDepartureAlarmById(alarm.id, [alarm])).toEqual([]);
  });

  it("migrates legacy alarms to stable collision-free native ids", () => {
    const first = createDepartureAlarm(
      board,
      departure,
      { minutesBefore: 5, soundEnabled: true },
      [],
    );
    const second = {
      ...first,
      id: "legacy-second",
      departureId: "departure-2",
    };
    const legacy = [
      withoutNativeNotificationId(first),
      withoutNativeNotificationId(second),
    ];

    window.localStorage.setItem(
      "transport-clock.alarms.v1",
      JSON.stringify(legacy),
    );
    const migrated = loadDepartureAlarms();
    const reloaded = loadDepartureAlarms();

    expect(migrated).toHaveLength(2);
    expect(migrated[0]?.nativeNotificationId).toBeGreaterThan(0);
    expect(migrated[1]?.nativeNotificationId).toBeGreaterThan(0);
    expect(migrated[0]?.nativeNotificationId).not.toBe(
      migrated[1]?.nativeNotificationId,
    );
    expect(reloaded.map((alarm) => alarm.nativeNotificationId)).toEqual(
      migrated.map((alarm) => alarm.nativeNotificationId),
    );
  });

  it("keeps the native id while realtime reconciliation changes the alarm time", () => {
    const alarm = createDepartureAlarm(
      board,
      departure,
      { minutesBefore: 5, soundEnabled: true },
      [],
    );
    const delayedDeparture = {
      ...departure,
      expectedDepartureTime: "2026-07-18T12:27:00.000Z",
    };
    const [reconciled] = reconcileBoardAlarms(
      board,
      [delayedDeparture],
      [alarm],
    );

    expect(reconciled?.nativeNotificationId).toBe(
      alarm.nativeNotificationId,
    );
    expect(reconciled?.alarmTime).toBe("2026-07-18T12:22:00.000Z");
  });

  it("persists the migrated numeric id", () => {
    const alarm = createDepartureAlarm(
      board,
      departure,
      { minutesBefore: 3, soundEnabled: false },
      [],
    );

    saveDepartureAlarms([alarm]);
    expect(loadDepartureAlarms()).toEqual([alarm]);
  });
});

function withoutNativeNotificationId(
  alarm: DepartureAlarm,
): Omit<DepartureAlarm, "nativeNotificationId"> {
  const { nativeNotificationId: _nativeNotificationId, ...legacy } = alarm;
  return legacy;
}
