import type { NavitiaRequestOptions } from "../../../src/services/idfm";
import { fetchIdfmMarketplaceWithRetry } from "./marketplaceClient";
import type { H3Event } from "h3";
import { getIdfmRateGateBinding } from "./distributedRateGate";

const IDFM_MARKETPLACE_BASE =
  "https://prim.iledefrance-mobilites.fr/marketplace";

export function createServerIdfmRequestOptions(
  apiKey: string,
  event?: H3Event,
): NavitiaRequestOptions {
  return {
    apiBase: `${IDFM_MARKETPLACE_BASE}/v2/navitia`,
    fetcher: (input, init = {}) => {
      const headers = new Headers(init.headers);

      headers.set("accept", "application/json");
      headers.set("apikey", apiKey);

      const upstreamUrl = input instanceof Request
        ? new URL(input.url)
        : new URL(input.toString());

      return fetchIdfmMarketplaceWithRetry(upstreamUrl, {
        ...init,
        headers,
      }, { coordinator: event ? getIdfmRateGateBinding(event) : undefined });
    },
    siriApiBase: IDFM_MARKETPLACE_BASE,
  };
}
