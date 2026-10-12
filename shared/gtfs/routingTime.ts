const paris = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
export function parisDateTime(epoch: number): string {
  const p = Object.fromEntries(paris.formatToParts(epoch).map(p => [p.type, p.value]));
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
}
export function parisCivilEpoch(datetime: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})T([0-2]\d)([0-5]\d)([0-5]\d)$/u.exec(datetime);
  if (!m || Number(m[4]) > 23) throw new Error("Invalid Paris departure datetime");
  const utc = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!);
  let epoch = utc;
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(paris.formatToParts(epoch).map(p => [p.type, p.value]));
    const local = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
    const difference = utc - local;
    if (!difference) break;
    epoch += difference;
  }
  if (parisDateTime(epoch) !== datetime) throw new Error("Departure datetime does not exist in Europe/Paris");
  return epoch;
}
/** GTFS defines service-day seconds relative to local noon minus twelve hours. */
export function gtfsServiceEpoch(day: string): number { return parisCivilEpoch(`${day}T120000`) / 1000 - 43_200; }
