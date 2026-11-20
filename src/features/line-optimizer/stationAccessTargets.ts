import { getCoordinatesDistanceMeters } from "../../services/distance";
import { searchNavitiaDestinationPoints } from "../../services/idfm";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import type { GlobalMapEntrance, GlobalMapLine, GlobalMapStation } from "../transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../transport-map/contracts/network";
import type { GtfsLineTimetableResponse } from "../../types/lineFrequencyTimetable";
import type { GpeMapStation } from "../transport-map/gpeStationsApi";
import { metroLineCode } from "../nearby-stations/futureGpeProjects";
import { getOfficialStationReference, normalizeStationName } from "../nearby-stations/neighborhoodStationReferences";

export type StationAccessCatalog = Pick<TransportMapNetwork, "lines" | "stations" | "entrances">;

export interface StationAccessLine {
  id: string;
  code: string;
  mode: GlobalMapLine["mode"];
  current?: GlobalMapLine;
  projects: GpeMapStation[];
}

export interface StationAccessTarget {
  id: string;
  point: GeocoderPoint & { label: string };
  distanceMeters: number;
  future: boolean;
  arrivalAtExistingStation?: boolean;
  approximate: boolean;
}

/** The GPE catalogue also carries interchange codes such as "1514". */
function projectLineCodes(value: string): string[] {
  return metroLineCode(value).match(/1[4-8]/gu) ?? [];
}

function currentMetroCode(line: GlobalMapLine): string {
  return [line.label, line.code, ...(line.aliases ?? [])].map(metroLineCode)
    .find((code) => /^\d+(?:bis)?$/u.test(code)) ?? line.code;
}

export function publicTimetableStations(timetable: GtfsLineTimetableResponse): ReadonlySet<string> {
  const served = new Set(timetable.trips.flatMap(({ calls }) => calls
    .filter((call) => call.pickupType !== 1 || call.dropOffType !== 1)
    .map(({ stopId }) => stopId)));
  return new Set(timetable.stops.filter(({ id }) => served.has(id))
    .flatMap(({ name, topologyId }) => [normalizeStationName(name), ...(topologyId ? [topologyId] : [])]));
}

export function stationAccessLines(
  network: StationAccessCatalog | undefined,
  projects: readonly GpeMapStation[],
): StationAccessLine[] {
  const lines = (network?.lines ?? [])
    .filter((line) => line.mode !== "BIKE" && line.stationIds.length > 0)
    .map((line): StationAccessLine => ({
      id: line.id,
      code: line.mode === "METRO" ? currentMetroCode(line) : line.code,
      mode: line.mode,
      current: line,
      projects: [],
    }));
  const metroByCode = new Map(lines.filter((line) => line.mode === "METRO").map((line) => [line.code, line]));
  for (const project of projects) {
    for (const code of new Set(projectLineCodes(project.line))) {
      let line = metroByCode.get(code);
      if (!line) {
        line = { id: `gpe:${code}`, code, mode: "METRO", projects: [] };
        metroByCode.set(code, line);
        lines.push(line);
      }
      line.projects.push(project);
    }
  }
  return lines;
}

function distance(a: Pick<GeocoderPoint, "lat" | "lon">, b: Pick<GeocoderPoint, "lat" | "lon">) {
  return getCoordinatesDistanceMeters(a.lat, a.lon, b.lat, b.lon);
}

// A project pin can be offset from the platforms of an existing named interchange.
const PROJECT_STATION_MATCH_RADIUS_METERS = 500;
const HUB_STOP_AREA_MATCH_RADIUS_METERS = 250;
const HUB_RAIL_MODES: ReadonlySet<GlobalMapLine["mode"]> = new Set(["METRO", "RER", "TRAIN", "TRANSILIEN", "TRAM"]);
const NAVITIA_STOP_AREA = /^stop_area:IDFM:\d+$/u;

/** Some mapped rail stops have no Navitia identifier in the local catalogue. */
export async function resolveStationAccessDestination(
  target: StationAccessTarget,
  signal: AbortSignal,
  search = searchNavitiaDestinationPoints,
): Promise<StationAccessTarget["point"]> {
  const { point } = target;
  if (!target.arrivalAtExistingStation || point.id) return point;
  const places = await search(point.label, { includeStations: true, count: 8 }, { signal })
    .catch(() => []);
  signal.throwIfAborted();
  const name = normalizeStationName(point.label);
  const matches = places.filter((place) => place.id && NAVITIA_STOP_AREA.test(place.id) &&
    normalizeStationName((place.label ?? "").replace(/\s*\([^()]*\)\s*$/u, "")) === name &&
    distance(point, place) <= HUB_STOP_AREA_MATCH_RADIUS_METERS);
  const references = new Set(matches.map(({ id }) => id));
  return references.size === 1 ? { ...point, id: matches[0]!.id } : point;
}

export function stationAccessTargets(
  line: StationAccessLine,
  network: StationAccessCatalog | undefined,
  origin: GeocoderPoint,
  radiusMeters: number,
  publicStations?: ReadonlySet<string>,
): StationAccessTarget[] {
  const stations: GlobalMapStation[] = [];
  if (line.current && network) {
    const lineStationIds = new Set(line.current.stationIds);
    for (const station of network.stations) {
      if (lineStationIds.has(station.id) || station.lineIds.includes(line.current.id)) {
        stations.push(station);
      }
    }
  }
  const stationIds = new Set(stations.map(({ id }) => id));
  const entrances = new Map<string, GlobalMapEntrance>();
  for (const entrance of network?.entrances ?? []) {
    if (!stationIds.has(entrance.stationId)) continue;
    const previous = entrances.get(entrance.stationId);
    if (!previous || distance(origin, entrance) < distance(origin, previous)) {
      entrances.set(entrance.stationId, entrance);
    }
  }

  const current = stations.map((station) => ({
    station,
    reference: getOfficialStationReference(station),
    names: new Set([station.name, ...station.aliases].map(normalizeStationName)),
  }));
  const targets: StationAccessTarget[] = [];
  const matched = new Set<string>();
  const railLineIds = new Set((network?.lines ?? [])
    .filter(({ mode }) => HUB_RAIL_MODES.has(mode))
    .map(({ id }) => id));
  const existingHubs = line.projects.length ? (network?.stations ?? []).flatMap((station) => {
    if (!station.lineIds.some((id) => railLineIds.has(id))) return [];
    const reference = getOfficialStationReference(station);
    return [{
      station,
      reference: reference && NAVITIA_STOP_AREA.test(reference) ? reference : undefined,
      names: new Set([station.name, ...station.aliases].map(normalizeStationName)),
    }];
  }) : [];
  function addStation(station: GlobalMapStation) {
    const entrance = entrances.get(station.id);
    targets.push({
      id: station.id,
      point: { label: station.name, lat: entrance?.lat ?? station.lat, lon: entrance?.lon ?? station.lon },
      distanceMeters: distance(origin, station),
      future: false,
      approximate: !entrance,
    });
  }

  for (const project of line.projects) {
    const name = normalizeStationName(project.name);
    const matches = current.filter(({ station, names }) =>
      names.has(name) && distance(station, project) <= PROJECT_STATION_MATCH_RADIUS_METERS);
    if (matches.length === 0) {
      const nearby = current.filter(({ station }) => distance(station, project) <= 120);
      if (nearby.length === 1) matches.push(nearby[0]!);
    }
    matches.sort((a, b) =>
      Number(entrances.has(b.station.id)) - Number(entrances.has(a.station.id)) ||
      distance(a.station, project) - distance(b.station, project));
    for (const { station } of matches) matched.add(station.id);
    const servingStation = matches.find(({ station, names }) =>
      publicStations?.has(station.id) || [...names, name].some((key) => publicStations?.has(key)));
    const openStation = servingStation ?? (project.projectStatus === "open" ? matches[0] : undefined);
    if (openStation) {
      addStation(openStation.station);
      continue;
    }
    const future = project.projectStatus !== "open";
    // Stop at an identified rail hub when a future line will connect there.
    // Its official Navitia stop area avoids a detour to the construction site.
    const hub = future ? existingHubs
      .filter(({ station, names }) =>
        names.has(name) && distance(station, project) <= PROJECT_STATION_MATCH_RADIUS_METERS)
      .sort((a, b) => Number(Boolean(b.reference)) - Number(Boolean(a.reference)) ||
        distance(a.station, project) - distance(b.station, project))[0] : undefined;
    const location = hub?.station ?? project;
    targets.push({
      id: `gpe:${project.id}`,
      point: {
        label: project.name, lat: location.lat, lon: location.lon,
        ...(hub ? { id: hub.reference, type: "station" } : {}),
      },
      // Keep the target in range when either the project or its existing hub is nearby.
      distanceMeters: Math.min(distance(origin, project), distance(origin, location)),
      future,
      ...(hub ? { arrivalAtExistingStation: true } : {}),
      approximate: !hub,
    });
  }

  const kept: typeof current = [];
  for (const candidate of current.filter(({ station }) => !matched.has(station.id)).sort((a, b) =>
    Number(entrances.has(b.station.id)) - Number(entrances.has(a.station.id)) ||
    distance(origin, a.station) - distance(origin, b.station))) {
    const { station, reference, names } = candidate;
    if (kept.some((other) => (reference && reference === other.reference) ||
      (distance(station, other.station) <= 80 && [...names].some((name) => other.names.has(name))))) continue;
    kept.push(candidate);
    addStation(station);
  }
  return [...new Map(targets.map((target) => [target.id, target])).values()]
    .filter((target) => target.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.point.label.localeCompare(b.point.label, "fr"));
}
