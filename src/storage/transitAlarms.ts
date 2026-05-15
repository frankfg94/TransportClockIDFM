import type {
  AlarmDraft,
  Departure,
  DepartureAlarm,
  TransitBoardConfig,
} from "../types/transit";

const STORAGE_KEY = "transport-clock.alarms.v1";

export function loadDepartureAlarms(): DepartureAlarm[] {
  const rawValue = window.localStorage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue) as DepartureAlarm[];

    return parsedValue.filter(isValidAlarm);
  } catch {
    return [];
  }
}

export function saveDepartureAlarms(alarms: DepartureAlarm[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(alarms));
}

export function createDepartureAlarm(
  board: TransitBoardConfig,
  departure: Departure,
  draft: AlarmDraft,
): DepartureAlarm {
  const scheduledDepartureTime = getDepartureTime(departure) ?? new Date().toISOString();
  const alarmTime = getAlarmTime(scheduledDepartureTime, draft.minutesBefore);

  return {
    id: createAlarmId(board.id, departure),
    boardId: board.id,
    boardTitle: board.title,
    lineLabel: board.line.shortName,
    lineColor: board.line.color,
    destination: departure.destination,
    monitoringLabel: departure.monitoringLabel,
    platform: departure.platform,
    departureId: departure.id,
    journeyName: departure.journeyName,
    scheduledDepartureTime,
    alarmTime,
    minutesBefore: draft.minutesBefore,
    soundEnabled: draft.soundEnabled,
    notified: false,
    createdAt: new Date().toISOString(),
  };
}

export function reconcileBoardAlarms(
  board: TransitBoardConfig,
  departures: Departure[],
  alarms: DepartureAlarm[],
): DepartureAlarm[] {
  return alarms.map((alarm) => {
    if (alarm.boardId !== board.id || alarm.notified) {
      return alarm;
    }

    const match = findDepartureMatch(alarm, board, departures);

    if (!match) {
      return alarm;
    }

    const scheduledDepartureTime = getDepartureTime(match);

    if (!scheduledDepartureTime) {
      return alarm;
    }

    return {
      ...alarm,
      departureId: match.id,
      journeyName: match.journeyName ?? alarm.journeyName,
      destination: match.destination,
      monitoringLabel: match.monitoringLabel,
      platform: match.platform,
      scheduledDepartureTime,
      alarmTime: getAlarmTime(scheduledDepartureTime, alarm.minutesBefore),
    };
  });
}

export function getDepartureTime(departure: Departure): string | undefined {
  return (
    departure.expectedDepartureTime ??
    departure.expectedArrivalTime ??
    departure.aimedDepartureTime
  );
}

export function getAlarmTime(
  scheduledDepartureTime: string,
  minutesBefore: number,
): string {
  return new Date(
    new Date(scheduledDepartureTime).getTime() - minutesBefore * 60_000,
  ).toISOString();
}

export function hasActiveAlarmForDeparture(
  boardId: string,
  departure: Departure,
  alarms: DepartureAlarm[],
): boolean {
  return alarms.some((alarm) => {
    if (alarm.boardId !== boardId || alarm.notified) {
      return false;
    }

    return (
      alarm.departureId === departure.id ||
      (Boolean(alarm.journeyName) && alarm.journeyName === departure.journeyName)
    );
  });
}

export function markAlarmNotified(
  alarmId: string,
  alarms: DepartureAlarm[],
): DepartureAlarm[] {
  return alarms.map((alarm) =>
    alarm.id === alarmId
      ? {
          ...alarm,
          notified: true,
        }
      : alarm,
  );
}

export function removeAlarmsForBoard(
  boardId: string,
  alarms: DepartureAlarm[],
): DepartureAlarm[] {
  return alarms.filter((alarm) => alarm.boardId !== boardId);
}

function findDepartureMatch(
  alarm: DepartureAlarm,
  board: TransitBoardConfig,
  departures: Departure[],
): Departure | undefined {
  const exactMatch = departures.find((departure) => departure.id === alarm.departureId);

  if (exactMatch) {
    return exactMatch;
  }

  if (alarm.journeyName) {
    const journeyMatch = departures.find(
      (departure) => departure.journeyName === alarm.journeyName,
    );

    if (journeyMatch) {
      return journeyMatch;
    }
  }

  const previousTime = new Date(alarm.scheduledDepartureTime).getTime();
  const candidates = departures
    .filter((departure) => departure.lineRef === board.line.ref)
    .filter((departure) =>
      normalizeText(departure.destination) === normalizeText(alarm.destination),
    )
    .filter((departure) => (departure.platform ?? "") === (alarm.platform ?? ""))
    .map((departure) => ({
      departure,
      distance: Math.abs(
        (getDepartureTime(departure)
          ? new Date(getDepartureTime(departure) as string).getTime()
          : Number.MAX_SAFE_INTEGER) - previousTime,
      ),
    }))
    .filter((candidate) => candidate.distance <= 45 * 60_000)
    .sort((left, right) => left.distance - right.distance);

  return candidates[0]?.departure;
}

function createAlarmId(boardId: string, departure: Departure): string {
  return `${boardId}:${departure.id}:${Date.now()}`
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function isValidAlarm(value: Partial<DepartureAlarm>): value is DepartureAlarm {
  return Boolean(
    value.id &&
      value.boardId &&
      value.departureId &&
      value.scheduledDepartureTime &&
      value.alarmTime,
  );
}

function normalizeText(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
