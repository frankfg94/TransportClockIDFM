import {
  createError,
  defineEventHandler,
  getMethod,
  getRequestHeaders,
  getRequestURL,
  getRouterParam,
  readRawBody,
  setResponseHeaders,
} from "h3";
import { getServerIdfmApiKey } from "../../services/idfm/resolveStopArea";
import {
  fetchIdfmMarketplaceWithRetry,
  IDFM_MARKETPLACE_BASE_URL,
} from "../../services/idfm/marketplaceClient";
const GET_CACHE_MAX_ENTRIES = 2200;
const GET_CACHE_DEFAULT_TTL_MS = 60_000;
const GET_CACHE_STRUCTURAL_TTL_MS = 6 * 60 * 60_000;
const GET_CACHE_REALTIME_TTL_MS = 8_000;
const GET_CACHE_SCHEDULE_TTL_MS = 5 * 60_000;
const GET_CACHE_REALTIME_STALE_TTL_MS = 2 * 60_000;
const GET_CACHE_SCHEDULE_STALE_TTL_MS = 6 * 60 * 60_000;
const GET_CACHE_STRUCTURAL_STALE_TTL_MS = 24 * 60 * 60_000;
const GET_CACHE_DEFAULT_STALE_TTL_MS = 30 * 60_000;

type CachedProxyResponse = {
  body: ArrayBuffer | null;
  expiresAt: number;
  headers: Array<[string, string]>;
  staleUntil: number;
  status: number;
  statusText: string;
};

const getResponseCache = new Map<string, CachedProxyResponse>();
const inFlightGetRequests = new Map<string, Promise<CachedProxyResponse>>();

export default defineEventHandler(async (event) => {
  const apiKey = getServerIdfmApiKey(event);

  if (!apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: "IDFM_API_KEY is not configured on this deployment.",
    });
  }

  const method = getMethod(event);

  if (method === "OPTIONS") {
    setResponseHeaders(event, {
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Allow-Origin": "*",
    });

    return null;
  }

  const sourceUrl = getRequestURL(event);
  const upstreamPath = getRouterParam(event, "path") ?? "";
  const upstreamUrl = new URL(
    `${IDFM_MARKETPLACE_BASE_URL}/${upstreamPath}`,
  );
  upstreamUrl.search = sourceUrl.search;

  const requestHeaders = getRequestHeaders(event);
  const headers = new Headers({
    accept: requestHeaders.accept ?? "application/json",
    "accept-encoding": "gzip, deflate",
  });

  if (requestHeaders["content-type"]) {
    headers.set("content-type", requestHeaders["content-type"]);
  }

  headers.set("apikey", apiKey);

  if (method === "GET" || method === "HEAD") {
    const cachedResponse = await fetchCachedGetResponse(
      `${method}:${upstreamUrl.href}`,
      upstreamUrl,
      headers,
      method,
    );

    return createResponseFromCache(cachedResponse);
  }

  const response = await fetchIdfmMarketplaceWithRetry(upstreamUrl, {
    body: await readRawBody(event),
    headers,
    method,
    redirect: "follow",
  });

  return createPassthroughResponse(response);
});

async function fetchCachedGetResponse(
  cacheKey: string,
  upstreamUrl: URL,
  headers: Headers,
  method: "GET" | "HEAD",
): Promise<CachedProxyResponse> {
  const cached = getResponseCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const inFlight = inFlightGetRequests.get(cacheKey);

  if (inFlight) {
    return inFlight;
  }

  const request = fetchAndCacheGetResponse(cacheKey, upstreamUrl, headers, method);

  inFlightGetRequests.set(cacheKey, request);

  try {
    return await request;
  } finally {
    inFlightGetRequests.delete(cacheKey);
  }
}

async function fetchAndCacheGetResponse(
  cacheKey: string,
  upstreamUrl: URL,
  headers: Headers,
  method: "GET" | "HEAD",
): Promise<CachedProxyResponse> {
  const response = await fetchIdfmMarketplaceWithRetry(upstreamUrl, {
    headers,
    method,
    redirect: "follow",
  });
  const cachedResponse = await createCachedResponse(response);

  if (response.ok) {
    const now = Date.now();
    getResponseCache.set(cacheKey, {
      ...cachedResponse,
      expiresAt: now + getCacheTtl(upstreamUrl),
      staleUntil: now + getStaleCacheTtl(upstreamUrl),
    });
    trimGetResponseCache();
  } else if (response.status === 429) {
    const staleResponse = getResponseCache.get(cacheKey);

    if (staleResponse && staleResponse.staleUntil > Date.now()) {
      return createStaleRateLimitResponse(staleResponse);
    }
  }

  return cachedResponse;
}

async function createCachedResponse(response: Response): Promise<CachedProxyResponse> {
  return {
    body: response.body ? await response.arrayBuffer() : null,
    expiresAt: 0,
    headers: createForwardedResponseHeaders(response.headers),
    staleUntil: 0,
    status: response.status,
    statusText: response.statusText,
  };
}

function createStaleRateLimitResponse(
  response: CachedProxyResponse,
): CachedProxyResponse {
  const headers = new Headers(response.headers);
  headers.set("warning", '110 - "IDFM response is stale because the upstream is rate-limited"');
  headers.set("x-idfm-cache", "stale-rate-limit");

  return {
    ...response,
    headers: Array.from(headers.entries()),
  };
}

function createPassthroughResponse(response: Response): Response {
  return new Response(response.body, {
    headers: createForwardedResponseHeaders(response.headers),
    status: response.status,
    statusText: response.statusText,
  });
}

function createResponseFromCache(response: CachedProxyResponse): Response {
  return new Response(response.body ? response.body.slice(0) : null, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function createForwardedResponseHeaders(sourceHeaders: Headers): Array<[string, string]> {
  const responseHeaders = new Headers(sourceHeaders);

  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");

  responseHeaders.delete("connection");
  responseHeaders.delete("keep-alive");
  responseHeaders.delete("proxy-authenticate");
  responseHeaders.delete("proxy-authorization");
  responseHeaders.delete("te");
  responseHeaders.delete("trailer");
  responseHeaders.delete("upgrade");

  return Array.from(responseHeaders.entries());
}

function getCacheTtl(upstreamUrl: URL): number {
  const pathname = upstreamUrl.pathname;

  if (pathname.includes("/stop-monitoring")) {
    return GET_CACHE_REALTIME_TTL_MS;
  }

  if (pathname.includes("/stop_schedules")) {
    return GET_CACHE_SCHEDULE_TTL_MS;
  }

  if (pathname.includes("/journeys")) {
    return GET_CACHE_SCHEDULE_TTL_MS;
  }

  if (
    pathname.includes("/commercial_modes") ||
    pathname.includes("/connections") ||
    pathname.includes("/lines") ||
    pathname.includes("/places_nearby") ||
    pathname.includes("/routes") ||
    pathname.includes("/stop_areas")
  ) {
    return GET_CACHE_STRUCTURAL_TTL_MS;
  }

  return GET_CACHE_DEFAULT_TTL_MS;
}

function getStaleCacheTtl(upstreamUrl: URL): number {
  const pathname = upstreamUrl.pathname;

  if (pathname.includes("/stop-monitoring")) {
    return GET_CACHE_REALTIME_STALE_TTL_MS;
  }

  if (pathname.includes("/stop_schedules") || pathname.includes("/journeys")) {
    return GET_CACHE_SCHEDULE_STALE_TTL_MS;
  }

  if (
    pathname.includes("/commercial_modes") ||
    pathname.includes("/connections") ||
    pathname.includes("/lines") ||
    pathname.includes("/places_nearby") ||
    pathname.includes("/routes") ||
    pathname.includes("/stop_areas")
  ) {
    return GET_CACHE_STRUCTURAL_STALE_TTL_MS;
  }

  return GET_CACHE_DEFAULT_STALE_TTL_MS;
}

function trimGetResponseCache(): void {
  while (getResponseCache.size > GET_CACHE_MAX_ENTRIES) {
    const oldestKey = getResponseCache.keys().next().value;

    if (!oldestKey) {
      return;
    }

    getResponseCache.delete(oldestKey);
  }
}
