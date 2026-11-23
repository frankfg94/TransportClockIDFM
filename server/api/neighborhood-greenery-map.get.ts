import { createError, defineEventHandler, getQuery, setResponseHeader } from "h3";
import { getNetexRuntimeEnv } from "../services/topology/netexCache";
import { greenBoundaryArea, readCanopyMap, readMappedParkEntrances, readRegionalParkMap } from "../services/neighborhoodVerdict/natureInCity";
import { getCompiledNeighborhoodVerdictData } from "../services/neighborhoodVerdict/dataStore";
import type { GreenBoundary } from "../../shared/natureInCity";

export default defineEventHandler(async event => {
  const { scope, version, code, id, name, lat: rawLat, lon: rawLon } = getQuery(event);
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  const validOrigin = Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180;
  const env = getNetexRuntimeEnv(event);
  if (scope === "park-entrances" && validOrigin && typeof name === "string" && name.length > 0 && name.length <= 160) {
    const entrances = await readMappedParkEntrances(env, name, { lat, lon }).catch(() => []);
    return { entrances };
  }
  if (scope === "park" && typeof id === "string" && id.length <= 160 && id.length > 0) {
    if (/^ipr:\d+$/u.test(id)) {
      if (!validOrigin || typeof version !== "string" || !/^[a-f0-9]{24}$/u.test(version)) throw createError({ statusCode: 400 });
      const park = await readRegionalParkMap(env, id, { lat, lon }, version).catch(() => undefined);
      if (!park) throw createError({ statusCode: 404 });
      setResponseHeader(event, "Cache-Control", "public, max-age=86400");
      return park;
    }
    const data = await getCompiledNeighborhoodVerdictData(event);
    const parks = data.greenSpaces.filter(park => park.id === id);
    if (!parks.length) throw createError({ statusCode: 404 });
    const boundary: GreenBoundary = { type: "MultiPolygon",
      coordinates: parks.flatMap(park => park.geometry.type === "Polygon" ? [park.geometry.coordinates] : park.geometry.coordinates) };
    const surfaceM2 = parks.reduce((sum, park) => sum + (park.surfaceM2 ?? 0), 0) || greenBoundaryArea(boundary);
    const entrances = validOrigin
      ? await readMappedParkEntrances(env, parks[0]!.name, { lat, lon }, boundary).catch(() => undefined)
      : undefined;
    return { name: parks[0]!.name, boundary, surfaceM2, entrances };
  }
  if (typeof version !== "string" || !/^[a-f0-9]{24}$/u.test(version)) throw createError({ statusCode: 400 });
  const reference = scope === "commune" && typeof code === "string" && /^\d{5}$/u.test(code)
    ? { scope, version, code } as const
    : scope === "address" && validOrigin ? { scope, version, lat, lon } as const
      : scope === "woodland" && validOrigin && typeof id === "string" && id.length <= 160
        ? { scope, version, id, lat, lon } as const : undefined;
  if (!reference) throw createError({ statusCode: 400 });
  const map = await readCanopyMap(env, reference).catch(() => undefined);
  if (!map) throw createError({ statusCode: 404 });
  setResponseHeader(event, "Cache-Control", "public, max-age=86400");
  return map;
});
