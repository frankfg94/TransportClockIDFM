import type { NearbyJourneySection } from "./nearbyHeavyTransports";
import type { TravelRoute } from "./useTravelRoutes";

export type TurboStrategy = "fastest" | "smooth";
export type TurboStatus = "loading" | "ready" | "partial" | "unavailable" | "error";
export interface TurboCourse {
  id: string;
  vehicleJourneyId?: string;
  direction?: string;
  mission?: string;
  departure: number;
  arrival: number;
  baseDeparture: number;
  baseArrival: number;
  source: "realtime" | "estimated" | "schedule";
  observedAt?: string;
  stopNames?: string[];
  fromStopPointId?: string;
  toStopPointId?: string;
}
export interface TurboResult {
  status: TurboStatus;
  analyzedAt: string;
  proposals: TravelRoute[];
  winners: Partial<Record<TurboStrategy, string>>;
  currentOptimal: Partial<Record<TurboStrategy, boolean>>;
  currentFeasible?: boolean;
}
export interface TravelTurboProvider {
  analyze(request: { route: TravelRoute; start: number; signal: AbortSignal }): Promise<TurboResult>;
}
export interface TurboObservation {
  lineId: string;
  stopId: string;
  journeyId?: string;
  mission?: string;
  aimedDeparture?: number;
  aimedArrival?: number;
  departure?: number;
  arrival?: number;
  cancelled: boolean;
  observedAt?: number;
}

const parisParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
export function parisDateTime(epoch: number): string {
  const p = Object.fromEntries(parisParts.formatToParts(epoch).map((part) => [part.type, part.value]));
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
}
/** Parse provider civil times in Paris, regardless of the device timezone. */
export function turboTime(value?: string): number | undefined {
  if (!value) return undefined;
  if (/(?:Z|[+-]\d\d:\d\d)$/u.test(value)) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : undefined;
  }
  const m = value.replace(/[-:]/gu, "").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/u);
  if (!m) return undefined;
  const civil = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
  let epoch = civil;
  for (let i = 0; i < 3; i++) {
    const rendered = parisDateTime(epoch);
    const local = Date.UTC(+rendered.slice(0, 4), +rendered.slice(4, 6) - 1, +rendered.slice(6, 8), +rendered.slice(9, 11), +rendered.slice(11, 13), +rendered.slice(13, 15));
    epoch += civil - local;
  }
  return Number.isFinite(epoch) ? epoch : undefined;
}
export function isTurboTransit(section: NearbyJourneySection): boolean {
  return Boolean(section.lineId || section.lineCode || section.lineMode);
}
export function turboFirstTransitDeparture(route: TravelRoute): number | undefined {
  const firstTransit = route.sections.find(isTurboTransit);
  return turboTime(firstTransit?.departureDateTime ?? firstTransit?.baseDepartureDateTime) ?? turboTime(route.departureDateTime);
}
export function turboDurationMinutes(seconds: number): number {
  return Math.max(1, Math.round(Math.max(0, seconds) / 60));
}
export function turboSignature(route: TravelRoute): string {
  return JSON.stringify(route.sections.filter(isTurboTransit).map((s) => [s.lineId, s.fromStopPointId, s.toStopPointId]));
}
export function turboJourneyKey(route: TravelRoute): string {
  return JSON.stringify(route.sections.filter(isTurboTransit).map((s) => [
    s.lineId, s.fromStopPointId, s.toStopPointId,
    turboTime(s.baseDepartureDateTime ?? s.departureDateTime),
    turboTime(s.baseArrivalDateTime ?? s.arrivalDateTime),
  ]));
}
export function sameTurboJourney(left: TravelRoute, right: TravelRoute): boolean {
  if (turboJourneyKey(left) === turboJourneyKey(right)) return true;
  const a = left.sections.filter(isTurboTransit);
  const b = right.sections.filter(isTurboTransit);
  return a.length > 0 && a.length === b.length && a.every((s, i) => {
    const other = b[i]!;
    const dep = turboTime(s.baseDepartureDateTime ?? s.departureDateTime);
    const otherDep = turboTime(other.baseDepartureDateTime ?? other.departureDateTime);
    return s.lineId === other.lineId && s.fromStopPointId === other.fromStopPointId && s.toStopPointId === other.toStopPointId &&
      s.vehicleJourneyId && other.vehicleJourneyId && s.vehicleJourneyId.replace(/^vehicle_journey:/u, "") === other.vehicleJourneyId.replace(/^vehicle_journey:/u, "") &&
      dep !== undefined && otherDep !== undefined && parisDateTime(dep).slice(0, 8) === parisDateTime(otherDep).slice(0, 8);
  });
}
const isWait = (s: NearbyJourneySection) => /waiting|wait/iu.test(`${s.type ?? ""} ${s.mode ?? ""}`);
const seconds = (sections: NearbyJourneySection[]) => sections.reduce((n, s) => n + s.durationSeconds, 0);

/**
 * Return only the waiting time before the first public-transport departure.
 *
 * Navitia's journey duration includes the initial wait when the query starts
 * before the first vehicle, while Turbo proposals already start at the first
 * access section. Prefer the explicit waiting section when available and use
 * the dated section boundary as a fallback for an implicit wait.
 */
export function turboInitialWaitingSeconds(route: TravelRoute): number {
  const firstTransitIndex = route.sections.findIndex(isTurboTransit);
  if (firstTransitIndex < 0) return 0;

  const beforeFirstTransit = route.sections.slice(0, firstTransitIndex);
  const explicitWaiting = beforeFirstTransit
    .filter(isWait)
    .reduce((total, section) => total + Math.max(0, section.durationSeconds), 0);
  const firstDeparture = turboFirstTransitDeparture(route);
  if (firstDeparture === undefined) return explicitWaiting;

  const previousArrival = turboTime(beforeFirstTransit.at(-1)?.arrivalDateTime);
  const routeDeparture = turboTime(route.departureDateTime);
  const reference = previousArrival ?? routeDeparture;
  const implicitWaiting = reference === undefined
    ? 0
    : Math.max(0, (firstDeparture - reference) / 1000);
  return Math.max(explicitWaiting, implicitWaiting);
}

/** Door-to-door duration with only the initial wait before the first vehicle removed. */
export function turboJourneyDurationWithoutInitialWait(route: TravelRoute): number {
  const total = Number.isFinite(route.durationSeconds)
    ? Math.max(0, route.durationSeconds)
    : route.sections.reduce((sum, section) => sum + Math.max(0, section.durationSeconds), 0);
  return Math.max(0, total - turboInitialWaitingSeconds(route));
}

/** Exhaustive fixed-leg timetable search; a resource cap can only produce a partial result. */
export function optimizeTurbo(route: TravelRoute, courses: TurboCourse[][], start: number, complete: boolean, maxStates = 100_000): TurboResult {
  const result: TurboResult = { status: "unavailable", analyzedAt: new Date().toISOString(), proposals: [], winners: {}, currentOptimal: {} };
  const transitIndexes = route.sections.flatMap((s, i) => isTurboTransit(s) ? [i] : []);
  if (!transitIndexes.length || courses.length !== transitIndexes.length || courses.some((c) => !c.length)) return result;
  const before = transitIndexes.map((index, i) => route.sections.slice(i ? transitIndexes[i - 1]! + 1 : 0, index).filter((s) => !isWait(s)));
  const after = route.sections.slice(transitIndexes.at(-1)! + 1).filter((s) => !isWait(s));
  if ([...before.flat(), ...after].some((s) => !Number.isFinite(s.durationSeconds) || s.durationSeconds < 0)) return result;
  const access = seconds(before[0]!) * 1000;
  const egress = seconds(after) * 1000;
  const baseline = transitIndexes.map((index, i) => {
    const section = route.sections[index]!;
    return courses[i]!.find((c) =>
      (section.vehicleJourneyId && c.vehicleJourneyId && section.vehicleJourneyId.replace(/^vehicle_journey:/u, "") === c.vehicleJourneyId.replace(/^vehicle_journey:/u, "")) ||
      (c.baseDeparture === turboTime(section.baseDepartureDateTime ?? section.departureDateTime) && c.baseArrival === turboTime(section.baseArrivalDateTime ?? section.arrivalDateTime)));
  });
  result.currentFeasible = baseline.every(Boolean) ? baseline.every((c, i) => c && (i === 0
    ? c.departure - access >= start && c.departure - access <= start + 3600_000
    : baseline[i - 1] && c.departure >= baseline[i - 1]!.arrival + seconds(before[i]!) * 1000 + 120_000)) : undefined;
  type Candidate = { path: TurboCourse[]; arrival: number; departure: number; duration: number; wait: number };
  // No FIFO pruning: later departures may overtake earlier services.
  let states = 0;
  let truncated = false;
  let fastest: Candidate | undefined;
  const completed: Candidate[] = [];
  const scan = (path: TurboCourse[], wait: number) => {
    if (++states > maxStates) { truncated = true; return; }
    const leg = path.length;
    if (leg === courses.length) {
      const departure = path[0]!.departure - access;
      const arrival = path.at(-1)!.arrival + egress;
      const candidate = { path, wait, departure, arrival, duration: arrival - departure };
      completed.push(candidate);
      // "Fastest" means the shortest door-to-door elapsed time. Comparing only
      // arrival clocks would prefer an earlier departure even when a later
      // service reaches the address much sooner.
      if (!fastest || candidate.duration < fastest.duration ||
        (candidate.duration === fastest.duration && (candidate.arrival < fastest.arrival ||
          (candidate.arrival === fastest.arrival && candidate.departure < fastest.departure)))) fastest = candidate;
      return;
    }
    for (const course of courses[leg]!) {
      if (states > maxStates) break;
      if (![course.departure, course.arrival].every(Number.isFinite) || course.arrival < course.departure) continue;
      if (!leg) {
        const departure = course.departure - access;
        if (departure < start || departure > start + 3600_000) continue;
        scan([course], 0);
      } else {
        const platformReady = path.at(-1)!.arrival + seconds(before[leg]!) * 1000;
        if (course.departure < platformReady + 120_000) continue;
        scan([...path, course], wait + course.departure - platformReady);
      }
    }
  };
  scan([], 0);
  if (!fastest) return { ...result, status: truncated ? "partial" : "unavailable" };
  const best: Candidate = fastest;
  const smooth = completed.filter((c) => c.arrival <= best.arrival + 1800_000)
    .sort((a, b) => a.wait - b.wait || a.arrival - b.arrival || b.departure - a.departure)[0]!;
  result.status = complete && !truncated ? "ready" : "partial";
  for (const [strategy, candidate] of [["fastest", best], ["smooth", smooth]] as const) {
    const sections: NearbyJourneySection[] = [];
    let cursor = candidate.departure;
    const append = (section: NearbyJourneySection, duration = section.durationSeconds) => {
      sections.push({ ...section, durationSeconds: duration, departureDateTime: new Date(cursor).toISOString(), arrivalDateTime: new Date(cursor + duration * 1000).toISOString() });
      cursor += duration * 1000;
    };
    candidate.path.forEach((course, i) => {
      before[i]!.forEach((s) => append(s));
      if (course.departure > cursor) append({ type: "waiting", durationSeconds: 0 }, (course.departure - cursor) / 1000);
      const original = route.sections[transitIndexes[i]!]!;
      append({ ...original, vehicleJourneyId: course.vehicleJourneyId ?? course.id, stopNames: course.stopNames ?? original.stopNames,
        direction: course.direction ?? original.direction, mission: course.mission,
        fromStopPointId: course.fromStopPointId ?? original.fromStopPointId, toStopPointId: course.toStopPointId ?? original.toStopPointId,
        baseDepartureDateTime: new Date(course.baseDeparture).toISOString(), baseArrivalDateTime: new Date(course.baseArrival).toISOString(),
        timingSource: course.source, timingObservedAt: course.observedAt,
      }, (course.arrival - course.departure) / 1000);
    });
    after.forEach((s) => append(s));
    const proposal: TravelRoute = { ...route, id: `turbo:${candidate.path.map((c) => c.id).join("|")}`,
      departureDateTime: new Date(candidate.departure).toISOString(), arrivalDateTime: new Date(candidate.arrival).toISOString(),
      durationSeconds: (candidate.arrival - candidate.departure) / 1000, sections, transitSections: sections.filter(isTurboTransit),
    };
    const current = sameTurboJourney(proposal, route);
    if (current) proposal.id = route.id;
    result.currentOptimal[strategy] = current && result.status === "ready";
    result.winners[strategy] = proposal.id;
    if (!result.proposals.some((p) => p.id === proposal.id)) result.proposals.push(proposal);
  }
  return result;
}
