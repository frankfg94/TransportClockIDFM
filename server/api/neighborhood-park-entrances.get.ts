import { createError, defineEventHandler, getQuery } from "h3";
import type { OverpassElement } from "../../src/services/places/compiledPlaces";

const ttl = 24 * 60 * 60_000;
const cache = new Map<string, { until: number; result: ReturnType<typeof loadMap> }>();

async function loadMap(bounds: string) {
  const url = new URL("https://api.openstreetmap.org/api/0.6/map.json");
  url.searchParams.set("bbox", bounds);
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "TransportClockGPT/0.1 (park entrances; OpenStreetMap)" },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw createError({ statusCode: 502, statusMessage: "OSM entrances unavailable" });
  const { elements } = await response.json() as { elements: (OverpassElement & { nodes?: number[] })[] };
  return elements;
}

function entrances(elements: OverpassElement[]) {
  return elements.flatMap(({ type, lat, lon, tags }) => {
    if (type !== "node" || lat === undefined || lon === undefined || !tags) return [];
    const restricted = ["no", "private", "customers", "permit"];
    if (tags.locked === "yes" || restricted.includes(tags.foot ?? "") || restricted.includes(tags.access ?? "")) return [];
    const namedGate = tags.barrier === "gate" && /\b(?:entr[ée]e|entrance)\b/iu.test(tags.name ?? "");
    const publicGate = tags.barrier === "gate" && ["yes", "permissive", "designated"].includes(tags.foot ?? tags.access ?? "");
    if (!namedGate && !publicGate) return [];
    return [{ lat, lon, name: tags.name, publicGate }];
  });
}

function walkNetwork(elements: Awaited<ReturnType<typeof loadMap>>) {
  const denied = new Set(["no", "private", "customers", "permit"]);
  const accessible = (tags: Record<string, string>) => !denied.has(tags.foot ?? tags.access ?? "") && tags.locked !== "yes";
  const highways = new Set(["footway", "path", "pedestrian", "steps", "living_street", "track"]);
  const ways = elements.filter(({ type, tags, nodes }) => type === "way" && nodes && tags
    && highways.has(tags.highway ?? "") && accessible(tags) && !["crossing", "sidewalk"].includes(tags.footway ?? ""));
  const used = new Set(ways.flatMap(way => way.nodes!));
  const points = new Map(elements.flatMap(({ type, id, lon, lat }) =>
    type === "node" && id !== undefined && lon !== undefined && lat !== undefined ? [[id, { lon, lat }] as const] : []));
  function featureKind(tags: Record<string, string>) {
    return (tags.tourism === "picnic_site" || tags.picnic === "yes") && tags.picnic !== "no" ? "picnic"
      : tags.tourism === "viewpoint" ? "viewpoint"
      : tags.natural === "tree" && tags.name ? "notable-tree"
      : tags.leisure === "garden" && tags.name ? "garden"
      : tags.tourism === "museum" ? "museum"
      : tags.tourism === "artwork" || tags.historic ? "heritage" : undefined;
  }
  return {
    nodes: elements.flatMap(({ id, type, lon, lat, tags }) =>
      type === "node" && id !== undefined && lon !== undefined && lat !== undefined && used.has(id) && accessible(tags ?? {})
        ? [{ id, lon, lat }] : []),
    paths: ways.map(way => way.nodes!),
    features: elements.flatMap(({ id, type, lon, lat, tags, nodes }) => {
      if (id === undefined || !tags || !accessible(tags)) return [];
      const kind = featureKind(tags);
      if (!kind) return [];
      if (type === "node" && lon !== undefined && lat !== undefined) return [{ id, lon, lat, kind }];
      if (type !== "way" || !nodes?.length) return [];
      const vertices = nodes.flatMap(node => points.get(node) ?? []);
      if (!vertices.length) return [];
      return [{ id, kind, lon: vertices.reduce((sum, point) => sum + point.lon, 0) / vertices.length,
        lat: vertices.reduce((sum, point) => sum + point.lat, 0) / vertices.length }];

    }),
  };
}

export default defineEventHandler(async event => {
  const value = getQuery(event).bbox;
  const bounds = typeof value === "string" && value.length <= 90 ? value.split(",").map(Number) : [];
  const [west, south, east, north] = bounds;
  if (bounds.length !== 4 || !bounds.every(Number.isFinite) || west! < -180 || east! > 180 || south! < -90
    || north! > 90 || !(east! > west! && north! > south!) || east! - west! > .025 || north! - south! > .025) {
    throw createError({ statusCode: 400, statusMessage: "Invalid entrance search bounds" });
  }
  const key = bounds.join(",");
  const cached = cache.get(key);
  let result = cached && cached.until > Date.now() ? cached.result : undefined;
  if (!result) {
    result = loadMap(key).catch(error => { cache.delete(key); throw error; });
    cache.set(key, { until: Date.now() + ttl, result });
    if (cache.size > 100) cache.delete(cache.keys().next().value!);
  }
  const elements = await result;
  return getQuery(event).network === "1" ? walkNetwork(elements) : entrances(elements);
});
