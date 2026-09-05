import { defineEventHandler, getQuery, setHeader } from "h3";
import { refreshTrafficSnapshot } from "../../services/idfm/traffic";
import { setTrafficDiagnostics } from "../traffic.get";
import { resolveTrafficLocale } from "../../../src/features/traffic/trafficLocale";

export default defineEventHandler(async (event) => {
  const locale = resolveTrafficLocale(getQuery(event).locale);
  const result = await refreshTrafficSnapshot(event, locale);
  setTrafficDiagnostics(event, result.response, "global", locale);
  setHeader(event, "X-Traffic-Refresh", "manual");
  return result.response;
});
