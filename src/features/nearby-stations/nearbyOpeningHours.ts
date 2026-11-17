export interface NearbyOpeningHoursDay {
  /** Monday = 0; public holidays = 7. */
  day: number;
  state: "hours" | "closed" | "all-day" | "unknown";
  intervals: string[];
}

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su", "PH"];

interface ParsedOpeningHours {
  days: NearbyOpeningHoursDay[];
  ruleOrder: number[];
}

function parseNearbyOpeningHours(raw: string): ParsedOpeningHours | undefined {
  const rows: NearbyOpeningHoursDay[] = Array.from({ length: 7 }, (_, day) => ({ day, state: "unknown", intervals: [] }));
  const ruleOrder = Array<number>(8).fill(-1);
  if (raw.trim() === "24/7") return { days: rows.map(row => ({ ...row, state: "all-day" })), ruleOrder: ruleOrder.fill(0) };
  const assigned = new Set<number>();
  const rules = raw.split(";").map(rule => rule.trim()).filter(Boolean);
  if (!rules.length) return undefined;
  for (const [index, rule] of rules.entries()) {
    const match = /^((?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:\s*[-,]\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|PH))*)\s+(.+)$/u.exec(rule);
    const days: number[] = [];
    // An OSM time-only rule applies every day, including public holidays.
    for (const selector of (match?.[1] ?? "Mo-Su").split(",")) {
      const bounds = selector.trim().split(/\s*-\s*/u).map(day => DAYS.indexOf(day));
      if (bounds.length === 1) days.push(bounds[0]!);
      else {
        const [first, last] = bounds;
        if (bounds.length !== 2 || first === 7 || last === 7) return undefined;
        for (let day = first!, count = 0; count < 7; day = (day + 1) % 7, count++) {
          days.push(day);
          if (day === last) break;
        }
      }
    }
    const value = (match?.[2] ?? rule).trim();
    const closed = value === "off" || value === "closed";
    const allDay = value === "24/7" || value === "00:00-24:00";
    const intervals = closed || allDay ? [] : value.split(/\s*,\s*/u);
    if (intervals.some(interval => !/^(?:[01]\d|2[0-3]):[0-5]\d\s*-\s*(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/u.test(interval))) return undefined;
    for (const day of new Set(days)) {
      // Overlapping or conditional rules require a full OSM interpreter.
      if (assigned.has(day)) return undefined;
      assigned.add(day);
      rows[day] = { day, state: closed ? "closed" : allDay ? "all-day" : "hours", intervals: intervals.map(interval => interval.replace(/\s*-\s*/u, " – ")) };
      ruleOrder[day] = index;
    }
  }
  return { days: rows, ruleOrder };
}

/** Format simple weekly OSM schedules only; preserve complex rules verbatim. */
export function nearbyOpeningHours(raw: string): NearbyOpeningHoursDay[] | undefined {
  return parseNearbyOpeningHours(raw)?.days;
}

export type NearbyOpeningStatus = "open" | "closed";

const PARIS_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const parsedCache = new Map<string, ParsedOpeningHours | null>();
const holidayCache = new Map<number, Set<number>>();
const DAY_MS = 86_400_000;

/** Public holidays in Île-de-France: https://code.travail.gouv.fr/code-du-travail/l3133-1 */
function publicHolidays(year: number): Set<number> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  // Gregorian Easter Sunday, used for Easter Monday, Ascension and Whit Monday.
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451), value = h + l - 7 * m + 114;
  const easter = Date.UTC(year, Math.floor(value / 31) - 1, value % 31 + 1);
  const days = new Set([
    Date.UTC(year, 0, 1), Date.UTC(year, 4, 1), Date.UTC(year, 4, 8),
    Date.UTC(year, 6, 14), Date.UTC(year, 7, 15), Date.UTC(year, 10, 1),
    Date.UTC(year, 10, 11), Date.UTC(year, 11, 25),
    easter + DAY_MS, easter + 39 * DAY_MS, easter + 50 * DAY_MS,
  ]);
  holidayCache.set(year, days);
  return days;
}

function effectiveDay(schedule: ParsedOpeningHours, date: Date) {
  const weekday = (date.getUTCDay() + 6) % 7;
  const holiday = publicHolidays(date.getUTCFullYear()).has(date.getTime());
  const index = holiday && schedule.ruleOrder[7]! > schedule.ruleOrder[weekday]! ? 7 : weekday;
  return { row: schedule.days[index], order: schedule.ruleOrder[index] ?? -1 };
}

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour! * 60 + minute!;
}

/** Build one lookup per clock tick; parsing and Paris date calculation are shared across places. */
export function nearbyOpeningStatusLookup(now: Date): (raw?: string) => NearbyOpeningStatus | undefined {
  if (!Number.isFinite(now.getTime())) return () => undefined;
  const parts = Object.fromEntries(PARIS_TIME.formatToParts(now).map(part => [part.type, part.value]));
  const today = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const yesterday = new Date(today.getTime() - DAY_MS);
  const currentMinute = Number(parts.hour) * 60 + Number(parts.minute);
  const statuses = new Map<string, NearbyOpeningStatus | null>();
  return (raw) => {
    const key = raw?.trim();
    if (!key) return undefined;
    if (statuses.has(key)) return statuses.get(key) ?? undefined;
    if (!parsedCache.has(key)) {
      if (parsedCache.size >= 4096) parsedCache.clear();
      parsedCache.set(key, parseNearbyOpeningHours(key) ?? null);
    }
    const schedule = parsedCache.get(key);
    if (!schedule) return undefined;
    const current = effectiveDay(schedule, today);
    const previous = effectiveDay(schedule, yesterday);
    // Equal endpoints are ambiguous; leave the status unknown rather than inventing a duration.
    const ranges = (row?: NearbyOpeningHoursDay) => row?.intervals.map(interval => interval.split(" – ").map(minutes)) ?? [];
    const currentRanges = ranges(current.row), previousRanges = ranges(previous.row);
    let status: NearbyOpeningStatus | undefined;
    if (![...currentRanges, ...previousRanges].some(([start, end]) => start === end)) {
      const openNow = current.row?.state === "all-day" || currentRanges.some(([start, end]) =>
        end! > start! ? currentMinute >= start! && currentMinute < end! : currentMinute >= start!);
      // Later OSM rules override earlier rules for the whole selected day.
      const carriedOver = previous.order >= current.order && previousRanges.some(([start, end]) => end! < start! && currentMinute < end!);
      status = openNow || carriedOver ? "open" : current.row && current.row.state !== "unknown" ? "closed" : undefined;
    }
    if (statuses.size >= 4096) statuses.clear();
    statuses.set(key, status ?? null);
    return status;
  };
}
