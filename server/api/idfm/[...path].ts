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

const IDFM_MARKETPLACE_BASE =
  "https://prim.iledefrance-mobilites.fr/marketplace";
const GET_CACHE_MAX_ENTRIES = 2200;
const GET_CACHE_DEFAULT_TTL_MS = 60_000;
const GET_CACHE_STRUCTURAL_TTL_MS = 6 * 60 * 60_000;
const GET_CACHE_REALTIME_TTL_MS = 8_000;
const GET_CACHE_SCHEDULE_TTL_MS = 5 * 60_000;

type CachedProxyResponse = {
  body: ArrayBuffer | null;
  expiresAt: number;
  headers: Array<[string, string]>;
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
  const upstreamUrl = new URL(`${IDFM_MARKETPLACE_BASE}/${upstreamPath}`);
  upstreamUrl.search = sourceUrl.search;

  const headers = new Headers();

  Object.entries(getRequestHeaders(event)).forEach(([key, value]) => {
    if (value !== undefined) {
      headers.set(key, value);
    }
  });

  headers.set("apikey", apiKey);

  headers.delete("host");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ipcountry");
  headers.delete("cf-ray");
  headers.delete("x-forwarded-for");
  headers.delete("x-forwarded-proto");

  if (method === "GET" || method === "HEAD") {
    const cachedResponse = await fetchCachedGetResponse(
      `${method}:${upstreamUrl.href}`,
      upstreamUrl,
      headers,
      method,
    );

    return createResponseFromCache(cachedResponse);
  }

  const response = await fetchWithRetry(upstreamUrl, {
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
  const response = await fetchWithRetry(upstreamUrl, {
    headers,
    method,
    redirect: "follow",
  });
  const cachedResponse = await createCachedResponse(response);

  if (response.ok) {
    getResponseCache.set(cacheKey, {
      ...cachedResponse,
      expiresAt: Date.now() + getCacheTtl(upstreamUrl),
    });
    trimGetResponseCache();
  }

  return cachedResponse;
}

async function fetchWithRetry(
  upstreamUrl: URL,
  init: RequestInit,
): Promise<Response> {
  const delays = [260, 760, 1_500];

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const response = await fetch(upstreamUrl, init);

    if (response.status !== 429 || attempt === delays.length) {
      return response;
    }

    await wait(getRetryDelayMs(response, delays[attempt]));
  }

  return fetch(upstreamUrl, init);
}

async function createCachedResponse(response: Response): Promise<CachedProxyResponse> {
  return {
    body: response.body ? await response.arrayBuffer() : null,
    expiresAt: 0,
    headers: createForwardedResponseHeaders(response.headers),
    status: response.status,
    statusText: response.statusText,
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

function getRetryDelayMs(response: Response, fallbackMs: number): number {
  const retryAfter = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1_000, 4_000);
  }

  return fallbackMs;
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

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
