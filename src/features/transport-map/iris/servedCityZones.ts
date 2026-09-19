import type { GlobalMapStation } from "../contracts/manifest";
import type { TransportMapServedCityZone } from "../contracts/renderer";
import {
  boundarySegmentsForIrisNeighborhoods,
  irisCityKey,
  irisCityName,
  pointInIrisGeometry,
  type IrisBoundarySegment,
} from "./irisGeometry";
import type { IrisDataset, IrisNeighborhood, IrisPolygonGeometry } from "./irisApi";
import { administrativeInteriorPoint, joinAdministrativeBoundarySegments } from "./administrativeGeometry";

interface IrisCityGroup {
  key: string;
  name: string;
  neighborhoods: IrisNeighborhood[];
}

interface Rgb {
  red: number;
  green: number;
  blue: number;
}

interface Hsl {
  hue: number;
  saturation: number;
  lightness: number;
}

const DEFAULT_LINE_HUE = 214;
const DEFAULT_LINE_COLOR = "#2563eb";
const GOLDEN_ANGLE = 137.508;
const MIN_LINE_HUE_DISTANCE = 104;
const EXACT_HUE_SELECTION_MAX_COUNT = 96;
const DEPARTMENT_INNER_BOUNDARY_COLOR = [100, 116, 139, 112] as const;

/** The single camera threshold separating the two global administrative views. */
export const GLOBAL_CITY_VIEW_MIN_ZOOM = 12;

const globalZonesByDataset = new WeakMap<IrisDataset, Map<string, TransportMapServedCityZone[]>>();
const zoneViews = new WeakMap<readonly TransportMapServedCityZone[], {
  global: boolean;
  departments: TransportMapServedCityZone[];
  cities: TransportMapServedCityZone[];
}>();

export interface BuildCityZonesOptions {
  /** Omit to build every city in the official IRIS dataset. */
  stations?: readonly GlobalMapStation[];
  lineColor?: string;
  /** Keep contextual labels for served-city mode; global mode opts out. */
  showLabels?: boolean;
}

export interface BuildGlobalZonesOptions {
  /** City labels stay off because the basemap already provides them. */
  showLabels?: boolean;
  /** Department labels are useful while the department representation is active. */
  showDepartmentLabels?: boolean;
}

/**
 * Builds the city overlay from the same official IRIS polygons used by the
 * NearbyStationsMap city view. When stations are provided, a station city is
 * matched by an exact normalized name first, then by the polygon containing
 * its coordinates. When stations are omitted, every city in the dataset is
 * returned.
 */
export function buildCityZones(
  dataset: IrisDataset,
  options: BuildCityZonesOptions = {},
): TransportMapServedCityZone[] {
  const groupsByKey = new Map<string, IrisCityGroup>();
  const groupsByName = new Map<string, IrisCityGroup[]>();
  const groupByNeighborhoodId = new Map<string, IrisCityGroup>();

  for (const neighborhood of dataset.neighborhoods) {
    const key = irisCityKey(neighborhood);
    let group = groupsByKey.get(key);
    if (!group) {
      group = { key, name: irisCityName(neighborhood), neighborhoods: [] };
      groupsByKey.set(key, group);
      addCityAlias(groupsByName, group.name, group);
    }
    group.neighborhoods.push(neighborhood);
    groupByNeighborhoodId.set(neighborhood.id, group);
    addCityAlias(groupsByName, neighborhood.communeName, group);
  }

  const selectedGroups: IrisCityGroup[] = [];
  const selectedKeys = new Set<string>();
  const stationsByGroupKey = new Map<string, GlobalMapStation[]>();
  if (options.stations === undefined) {
    selectedGroups.push(...groupsByKey.values());
  } else {
    for (const station of options.stations) {
      const city = station.city?.trim();
      const directGroups = city ? groupsByName.get(normalizeCityName(city)) : undefined;
      const directGroup = directGroups?.length === 1 ? directGroups[0] : undefined;
      const spatialGroup = directGroup ?? groupForStation(
        dataset,
        station,
        groupByNeighborhoodId,
        directGroups,
      );
      if (!spatialGroup) continue;
      const groupStations = stationsByGroupKey.get(spatialGroup.key) ?? [];
      groupStations.push(station);
      stationsByGroupKey.set(spatialGroup.key, groupStations);
      if (selectedKeys.has(spatialGroup.key)) continue;
      selectedKeys.add(spatialGroup.key);
      selectedGroups.push(spatialGroup);
    }
  }

  const hues = chooseCityHues(
    selectedGroups.length,
    hueFromCssColor(options.lineColor ?? DEFAULT_LINE_COLOR),
  );
  const idPrefix = options.stations === undefined ? "city" : "served-city";
  return selectedGroups.flatMap((group, index) => {
    const geometry = combineNeighborhoodGeometry(group.neighborhoods);
    if (!geometry) return [];
    const centroid = averageCentroid(group.neighborhoods);
    const colors = cityColors(hues[index] ?? DEFAULT_LINE_HUE);
    return [{
      id: `${idPrefix}:${normalizeCityName(group.key) || normalizeCityName(group.name)}`,
      name: group.name,
      kind: "city",
      showLabel: options.showLabels ?? true,
      geometry,
      boundaryPaths: joinAdministrativeBoundarySegments(boundarySegmentsForIrisNeighborhoods(group.neighborhoods)),
      centroid,
      labelPixelOffset: labelPixelOffsetForGroup(
        centroid,
        stationsByGroupKey.get(group.key) ?? [],
        index,
      ),
      ...colors,
    } satisfies TransportMapServedCityZone];
  });
}

export function buildServedCityZones(
  dataset: IrisDataset,
  stations: readonly GlobalMapStation[],
  lineColor = DEFAULT_LINE_COLOR,
): TransportMapServedCityZone[] {
  return buildCityZones(dataset, { stations, lineColor });
}

export function buildAllCityZones(dataset: IrisDataset): TransportMapServedCityZone[] {
  return buildCityZones(dataset);
}

/**
 * Builds one subtle administrative layer per department. The outer boundary
 * is the dissolved department contour; city contours remain available as
 * lighter inner paths for the low-zoom global map representation.
 */
export function buildDepartmentZones(
  dataset: IrisDataset,
  options: Pick<BuildCityZonesOptions, "showLabels"> = {},
): TransportMapServedCityZone[] {
  const neighborhoodsByDepartment = new Map<string, IrisNeighborhood[]>();
  const citiesByDepartment = new Map<string, Map<string, IrisNeighborhood[]>>();
  for (const neighborhood of dataset.neighborhoods) {
    const departmentNeighborhoods = neighborhoodsByDepartment.get(neighborhood.departmentCode) ?? [];
    departmentNeighborhoods.push(neighborhood);
    neighborhoodsByDepartment.set(neighborhood.departmentCode, departmentNeighborhoods);

    const departmentCities = citiesByDepartment.get(neighborhood.departmentCode) ?? new Map<string, IrisNeighborhood[]>();
    const cityNeighborhoods = departmentCities.get(irisCityKey(neighborhood)) ?? [];
    cityNeighborhoods.push(neighborhood);
    departmentCities.set(irisCityKey(neighborhood), cityNeighborhoods);
    citiesByDepartment.set(neighborhood.departmentCode, departmentCities);
  }

  const hues = chooseCityHues(neighborhoodsByDepartment.size, DEFAULT_LINE_HUE);
  return [...neighborhoodsByDepartment.entries()].flatMap(([departmentCode, neighborhoods], index) => {
    const geometry = combineNeighborhoodGeometry(neighborhoods);
    if (!geometry) return [];
    const departmentBoundarySegments = boundarySegmentsForIrisNeighborhoods(neighborhoods);
    const boundaryPaths = joinAdministrativeBoundarySegments(departmentBoundarySegments);
    const boundaryPathKeys = new Set(departmentBoundarySegments.map(boundarySegmentKey));
    const cityBoundarySegments = [...(citiesByDepartment.get(departmentCode)?.values() ?? [])]
      .flatMap((cityNeighborhoods) => boundarySegmentsForIrisNeighborhoods(cityNeighborhoods));
    const innerBoundaryPaths = joinAdministrativeBoundarySegments(uniqueBoundarySegments(cityBoundarySegments)
      .filter((segment) => !boundaryPathKeys.has(boundarySegmentKey(segment))));
    const average = averageCentroid(neighborhoods);
    // A concave department's mean can lie in a neighbouring department (92/75).
    const centroid = pointInIrisGeometry({ lon: average[0], lat: average[1] }, geometry)
      ? average
      : administrativeInteriorPoint(departmentBoundarySegments, average);
    const colors = departmentColors(hues[index] ?? DEFAULT_LINE_HUE);
    const departmentName = dataset.departmentNames?.[departmentCode]?.trim();
    return [{
      id: `department:${normalizeCityName(departmentCode)}`,
      name: departmentName ? `${departmentCode} · ${departmentName}` : departmentCode,
      kind: "department",
      showLabel: options.showLabels ?? true,
      geometry,
      boundaryPaths,
      innerBoundaryPaths,
      ...colors,
      centroid,
      labelPixelOffset: [0, 0],
    } satisfies TransportMapServedCityZone];
  });
}

/** Global source consumed by the two-state camera view: departments first, cities later. */
export function buildAllGlobalZones(
  dataset: IrisDataset,
  options: BuildGlobalZonesOptions = {},
): TransportMapServedCityZone[] {
  const showCityLabels = options.showLabels ?? false;
  const showDepartmentLabels = options.showDepartmentLabels ?? true;
  const key = `${showCityLabels}:${showDepartmentLabels}`;
  let variants = globalZonesByDataset.get(dataset);
  const cached = variants?.get(key);
  if (cached) return cached;
  if (!variants) {
    variants = new Map();
    globalZonesByDataset.set(dataset, variants);
  }
  const zones = [
    ...buildDepartmentZones(dataset, { showLabels: showDepartmentLabels }),
    ...buildCityZones(dataset, { showLabels: showCityLabels }),
  ];
  variants.set(key, zones);
  return zones;
}

/**
 * Keeps the global layer intentionally binary across zoom levels. Departments
 * provide the low-zoom context and their lighter inner paths preserve city
 * delimitations; cities replace that aggregate at the shared camera threshold.
 * Line-specific served-city overlays stay complete.
 */
export function selectCityZonesForZoom(
  zones: readonly TransportMapServedCityZone[] | undefined,
  zoom: number,
): readonly TransportMapServedCityZone[] {
  if (!zones?.length) return zones ?? [];
  const views = getZoneViews(zones);
  if (!views.global) {
    return zones ?? [];
  }

  const departmentZones = views.departments;
  const cityZones = views.cities;
  if (zoom < GLOBAL_CITY_VIEW_MIN_ZOOM && departmentZones.length > 0) {
    return departmentZones;
  }
  return cityZones.length > 0
    ? cityZones
    : departmentZones;
}

export function cityZoneLodKey(
  zones: readonly TransportMapServedCityZone[] | undefined,
  zoom: number,
): string {
  if (!zones?.length) return "none";
  const views = getZoneViews(zones);
  if (!views.global) return "served-full";
  if (zoom < GLOBAL_CITY_VIEW_MIN_ZOOM && views.departments.length) {
    return "global-departments";
  }
  return views.cities.length ? "global-cities" : "global-departments";
}

function getZoneViews(zones: readonly TransportMapServedCityZone[]) {
  let views = zoneViews.get(zones);
  if (!views) {
    const byId = (left: TransportMapServedCityZone, right: TransportMapServedCityZone) => left.id.localeCompare(right.id);
    views = {
      global: zones.every((zone) => zone.id.startsWith("city:") || zone.id.startsWith("department:")),
      departments: zones.filter(isDepartmentZone).sort(byId),
      cities: zones.filter(isCityZone).sort(byId),
    };
    zoneViews.set(zones, views);
  }
  return views;
}

function isCityZone(zone: TransportMapServedCityZone): boolean {
  return zone.kind === "city" || zone.id.startsWith("city:");
}

function isDepartmentZone(zone: TransportMapServedCityZone): boolean {
  return zone.kind === "department" || zone.id.startsWith("department:");
}

function addCityAlias(
  aliases: Map<string, IrisCityGroup[]>,
  value: string,
  group: IrisCityGroup,
): void {
  const key = normalizeCityName(value);
  if (!key) return;
  const groups = aliases.get(key) ?? [];
  if (!groups.includes(group)) groups.push(group);
  aliases.set(key, groups);
}

function groupForStation(
  dataset: IrisDataset,
  station: GlobalMapStation,
  groupByNeighborhoodId: ReadonlyMap<string, IrisCityGroup>,
  candidateGroups?: readonly IrisCityGroup[],
): IrisCityGroup | undefined {
  if (!Number.isFinite(station.lon) || !Number.isFinite(station.lat)) return undefined;
  const neighborhoods = candidateGroups && candidateGroups.length > 0
    ? candidateGroups.flatMap((group) => group.neighborhoods)
    : dataset.neighborhoods;
  const containing = neighborhoods.find((neighborhood) =>
    pointInIrisGeometry({ lon: station.lon, lat: station.lat }, neighborhood.geometry),
  );
  return containing ? groupByNeighborhoodId.get(containing.id) : undefined;
}

function combineNeighborhoodGeometry(
  neighborhoods: readonly IrisNeighborhood[],
): IrisPolygonGeometry | undefined {
  const polygons = neighborhoods.flatMap((neighborhood) =>
    neighborhood.geometry.type === "Polygon"
      ? [neighborhood.geometry.coordinates]
      : neighborhood.geometry.coordinates,
  );
  return polygons.length > 0
    ? { type: "MultiPolygon", coordinates: polygons }
    : undefined;
}

function averageCentroid(neighborhoods: readonly IrisNeighborhood[]): [number, number] {
  const count = Math.max(1, neighborhoods.length);
  return [
    neighborhoods.reduce((sum, neighborhood) => sum + neighborhood.centroid[0], 0) / count,
    neighborhoods.reduce((sum, neighborhood) => sum + neighborhood.centroid[1], 0) / count,
  ];
}

function labelPixelOffsetForGroup(
  centroid: readonly [number, number],
  stations: readonly GlobalMapStation[],
  groupIndex: number,
): readonly [number, number] {
  const fallbackDirections: ReadonlyArray<readonly [number, number]> = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  const fallback = fallbackDirections[groupIndex % fallbackDirections.length] ?? [0, -1];
  if (stations.length === 0) return [fallback[0] * 30, fallback[1] * 30];

  const stationCenter: [number, number] = [
    stations.reduce((sum, station) => sum + station.lon, 0) / stations.length,
    stations.reduce((sum, station) => sum + station.lat, 0) / stations.length,
  ];
  const deltaLon = centroid[0] - stationCenter[0];
  const deltaLat = centroid[1] - stationCenter[1];
  const distance = Math.hypot(deltaLon, deltaLat);
  if (!Number.isFinite(distance) || distance < 1e-9) {
    return [fallback[0] * 30, fallback[1] * 30];
  }

  const offset = 30;
  return [
    Math.round((deltaLon / distance) * offset),
    Math.round((-deltaLat / distance) * offset),
  ];
}

function departmentColors(
  hue: number,
): Pick<TransportMapServedCityZone, "fillColor" | "borderColor" | "labelColor" | "innerBoundaryColor"> {
  const fill = hslToRgb({ hue, saturation: 42, lightness: 74 });
  const border = hslToRgb({ hue, saturation: 52, lightness: 43 });
  const label = hslToRgb({ hue, saturation: 58, lightness: 30 });
  return {
    // Departments should provide context without hiding the transport network.
    fillColor: [fill.red, fill.green, fill.blue, 28],
    borderColor: [border.red, border.green, border.blue, 228],
    labelColor: [label.red, label.green, label.blue, 255],
    innerBoundaryColor: DEPARTMENT_INNER_BOUNDARY_COLOR,
  };
}

function uniqueBoundarySegments(segments: readonly IrisBoundarySegment[]): IrisBoundarySegment[] {
  const seen = new Set<string>();
  return segments.filter((segment) => {
    const key = boundarySegmentKey(segment);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function boundarySegmentKey(segment: IrisBoundarySegment): string {
  return [boundaryPointKey(segment.from), boundaryPointKey(segment.to)].sort().join("|");
}

function boundaryPointKey(point: readonly [number, number]): string {
  return `${point[0].toFixed(7)},${point[1].toFixed(7)}`;
}

function cityColors(hue: number): Pick<TransportMapServedCityZone, "fillColor" | "borderColor" | "labelColor"> {
  const fill = hslToRgb({ hue, saturation: 78, lightness: 68 });
  const border = hslToRgb({ hue, saturation: 84, lightness: 44 });
  const label = hslToRgb({ hue, saturation: 86, lightness: 29 });
  return {
    // The fill remains translucent enough for the basemap and selected route
    // to stay legible; the border is intentionally opaque and bright.
    fillColor: [fill.red, fill.green, fill.blue, 78],
    borderColor: [border.red, border.green, border.blue, 255],
    labelColor: [label.red, label.green, label.blue, 255],
  };
}

function chooseCityHues(count: number, lineHue: number): number[] {
  if (count <= 0) return [];
  // The max-distance selection keeps the small served-city overlays highly
  // legible. A whole Île-de-France dataset contains far more cities, so use
  // the same golden-angle palette without the quadratic ranking cost there.
  if (count > EXACT_HUE_SELECTION_MAX_COUNT) {
    return Array.from({ length: count }, (_, index) =>
      normalizeHue(lineHue + 150 + index * GOLDEN_ANGLE),
    );
  }
  const candidateCount = Math.max(48, count * 12);
  const candidates = Array.from({ length: candidateCount }, (_, index) =>
    normalizeHue(lineHue + 150 + index * GOLDEN_ANGLE),
  );
  const chosen: number[] = [];

  while (chosen.length < count) {
    const available = candidates.filter((candidate) =>
      !chosen.some((value) => Math.abs(value - candidate) < 0.001),
    );
    const ranked = available.map((candidate) => ({
      candidate,
      score: Math.min(
        hueDistance(candidate, lineHue),
        ...chosen.map((value) => hueDistance(candidate, value)),
      ),
    })).sort((left, right) =>
      right.score - left.score || left.candidate - right.candidate,
    );
    const best = ranked.find((entry) => entry.score >= MIN_LINE_HUE_DISTANCE) ?? ranked[0];
    if (!best) break;
    chosen.push(best.candidate);
  }

  return chosen;
}

function normalizeCityName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/gu, "");
}

function hueFromCssColor(value: string): number {
  const normalized = value.trim().toLowerCase();
  const hex = normalized.match(/^#([0-9a-f]{3,6})$/u)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? hex.split("").map((part) => `${part}${part}`).join("") : hex;
    return rgbToHsl({
      red: Number.parseInt(expanded.slice(0, 2), 16),
      green: Number.parseInt(expanded.slice(2, 4), 16),
      blue: Number.parseInt(expanded.slice(4, 6), 16),
    }).hue;
  }
  const parts = normalized.match(/^rgba?\(([^)]+)\)$/u)?.[1]
    ?.split(",")
    .slice(0, 3)
    .map((part) => Number(part.trim()));
  return parts && parts.length === 3 && parts.every(Number.isFinite)
    ? rgbToHsl({ red: parts[0]!, green: parts[1]!, blue: parts[2]! }).hue
    : DEFAULT_LINE_HUE;
}

function rgbToHsl({ red, green, blue }: Rgb): Hsl {
  const r = clamp01(red / 255);
  const g = clamp01(green / 255);
  const b = clamp01(blue / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { hue, saturation: saturation * 100, lightness: lightness * 100 };
}

function hslToRgb({ hue, saturation, lightness }: Hsl): Rgb {
  const s = clamp01(saturation / 100);
  const l = clamp01(lightness / 100);
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const normalizedHue = normalizeHue(hue) / 60;
  const x = chroma * (1 - Math.abs((normalizedHue % 2) - 1));
  const [r, g, b] = normalizedHue < 1
    ? [chroma, x, 0]
    : normalizedHue < 2
      ? [x, chroma, 0]
      : normalizedHue < 3
        ? [0, chroma, x]
        : normalizedHue < 4
          ? [0, x, chroma]
          : normalizedHue < 5
            ? [x, 0, chroma]
            : [chroma, 0, x];
  const m = l - chroma / 2;
  return {
    red: Math.round((r + m) * 255),
    green: Math.round((g + m) * 255),
    blue: Math.round((b + m) * 255),
  };
}

function hueDistance(left: number, right: number): number {
  const distance = Math.abs(normalizeHue(left) - normalizeHue(right));
  return Math.min(distance, 360 - distance);
}

function normalizeHue(value: number): number {
  return ((value % 360) + 360) % 360;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
