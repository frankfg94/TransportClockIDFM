import type { NavitiaRequestOptions } from "../../../src/services/idfm";

const IDFM_MARKETPLACE_BASE =
  "https://prim.iledefrance-mobilites.fr/marketplace";

export function createServerIdfmRequestOptions(
  apiKey: string,
): NavitiaRequestOptions {
  return {
    apiBase: `${IDFM_MARKETPLACE_BASE}/v2/navitia`,
    fetcher: (input, init = {}) => {
      const headers = new Headers(init.headers);

      headers.set("accept", "application/json");
      headers.set("apikey", apiKey);

      return fetch(input, {
        ...init,
        headers,
      });
    },
    siriApiBase: IDFM_MARKETPLACE_BASE,
  };
}
