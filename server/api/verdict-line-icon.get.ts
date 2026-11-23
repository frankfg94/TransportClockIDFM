import { createError, defineEventHandler, getQuery, setHeader } from "h3";

export default defineEventHandler(async event => {
  const value = getQuery(event).url;
  let url: URL;
  try { url = new URL(String(value)); } catch { throw createError({ statusCode: 400 }); }
  if (url.protocol !== "https:" || url.hostname !== "www.ratp.fr"
    || !url.pathname.startsWith("/sites/default/files/lines-assets/") || !url.pathname.endsWith(".svg")) {
    throw createError({ statusCode: 400 });
  }
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw createError({ statusCode: 502, statusMessage: "Line pictogram unavailable" });
  setHeader(event, "Content-Type", "image/svg+xml");
  setHeader(event, "Cache-Control", "public, max-age=86400");
  return await response.text();
});
