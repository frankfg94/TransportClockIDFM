import type { GlobalMapStation } from "../transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../transport-map/contracts/network";
import { normalizeGlobalMapSearchText } from "../transport-map/search/globalMapSearch";
import { queryStationsWithinRadius } from "../transport-map/spatial/radiusQuery";
import type { PackedSpatialIndex } from "../transport-map/spatial/packedIndex";
import { getCoordinatesDistanceMeters } from "../../services/distance";
import type { NearbyJourneyPoint, NearbyJourneySection, RouteExit } from "./nearbyHeavyTransports";

export type TravelBoundarySide = "from" | "to";

export const MAX_RELIABLE_BOUNDARY_DISTANCE_METERS = 500;
export const MAX_ROUTE_EXIT_FALLBACK_DISTANCE_METERS = 200;

/** Return the provider's display name for one end of a journey section. */
export function travelBoundaryName(
  section: NearbyJourneySection,
  side: TravelBoundarySide,
): string | undefined {
  return side === "from"
    ? section.fromName ?? section.stopNames?.[0]
    : section.toName ?? section.stopNames?.at(-1);
}

/**
 * Keep the provider's complete name first, then allow its trailing locality
 * qualifier to be removed. Navitia commonly returns `Station (Paris)` while
 * the static catalogue stores `Station`; the full-name candidate remains the
 * preferred match and the line/coordinate guards below still reject homonyms.
 */
function travelBoundaryNameVariants(value: string): string[] {
  const candidates = [
    value,
    value.replace(/\s*\([^()]*\)\s*$/u, ""),
  ];
  return [...new Set(candidates
    .map((candidate) => normalizeGlobalMapSearchText(candidate))
    .filter(Boolean))];
}

export function travelBoundaryReferences(section: NearbyJourneySection): string[] {
  return [section.lineId, section.lineCode, ...(section.lineAliases ?? [])]
    .map((value) => normalizeGlobalMapSearchText(value ?? ""))
    .filter(Boolean);
}

export interface TravelBoundaryResolutionOptions {
  network?: TransportMapNetwork;
  section: NearbyJourneySection;
  side: TravelBoundarySide;
  fallback?: NearbyJourneyPoint;
  /** Optional narrowed candidates, used by the nearby-stations page. */
  candidates?: readonly GlobalMapStation[];
  /** Optional packed index used to derive nearby candidates without scanning all names. */
  stationIndex?: PackedSpatialIndex;
}

/**
 * Resolve a journey boundary only when its station name and served line
 * references agree. Coordinates are used as a final proximity guard and
 * deterministic tie-breaker, so similarly named stations cannot leak exits.
 */
export function resolveTravelBoundaryStation(
  options: TravelBoundaryResolutionOptions,
): GlobalMapStation | undefined {
  const targetNames = new Set(
    travelBoundaryNameVariants(travelBoundaryName(options.section, options.side) ?? ""),
  );
  if (targetNames.size === 0) return undefined;

  const lineReferences = new Set(travelBoundaryReferences(options.section));
  const stations = options.candidates ?? (
    options.stationIndex && options.fallback && options.network
      ? queryStationsWithinRadius(
        options.network.stations,
        options.fallback,
        MAX_RELIABLE_BOUNDARY_DISTANCE_METERS,
        Number.POSITIVE_INFINITY,
        0,
        options.stationIndex,
      ).map((result) => result.station)
      : options.network?.stations ?? []
  );
  const scored = stations.flatMap((station) => {
    const names = new Set(
      [station.name, station.normalizedName, ...station.aliases]
        .flatMap((value) => travelBoundaryNameVariants(value)),
    );
    if (![...targetNames].some((target) => names.has(target))) return [];

    const stationReferences = new Set(
      [
        station.id,
        ...station.lineIds,
        ...station.lineIds.flatMap((lineId) => {
          const line = options.network?.linesById.get(lineId);
          return line ? [line.id, line.code, line.label, ...line.aliases] : [];
        }),
      ]
        .map((value) => normalizeGlobalMapSearchText(value))
        .filter(Boolean),
    );
    if (lineReferences.size > 0 && ![...lineReferences].some((reference) => stationReferences.has(reference))) {
      return [];
    }

    const distanceMeters = options.fallback
      ? getCoordinatesDistanceMeters(options.fallback.lat, options.fallback.lon, station.lat, station.lon)
      : 0;
    if (options.fallback && distanceMeters > MAX_RELIABLE_BOUNDARY_DISTANCE_METERS) return [];

    return [{
      station,
      score: 100 + (lineReferences.size > 0 ? 40 : 0),
      distanceMeters,
    }];
  }).sort((left, right) => right.score - left.score
    || left.distanceMeters - right.distanceMeters
    || left.station.name.localeCompare(right.station.name, "fr-FR")
    || left.station.id.localeCompare(right.station.id, "fr-FR"));

  return scored[0]?.station;
}

export function resolveTravelBoundaryPoint(
  options: TravelBoundaryResolutionOptions,
): NearbyJourneyPoint | undefined {
  const station = resolveTravelBoundaryStation(options);
  return station ? { lon: station.lon, lat: station.lat } : undefined;
}

/** Build the same deterministic, display-ready exit list for every consumer. */
export function createRouteExitsForStation(
  network: TransportMapNetwork,
  stationId: string,
): RouteExit[] {
  const directExits = network.entrances.filter((entrance) => entrance.stationId === stationId);
  const station = network.stationsById.get(stationId);
  const entrances = directExits.length > 0 || !station
    ? directExits
    : network.entrances
      .map((entrance) => ({
        entrance,
        distanceMeters: getCoordinatesDistanceMeters(station.lat, station.lon, entrance.lat, entrance.lon),
      }))
      .filter(({ distanceMeters }) => distanceMeters <= MAX_ROUTE_EXIT_FALLBACK_DISTANCE_METERS)
      .sort((left, right) => left.distanceMeters - right.distanceMeters)
      .map(({ entrance }) => entrance);

  return entrances.map((entrance) => ({
    id: entrance.id,
    stationId: entrance.stationId,
    name: entrance.name.trim() || entrance.code?.trim() || "",
    ...(entrance.code?.trim() ? { code: entrance.code.trim() } : {}),
    lon: entrance.lon,
    lat: entrance.lat,
  }))
    .filter((exit) =>
      Boolean(exit.name)
      && Number.isFinite(exit.lon)
      && Number.isFinite(exit.lat),
    )
    .sort((left, right) => {
      const leftCode = left.code ?? "";
      const rightCode = right.code ?? "";
      return (leftCode ? 0 : 1) - (rightCode ? 0 : 1)
        || leftCode.localeCompare(rightCode, "fr-FR", { numeric: true })
        || left.name.localeCompare(right.name, "fr-FR", { numeric: true })
        || left.id.localeCompare(right.id, "fr-FR");
    });
}

/**
 * Pick the exit that minimizes the final walk to the journey destination.
 * The map still receives the complete exit list; this helper is only for the
 * single exit presented in the itinerary sidebar.
 */
export function selectFastestRouteExit(
  exits: readonly RouteExit[],
  destination?: NearbyJourneyPoint,
): RouteExit | undefined {
  if (exits.length === 0) return undefined;
  if (!destination) return exits[0];

  return exits.reduce<RouteExit | undefined>((best, candidate) => {
    if (!best) return candidate;

    const candidateDistance = getCoordinatesDistanceMeters(
      destination.lat,
      destination.lon,
      candidate.lat,
      candidate.lon,
    );
    const bestDistance = getCoordinatesDistanceMeters(
      destination.lat,
      destination.lon,
      best.lat,
      best.lon,
    );
    if (candidateDistance < bestDistance) return candidate;
    if (candidateDistance > bestDistance) return best;

    return compareRouteExitDisplayOrder(candidate, best) < 0 ? candidate : best;
  }, undefined);
}

function compareRouteExitDisplayOrder(left: RouteExit, right: RouteExit): number {
  const leftCode = left.code ?? "";
  const rightCode = right.code ?? "";
  return (leftCode ? 0 : 1) - (rightCode ? 0 : 1)
    || leftCode.localeCompare(rightCode, "fr-FR", { numeric: true })
    || left.name.localeCompare(right.name, "fr-FR", { numeric: true })
    || left.id.localeCompare(right.id, "fr-FR");
}
