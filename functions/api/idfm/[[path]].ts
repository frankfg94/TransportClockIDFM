interface Env {
  IDFM_API_KEY?: string;
}

// Cloudflare Pages Functions call this file for every request matching
// /api/idfm/*. The [[path]] segment is a catch-all route, so the same handler
// can proxy /api/idfm/stop-monitoring, /api/idfm/v2/navitia/..., /api/idfm/gtfs.zip,
// and any other IDFM endpoint used by the frontend.
interface PagesRequestContext {
  request: Request;
  env: Env;
}

const IDFM_MARKETPLACE_BASE = "https://prim.iledefrance-mobilites.fr/marketplace";

export const onRequest = async (context: PagesRequestContext) => {
  // IDFM_API_KEY must be configured in Cloudflare Pages environment variables.
  // It is intentionally read server-side here so the secret is never bundled
  // into the Vue app or exposed to the browser.
  const apiKey = context.env.IDFM_API_KEY?.trim();

  if (!apiKey) {
    return Response.json(
      { error: "IDFM_API_KEY is not configured on this Cloudflare deployment." },
      { status: 500 },
    );
  }

  // Browsers may send a CORS preflight before some API calls. Cloudflare still
  // routes that request to this Function, so we answer it directly without
  // contacting IDFM.
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const sourceUrl = new URL(context.request.url);
  // Keep the frontend API stable: /api/idfm/foo becomes
  // https://prim.iledefrance-mobilites.fr/marketplace/foo.
  const upstreamPath = sourceUrl.pathname.replace(/^\/api\/idfm\/?/, "");
  const upstreamUrl = new URL(`${IDFM_MARKETPLACE_BASE}/${upstreamPath}`);

  // Preserve query parameters exactly as the Vue app sent them.
  upstreamUrl.search = sourceUrl.search;

  const headers = new Headers(context.request.headers);
  headers.set("apikey", apiKey);
  // These headers describe the Cloudflare/client request and should not be
  // forwarded to the upstream PRIM API.
  headers.delete("host");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ipcountry");
  headers.delete("cf-ray");
  headers.delete("x-forwarded-for");
  headers.delete("x-forwarded-proto");

  // Forward the request to PRIM. GET and HEAD requests must not include a body,
  // but POST-like requests can stream the original request body through.
  const response = await fetch(upstreamUrl, {
    body: ["GET", "HEAD"].includes(context.request.method)
      ? undefined
      : context.request.body,
    headers,
    method: context.request.method,
    redirect: "follow",
  });
  const responseHeaders = new Headers(response.headers);

  // The browser talks to our Cloudflare domain, not directly to PRIM. This keeps
  // browser-side calls simple and avoids exposing the PRIM key.
  responseHeaders.set("Access-Control-Allow-Origin", "*");

  return new Response(response.body, {
    headers: responseHeaders,
    status: response.status,
    statusText: response.statusText,
  });
};
