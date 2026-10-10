import { createError, defineEventHandler, getQuery } from "h3";
import type { NearbyJourneyPoint } from "../../src/features/nearby-stations/nearbyHeavyTransports";
import { routeWalkingWithPreferredProvider } from "../services/walking/openRouteService";
import { routeWalkingWithOpenRouteService, matrixWalkingWithOpenRouteService } from "../services/walking/openRouteService";
import { pointInIrisGeometry } from "../../src/features/transport-map/iris/irisGeometry";
import { resolveAdministrativeLocation } from "../services/neighborhoodVerdict/geoApi";
import { getCompiledNeighborhoodVerdictData } from "../services/neighborhoodVerdict/dataStore";
import { buildNeighborhoodVerdict } from "../services/neighborhoodVerdict/score";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw createError({ statusCode: 400, statusMessage: "Invalid coordinates" });
  }
  try {
    const data = await getCompiledNeighborhoodVerdictData(event);
    const matches = data.iris.neighborhoods.filter(n => pointInIrisGeometry({ lat, lon }, n.geometry));
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
    return await buildNeighborhoodVerdict(
      data,
      { lat, lon },
      administrativeLocation,
      query.includeWalking === "0" ? undefined : routeWalking,
    );
  } catch (cause) {
    throw createError({ statusCode: 503, statusMessage: "Neighborhood verdict data unavailable", cause });
  }
});
