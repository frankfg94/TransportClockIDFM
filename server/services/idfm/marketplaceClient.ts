export const IDFM_MARKETPLACE_BASE_URL =
  "https://prim.iledefrance-mobilites.fr/marketplace";

export interface IdfmMarketplaceFetchOptions {
  fetchImpl?: typeof fetch;
  retryDelaysMs?: number[];
}

export async function fetchIdfmMarketplaceWithRetry(
  upstreamUrl: URL,
  init: RequestInit,
  options: IdfmMarketplaceFetchOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const delays = options.retryDelaysMs ?? [260, 760, 1_500];

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const response = await fetchImpl(upstreamUrl, init);

    if (response.status !== 429 || attempt === delays.length) {
      return response;
    }

    await wait(getIdfmRetryDelayMs(response, delays[attempt]));
  }

  throw new Error("IDFM Marketplace retry loop exited unexpectedly.");
}

export function getIdfmRetryDelayMs(
  response: Response,
  fallbackMs: number,
): number {
  const retryAfter = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1_000, 4_000);
  }

  return fallbackMs;
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
