export interface NearbyOpeningHoursDay {
  /** Monday = 0; public holidays = 7. */
  day: number;
  state: "hours" | "closed" | "all-day" | "unknown";
  intervals: string[];
}

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su", "PH"];

/** Format simple weekly OSM schedules only; preserve complex rules verbatim. */
export function nearbyOpeningHours(raw: string): NearbyOpeningHoursDay[] | undefined {
  const rows: NearbyOpeningHoursDay[] = Array.from({ length: 7 }, (_, day) => ({ day, state: "unknown", intervals: [] }));
  if (raw.trim() === "24/7") return rows.map<NearbyOpeningHoursDay>(row => ({ ...row, state: "all-day" }));
  const assigned = new Set<number>();
  const rules = raw.split(";").map(rule => rule.trim()).filter(Boolean);
  if (!rules.length) return undefined;
  for (const rule of rules) {
    const match = /^((?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:\s*[-,]\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|PH))*)\s+(.+)$/u.exec(rule);
    if (!match) return undefined;
    const days: number[] = [];
    for (const selector of match[1]!.split(",")) {
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
    const value = match[2]!.trim();
    const closed = value === "off" || value === "closed";
    const allDay = value === "24/7" || value === "00:00-24:00";
    const intervals = closed || allDay ? [] : value.split(/\s*,\s*/u);
    if (intervals.some(interval => !/^(?:[01]\d|2[0-3]):[0-5]\d\s*-\s*(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/u.test(interval))) return undefined;
    for (const day of new Set(days)) {
      // Overlapping or conditional rules require a full OSM interpreter.
      if (assigned.has(day)) return undefined;
      assigned.add(day);
      rows[day] = { day, state: closed ? "closed" : allDay ? "all-day" : "hours", intervals: intervals.map(interval => interval.replace(/\s*-\s*/u, " – ")) };
    }
  }
  return rows;
}
