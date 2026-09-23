import type {
  GlobalMapLine,
  GlobalMapPath,
  GlobalMapStation,
} from "../transport-map/contracts/manifest";
import { getCoordinatesDistanceKm } from "../../services/distance";
import { worldToLonLat } from "../transport-map/geo/coordinateKernel";
import {
  getGlobalMapPathSubpathRanges,
  resolveGlobalMapVertex,
} from "../transport-map/contracts/manifest";

export interface GlobalLineMetadata {
  stations: GlobalMapStation[];
  stationCount: number;
  cities: string[];
  firstStation?: GlobalMapStation;
  lastStation?: GlobalMapStation;
  lengthKm?: number;
  connectionLineIds: string[];
  pathCount: number;
  geometrySources: string[];
}

export interface GlobalLineConnectionStation {
  station: GlobalMapStation;
  lineIds: string[];
}

export function isBusOrNoctilienLine(line: Pick<GlobalMapLine, "mode">): boolean {
  return line.mode === "BUS" || line.mode === "NOCTILIEN";
}

export function filterGlobalLineConnections(
  lines: readonly GlobalMapLine[],
  showBusCorrespondences: boolean,
): GlobalMapLine[] {
  return lines.filter((line) => showBusCorrespondences || !isBusOrNoctilienLine(line));
}

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

function pathLengthKm(path: GlobalMapPath): number | undefined {
  if (path.vertices.length < 2) {
    return undefined;
  }

  let lengthKm = 0;

  for (const { start, end } of getGlobalMapPathSubpathRanges(path)) {
    for (let index = start + 1; index < end; index += 1) {
      const previous = resolveGlobalMapVertex(path, path.vertices[index - 1]);
      const current = resolveGlobalMapVertex(path, path.vertices[index]);

      try {
        const previousLonLat = worldToLonLat(previous);
        const currentLonLat = worldToLonLat(current);
        lengthKm += getCoordinatesDistanceKm(
          previousLonLat.lat,
          previousLonLat.lon,
          currentLonLat.lat,
          currentLonLat.lon,
        );
      } catch {
        return undefined;
      }
    }
  }

  return lengthKm > 0 ? lengthKm : undefined;
}

function stationsLengthKm(stations: GlobalMapStation[]): number | undefined {
  if (stations.length < 2) {
    return undefined;
  }

  let lengthKm = 0;

  for (let index = 1; index < stations.length; index += 1) {
    const previous = stations[index - 1];
    const current = stations[index];

    if (
      typeof previous.lat !== "number" ||
      typeof previous.lon !== "number" ||
      typeof current.lat !== "number" ||
      typeof current.lon !== "number"
    ) {
      continue;
    }

    lengthKm += getCoordinatesDistanceKm(
      previous.lat,
      previous.lon,
      current.lat,
      current.lon,
    );
  }

  return lengthKm > 0 ? lengthKm : undefined;
}

/**
 * Resolves the line ids that can be shown next to each station of a selected
 * line. Direct station memberships are preferred; nearby physical hub records
 * are reconciled using the same conservative 350 m rule as the line profile.
 */
export function buildGlobalLineConnectionStations(
  line: GlobalMapLine,
  stations: GlobalMapStation[],
): GlobalLineConnectionStation[] {
  const stationsById = new Map(stations.map((station) => [station.id, station]));
  const lineStations = line.stationIds
    .map((stationId) => stationsById.get(stationId))
    .filter((station): station is GlobalMapStation => Boolean(station));
  const lineStationGroups = new Map<string, GlobalLineConnectionStation>();

  for (const station of lineStations) {
    const group: GlobalLineConnectionStation = {
      station,
      lineIds: [],
    };
    for (const lineId of station.lineIds) {
      if (lineId !== line.id && !group.lineIds.includes(lineId)) {
        group.lineIds.push(lineId);
      }
    }
    lineStationGroups.set(station.id, group);
  }

  // The global pack keeps the route quays as separate stations. Transfers
  // therefore often live in neighbouring physical stop records rather than
  // in the selected line's own station.lineIds.
  const latitudeCellSize = 0.0045;
  const longitudeCellSize = 0.0065;
  const stationCells = new Map<string, GlobalMapStation[]>();
  const cellKey = (latitude: number, longitude: number): string =>
    `${Math.floor(latitude / latitudeCellSize)}:${Math.floor(longitude / longitudeCellSize)}`;

  for (const candidate of stations) {
    if (!candidate.lineIds.length) continue;
    const key = cellKey(candidate.lat, candidate.lon);
    const cell = stationCells.get(key) ?? [];
    cell.push(candidate);
    stationCells.set(key, cell);
  }

  const routeStationNames = new Set(lineStations.map((station) => normalizeLabel(station.name)));
  for (const routeStation of lineStations) {
    const latitudeCell = Math.floor(routeStation.lat / latitudeCellSize);
    const longitudeCell = Math.floor(routeStation.lon / longitudeCellSize);
    for (let latitudeOffset = -1; latitudeOffset <= 1; latitudeOffset += 1) {
      for (let longitudeOffset = -1; longitudeOffset <= 1; longitudeOffset += 1) {
        for (const candidate of stationCells.get(`${latitudeCell + latitudeOffset}:${longitudeCell + longitudeOffset}`) ?? []) {
          if (candidate.id === routeStation.id || lineStationGroups.has(candidate.id)) continue;
          const sameNamedStation = routeStationNames.has(normalizeLabel(candidate.name));
          if (!candidate.isHub && !sameNamedStation) continue;
          if (getCoordinatesDistanceKm(candidate.lat, candidate.lon, routeStation.lat, routeStation.lon) > 0.35) continue;

          const group = lineStationGroups.get(routeStation.id);
          if (!group) continue;
          for (const lineId of candidate.lineIds) {
            if (lineId !== line.id && !group.lineIds.includes(lineId)) {
              group.lineIds.push(lineId);
            }
          }
        }
      }
    }
  }

  return lineStations
    .map((station) => lineStationGroups.get(station.id))
    .filter((group): group is GlobalLineConnectionStation => Boolean(group?.lineIds.length));
}

export function buildGlobalLineMetadata(
  line: GlobalMapLine,
  stations: GlobalMapStation[],
  paths: GlobalMapPath[],
): GlobalLineMetadata {
  const stationsById = new Map(stations.map((station) => [station.id, station]));
  const lineStations = line.stationIds
    .map((stationId) => stationsById.get(stationId))
    .filter((station): station is GlobalMapStation => Boolean(station));
  const linePaths = paths.filter((path) => path.lineId === line.id);

  const cities: string[] = [];
  const cityKeys = new Set<string>();
  for (const station of lineStations) {
    const city = station.city?.trim();
    if (!city) {
      continue;
    }

    const key = normalizeLabel(city);
    if (!cityKeys.has(key)) {
      cityKeys.add(key);
      cities.push(city);
    }
  }

  const connectionLineIds = [...new Set(
    buildGlobalLineConnectionStations(line, stations).flatMap((group) => group.lineIds),
  )];

  // `paths` is a viewport result, so a detailed zoom may contain only one
  // chunk of a line. Measuring that subset makes the profile distance jump
  // from the route length to the visible chunk length while zooming. Regional
  // geometry is authoritative only when every path declared by the line is
  // present; otherwise use the stable ordered station sequence below.
  const completeRegionalGeometry = line.geometryIds.length > 0 &&
    line.geometryIds.every((geometryId) => linePaths.some((path) => path.id === geometryId));
  const pathLengths = completeRegionalGeometry
    ? linePaths
      .map(pathLengthKm)
      .filter((lengthKm): lengthKm is number => typeof lengthKm === "number")
    : [];
  const lengthKm = pathLengths.length
    ? line.mode === "BIKE"
      ? pathLengths.reduce((total, value) => total + value, 0)
      : Math.max(...pathLengths)
    : stationsLengthKm(lineStations);

  return {
    stations: lineStations,
    stationCount: line.stationIds.length || lineStations.length,
    cities,
    firstStation: lineStations[0],
    lastStation: lineStations.at(-1),
    lengthKm,
    connectionLineIds,
    pathCount: linePaths.length,
    geometrySources: [...new Set(linePaths.map((path) => path.geometrySource))],
  };
}
