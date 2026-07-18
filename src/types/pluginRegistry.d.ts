declare module "#transport-clock/plugins" {
  import type { TransportClockClientPlugin } from "@transport-clock/nuxt-plugin-host/types";

  export const transportClockPlugins: TransportClockClientPlugin[];
  export default transportClockPlugins;
}

declare module "#transport-clock/plugin-server-registry" {
  import type { H3Event } from "h3";
  import type { HealthCheck } from "../features/health/types";

  export const transportClockPluginHealthChecks: Array<
    (event: H3Event) => HealthCheck | Promise<HealthCheck>
  >;
  export const transportClockServerPlugins: Array<{
    apiVersion: number;
    id: string;
    version: string;
  }>;
}

declare module "#transport-clock/plugin-server" {
  export type HealthCheck = import("../features/health/types").HealthCheck;
  export type NetexLineCache =
    import("../../server/services/topology/netexCache").NetexLineCache;
  export type NetexPattern =
    import("../../server/services/topology/netexCache").NetexPattern;
  export type NetexSchematicNode =
    import("../../server/services/topology/netexCache").NetexSchematicNode;

  export const convertLambert93ToWgs84:
    typeof import("../features/network-ghost/geoProjection").convertLambert93ToWgs84;
  export const getCoordinatesDistanceKm:
    typeof import("../services/distance").getCoordinatesDistanceKm;
  export const createIdfmStopReferenceKeys:
    typeof import("../services/idfmStopReferences").createIdfmStopReferenceKeys;
  export const getServerIdfmApiKey:
    typeof import("../../server/services/idfm/resolveStopArea").getServerIdfmApiKey;
  export const fetchIdfmMarketplaceWithRetry:
    typeof import("../../server/services/idfm/marketplaceClient").fetchIdfmMarketplaceWithRetry;
  export const IDFM_MARKETPLACE_BASE_URL:
    typeof import("../../server/services/idfm/marketplaceClient").IDFM_MARKETPLACE_BASE_URL;
  export const getNetexRuntimeEnv:
    typeof import("../../server/services/topology/netexCache").getNetexRuntimeEnv;
  export const loadNetexLineCache:
    typeof import("../../server/services/topology/netexCache").loadNetexLineCache;
  export const resolveKnownLineAlias:
    typeof import("../../server/services/topology/netexCache").resolveKnownLineAlias;
}
