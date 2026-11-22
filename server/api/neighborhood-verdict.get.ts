import { createError, defineEventHandler, getQuery } from "h3";
import type { NearbyJourneyPoint } from "../../src/features/nearby-stations/nearbyHeavyTransports";
import { routeWalkingWithPreferredProvider } from "../services/walking/openRouteService";
import { routeWalkingWithOpenRouteService, matrixWalkingWithOpenRouteService, matrixWalkingForGtfs } from "../services/walking/openRouteService";
import { findPointIrisNeighborhoods } from "../services/neighborhoodVerdict/irisPointLookup";
import { resolveAdministrativeLocation } from "../services/neighborhoodVerdict/geoApi";
import { getCompiledNeighborhoodVerdictData } from "../services/neighborhoodVerdict/dataStore";
import { buildNeighborhoodVerdict } from "../services/neighborhoodVerdict/score";
import { readCanopy, readNatureManifest, readNearbyRegionalGreenSpaces, readParkWalk, verifiedGreenSpaceWalkingTime } from "../services/neighborhoodVerdict/natureInCity";
import { mergeRegionalParkEvidence } from "../services/neighborhoodVerdict/regionalParkEvidence";
import type { GreenBoundary } from "../../shared/natureInCity";
import { getNetexRuntimeEnv } from "../services/topology/netexCache";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw createError({ statusCode: 400, statusMessage: "Invalid coordinates" });
  }
  try {
    const data = await getCompiledNeighborhoodVerdictData(event);
    const matches = findPointIrisNeighborhoods(data.iris, { lat, lon });
    const iris = new Set(matches.map(n => n.communeCode)).size === 1 ? matches[0] : undefined;
    const administrativeLocation = iris ? { commune: { code: iris.communeCode, name: iris.communeName }, departmentCode: iris.departmentCode } : await resolveAdministrativeLocation(lat, lon);
    type Walk = { durationSeconds: number; distanceMeters: number } | undefined;
    let batch: Array<{ id: string; lon: number; lat: number; resolve(value: Walk): void }> = [];
    const matrixRoute = (destination: NearbyJourneyPoint): Promise<Walk> => new Promise(resolve => {
      batch.push({ ...destination, id: String(batch.length), resolve });
      if (batch.length !== 1) return;
      setTimeout(() => {
        const current = batch; batch = [];
        void matrixWalkingWithOpenRouteService(event, { lat, lon }, current).then(routes => {
          current.forEach((item, i) => { const route = routes[i]; item.resolve(route && !route.fallback && route.provider !== "straight-line" ? { durationSeconds: route.durationSeconds, distanceMeters: route.distanceMeters } : undefined); });
        }).catch(() => current.forEach(item => item.resolve(undefined)));
      }, 0);
    });
    const routeWalking = async (
      from: [number, number],
      to: [number, number],
    ) => {
      const origin: NearbyJourneyPoint = { lon: from[0]!, lat: from[1]! };
      const destination: NearbyJourneyPoint = { lon: to[0]!, lat: to[1]! };
      if (query.routingPolicy === "ors-only" && origin.lon === lon && origin.lat === lat) return matrixRoute(destination);
      const router = query.routingPolicy === "ors-only" ? routeWalkingWithOpenRouteService : routeWalkingWithPreferredProvider;
      const route = await router(event, origin, destination);
      if (route.provider === "straight-line") return undefined;
      return {
        durationSeconds: route.durationSeconds,
        distanceMeters: route.distanceMeters,
      };
    };
    const origin = { lat, lon };
    const router = query.includeWalking === "0" ? undefined : routeWalking;
    const env = getNetexRuntimeEnv(event);
    const greenery = readNatureManifest(env).then(async manifest => {
      const routeToParks = query.routingPolicy === "ors-only" ? matrixWalkingWithOpenRouteService : matrixWalkingForGtfs;
      const walkingMatrix = (provider: typeof matrixWalkingForGtfs) => async ([lon, lat]: [number, number],
        points: readonly [number, number][], endBoundaries?: readonly (GreenBoundary | undefined)[]) => {
          const destinations = points.map(([lon, lat], index) => ({ id: String(index), lon, lat }));
          const routes = await provider(event, { lon, lat }, destinations);
          const verified = new Map(routes.map(route => [route.id, verifiedGreenSpaceWalkingTime(route, endBoundaries?.[Number(route.id)])]));
          return destinations.map(destination => verified.get(destination.id));
      };
      const [canopy, parkAccess, regionalSpaces] = await Promise.all([
        readCanopy(env, manifest, origin, administrativeLocation.commune.code),
        router ? readParkWalk(env, manifest, origin, walkingMatrix(routeToParks)).catch(() => "unknown" as const) : undefined,
        readNearbyRegionalGreenSpaces(env, manifest, origin, router ? walkingMatrix(matrixWalkingForGtfs) : undefined).catch(() => []),
      ]);
      return { greenery: { ...canopy, parkAccess }, regionalSpaces };
    }).catch(() => ({ greenery: { parkAccess: router ? "unknown" as const : undefined }, regionalSpaces: [] }));
    const [verdict, greenData] = await Promise.all([buildNeighborhoodVerdict(data, origin, administrativeLocation, router), greenery]);
    return { ...mergeRegionalParkEvidence(verdict, greenData.regionalSpaces, data.greenSpaces), greenery: greenData.greenery };
  } catch (cause) {
    throw createError({ statusCode: 503, statusMessage: "Neighborhood verdict data unavailable", cause });
  }
});
