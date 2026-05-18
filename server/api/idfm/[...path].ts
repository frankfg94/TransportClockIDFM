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

  const response = await fetch(upstreamUrl, {
    body: ["GET", "HEAD"].includes(method)
      ? undefined
      : await readRawBody(event),
    headers,
    method,
    redirect: "follow",
  });
  const responseHeaders = new Headers(response.headers);

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

  return new Response(response.body, {
    headers: responseHeaders,
    status: response.status,
    statusText: response.statusText,
  });
});
