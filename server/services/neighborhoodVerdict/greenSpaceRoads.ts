import { WOODLAND_FRAGMENTATION_RULES as rules } from "./greenSpaceInventoryRules";
import type { MultiPolygon, Pair, Polygon } from "polygon-clipping";

interface RoadFeature {
  geometry?: { type: "LineString" | "MultiLineString"; coordinates: Pair[] | Pair[][] };
  properties?: { cpx_classement_administratif?: string; position_par_rapport_au_sol?: number; largeur_de_chaussee?: number };
}

const CACHE_CELL = 4_000;
const ROAD_SEARCH_MARGIN = 10_000;
const ROAD_LIMIT = 5_000;
const cache = new Map<string, { expires: number; result: Promise<MajorRoad[] | undefined> }>();

export interface MajorRoad {
  points: Pair[];
  halfWidth: number;
}

export function majorRoadsFromFeatures(features: readonly RoadFeature[]): MajorRoad[] {
  return features.flatMap(({ properties, geometry }) => {
    const classes = properties?.cpx_classement_administratif?.split("/") ?? [];
    const motorway = classes.includes(rules.motorwayClass);
    if ((!motorway && !classes.includes(rules.nationalRoadClass)) || (properties?.position_par_rapport_au_sol ?? 0) < 0 || !geometry) return [];
    const width = properties?.largeur_de_chaussee ?? 0;
    const halfWidth = Math.max(motorway ? rules.motorwayMinHalfWidthMeters : rules.nationalMinHalfWidthMeters,
      Math.min(rules.maximumHalfWidthMeters, width / 2 + rules.roadMarginMeters));
    const lines = geometry.type === "LineString" ? [geometry.coordinates as Pair[]] : geometry.coordinates as Pair[][];
    return lines.filter(points => points.length >= 2).map(points => ({ points, halfWidth }));
  });
}

export function readMajorRoads([x, y]: Pair): Promise<MajorRoad[] | undefined> {
  const left = Math.floor(x / CACHE_CELL) * CACHE_CELL, bottom = Math.floor(y / CACHE_CELL) * CACHE_CELL;
  const key = `${left}/${bottom}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.result;
  const bounds = [left - ROAD_SEARCH_MARGIN, bottom - ROAD_SEARCH_MARGIN,
    left + CACHE_CELL + ROAD_SEARCH_MARGIN, bottom + CACHE_CELL + ROAD_SEARCH_MARGIN];
  const url = new URL("https://data.geopf.fr/wfs/ows");
  url.search = new URLSearchParams({
    SERVICE: "WFS", VERSION: "2.0.0", REQUEST: "GetFeature",
    TYPENAMES: "BDTOPO_V3:troncon_de_route", SRSNAME: "EPSG:2154", OUTPUTFORMAT: "application/json",
    COUNT: String(ROAD_LIMIT),
    PROPERTYNAME: "geometrie,cpx_classement_administratif,position_par_rapport_au_sol,largeur_de_chaussee",
    CQL_FILTER: `BBOX(geometrie,${bounds.join(",")},'EPSG:2154') AND (cpx_classement_administratif ILIKE '%Nationale%' OR cpx_classement_administratif ILIKE '%Autoroute%')`,
  }).toString();
  const entry = { expires: Date.now() + 10 * 60_000, result: fetch(url, { signal: AbortSignal.timeout(4_000) }).then(async response => {
    if (!response.ok) return undefined;
    const data = await response.json() as { features?: RoadFeature[]; numberMatched?: number };
    if (!data.features || data.features.length >= ROAD_LIMIT || (data.numberMatched ?? 0) > data.features.length) return undefined;
    return majorRoadsFromFeatures(data.features);
  }).catch(() => undefined) };
  cache.set(key, entry);
  void entry.result.then(result => { if (!result) entry.expires = Date.now() + 30_000; });
  while (cache.size > 32) cache.delete(cache.keys().next().value!);
  return entry.result;
}

export function majorRoadMask(roads: readonly MajorRoad[], bounds: readonly [number, number, number, number]): MultiPolygon {
  const [west, south, east, north] = bounds;
  const masks: Polygon[] = [];
  for (const { points, halfWidth } of roads) {
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1]!, [bx, by] = points[i]!;
      if (Math.max(ax, bx) + halfWidth < west || Math.min(ax, bx) - halfWidth > east
        || Math.max(ay, by) + halfWidth < south || Math.min(ay, by) - halfWidth > north) continue;
      const length = Math.hypot(bx - ax, by - ay);
      if (!length) continue;
      const dx = (bx - ax) / length * halfWidth, dy = (by - ay) / length * halfWidth;
      const start: Pair = [ax - dx - dy, ay - dy + dx];
      masks.push([[start, [bx + dx - dy, by + dy + dx], [bx + dx + dy, by + dy - dx], [ax - dx + dy, ay - dy - dx], start]]);
    }
  }
  return masks;
}
