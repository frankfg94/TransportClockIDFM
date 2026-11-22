import { isNearbyPlaceActivity, isNearbyPlaceCommerce, resolveNearbyPlaceGroupId, type NearbyPlaceGroupId } from "../nearbyPlacePresentation";
import type { NearbyPlace } from "../nearbyPlaces";
import type { CompiledPlaceRecord } from "../../../services/places/compiledPlaces";
import type { TransportMapNetwork } from "../../transport-map/contracts/network";
import { countIrisTransport, countIrisTransportInNeighborhoods, pointInIrisGeometry, transportStationsFromNetwork } from "../../transport-map/iris/irisGeometry";
import type { ComparisonNeighborhood } from "./types";
import { economyGroup, COMPARISON_EXCLUDED_TRANSPORT_MODES, type EconomyGroup } from "./neighborhoodComparisonRules";
export { comparisonScope, perSquareKilometer, type EconomyGroup } from "./neighborhoodComparisonRules";
import { geometryBounds, pointOnBoundary } from "./geometry";
export { placesCityCode } from "./geometry";


export interface ComparisonPlaceCounts {
  commerce: number;
  commerceGroups: Partial<Record<NearbyPlaceGroupId, number>>;
  economic: number;
  economyGroups: Partial<Record<EconomyGroup, number>>;
}
export interface ComparisonPlaceAggregation {
  counts: Record<string, ComparisonPlaceCounts>;
  assigned: number;
  outside: number;
  ambiguous: number;
  sample: number;
}
export type ComparisonTheme = "commerce" | "economic" | "green" | "transport";
export type ComparisonMeasure = "count" | "density" | "diversity" | "area" | "share" | "lines" | "stations";

function createPlaceAggregator(neighborhoods: readonly ComparisonNeighborhood[]) {
  const counts: Record<string, ComparisonPlaceCounts> = {};
  const grid = new Map<string, number[]>();
  const cellSize = .01;
  const key = (x: number, y: number) => `${x}:${y}`;
  const indexed = neighborhoods.map(neighborhood => {
    counts[neighborhood.codeIris] = { commerce: 0, commerceGroups: {}, economic: 0, economyGroups: {} };
    const box = geometryBounds(neighborhood.geometry);
    return { neighborhood, box };
  });
  indexed.forEach(({ box }, index) => {
    const epsilon = 1e-9;
    for (let x = Math.floor((box[0] - epsilon) / cellSize); x <= Math.floor((box[2] + epsilon) / cellSize); x++) {
      for (let y = Math.floor((box[1] - epsilon) / cellSize); y <= Math.floor((box[3] + epsilon) / cellSize); y++) {
        const bucketKey = key(x, y), bucket = grid.get(bucketKey) ?? [];
        bucket.push(index); grid.set(bucketKey, bucket);
      }
    }
  });
  let assigned = 0, outside = 0, ambiguous = 0;
  function add(place: CompiledPlaceRecord): void {
    const matches = (grid.get(key(Math.floor(place.lon / cellSize), Math.floor(place.lat / cellSize))) ?? [])
      .map(index => indexed[index]!)
      .filter(({ neighborhood, box }) => place.lon >= box[0] - 1e-9 && place.lon <= box[2] + 1e-9 && place.lat >= box[1] - 1e-9 && place.lat <= box[3] + 1e-9 && (pointInIrisGeometry(place, neighborhood.geometry) || pointOnBoundary(neighborhood.geometry, place)));
    if (!matches.length) { outside++; return; }
    if (matches.length > 1) { ambiguous++; return; }
    assigned++;
    const target = counts[matches[0]!.neighborhood.codeIris]!;
    if (isNearbyPlaceCommerce(place)) {
      target.commerce++;
      const group = resolveNearbyPlaceGroupId({ ...place, distanceMeters: 0 } as NearbyPlace);
      target.commerceGroups[group] = (target.commerceGroups[group] ?? 0) + 1;
    }
    if (isNearbyPlaceActivity(place, "economic")) {
      target.economic++;
      const group = economyGroup(place);
      target.economyGroups[group] = (target.economyGroups[group] ?? 0) + 1;
    }
  }
  return { add, result: (sample: number): ComparisonPlaceAggregation => ({ counts, assigned, outside, ambiguous, sample }) };
}

/** Classify each source point once; ambiguous boundary points are excluded. */
export function aggregateComparisonPlaces(neighborhoods: readonly ComparisonNeighborhood[], places: readonly CompiledPlaceRecord[]): ComparisonPlaceAggregation {
  const aggregator = createPlaceAggregator(neighborhoods);
  for (const place of places) aggregator.add(place);
  return aggregator.result(places.length);
}

/** Yield between batches so large municipal files remain responsive on mobile. */
export async function aggregateComparisonPlacesAsync(neighborhoods: readonly ComparisonNeighborhood[], places: readonly CompiledPlaceRecord[], signal: AbortSignal): Promise<ComparisonPlaceAggregation> {
  signal.throwIfAborted();
  const aggregator = createPlaceAggregator(neighborhoods);
  for (let index = 0; index < places.length; index++) {
    aggregator.add(places[index]!);
    if (index % 2_000 === 1_999) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      signal.throwIfAborted();
    }
  }
  signal.throwIfAborted();
  return aggregator.result(places.length);
}

/** Uses the already-loaded catalogue; it never performs routing or timetable calls. */
function comparisonStations(network: TransportMapNetwork) {
  return transportStationsFromNetwork(network.stations, network.linesById).map(station => ({
    ...station,
    lines: station.lines.filter(line => !COMPARISON_EXCLUDED_TRANSPORT_MODES.has(line.mode)),
  })).filter(station => station.lines.length > 0);
}

export function aggregateComparisonTransport(neighborhoods: readonly ComparisonNeighborhood[], network: TransportMapNetwork) {
  return countIrisTransport(neighborhoods, comparisonStations(network));
}

export function aggregateComparisonScopeTransport(neighborhoods: readonly ComparisonNeighborhood[], network: TransportMapNetwork) {
  return countIrisTransportInNeighborhoods(neighborhoods, comparisonStations(network));
}
