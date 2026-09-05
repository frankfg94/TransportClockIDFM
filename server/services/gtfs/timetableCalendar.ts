import type { GtfsTimetableService } from "./timetableTypes";

export function shiftGtfsDate(day: string, offset: number): string {
  const time = Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(4, 6)) - 1,
    Number(day.slice(6, 8)) + offset,
  );
  return new Date(time).toISOString().slice(0, 10).replace(/-/gu, "");
}

export function isGtfsServiceActive(service: GtfsTimetableService, day: string): boolean {
  const exception = service.exceptions[day];
  if (exception !== undefined) return exception === 1;
  if (!service.startDate || !service.endDate || day < service.startDate || day > service.endDate)
    return false;
  const weekday = new Date(
    Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8))),
  ).getUTCDay();
  return Boolean(service.weekdays & (1 << ((weekday + 6) % 7)));
}
