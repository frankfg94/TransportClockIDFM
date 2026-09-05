import { defineEventHandler, getQuery, setHeader } from "h3";
import { getTrafficCacheStatus } from "../../services/idfm/traffic";
import { resolveTrafficLocale } from "../../../src/features/traffic/trafficLocale";

export default defineEventHandler(async (event) => {
  const locale = resolveTrafficLocale(getQuery(event).locale);
  const response = await getTrafficCacheStatus(
    event,
    locale,
  );
  setHeader(event, "Cache-Control", "private, no-store");
  setHeader(event, "X-Traffic-Cache-State", response.cache.state);
  setHeader(event, "X-Traffic-Request", "status");
  setHeader(event, "X-Traffic-Locale", locale);
  return response;
});
