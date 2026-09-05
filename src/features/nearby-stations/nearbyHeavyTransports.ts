import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import type { GlobalMapLine, GlobalMapMode, GlobalMapStation } from "../transport-map/contracts/manifest";
import type { NearbyStationEntry } from "./nearbyStations";
import type { PublicFutureGpeStation } from "./neighborhoodVerdictApi";
import {
  getNearbyHeavyAccessTravelSeconds,
  NEARBY_HEAVY_TRANSPORT_MODES,
} from "./nearbyHeavyTransportRules";
export {
  chooseBestNearbyHeavyJourney,
  evaluateNearbyHeavyJourney,
  getNearbyHeavyAccessTravelSeconds,
  getNearbyHeavyAccessPresentation,
  listNearbyHeavyJourneyAlternatives,
  NEARBY_HEAVY_BUS_ACCESS_MAX_SECONDS,
  NEARBY_HEAVY_BUS_MODES,
  NEARBY_HEAVY_DIRECT_WALK_MAX_METERS,
  NEARBY_HEAVY_FEEDER_WALK_MAX_SECONDS,
  NEARBY_HEAVY_LONG_WALK_HIDE_SECONDS,
  NEARBY_HEAVY_RELIABLE_FEEDER_MODES,
  NEARBY_HEAVY_SEARCH_MAX_METERS,
  NEARBY_HEAVY_TOTAL_MAX_SECONDS,
  NEARBY_HEAVY_TRANSPORT_MODES,
  selectNearbyHeavyTargetCandidates,
} from "./nearbyHeavyTransportRules";

const NEARBY_HEAVY_LINE_MODE_ORDER: readonly GlobalMapMode[] = [
  "METRO",
  "RER",
  "TRAIN",
  "TRANSILIEN",
];
export const NEARBY_HEAVY_CARDINAL_AXIS_RATIO = 2;

export type NearbyHeavyCardinalDirection = "N" | "E" | "S" | "W";

export interface NearbyJourneyRequest {
  origin: Pick<GeocoderPoint, "lon" | "lat">;
  destination: Pick<GeocoderPoint, "id" | "lon" | "lat">;
  /** Optional Navitia stop-area URI used instead of the map centroid. */
  destinationRef?: string;
  /** Optional departure probe used to discover scheduled daytime feeders. */
  datetime?: string;
  count?: number;
  includeDisruptions?: boolean;
  includeGeoJson?: boolean;
}

/**
 * Return a stable Navitia departure datetime for a typical work commute.
 *
 * The nearby-stations page can be opened at night, when a live journey query
 * quite legitimately returns night buses instead of the daytime rail/tram
 * network. Keeping the helper here makes the exact local-time policy
 * reusable by the map and the neighborhood verdict.
 */
export function getNearbyWorkdayJourneyDateTime(now = new Date()): string {
  const target = new Date(now);
  target.setHours(9, 0, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);

  while (target.getDay() === 0 || target.getDay() === 6) {
    target.setDate(target.getDate() + 1);
  }

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${target.getFullYear()}${pad(target.getMonth() + 1)}${pad(target.getDate())}` +
    `T${pad(target.getHours())}${pad(target.getMinutes())}${pad(target.getSeconds())}`;
}

/**
 * Return the next local 03:00 departure probe used for Noctilien discovery.
 * Unlike the workday probe, weekends are intentionally kept because the
 * night network is a separate service window.
 */
export function getNearbyNightJourneyDateTime(now = new Date()): string {
  const target = new Date(now);
  target.setHours(3, 0, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${target.getFullYear()}${pad(target.getMonth() + 1)}${pad(target.getDate())}` +
    `T${pad(target.getHours())}${pad(target.getMinutes())}${pad(target.getSeconds())}`;
}

export interface NearbyJourneyPoint {
  lon: number;
  lat: number;
}

/** A reliable station exit that can be shown at the end of a transit leg. */
export interface RouteExit {
  id: string;
  stationId: string;
  name: string;
  code?: string;
  lon: number;
  lat: number;
}

export interface NearbyJourneySection {
  type?: string;
  mode?: string;
  durationSeconds: number;
  departureDateTime?: string;
  arrivalDateTime?: string;
  distanceMeters?: number;
  lineId?: string;
  lineCode?: string;
  /** Other display references returned by Navitia for the same line. */
  lineAliases?: string[];
  lineMode?: GlobalMapMode;
  lineColor?: string;
  lineTextColor?: string;
  direction?: string;
  fromName?: string;
  toName?: string;
  /** WGS84 endpoints exposed by Navitia for map access/egress rendering. */
  fromPoint?: NearbyJourneyPoint;
  toPoint?: NearbyJourneyPoint;
  /** Ordered street-network geometry when the journey provider exposes it. */
  geometry?: NearbyJourneyPoint[];
  /** Optional ordered stop names when a journey provider can expose them. */
  stopNames?: string[];
}

export interface NearbyJourney {
  id?: string;
  durationSeconds: number;
  departureDateTime?: string;
  arrivalDateTime?: string;
  transferCount?: number;
  status?: string;
  sections: NearbyJourneySection[];
}

export function isNearbyJourneyWalkingSection(section: NearbyJourneySection): boolean {
  const value = `${section.type ?? ""} ${section.mode ?? ""}`.toLocaleLowerCase("fr-FR");
  return value.includes("walking") || value.includes("walk") || value.includes("transfer") || value.includes("foot");
}

/** Stable application port used by both nearby heavy transport and travel routes. */
export interface TravelRoutesProvider {
  findJourneys(request: NearbyJourneyRequest): Promise<NearbyJourney[]>;
}

/** Provider used for a real pedestrian route to a transport station. */
export interface NearbyWalkingRouteResult {
  durationSeconds: number;
  distanceMeters: number;
  provider?: string;
  fallback?: boolean;
}

export type NearbyWalkingRouteProvider = (
  origin: Pick<NearbyJourneyPoint, "lon" | "lat">,
  destination: Pick<NearbyJourneyPoint, "lon" | "lat">,
) => Promise<NearbyWalkingRouteResult | undefined>;

/** @deprecated Use TravelRoutesProvider in new integrations. */
export type JourneyProvider = TravelRoutesProvider;

export interface NearbyHeavyTransportAccess {
  kind: "direct" | "connection";
  walkingSeconds: number;
  totalWalkingSeconds?: number;
  /** Full elapsed duration returned by the journey provider. */
  totalSeconds: number;
  /** Movement time, excluding explicit waiting/boarding sections. */
  movementSeconds?: number;
  /** Initial wait removed from the duration shown by the score. */
  initialWaitSeconds?: number;
  /** Duration used for labels and eligibility after the initial wait policy. */
  scoreSeconds?: number;
  /** Backward-compatible alias for scoreSeconds in persisted/test data. */
  travelSeconds?: number;
  feederLineId?: string;
  feederLineCode?: string;
  feederMode?: GlobalMapMode;
  feederRideSeconds?: number;
}

export interface NearbyHeavyAccessPresentation {
  kind: "walking" | "connection" | "feeder";
  minutes: number;
  mode?: GlobalMapMode;
}

export interface NearbyHeavyTransportCandidate {
  id: string;
  entry: NearbyStationEntry;
  station: GlobalMapStation;
  lines: GlobalMapLine[];
  distanceMeters: number;
  access: NearbyHeavyTransportAccess;
  accessByLine: Readonly<Record<string, NearbyHeavyTransportAccess>>;
  /** All valid access routes, ordered with the recommended route first. */
  accessAlternatives?: readonly NearbyHeavyTransportAccess[];
  /** All valid access routes for each target heavy line. */
  accessAlternativesByLine?: Readonly<Record<string, readonly NearbyHeavyTransportAccess[]>>;
  /** Physical feeder lines found around a projected heavy station. */
  correspondenceLines?: readonly GlobalMapLine[];
  /** Future GPE projects whose line access was resolved by the heavy resolver. */
  futureProjectsByLine?: Readonly<Record<string, PublicFutureGpeStation>>;
  projected: boolean;
}

/**
 * Return the broad cardinal sector of a heavy station from the origin.
 * The map only exposes four edge sectors, so diagonal positions are assigned
 * deterministically without pretending to know a transit direction from
 * station order. A diagonal is kept in the north/south sector unless its east/west
 * displacement is at least twice as large. This matches the map's broad edge
 * sectors and prevents two nearby stations on the same upper/lower edge from
 * producing duplicate projected badges.
 */
export function getNearbyHeavyCardinalDirection(
  origin: Pick<GeocoderPoint, "lon" | "lat">,
  station: Pick<GlobalMapStation, "lon" | "lat">,
): NearbyHeavyCardinalDirection {
  const northMeters = (station.lat - origin.lat) * 111_320;
  const eastMeters = (station.lon - origin.lon) * 111_320 * Math.cos((origin.lat * Math.PI) / 180);

  if (Math.abs(eastMeters) >= Math.abs(northMeters) * NEARBY_HEAVY_CARDINAL_AXIS_RATIO) {
    return eastMeters >= 0 ? "E" : "W";
  }
  return northMeters >= 0 ? "N" : "S";
}

/**
 * Limit only projected heavy stations to one physical station per line and
 * cardinal sector. In-radius stations are never removed. A hub that serves
 * several heavy lines is kept when it wins at least one of those line/sector
 * groups, because the station is a single physical target on the map. Within
 * a group, the fastest access for that heavy line wins; walking time and then
 * geographic distance are only tie-breakers.
 */
export function limitNearbyHeavyProjectedStations(
  candidates: readonly NearbyHeavyTransportCandidate[],
  origin: Pick<GeocoderPoint, "lon" | "lat">,
): NearbyHeavyTransportCandidate[] {
  const winners = new Map<string, NearbyHeavyTransportCandidate>();

  for (const candidate of candidates) {
    if (!candidate.projected) continue;
    const direction = getNearbyHeavyCardinalDirection(origin, candidate.station);
    for (const line of candidate.lines) {
      const key = `${nearbyHeavyLineKey(line)}:${direction}`;
      const current = winners.get(key);
      const candidateAccess = getNearbyHeavyLineAccess(candidate, line);
      const currentAccess = current ? getNearbyHeavyLineAccess(current, line) : undefined;
      if (!current || compareNearbyHeavyCandidates(candidate, current, candidateAccess, currentAccess) < 0) {
        winners.set(key, candidate);
      }
    }
  }

  const winnerIds = new Set([...winners.values()].map((candidate) => candidate.id));
  return candidates.filter((candidate) => !candidate.projected || winnerIds.has(candidate.id));
}

/**
 * Return the unique heavy lines served by one candidate in a stable display
 * order. Candidate lines are already grouped by the nearby resolver, so this
 * is deliberately a presentation-only filter: it never performs another
 * network or station lookup and excludes local feeder modes such as bus/tram.
 */
export function selectNearbyHeavyCandidateLines(
  candidate: Pick<NearbyHeavyTransportCandidate, "lines">,
): GlobalMapLine[] {
  const seen = new Set<string>();
  return candidate.lines
    .filter((line) => NEARBY_HEAVY_TRANSPORT_MODES.includes(line.mode))
    .filter((line) => {
      const key = nearbyHeavyLineKey(line);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => {
      const modeOrder = NEARBY_HEAVY_LINE_MODE_ORDER.indexOf(left.mode) -
        NEARBY_HEAVY_LINE_MODE_ORDER.indexOf(right.mode);
      if (modeOrder !== 0) return modeOrder;

      return (left.code || left.label).localeCompare(right.code || right.label, "fr", { numeric: true }) ||
        left.label.localeCompare(right.label, "fr") ||
        left.id.localeCompare(right.id, "fr");
    });
}

function nearbyHeavyLineKey(line: Pick<GlobalMapLine, "id" | "code">): string {
  const code = line.code.trim();
  return code ? `code:${code.toLocaleLowerCase("fr-FR")}` : `id:${line.id}`;
}

function getNearbyHeavyLineAccess(
  candidate: NearbyHeavyTransportCandidate,
  line: Pick<GlobalMapLine, "id" | "code">,
): NearbyHeavyTransportAccess {
  const exactAccess = candidate.accessByLine[line.id];
  if (exactAccess) return exactAccess;

  const matchingLine = candidate.lines.find((candidateLine) =>
    nearbyHeavyLineKey(candidateLine) === nearbyHeavyLineKey(line),
  );
  return (matchingLine && candidate.accessByLine[matchingLine.id]) ?? candidate.access;
}

function compareNearbyHeavyCandidates(
  left: NearbyHeavyTransportCandidate,
  right: NearbyHeavyTransportCandidate,
  leftAccess: NearbyHeavyTransportAccess = left.access,
  rightAccess: NearbyHeavyTransportAccess = right.access,
): number {
  return getNearbyHeavyAccessTravelSeconds(leftAccess) - getNearbyHeavyAccessTravelSeconds(rightAccess) ||
    leftAccess.totalSeconds - rightAccess.totalSeconds ||
    leftAccess.walkingSeconds - rightAccess.walkingSeconds ||
    left.distanceMeters - right.distanceMeters ||
    left.station.name.localeCompare(right.station.name, "fr");
}

export interface HeavyJourneyEvaluationInput {
  journey: NearbyJourney;
  stationDistanceMeters: number;
  localLineIds?: ReadonlySet<string>;
  localLineCodes?: ReadonlySet<string>;
}

export interface HeavyJourneyEvaluation {
  kind: "direct" | "connection";
  walkingSeconds: number;
  totalWalkingSeconds: number;
  movementSeconds: number;
  initialWaitSeconds: number;
  scoreSeconds: number;
  travelSeconds: number;
  totalSeconds: number;
  feederLineId?: string;
  feederLineCode?: string;
  feederMode?: GlobalMapMode;
  feederRideSeconds?: number;
}
