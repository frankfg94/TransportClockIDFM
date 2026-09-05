import { canonicalGtfsTimetableStationId } from "./lineFrequencyTimetableIntervals";

export type LineFrequencyCompassPoint =
  | "north"
  | "south"
  | "east"
  | "west"
  | "north-east"
  | "north-west"
  | "south-east"
  | "south-west";

export interface LineFrequencyStationCoordinate {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface LineFrequencyCompassDirection {
  from: LineFrequencyCompassPoint;
  to: LineFrequencyCompassPoint;
}

interface LineFrequencyEndpoint {
  id: string;
  name: string;
}

const DIAGONAL_COMPONENT_RATIO = Math.tan(Math.PI / 8);

function normalizedName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function findCoordinate(
  endpoint: LineFrequencyEndpoint,
  stations: readonly LineFrequencyStationCoordinate[],
): LineFrequencyStationCoordinate | undefined {
  return (
    stations.find((station) => station.id === endpoint.id) ??
    stations.find(
      (station) =>
        canonicalGtfsTimetableStationId(station.id) ===
        canonicalGtfsTimetableStationId(endpoint.id),
    ) ??
    stations.find((station) => normalizedName(station.name) === normalizedName(endpoint.name))
  );
}

function diagonalPoint(
  vertical: "north" | "south",
  horizontal: "east" | "west",
): LineFrequencyCompassPoint {
  if (vertical === "north") return horizontal === "east" ? "north-east" : "north-west";
  return horizontal === "east" ? "south-east" : "south-west";
}

/**
 * Infers an eight-point compass orientation from the endpoints of a timetable
 * section. A diagonal is used when the latitude and longitude components are
 * both at least as significant as the 22.5° boundary of an octant; otherwise
 * the dominant axis produces a cardinal direction. It intentionally returns
 * no value when coordinates are unavailable or the two endpoints overlap,
 * rather than inventing a compass direction.
 */
export function inferLineFrequencyCompassDirection(
  from: LineFrequencyEndpoint,
  to: LineFrequencyEndpoint,
  stations: readonly LineFrequencyStationCoordinate[],
): LineFrequencyCompassDirection | undefined {
  const fromCoordinate = findCoordinate(from, stations);
  const toCoordinate = findCoordinate(to, stations);
  if (
    !fromCoordinate ||
    !toCoordinate ||
    !Number.isFinite(fromCoordinate.lat) ||
    !Number.isFinite(fromCoordinate.lon) ||
    !Number.isFinite(toCoordinate.lat) ||
    !Number.isFinite(toCoordinate.lon)
  ) {
    return undefined;
  }

  const latitudeDelta = toCoordinate.lat - fromCoordinate.lat;
  const longitudeDelta =
    (toCoordinate.lon - fromCoordinate.lon) *
    Math.cos(((fromCoordinate.lat + toCoordinate.lat) / 2) * (Math.PI / 180));
  if (latitudeDelta === 0 && longitudeDelta === 0) return undefined;

  const absoluteLatitudeDelta = Math.abs(latitudeDelta);
  const absoluteLongitudeDelta = Math.abs(longitudeDelta);
  if (absoluteLatitudeDelta > 0 && absoluteLongitudeDelta > 0) {
    const longitudeToLatitudeRatio = absoluteLongitudeDelta / absoluteLatitudeDelta;
    const latitudeToLongitudeRatio = absoluteLatitudeDelta / absoluteLongitudeDelta;
    if (
      longitudeToLatitudeRatio >= DIAGONAL_COMPONENT_RATIO &&
      latitudeToLongitudeRatio >= DIAGONAL_COMPONENT_RATIO
    ) {
      const toVertical = latitudeDelta > 0 ? "north" : "south";
      const toHorizontal = longitudeDelta > 0 ? "east" : "west";
      const fromVertical = latitudeDelta > 0 ? "south" : "north";
      const fromHorizontal = longitudeDelta > 0 ? "west" : "east";
      return {
        from: diagonalPoint(fromVertical, fromHorizontal),
        to: diagonalPoint(toVertical, toHorizontal),
      };
    }
  }

  if (absoluteLatitudeDelta >= absoluteLongitudeDelta) {
    return latitudeDelta > 0 ? { from: "south", to: "north" } : { from: "north", to: "south" };
  }

  return longitudeDelta > 0 ? { from: "west", to: "east" } : { from: "east", to: "west" };
}
