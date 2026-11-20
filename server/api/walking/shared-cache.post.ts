import { createError, defineEventHandler, getHeader, getRequestURL, readBody } from "h3";
import { resetStationWalkCache, stationWalkStore } from "../../services/walking/stationWalkCache";

export default defineEventHandler(async event => {
  const url = getRequestURL(event);
  const peer = event.node.req.socket?.remoteAddress;
  const local = import.meta.dev && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer ?? "")
    && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && getHeader(event, "origin") === url.origin;
  const secret = event.context.cloudflare?.env?.WALKING_CACHE_ADMIN_TOKEN ?? process.env.WALKING_CACHE_ADMIN_TOKEN;
  const authorized = local || Boolean(secret && getHeader(event, "authorization") === `Bearer ${secret}`);
  const body = await readBody(event);
  const store = stationWalkStore(event);
  if (body?.action === "status") return { available: Boolean(store), authorized, tokenConfigured: Boolean(secret) };
  if (!authorized) throw createError({ statusCode: 403 });
  if (body?.action !== "reset" || getHeader(event, "x-station-walk-action") !== "reset") throw createError({ statusCode: 400 });
  if (!store) throw createError({ statusCode: 503 });
  await resetStationWalkCache(store);
  return { available: true, authorized: true };
});
